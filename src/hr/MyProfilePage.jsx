import { useCallback, useEffect, useState } from "react";
import { employeeApi, salaryApi, statementApi, downloadPayslip, currentPayrollMonth } from "./hrApi";
import EmployeeProfilePage from "./EmployeeProfilePage";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const ST = {
  PENDING:  { bg: "#fffbeb", color: "#b45309", label: "Waiting for approval" },
  APPROVED: { bg: "#ecfdf5", color: "#047857", label: "Approved" },
  REJECTED: { bg: "#fef2f2", color: "#b91c1c", label: "Rejected" },
};

// Salary statements are locked: request a month → Admin / VP approves → download that month's payslip.
// The payslip itself is still built on demand from the salary sheet row that matches this login (by userId).
function MyPayslip({ user }) {
  const payroll = currentPayrollMonth(); // 1st–7th of a month is still last month's payroll
  const [year, setYear] = useState(payroll.year);
  const [month, setMonth] = useState(payroll.month);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!user?.username) return;
    statementApi.mine(user.username).then((r) => setRows(r.data?.data || [])).catch(() => setRows([]));
  }, [user?.username]);
  useEffect(() => { load(); }, [load]);

  async function requestIt() {
    setBusy("req"); setError("");
    try { await statementApi.request({ username: user?.username, year, month }); load(); }
    catch (e) { setError(e.response?.data?.message || "Could not send the request"); }
    finally { setBusy(null); }
  }

  async function download(r) {
    setBusy(r.id); setError("");
    try {
      const sheet = await salaryApi.getSheet(r.year, r.month);
      const mine = (sheet.data?.data || []).find((row) => row.userId === user?.id);
      if (!mine) { setError("No salary structure found for you in this month — ask HR if this looks wrong."); return; }
      await statementApi.downloaded(r.id, { username: user?.username });   // counted for the monitoring log
      downloadPayslip(mine, r.year, r.month);
      load();
    } catch (e) { setError(e.response?.data?.message || "Could not load salary data — try again."); }
    finally { setBusy(null); }
  }

  return (
    <div style={{ ...card, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>My Salary Statement</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>
        Request the month you need. Once Admin or VP approves it, you can download that month's statement.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={inputS}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={inputS}>
          {[payroll.year - 2, payroll.year - 1, payroll.year, payroll.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={requestIt} disabled={busy === "req"} style={{ ...btn("#0f766e"), opacity: busy === "req" ? 0.6 : 1 }}>
          {busy === "req" ? "Sending…" : "Request Salary Statement"}
        </button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "#b91c1c", marginTop: 10 }}>{error}</div>}
      {rows.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid #eef2f7" }}>
          {rows.map((r) => {
            const st = ST[r.status] || ST.PENDING;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140, fontSize: 14, fontWeight: 600 }}>{MONTHS[r.month - 1]} {r.year}</div>
                <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                {r.status === "REJECTED" && r.comment && <span style={{ fontSize: 12.5, color: "#b91c1c" }}>{r.comment}</span>}
                {r.status === "APPROVED" && (
                  <button onClick={() => download(r)} disabled={busy === r.id} style={{ ...btn("#0f766e"), padding: "6px 12px", opacity: busy === r.id ? 0.6 : 1 }}>
                    {busy === r.id ? "Loading…" : "📄 Download"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MyProfilePage({ user }) {
  const [empId, setEmpId] = useState(undefined); // undefined = loading, null = not linked

  const load = useCallback(async () => {
    try {
      const r = await employeeApi.list();
      const list = r.data?.data || [];
      const mine = list.find((e) => (e.linkedUsername || "").toLowerCase() === (user?.username || "").toLowerCase());
      setEmpId(mine ? mine.id : null);
    } catch { setEmpId(null); }
  }, [user?.username]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ padding: "24px 32px 0" }}>
        <MyPayslip user={user} />
      </div>
      {empId === undefined ? (
        <div className="hr-page" style={{ padding: "0 32px 24px" }}>Loading profile…</div>
      ) : empId === null ? (
        <div className="hr-page" style={{ padding: "0 32px 24px" }}>
          <div style={{ ...card, padding: "20px 24px", color: "#64748b", textAlign: "center" }}>
            Your login isn't linked to an Employee Master record yet — ask Admin/HR to link it so your profile (photo, tenure, stats) shows up here.
          </div>
        </div>
      ) : (
        <EmployeeProfilePage id={empId} user={user} onBack={null} />
      )}
    </div>
  );
}
