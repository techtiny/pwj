import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, TrendingUp, ClipboardList, ChevronLeft, Search, CalendarClock, FolderKanban, GanttChartSquare } from "lucide-react";
import {
  getEligibleForAccountsProjects,
  uploadDocument, saveProjectBoq, saveAdditionalItems, fetchStoredFile,
  saveProjectType, PROJECT_TYPES,
} from "./operationsApi";
import ProjectPlanning, { PlanningDashboard, ScheduleChart } from "./ProjectPlanning";


// Mobile layout for the whole Operations module (landing, project tabs, BOQ, planning, dashboard).
// Desktop is untouched; below 768px tables scroll sideways inside their card and grids stack.
export const OPS_MOBILE_CSS = `
@media (max-width: 768px) {
  .ops-shell { padding: 14px 10px !important; }
  .ops-title { font-size: 19px !important; }
  .ops-tabs button { padding: 10px 12px !important; font-size: 13.5px !important; }
  .ops-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  .ops-card-table th, .ops-card-table td { padding: 8px 8px !important; font-size: 12.5px !important; }
  .ops-boq-table th { font-size: 13px !important; padding: 7px 8px !important; }
  .ops-boq-table td { font-size: 13px !important; }
  .ops-boq-table { min-width: 560px; }
  .ops-add-row > * { flex: 1 1 100% !important; width: 100% !important; min-width: 0 !important; box-sizing: border-box; }
  .ops-add-row > button { width: 100% !important; }
  .ops-bar { gap: 8px !important; }
  .ops-bar > * { max-width: 100%; }
  .ops-hide-sm { display: none !important; }
  .pp-header-grid { grid-template-columns: 1fr 1fr !important; gap: 10px 12px !important; }
  .pp-toolbar { gap: 8px !important; }
  .pp-toolbar > .pp-spacer { margin-left: 0 !important; width: 100%; justify-content: space-between; }
  .pp-toolbar input, .pp-toolbar select { max-width: 100% !important; }
  .pp-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  .pp-hero { grid-template-columns: 1fr !important; gap: 18px !important; padding: 16px !important; }
  .pp-hero-num { font-size: 44px !important; }
  .pp-stats { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
  .pp-modal { max-height: 92vh !important; }
  .pp-chips { overflow-x: auto; flex-wrap: nowrap !important; padding-bottom: 4px; }
  .pp-chips > * { flex: none; }
}
@media (max-width: 420px) {
  .pp-header-grid { grid-template-columns: 1fr !important; }
  .pp-stats { grid-template-columns: 1fr !important; }
}
`;

const HEADER_HINTS = ["description", "qty", "quantity", "unit", "rate", "amount", "sl", "s.no", "particular", "item"];

// Manually-entered, BOQ-independent item categories shown below the BOQ
// table — each is its own table (S.No / Description / Qty / Unit),
// standalone (no link to any BOQ item required), but still selectable into
// the same PR as BOQ line items. NMR and Transport each have their own
// distinct column set and their own table component (NMRCategoryTable /
// TransportCategoryTable, rendered separately) — they're intentionally left
// out of this generic list. "Additional Items" is a different table
// entirely (AdditionalItemsTable, rendered separately) — unlike everything
// here, it *requires* linking each row to an existing BOQ item.
const ADDITIONAL_CATEGORIES = [
  { key: "NT",            label: "NT Category" },
  { key: "Establishment", label: "Establishment Category" },
];

const NMR_LABOUR_TYPES = ["Painters", "Plumber", "Electrician", "Mason", "MC", "FC", "Carpenter", "Tile/Granite", "Others"];

function isBlankRow(row) {
  return !row || row.every(c => c === null || c === undefined || String(c).trim() === "");
}

// Picks the one sheet to show automatically, so the user isn't asked to pick
// from every sheet in the workbook (summary/blank sheets included). Prefers
// the first sheet whose name looks like a real line-item category sheet
// ("Annexure-..." in the sample BOQs seen so far); falls back to the first
// sheet in the workbook if nothing matches.
function pickDefaultSheet(sheetNames) {
  const annexure = sheetNames.find(n => /annexure/i.test(n));
  return annexure || sheetNames[0];
}

// Best-effort: a row within the first few rows of a sheet that looks like a
// header (contains several recognizable BOQ column words). Real BOQs don't
// have a fixed header position across sheets, so this is cosmetic only — it
// just labels the review table's columns nicely when it can.
function detectHeaderRow(rows) {
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const row = rows[r] || [];
    const hits = row.filter(c => typeof c === "string" && HEADER_HINTS.some(h => c.toLowerCase().includes(h))).length;
    if (hits >= 2) return r;
  }
  return -1;
}

function rowLabel(row) {
  const v = row?.[0];
  return (v === null || v === undefined || String(v).trim() === "") ? "" : String(v).trim();
}

// Best-effort: the longest text cell in a row is treated as its description.
function rowDescription(row) {
  let best = "";
  for (const c of row || []) {
    const s = c === null || c === undefined ? "" : String(c);
    if (s.length > best.length) best = s;
  }
  return best.trim();
}

// Best-effort: use the detected header row's column labels to find qty/unit
// cells by position; falls back to scanning for a bare number / short word.
function rowQtyUnit(row, headerRow) {
  let qty = null, unit = "";
  if (headerRow) {
    for (let i = 0; i < row.length; i++) {
      const label = String(headerRow[i] || "").toLowerCase();
      if (!label) continue;
      if (label.includes("qty") || label.includes("quantity")) {
        const n = parseFloat(row[i]);
        if (!isNaN(n)) qty = n;
      } else if (label.includes("unit")) {
        const v = row[i];
        if (v !== null && v !== undefined && String(v).trim()) unit = String(v).trim();
      }
    }
  }
  return { qty, unit };
}

// Groups raw spreadsheet rows into one selectable PR line item each. BOQs
// put a sub-item's own label (a bare number like "1", or a lettered/roman
// sub-marker like "a"/"i") on one row and its actual description/qty/unit on
// the row(s) right below it (blank label = continuation of the item above).
// Without this, the label row and its data row show up as two separate
// selectable rows sharing the same visible number — this merges them into
// one. Each group also gets the same "4a"/"4b"-style renumbering applied
// uniformly to letters and roman numerals alike.
function groupRows(rows, headerRowIdx) {
  const headerRow = headerRowIdx >= 0 ? rows[headerRowIdx] : null;
  const groups = [];
  let current = null;
  let currentParent = "";
  let currentSubLabel = "";
  let subCounter = 0;

  rows.forEach((row, i) => {
    // Rows above the detected header row are sheet/client title lines, not
    // line items — e.g. "CLIENT : ...", "CIVIL AND INTERIOR" sitting above
    // the SL.NO/DESCRIPTION/UNIT/QTY header. Skip them here; they're shown
    // separately as a caption above the table instead.
    if (headerRowIdx >= 0 && i <= headerRowIdx) return;
    const raw = rowLabel(row);
    if (raw !== "") {
      let qualified;
      // A bare number only starts a NEW top-level section if it continues
      // the section count upward (e.g. "35" after "34"). Some BOQs number
      // sub-items with plain digits too, restarting at 1 under each section
      // (e.g. "34 MODULAR FURNITURES" → "1 Conf.room table", "2 ...", ...) —
      // those read as smaller-or-equal to the current parent, so they're
      // treated the same as lettered/roman sub-items, not as new sections.
      const isNewSection = /^\d+$/.test(raw) && (currentParent === "" || Number(raw) > Number(currentParent));
      if (isNewSection) {
        currentParent = raw;
        currentSubLabel = "";
        subCounter = 0;
        qualified = raw;
      } else if (/^\d+$/.test(raw) || /^[a-zA-Z]+$/.test(raw)) {
        subCounter += 1;
        currentSubLabel = currentParent + String.fromCharCode(96 + subCounter);
        qualified = currentSubLabel;
      } else {
        qualified = raw;
      }
      current = { label: qualified, rowIndexes: [i] };
      groups.push(current);
    } else {
      if (!current) {
        current = { label: currentSubLabel || currentParent, rowIndexes: [] };
        groups.push(current);
      }
      current.rowIndexes.push(i);
    }
  });

  return groups.map(g => {
    const texts = [];
    let qty = null, unit = "";
    g.rowIndexes.forEach(idx => {
      const row = rows[idx];
      const desc = rowDescription(row);
      if (desc) texts.push(desc);
      const ru = rowQtyUnit(row, headerRow);
      if (ru.qty != null) qty = ru.qty;
      if (ru.unit) unit = ru.unit;
    });
    return { ...g, description: texts.join("\n"), qty, unit };
  });
}

