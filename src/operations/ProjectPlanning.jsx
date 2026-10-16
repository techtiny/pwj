import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Plus, Save, Trash2, Download, X, Search, ClipboardList } from "lucide-react";
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
const fmtDate = (d) => d ? new Date(toUtc(d)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "";

const EMPTY_HEADER = { woNumber: "", startDate: "", completionDate: "", spocClient: "", spocContact: "", happizoRepresentative: "" };
const ROW_FIELDS = [
  "boqNo", "boqDescription", "description", "dependency",
  "dependencyTargetDate", "materialDeliveryDate", "durationDays",
  "plannedStart", "plannedFinish", "actualStart", "actualFinish", "status",
];
const OTHER_GROUP = "__other__";
const DEPENDENCIES = ["Architect", "Consultant", "Client"];

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

  const removeRow = (key) => { setRows(rs => rs.filter(r => r.key !== key)); touch(); };

  // ── Grouping: one block per BOQ item, in the order the items first appear ──
  const groups = useMemo(() => {
    const order = [];
    const map = new Map();
    rows.forEach(r => {
      const g = r.boqNo ? r.boqNo : OTHER_GROUP;
      if (!map.has(g)) { map.set(g, []); order.push(g); }
      map.get(g).push(r);
    });
    // Activities not tied to a BOQ item always sit at the bottom.
    const sorted = order.filter(g => g !== OTHER_GROUP);
    if (map.has(OTHER_GROUP)) sorted.push(OTHER_GROUP);
    return sorted.map(g => ({ id: g, rows: map.get(g) }));
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
        const groupId = item ? item.label : "";
        let lastIdx = -1;
        next.forEach((r, i) => { if ((r.boqNo || "") === (groupId || "")) lastIdx = i; });
        if (lastIdx >= 0) next.splice(lastIdx + 1, 0, row);
        else if (item) {
          const otherIdx = next.findIndex(r => !r.boqNo);
          if (otherIdx >= 0) next.splice(otherIdx, 0, row); else next.push(row);
        } else next.push(row);
      });
      return next;
    });
    touch();
  };

  const addRowToGroup = (groupId) => {
    if (groupId === OTHER_GROUP) { addRowsForItems([null]); return; }
    const existing = rows.find(r => r.boqNo === groupId);
    addRowsForItems([boqByLabel.get(groupId) || { label: groupId, description: existing?.boqDescription || "" }]);
  };

  // ── Header metrics ──
  const today = todayStr();
  const daysRemaining = header.completionDate ? Math.round((toUtc(header.completionDate) - toUtc(today)) / DAY_MS) : null;
  const completedCount = rows.filter(r => r.status === "COMPLETED").length;
  const pct = rows.length ? Math.round((completedCount / rows.length) * 100) : 0;
  const overdueCount = rows.filter(r => r.plannedFinish && r.plannedFinish < today && r.status !== "COMPLETED").length;

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

  const exportExcel = () => {
    const H = [
      ["Project Name", project.name, "", "Project WO number", header.woNumber, "", "Happizo representative", header.happizoRepresentative],
      ["Project start date", fmtDate(header.startDate), "", "Project SPOC Client", header.spocClient, "", "No of days remaining", daysRemaining ?? ""],
      ["Project completion date", fmtDate(header.completionDate), "", "Project SPOC Contact number", header.spocContact, "", "Over all project % in completion", `${pct}%`],
      [],
      ["BOQ No", "Sl No", "Description of works", "Dependency", "Dependency target date", "Material delivery date", "Activity duration", "Planned date", "", "Actual", "", "Status", ""],
      ["", "", "", "", "", "", "", "Start date", "Finish date", "Started date", "Finished date", "Completed", "Not completed"],
    ];
    groups.forEach(g => g.rows.forEach(r => H.push([
      r.boqNo, serialByKey[r.key], r.description, r.dependency,
      fmtDate(r.dependencyTargetDate), fmtDate(r.materialDeliveryDate), r.durationDays,
      fmtDate(r.plannedStart), fmtDate(r.plannedFinish), fmtDate(r.actualStart), fmtDate(r.actualFinish),
      r.status === "COMPLETED" ? "✓" : "", r.status === "NOT_COMPLETED" ? "✓" : "",
    ])));
    const ws = XLSX.utils.aoa_to_sheet(H);
    const m = (r1, c1, r2, c2) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    ws["!merges"] = [
      m(4, 0, 5, 0), m(4, 1, 5, 1), m(4, 2, 5, 2), m(4, 3, 5, 3), m(4, 4, 5, 4), m(4, 5, 5, 5), m(4, 6, 5, 6),
      m(4, 7, 4, 8), m(4, 9, 4, 10), m(4, 11, 4, 12),
    ];
    ws["!cols"] = [10, 7, 36, 14, 16, 16, 10, 13, 13, 13, 13, 11, 13].map(w => ({ wch: w }));
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px 24px" }}>
          <Field label="Project Name"><div style={{ ...roSt, fontWeight: 700 }}>{project.name}</div></Field>
          <Field label="Project WO number"><input style={inpSt} value={header.woNumber} onChange={e => setH("woNumber", e.target.value)} placeholder="e.g. WO/2026/014" /></Field>
          <Field label="Happizo representative"><input style={inpSt} value={header.happizoRepresentative} onChange={e => setH("happizoRepresentative", e.target.value)} /></Field>

          <Field label="Project start date"><input type="date" style={inpSt} value={header.startDate} onChange={e => setH("startDate", e.target.value)} /></Field>
          <Field label="Project SPOC Client"><input style={inpSt} value={header.spocClient} onChange={e => setH("spocClient", e.target.value)} /></Field>
          <Field label="No of days remaining">
            <div style={{ ...roSt, fontWeight: 700, color: daysRemaining == null ? "#94a3b8" : daysRemaining < 0 ? "#b91c1c" : daysRemaining <= 7 ? "#b45309" : "#0f172a" }}>
              {daysRemaining == null ? "Set a completion date"
                : daysRemaining < 0 ? `Overdue by ${-daysRemaining} day${daysRemaining === -1 ? "" : "s"}`
                : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
            </div>
          </Field>

          <Field label="Project completion date"><input type="date" style={inpSt} value={header.completionDate} min={header.startDate || undefined} onChange={e => setH("completionDate", e.target.value)} /></Field>
          <Field label="Project SPOC Contact number"><input type="tel" style={inpSt} value={header.spocContact} onChange={e => setH("spocContact", e.target.value)} /></Field>
          <Field label="Overall project % in completion">
            <div style={{ ...roSt, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 8, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#0d9488" }} />
              </div>
              <span style={{ fontWeight: 700, color: "#0f172a", minWidth: 40, textAlign: "right" }}>{pct}%</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {completedCount} of {rows.length} activit{rows.length === 1 ? "y" : "ies"} completed
              {overdueCount > 0 && <span style={{ color: "#b91c1c", fontWeight: 600 }}> · {overdueCount} past planned finish</span>}
            </div>
          </Field>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setPickerOpen(true)} disabled={!hasBoq || boqLoading} style={btn(!hasBoq || boqLoading ? "disabled" : "secondary")}
          title={!hasBoq ? "Upload this project's BOQ in the BOQ Import tab first" : undefined}>
          <ClipboardList size={15} /> Add from BOQ
        </button>
        <button onClick={() => addRowsForItems([null])} style={btn("secondary")}>
          <Plus size={15} /> Activity without BOQ item
        </button>
        <button onClick={exportExcel} disabled={!rows.length} style={btn(rows.length ? "secondary" : "disabled")}>
          <Download size={15} /> Export Excel
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
          <button onClick={onGoToBoq} style={{ border: "none", background: "none", padding: 0, color: "#0d9488", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5 }}>Upload it in BOQ Import</button>
        </div>
      )}

      {/* ── Schedule table ── */}
      {rows.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>No activities scheduled yet</div>
          <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 4 }}>
            Use <b>Add from BOQ</b> to pick BOQ items, then add as many activities under each item as you need.
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1460, width: "100%" }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...th, width: 70 }}>BOQ No</th>
                <th rowSpan={2} style={{ ...th, width: 50 }}>Sl No</th>
                <th rowSpan={2} style={{ ...th, minWidth: 220 }}>Description of works</th>
                <th rowSpan={2} style={{ ...th, width: 130 }}>Dependency</th>
                <th rowSpan={2} style={th}>Dependency target date</th>
                <th rowSpan={2} style={th}>Material delivery date</th>
                <th rowSpan={2} style={{ ...th, width: 80 }}>Activity duration (days)</th>
                <th colSpan={2} style={th}>Planned date</th>
                <th colSpan={2} style={th}>Actual</th>
                <th colSpan={2} style={th}>Status</th>
                <th rowSpan={2} style={{ ...th, width: 40 }} aria-label="Remove" />
              </tr>
              <tr>
                <th style={th2}>Start date</th>
                <th style={th2}>Finish date</th>
                <th style={th2}>Started date</th>
                <th style={th2}>Finished date</th>
                <th style={th2}>Completed</th>
                <th style={th2}>Not completed</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const isOther = g.id === OTHER_GROUP;
                const boqDesc = isOther ? "" : (boqByLabel.get(g.id)?.description || g.rows[0]?.boqDescription || "");
                const boq = boqByLabel.get(g.id);
                return [
                  <tr key={`g-${g.id}`} style={{ background: "#f0fdfa" }}>
                    <td colSpan={14} style={{ padding: "8px 12px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #ccfbf1" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#0f766e", whiteSpace: "nowrap" }}>
                          {isOther ? "Other activities" : `BOQ ${g.id}`}
                        </span>
                        <span title={boqDesc} style={{ fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 760 }}>
                          {isOther ? "Not linked to a BOQ item" : firstLine(boqDesc) || "—"}
                        </span>
                        {boq?.qty != null && <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{boq.qty} {boq.unit}</span>}
                        <button onClick={() => addRowToGroup(g.id)} style={{ ...btn("link"), marginLeft: "auto" }}>
                          <Plus size={14} /> Add activity
                        </button>
                      </div>
                    </td>
                  </tr>,
                  ...g.rows.map(r => {
                    const overdue = r.plannedFinish && r.plannedFinish < today && r.status !== "COMPLETED";
                    const datesBad = r.plannedStart && r.plannedFinish && r.plannedFinish < r.plannedStart;
                    return (
                      <tr key={r.key} style={{ background: r.status === "COMPLETED" ? "#f0fdf4" : undefined }}>
                        <td style={{ ...td, color: "#475569", fontWeight: 600 }}>{r.boqNo || "—"}</td>
                        <td style={{ ...td, textAlign: "center" }}>{serialByKey[r.key]}</td>
                        <td style={td}><input style={{ ...cellInp, minWidth: 200 }} value={r.description} placeholder="e.g. Gypsum framework" onChange={e => updateRow(r.key, "description", e.target.value)} /></td>
                        <td style={td}>
                          <select style={{ ...cellInp, width: 120, color: r.dependency ? "#0f172a" : "#94a3b8" }} value={r.dependency || ""}
                            onChange={e => updateRow(r.key, "dependency", e.target.value)}>
                            <option value="">None</option>
                            {DEPENDENCIES.map(d => <option key={d} value={d} style={{ color: "#0f172a" }}>{d}</option>)}
                          </select>
                        </td>
                        <td style={td}><DateCell value={r.dependencyTargetDate} onChange={v => updateRow(r.key, "dependencyTargetDate", v)} /></td>
                        <td style={td}><DateCell value={r.materialDeliveryDate} onChange={v => updateRow(r.key, "materialDeliveryDate", v)} /></td>
                        <td style={td}><input type="number" min={1} style={{ ...cellInp, width: 70 }} value={r.durationDays} onChange={e => updateRow(r.key, "durationDays", e.target.value)} /></td>
                        <td style={td}><DateCell value={r.plannedStart} onChange={v => updateRow(r.key, "plannedStart", v)} /></td>
                        <td style={td}>
                          <DateCell value={r.plannedFinish} min={r.plannedStart} warn={overdue || datesBad} onChange={v => updateRow(r.key, "plannedFinish", v)}
                            title={datesBad ? "Finish is before start" : overdue ? "Past planned finish and not completed" : undefined} />
                        </td>
                        <td style={td}><DateCell value={r.actualStart} onChange={v => updateRow(r.key, "actualStart", v)} /></td>
                        <td style={td}><DateCell value={r.actualFinish} min={r.actualStart} onChange={v => updateRow(r.key, "actualFinish", v)} /></td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <input type="checkbox" aria-label="Completed" checked={r.status === "COMPLETED"} style={chk}
                            onChange={e => updateRow(r.key, "status", e.target.checked ? "COMPLETED" : "")} />
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <input type="checkbox" aria-label="Not completed" checked={r.status === "NOT_COMPLETED"} style={chk}
                            onChange={e => updateRow(r.key, "status", e.target.checked ? "NOT_COMPLETED" : "")} />
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
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

      {pickerOpen && (
        <BoqPicker
          items={boqItems || []}
          countByLabel={groups.reduce((m, g) => (g.id !== OTHER_GROUP ? { ...m, [g.id]: g.rows.length } : m), {})}
          onClose={() => setPickerOpen(false)}
          onAdd={(items) => { addRowsForItems(items); setPickerOpen(false); }}
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
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Add activities from BOQ"
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

function DateCell({ value, onChange, min, warn, title }) {
  return (
    <input type="date" value={value || ""} min={min || undefined} title={title} onChange={e => onChange(e.target.value)}
      style={{ ...cellInp, width: 128, ...(warn ? { borderColor: "#fca5a5", background: "#fef2f2", color: "#b91c1c" } : {}) }} />
  );
}

// ── Styles ──
const inpSt = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff", color: "#0f172a" };
const roSt = { padding: "8px 0", fontSize: 14, color: "#0f172a" };
const th = { padding: "8px 8px", fontSize: 12, fontWeight: 700, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", textAlign: "center", whiteSpace: "normal" };
const th2 = { ...th, fontWeight: 600, background: "#f1f5f9" };
const td = { padding: "4px 6px", borderBottom: "1px solid #f1f5f9", fontSize: 13, color: "#0f172a", verticalAlign: "middle" };
const cellInp = { width: "100%", minWidth: 90, boxSizing: "border-box", padding: "5px 7px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#0f172a" };
const chk = { width: 16, height: 16, accentColor: "#0d9488", cursor: "pointer" };

function btn(kind) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "8px 14px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: "1.5px solid transparent", whiteSpace: "nowrap" };
  if (kind === "primary") return { ...base, background: "#0d9488", color: "#fff" };
  if (kind === "secondary") return { ...base, background: "#fff", color: "#0f172a", borderColor: "#e2e8f0" };
  if (kind === "link") return { ...base, padding: 0, border: "none", background: "none", color: "#0d9488", fontSize: 13 };
  return { ...base, background: "#f1f5f9", color: "#94a3b8", borderColor: "#e2e8f0", cursor: "not-allowed" };
}
