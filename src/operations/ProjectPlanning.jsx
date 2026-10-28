import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Plus, Save, Trash2, Download, X, Search, ClipboardList, ChevronDown, ListPlus, Printer, AlertTriangle } from "lucide-react";
import { getProjectSchedule, saveProjectSchedule } from "./operationsApi";

// ── Date helpers (dates travel as "YYYY-MM-DD" strings) ─────────────────────
const DAY_MS = 86400000;
const toUtc = (d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
// Inclusive day count: a task planned 5th → 8th takes 4 days.
const inclusiveDays = (start, finish) => Math.round((toUtc(finish) - toUtc(start)) / DAY_MS) + 1;
const addDays = (start, n) => fromUtc(toUtc(start) + n * DAY_MS);
const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = String(d).slice(0, 10).split("-"); return y && m && dd ? `${dd}/${m}/${y}` : String(d); }; // DD/MM/YYYY

const EMPTY_HEADER = { woNumber: "", startDate: "", completionDate: "", spocClient: "", spocContact: "", happizoRepresentative: "" };
const ROW_FIELDS = [
  "boqNo", "boqDescription", "description", "dependency",
  "dependencyStartDate", "dependencyTargetDate", "materialLeadDays", "materialLeadDate", "materialDeliveryDate", "durationDays",
  "plannedStart", "plannedFinish", "actualStart", "actualFinish", "status", "remarks",
];
const OTHER_GROUP = "__other__";
const DEPENDENCIES = ["Architect", "Consultant", "Client"];
const OTHERS = "__others__";
const isOtherDep = (r) => !!r.depOtherMode; // text box open (typing a custom value)

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

function fromServerRow(a) {
  const r = { key: `id-${a.id}`, id: a.id };
  ROW_FIELDS.forEach(f => { r[f] = a[f] ?? ""; });
  return r;
}

function blankRow(boqItem) {
  const r = { key: newKey(), id: null };
  ROW_FIELDS.forEach(f => { r[f] = ""; });
  if (boqItem) {
    r.boqNo = boqItem.label || "";
    r.boqDescription = boqItem.description || "";
  }
  return r;
}

const menuItem = (disabled) => ({
  display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "none", textAlign: "left",
  padding: "9px 12px", borderRadius: 7, fontSize: 13.5, fontFamily: "inherit", fontWeight: 600,
  color: disabled ? "#cbd5e1" : "#0f172a", cursor: disabled ? "not-allowed" : "pointer",
});

// Status is derived from the dates, never ticked by hand:
//   actual finish on/before planned finish -> DONE (green)   after planned finish -> LATE (orange)
//   no actual finish and planned finish already past today -> OVERDUE (red)   otherwise PENDING.
const STATE_COLORS = { DONE: "#15803d", LATE: "#ea580c", OVERDUE: "#dc2626" };
function rowState(r, today) {
  if (r.actualFinish) return r.plannedFinish && r.actualFinish > r.plannedFinish ? "LATE" : "DONE";
  if (r.plannedFinish && r.plannedFinish < today) return "OVERDUE";
  return "PENDING";
}

// Days a row is behind: late finishes count actual vs planned finish; open rows past their
// planned finish keep growing by one each day until an actual finish is entered.
function delayDays(r, today) {
  const st = rowState(r, today);
  if (st === "LATE") return Math.round((toUtc(r.actualFinish) - toUtc(r.plannedFinish)) / DAY_MS);
  if (st === "OVERDUE") return Math.round((toUtc(today) - toUtc(r.plannedFinish)) / DAY_MS);
  return 0;
}
const dayLabel = (n) => `${n} day${n === 1 ? "" : "s"}`;

