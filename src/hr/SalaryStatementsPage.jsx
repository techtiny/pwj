import { useCallback, useEffect, useMemo, useState } from "react";
import { ApproveBtn, RejectBtn } from "../ActionButtons";
import { statementApi, fmtServerDate } from "./hrApi";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const th = { padding: "10px 12px", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 15, borderBottom: "1px solid #eef2f7", color: "#0f172a" };
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" };
const ST = {
  PENDING:  { bg: "#fffbeb", color: "#b45309", label: "Pending" },
  APPROVED: { bg: "#ecfdf5", color: "#047857", label: "Approved" },
  REJECTED: { bg: "#fef2f2", color: "#b91c1c", label: "Rejected" },
};
export const StatementPill = ({ status }) => {
  const s = ST[status] || ST.PENDING;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>;
};

// Admin / VP: approve or reject salary-statement requests. Employees download only after approval.
export default function SalaryStatementsPage({ user }) {
  const canApprove = user?.role === "ADMIN" || user?.role === "VP";
  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>Salary Statements</div>
      <div style={{ fontSize: 15.5, color: "#000", margin: "2px 0 16px" }}>
        Salary statements are locked for everyone. An employee can download a month's statement only after Admin or VP approves their request.
      </div>
      {canApprove && <PendingStatements user={user} />}
      <SalaryStatementMonitor user={user} />
    </div>
  );
}

function PendingStatements({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await statementApi.pending(user?.username)).data?.data || []); } catch { setRows([]); }
    setLoading(false);
  }, [user?.username]);
  useEffect(() => { load(); }, [load]);

  async function approve(r) {
    setBusy(r.id);
    try { await statementApi.approve(r.id, { username: user?.username }); await load(); }
    catch (e) { alert(e.response?.data?.message || "Could not approve"); }
    finally { setBusy(null); }
  }
  async function reject(r) {
    const c = window.prompt(`Reason for rejecting ${r.fullName}'s ${MONTHS[r.month - 1]} ${r.year} statement:`);
    if (c === null) return;
    if (!c.trim()) { alert("Enter a reason for rejecting"); return; }
    setBusy(r.id);
    try { await statementApi.reject(r.id, { username: user?.username, comment: c.trim() }); await load(); }
    catch (e) { alert(e.response?.data?.message || "Could not reject"); }
    finally { setBusy(null); }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Waiting for approval</div>
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>Requested</th><th style={th}>Employee</th><th style={th}>Month</th><th style={{ ...th, textAlign: "center" }}>Action</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td style={td} colSpan={4}>Loading…</td></tr>
                : rows.length === 0 ? <tr><td style={td} colSpan={4}>No salary statement requests waiting for approval.</td></tr>
                : rows.map((r) => {
                  const own = r.username === user?.username;
                  return (
                    <tr key={r.id}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtServerDate(r.createdAt)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.fullName}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{MONTHS[r.month - 1]} {r.year}</td>
                      <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                        {own ? <span style={{ fontSize: 13.5, color: "#475569" }}>Another Admin / VP must approve</span> : (
                          <span style={{ display: "inline-flex", gap: 8 }}>
                            <ApproveBtn disabled={busy === r.id} onClick={() => approve(r)} />
                            <RejectBtn disabled={busy === r.id} onClick={() => reject(r)} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// HR dashboard card for VP / OH / CEO / Admin — every salary statement requested, who approved it, and whether it was downloaded.
export function SalaryStatementMonitor({ user }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  useEffect(() => {
    if (!user?.username) return;
    statementApi.all(user.username).then((r) => setRows(r.data?.data || [])).catch(() => setRows([]));
  }, [user?.username]);
  const shown = useMemo(() => rows.filter((r) =>
    (status === "ALL" || r.status === status) && (!q.trim() || r.fullName.toLowerCase().includes(q.trim().toLowerCase()))), [rows, q, status]);
  const count = (st) => rows.filter((r) => r.status === st).length;
  return (
    <div style={{ ...card, padding: 18, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Salary Statements Issued</div>
          <div style={{ fontSize: 13.5, color: "#475569" }}>
            {rows.length} requested · {count("APPROVED")} approved · {count("PENDING")} pending · {count("REJECTED")} rejected · {rows.reduce((t, r) => t + (r.downloadCount || 0), 0)} downloads
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee…" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 10px", fontSize: 14, fontFamily: "inherit" }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 10px", fontSize: 14, fontFamily: "inherit" }}>
            <option value="ALL">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Employee</th><th style={th}>Month</th><th style={th}>Requested</th><th style={th}>Status</th>
            <th style={th}>Decided by</th><th style={th}>Downloads</th><th style={th}>Last download</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 ? <tr><td style={td} colSpan={7}>No salary statement requests yet.</td></tr> : shown.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 600 }}>{r.fullName}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{MONTHS[r.month - 1]} {r.year}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtServerDate(r.createdAt)}</td>
                <td style={td}><StatementPill status={r.status} /></td>
                <td style={td}>{r.decidedBy ? `${r.decidedBy}${r.decidedByRole ? ` (${r.decidedByRole})` : ""}` : "—"}</td>
                <td style={td}>{r.downloadCount || 0}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{r.lastDownloadedAt ? fmtServerDate(r.lastDownloadedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
