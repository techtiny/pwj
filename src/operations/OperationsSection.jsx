import { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, TrendingUp, ClipboardList, ChevronLeft, Search } from "lucide-react";
import {
  getEligibleForAccountsProjects, getRecentEntries,
  uploadDocument, saveProjectBoq, saveUsedLabels, fetchStoredFile,
} from "./operationsApi";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const HEADER_HINTS = ["description", "qty", "quantity", "unit", "rate", "amount", "sl", "s.no", "particular", "item"];
const STATUS_COLORS = { PROCEED: "#3b82f6", HOLD: "#f59e0b", NOT_APPROVED: "#ef4444" };

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

export default function OperationsSection({ user, onCreateFromBOQ }) {
  const [tab, setTab] = useState("boq"); // "boq" | "dashboard"

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

  const resetBOQ = () => {
    setWorkbook(null); setSheetNames([]); setActiveSheet(""); setRows([]);
    setHeaderRowIdx(-1); setChecked({}); setFileName("");
    setParseError(""); setSaveStatus(""); setShowUploadOverride(false);
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

  // Title/client lines sitting above the header row (e.g. "CLIENT : ...",
  // "CIVIL AND INTERIOR") — shown as a caption above the table instead of
  // as selectable items.
  const preambleLines = useMemo(() => {
    if (headerRowIdx <= 0) return [];
    return rows.slice(0, headerRowIdx).map(rowDescription).filter(Boolean);
  }, [rows, headerRowIdx]);

  // Which BOQ line items (by qualified label) were already turned into a PR
  // for this project — persisted on the project itself so it survives a
  // reload or a different session, not just kept in local component state.
  const usedLabelsMap = useMemo(() => {
    try { return JSON.parse(selectedProject?.boqUsedLabels || "{}"); } catch { return {}; }
  }, [selectedProject?.boqUsedLabels]);
  const usedLabelsForSheet = useMemo(
    () => new Set(usedLabelsMap[activeSheet] || []),
    [usedLabelsMap, activeSheet]
  );
  const isUsed = (idx) => usedLabelsForSheet.has(groups[idx]?.label);

  // Checking a top-level section (label "2") also checks/unchecks its own
  // sub-items ("2a", "2b", ...) so you don't have to tick each one by hand.
  const toggleRow = (idx) => {
    if (isUsed(idx)) return;
    setChecked(c => {
      const nextVal = !c[idx];
      const next = { ...c, [idx]: nextVal };
      const label = groups[idx]?.label;
      if (label && /^\d+$/.test(label)) {
        const childRe = new RegExp(`^${label}[a-z]$`);
        groups.forEach((g, i) => {
          if (i !== idx && childRe.test(g.label) && !isUsed(i)) next[i] = nextVal;
        });
      }
      return next;
    });
  };
  const toggleAll = (checkAll) => {
    const next = {};
    groups.forEach((_, i) => { if (!isUsed(i)) next[i] = checkAll; });
    setChecked(next);
  };

  const selectedIndexes = useMemo(
    () => Object.keys(checked).filter(k => checked[k] && !isUsed(Number(k))).map(Number).sort((a, b) => a - b),
    [checked, usedLabelsForSheet, groups]
  );

  const buildPrefill = () => {
    const selected = selectedIndexes.map(i => groups[i]);

    const boqNo = selected.map(g => g.label).filter(Boolean).join(", ");

    const lines = selected.map(g => {
      const qtyUnitStr = (g.qty != null || g.unit) ? ` — ${g.qty != null ? g.qty : ""}${g.unit ? " " + g.unit : ""}`.trim() : "";
      return `${g.label ? g.label + ". " : ""}${g.description}${qtyUnitStr ? " " + qtyUnitStr : ""}`.trim();
    }).filter(Boolean);
    const combinedSpecification = lines.join("\n");

    // Short single-line summary for Material Required — the first item's
    // description, plus a "+N more" suffix when several items were selected.
    const firstDesc = selected[0]?.description || "";
    const materialRequired = (selected.length > 1
      ? `${firstDesc} (+${selected.length - 1} more from BOQ)`
      : firstDesc).slice(0, 280);

    // If every selected item shares one exact unit, sum the quantities.
    const distinctUnits = [...new Set(selected.map(g => g.unit).filter(Boolean))];
    let unit = "", quantity = "";
    if (distinctUnits.length === 1 && selected.every(g => g.qty != null)) {
      unit = distinctUnits[0];
      quantity = String(selected.reduce((s, g) => s + g.qty, 0));
    }

    return {
      projectName: selectedProject?.name || "",
      boqNo,
      materialRequired,
      specification: combinedSpecification,
      unit,
      quantity,
    };
  };

  const handleCreatePR = () => {
    if (!selectedIndexes.length) return;
    const prefill = buildPrefill();
    onCreateFromBOQ(prefill);

    // Persist these labels as "used" so they can't be selected again, even
    // after a reload or on another device.
    const newLabels = selectedIndexes.map(i => groups[i]?.label).filter(Boolean);
    const updatedSheetLabels = [...new Set([...usedLabelsForSheet, ...newLabels])];
    const updatedMap = { ...usedLabelsMap, [activeSheet]: updatedSheetLabels };
    setSelectedProject(p => ({ ...p, boqUsedLabels: JSON.stringify(updatedMap) }));
    setProjects(ps => ps.map(p => p.id === selectedProject.id ? { ...p, boqUsedLabels: JSON.stringify(updatedMap) } : p));
    saveUsedLabels(selectedProject.id, updatedMap).catch(() => {
      // Best-effort — the in-memory state above still blocks re-selection
      // for the rest of this session even if the save itself failed.
    });

    setChecked({});
  };

  return (
    <div style={{ minHeight: "calc(100vh - 108px)", background: "#f1f5f9", padding: "24px 32px" }}>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        {[
          { key: "boq", label: "BOQ Import", icon: ClipboardList },
          { key: "dashboard", label: "Dashboard", icon: TrendingUp },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer",
                fontFamily: "inherit", padding: "10px 18px", fontSize: 14.5, fontWeight: active ? 700 : 600,
                color: active ? "#0d9488" : "#374151",
                borderBottom: active ? "2.5px solid #0d9488" : "2.5px solid transparent", marginBottom: -1,
              }}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "boq" && (
        !selectedProject ? (
          <ProjectPicker
            projects={filteredProjects}
            loading={projectsLoading}
            search={projectSearch}
            setSearch={setProjectSearch}
            onPick={setSelectedProject}
          />
        ) : (
          <BOQWorkspace
            project={selectedProject}
            onBack={() => { setSelectedProject(null); resetBOQ(); }}
            fileName={fileName}
            parseError={parseError}
            onFile={handleFile}
            loadingStoredBoq={loadingStoredBoq}
            saveStatus={saveStatus}
            showUploadOverride={showUploadOverride}
            onReplace={() => setShowUploadOverride(true)}
            sheetNames={sheetNames}
            activeSheet={activeSheet}
            setActiveSheet={setActiveSheet}
            groups={groups}
            preambleLines={preambleLines}
            checked={checked}
            usedLabelsForSheet={usedLabelsForSheet}
            toggleRow={toggleRow}
            toggleAll={toggleAll}
            selectedCount={selectedIndexes.length}
            onCreatePR={handleCreatePR}
          />
        )
      )}

      {tab === "dashboard" && <TrendingDashboard />}
    </div>
  );
}

