import { useCallback, useEffect, useState } from "react";
import { employeeApi, salaryApi, downloadPayslip } from "./hrApi";
import EmployeeProfilePage from "./EmployeeProfilePage";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Self-service payslip download — fetches the one Salary Sheet row that
// matches this logged-in user's own account (by userId, not by the
// Employee Master link) so it works even if Employee Master isn't linked.
function MyPayslip({ user }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload() {
    setBusy(true);
    setError("");
    try {
      const r = await salaryApi.getSheet(year, month);
      const rows = r.data?.data || [];
      const mine = rows.find((row) => row.userId === user?.id);
      if (!mine) {
        setError("No salary structure found for you in this month — ask HR if this looks wrong.");
        return;
      }
      downloadPayslip(mine, year, month);
    } catch {
      setError("Could not load salary data — try again.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ ...card, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>My Payslip</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>
        Generated fresh from your salary data for the month you pick — nothing is stored until you download.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={inputS}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={inputS}>
          {[year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={handleDownload} disabled={busy} style={{ ...btn("#0f766e"), opacity: busy ? 0.6 : 1 }}>
          {busy ? "Loading…" : "📄 Download Payslip"}
        </button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "#b91c1c", marginTop: 10 }}>{error}</div>}
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
