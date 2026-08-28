import { useCallback, useEffect, useMemo, useState } from "react";
import { salaryApi, fmtDate } from "./hrApi";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const inr = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const thR = { ...th, textAlign: "right" };
const td = { padding: "9px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7", color: "#0f172a", whiteSpace: "nowrap" };
const tdR = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

export default function SalaryPage({ user }) {
  const canManage = ["ADMIN", "VP"].includes(user?.role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState("sheet"); // sheet | structures

  const [sheet, setSheet] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const [defModal, setDefModal] = useState(null);  // { emp, mode: 'define'|'revise' }
  const [adjModal, setAdjModal] = useState(null);  // { row }

  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salaryApi.getSheet(year, month);
      setSheet(r.data?.data || []);
    } catch { setSheet([]); }
    setLoading(false);
  }, [year, month]);

  const loadStructures = useCallback(async () => {
    try {
      const r = await salaryApi.getStructures();
      setStructures(r.data?.data || []);
    } catch { setStructures([]); }
  }, []);

  useEffect(() => { loadSheet(); }, [loadSheet]);
  useEffect(() => { loadStructures(); }, [loadStructures]);

  const totals = useMemo(() => {
    const acc = { fixedGross: 0, fixedTakeHome: 0, fixedCtc: 0, gross: 0, totalDed: 0, takeHome: 0, ctc: 0 };
    sheet.forEach((r) => { for (const k in acc) acc[k] += Number(r[k] || 0); });
    return acc;
  }, [sheet]);

  function exportCsv() {
    const cols = [
      ["Emp No", "employeeNumber"], ["Name", "name"], ["Designation", "designation"],
      ["Days", "daysInMonth"], ["Leave Days", "leaveDays"], ["Free CL", "freeCasualLeave"],
      ["LOP Days", "lopDays"], ["Extra WD", "extraWorkingDays"], ["Working Days", "workingDays"],
      ["Fixed Gross", "fixedGross"], ["Fixed Basic", "fixedBasic"], ["Fixed HRA", "fixedHra"],
      ["Fixed Other", "fixedOther"], ["Fixed PF", "fixedPf"], ["Fixed PT", "fixedPt"],
      ["Fixed Total Ded", "fixedTotalDed"], ["Fixed Take Home", "fixedTakeHome"],
      ["Fixed Employer", "fixedEmployer"], ["Fixed CTC", "fixedCtc"],
      ["Gross", "gross"], ["Basic", "basic"], ["HRA", "hra"], ["Other Allow", "otherAllowance"],
      ["PF", "pf"], ["PT", "pt"], ["Total Ded", "totalDed"], ["Take Home", "takeHome"],
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
      });
      setAdjModal(null);
      await loadSheet();
    } catch (e) {
      alert(e.response?.data?.message || "Could not save adjustment");
    } finally { setBusy(null); }
  }

  const noStructure = structures.filter((s) => !s.hasSalary);

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
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
            Salary Sheet — {MONTHS[month - 1]} {year}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Emp No</th><th style={th}>Name</th><th style={th}>Designation</th>
                  <th style={thR}>Days</th><th style={thR}>Leave</th><th style={thR}>LOP</th><th style={thR}>Work Days</th>
                  <th style={thR}>Fixed Gross</th><th style={thR}>Fixed Ded</th><th style={thR}>Fixed Take Home</th><th style={thR}>Fixed CTC</th>
                  <th style={thR}>Gross</th><th style={thR}>Basic</th><th style={thR}>HRA</th><th style={thR}>Other</th>
                  <th style={thR}>PF</th><th style={thR}>PT</th><th style={thR}>Total Ded</th><th style={thR}>Take Home</th><th style={thR}>CTC</th>
                  <th style={th}>Remarks</th>
                  {canManage && <th style={th}>Adjust</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td style={td} colSpan={canManage ? 22 : 21}>Loading…</td></tr>
                ) : sheet.length === 0 ? (
                  <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={canManage ? 22 : 21}>
                    No salary structures defined yet — use “Structures &amp; Appraisals” to define salaries.
                  </td></tr>
                ) : sheet.map((r) => (
                  <tr key={r.userId} style={{ background: r.finalized ? "#f0fdf4" : "#fff" }}>
                    <td style={td}>{r.employeeNumber || "—"}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                    <td style={td}>{r.designation}</td>
                    <td style={tdR}>{r.daysInMonth}</td>
                    <td style={tdR}>{r.leaveDays}</td>
                    <td style={{ ...tdR, color: Number(r.lopDays) > 0 ? "#b91c1c" : "#64748b" }}>{r.lopDays}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{r.workingDays}</td>
                    <td style={tdR}>{inr0(r.fixedGross)}</td>
                    <td style={tdR}>{inr0(r.fixedTotalDed)}</td>
                    <td style={tdR}>{inr0(r.fixedTakeHome)}</td>
                    <td style={tdR}>{inr0(r.fixedCtc)}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: "#0f766e" }}>{inr(r.gross)}</td>
                    <td style={tdR}>{inr0(r.basic)}</td>
                    <td style={tdR}>{inr0(r.hra)}</td>
                    <td style={tdR}>{inr0(r.otherAllowance)}</td>
                    <td style={tdR}>{inr0(r.pf)}</td>
                    <td style={tdR}>{inr0(r.pt)}</td>
                    <td style={tdR}>{inr0(r.totalDed)}</td>
                    <td style={{ ...tdR, fontWeight: 800, color: "#0f172a" }}>{inr(r.takeHome)}</td>
                    <td style={tdR}>{inr0(r.ctc)}</td>
                    <td style={{ ...td, whiteSpace: "normal", maxWidth: 220, fontSize: 12, color: "#475569" }}>{r.remarks}</td>
                    {canManage && (
                      <td style={td}>
                        <button onClick={() => setAdjModal({ row: r })} style={btn("#eef2ff", "#4338ca")}>Adjust</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {sheet.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#f8fafc", fontWeight: 800 }}>
                    <td style={td} colSpan={7}>Total ({sheet.length})</td>
                    <td style={tdR}>{inr0(totals.fixedGross)}</td>
                    <td style={td}></td>
                    <td style={tdR}>{inr0(totals.fixedTakeHome)}</td>
                    <td style={tdR}>{inr0(totals.fixedCtc)}</td>
                    <td style={tdR}>{inr0(totals.gross)}</td>
                    <td style={td} colSpan={3}></td>
                    <td style={td} colSpan={2}></td>
                    <td style={tdR}>{inr0(totals.totalDed)}</td>
                    <td style={tdR}>{inr0(totals.takeHome)}</td>
                    <td style={tdR}>{inr0(totals.ctc)}</td>
                    <td style={td} colSpan={canManage ? 2 : 1}></td>
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
                  <th style={th}>Emp No</th><th style={th}>Name</th><th style={th}>Designation</th>
                  <th style={thR}>Monthly Gross</th><th style={thR}>Basic</th><th style={thR}>HRA</th><th style={thR}>Other Allow</th>
                  <th style={th}>PF</th><th style={th}>PT</th><th style={th}>Effective</th><th style={th}>Note</th>
                  {canManage && <th style={{ ...th, textAlign: "right" }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {structures.length === 0 ? (
                  <tr><td style={td} colSpan={canManage ? 12 : 11}>Loading…</td></tr>
                ) : structures.map((s) => (
                  <tr key={s.userId} style={{ background: s.hasSalary ? "#fff" : "#fffbeb" }}>
                    <td style={td}>{s.employeeNumber || "—"}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{s.name}</td>
                    <td style={td}>{s.designation}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{s.hasSalary ? inr0(s.monthlyGross) : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? inr0(s.basic) : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? inr0(s.hra) : "—"}</td>
                    <td style={tdR}>{s.hasSalary ? inr0(s.otherAllowance) : "—"}</td>
                    <td style={td}>{s.hasSalary ? (s.pfApplicable ? "Yes" : "No") : "—"}</td>
                    <td style={td}>{s.hasSalary ? (s.ptApplicable ? "Yes" : "No") : "—"}</td>
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
      {adjModal && <AdjustModal row={adjModal.row} monthLabel={`${MONTHS[month - 1]} ${year}`} busy={busy === "adj"} onClose={() => setAdjModal(null)} onSubmit={submitAdjustment} />}
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
        {emp.employeeNumber} · {emp.designation}
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
      <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={form.pfApplicable} onChange={(e) => setForm((f) => ({ ...f, pfApplicable: e.target.checked }))} /> PF (₹1800)
        </label>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={form.ptApplicable} onChange={(e) => setForm((f) => ({ ...f, ptApplicable: e.target.checked }))} /> PT (₹208)
        </label>
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

function AdjustModal({ row, monthLabel, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({
    extraWorkingDays: row.extraWorkingDays ? String(row.extraWorkingDays) : "",
    manualLopDays: "",
    manualWorkingDays: "",
    remarks: row.remarks || "",
    finalized: !!row.finalized,
  });
  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Adjust — {row.name}</div>
      <div style={{ fontSize: 13, color: "#64748b", margin: "3px 0 14px" }}>
        {monthLabel} · auto: {row.leaveDays} leave day(s), {row.lopDays} LOP, {row.workingDays} working days
      </div>
      <Field label="Extra working days (Sunday / holiday working — adds pay back)">
        <input type="number" step="0.5" value={form.extraWorkingDays} onChange={(e) => setForm((f) => ({ ...f, extraWorkingDays: e.target.value }))} style={{ ...inputS, width: "100%" }} placeholder="0" />
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