// One BOQ line item as a PWJ document row: the first line of its description is the
// item title, the remaining lines are its specification.
export function boqGroupToItem(g) {
  const lines = String(g.description || "").split("\n").map(x => x.trim()).filter(Boolean);
  return { label: g.label, item: (lines[0] || "").slice(0, 280), spec: lines.slice(1).join("\n"), unit: g.unit || "", qty: g.qty };
}

export function boqSpecLine(g) {
  const qtyUnitStr = (g.qty != null || g.unit) ? ` — ${g.qty != null ? g.qty : ""}${g.unit ? " " + g.unit : ""}`.trim() : "";
  return `${g.label ? g.label + ". " : ""}${g.description}${qtyUnitStr ? " " + qtyUnitStr : ""}`.trim();
}

// Fetches a project's stored BOQ and returns its selectable line items (same grouping as
// the BOQ tab), so other screens can look an item up by its code (e.g. "4A").
export async function loadBoqGroups(boqDocUrl) {
  const data = await fetchStoredFile(boqDocUrl);
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[pickDefaultSheet(wb.SheetNames)];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }).filter(r => !isBlankRow(r));
  return groupRows(raw, detectHeaderRow(raw));
}

export default function OperationsSection({ user, onCreateFromBOQ }) {
  const [dashFrom, setDashFrom] = useState("");
  const [dashTo, setDashTo] = useState("");
  const dashInp = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 9px", fontSize: 13, fontFamily: "inherit", background: "#fff" };
  const [scheduleRev, setScheduleRev] = useState(""); // revision being viewed in Project Planning / Schedule Chart ("" = current)
  const [tab, setTab] = useState("dashboard"); // "dashboard" | "boq" | "planning"

  // ── Project picker ──
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    getEligibleForAccountsProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }, []);

  // Assign / change a project's Operations category straight from the list.
  // Optimistic: the row moves immediately and moves back if the save fails.
  const [typeError, setTypeError] = useState("");
  const assignProjectType = async (project, projectType) => {
    const previous = project.projectType || null;
    const next = projectType || null;
    setTypeError("");
    setProjects(ps => ps.map(p => p.id === project.id ? { ...p, projectType: next } : p));
    try {
      await saveProjectType(project.id, next);
    } catch {
      setProjects(ps => ps.map(p => p.id === project.id ? { ...p, projectType: previous } : p));
      setTypeError(`Couldn't update the type for "${project.name}". Please try again.`);
    }
  };

  const [planningDirty, setPlanningDirty] = useState(false);
  const openProject = (project) => { setScheduleRev(""); setTab("dashboard"); setPlanningDirty(false); setSelectedProject(project); };
  const closeProject = () => {
    if (planningDirty && !window.confirm("The project schedule has unsaved changes. Leave without saving?")) return;
    setPlanningDirty(false); setSelectedProject(null); resetBOQ(); setScheduleRev(""); setTab("dashboard");
  };

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.location || "").toLowerCase().includes(q) ||
      (p.clientName || "").toLowerCase().includes(q));
  }, [projects, projectSearch]);

  // ── BOQ upload / parse (entirely client-side) ──
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [rows, setRows] = useState([]);
  const [headerRowIdx, setHeaderRowIdx] = useState(-1);
  const [checked, setChecked] = useState({});
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [loadingStoredBoq, setLoadingStoredBoq] = useState(false);
  const [saveStatus, setSaveStatus] = useState(""); // "", "saving", "saved", "error"
  const [showUploadOverride, setShowUploadOverride] = useState(false);

  // ── Additional item categories (NT, NMR, Transport, Establishment) —
  // manually entered, independent of the BOQ file, selectable into the same
  // PR as BOQ line items. All categories share one flat persisted array
  // (each item tagged with its own `category`), so selection/PR-creation
  // naturally spans all of them together.
  const [additionalChecked, setAdditionalChecked] = useState({}); // id -> bool
  const [newItemForms, setNewItemForms] = useState(() =>
    Object.fromEntries(ADDITIONAL_CATEGORIES.map(c => [c.key, { description: "", qty: "", unit: "", remarks: "" }]))
  );
  const [newNmrItem, setNewNmrItem] = useState({ description: "", noOfLabours: "", typeOfLabours: "", date: "", unitRate: "" });
  const [newTransportItem, setNewTransportItem] = useState({ description: "", transport: "", amount: "", remarks: "" });
  // "Additional Items" — unlike every category above, each row here *must*
  // be linked to an existing BOQ line item (can't be created standalone).
  const [newAdditionalItem, setNewAdditionalItem] = useState({ linkedBoqLabel: "", description: "", qty: "", unit: "", remarks: "" });
  const additionalIdCounter = useRef(0);

  const resetBOQ = () => {
    setWorkbook(null); setSheetNames([]); setActiveSheet(""); setRows([]);
    setHeaderRowIdx(-1); setChecked({}); setFileName("");
    setParseError(""); setSaveStatus(""); setShowUploadOverride(false);
    setAdditionalChecked({});
    setNewItemForms(Object.fromEntries(ADDITIONAL_CATEGORIES.map(c => [c.key, { description: "", qty: "", unit: "", remarks: "" }])));
    setNewNmrItem({ description: "", noOfLabours: "", typeOfLabours: "", date: "", unitRate: "" });
    setNewTransportItem({ description: "", transport: "", amount: "", remarks: "" });
    setNewAdditionalItem({ linkedBoqLabel: "", description: "", qty: "", unit: "", remarks: "" });
  };

  const loadWorkbookFromBuffer = (data, name) => {
    const wb = XLSX.read(data, { type: "array" });
    if (!wb.SheetNames.length) throw new Error("empty workbook");
    setWorkbook(wb);
    setSheetNames(wb.SheetNames);
    setActiveSheet(pickDefaultSheet(wb.SheetNames));
    setFileName(name);
    setChecked({});
  };

  // A project already has a BOQ on file — fetch and parse it automatically,
  // no re-upload needed.
  useEffect(() => {
    if (!selectedProject?.boqDocUrl) return;
    setLoadingStoredBoq(true);
    setParseError("");
    fetchStoredFile(selectedProject.boqDocUrl)
      .then(data => loadWorkbookFromBuffer(data, selectedProject.boqFileName || "BOQ.xlsx"))
      .catch(() => setParseError("Could not load the previously uploaded BOQ — try uploading it again."))
      .finally(() => setLoadingStoredBoq(false));
  }, [selectedProject?.id]);

  const handleFile = (file) => {
    if (!file) return;
    setParseError("");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        loadWorkbookFromBuffer(data, file.name);
        setShowUploadOverride(false);
      } catch {
        setParseError("Could not read this file — please upload a valid Excel (.xlsx/.xls) file.");
        return;
      }
      // Persist in the background so this project's BOQ doesn't need
      // re-uploading next time — doesn't block the review table from showing.
      setSaveStatus("saving");
      try {
        const url = await uploadDocument(file);
        await saveProjectBoq(selectedProject.id, url, file.name);
        setSelectedProject(p => ({ ...p, boqDocUrl: url, boqFileName: file.name }));
        setProjects(ps => ps.map(p => p.id === selectedProject.id ? { ...p, boqDocUrl: url, boqFileName: file.name } : p));
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    if (!workbook || !activeSheet) { setRows([]); setHeaderRowIdx(-1); return; }
    const ws = workbook.Sheets[activeSheet];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" })
      .filter(r => !isBlankRow(r));
    setRows(raw);
    setHeaderRowIdx(detectHeaderRow(raw));
    setChecked({});
  }, [workbook, activeSheet]);

  // One entry per selectable BOQ line item — a label row merged with its
  // continuation/data row(s), so "1 GYPSUM PARTITION" and its description+qty
  // row become a single item instead of two separately-checkable rows.
  const groups = useMemo(() => groupRows(rows, headerRowIdx), [rows, headerRowIdx]);

  // BOQ line items can be reused across any number of PRs — a line item
  // being already part of one PR doesn't lock it from being selected into
  // another one, so there's no "used" tracking here anymore.

  // Checking a top-level section (label "2") also checks/unchecks its own
  // sub-items ("2a", "2b", ...) so you don't have to tick each one by hand.
  const toggleRow = (idx) => {
    setChecked(c => {
      const nextVal = !c[idx];
      const next = { ...c, [idx]: nextVal };
      const label = groups[idx]?.label;
      if (label && /^\d+$/.test(label)) {
        const childRe = new RegExp(`^${label}[a-z]$`);
        groups.forEach((g, i) => {
          if (i !== idx && childRe.test(g.label)) next[i] = nextVal;
        });
      }
      return next;
    });
  };
  const toggleAll = (checkAll) => {
    const next = {};
    groups.forEach((_, i) => { next[i] = checkAll; });
    setChecked(next);
  };

  const selectedIndexes = useMemo(
    () => Object.keys(checked).filter(k => checked[k]).map(Number).sort((a, b) => a - b),
    [checked]
  );

  // Manually-entered items not present in the uploaded BOQ, across all
  // additional categories (NT, NMR, Transport, Establishment) — persisted on
  // the project as one flat array (each item tagged with its own `category`),
  // independent of any sheet, selectable into the same PR as BOQ line items.
  const additionalItems = useMemo(() => {
    try {
      const parsed = JSON.parse(selectedProject?.boqAdditionalItems || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [selectedProject?.boqAdditionalItems]);

  const additionalItemsByCategory = useMemo(() => {
    const byCat = Object.fromEntries(ADDITIONAL_CATEGORIES.map(c => [c.key, []]));
    additionalItems.forEach(it => { (byCat[it.category] ||= []).push(it); });
    return byCat;
  }, [additionalItems]);

  // Units already seen in this project — the current BOQ sheet's line items
  // plus every additional-category item entered so far — so the Unit field
  // can be picked from what's already in use instead of retyped each time.
  const knownUnits = useMemo(() => {
    const units = new Set();
    groups.forEach(g => { if (g.unit) units.add(String(g.unit).trim()); });
    additionalItems.forEach(it => { if (it.unit) units.add(String(it.unit).trim()); });
    return [...units].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [groups, additionalItems]);

  const selectedAdditional = useMemo(
    () => additionalItems.filter(it => additionalChecked[it.id]),
    [additionalItems, additionalChecked]
  );

  const persistAdditionalItems = (updated) => {
    const json = JSON.stringify(updated);
    setSelectedProject(p => ({ ...p, boqAdditionalItems: json }));
    setProjects(ps => ps.map(p => p.id === selectedProject.id ? { ...p, boqAdditionalItems: json } : p));
    saveAdditionalItems(selectedProject.id, updated).catch(() => {
      // Best-effort — the in-memory state above still reflects the change
      // for the rest of this session even if the save itself failed.
    });
  };

  const addAdditionalItem = (category) => {
    const form = newItemForms[category] || { description: "", qty: "", unit: "", remarks: "" };
    const description = form.description.trim();
    if (!description) return;
    const item = {
      id: `${category}-${Date.now()}-${additionalIdCounter.current++}`,
      category,
      description,
      qty: form.qty.trim(),
      unit: form.unit.trim(),
      remarks: (form.remarks || "").trim(),
    };
    persistAdditionalItems([...additionalItems, item]);
    setNewItemForms(f => ({ ...f, [category]: { description: "", qty: "", unit: "", remarks: "" } }));
  };

  // Inline edit of a saved row's Remarks (free text, saved on blur).
  const updateAdditionalItem = (id, patch) => {
    persistAdditionalItems(additionalItems.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const removeAdditionalItem = (id) => {
    persistAdditionalItems(additionalItems.filter(it => it.id !== id));
    setAdditionalChecked(c => { const next = { ...c }; delete next[id]; return next; });
  };

  // NMR ("Nominal Muster Roll") — daily labour entries, a different shape
  // from the other additional categories (labour count/type/date/rate
  // instead of qty/unit), but stored in the same flat array (category:
  // "NMR") so it shares the same selection/PR-creation flow.
  const addNmrItem = () => {
    const description = newNmrItem.description.trim();
    if (!description) return;
    const noOfLabours = Number(newNmrItem.noOfLabours) || 0;
    const unitRate = Number(newNmrItem.unitRate) || 0;
    const item = {
      id: `NMR-${Date.now()}-${additionalIdCounter.current++}`,
      category: "NMR",
      description,
      noOfLabours: newNmrItem.noOfLabours.trim(),
      typeOfLabours: newNmrItem.typeOfLabours,
      date: newNmrItem.date,
      unitRate: newNmrItem.unitRate.trim(),
      amount: String(Math.round(noOfLabours * unitRate * 100) / 100),
    };
    persistAdditionalItems([...additionalItems, item]);
    setNewNmrItem({ description: "", noOfLabours: "", typeOfLabours: "", date: "", unitRate: "" });
  };

  // Transport Category — its own column set (Transport detail + Amount)
  // instead of the generic qty/unit shape, same flat-array storage as NMR.
  const addTransportItem = () => {
    const description = newTransportItem.description.trim();
    if (!description) return;
    const item = {
      id: `Transport-${Date.now()}-${additionalIdCounter.current++}`,
      category: "Transport",
      description,
      transport: newTransportItem.transport.trim(),
      amount: newTransportItem.amount.trim(),
      remarks: (newTransportItem.remarks || "").trim(),
    };
    persistAdditionalItems([...additionalItems, item]);
    setNewTransportItem({ description: "", transport: "", amount: "", remarks: "" });
  };

  // "Additional Items" — each row must reference an existing BOQ line item
  // (by its qualified label, e.g. "8c"); the row is refused without one.
  const addLinkedAdditionalItem = () => {
    const description = newAdditionalItem.description.trim();
    const linkedBoqLabel = newAdditionalItem.linkedBoqLabel;
    if (!description || !linkedBoqLabel) return;
    const item = {
      id: `AdditionalItems-${Date.now()}-${additionalIdCounter.current++}`,
      category: "AdditionalItems",
      linkedBoqLabel,
      description,
      qty: newAdditionalItem.qty.trim(),
      unit: newAdditionalItem.unit.trim(),
      remarks: (newAdditionalItem.remarks || "").trim(),
    };
    persistAdditionalItems([...additionalItems, item]);
    setNewAdditionalItem({ linkedBoqLabel: "", description: "", qty: "", unit: "", remarks: "" });
  };

  const toggleAdditionalChecked = (id) => {
    setAdditionalChecked(c => ({ ...c, [id]: !c[id] }));
  };

  const toggleAllAdditional = (category, checkAll) => {
    setAdditionalChecked(c => {
      const next = { ...c };
      (additionalItemsByCategory[category] || []).forEach(it => { next[it.id] = checkAll; });
      return next;
    });
  };

  const buildPrefill = () => {
    const selected = selectedIndexes.map(i => groups[i]);

    const boqNo = selected.map(g => g.label).filter(Boolean).join(", ");

    const boqLines = selected.map(boqSpecLine).filter(Boolean);
    const categoryCounters = {};
    const withRemarks = (line, it) => it.remarks ? `${line} [Remarks: ${it.remarks}]` : line;
    const additionalLines = selectedAdditional.map(it => withRemarks((() => {
      const n = (categoryCounters[it.category] = (categoryCounters[it.category] || 0) + 1);
      if (it.category === "NMR") {
        const bits = [
          it.noOfLabours ? `${it.noOfLabours} labour(s)` : "",
          it.typeOfLabours || "",
          it.date || "",
          it.unitRate ? `rate ₹${it.unitRate}` : "",
          it.amount ? `amount ₹${it.amount}` : "",
        ].filter(Boolean).join(", ");
        return `NMR${n}. ${it.description}${bits ? ` — ${bits}` : ""}`.trim();
      }
      if (it.category === "Transport") {
        const bits = [it.transport || "", it.amount ? `amount ₹${it.amount}` : ""].filter(Boolean).join(", ");
        return `Transport${n}. ${it.description}${bits ? ` — ${bits}` : ""}`.trim();
      }
      if (it.category === "AdditionalItems") {
        const qtyUnitStr = (it.qty || it.unit) ? ` — ${it.qty || ""}${it.unit ? " " + it.unit : ""}`.trim() : "";
        return `Additional${n} (linked to BOQ ${it.linkedBoqLabel}). ${it.description}${qtyUnitStr ? " " + qtyUnitStr : ""}`.trim();
      }
      const qtyUnitStr = (it.qty || it.unit) ? ` — ${it.qty || ""}${it.unit ? " " + it.unit : ""}`.trim() : "";
      return `${it.category}${n}. ${it.description}${qtyUnitStr ? " " + qtyUnitStr : ""}`.trim();
    })(), it));
    const combinedSpecification = [...boqLines, ...additionalLines].join("\n");

    // Short single-line summary for Material Required — the first selected
    // item's description (BOQ first, then additional), plus a "+N more"
    // suffix when several items were selected across both tables.
    const allSelected = [
      ...selected,
      ...selectedAdditional.map(it => ({
        description: it.description,
        qty: it.category === "NMR" ? (it.noOfLabours ? Number(it.noOfLabours) : null) : (it.qty ? Number(it.qty) : null),
        unit: it.category === "NMR" ? (it.typeOfLabours || "") : it.unit,
      })),
    ];
    const firstDesc = allSelected[0]?.description || "";
    const materialRequired = (allSelected.length > 1
      ? `${firstDesc} (+${allSelected.length - 1} more)`
      : firstDesc).slice(0, 280);

    // If every selected item (BOQ + additional) shares one exact unit, sum the quantities.
    const distinctUnits = [...new Set(allSelected.map(g => g.unit).filter(Boolean))];
    let unit = "", quantity = "";
    if (distinctUnits.length === 1 && allSelected.every(g => g.qty != null)) {
      unit = distinctUnits[0];
      quantity = String(allSelected.reduce((s, g) => s + g.qty, 0));
    }

    // Structured per-item rows so the PWJ gets one row per selected item (not one lumped row).
    const boqItems = [
      ...selected.map(boqGroupToItem),
      ...selectedAdditional.map((it, i) => ({
        item: it.description,
        spec: additionalLines[i].slice(additionalLines[i].indexOf(it.description) + it.description.length).replace(/^\s*—\s*/, ""),
        unit: it.category === "NMR" ? (it.typeOfLabours || "") : (it.unit || ""),
        qty: it.category === "NMR" ? (it.noOfLabours ? Number(it.noOfLabours) : null) : (it.qty ? Number(it.qty) : null),
      })),
    ];

    return {
      docData: JSON.stringify({ boqItems, boqSpec: combinedSpecification }),
      projectName: selectedProject?.name || "",
      boqNo,
      materialRequired,
      specification: combinedSpecification,
      unit,
      quantity,
    };
  };

  const handleCreatePR = () => {
    if (!selectedIndexes.length && !selectedAdditional.length) return;
    const prefill = buildPrefill();
    onCreateFromBOQ(prefill);

    // BOQ entries and additional-category items can be reused across any
    // number of PRs, so nothing is marked "used" here — just clear the
    // current selection so the next PR starts from a blank slate.
    setChecked({});
    setAdditionalChecked({});
  };

  const shellStyle = { minHeight: "calc(100vh - 108px)", background: "#f1f5f9", padding: "24px 16px" };

  // ── Landing view: every project, grouped into one column per type ──
  if (!selectedProject) {
    return (
      <div className="ops-shell" style={shellStyle}><style>{OPS_MOBILE_CSS}</style>
        <ProjectsByType
          projects={filteredProjects}
          totalCount={projects.length}
          loading={projectsLoading}
          search={projectSearch}
          setSearch={setProjectSearch}
          onOpen={openProject}
          onAssignType={assignProjectType}
          error={typeError}
        />
      </div>
    );
  }

  // ── Project view: BOQ / Project Planning / Dashboard ──
  return (
    <div className="ops-shell" style={shellStyle}><style>{OPS_MOBILE_CSS}</style>
      <button onClick={closeProject} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "#0d9488", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", marginBottom: 10, padding: 0 }}>
        <ChevronLeft size={15} /> All projects
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span className="ops-title" style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{selectedProject.name}</span>
        <TypeBadge type={selectedProject.projectType} />
        <span style={{ fontSize: 13.5, color: "#374151" }}>
          {[selectedProject.location, selectedProject.clientName].filter(Boolean).join(" · ") || "—"}
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="ops-tabs" style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 20, overflowX: "auto" }}>
        {[
          { key: "dashboard", label: "Dashboard", icon: TrendingUp },
          { key: "boq", label: "BOQ", icon: ClipboardList },
          { key: "planning", label: "Project Planning", icon: CalendarClock },
          { key: "chart", label: "Schedule Chart", icon: GanttChartSquare },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer",
                fontFamily: "inherit", padding: "10px 18px", fontSize: 14.5, fontWeight: active ? 700 : 600, whiteSpace: "nowrap",
                color: active ? "#0d9488" : "#374151",
                borderBottom: active ? "2.5px solid #0d9488" : "2.5px solid transparent", marginBottom: -1,
              }}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "boq" && (
        <BOQWorkspace
          fileName={fileName}
          parseError={parseError}
          onFile={handleFile}
          loadingStoredBoq={loadingStoredBoq}
          saveStatus={saveStatus}
          showUploadOverride={showUploadOverride}
          onReplace={() => setShowUploadOverride(true)}
          activeSheet={activeSheet}
          groups={groups}
          checked={checked}
          toggleRow={toggleRow}
          toggleAll={toggleAll}
          selectedCount={selectedIndexes.length + selectedAdditional.length}
          onCreatePR={handleCreatePR}
          additionalItemsByCategory={additionalItemsByCategory}
          knownUnits={knownUnits}
          additionalChecked={additionalChecked}
          toggleAdditionalChecked={toggleAdditionalChecked}
          toggleAllAdditional={toggleAllAdditional}
          newItemForms={newItemForms}
          setNewItemForms={setNewItemForms}
          addAdditionalItem={addAdditionalItem}
          removeAdditionalItem={removeAdditionalItem}
          updateAdditionalItem={updateAdditionalItem}
          newNmrItem={newNmrItem}
          setNewNmrItem={setNewNmrItem}
          addNmrItem={addNmrItem}
          newTransportItem={newTransportItem}
          setNewTransportItem={setNewTransportItem}
          addTransportItem={addTransportItem}
          newAdditionalItem={newAdditionalItem}
          setNewAdditionalItem={setNewAdditionalItem}
          addLinkedAdditionalItem={addLinkedAdditionalItem}
        />
      )}

      {/* Kept mounted while other tabs are open so unsaved schedule edits survive a tab switch. */}
      <div style={{ display: tab === "planning" ? "block" : "none" }}>
        <ProjectPlanning
          key={selectedProject.id}
          project={selectedProject}
          user={user}
          boqItems={groups}
          boqLoading={loadingStoredBoq}
          hasBoq={!!fileName}
          onGoToBoq={() => setTab("boq")}
          onDirtyChange={setPlanningDirty}
          viewRev={scheduleRev}
          setViewRev={setScheduleRev}
        />
      </div>

      {tab === "chart" && <ScheduleChart key={`chart-${selectedProject.id}`} project={selectedProject} user={user} viewRev={scheduleRev} setViewRev={setScheduleRev} />}

      {tab === "dashboard" && (
        <>
          <div className="ops-bar" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff", border: "1px solid #e8edf3", borderRadius: 12, padding: "10px 14px", marginBottom: 18 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Date range</span>
            <input type="date" value={dashFrom} max={dashTo || undefined} onChange={e => setDashFrom(e.target.value)} style={dashInp} aria-label="From date" />
            <span style={{ color: "#94a3b8", fontSize: 13 }}>to</span>
            <input type="date" value={dashTo} min={dashFrom || undefined} onChange={e => setDashTo(e.target.value)} style={dashInp} aria-label="To date" />
            {(dashFrom || dashTo) && (
              <button onClick={() => { setDashFrom(""); setDashTo(""); }} style={{ border: "none", background: "none", color: "#0d9488", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
            )}
            <span className="ops-hide-sm" style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>Filters by planned finish</span>
          </div>
          <PlanningDashboard key={`pd-${selectedProject.id}`} project={selectedProject} from={dashFrom} to={dashTo} />
        </>
      )}
    </div>
  );
}

const TYPE_COLORS = {
  Commercial:   { bg: "#eff6ff", fg: "#1d4ed8" },
  X:            { bg: "#f5f3ff", fg: "#6d28d9" },
  Construction: { bg: "#fff7ed", fg: "#c2410c" },
  Renovation:   { bg: "#ecfdf5", fg: "#047857" },
};

function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || { bg: "#f1f5f9", fg: "#475569" };
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: c.bg, color: c.fg }}>
      {type || "Type not set"}
    </span>
  );
}

