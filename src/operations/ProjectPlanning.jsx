import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Plus, Save, Trash2, Download, X, Search, ClipboardList, ChevronDown, ListPlus, Printer, AlertTriangle, History } from "lucide-react";
import { getProjectSchedule, saveProjectSchedule, getScheduleRevisions, getScheduleRevision, issueScheduleRevision, restoreScheduleRevision } from "./operationsApi";

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

const EMPTY_HEADER = { woNumber: "", startDate: "", completionDate: "", spocClient: "", spocContact: "", happizoRepresentative: "", floorName: "", roomCount: "", revision: "" };
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


// ── Schedule chart (Gantt) ─────────────────────────────────────────────────────
// A day-by-day bar chart of the saved schedule in the same layout as the Happizo planning sheets:
// Sl No · Description · Materials Delivery · Duration · Start · Finish · Remarks, then Day 1…Day N
// columns with the planned period shaded. Days are counted from the project start date.
function buildChart(header, activities) {
  const list = (activities || []).filter(a => (a.description || "").trim() || a.plannedStart);
  const starts = list.map(a => a.plannedStart).filter(Boolean).sort();
  // Day 1 is the project start date — or the earliest planned start if some activity begins before it.
  const base = [header?.startDate, starts[0]].filter(Boolean).sort()[0] || null;
  const dayOf = (d) => (base && d ? Math.round((toUtc(d) - toUtc(base)) / DAY_MS) + 1 : null);
  const rows = list.map((a, i) => {
    const sd = dayOf(a.plannedStart), fd = dayOf(a.plannedFinish);
    const md = dayOf(a.materialDeliveryDate);
    return {
      no: i + 1, description: a.description || "", remarks: a.remarks || "",
      material: md != null ? `Day ${md}` : "NA",
      duration: a.durationDays != null && a.durationDays !== "" ? a.durationDays : (sd != null && fd != null ? fd - sd + 1 : "NA"),
      startDay: sd, finishDay: fd,
      start: sd != null ? `Day ${sd}` : "NA", finish: fd != null ? `Day ${fd}` : "NA",
      state: rowState(a, todayStr()),
    };
  });
  const maxFinish = Math.max(0, ...rows.map(r => r.finishDay || 0));
  const endDay = header?.completionDate ? dayOf(header.completionDate) : null;
  const days = Math.min(180, Math.max(14, maxFinish, endDay || 0));
  const todayDay = dayOf(todayStr());
  return { rows, days, base, todayDay };
}


// ── Revisions (Rev 0, Rev 1, …) — shared by Project Planning and the Schedule Chart ──
function useScheduleRevisions(projectId, viewRev) {
  const [revisions, setRevisions] = useState([]);
  const [snap, setSnap] = useState(null);
  const reload = () => getScheduleRevisions(projectId).then(setRevisions).catch(() => setRevisions([]));
  useEffect(() => { reload(); }, [projectId]);
  useEffect(() => {
    if (viewRev === "") { setSnap(null); return; }
    let live = true;
    setSnap(null);
    getScheduleRevision(projectId, viewRev).then(d => { if (live) setSnap(d); }).catch(() => { if (live) setSnap(null); });
    return () => { live = false; };
  }, [projectId, viewRev]);
  const viewing = viewRev !== "" && snap ? (revisions.find(r => String(r.revisionNo) === String(viewRev)) || null) : null;
  const latestRev = revisions.length ? Math.max(...revisions.map(r => r.revisionNo)) : null;
  return { revisions, reload, snap, viewing, latestRev };
}

// Confirms, then makes the working schedule a copy of that revision. Returns true when it happened.
async function goBackToRevision(projectId, no, who) {
  if (!window.confirm(`Go back to Rev ${no}?\n\nThe working schedule in Project Planning will be replaced by a copy of Rev ${no}. Any changes made since the last issued revision are lost; issued revisions are never deleted.`)) return false;
  try { await restoreScheduleRevision(projectId, no, who); return true; }
  catch (e) { alert(e.response?.data?.message || "Could not restore this revision"); return false; }
}