const COMPANY = {
  name: "Happizo Infrastructure and Solutions",
  addr1: "No.11/ 20, Ground floor, 2nd cross street",
  addr2: "Indira nagar, Adyar, Chennai 600020.",
  gst: "33EKIPS2810E1ZD",
};
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function PlanningDashboard({ project, from, to }) {
  const [statusF, setStatusF] = useState("ALL");
  const [boqF, setBoqF] = useState("");
  const [state, setState] = useState({ loading: true, error: "", header: null, rows: [] });
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: "" }));
    getProjectSchedule(project.id)
      .then(sch => { if (live) setState({ loading: false, error: "", header: sch || {}, rows: (sch?.activities || []).map(fromServerRow) }); })
      .catch(() => { if (live) setState({ loading: false, error: "Couldn't load this project's schedule.", header: null, rows: [] }); });
    return () => { live = false; };
  }, [project.id]);

  const { loading, error, header, rows: allRows } = state;
  const today = todayStr();
  const boqOptions = [...new Set(allRows.map(r => r.boqNo).filter(Boolean))];
  // BOQ + date filters first (status chips show counts within these), then the status filter.
  const base = allRows.filter(r => (!boqF || r.boqNo === boqF)
    && ((!from && !to) || (r.plannedFinish && (!from || r.plannedFinish >= from) && (!to || r.plannedFinish <= to))));
  // Two groups: Completed (finished, on time or late) vs Not Completed (everything else).
  const isCompleted = (r) => { const st = rowState(r, today); return st === "DONE" || st === "LATE"; };
  const rows = statusF === "ALL" ? base : base.filter(r => (statusF === "COMPLETED") === isCompleted(r));
  const baseCount = (k) => base.filter(r => (k === "COMPLETED") === isCompleted(r)).length;
  const states = rows.map(r => rowState(r, today));
  const count = (k) => states.filter(x => x === k).length;
  const done = count("DONE"), late = count("LATE");
  const completed = done + late;
  const total = rows.length;
  const notCompleted = total - completed;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const totalDelay = rows.reduce((sum, r) => sum + delayDays(r, today), 0);
  const daysRemaining = header?.completionDate ? Math.round((toUtc(header.completionDate) - toUtc(today)) / DAY_MS) : null;
  const delayed = rows.map(r => ({ r, d: delayDays(r, today) })).filter(x => x.d > 0).sort((a, b) => b.d - a.d);
  // Finished activities (even late ones) are done — the table lists only what is still open past its planned finish.
  const openDelayed = delayed.filter(x => rowState(x.r, today) === "OVERDUE");

  if (loading) return <div style={{ padding: 20, color: "#64748b" }}>Loading project planning…</div>;
  if (error) return <div style={{ padding: 20, color: "#b91c1c" }}>{error}</div>;

  const card = { background: "#fff", border: "1px solid #e8edf3", borderRadius: 14, boxShadow: "0 1px 2px rgba(15,23,42,.04)" };
  const stat = (label, value, color, sub) => (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, marginTop: 6, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>{sub}</div>}
    </div>
  );
  const legend = (label, n, color) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flex: "none" }} />
      <span style={{ fontSize: 13, color: "#475569" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginLeft: "auto" }}>{n}</span>
    </div>
  );

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Project planning</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Schedule progress and delays, from the saved project schedule</div>
      </div>
      {allRows.length > 0 && (
        <div className="pp-chips" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[["ALL", "All", base.length, "#0f172a"], ["COMPLETED", "Completed", baseCount("COMPLETED"), STATE_COLORS.DONE],
            ["OPEN", "Not Completed", baseCount("OPEN"), STATE_COLORS.OVERDUE]].map(([k, label, n, c]) => {
            const on = statusF === k;
            return (
              <button key={k} onClick={() => setStatusF(k)}
                style={{ border: `1.5px solid ${on ? c : "#e2e8f0"}`, background: on ? c : "#fff", color: on ? "#fff" : "#334155", borderRadius: 99, padding: "5px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {label} <span style={{ opacity: on ? 0.9 : 0.6, fontWeight: 700 }}>{n}</span>
              </button>
            );
          })}
          <select value={boqF} onChange={e => setBoqF(e.target.value)} aria-label="Filter by BOQ"
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: boqF ? "#0f172a" : "#64748b", marginLeft: 4 }}>
            <option value="">All BOQ items</option>
            {boqOptions.map(b => <option key={b} value={b}>BOQ {b}</option>)}
          </select>
          {(statusF !== "ALL" || boqF) && (
            <button onClick={() => { setStatusF("ALL"); setBoqF(""); }} style={{ border: "none", background: "none", color: "#0d9488", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Reset</button>
          )}
        </div>
      )}
      {allRows.length === 0 ? (
        <div style={{ ...card, padding: "32px 24px", textAlign: "center", color: "#64748b" }}>
          No activities scheduled yet — add them in the <b>Project Planning</b> tab.
        </div>
      ) : total === 0 ? (
        <div style={{ ...card, padding: "32px 24px", textAlign: "center", color: "#64748b" }}>No activities match these filters.</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="pp-hero" style={{ ...card, padding: 22, display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(260px, 1.4fr)", gap: 28, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Overall completion</div>
              <div className="pp-hero-num" style={{ fontSize: 52, fontWeight: 800, color: "#0f172a", lineHeight: 1.05, marginTop: 4 }}>{pct}<span style={{ fontSize: 26, color: "#94a3b8" }}>%</span></div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{completed} of {total} activities completed</div>
              <div style={{ height: 10, background: "#eef2f6", borderRadius: 99, overflow: "hidden", display: "flex", marginTop: 14 }}>
                <div style={{ width: `${(completed / total) * 100}%`, background: STATE_COLORS.DONE }} />
                <div style={{ width: `${(notCompleted / total) * 100}%`, background: STATE_COLORS.OVERDUE }} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {legend("Completed", completed, STATE_COLORS.DONE)}
              {legend("Not Completed", notCompleted, STATE_COLORS.OVERDUE)}
            </div>
          </div>

          <div className="pp-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {stat("Overall delayed days", totalDelay, totalDelay > 0 ? "#dc2626" : "#15803d", totalDelay > 0 ? `${delayed.length} activit${delayed.length === 1 ? "y" : "ies"} delayed` : "On schedule")}
            {stat("Days remaining", daysRemaining == null ? "—" : daysRemaining < 0 ? `-${-daysRemaining}` : daysRemaining,
              daysRemaining != null && daysRemaining < 0 ? "#dc2626" : "#0f172a", header?.completionDate ? `Due ${fmtDate(header.completionDate)}` : "Set a completion date")}
            {stat("Activities", total, "#0f172a", total !== allRows.length ? `of ${allRows.length} in schedule` : (header?.startDate ? `Started ${fmtDate(header.startDate)}` : undefined))}
          </div>

          {openDelayed.length > 0 && (
            <div style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Not Completed activities <span style={{ fontWeight: 500, color: "#94a3b8" }}>· past planned finish</span></div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left", fontSize: 12 }}>
                    <th style={{ padding: "8px 18px", fontWeight: 600 }}>BOQ</th><th style={{ padding: "8px 10px", fontWeight: 600 }}>Activity</th>
                    <th style={{ padding: "8px 10px", fontWeight: 600 }}>Planned finish</th><th style={{ padding: "8px 10px", fontWeight: 600 }}>Actual finish</th>
                    <th style={{ padding: "8px 18px", fontWeight: 600, textAlign: "right" }}>Delay</th>
                  </tr></thead>
                  <tbody>
                    {openDelayed.map(({ r, d }) => {
                      const st = rowState(r, today);
                      return (
                        <tr key={r.key} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 18px", fontWeight: 700, color: "#0f172a" }}>{r.boqNo || "—"}</td>
                          <td style={{ padding: "10px", color: "#334155" }}>{r.description || "—"}</td>
                          <td style={{ padding: "10px", color: "#475569" }}>{fmtDate(r.plannedFinish) || "—"}</td>
                          <td style={{ padding: "10px", color: "#475569" }}>{r.actualFinish ? fmtDate(r.actualFinish) : <span style={{ color: STATE_COLORS.OVERDUE }}>Not finished</span>}</td>
                          <td style={{ padding: "10px 18px", textAlign: "right" }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: STATE_COLORS[st], background: st === "OVERDUE" ? "#fef2f2" : "#fff7ed", padding: "3px 9px", borderRadius: 99 }}>
                              {dayLabel(d)} {st === "OVERDUE" ? "overdue" : "late"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const firstLine = (s) => (s || "").split("\n")[0];

/**
 * Operations → Project Planning: the project schedule sheet. A header block
 * (WO number, dates, SPOC, Happizo representative, days remaining, overall %)
 * and activity rows grouped under BOQ line items. One BOQ item can have any
 * number of activity rows.
 */
export default function ProjectPlanning({ project, user, boqItems, boqLoading, hasBoq, onGoToBoq, onDirtyChange }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState(""); // "", "saving", "saved", "error"
  const [saveError, setSaveError] = useState("");
  const [lastSaved, setLastSaved] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);
  const [insertMenu, setInsertMenu] = useState(null); // { key, x, y } — row-level Insert menu
  const [insertAtKey, setInsertAtKey] = useState(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [fStatus, setFStatus] = useState("ALL");
  const [fBoq, setFBoq] = useState("");
  const [fText, setFText] = useState(""); // row the BOQ picker inserts above

  useEffect(() => {
    if (!insertMenu) return;
    const close = () => setInsertMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, true); };
  }, [insertMenu]);

  // Close the Add Activities menu on any click outside it.
  useEffect(() => {
    if (!addMenuOpen) return;
    const h = (e) => { if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [addMenuOpen]);

  const applyServer = (s) => {
    setHeader({
      woNumber: s?.woNumber || "", startDate: s?.startDate || "", completionDate: s?.completionDate || "",
      spocClient: s?.spocClient || "", spocContact: s?.spocContact || "", happizoRepresentative: s?.happizoRepresentative || "",
    });
    setRows((s?.activities || []).map(fromServerRow));
    setLastSaved(s?.updatedAt ? { at: s.updatedAt, by: s.updatedBy } : null);
    setDirty(false);
  };

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    getProjectSchedule(project.id)
      .then(applyServer)
      .catch(() => setLoadError("Couldn't load this project's schedule. Refresh to try again."))
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  // Warn before closing the browser tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const touch = () => { setDirty(true); if (saveState === "saved") setSaveState(""); };

  const setH = (k, v) => { setHeader(h => ({ ...h, [k]: v })); touch(); };

  // Planned start / finish / duration keep each other in step: dates set the
  // duration, and a duration typed against a start date sets the finish.
  const updateRow = (key, field, value) => {
    setRows(rs => rs.map(r => {
      if (r.key !== key) return r;
      const n = { ...r, [field]: value };
      if ((field === "plannedStart" || field === "plannedFinish") && n.plannedStart && n.plannedFinish) {
        const d = inclusiveDays(n.plannedStart, n.plannedFinish);
        n.durationDays = d >= 1 ? d : "";
      }
      if (field === "durationDays" && n.plannedStart && Number(value) >= 1) {
        n.plannedFinish = addDays(n.plannedStart, Number(value) - 1);
      }
      return n;
    }));
    touch();
  };

  // Link (or unlink, with "") one activity to a BOQ item; it then moves under that item's group.
  const linkRowToBoq = (key, label) => {
    const item = label ? boqByLabel.get(label) : null;
    setRows(rs => rs.map(r => r.key !== key ? r : { ...r, boqNo: label || "", boqDescription: item ? (item.description || "") : "" }));
    touch();
  };

  // Insert activities directly above an existing row. Sl No is derived from on-screen order,
  // so every number below shifts automatically. `items` are BOQ items to link (null = no BOQ item);
  // `sameAs` copies the target row's BOQ link.
  const insertBefore = (key, items, sameAs) => {
    setRows(rs => {
      const i = rs.findIndex(r => r.key === key);
      if (i < 0) return rs;
      const blanks = sameAs
        ? [{ ...blankRow(null), boqNo: rs[i].boqNo || "", boqDescription: rs[i].boqDescription || "" }]
        : items.map(it => blankRow(it));
      return [...rs.slice(0, i), ...blanks, ...rs.slice(i)];
    });
    touch();
  };

  // "+" on a row: add a new activity directly below it, under the same BOQ item.
  const addRowAfter = (key) => {
    setRows(rs => {
      const i = rs.findIndex(r => r.key === key);
      if (i < 0) return rs;
      const row = { ...blankRow(null), boqNo: rs[i].boqNo || "", boqDescription: rs[i].boqDescription || "" };
      return [...rs.slice(0, i + 1), row, ...rs.slice(i + 1)];
    });
    touch();
  };

  const removeRow = (key) => { setRows(rs => rs.filter(r => r.key !== key)); touch(); };

  // ── Grouping: consecutive rows sharing a BOQ item form one block, in row order. ──
  // Position decides everything, so a row inserted (or re-linked) between two BOQ items stays
  // exactly where it is and gets its own block, instead of being pulled into a distant group.
  const groups = useMemo(() => {
    const out = [];
    rows.forEach(r => {
      const label = r.boqNo || "";
      const last = out[out.length - 1];
      if (last && last.boqNo === label) last.rows.push(r);
      else out.push({ id: `${label || OTHER_GROUP}#${out.length}`, boqNo: label, rows: [r] });
    });
    return out;
  }, [rows]);

  // Sl No runs 1, 2, 3… down the whole schedule in on-screen order, across
  // every BOQ group and the "Other activities" group alike.
  const serialByKey = useMemo(() => {
    const m = {};
    groups.flatMap(g => g.rows).forEach((r, i) => { m[r.key] = i + 1; });
    return m;
  }, [groups]);

  const boqByLabel = useMemo(() => new Map((boqItems || []).filter(b => b.label).map(b => [b.label, b])), [boqItems]);

  // New rows for an existing group go directly under that group's last row,
  // so the saved order always matches what's on screen.
  const addRowsForItems = (items) => {
    setRows(rs => {
      let next = [...rs];
      items.forEach(item => {
        const row = blankRow(item);
        // "Activity without BOQ item" always goes to the very bottom; position-specific adds use the
        // row's "+" (below) and Insert (above) buttons instead.
        if (!item) { next.push(row); return; }
        let lastIdx = -1;
        next.forEach((r, i) => { if ((r.boqNo || "") === item.label) lastIdx = i; });
        if (lastIdx >= 0) next.splice(lastIdx + 1, 0, row);
        else next.push(row);
      });
      return next;
    });
    touch();
  };

  // ── Header metrics ──
  const today = todayStr();
  // Custom "Others" values already used in this schedule, offered in every row's dropdown.
  const customDeps = [...new Set(rows.filter(r => !r.depOtherMode).map(r => (r.dependency || "").trim()).filter(d => d && !DEPENDENCIES.includes(d)))];
  // BOQ items (from the project's imported BOQ) that have no scheduled activity. A section heading that
  // has sub-items (e.g. 34 → 34a, 34b) is skipped — its sub-items are what get planned.
  const plannedLabels = new Set(rows.map(r => r.boqNo).filter(Boolean));
  const boqLabels = (boqItems || []).map(b => b.label).filter(Boolean);
  const missingBoq = (boqItems || []).filter(b => b.label && !plannedLabels.has(b.label)
    && !(/^\d+$/.test(b.label) && boqLabels.some(l => new RegExp(`^${b.label}[a-z]$`, "i").test(l))));
  const q = fText.trim().toLowerCase();
  const filtering = fStatus !== "ALL" || !!fBoq || !!q;
  const visible = (r) => (fStatus === "ALL" || rowState(r, today) === fStatus)
    && (!fBoq || r.boqNo === fBoq)
    && (!q || `${r.description} ${r.remarks} ${r.boqNo}`.toLowerCase().includes(q));
  const visibleCount = rows.filter(visible).length;
  const daysRemaining = header.completionDate ? Math.round((toUtc(header.completionDate) - toUtc(today)) / DAY_MS) : null;
  const completedCount = rows.filter(r => r.actualFinish).length;
  const pct = rows.length ? Math.round((completedCount / rows.length) * 100) : 0;
  const totalDelay = rows.reduce((sum, r) => sum + delayDays(r, today), 0);
  const delayedCount = rows.filter(r => delayDays(r, today) > 0).length;
  const overdueCount = rows.filter(r => rowState(r, today) === "OVERDUE").length;

  const save = async () => {
    // Save in on-screen (grouped) order.
    const ordered = groups.flatMap(g => g.rows);
    const payload = {
      ...header,
      startDate: header.startDate || null,
      completionDate: header.completionDate || null,
      updatedBy: user?.fullName || user?.username || null,
      activities: ordered.map(r => {
        const a = { id: r.id };
        ROW_FIELDS.forEach(f => { a[f] = r[f] === "" ? null : r[f]; });
        const st = rowState(r, today);
        a.status = st === "DONE" || st === "LATE" ? "COMPLETED" : st === "OVERDUE" ? "NOT_COMPLETED" : null;
        a.materialLeadDays = r.materialLeadDays === "" || r.materialLeadDays == null ? null : parseInt(r.materialLeadDays, 10) || null;
        a.durationDays = r.durationDays === "" || r.durationDays == null ? null : parseInt(r.durationDays, 10) || null;
        return a;
      }),
    };
    setSaveState("saving");
    setSaveError("");
    try {
      const saved = await saveProjectSchedule(project.id, payload);
      applyServer(saved);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setSaveError(e?.response?.data?.message || "Couldn't save the schedule. Your changes are still here — try again.");
    }
  };

  // Opens a print-ready (A4 landscape) copy of the schedule exactly as shown on screen,
  // with the Happizo logo and address; the browser's print dialog saves it as PDF.
  const printPdf = () => {
    const cell = "border:1px solid #cbd5e1;padding:4px 5px;font-size:9.5px;vertical-align:top;";
    const th = "border:1px solid #94a3b8;padding:5px 4px;font-size:9.5px;background:#ededeb;text-align:center;font-weight:700;";
    const body = groups.map(g => {
      const rowsHtml = g.rows.filter(visible).map(r => `<tr>
        <td style="${cell}">${esc(r.boqNo)}</td><td style="${cell}text-align:center;">${serialByKey[r.key]}</td>
        <td style="${cell}">${esc(r.description)}</td><td style="${cell}">${esc(r.dependency)}</td>
        <td style="${cell}">${esc(fmtDate(r.dependencyStartDate))}</td><td style="${cell}">${esc(fmtDate(r.dependencyTargetDate))}</td><td style="${cell}text-align:center;">${esc(r.materialLeadDays)}</td><td style="${cell}">${esc(fmtDate(r.materialLeadDate))}</td><td style="${cell}">${esc(fmtDate(r.materialDeliveryDate))}</td>
        <td style="${cell}text-align:center;">${esc(r.durationDays)}</td>
        <td style="${cell}">${esc(fmtDate(r.plannedStart))}</td><td style="${cell}">${esc(fmtDate(r.plannedFinish))}</td>
        <td style="${cell}">${esc(fmtDate(r.actualStart))}</td><td style="${cell}">${esc(fmtDate(r.actualFinish))}</td>
        ${(() => { const st = rowState(r, today); const c = STATE_COLORS[st]; const b = (t) => `<td style="${cell}text-align:center;font-weight:700;color:${c};">${t}</td>`; return (st === "DONE" || st === "LATE" ? b("Completed") : `<td style="${cell}"></td>`) + (st === "OVERDUE" ? b("Not Completed") : `<td style="${cell}"></td>`); })()}
        <td style="${cell}white-space:pre-wrap;">${esc(r.remarks)}</td></tr>`).join("");
      return rowsHtml;
    }).join("");
    const info = [
      ["Project Name", project.name], ["Project WO number", header.woNumber], ["Happizo representative", header.happizoRepresentative],
      ["Project start date", fmtDate(header.startDate)], ["Project completion date", fmtDate(header.completionDate)], ["No of days remaining", daysRemaining ?? ""],
      ["Overall delayed days", totalDelay > 0 ? dayLabel(totalDelay) : "No delay"],
    ];
    const infoHtml = [0, 3, 6].map(i => `<tr>${info.slice(i, i + 3).map(([k, v]) => `<td style="font-size:10px;padding:2px 8px 2px 0;color:#475569;">${esc(k)}</td><td style="font-size:10px;padding:2px 22px 2px 0;font-weight:700;">${esc(v)}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Project Schedule - ${esc(project.name)}</title>
      <style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111;margin:0}table{border-collapse:collapse}th,td{overflow-wrap:anywhere}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>
      <table style="width:100%;border-bottom:2px solid #111;margin-bottom:8px"><tr>
        <td style="width:40%"><img src="${window.location.origin}/happizo-logo.png" alt="Happizo" style="width:120px;height:auto" /></td>
        <td style="text-align:right;font-size:10.5px;line-height:1.5"><b>${esc(COMPANY.name)}</b><br/>${esc(COMPANY.addr1)}<br/>${esc(COMPANY.addr2)}<br/>GSTIN: ${esc(COMPANY.gst)}</td></tr></table>
      <div style="font-size:15px;font-weight:800;margin-bottom:6px">Project Schedule</div>
      <table style="margin-bottom:8px">${infoHtml}</table>
      <table style="width:100%;table-layout:fixed">
        <colgroup>${["5%","3%","10%","7%","7%","7%","5%","7%","7%","5%","6%","6%","6%","6%","7%","7%","7%"].map(w => `<col style="width:${w}">`).join("")}</colgroup>
        <thead>
          <tr><th rowspan="2" style="${th}">BOQ No</th><th rowspan="2" style="${th}">Activity No</th><th rowspan="2" style="${th}">Description of Activity</th><th rowspan="2" style="${th}">Dependency By</th><th rowspan="2" style="${th}">Dependency Start Date</th><th rowspan="2" style="${th}">Dependency Target Date</th><th rowspan="2" style="${th}">Material Lead Days</th><th rowspan="2" style="${th}">Material Lead Date</th><th rowspan="2" style="${th}">Material Delivery Date</th><th rowspan="2" style="${th}">Activity Duration (Days)</th><th colspan="2" style="${th}">Planned date</th><th colspan="2" style="${th}">Actual</th><th colspan="2" style="${th}">Status</th><th rowspan="2" style="${th}">Remarks</th></tr>
          <tr><th style="${th}">Start Date</th><th style="${th}">Finish Date</th><th style="${th}">Started Date</th><th style="${th}">Finished Date</th><th style="${th}">Completed</th><th style="${th}">Not Completed</th></tr>
        </thead><tbody>${body}</tbody></table>
      <div style="font-size:9px;color:#64748b;margin-top:8px">Printed ${esc(new Date().toLocaleString("en-IN"))}</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script></body></html>`;
    const win = window.open("about:blank", "_blank", "width=1100,height=800");
    if (!win) { alert("Allow pop-ups to print the schedule."); return; }
    win.document.write(html);
    win.document.close();
  };

  const exportExcel = () => {
    const H = [
      ["Project Name", project.name, "", "Project WO number", header.woNumber, "", "Happizo representative", header.happizoRepresentative],
      ["Project start date", fmtDate(header.startDate), "", "Project completion date", fmtDate(header.completionDate), "", "No of days remaining", daysRemaining ?? ""],
      ["Overall delayed days", totalDelay],
      [],
      ["BOQ No", "Activity No", "Description of Activity", "Dependency By", "Dependency Start Date", "Dependency Target Date", "Material Lead Days", "Material Lead Date", "Material Delivery Date", "Activity Duration (Days)", "Planned date", "", "Actual", "", "Status", "", "Remarks"],
      ["", "", "", "", "", "", "", "", "", "", "Start Date", "Finish Date", "Started Date", "Finished Date", "Completed", "Not Completed", ""],
    ];
    groups.forEach(g => g.rows.forEach(r => H.push([
      r.boqNo, serialByKey[r.key], r.description, r.dependency,
      fmtDate(r.dependencyStartDate), fmtDate(r.dependencyTargetDate), r.materialLeadDays, fmtDate(r.materialLeadDate), fmtDate(r.materialDeliveryDate), r.durationDays,
      fmtDate(r.plannedStart), fmtDate(r.plannedFinish), fmtDate(r.actualStart), fmtDate(r.actualFinish),
      rowState(r, today) === "DONE" ? "Completed" : rowState(r, today) === "LATE" ? "Completed" : "", rowState(r, today) === "OVERDUE" ? "Not Completed" : "", r.remarks,
    ])));
    const ws = XLSX.utils.aoa_to_sheet(H);
    const m = (r1, c1, r2, c2) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    ws["!merges"] = [
      m(4, 0, 5, 0), m(4, 1, 5, 1), m(4, 2, 5, 2), m(4, 3, 5, 3), m(4, 4, 5, 4), m(4, 5, 5, 5), m(4, 6, 5, 6), m(4, 7, 5, 7), m(4, 8, 5, 8), m(4, 9, 5, 9),
      m(4, 10, 4, 11), m(4, 12, 4, 13), m(4, 14, 4, 15), m(4, 16, 5, 16),
    ];
    ws["!cols"] = [10, 7, 36, 14, 16, 16, 12, 16, 16, 10, 13, 13, 13, 13, 11, 13, 30].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");
    XLSX.writeFile(wb, `${project.name.replace(/[^\w\- ]+/g, "")} - Schedule.xlsx`);
  };

  if (loading) return <div style={{ color: "#374151", fontSize: 14 }}>Loading schedule…</div>;
  if (loadError) return <div style={{ color: "#b91c1c", fontSize: 14 }}>{loadError}</div>;

  return (
    <div>
      {/* ── Header block ── */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div className="pp-header-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px 24px" }}>
          <Field label="Project Name"><div style={{ ...roSt, fontWeight: 700 }}>{project.name}</div></Field>
          <Field label="Project WO number"><input style={inpSt} value={header.woNumber} onChange={e => setH("woNumber", e.target.value)} placeholder="e.g. WO/2026/014" /></Field>
          <Field label="Happizo representative"><input style={inpSt} value={header.happizoRepresentative} onChange={e => setH("happizoRepresentative", e.target.value)} /></Field>

          <Field label="Project start date"><input type="date" style={inpSt} value={header.startDate} onChange={e => setH("startDate", e.target.value)} /></Field>
          <Field label="Project completion date"><input type="date" style={inpSt} value={header.completionDate} min={header.startDate || undefined} onChange={e => setH("completionDate", e.target.value)} /></Field>
          <Field label="No of days remaining">
            <div style={{ ...roSt, fontWeight: 700, color: daysRemaining == null ? "#94a3b8" : daysRemaining < 0 ? "#b91c1c" : daysRemaining <= 7 ? "#b45309" : "#0f172a" }}>
              {daysRemaining == null ? "Set a completion date"
                : daysRemaining < 0 ? `Overdue by ${-daysRemaining} day${daysRemaining === -1 ? "" : "s"}`
                : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
            </div>
          </Field>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="pp-toolbar" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div ref={addMenuRef} style={{ position: "relative" }}>
          <button onClick={() => setAddMenuOpen(o => !o)} style={btn("secondary")} aria-haspopup="menu" aria-expanded={addMenuOpen}>
            <Plus size={15} /> Add Activities <ChevronDown size={14} />
          </button>
          {addMenuOpen && (
            <div role="menu" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 230, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,.12)", padding: 4 }}>
              <button role="menuitem" disabled={!hasBoq || boqLoading}
                title={!hasBoq ? "Upload this project's BOQ in the BOQ tab first" : undefined}
                onClick={() => { setAddMenuOpen(false); setInsertAtKey(null); setPickerOpen(true); }}
                style={menuItem(!hasBoq || boqLoading)}>
                <ClipboardList size={15} /> Add from BOQ
              </button>
              <button role="menuitem" onClick={() => { setAddMenuOpen(false); addRowsForItems([null]); }} style={menuItem(false)}>
                <Plus size={15} /> Activity without BOQ item
              </button>
            </div>
          )}
        </div>
        {hasBoq && !boqLoading && (
          <button onClick={() => setMissingOpen(true)} aria-label={`${missingBoq.length} BOQ items not planned`}
            title={missingBoq.length ? `${missingBoq.length} BOQ item(s) have no scheduled activity` : "All BOQ items are planned"}
            style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 8, cursor: "pointer",
              border: `1.5px solid ${missingBoq.length ? "#fcd34d" : "#bbf7d0"}`, background: missingBoq.length ? "#fffbeb" : "#f0fdf4", color: missingBoq.length ? "#d97706" : "#15803d" }}>
            <AlertTriangle size={18} />
            {missingBoq.length > 0 && (
              <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 99, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{missingBoq.length}</span>
            )}
          </button>
        )}
        <button onClick={printPdf} disabled={!rows.length} style={btn(rows.length ? "secondary" : "disabled")}>
          <Printer size={15} /> Print PDF
        </button>
        <button onClick={exportExcel} disabled={!rows.length} style={btn(rows.length ? "secondary" : "disabled")}>
          <Download size={15} /> Export Excel
        </button>
        <div title="Sum of days late on finished activities plus days overdue on open ones"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
            background: totalDelay > 0 ? "#fef2f2" : "#f0fdf4", border: `1.5px solid ${totalDelay > 0 ? "#fecaca" : "#bbf7d0"}`, color: totalDelay > 0 ? "#dc2626" : "#15803d" }}>
          Overall delayed days: {totalDelay > 0 ? dayLabel(totalDelay) : "No delay"}
          {delayedCount > 0 && <span style={{ fontWeight: 500, fontSize: 12, color: "#64748b" }}>· {delayedCount} activit{delayedCount === 1 ? "y" : "ies"}</span>}
        </div>
        {rows.length > 0 && (<>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input value={fText} onChange={e => setFText(e.target.value)} placeholder="Search activity or remarks"
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px 7px 29px", fontSize: 13, fontFamily: "inherit", width: 230 }} />
        </div>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status"
          style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="ALL">All statuses</option>
          <option value="DONE">Completed on time</option>
          <option value="LATE">Completed late</option>
          <option value="OVERDUE">Not Completed (overdue)</option>
          <option value="PENDING">Pending</option>
        </select>
        <select value={fBoq} onChange={e => setFBoq(e.target.value)} aria-label="Filter by BOQ"
          style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
          <option value="">All BOQ items</option>
          {[...new Set(rows.map(r => r.boqNo).filter(Boolean))].map(b => <option key={b} value={b}>BOQ {b}</option>)}
        </select>
        {filtering && (
          <>
            <span style={{ fontSize: 12.5, color: "#64748b" }}>Showing {visibleCount} of {rows.length}</span>
            <button onClick={() => { setFStatus("ALL"); setFBoq(""); setFText(""); }} style={{ border: "none", background: "none", color: "#0d9488", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Clear filters</button>
          </>
        )}
        </>)}
        <div className="pp-spacer" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: saveState === "error" ? "#b91c1c" : dirty ? "#b45309" : "#64748b" }}>
            {saveState === "saving" ? "Saving…"
              : saveState === "error" ? saveError
              : dirty ? "Unsaved changes"
              : saveState === "saved" ? "✓ Saved"
              : lastSaved ? `Last saved ${new Date(lastSaved.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${lastSaved.by ? ` by ${lastSaved.by}` : ""}`
              : ""}
          </span>
          <button onClick={save} disabled={!dirty || saveState === "saving"} style={btn(!dirty || saveState === "saving" ? "disabled" : "primary")}>
            <Save size={15} /> Save schedule
          </button>
        </div>
      </div>

      {!hasBoq && !boqLoading && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#92400e", marginBottom: 12 }}>
          This project has no BOQ yet, so activities can't be linked to BOQ items.{" "}
          <button onClick={onGoToBoq} style={{ border: "none", background: "none", padding: 0, color: "#0d9488", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5 }}>Upload it in BOQ</button>
        </div>
      )}

      {/* ── Schedule table ── */}
      {rows.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>No activities scheduled yet</div>
          <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 4 }}>
            Use <b>Add Activities → Add from BOQ</b> to pick BOQ items, then add as many activities under each item as you need.
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }} className="pp-scroll">
          <table className="pp-table" style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...th, width: "3.5%" }}>BOQ No</th>
                <th rowSpan={2} style={{ ...th, width: "4%" }}>Activity No</th>
                <th rowSpan={2} style={{ ...th, width: "9.5%" }}>Description of Activity</th>
                <th rowSpan={2} style={{ ...th, width: "8%" }}>Dependency By</th>
                <th rowSpan={2} style={{ ...th, width: "7%", whiteSpace: "normal", wordBreak: "break-word" }}>Dependency Start Date</th>
                <th rowSpan={2} style={{ ...th, width: "7%", whiteSpace: "normal", wordBreak: "break-word" }}>Dependency Target Date</th>
                <th rowSpan={2} style={{ ...th, width: "5%" }}>Material Lead Days</th>
                <th rowSpan={2} style={{ ...th, width: "7%" }}>Material Lead Date</th>
                <th rowSpan={2} style={{ ...th, width: "7%" }}>Material Delivery Date</th>
                <th rowSpan={2} style={{ ...th, width: "5%" }}>Activity Duration (Days)</th>
                <th colSpan={2} style={th}>Planned date</th>
                <th colSpan={2} style={th}>Actual</th>
                <th colSpan={2} style={th}>Status</th>
                <th rowSpan={2} style={{ ...th, width: "9%" }}>Remarks</th>
                <th rowSpan={2} style={{ ...th, width: "7%" }} aria-label="Add / Insert / Remove" />
              </tr>
              <tr>
                <th style={{ ...th2, width: "7%" }}>Start Date</th>
                <th style={{ ...th2, width: "7%" }}>Finish Date</th>
                <th style={{ ...th2, width: "7%" }}>Started Date</th>
                <th style={{ ...th2, width: "7%" }}>Finished Date</th>
                <th style={{ ...th2, width: "5%" }}>Completed</th>
                <th style={{ ...th2, width: "5%" }}>Not Completed</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                return [
                  ...g.rows.filter(visible).map(r => {
                    const state = rowState(r, today);
                    const overdue = state === "OVERDUE";
                    const datesBad = r.plannedStart && r.plannedFinish && r.plannedFinish < r.plannedStart;
                    return (
                      <tr key={r.key} style={{ background: "#fff" }}>
                        <td style={{ ...td, color: "#475569", fontWeight: 600 }}>
                          {hasBoq ? (
                            <select style={{ ...cellInp, padding: "5px 0", color: r.boqNo ? "#0f172a" : "#94a3b8" }} value={r.boqNo || ""}
                              title="Link this activity to a BOQ item"
                              onChange={e => linkRowToBoq(r.key, e.target.value)}>
                              <option value="">—</option>
                              {r.boqNo && !boqByLabel.has(r.boqNo) && <option value={r.boqNo}>{r.boqNo}</option>}
                              {(boqItems || []).filter(b => b.label).map(b => (
                                <option key={b.label} value={b.label} style={{ color: "#0f172a" }}>{b.label}</option>
                              ))}
                            </select>
                          ) : (r.boqNo || "—")}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>{serialByKey[r.key]}</td>
                        <td style={td}><AutoText value={r.description} placeholder="e.g. Gypsum framework" onChange={v => updateRow(r.key, "description", v)} /></td>
                        <td style={td}>
                          <select style={{ ...cellInp, color: r.dependency || isOtherDep(r) ? "#0f172a" : "#94a3b8" }} value={isOtherDep(r) ? OTHERS : (r.dependency || "")}
                            onChange={e => {
                              const v = e.target.value;
                              setRows(rs => rs.map(x => x.key !== r.key ? x : v === OTHERS
                                ? { ...x, depOtherMode: true, dependency: DEPENDENCIES.includes(x.dependency) ? "" : x.dependency }
                                : { ...x, depOtherMode: false, dependency: v }));
                              touch();
                            }}>
                            <option value="">None</option>
                            {DEPENDENCIES.map(d => <option key={d} value={d} style={{ color: "#0f172a" }}>{d}</option>)}
                            {customDeps.map(d => <option key={d} value={d} style={{ color: "#0f172a" }}>{d}</option>)}
                            <option value={OTHERS} style={{ color: "#0f172a" }}>Others…</option>
                          </select>
                          {isOtherDep(r) && (
                            <AutoText style={{ marginTop: 4 }} value={r.dependency} placeholder="Enter dependency" maxLength={100} onChange={v => updateRow(r.key, "dependency", v)}
                              onBlur={() => setRows(rs => rs.map(x => x.key !== r.key ? x : { ...x, depOtherMode: false, dependency: (x.dependency || "").trim() }))} />
                          )}
                        </td>
                        <td style={td}><DateCell value={r.dependencyStartDate} onChange={v => updateRow(r.key, "dependencyStartDate", v)} /></td>
                        <td style={td}><DateCell value={r.dependencyTargetDate} onChange={v => updateRow(r.key, "dependencyTargetDate", v)} /></td>
                        <td style={td}><input type="number" min={0} style={cellInp} value={r.materialLeadDays} onChange={e => updateRow(r.key, "materialLeadDays", e.target.value)} /></td>
                        <td style={td}><DateCell value={r.materialLeadDate} onChange={v => updateRow(r.key, "materialLeadDate", v)} /></td>
                        <td style={td}><DateCell value={r.materialDeliveryDate} onChange={v => updateRow(r.key, "materialDeliveryDate", v)} /></td>
                        <td style={td}><input type="number" min={1} style={cellInp} value={r.durationDays} onChange={e => updateRow(r.key, "durationDays", e.target.value)} /></td>
                        <td style={td}><DateCell value={r.plannedStart} onChange={v => updateRow(r.key, "plannedStart", v)} /></td>
                        <td style={td}>
                          <DateCell value={r.plannedFinish} min={r.plannedStart} warn={overdue || datesBad} onChange={v => updateRow(r.key, "plannedFinish", v)}
                            title={datesBad ? "Finish is before start" : overdue ? "Past planned finish and not completed" : undefined} />
                        </td>
                        <td style={td}><DateCell value={r.actualStart} onChange={v => updateRow(r.key, "actualStart", v)} /></td>
                        <td style={td}><DateCell value={r.actualFinish} min={r.actualStart} onChange={v => updateRow(r.key, "actualFinish", v)} /></td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {state === "DONE" || state === "LATE" ? (
                            <span style={{ fontWeight: 700, fontSize: 16, color: STATE_COLORS[state] }} title={state === "LATE" ? "Finished after the planned finish date" : "Finished on or before the planned finish date"}>Completed</span>
                          ) : (
                            <button onClick={() => updateRow(r.key, "actualFinish", todayStr())} title="Set actual finish to today"
                              style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 14, padding: "4px 9px", cursor: "pointer", color: "#475569", fontFamily: "inherit" }}>Mark done</button>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {state === "OVERDUE" && <span style={{ fontWeight: 700, fontSize: 16, color: STATE_COLORS.OVERDUE }} title="Planned finish date has passed without an actual finish">Not Completed</span>}
                        </td>
                        <td style={td}><AutoText value={r.remarks} placeholder="Remarks" onChange={v => updateRow(r.key, "remarks", v)} /></td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button onClick={() => addRowAfter(r.key)} title="Add activity below" aria-label="Add activity" style={{ border: "none", background: "none", cursor: "pointer", color: "#0d9488", padding: 4 }}>
                            <Plus size={15} />
                          </button>
                          <button onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setInsertMenu(m => m?.key === r.key ? null : { key: r.key, x: Math.max(8, b.right - 250), y: b.bottom + 4 }); }}
                            onMouseDown={e => e.stopPropagation()}
                            title={`Insert before Activity No ${serialByKey[r.key]}`} aria-label="Insert activity above" aria-haspopup="menu" style={{ border: "none", background: "none", cursor: "pointer", color: "#0d9488", padding: 4 }}>
                            <ListPlus size={15} />
                          </button>
                          <button onClick={() => removeRow(r.key)} title="Remove activity" style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {insertMenu && (() => {
        const target = rows.find(r => r.key === insertMenu.key);
        if (!target) return null;
        const pick = (fn) => { setInsertMenu(null); fn(); };
        return (
          <div role="menu" onMouseDown={e => e.stopPropagation()}
            style={{ position: "fixed", left: insertMenu.x, top: insertMenu.y, zIndex: 60, width: 250, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,.14)", padding: 4 }}>
            <div style={{ padding: "6px 12px 4px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Insert before Activity No {serialByKey[insertMenu.key]}</div>
            <button role="menuitem" onClick={() => pick(() => insertBefore(insertMenu.key, [null]))} style={menuItem(false)}>
              <Plus size={15} /> Activity without BOQ item
            </button>
            <button role="menuitem" disabled={!hasBoq || boqLoading} onClick={() => pick(() => { setInsertAtKey(insertMenu.key); setPickerOpen(true); })} style={menuItem(!hasBoq || boqLoading)}>
              <ClipboardList size={15} /> Add from BOQ…
            </button>
            {target.boqNo && (
              <button role="menuitem" onClick={() => pick(() => insertBefore(insertMenu.key, null, true))} style={menuItem(false)}>
                <ListPlus size={15} /> Same BOQ item ({target.boqNo})
              </button>
            )}
          </div>
        );
      })()}

      {missingOpen && (
        <div onClick={() => setMissingOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="BOQ items not planned" className="pp-modal"
            style={{ background: "#fff", borderRadius: 14, width: 720, maxWidth: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={18} color={missingBoq.length ? "#d97706" : "#15803d"} />
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>BOQ items not planned <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {missingBoq.length} of {boqLabels.length}</span></div>
              <button onClick={() => setMissingOpen(false)} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "#64748b" }}><X size={18} /></button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {missingBoq.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: "#15803d", fontWeight: 600 }}>Every BOQ item has at least one scheduled activity.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead><tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left", fontSize: 12.5 }}>
                    <th style={{ padding: "8px 18px", fontWeight: 600, width: 90 }}>BOQ No</th><th style={{ padding: "8px 10px", fontWeight: 600 }}>Description</th>
                    <th style={{ padding: "8px 18px", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>Qty</th>
                  </tr></thead>
                  <tbody>
                    {missingBoq.map(b => (
                      <tr key={b.label} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "9px 18px", fontWeight: 700, color: "#0f172a" }}>{b.label}</td>
                        <td style={{ padding: "9px 10px", color: "#334155", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{firstLine(b.description) || "—"}</td>
                        <td style={{ padding: "9px 18px", textAlign: "right", color: "#475569", whiteSpace: "nowrap" }}>{b.qty != null ? `${b.qty} ${b.unit || ""}` : (b.unit || "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <BoqPicker
          items={boqItems || []}
          countByLabel={groups.reduce((m, g) => (g.boqNo ? { ...m, [g.boqNo]: (m[g.boqNo] || 0) + g.rows.length } : m), {})}
          onClose={() => { setPickerOpen(false); setInsertAtKey(null); }}
          onAdd={(items) => {
            if (insertAtKey) insertBefore(insertAtKey, items); else addRowsForItems(items);
            setPickerOpen(false); setInsertAtKey(null);
          }}
        />
      )}
    </div>
  );
}

// Choose BOQ line items to schedule — adds one activity row per picked item.
function BoqPicker({ items, countByLabel, onClose, onAdd }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState({});
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const usable = useMemo(() => items.filter(i => i.label), [items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? usable.filter(i => i.label.toLowerCase().includes(s) || (i.description || "").toLowerCase().includes(s)) : usable;
  }, [usable, q]);
  const pickedItems = usable.filter(i => picked[i.label]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Add activities from BOQ" className="pp-modal"
        style={{ background: "#fff", borderRadius: 14, width: 720, maxWidth: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Add activities from BOQ</div>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "#64748b" }}><X size={18} /></button>
        </div>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#94a3b8" }} />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by BOQ No or description…"
              style={{ ...inpSt, paddingLeft: 32 }} />
          </div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 6 }}>Each item you pick gets one activity row. You can add more rows under an item afterwards.</div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {shown.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 13.5 }}>No BOQ items match.</div>
          ) : shown.map(i => (
            <label key={i.label} style={{ display: "flex", gap: 10, padding: "10px 18px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: picked[i.label] ? "#f0fdfa" : undefined }}>
              <input type="checkbox" checked={!!picked[i.label]} onChange={e => setPicked(p => ({ ...p, [i.label]: e.target.checked }))} style={{ marginTop: 3, ...chk }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f766e", minWidth: 44 }}>{i.label}</span>
              <span style={{ fontSize: 13, color: "#0f172a", flex: 1, whiteSpace: "pre-line", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.description || "—"}</span>
              {countByLabel[i.label] > 0 && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f766e", background: "#ccfbf1", borderRadius: 99, padding: "2px 8px", height: "fit-content", whiteSpace: "nowrap" }}>
                  {countByLabel[i.label]} scheduled
                </span>
              )}
            </label>
          ))}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={btn("secondary")}>Cancel</button>
          <button onClick={() => onAdd(pickedItems)} disabled={!pickedItems.length} style={btn(pickedItems.length ? "primary" : "disabled")}>
            <Plus size={15} /> Add {pickedItems.length || ""} activit{pickedItems.length === 1 ? "y" : "ies"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

// Date shown as wrapping text ("21 Oct 2026") so nothing is clipped in a narrow column; a transparent
// native date input sits on top, so clicking anywhere on the cell opens the picker.
function DateCell({ value, onChange, min, warn, title }) {
  const ref = useRef(null);
  return (
    <div title={title} style={{ position: "relative", minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 2px", boxSizing: "border-box", borderRadius: 6, whiteSpace: "nowrap",
      border: `1px solid ${warn ? "#fca5a5" : "#e2e8f0"}`, background: warn ? "#fef2f2" : "#fff", color: warn ? "#b91c1c" : value ? "#0f172a" : "#94a3b8",
      fontSize: 14.5, lineHeight: 1.3 }}>
      {value ? fmtDate(value) : "—"}
      <input ref={ref} type="date" value={value || ""} min={min || undefined} aria-label="Date" onChange={e => onChange(e.target.value)}
        onClick={() => { try { ref.current?.showPicker?.(); } catch {} }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0 }} />
    </div>
  );
}

// Text box that grows with its content, so long values wrap instead of scrolling or being clipped.
// Pure CSS: a hidden mirror of the text sizes the grid cell and the textarea fills it, so there is
// no height to measure in JS.
function AutoText({ value, onChange, onBlur, placeholder, maxLength, style }) {
  const box = { ...cellInp, gridArea: "1 / 1", lineHeight: 1.35, fontSize: 16, whiteSpace: "pre-wrap", overflowWrap: "anywhere", minHeight: 38 };
  return (
    <div style={{ display: "grid", ...style }}>
      <div aria-hidden style={{ ...box, visibility: "hidden", border: "1px solid transparent" }}>{(value || placeholder || "") + " "}</div>
      <textarea rows={1} value={value || ""} placeholder={placeholder} maxLength={maxLength} onChange={e => onChange(e.target.value)} onBlur={onBlur}
        style={{ ...box, resize: "none", overflow: "hidden", height: "100%" }} />
    </div>
  );
}

// ── Styles ──
const inpSt = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff", color: "#0f172a" };
const roSt = { padding: "8px 0", fontSize: 14, color: "#0f172a" };
const th = { padding: "10px 8px", fontSize: 15.5, fontWeight: 700, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", textAlign: "center", whiteSpace: "normal" };
const th2 = { ...th, fontWeight: 600, background: "#f1f5f9" };
const td = { padding: "6px 4px", borderBottom: "1px solid #f1f5f9", fontSize: 16, color: "#0f172a", verticalAlign: "middle" };
const cellInp = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "5px 7px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 16, fontFamily: "inherit", outline: "none", background: "#fff", color: "#0f172a" };
const chk = { width: 16, height: 16, accentColor: "#0d9488", cursor: "pointer" };

function btn(kind) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "8px 14px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: "1.5px solid transparent", whiteSpace: "nowrap" };
  if (kind === "primary") return { ...base, background: "#0d9488", color: "#fff" };
  if (kind === "secondary") return { ...base, background: "#fff", color: "#0f172a", borderColor: "#e2e8f0" };
  if (kind === "link") return { ...base, padding: 0, border: "none", background: "none", color: "#0d9488", fontSize: 13 };
  return { ...base, background: "#f1f5f9", color: "#94a3b8", borderColor: "#e2e8f0", cursor: "not-allowed" };
}