function ProjectPicker({ projects, loading, search, setSearch, onPick }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Select a Project</div>
      <div style={{ fontSize: 13.5, color: "#374151", marginBottom: 16 }}>
        Running projects with Accounts active — pick one to upload its BOQ.
      </div>
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 18 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#94a3b8" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
      </div>
      {loading ? (
        <div style={{ color: "#374151", fontSize: 14 }}>Loading projects…</div>
      ) : projects.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 32, textAlign: "center", color: "#374151", fontSize: 14 }}>
          No running projects with Accounts active were found.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {projects.map(p => (
            <button key={p.id} onClick={() => onPick(p)}
              style={{ textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{p.name}</div>
              <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
                {[p.location, p.clientName].filter(Boolean).join(" · ") || "—"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BOQWorkspace({
  project, onBack, fileName, parseError, onFile, loadingStoredBoq, saveStatus, showUploadOverride, onReplace,
  sheetNames, activeSheet, setActiveSheet,
  groups, preambleLines, checked, usedLabelsForSheet, toggleRow, toggleAll, selectedCount, onCreatePR,
}) {
  const showUpload = (!fileName && !loadingStoredBoq) || showUploadOverride;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "#0d9488", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", marginBottom: 10, padding: 0 }}>
        <ChevronLeft size={15} /> Change project
      </button>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{project.name}</div>
      <div style={{ fontSize: 13.5, color: "#374151", marginBottom: 18 }}>
        {[project.location, project.clientName].filter(Boolean).join(" · ") || "—"}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>
              <FileSpreadsheet size={15} color="#0d9488" /> {fileName}
            </div>
            {saveStatus === "saving" && <span style={{ fontSize: 12.5, color: "#94a3b8" }}>Saving to project…</span>}
            {saveStatus === "saved" && <span style={{ fontSize: 12.5, color: "#15803d", fontWeight: 600 }}>✓ Saved — won't need re-uploading next time</span>}
            {saveStatus === "error" && <span style={{ fontSize: 12.5, color: "#ef4444" }}>Couldn't save — you'll need to re-upload next visit</span>}
            <button onClick={onReplace} style={{ fontSize: 13, color: "#0d9488", fontWeight: 600, cursor: "pointer", border: "none", background: "none", fontFamily: "inherit", padding: 0 }}>
              Replace BOQ
            </button>
          </div>

          {sheetNames.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>Sheet:</span>
              <select value={activeSheet} onChange={e => setActiveSheet(e.target.value)}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#0f172a" }}>
                {sheetNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}

          {parseError && <div style={{ color: "#ef4444", fontSize: 13.5, marginBottom: 10 }}>{parseError}</div>}

          {preambleLines.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {preambleLines.map((line, i) => (
                <div key={i} style={{ fontSize: i === 0 ? 15 : 13.5, fontWeight: i === 0 ? 700 : 600, color: i === 0 ? "#0f172a" : "#374151" }}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {groups.length === 0 ? (
            <div style={{ color: "#374151", fontSize: 14 }}>This sheet has no line items.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: "#374151" }}>
                  {groups.length} item{groups.length !== 1 ? "s" : ""} · select the line items you want in this PR
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => toggleAll(true)} style={{ border: "none", background: "none", color: "#0d9488", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Select all</button>
                  <button onClick={() => toggleAll(false)} style={{ border: "none", background: "none", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
                </div>
              </div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", maxHeight: 460 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90 }}>PR Selection</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 60 }}>No.</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Description</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", width: 90 }}>Unit</th>
                      <th style={{ position: "sticky", top: 0, background: "#f8fafc", padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e2e8f0", width: 90 }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, i) => {
                      const added = usedLabelsForSheet.has(g.label);
                      return (
                        <tr key={i} style={{ background: added ? "#f0fdf4" : "#fff", opacity: added ? 0.55 : 1 }}>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                            {added ? (
                              <span style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>✓ Added</span>
                            ) : (
                              <input type="checkbox" checked={!!checked[i]} onChange={() => toggleRow(i)} />
                            )}
                          </td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#0d9488" }}>{g.label}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", maxWidth: 420, whiteSpace: "pre-wrap" }}>{g.description}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{g.unit || "—"}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>{g.qty != null ? g.qty : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
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
        </>
      )}
    </div>
  );
}

function TrendingDashboard() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    getRecentEntries(200)
      .then(d => { setEntries(d.content || []); setSummary(d); })
      .catch(() => { setEntries([]); setSummary(null); })
      .finally(() => setLoading(false));
  }, []);

  const byProject = useMemo(() => {
    const m = new Map();
    entries.forEach(e => { const k = e.projectName || "Unassigned"; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [entries]);

  const byWeek = useMemo(() => {
    const m = new Map();
    entries.forEach(e => {
      const d = e.createdAt || e.timestamp;
      if (!d) return;
      const dt = new Date(d);
      const monday = new Date(dt); monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().slice(0, 10);
      m.set(key, (m.get(key) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-10)
      .map(([week, count]) => ({ week: week.slice(5), count }));
  }, [entries]);

  const statusPie = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Proceed", value: summary.totalProceed || 0 },
      { name: "Hold", value: summary.totalHold || 0 },
      { name: "Not Approved", value: summary.totalNotApproved || 0 },
    ].filter(d => d.value > 0);
  }, [summary]);

  const latest = useMemo(() => entries.slice(0, 10), [entries]);

  if (loading) return <div style={{ color: "#374151", fontSize: 14 }}>Loading dashboard…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total (recent)", value: entries.length, color: "#0d9488" },
          { label: "Open", value: summary?.totalOpen ?? "—", color: "#3b82f6" },
          { label: "Closed", value: summary?.totalClosed ?? "—", color: "#15803d" },
          { label: "On Hold", value: summary?.totalHold ?? "—", color: "#f59e0b" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 12.5, color: "#374151", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>PRs Raised — Last 10 Weeks</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Approval Status</div>
          {statusPie.length === 0 ? (
            <div style={{ color: "#374151", fontSize: 13 }}>No data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                  {statusPie.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.name === "Proceed" ? "PROCEED" : d.name === "Hold" ? "HOLD" : "NOT_APPROVED"] || "#94a3b8"} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Top Projects by PR Count</div>
        <ResponsiveContainer width="100%" height={Math.max(160, byProject.length * 34)}>
          <BarChart data={byProject} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#14b8a6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Latest Activity</div>
        {latest.length === 0 ? (
          <div style={{ color: "#374151", fontSize: 13 }}>No entries yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {latest.map(e => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{e.materialRequired || "—"}</span>
                  <span style={{ color: "#374151" }}> · {e.projectName || "—"} · raised by {e.raisedBy || "—"}</span>
                </div>
                <div style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>
                  {(e.createdAt || e.timestamp) ? new Date(e.createdAt || e.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