function RevisionStrip({ revisions, viewRev, setViewRev, currentSub }) {
  const btn = (on, color) => ({ flex: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderRadius: 10, padding: "8px 14px", minWidth: 120,
    border: `1.5px solid ${on ? color : "#e2e8f0"}`, background: on ? color : "#fff", color: on ? "#fff" : "#0f172a" });
  return (
    <div role="tablist" aria-label="Schedule revisions" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 12 }}>
      {[...revisions].sort((a, b) => a.revisionNo - b.revisionNo).map(r => {
        const on = String(viewRev) === String(r.revisionNo);
        return (
          <button key={r.revisionNo} role="tab" aria-selected={on} onClick={() => setViewRev(String(r.revisionNo))} title={r.note || "Issued revision"} style={btn(on, "#1e3a5f")}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Rev {r.revisionNo}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{r.createdAt ? fmtDate(String(r.createdAt).slice(0, 10)) : ""}{r.createdBy ? ` · ${r.createdBy}` : ""}</div>
          </button>
        );
      })}
      <button role="tab" aria-selected={viewRev === ""} onClick={() => setViewRev("")} style={{ ...btn(viewRev === "", "#0d9488"), minWidth: 140 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Current</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{currentSub}</div>
      </button>
    </div>
  );
}

function RevisionBanner({ rev, onGoBack, busy }) {
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 14px", fontSize: 13.5, color: "#92400e", marginBottom: 10 }}>
      Viewing <b>Rev {rev.revisionNo}</b> — issued {rev.createdAt ? fmtDate(String(rev.createdAt).slice(0, 10)) : ""}{rev.createdBy ? ` by ${rev.createdBy}` : ""}{rev.note ? ` · “${rev.note}”` : ""}. This is a frozen copy; it doesn't change when the schedule is edited.
      <button onClick={onGoBack} disabled={busy}
        style={{ marginLeft: 12, border: "1.5px solid #b45309", background: "#fff", color: "#b45309", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        {busy ? "Restoring…" : `↩ Go back to Rev ${rev.revisionNo}`}
      </button>
    </div>
  );
}

// Read-only copy of the Project Planning table, for a frozen revision.
function RevisionPlanTable({ snap }) {
  const today = todayStr();
  const rows = (snap?.activities || []).map(fromServerRow);
  const th = { padding: "9px 6px", fontSize: 13, fontWeight: 700, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", textAlign: "center" };
  const td = { padding: "7px 6px", fontSize: 13.5, color: "#0f172a", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", overflowWrap: "anywhere" };
  const c = { ...td, textAlign: "center" };
  const status = (r) => { const st = rowState(r, today); return st === "DONE" || st === "LATE" ? ["Completed", STATE_COLORS[st]] : st === "OVERDUE" ? ["Not Completed", STATE_COLORS.OVERDUE] : ["", ""]; };
  const info = [["WO number", snap?.woNumber], ["Start", fmtDate(snap?.startDate)], ["Completion", fmtDate(snap?.completionDate)], ["Representative", snap?.happizoRepresentative]];
  return (
    <div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 16px", marginBottom: 12, fontSize: 13.5 }}>
        {info.map(([k, v]) => <div key={k}><span style={{ color: "#64748b" }}>{k}: </span><b style={{ color: "#0f172a" }}>{v || "—"}</b></div>)}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1520, tableLayout: "fixed" }}>
          <colgroup>{[50, 56, 190, 110, 84, 84, 60, 84, 84, 70, 84, 84, 84, 84, 110, 160].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr>
              {["BOQ No", "Activity No", "Description of Activity", "Dependency By", "Dependency Start Date", "Dependency Target Date", "Material Lead Days", "Material Lead Date", "Material Delivery Date", "Activity Duration (Days)", "Start Date", "Finish Date", "Started Date", "Finished Date", "Status", "Remarks"].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={16} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 24 }}>No activities in this revision.</td></tr> : rows.map((r, i) => {
              const [label, color] = status(r);
              return (
                <tr key={r.key}>
                  <td style={c}>{r.boqNo || "—"}</td><td style={c}>{i + 1}</td><td style={td}>{r.description}</td><td style={c}>{r.dependency}</td>
                  <td style={c}>{fmtDate(r.dependencyStartDate)}</td><td style={c}>{fmtDate(r.dependencyTargetDate)}</td>
                  <td style={c}>{r.materialLeadDays}</td><td style={c}>{fmtDate(r.materialLeadDate)}</td><td style={c}>{fmtDate(r.materialDeliveryDate)}</td><td style={c}>{r.durationDays}</td>
                  <td style={c}>{fmtDate(r.plannedStart)}</td><td style={c}>{fmtDate(r.plannedFinish)}</td><td style={c}>{fmtDate(r.actualStart)}</td><td style={c}>{fmtDate(r.actualFinish)}</td>
                  <td style={{ ...c, fontWeight: 700, color }}>{label}</td><td style={td}>{r.remarks}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScheduleChart({ project, user, viewRev, setViewRev }) {
  const [state, setState] = useState({ loading: true, error: "", header: null, activities: [] });
  const { revisions, snap: revSnap, viewing: viewingRevHook } = useScheduleRevisions(project.id, viewRev);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: "" }));
    getProjectSchedule(project.id)
      .then(sch => { if (live) setState({ loading: false, error: "", header: sch || {}, activities: sch?.activities || [] }); })
      .catch(() => { if (live) setState({ loading: false, error: "Couldn't load this project's schedule.", header: null, activities: [] }); });
    return () => { live = false; };
  }, [project.id]);

  const restoreRev = async (no) => {
    setRestoring(true);
    if (await goBackToRevision(project.id, no, user?.fullName || user?.username)) {
      const sch = await getProjectSchedule(project.id);
      setState({ loading: false, error: "", header: sch || {}, activities: sch?.activities || [] });
      setViewRev("");
    }
    setRestoring(false);
  };

  const viewingRev = viewingRevHook;
  const header = viewingRev ? revSnap : state.header;
  const activities = viewingRev ? (revSnap.activities || []) : state.activities;
  const chart = useMemo(() => buildChart(header, activities), [header, activities]);
  const { rows, days, base, todayDay } = chart;

  const printChart = () => {
    const dw = Math.max(10, Math.min(18, Math.floor(900 / days)));
    const c = "border:1px solid #bbb;padding:2px 4px;font-size:8.5px;vertical-align:middle;";
    const h = "border:1px solid #888;padding:3px 4px;font-size:8.5px;font-weight:700;background:#f2f2f2;text-align:center;";
    const dayHead = Array.from({ length: days }, (_, i) => `<th style="${h}width:${dw}px;padding:2px 0;"><div style="writing-mode:vertical-rl;transform:rotate(180deg);margin:auto;font-size:7.5px;">Day ${i + 1}</div></th>`).join("");
    const bodyRows = rows.map(r => {
      const cells = Array.from({ length: days }, (_, i) => {
        const d = i + 1, on = r.startDay != null && r.finishDay != null && d >= r.startDay && d <= r.finishDay;
        return `<td style="border:1px solid #ddd;${on ? "background:#c9ccd1;" : ""}"></td>`;
      }).join("");
      return `<tr style="height:20px"><td style="${c}text-align:center;">${r.no}</td><td style="${c}">${esc(r.description)}</td><td style="${c}text-align:center;">${esc(r.material)}</td><td style="${c}text-align:center;">${esc(r.duration)}</td><td style="${c}text-align:center;">${esc(r.start)}</td><td style="${c}text-align:center;">${esc(r.finish)}</td><td style="${c}">${esc(r.remarks)}</td>${cells}</tr>`;
    }).join("");
    const info = [["Project Name", project.name], ["Date", fmtDate(todayStr())], ["Revision", header?.revision != null && header.revision !== "" ? `Rev ${header.revision}` : "—"]];
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Schedule - ${esc(project.name)}</title>
      <style>@page{size:A3 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;margin:0}table{border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>
      <table style="width:100%;margin-bottom:6px"><tr>
        <td style="width:25%"><img src="${window.location.origin}/happizo-logo.png" alt="Happizo" style="width:110px;height:auto" /></td>
        <td style="text-align:center;font-weight:700;font-size:13px">${esc(project.name)} — Schedule</td>
        <td style="width:25%;text-align:right;font-size:9px;line-height:1.4"><b>${esc(COMPANY.name)}</b><br/>${esc(COMPANY.addr1)}<br/>${esc(COMPANY.addr2)}</td></tr></table>
      <table style="margin-bottom:6px">${info.map(([k, v]) => `<tr><td style="font-size:9px;font-weight:700;padding:1px 14px 1px 0">${esc(k)}</td><td style="font-size:9px;padding:1px 0">${esc(v || "")}</td></tr>`).join("")}</table>
      <table style="width:100%;table-layout:fixed">
        <colgroup><col style="width:28px"><col style="width:210px"><col style="width:62px"><col style="width:46px"><col style="width:46px"><col style="width:46px"><col style="width:150px">${Array.from({ length: days }, () => `<col style="width:${dw}px">`).join("")}</colgroup>
        <thead><tr>
          <th style="${h}">Sl.No</th><th style="${h}">Description of works</th><th style="${h}">Materials Delivery Date</th><th style="${h}">Duration</th><th style="${h}">Start date</th><th style="${h}">Finish date</th><th style="${h}">Remarks</th>${dayHead}
        </tr></thead>
        <tbody><tr><td colspan="${7 + days}" style="${c}font-weight:700;background:#fafafa">Execution Phase</td></tr>${bodyRows}</tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script></body></html>`;
    const win = window.open("about:blank", "_blank", "width=1400,height=900");
    if (!win) { alert("Allow pop-ups to print the schedule."); return; }
    win.document.write(html);
    win.document.close();
  };

  if (state.loading) return <div style={{ padding: 20, color: "#64748b" }}>Loading schedule chart…</div>;
  if (state.error) return <div style={{ padding: 20, color: "#b91c1c" }}>{state.error}</div>;

  const colW = 30;
  const th = { border: "1px solid #cbd5e1", background: "#f1f5f9", padding: "6px 6px", fontSize: 12.5, fontWeight: 700, color: "#334155", textAlign: "center" };
  const td = { border: "1px solid #e2e8f0", padding: "5px 6px", fontSize: 13.5, color: "#0f172a" };
  const info = [["Project Name", project.name], ["Date", fmtDate(todayStr())], ["Revision", header?.revision != null && header.revision !== "" ? `Rev ${header.revision}` : "—"]];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Schedule chart</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            Day-by-day view of the saved Project Planning schedule{base ? ` — Day 1 = ${fmtDate(base)}` : " — set the project start date in Project Planning"}.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={printChart} disabled={!rows.length} style={btn(rows.length ? "secondary" : "disabled")}><Printer size={15} /> Print PDF (A3)</button>
        </div>
      </div>
      <RevisionStrip revisions={revisions} viewRev={viewRev} setViewRev={setViewRev}
        currentSub={state.header?.revision != null && state.header.revision !== "" ? `working copy · based on Rev ${state.header.revision}` : "working copy · not issued"} />
      {viewingRev && <RevisionBanner rev={viewingRev} onGoBack={() => restoreRev(viewingRev.revisionNo)} busy={restoring} />}
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 16px", marginBottom: 12, fontSize: 13.5 }}>
        {info.map(([k, v]) => <div key={k}><span style={{ color: "#64748b" }}>{k}: </span><b style={{ color: "#0f172a" }}>{v}</b></div>)}
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, color: "#64748b" }}>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#c9ccd1", border: "1px solid #aaa", verticalAlign: "-2px" }} /> Planned</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#fecaca", border: "1px solid #f87171", verticalAlign: "-2px" }} /> Today</span>
        </div>
      </div>
      {!rows.length ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 28, textAlign: "center", color: "#64748b" }}>No activities scheduled yet — add them in the <b>Project Planning</b> tab.</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: 720 + days * colW }}>
            <colgroup>
              <col style={{ width: 44 }} /><col style={{ width: 250 }} /><col style={{ width: 96 }} /><col style={{ width: 70 }} /><col style={{ width: 76 }} /><col style={{ width: 76 }} /><col style={{ width: 180 }} />
              {Array.from({ length: days }, (_, i) => <col key={i} style={{ width: colW }} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Sl.No</th><th style={th}>Description of works</th><th style={th}>Materials Delivery Date</th><th style={th}>Duration</th><th style={th}>Start date</th><th style={th}>Finish date</th><th style={th}>Remarks</th>
                {Array.from({ length: days }, (_, i) => (
                  <th key={i} style={{ ...th, padding: "4px 0", fontSize: 11, background: todayDay === i + 1 ? "#fecaca" : th.background }}>Day<br />{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={7 + days} style={{ ...td, fontWeight: 700, background: "#fafafa" }}>Execution Phase</td></tr>
              {rows.map(r => (
                <tr key={r.no}>
                  <td style={{ ...td, textAlign: "center" }}>{r.no}</td>
                  <td style={{ ...td, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.description}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.material}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.duration}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.start}</td>
                  <td style={{ ...td, textAlign: "center" }}>{r.finish}</td>
                  <td style={{ ...td, fontSize: 12.5, color: "#475569", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.remarks}</td>
                  {Array.from({ length: days }, (_, i) => {
                    const d = i + 1, on = r.startDay != null && r.finishDay != null && d >= r.startDay && d <= r.finishDay;
                    return <td key={i} style={{ border: "1px solid #eef2f6", background: on ? "#c9ccd1" : todayDay === d ? "#fff1f2" : undefined, padding: 0 }} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

// A schedule row can cover several BOQ items clubbed together — its BOQ No is then "2, 2a, 2b".
const boqLabelsOf = (boqNo) => String(boqNo || "").split(",").map(x => x.trim()).filter(Boolean);

const firstLine = (s) => (s || "").split("\n")[0];

/**
 * Operations → Project Planning: the project schedule sheet. A header block
 * (WO number, dates, SPOC, Happizo representative, days remaining, overall %)
 * and activity rows grouped under BOQ line items. One BOQ item can have any
 * number of activity rows.
 */
export default function ProjectPlanning({ project, user, boqItems, boqLoading, hasBoq, onGoToBoq, onDirtyChange, viewRev = "", setViewRev = () => {} }) {
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
  const { revisions, reload: reloadRevs, snap: revSnap, viewing: viewingRev, latestRev } = useScheduleRevisions(project.id, viewRev);
  const [restoringRev, setRestoringRev] = useState(false);
  const [revModal, setRevModal] = useState(false);
  const [revNote, setRevNote] = useState("");
  const [revBusy, setRevBusy] = useState(false);
  const [revError, setRevError] = useState("");
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

  const nextRevLabel = latestRev == null ? "Rev 0" : `Rev ${latestRev + 1}`;

  // Freeze the saved schedule as the next revision (Rev 0 first). Needs the schedule saved, so the
  // issued copy matches exactly what's on screen.
  const issueRevision = async () => {
    setRevBusy(true); setRevError("");
    try {
      await issueScheduleRevision(project.id, { note: revNote, createdBy: user?.fullName || user?.username });
      const fresh = await getProjectSchedule(project.id);
      applyServer(fresh);
      reloadRevs();
      setRevModal(false); setRevNote("");
    } catch (e) { setRevError(e.response?.data?.message || "Could not issue the revision"); }
    finally { setRevBusy(false); }
  };

  // Go back to an earlier revision: the working schedule becomes a copy of it.
  const restoreRev = async (no) => {
    setRestoringRev(true);
    if (await goBackToRevision(project.id, no, user?.fullName || user?.username)) {
      const fresh = await getProjectSchedule(project.id);
      applyServer(fresh);
      setViewRev("");
      reloadRevs();
    }
    setRestoringRev(false);
  };

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
      floorName: s?.floorName || "", roomCount: s?.roomCount || "", revision: s?.revision || "",
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
  const plannedLabels = new Set(rows.flatMap(r => boqLabelsOf(r.boqNo)));
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

  const revStrip = (
    <RevisionStrip revisions={revisions} viewRev={viewRev} setViewRev={setViewRev}
      currentSub={header.revision !== "" ? `working copy · based on Rev ${header.revision}${dirty ? " · unsaved edits" : ""}` : `working copy · not issued${dirty ? " · unsaved edits" : ""}`} />
  );

  // Viewing an earlier revision: a read-only copy of the table, as it was when issued.
  if (viewRev !== "") {
    return (
      <div>
        {revStrip}
        {viewingRev && revSnap ? (
          <>
            <RevisionBanner rev={viewingRev} onGoBack={() => restoreRev(viewingRev.revisionNo)} busy={restoringRev} />
            <RevisionPlanTable snap={revSnap} />
          </>
        ) : <div style={{ padding: 20, color: "#64748b" }}>Loading revision…</div>}
      </div>
    );
  }

  return (
    <div>
      {revStrip}
      {/* ── Header block ── */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div className="pp-header-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px 24px" }}>
          <Field label="Project Name"><div style={{ ...roSt, fontWeight: 700 }}>{project.name}</div></Field>
          <Field label="Project WO number"><input style={inpSt} value={header.woNumber} onChange={e => setH("woNumber", e.target.value)} placeholder="e.g. WO/2026/014" /></Field>
          <Field label="Happizo representative"><input style={inpSt} value={header.happizoRepresentative} onChange={e => setH("happizoRepresentative", e.target.value)} /></Field>

          <Field label="Revision">
            <div style={{ ...roSt, fontWeight: 700, color: header.revision === "" ? "#94a3b8" : "#0f172a" }}>
              {header.revision === "" ? "Not issued yet" : `Rev ${header.revision}`}
            </div>
          </Field>

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
        <button onClick={() => { setRevError(""); setRevNote(""); setRevModal(true); }} disabled={!rows.length || dirty}
          title={dirty ? "Save the schedule first" : `Issue ${nextRevLabel} — freeze this schedule as ${latestRev == null ? "the first revision" : "a new revision"}`}
          style={btn(!rows.length || dirty ? "disabled" : "secondary")}>
          <History size={15} /> Issue {nextRevLabel}
        </button>
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
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflowX: "auto" }} className="pp-scroll">
          <table className="pp-table" style={{ borderCollapse: "collapse", width: "100%", minWidth: 1468, tableLayout: "fixed" }}>
            <colgroup><col style={{ width: 64 }} /><col style={{ width: 48 }} /><col style={{ width: 130 }} /><col style={{ width: 126 }} /><col style={{ width: 88 }} /><col style={{ width: 88 }} /><col style={{ width: 52 }} /><col style={{ width: 74 }} /><col style={{ width: 74 }} /><col style={{ width: 56 }} /><col style={{ width: 74 }} /><col style={{ width: 74 }} /><col style={{ width: 74 }} /><col style={{ width: 74 }} /><col style={{ width: 84 }} /><col style={{ width: 92 }} /><col style={{ width: 120 }} /><col style={{ width: 96 }} /></colgroup>
                        <thead>
              <tr>
                <th rowSpan={2} style={{ ...th }}>BOQ No</th>
                <th rowSpan={2} style={{ ...th }}>Activity No</th>
                <th rowSpan={2} style={{ ...th }}>Description of Activity</th>
                <th rowSpan={2} style={{ ...th }}>Dependency By</th>
                <th rowSpan={2} style={{ ...th }}>Dependency Start Date</th>
                <th rowSpan={2} style={{ ...th }}>Dependency Target Date</th>
                <th rowSpan={2} style={{ ...th }}>Material Lead Days</th>
                <th rowSpan={2} style={{ ...th }}>Material Lead Date</th>
                <th rowSpan={2} style={{ ...th }}>Material Delivery Date</th>
                <th rowSpan={2} style={{ ...th }}>Activity Duration (Days)</th>
                <th colSpan={2} style={th}>Planned date</th>
                <th colSpan={2} style={th}>Actual</th>
                <th colSpan={2} style={th}>Status</th>
                <th rowSpan={2} style={{ ...th }}>Remarks</th>
                <th rowSpan={2} style={{ ...th }} aria-label="Add / Insert / Remove" />
              </tr>
              <tr>
                <th style={{ ...th2 }}>Start Date</th>
                <th style={{ ...th2 }}>Finish Date</th>
                <th style={{ ...th2 }}>Started Date</th>
                <th style={{ ...th2 }}>Finished Date</th>
                <th style={{ ...th2 }}>Completed</th>
                <th style={{ ...th2 }}>Not Completed</th>
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
                          {boqLabelsOf(r.boqNo).length > 1 && (
                            <div title={`Clubbed BOQ items: ${r.boqNo}`} style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, marginBottom: 3, overflowWrap: "anywhere", color: "#0f766e" }}>{r.boqNo}</div>
                          )}
                          {hasBoq ? (
                            <select style={{ ...cellInp, padding: "5px 0", color: r.boqNo ? "#0f172a" : "#94a3b8" }} value={r.boqNo || ""}
                              title="Link this activity to a BOQ item"
                              onChange={e => linkRowToBoq(r.key, e.target.value)}>
                              <option value="">—</option>
                              {r.boqNo && !boqByLabel.has(r.boqNo) && <option value={r.boqNo}>{boqLabelsOf(r.boqNo).length > 1 ? `Clubbed (${boqLabelsOf(r.boqNo).length})` : r.boqNo}</option>}
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
                            <span style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.25, display: "inline-block", color: STATE_COLORS[state] }} title={state === "LATE" ? "Finished after the planned finish date" : "Finished on or before the planned finish date"}>Completed</span>
                          ) : (
                            <button onClick={() => updateRow(r.key, "actualFinish", todayStr())} title="Set actual finish to today"
                              style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, fontSize: 12.5, padding: "3px 6px", cursor: "pointer", color: "#475569", fontFamily: "inherit" }}>Mark done</button>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {state === "OVERDUE" && <span style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.25, display: "inline-block", color: STATE_COLORS.OVERDUE }} title="Planned finish date has passed without an actual finish">Not Completed</span>}
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

      {revModal && (
        <div onClick={() => !revBusy && setRevModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Issue schedule revision" className="pp-modal"
            style={{ background: "#fff", borderRadius: 14, width: 480, maxWidth: "100%", padding: 22, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Issue {nextRevLabel}</div>
            <div style={{ fontSize: 13.5, color: "#64748b", margin: "4px 0 14px" }}>
              Freezes the schedule as currently saved. You can open any issued revision later from the Schedule Chart tab, exactly as it was.
            </div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>{latestRev == null ? "Note (optional)" : "Reason for the revision *"}</label>
            <textarea value={revNote} onChange={e => setRevNote(e.target.value)} rows={3} maxLength={500} autoFocus
              placeholder={latestRev == null ? "e.g. Baseline schedule issued to client" : "e.g. Tile delivery delayed — toilet works moved by 5 days"}
              style={{ width: "100%", boxSizing: "border-box", marginTop: 6, border: "1.5px solid #cbd5e1", borderRadius: 10, padding: "10px 12px", fontSize: 14.5, fontFamily: "inherit", resize: "vertical" }} />
            {revError && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginTop: 10 }}>{revError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button onClick={() => setRevModal(false)} disabled={revBusy} style={btn("secondary")}>Cancel</button>
              <button onClick={issueRevision} disabled={revBusy || (latestRev != null && !revNote.trim())} style={btn(revBusy || (latestRev != null && !revNote.trim()) ? "disabled" : "primary")}>
                {revBusy ? "Issuing…" : "Issue revision"}
              </button>
            </div>
          </div>
        </div>
      )}

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
          countByLabel={groups.reduce((m, g) => { boqLabelsOf(g.boqNo).forEach(l => { m[l] = (m[l] || 0) + g.rows.length; }); return m; }, {})}
          onClose={() => { setPickerOpen(false); setInsertAtKey(null); }}
          onAdd={(picked) => {
            // Several BOQ items picked together become ONE schedule entry that covers all of them.
            const items = picked.length > 1
              ? [{ label: picked.map(i => i.label).join(", "), description: picked.map(i => `${i.label}. ${firstLine(i.description)}`).join("\n") }]
              : picked;
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
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 6 }}>Pick one item for its own activity row, or several to club them into a single schedule entry (e.g. “2, 2a, 2b”). You can add more rows afterwards.</div>
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
      fontSize: 12.5, lineHeight: 1.3 }}>
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
const th = { padding: "10px 4px", fontSize: 15.5, fontWeight: 700, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", textAlign: "center", whiteSpace: "normal" };
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