const cellSt = { padding: "9px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 13.5, color: "#0f172a", textAlign: "left" };
const headSt = { ...cellSt, fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.3, background: "#f8fafc", borderBottom: "1px solid #e2e8f0" };

// One card per project type, laid out like the "Projects - Operations" sheet:
// Sl No / Project Name / Project Location. Projects with no (or an unknown)
// type are listed separately with a picker so they can be categorised.
function ProjectsByType({ projects, totalCount, loading, search, setSearch, onOpen, onAssignType, error }) {
  const grouped = useMemo(() => {
    const m = Object.fromEntries(PROJECT_TYPES.map(t => [t, []]));
    const unassigned = [];
    projects.forEach(p => (m[p.projectType] ? m[p.projectType].push(p) : unassigned.push(p)));
    return { byType: m, unassigned };
  }, [projects]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
            <FolderKanban size={20} color="#0d9488" /> Projects — Operations
          </div>
          <div style={{ fontSize: 13.5, color: "#374151", marginTop: 4 }}>
            Running projects with Accounts active, grouped by type. Open a project for its BOQ, planning and dashboard.
          </div>
        </div>
        <div style={{ position: "relative", width: 300, maxWidth: "100%" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#94a3b8" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff" }} />
        </div>
      </div>

      {error && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13.5, marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div style={{ color: "#374151", fontSize: 14 }}>Loading projects…</div>
      ) : totalCount === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 32, textAlign: "center", color: "#374151", fontSize: 14 }}>
          No running projects with Accounts active were found.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 16 }}>
            {PROJECT_TYPES.map(type => (
              <TypeCard key={type} type={type} projects={grouped.byType[type]} onOpen={onOpen} />
            ))}
          </div>

          {grouped.unassigned.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginTop: 20, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Type not set</span>
                <span style={{ fontSize: 12.5, color: "#64748b" }}>{grouped.unassigned.length} project{grouped.unassigned.length === 1 ? "" : "s"} · choose a type to move it into its column</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="ops-card-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...headSt, width: 60 }}>Sl No</th>
                      <th style={headSt}>Project Name</th>
                      <th style={headSt}>Project Location</th>
                      <th style={{ ...headSt, width: 180 }}>Project Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.unassigned.map((p, i) => (
                      <tr key={p.id}>
                        <td style={cellSt}>{i + 1}</td>
                        <td style={cellSt}>
                          <button onClick={() => onOpen(p)} style={{ border: "none", background: "none", padding: 0, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "#0d9488", cursor: "pointer", textAlign: "left" }}>
                            {p.name}
                          </button>
                        </td>
                        <td style={cellSt}>{p.location || "—"}</td>
                        <td style={cellSt}>
                          <select value="" onChange={e => e.target.value && onAssignType(p, e.target.value)}
                            style={{ width: "100%", padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
                            <option value="">Select type…</option>
                            {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TypeCard({ type, projects, onOpen }) {
  const c = TYPE_COLORS[type] || { bg: "#f1f5f9", fg: "#475569" };
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", background: c.bg, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: c.fg }}>{type}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: c.fg }}>{projects.length}</span>
      </div>
      <div className="ops-scroll" style={{ overflowX: "auto" }}>
      <table className="ops-card-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...headSt, width: 60 }}>Sl No</th>
            <th style={headSt}>Project Name</th>
            <th style={headSt}>Project Location</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 ? (
            <tr><td colSpan={3} style={{ ...cellSt, color: "#94a3b8", textAlign: "center", padding: "18px 12px" }}>No projects</td></tr>
          ) : projects.map((p, i) => (
            <tr key={p.id} onClick={() => onOpen(p)} style={{ cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}>
              <td style={cellSt}>{i + 1}</td>
              <td style={{ ...cellSt, fontWeight: 600, color: "#0d9488" }}>{p.name}</td>
              <td style={cellSt}>{p.location || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function BOQWorkspace({
  fileName, parseError, onFile, loadingStoredBoq, saveStatus, showUploadOverride, onReplace,
  activeSheet,
  groups, checked, toggleRow, toggleAll, selectedCount, onCreatePR,
  additionalItemsByCategory, knownUnits, additionalChecked, toggleAdditionalChecked, toggleAllAdditional,
  newItemForms, setNewItemForms, addAdditionalItem, removeAdditionalItem, updateAdditionalItem,
  newNmrItem, setNewNmrItem, addNmrItem,
  newTransportItem, setNewTransportItem, addTransportItem,
  newAdditionalItem, setNewAdditionalItem, addLinkedAdditionalItem,
}) {
  const showUpload = (!fileName && !loadingStoredBoq) || showUploadOverride;
  const [activeAdditionalTab, setActiveAdditionalTab] = useState("AdditionalItems");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {!loadingStoredBoq && !showUpload && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>
              <FileSpreadsheet size={15} color="#0d9488" /> {fileName}
            </div>
            {activeSheet && (
              <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>
                Sheet: <span style={{ color: "#0d9488", fontWeight: 700 }}>{activeSheet}</span>
              </span>
            )}
            {saveStatus === "saving" && <span style={{ fontSize: 12.5, color: "#94a3b8" }}>Saving to project…</span>}
            {saveStatus === "saved" && <span style={{ fontSize: 12.5, color: "#15803d", fontWeight: 600 }}>✓ Saved — won't need re-uploading next time</span>}
            {saveStatus === "error" && <span style={{ fontSize: 12.5, color: "#ef4444" }}>Couldn't save — you'll need to re-upload next visit</span>}
            <button onClick={onReplace} style={{ fontSize: 13, color: "#0d9488", fontWeight: 600, cursor: "pointer", border: "none", background: "none", fontFamily: "inherit", padding: 0, marginLeft: "auto" }}>
              Replace BOQ
            </button>
          </>
        )}
      </div>

      {loadingStoredBoq ? (
        <div style={{ color: "#374151", fontSize: 14 }}>Loading this project's saved BOQ…</div>
      ) : showUpload ? (
        <>
        {parseError && <div style={{ color: "#ef4444", fontSize: 13.5, marginBottom: 10 }}>{parseError}</div>}
        <label style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
          border: "2px dashed #cbd5e1", borderRadius: 12, padding: "40px 20px", background: "#fff", cursor: "pointer", maxWidth: 480,
        }}>
          <Upload size={28} color="#0d9488" />
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14.5 }}>Upload BOQ (.xlsx / .xls)</div>
          <div style={{ fontSize: 12.5, color: "#374151" }}>Saved to this project once uploaded — you won't need to upload it again next time.</div>
          <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
            onChange={e => onFile(e.target.files?.[0])} />
        </label>
        </>
      ) : (
        <>
          {parseError && <div style={{ color: "#ef4444", fontSize: 13.5, marginBottom: 10 }}>{parseError}</div>}

          {groups.length === 0 ? (
            <div style={{ color: "#374151", fontSize: 14, marginBottom: 20 }}>This sheet has no line items.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 17, color: "#374151" }}>
                  {groups.length} item{groups.length !== 1 ? "s" : ""} · select the line items you want in this PR
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => toggleAll(true)} style={{ border: "none", background: "none", color: "#0d9488", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Select all</button>
                  <button onClick={() => toggleAll(false)} style={{ border: "none", background: "none", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
                </div>
              </div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", maxHeight: 460, marginBottom: 24 }}>
                <table className="ops-boq-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>PR Selection</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 60, fontSize: 17 }}>No.</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 260, fontSize: 17 }}>Description</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>Unit</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, i) => (
                      <tr key={i}>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                          <input type="checkbox" checked={!!checked[i]} onChange={() => toggleRow(i)} />
                        </td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#0d9488" }}>{g.label}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", maxWidth: 260, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{g.description}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{g.unit || "—"}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{g.qty != null ? g.qty : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Additional item categories, grouped into tabs below the BOQ
              table instead of stacked one after another. "Additional Items"
              requires linking each row to an existing BOQ line item; NT/NMR/
              Transport/Establishment are standalone. All stay selectable
              into the same PR regardless of which tab is active. */}
          {(() => {
            const tabs = [
              { key: "AdditionalItems", label: "Additional Items", count: (additionalItemsByCategory.AdditionalItems || []).length },
              { key: "NT",              label: "NT Category",             count: (additionalItemsByCategory.NT || []).length },
              { key: "NMR",             label: "NMR Category",            count: (additionalItemsByCategory.NMR || []).length },
              { key: "Transport",       label: "Transport Category",      count: (additionalItemsByCategory.Transport || []).length },
              { key: "Establishment",   label: "Establishment Category",  count: (additionalItemsByCategory.Establishment || []).length },
            ];
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", gap: 4, borderBottom: "1.5px solid #e2e8f0", marginBottom: 16, flexWrap: "wrap" }}>
                  {tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveAdditionalTab(t.key)}
                      style={{
                        border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                        padding: "10px 16px", fontSize: 14, fontWeight: 700,
                        color: activeAdditionalTab === t.key ? "#0d9488" : "#64748b",
                        borderBottom: activeAdditionalTab === t.key ? "2.5px solid #0d9488" : "2.5px solid transparent",
                        marginBottom: -1.5,
                      }}>
                      {t.label} <span style={{ color: "#94a3b8", fontWeight: 600 }}>· {t.count}</span>
                    </button>
                  ))}
                </div>

                {activeAdditionalTab === "AdditionalItems" && (
                  <AdditionalItemsTable
                    groups={groups}
                    knownUnits={knownUnits}
                    items={additionalItemsByCategory.AdditionalItems || []}
                    checked={additionalChecked}
                    toggleChecked={toggleAdditionalChecked}
                    toggleAll={toggleAllAdditional}
                    newItem={newAdditionalItem}
                    setNewItem={setNewAdditionalItem}
                    addItem={addLinkedAdditionalItem}
                    removeItem={removeAdditionalItem}
                    updateItem={updateAdditionalItem}
                  />
                )}

                {activeAdditionalTab === "NT" && (
                  <AdditionalCategoryTable
                    category="NT"
                    label="NT Category"
                    knownUnits={knownUnits}
                    items={additionalItemsByCategory.NT || []}
                    checked={additionalChecked}
                    toggleChecked={toggleAdditionalChecked}
                    toggleAll={toggleAllAdditional}
                    newItem={newItemForms.NT}
                    setNewItem={updater => setNewItemForms(f => ({ ...f, NT: updater(f.NT) }))}
                    addItem={addAdditionalItem}
                    removeItem={removeAdditionalItem}
                    updateItem={updateAdditionalItem}
                  />
                )}

                {activeAdditionalTab === "NMR" && (
                  <NMRCategoryTable
                    items={additionalItemsByCategory.NMR || []}
                    checked={additionalChecked}
                    toggleChecked={toggleAdditionalChecked}
                    toggleAll={toggleAllAdditional}
                    newItem={newNmrItem}
                    setNewItem={setNewNmrItem}
                    addItem={addNmrItem}
                    removeItem={removeAdditionalItem}
                    updateItem={updateAdditionalItem}
                  />
                )}

                {activeAdditionalTab === "Transport" && (
                  <TransportCategoryTable
                    items={additionalItemsByCategory.Transport || []}
                    checked={additionalChecked}
                    toggleChecked={toggleAdditionalChecked}
                    toggleAll={toggleAllAdditional}
                    newItem={newTransportItem}
                    setNewItem={setNewTransportItem}
                    addItem={addTransportItem}
                    removeItem={removeAdditionalItem}
                    updateItem={updateAdditionalItem}
                  />
                )}

                {activeAdditionalTab === "Establishment" && (
                  <AdditionalCategoryTable
                    category="Establishment"
                    label="Establishment Category"
                    knownUnits={knownUnits}
                    items={additionalItemsByCategory.Establishment || []}
                    checked={additionalChecked}
                    toggleChecked={toggleAdditionalChecked}
                    toggleAll={toggleAllAdditional}
                    newItem={newItemForms.Establishment}
                    setNewItem={updater => setNewItemForms(f => ({ ...f, Establishment: updater(f.Establishment) }))}
                    addItem={addAdditionalItem}
                    removeItem={removeAdditionalItem}
                    updateItem={updateAdditionalItem}
                  />
                )}
              </div>
            );
          })()}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onCreatePR} disabled={selectedCount === 0}
              style={{
                border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                color: "#fff", background: selectedCount === 0 ? "#cbd5e1" : "linear-gradient(135deg,#0d9488,#14b8a6)",
                cursor: selectedCount === 0 ? "not-allowed" : "pointer",
              }}>
              Create PR from {selectedCount} Selected Item{selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Editable free-text Remarks cell — edits locally, saves when focus leaves the field.
function RemarksCell({ value, onSave }) {
  const [v, setV] = useState(value || "");
  useEffect(() => { setV(value || ""); }, [value]);
  return (
    <input value={v} onChange={e => setV(e.target.value)} placeholder="Add remarks"
      onBlur={() => { if (v !== (value || "")) onSave(v); }}
      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
      style={{ width: "100%", boxSizing: "border-box", border: "1px solid transparent", borderBottom: "1px dashed #cbd5e1", borderRadius: 6, padding: "5px 6px", fontSize: 13, fontFamily: "inherit", background: "transparent" }} />
  );
}

// One category's table of manually-entered items (S.No/Description/Qty/Unit)
// — shared by NT, NMR, Transport, and Establishment below the BOQ table.
function AdditionalCategoryTable({
  category, label, knownUnits, items, checked, toggleChecked, toggleAll,
  newItem, setNewItem, addItem, removeItem, updateItem,
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 17, color: "#374151" }}>
          {label} <span style={{ color: "#94a3b8" }}>· {items.length}</span>
        </div>
        {items.length > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => toggleAll(category, true)} style={{ border: "none", background: "none", color: "#0d9488", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Select all</button>
            <button onClick={() => toggleAll(category, false)} style={{ border: "none", background: "none", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          </div>
        )}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", maxHeight: 400, marginBottom: 12 }}>
        <table className="ops-boq-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>PR Selection</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 60, fontSize: 17 }}>S.No</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 260, fontSize: 17 }}>Description</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>Qty</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>Unit</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 200, fontSize: 17 }}>Remarks</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "12px 10px", color: "#94a3b8", fontSize: 13 }}>No items added yet.</td></tr>
            ) : items.map((it, i) => (
              <tr key={it.id}>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <input type="checkbox" checked={!!checked[it.id]} onChange={() => toggleChecked(it.id)} />
                </td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#0d9488" }}>{i + 1}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", maxWidth: 260, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.description}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{it.qty || "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{it.unit || "—"}</td>
                <td style={{ padding: "4px 10px", borderBottom: "1px solid #f1f5f9" }}><RemarksCell value={it.remarks} onSave={v => updateItem(it.id, { remarks: v })} /></td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add a new item to this category */}
      <div className="ops-add-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={newItem.description}
          onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))}
          placeholder="Description"
          style={{ flex: 2, minWidth: 220, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <input value={newItem.qty}
          onChange={e => setNewItem(f => ({ ...f, qty: e.target.value }))}
          placeholder="Qty" type="number"
          style={{ width: 90, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <select value={newItem.unit}
          onChange={e => setNewItem(f => ({ ...f, unit: e.target.value }))}
          style={{ width: 100, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="">Unit</option>
          {(knownUnits || []).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input value={newItem.remarks || ""}
          onChange={e => setNewItem(f => ({ ...f, remarks: e.target.value }))}
          placeholder="Remarks"
          style={{ flex: 1, minWidth: 160, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <button onClick={() => addItem(category)} disabled={!newItem.description.trim()}
          style={{
            border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            color: "#fff", background: newItem.description.trim() ? "#0d9488" : "#cbd5e1",
            cursor: newItem.description.trim() ? "pointer" : "not-allowed",
          }}>
          + Add Item
        </button>
      </div>
    </div>
  );
}

// "Additional Items" — unlike every other category above/below, each row
// here must reference an existing BOQ line item (picked from `groups`), so
// "+ Add Item" stays disabled until both a BOQ item and description are set.
function AdditionalItemsTable({ groups, knownUnits, items, checked, toggleChecked, toggleAll, newItem, setNewItem, addItem, removeItem, updateItem }) {
  const canAdd = !!newItem.linkedBoqLabel && !!newItem.description.trim();
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 17, color: "#374151" }}>
          Additional Items <span style={{ color: "#94a3b8" }}>· {items.length}</span>
        </div>
        {items.length > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => toggleAll("AdditionalItems", true)} style={{ border: "none", background: "none", color: "#0d9488", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Select all</button>
            <button onClick={() => toggleAll("AdditionalItems", false)} style={{ border: "none", background: "none", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          </div>
        )}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", maxHeight: 400, marginBottom: 12 }}>
        <table className="ops-boq-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>PR Selection</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 60, fontSize: 17 }}>S.No</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 110, fontSize: 17 }}>BOQ Item</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 220, fontSize: 17 }}>Description</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>Qty</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>Unit</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 200, fontSize: 17 }}>Remarks</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "12px 10px", color: "#94a3b8", fontSize: 13 }}>No items added yet.</td></tr>
            ) : items.map((it, i) => (
              <tr key={it.id}>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <input type="checkbox" checked={!!checked[it.id]} onChange={() => toggleChecked(it.id)} />
                </td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#0d9488" }}>{i + 1}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#0d9488" }}>{it.linkedBoqLabel}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", maxWidth: 220, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.description}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{it.qty || "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{it.unit || "—"}</td>
                <td style={{ padding: "4px 10px", borderBottom: "1px solid #f1f5f9" }}><RemarksCell value={it.remarks} onSave={v => updateItem(it.id, { remarks: v })} /></td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add a new item — a BOQ item link is required */}
      <div className="ops-add-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={newItem.linkedBoqLabel}
          onChange={e => setNewItem(f => ({ ...f, linkedBoqLabel: e.target.value }))}
          style={{ width: 160, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="">Link to BOQ item…</option>
          {(groups || []).map((g, i) => (
            <option key={i} value={g.label}>{g.label} — {(g.description || "").slice(0, 40)}</option>
          ))}
        </select>
        <input value={newItem.description}
          onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))}
          placeholder="Description"
          style={{ flex: 2, minWidth: 200, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <input value={newItem.qty}
          onChange={e => setNewItem(f => ({ ...f, qty: e.target.value }))}
          placeholder="Qty" type="number"
          style={{ width: 90, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <select value={newItem.unit}
          onChange={e => setNewItem(f => ({ ...f, unit: e.target.value }))}
          style={{ width: 100, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="">Unit</option>
          {(knownUnits || []).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input value={newItem.remarks || ""}
          onChange={e => setNewItem(f => ({ ...f, remarks: e.target.value }))}
          placeholder="Remarks"
          style={{ flex: 1, minWidth: 160, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <button onClick={addItem} disabled={!canAdd}
          style={{
            border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            color: "#fff", background: canAdd ? "#0d9488" : "#cbd5e1",
            cursor: canAdd ? "pointer" : "not-allowed",
          }}>
          + Add Item
        </button>
      </div>
    </div>
  );
}

// NMR ("Nominal Muster Roll") — daily labour entries. Its own column set
// (labour count/type/date/rate/amount) instead of the generic qty/unit
// shape the other additional categories use.
function NMRCategoryTable({ items, checked, toggleChecked, toggleAll, newItem, setNewItem, addItem, removeItem }) {
  const previewAmount = (Number(newItem.noOfLabours) || 0) * (Number(newItem.unitRate) || 0);
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 17, color: "#374151" }}>
          NMR Category <span style={{ color: "#94a3b8" }}>· {items.length}</span>
        </div>
        {items.length > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => toggleAll("NMR", true)} style={{ border: "none", background: "none", color: "#0d9488", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Select all</button>
            <button onClick={() => toggleAll("NMR", false)} style={{ border: "none", background: "none", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          </div>
        )}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", maxHeight: 400, marginBottom: 12 }}>
        <table className="ops-boq-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>PR Selection</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 60, fontSize: 17 }}>S.No</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 180, fontSize: 17 }}>Description</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 80, fontSize: 17 }}>No of Labours</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 120, fontSize: 17 }}>Type of Labours</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 110, fontSize: 17 }}>Date</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>Unit Rate</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 100, fontSize: 17 }}>Amount</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: "12px 10px", color: "#94a3b8", fontSize: 13 }}>No NMR entries added yet.</td></tr>
            ) : items.map((it, i) => (
              <tr key={it.id}>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <input type="checkbox" checked={!!checked[it.id]} onChange={() => toggleChecked(it.id)} />
                </td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#0d9488" }}>{i + 1}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", maxWidth: 180, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.description}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{it.noOfLabours || "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{it.typeOfLabours || "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{it.date || "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{it.unitRate ? `₹${it.unitRate}` : "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: 700 }}>{it.amount ? `₹${it.amount}` : "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add a new NMR entry */}
      <div className="ops-add-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={newItem.description}
          onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))}
          placeholder="Description"
          style={{ flex: 2, minWidth: 180, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <input value={newItem.noOfLabours}
          onChange={e => setNewItem(f => ({ ...f, noOfLabours: e.target.value }))}
          placeholder="No of Labours" type="number"
          style={{ width: 110, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <select value={newItem.typeOfLabours}
          onChange={e => setNewItem(f => ({ ...f, typeOfLabours: e.target.value }))}
          style={{ width: 140, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="">Type of Labours</option>
          {NMR_LABOUR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={newItem.date} type="date"
          onChange={e => setNewItem(f => ({ ...f, date: e.target.value }))}
          style={{ width: 140, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <input value={newItem.unitRate}
          onChange={e => setNewItem(f => ({ ...f, unitRate: e.target.value }))}
          placeholder="Unit Rate" type="number"
          style={{ width: 100, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <div title="Amount = No of Labours × Unit Rate" style={{ width: 100, fontSize: 13, color: "#374151", fontWeight: 600 }}>
          ₹{previewAmount.toLocaleString("en-IN")}
        </div>
        <button onClick={addItem} disabled={!newItem.description.trim()}
          style={{
            border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            color: "#fff", background: newItem.description.trim() ? "#0d9488" : "#cbd5e1",
            cursor: newItem.description.trim() ? "pointer" : "not-allowed",
          }}>
          + Add Item
        </button>
      </div>
    </div>
  );
}

// Transport Category — its own column set (S.No/Description/Transport/Amount)
// instead of the generic qty/unit shape the other standalone categories use.
function TransportCategoryTable({ items, checked, toggleChecked, toggleAll, newItem, setNewItem, addItem, removeItem, updateItem }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 17, color: "#374151" }}>
          Transport Category <span style={{ color: "#94a3b8" }}>· {items.length}</span>
        </div>
        {items.length > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => toggleAll("Transport", true)} style={{ border: "none", background: "none", color: "#0d9488", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Select all</button>
            <button onClick={() => toggleAll("Transport", false)} style={{ border: "none", background: "none", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          </div>
        )}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", maxHeight: 400, marginBottom: 12 }}>
        <table className="ops-boq-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90, fontSize: 17 }}>PR Selection</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 60, fontSize: 17 }}>S.No</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 220, fontSize: 17 }}>Description</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 140, fontSize: 17 }}>Transport</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 100, fontSize: 17 }}>Amount</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 200, fontSize: 17 }}>Remarks</th>
              <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "12px 10px", color: "#94a3b8", fontSize: 13 }}>No items added yet.</td></tr>
            ) : items.map((it, i) => (
              <tr key={it.id}>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <input type="checkbox" checked={!!checked[it.id]} onChange={() => toggleChecked(it.id)} />
                </td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#0d9488" }}>{i + 1}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", maxWidth: 220, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.description}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{it.transport || "—"}</td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: 700 }}>{it.amount ? `₹${it.amount}` : "—"}</td>
                <td style={{ padding: "4px 10px", borderBottom: "1px solid #f1f5f9" }}><RemarksCell value={it.remarks} onSave={v => updateItem(it.id, { remarks: v })} /></td>
                <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                  <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add a new Transport entry */}
      <div className="ops-add-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={newItem.description}
          onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))}
          placeholder="Description"
          style={{ flex: 2, minWidth: 220, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <input value={newItem.transport}
          onChange={e => setNewItem(f => ({ ...f, transport: e.target.value }))}
          placeholder="Transport"
          style={{ width: 160, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <input value={newItem.amount}
          onChange={e => setNewItem(f => ({ ...f, amount: e.target.value }))}
          placeholder="Amount" type="number"
          style={{ width: 110, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <input value={newItem.remarks || ""}
          onChange={e => setNewItem(f => ({ ...f, remarks: e.target.value }))}
          placeholder="Remarks"
          style={{ flex: 1, minWidth: 160, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
        <button onClick={addItem} disabled={!newItem.description.trim()}
          style={{
            border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            color: "#fff", background: newItem.description.trim() ? "#0d9488" : "#cbd5e1",
            cursor: newItem.description.trim() ? "pointer" : "not-allowed",
          }}>
          + Add Item
        </button>
      </div>
    </div>
  );
}
