import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { salaryApi, fmtDate, downloadPayslip } from "./hrApi";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Payroll cycle: 26th of the previous month through the 25th of the selected month
// (e.g. selecting September means the Aug 26 – Sep 25 cycle).
function cycleLabel(year, month) {
  const end = new Date(year, month - 1, 25);
  const start = new Date(year, month - 2, 26);
  const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  return `${fmt(start)} – ${fmt(end)}`;
}
const inr = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// Salary sheet columns. `x` marks the extra columns that stay hidden (and out of the printout)
// until "Show all columns" is turned on — the default view is the compact payroll sheet.
const SHEET_COLS = [
  { k: "sno", l: "S.No", f: (r, i) => i + 1 },
  { k: "employeeNumber", l: "Person Code", x: true, left: true, f: (r) => r.employeeNumber || "—" },
  { k: "name", l: "Name", left: true, bold: true },
  { k: "designation", l: "Designation", left: true, wrap: true },
  { k: "daysInMonth", l: "No. of Days in a month", lines: ["No. Of", "Days", "In a", "Month"], tip: "Actual day count of the 26th–25th payroll cycle" },
  { k: "leaveDays", l: "Leave Days", x: true },
  { k: "freeCasualLeave", l: "Free CL", x: true },
  { k: "unauthorizedDays", l: "Unauthorized", x: true, tip: "Mon-Sat, no check-in (or check-in with no check-out), no leave applied, not a holiday — 1.5 LOP days each, no free CL" },
  { k: "lopDays", l: "LOP Days", x: true },
  { k: "extraWorkingDays", l: "Extra WD", x: true },
  { k: "workingDays", l: "Working Days", lines: ["Working", "days"], bold: true },
  { k: "fixedGross", l: "Fixed Gross", x: true, money: true, total: true },
  { k: "fixedBasic", l: "Fixed Basic", x: true, money: true },
  { k: "fixedHra", l: "Fixed HRA", x: true, money: true },
  { k: "fixedOther", l: "Fixed Other", x: true, money: true },
  { k: "fixedPf", l: "Fixed PF", x: true, money: true },
  { k: "fixedPt", l: "Fixed PT", x: true, money: true },
  { k: "fixedTotalDed", l: "Fixed Total Ded", x: true, money: true },
  { k: "fixedTakeHome", l: "Fixed Take Home", x: true, money: true, total: true },
  { k: "fixedEmployer", l: "Fixed Employer", x: true, money: true },
  { k: "fixedCtc", l: "Fixed CTC", x: true, money: true, total: true },
  { k: "gross", l: "Gross", money: true, total: true, bold: true, color: "#0f766e" },
  { k: "basic", l: "Basic", money: true, total: true },
  { k: "hra", l: "HRA", money: true, total: true },
  { k: "otherAllowance", l: "Other Allow", lines: ["Other", "Allow"], money: true, total: true },
  { k: "totalGross", l: "Total Gross", lines: ["Total", "Gross"], money: true, total: true },
  { k: "pf", l: "PF", money: true, total: true },
  { k: "pt", l: "PT", money: true, total: true },
  { k: "advanceDeduction", l: "Advance", money: true, total: true },
  { k: "totalDed", l: "Total Ded", money: true, total: true },
  { k: "takeHome", l: "Take Home", money: true, total: true, bold: true, color: "#0f172a" },
  { k: "employer", l: "Employer", money: true, total: true },
  { k: "ctc", l: "CTC", money: true, total: true },
  { k: "remarks", l: "Remarks", left: true, remarks: true },
];
// S.No, Person Code and Name stay pinned on the left while the sheet scrolls sideways.
const FREEZE_W = { sno: 56, employeeNumber: 120, name: 170 };
const FREEZE_W_MOBILE = { sno: 44, employeeNumber: 82, name: 96 };
const freezeStyle = (k, bg, z = 1, mobile = false, hasCode = true) => {
  const w = mobile ? FREEZE_W_MOBILE : FREEZE_W;
  const pin = (left, width, extra = {}) => ({ position: "sticky", left, zIndex: z, background: bg, minWidth: width, width, ...extra });
  return k === "sno" ? pin(0, w.sno)
    : k === "employeeNumber" ? pin(w.sno, w.employeeNumber)
    : k === "name" ? pin(w.sno + (hasCode ? w.employeeNumber : 0), w.name, { boxShadow: "2px 0 0 #e2e8f0" })
    : null;
};
function useIsMobile(max = 700) {
  const q = `(max-width: ${max}px)`;
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const thR = { ...th, textAlign: "right" };
const td = { padding: "9px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7", color: "#0f172a", whiteSpace: "nowrap" };
const tdR = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
// Approve / reject are always round icon buttons: dark-green circle + white tick, dark-red circle + white cross.
const apprBtn = (kind) => ({ width: 36, height: 36, borderRadius: "50%", border: "none", background: kind === "ok" ? "#166534" : "#b91c1c", color: "#fff", fontSize: 19, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontFamily: "inherit", boxShadow: "0 1px 2px rgba(0,0,0,.25)" });
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

export default function SalaryPage({ user }) {
  const canManage = ["ADMIN", "VP"].includes(user?.role);
  const canAdjust = user?.role === "ADMIN"; // only Admin edits the monthly sheet
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState("sheet"); // sheet | structures
  const isMobile = useIsMobile();
  const [showAll, setShowAll] = useState(false); // false = compact payroll sheet, true = every column

  const [sheet, setSheet] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const [defModal, setDefModal] = useState(null);  // { emp, mode: 'define'|'revise' }
  const [adjModal, setAdjModal] = useState(null);  // { row }

  const [approval, setApproval] = useState(null);

  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salaryApi.getSheet(year, month);
      setSheet(r.data?.data || []);
    } catch { setSheet([]); }
    try {
      const a = await salaryApi.getApproval(year, month);
      setApproval(a.data?.data || null);
    } catch { setApproval(null); }
    setLoading(false);
  }, [year, month]);

  const released = !!approval?.released;
  const inReview = !!approval?.adminApproved && !released; // Admin approved, waiting on OH / VP / CEO — nobody edits
  const sheetLocked = released || inReview;
  const role = user?.role;
  // Admin first, then OH and VP each on their own (neither waits for the other), then the CEO's final approval.
  // Only the role whose step is open gets its Approve / Reject buttons.
  const approvalSteps = approval ? [
    { key: "ADMIN", title: "Admin", done: approval.adminApproved, by: approval.adminBy, at: approval.adminAt, open: !approval.adminApproved, waitsFor: null },
    { key: "OH", title: "OH", done: approval.ohApproved, by: approval.ohBy, at: approval.ohAt, open: approval.adminApproved && !approval.ohApproved, waitsFor: "Admin" },
    { key: "VP", title: "VP", done: approval.vpApproved, by: approval.vpBy, at: approval.vpAt, open: approval.adminApproved && !approval.vpApproved, waitsFor: "Admin" },
    { key: "CEO", title: "CEO", done: approval.ceoApproved, by: approval.ceoBy, at: approval.ceoAt, open: approval.ohApproved && approval.vpApproved && !approval.ceoApproved, waitsFor: "OH and VP" },
  ] : [];
  const myStep = approvalSteps.find((st) => st.key === role && st.open && !released);
  const myTurn = !!myStep;

  async function approveMonth() {
    const last = role === "CEO";
    const label = `${MONTHS[month - 1]} ${year}`;
    if (!window.confirm(last
      ? `Give final approval and RELEASE the salary for ${label}? The month will be locked and employees will be notified that payslips are available.`
      : `Approve the salary sheet for ${label}?`)) return;
    setBusy("approval");
    try {
      const r = await salaryApi.approve(year, month, user?.username);
      setApproval(r.data?.data || null);
    } catch (e) { alert(e.response?.data?.message || "Could not approve"); }
    finally { setBusy(null); }
  }

  async function rejectMonth() {
    const remark = window.prompt("Reason for rejecting — the sheet goes back to Admin:");
    if (remark === null) return;
    if (!remark.trim()) { alert("Enter a reason for rejecting"); return; }
    setBusy("approval");
    try {
      const r = await salaryApi.reject(year, month, user?.username, remark.trim());
      setApproval(r.data?.data || null);
    } catch (e) { alert(e.response?.data?.message || "Could not reject"); }
    finally { setBusy(null); }
  }

  const loadStructures = useCallback(async () => {
    try {
      const r = await salaryApi.getStructures();
      setStructures(r.data?.data || []);
    } catch { setStructures([]); }
  }, []);

  useEffect(() => { loadSheet(); }, [loadSheet]);
  useEffect(() => { loadStructures(); }, [loadStructures]);

  const cols = useMemo(() => SHEET_COLS.filter((c) => showAll || !c.x), [showAll]);
  const hasCode = cols.some((c) => c.k === "employeeNumber");
  const totals = useMemo(() => {
    const acc = {};
    SHEET_COLS.forEach((c) => { if (c.total) acc[c.k] = sheet.reduce((n, r) => n + Number(r[c.k] || 0), 0); });
    return acc;
  }, [sheet]);

  // Prints the columns currently on screen as a clean landscape payroll sheet in its own window.
  function printSheet() {
    const title = `HAPPIZO INFRASTRUCTURE AND SOLUTIONS --- SALARY DETAILS FOR THE MONTH OF ${MONTHS[month - 1].toUpperCase()} ${year}`;
    const head = cols.map((c) => `<th${c.remarks ? ' style="width:28%"' : ""}>${c.lines ? c.lines.map(esc).join("<br>") : esc(c.l)}</th>`).join("");
    const cell = (c, r, i) => `<td class="c${c.bold ? " b" : ""}">${esc(c.money ? inr(r[c.k]) : (c.f ? c.f(r, i) : r[c.k]))}</td>`;
    const body = sheet.map((r, i) => `<tr>${cols.map((c) => cell(c, r, i)).join("")}</tr>`).join("");
    const foot = `<tr class="t">${cols.map((c, i) => c.total ? `<td class="c b">${esc(inr(totals[c.k]))}</td>` : `<td class="c b">${c.k === "name" ? "Total" : ""}</td>`).join("")}</tr>`;
    const ap = approval;
    const approvalLine = ap ? `<p class="ap">${released ? "<b>RELEASED</b> — " : "<b>Not yet released</b> — "}Admin: ${esc(ap.adminApproved ? ap.adminBy : "pending")} · OH: ${esc(ap.ohApproved ? ap.ohBy : "pending")} · VP: ${esc(ap.vpApproved ? ap.vpBy : "pending")} · CEO: ${esc(ap.ceoApproved ? ap.ceoBy : "pending")}</p>` : "";
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to print the salary sheet"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Salary ${MONTHS[month - 1]} ${year}</title>
<style>@page{size:A3 landscape;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;color:#000}
.logo{display:block;margin:0 auto 6px;height:52px}h1{font-size:15px;text-align:center;margin:0 0 8px}table{border-collapse:collapse;width:100%;font-size:10.5px}
th,td{border:1px solid #444;padding:4px 6px}th{background:#dbe4f0;text-align:center}td.c{text-align:center}td.b{font-weight:700}
tr.t td{background:#f1f5f9}p.ap{font-size:11px;margin:10px 0 0}</style></head><body><img class="logo" src="${window.location.origin}/happizo-logo.png" alt="Happizo"/><h1>${esc(title)}</h1>
<table><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table>${approvalLine}<script>window.onload=function(){window.focus();window.print()}</script></body></html>`);
    w.document.close();
  }

  function exportCsv() {
    const cols = [
      ["Person Code", "employeeNumber"], ["Name", "name"], ["Designation", "designation"],
      ["Days", "daysInMonth"], ["Leave Days", "leaveDays"], ["Free CL", "freeCasualLeave"],
      ["Unauthorized", "unauthorizedDays"],
      ["LOP Days", "lopDays"], ["Extra WD", "extraWorkingDays"], ["Working Days", "workingDays"],
      ["Fixed Gross", "fixedGross"], ["Fixed Basic", "fixedBasic"], ["Fixed HRA", "fixedHra"],
      ["Fixed Other", "fixedOther"], ["Fixed PF", "fixedPf"], ["Fixed PT", "fixedPt"],
      ["Fixed Total Ded", "fixedTotalDed"], ["Fixed Take Home", "fixedTakeHome"],
      ["Fixed Employer", "fixedEmployer"], ["Fixed CTC", "fixedCtc"],
      ["Gross", "gross"], ["Basic", "basic"], ["HRA", "hra"], ["Other Allow", "otherAllowance"],
      ["PF", "pf"], ["PT", "pt"], ["Advance", "advanceDeduction"], ["Total Ded", "totalDed"], ["Take Home", "takeHome"],
      ["Employer", "employer"], ["CTC", "ctc"], ["Remarks", "remarks"],
    ];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.map(([l]) => l).join(",")];
    sheet.forEach((r) => rows.push(cols.map(([, k]) => esc(r[k])).join(",")));
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `salary-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
  }

  async function submitStructure(form) {
    setBusy("struct");
    try {
      await salaryApi.saveStructure({
        userId: defModal.emp.userId,
        monthlyGross: Number(form.monthlyGross),
        pfApplicable: form.pfApplicable,
        ptApplicable: form.ptApplicable,
        pfAmount: form.pfApplicable && form.pfAmount !== "" ? Number(form.pfAmount) : null,
        ptAmount: form.ptApplicable && form.ptAmount !== "" ? Number(form.ptAmount) : null,
        effectiveFrom: form.effectiveFrom || null,
        note: form.note?.trim() || (defModal.mode === "revise" ? "Appraisal revision" : "Initial structure"),
        actionBy: user?.fullName || user?.username,
      });
      setDefModal(null);
      await Promise.all([loadStructures(), loadSheet()]);
    } catch (e) {
      alert(e.response?.data?.message || "Could not save salary structure");
    } finally { setBusy(null); }
  }

  // HR records a day the employee took off without applying as approved leave — it stops being an unauthorized absence.
  async function regularizeDay(row, date, leaveType) {
    try {
      const r = await salaryApi.regularize(row.userId, year, month, { date, leaveType, username: user?.username });
      const fresh = r.data?.data;
      if (fresh) {
        setSheet((rows) => rows.map((x) => (x.userId === fresh.userId ? fresh : x)));
        setAdjModal((m) => (m ? { ...m, row: fresh } : m));
      }
      try { const a = await salaryApi.getApproval(year, month); setApproval(a.data?.data || null); } catch { /* keep old */ }
    } catch (e) { alert(e.response?.data?.message || "Could not record the leave"); }
  }

  async function submitAdjustment(form) {
    setBusy("adj");
    try {
      await salaryApi.adjust(adjModal.row.userId, year, month, {
        extraWorkingDays: form.extraWorkingDays === "" ? null : Number(form.extraWorkingDays),
        manualLopDays: form.manualLopDays === "" ? null : Number(form.manualLopDays),
        manualWorkingDays: form.manualWorkingDays === "" ? null : Number(form.manualWorkingDays),
        remarks: form.remarks?.trim() || null,
        finalized: form.finalized,
        actionBy: user?.fullName || user?.username,
        username: user?.username,
      });
      setAdjModal(null);
      await loadSheet();
    } catch (e) {
      alert(e.response?.data?.message || "Could not save adjustment");
    } finally { setBusy(null); }
  }

  const noStructure = structures.filter((s) => !s.hasSalary);

  return (
    <div className="hr-page" style={{ padding: isMobile ? "14px 10px" : "24px 32px" }}>
      {/* Hero */}
      <div className="hr-hero" style={{ ...card, padding: "18px 22px", marginBottom: 18, display: "flex", alignItems: "center", gap: 14, borderLeft: "4px solid #0f766e" }}>
        <div className="hr-hero-icon" style={{ width: 46, height: 46, borderRadius: 12, background: "#ccfbf1", color: "#0f766e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>💰</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Salary</div>
          <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 2 }}>
            Structure per employee, prorated by leaves from the HR module. One casual leave a month is free — extra leave days are loss of pay.
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
          {[["sheet", "Monthly Sheet"], ["structures", "Structures & Appraisals"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)}
              style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: view === k ? 700 : 500, padding: "7px 14px", borderRadius: 6, background: view === k ? "#0f766e" : "transparent", color: view === k ? "#fff" : "#475569" }}>
              {l}
            </button>
          ))}
        </div>
        {view === "sheet" && (
          <>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={inputS}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={inputS}>
              {[year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={exportCsv} disabled={sheet.length === 0} style={{ ...btn("#fff", "#0f172a"), border: "1px solid #cbd5e1", opacity: sheet.length === 0 ? 0.5 : 1 }}>⬇ Export</button>
            <button onClick={printSheet} disabled={sheet.length === 0} style={{ ...btn("#fff", "#0f172a"), border: "1px solid #cbd5e1", opacity: sheet.length === 0 ? 0.5 : 1 }}>🖨 Print</button>
            <button onClick={() => setShowAll((v) => !v)} style={{ ...btn("#fff", "#0f172a"), border: "1px solid #cbd5e1" }}>
              {showAll ? "Hide extra columns" : "Unhide all columns"}
            </button>
          </>
        )}
        {view === "structures" && noStructure.length > 0 && (
          <span style={{ fontSize: 12.5, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 10px" }}>
            {noStructure.length} employee{noStructure.length !== 1 ? "s" : ""} without a defined salary
          </span>
        )}
      </div>

      {view === "sheet" ? (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontSize: 14.5, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #eef2f7" }}>
            Salary Sheet — {MONTHS[month - 1]} {year} <span style={{ color: "#64748b", fontWeight: 500 }}>({cycleLabel(year, month)})</span>
          </div>
          {approval && sheet.length > 0 && (
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #eef2f7", background: released ? "#f0fdf4" : "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {approvalSteps.map((st, i) => {
                  const mine = st.key === role && st.open && !released;
                  const tone = st.done ? { bd: "#86efac", bg: "#f0fdf4", fg: "#166534" } : mine ? { bd: "#1e3a5f", bg: "#fff", fg: "#1e3a5f" } : { bd: "#cbd5e1", bg: "#fff", fg: "#000" };
                  return (
                    <Fragment key={st.key}>
                      {i > 0 && <span style={{ alignSelf: "center", color: "#cbd5e1", fontSize: 18 }}>›</span>}
                      <div style={{ minWidth: 150, border: `1.5px solid ${tone.bd}`, background: tone.bg, borderRadius: 10, padding: "7px 12px", boxShadow: mine ? "0 0 0 3px rgba(30,58,95,.10)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 800, color: tone.fg, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {st.done && <span style={{ width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", background: "#16a34a" }}>✓</span>}
                          {st.title}
                        </div>
                        {mine && (
                          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                            <button title={st.key === "CEO" ? "Approve & release" : "Approve"} aria-label="Approve" onClick={approveMonth} disabled={busy === "approval"} style={{ ...apprBtn("ok"), opacity: busy === "approval" ? 0.6 : 1 }}>✓</button>
                            {st.key !== "ADMIN" && <button title="Reject" aria-label="Reject" onClick={rejectMonth} disabled={busy === "approval"} style={{ ...apprBtn("no"), opacity: busy === "approval" ? 0.6 : 1 }}>✕</button>}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              {released && <div style={{ fontSize: 13, fontWeight: 800, color: "#166534", marginTop: 10 }}>RELEASED — payslips available</div>}
              {approval.rejectRemark && !released && (
                <div style={{ fontSize: 12.5, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 10px", marginTop: 10 }}>
                  Rejected by {approval.rejectedBy}{approval.rejectedRole ? ` (${approval.rejectedRole})` : ""}: {approval.rejectRemark}
                </div>
              )}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {cols.map((c) => <th key={c.k} style={{ ...th, textAlign: "center", ...(c.lines ? { whiteSpace: "normal", lineHeight: 1.25 } : {}), ...(isMobile ? { padding: "8px 6px", fontSize: 10.5 } : { fontSize: 14.5 }), ...freezeStyle(c.k, "#f8fafc", 3, isMobile, hasCode) }} title={c.tip}>
                    {c.lines ? c.lines.map((t, i) => <span key={i}>{i > 0 && <br />}{t}</span>) : c.l}
                  </th>)}
                  <th style={th}>Payslip</th>
                  {canAdjust && <th style={th}>Adjust</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td style={td} colSpan={cols.length + (canAdjust ? 2 : 1)}>Loading…</td></tr>
                ) : sheet.length === 0 ? (
                  <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={cols.length + (canAdjust ? 2 : 1)}>
                    No salary structures defined yet — use “Structures &amp; Appraisals” to define salaries.
                  </td></tr>
                ) : sheet.map((r, ri) => (
                  <tr key={r.userId} style={{ background: r.finalized ? "#f0fdf4" : "#fff" }}>
                    {cols.map((c) => {
                      const val = c.money ? (c.k === "gross" || c.k === "takeHome" ? inr(r[c.k]) : inr0(r[c.k])) : (c.f ? c.f(r, ri) : r[c.k]);
                      const flag = (c.k === "unauthorizedDays" || c.k === "lopDays") && Number(r[c.k]) > 0;
                      const style = c.wrap
                        ? { ...td, textAlign: "center", whiteSpace: "normal", minWidth: 130, maxWidth: 170, lineHeight: 1.3 }
                        : c.remarks
                        ? { ...td, textAlign: "center", whiteSpace: "normal", minWidth: 380, maxWidth: 520, fontSize: 12, color: "#475569" }
                        : { ...td, textAlign: "center", fontWeight: c.bold || (flag && c.k === "unauthorizedDays") ? (c.k === "takeHome" ? 800 : 700) : 400, color: flag ? "#b91c1c" : c.color || (c.x && !c.money ? "#64748b" : "#0f172a") };
                      return <td key={c.k} style={{ ...style, ...(isMobile ? { padding: "7px 6px", fontSize: 12 } : { fontSize: 16 }), ...(isMobile && c.remarks ? { minWidth: 220 } : {}), ...(isMobile && (c.k === "name" || c.k === "employeeNumber") ? { whiteSpace: "normal" } : {}), ...freezeStyle(c.k, r.finalized ? "#f0fdf4" : "#fff", 1, isMobile, hasCode) }}>{val}</td>;
                    })}
                    <td style={td}>
                      <button onClick={() => downloadPayslip(r, year, month)} disabled={!released} title={released ? "Download payslip" : "Available after the CEO releases this month"} aria-label="Download payslip" style={{ ...btn("#ecfdf5", "#047857"), padding: "6px 9px", opacity: released ? 1 : 0.4, cursor: released ? "pointer" : "not-allowed" }}>📎</button>
                    </td>
                    {canAdjust && (
                      <td style={td}>
                        <button onClick={() => setAdjModal({ row: r })} disabled={sheetLocked} title={released ? "Released — locked" : inReview ? "In review — opens again only if OH, VP or the CEO rejects it" : "Adjust"} aria-label="Adjust" style={{ ...btn("#eef2ff", "#4338ca"), padding: "6px 9px", opacity: sheetLocked ? 0.4 : 1, cursor: sheetLocked ? "not-allowed" : "pointer" }}>✏️</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {sheet.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#f8fafc", fontWeight: 800 }}>
                    {cols.map((c, i) => c.total
                      ? <td key={c.k} style={{ ...td, textAlign: "center", ...(isMobile ? {} : { fontSize: 16 }) }}>{inr0(totals[c.k])}</td>
                      : <td key={c.k} style={{ ...td, textAlign: "center", ...(isMobile ? { padding: "7px 6px", fontSize: 12 } : { fontSize: 16 }), ...freezeStyle(c.k, "#f8fafc", 1, isMobile, hasCode) }}>{c.k === "name" ? `Total (${sheet.length})` : ""}</td>)}
                    <td style={td} colSpan={canAdjust ? 2 : 1}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontSize: 14.5, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #eef2f7" }}>
            Salary Structures
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th><th style={th}>Designation</th>
                  <th style={thR}>Monthly Gross</th><th style={thR}>Basic</th><th style={thR}>HRA</th><th style={thR}>Other Allow</th>
                  <th style={thR}>PF</th><th style={thR}>PT</th><th style={th}>Effective</th><th style={th}>Note</th>
                  {canManage && <th style={{ ...th, textAlign: "right" }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {structures.length === 0 ? (
                  <tr><td style={td} colSpan={canManage ? 11 : 10}>Loading…</td></tr>
                ) : structures.map((s) => (
                  <tr key={s.userId} style={{ background: s.hasSalary ? "#fff" : "#fffbeb" }}>
                    <td style={{ ...td, fontWeight: 600 }}>{s.name}</td>
                    <td style={td}>{s.designation}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{s.hasSalary ? inr0(s.monthlyGross) : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? inr0(s.basic) : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? inr0(s.hra) : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? inr0(s.otherAllowance) : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? (s.pfApplicable ? inr0(s.pfAmount) : "No") : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? (s.ptApplicable ? inr0(s.ptAmount) : "No") : "—"}</td>
                    <td style={td}>{s.hasSalary ? fmtDate(s.effectiveFrom) : "—"}</td>
                    <td style={{ ...td, whiteSpace: "normal", maxWidth: 200, fontSize: 12, color: "#64748b" }}>{s.note || "—"}</td>
                    {canManage && (
                      <td style={{ ...td, textAlign: "right" }}>
                        {s.hasSalary ? (
                          <button onClick={() => setDefModal({ emp: s, mode: "revise" })} style={btn("#e0e7ff", "#3730a3")}>Revise (Appraisal)</button>
                        ) : (
                          <button onClick={() => setDefModal({ emp: s, mode: "define" })} style={btn("#0f766e")}>Define Salary</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {defModal && <StructureModal modal={defModal} busy={busy === "struct"} onClose={() => setDefModal(null)} onSubmit={submitStructure} />}
      {adjModal && <AdjustModal row={adjModal.row} canRegularize={role === "ADMIN" && !sheetLocked} onRegularize={regularizeDay} monthLabel={`${MONTHS[month - 1]} ${year}`} busy={busy === "adj"} onClose={() => setAdjModal(null)} onSubmit={submitAdjustment} />}
    </div>
  );
}

function StructureModal({ modal, busy, onClose, onSubmit }) {
  const isRevise = modal.mode === "revise";
  const emp = modal.emp;
  const [form, setForm] = useState({
    monthlyGross: isRevise ? String(emp.monthlyGross ?? "") : "",
    pfApplicable: isRevise ? !!emp.pfApplicable : true,
    ptApplicable: isRevise ? !!emp.ptApplicable : true,
    // PF / PT amounts — blank means "use the default" (PF 12% of Basic, PT 208); an edited value wins.
    pfAmount: isRevise && emp.pfAmount != null ? String(emp.pfAmount) : "",
    ptAmount: isRevise && emp.ptAmount != null ? String(emp.ptAmount) : "",
    effectiveFrom: new Date().toISOString().slice(0, 8) + "01",
    note: "",
  });
  const g = Number(form.monthlyGross || 0);
  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
        {isRevise ? "Revise Salary (Appraisal)" : "Define Salary"} — {emp.name}
      </div>
      <div style={{ fontSize: 13, color: "#64748b", margin: "3px 0 16px" }}>
        {emp.designation}
        {isRevise && <> · current {inr0(emp.monthlyGross)}</>}
      </div>

      <Field label="Monthly Gross (₹)">
        <input type="number" value={form.monthlyGross} onChange={(e) => setForm((f) => ({ ...f, monthlyGross: e.target.value }))} style={{ ...inputS, width: "100%" }} autoFocus />
      </Field>
      {g > 0 && (
        <div style={{ fontSize: 12, color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 10px", margin: "-4px 0 14px" }}>
          Basic {inr0(g * 0.5)} · HRA {inr0(g * 0.125)} · Other {inr0(g * 0.375)}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input type="checkbox" checked={form.pfApplicable} onChange={(e) => setForm((f) => ({ ...f, pfApplicable: e.target.checked }))} /> PF (₹)
          </label>
          <input type="number" min="0" value={form.pfApplicable ? form.pfAmount : ""} disabled={!form.pfApplicable}
            onChange={(e) => setForm((f) => ({ ...f, pfAmount: e.target.value }))}
            placeholder={g > 0 ? `${Math.round(g * 0.06)} (12% of Basic)` : "12% of Basic"} style={{ ...inputS, width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input type="checkbox" checked={form.ptApplicable} onChange={(e) => setForm((f) => ({ ...f, ptApplicable: e.target.checked }))} /> PT (₹)
          </label>
          <input type="number" min="0" value={form.ptApplicable ? form.ptAmount : ""} disabled={!form.ptApplicable}
            onChange={(e) => setForm((f) => ({ ...f, ptAmount: e.target.value }))}
            placeholder="208" style={{ ...inputS, width: "100%" }} />
        </div>
      </div>
      <Field label="Effective from">
        <input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} style={{ ...inputS, width: "100%" }} />
      </Field>
      <Field label="Note">
        <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={isRevise ? "e.g. Appraisal FY26-27" : "e.g. Initial structure"} style={{ ...inputS, width: "100%" }} />
      </Field>
      <ModalActions busy={busy} onClose={onClose} onSubmit={() => g > 0 && onSubmit(form)} disabled={!(g > 0)} label={isRevise ? "Save Revision" : "Define Salary"} />
    </Overlay>
  );
}

function AdjustModal({ row, monthLabel, busy, onClose, onSubmit, canRegularize, onRegularize }) {
  const [leaveType, setLeaveType] = useState("CASUAL");
  const [working, setWorking] = useState(null);
  const [form, setForm] = useState({
    extraWorkingDays: "",
    manualLopDays: "",
    manualWorkingDays: "",
    remarks: row.remarks || "",
    finalized: !!row.finalized,
  });
  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Adjust — {row.name}</div>
      <div style={{ fontSize: 13, color: "#64748b", margin: "3px 0 14px" }}>
        {monthLabel} · auto: {row.leaveDays} leave day(s){Number(row.unauthorizedDays) > 0 ? `, ${row.unauthorizedDays} unauthorized absence(s) × 1.5` : ""}, {row.lopDays} LOP, {row.extraWorkingDays} extra WD, {row.workingDays} working days
      </div>
      {row.unauthorizedDates?.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#991b1b", marginBottom: 4 }}>Unauthorized absences — no leave applied, no check-in</div>
          <div style={{ fontSize: 12, color: "#7f1d1d", marginBottom: 8 }}>
            If the employee actually took leave but never applied, record it here. It then counts as ordinary leave (free CL first) instead of an unauthorized absence at 1.5× with no free CL.
          </div>
          {canRegularize && (
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} style={{ ...inputS, marginBottom: 8 }}>
              {[["CASUAL", "Casual leave"], ["SICK", "Sick leave"], ["EARNED", "Earned leave"], ["OTHER", "Other leave"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          {row.unauthorizedDates.map((d) => (
            <div key={d} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{fmtDate(d)}</span>
              {canRegularize && (
                <button disabled={working === d}
                  onClick={async () => { setWorking(d); await onRegularize(row, d, leaveType); setWorking(null); }}
                  style={{ ...btn("#fff", "#166534"), border: "1px solid #bbf7d0", padding: "5px 10px", fontSize: 12, opacity: working === d ? 0.6 : 1 }}>
                  {working === d ? "Saving…" : "Mark as leave"}
                </button>
              )}
            </div>
          ))}
          {!canRegularize && <div style={{ fontSize: 12, color: "#7f1d1d", marginTop: 4 }}>Only Admin or VP can record leave for an employee.</div>}
        </div>
      )}
      <Field label="Extra working days (override — auto-detected from Sunday/holiday check-in+out)">
        <input type="number" step="0.5" value={form.extraWorkingDays} onChange={(e) => setForm((f) => ({ ...f, extraWorkingDays: e.target.value }))} style={{ ...inputS, width: "100%" }} placeholder="auto" />
      </Field>
      <Field label="Manual LOP days (override the leave-derived figure)">
        <input type="number" step="0.5" value={form.manualLopDays} onChange={(e) => setForm((f) => ({ ...f, manualLopDays: e.target.value }))} style={{ ...inputS, width: "100%" }} placeholder="auto" />
      </Field>
      <Field label="Manual working days (joiners / mid-month exits / waivers)">
        <input type="number" step="0.5" value={form.manualWorkingDays} onChange={(e) => setForm((f) => ({ ...f, manualWorkingDays: e.target.value }))} style={{ ...inputS, width: "100%" }} placeholder="auto" />
      </Field>
      <Field label="Remarks">
        <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} style={{ ...inputS, width: "100%", minHeight: 60, resize: "vertical" }} placeholder="e.g. 2 days leave - 1 CL, 1 Sunday working" />
      </Field>
      <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginBottom: 16 }}>
        <input type="checkbox" checked={form.finalized} onChange={(e) => setForm((f) => ({ ...f, finalized: e.target.checked }))} /> Finalized for this month
      </label>
      <ModalActions busy={busy} onClose={onClose} onSubmit={() => onSubmit(form)} label="Save Adjustment" />
    </Overlay>
  );
}

const Overlay = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
    <div onClick={(e) => e.stopPropagation()} className="hr-edit-modal" style={{ background: "#fff", borderRadius: 16, width: 460, maxWidth: "94vw", padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,.28)", maxHeight: "90vh", overflowY: "auto" }}>
      {children}
    </div>
  </div>
);
const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ fontSize: 12.5, fontWeight: 600, color: "#475569", display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);
const ModalActions = ({ busy, onClose, onSubmit, disabled, label }) => (
  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
    <button onClick={onClose} style={btn("#f1f5f9", "#334155")}>Cancel</button>
    <button disabled={busy || disabled} onClick={onSubmit} style={{ ...btn("#0f766e"), opacity: busy || disabled ? 0.6 : 1 }}>{busy ? "Saving…" : label}</button>
  </div>
);
