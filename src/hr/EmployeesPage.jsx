import { useCallback, useEffect, useMemo, useState } from "react";
import { employeeApi, attachmentFullUrl } from "./hrApi";
import EmployeeProfilePage from "./EmployeeProfilePage";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const th = { padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "10px 14px", fontSize: 14, borderBottom: "1px solid #eef2f7", color: "#0f172a", verticalAlign: "middle" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function tenure(doj, dor) {
  if (!doj) return "—";
  const start = new Date(doj + "T00:00:00");
  const end = dor ? new Date(dor + "T00:00:00") : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (months < 0) return "—";
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y}y` : null, m || !y ? `${m}m` : null].filter(Boolean).join(" ");
}

function Avatar({ url, name, size = 36 }) {
  return url ? (
    <img src={attachmentFullUrl(url)} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid #e2e8f0" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4 }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

export default function EmployeesPage({ user }) {
  const canManage = ["ADMIN", "VP", "OH", "CEO"].includes(user?.role);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [deptF, setDeptF] = useState("");
  const [statusF, setStatusF] = useState("active"); // active | exited | all
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await employeeApi.list();
      setEmployees(r.data?.data || []);
    } catch { setEmployees([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter(e => {
      if (statusF === "active" && e.dor) return false;
      if (statusF === "exited" && !e.dor) return false;
      if (deptF && e.department !== deptF) return false;
      if (s && !`${e.fullName} ${e.personCode || ""} ${e.designation || ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [employees, q, deptF, statusF]);

  if (selectedId) {
    return <EmployeeProfilePage id={selectedId} user={user} onBack={() => { setSelectedId(null); load(); }} />;
  }

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      <div className="hr-hero" style={{ ...card, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, borderLeft: "4px solid #4338ca" }}>
        <div className="hr-hero-icon" style={{ width: 46, height: 46, borderRadius: 12, background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>👥</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Employee Master</div>
          <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 2 }}>
            Full employment history — active and exited — with PR/attendance stats and daily performance tracking for each person.
          </div>
        </div>
      </div>

      <div className="hr-filter-bar" style={{ ...card, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, designation…"
          style={{ ...inputS, minWidth: 220, flex: 1 }} />
        <select value={deptF} onChange={(e) => setDeptF(e.target.value)} style={{ ...inputS, background: "#fff" }}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="hr-pill-row" style={{ display: "flex", gap: 6 }}>
          {[["active", "Active"], ["exited", "Exited"], ["all", "All"]].map(([k, l]) => (
            <button key={k} onClick={() => setStatusF(k)}
              style={{ border: statusF === k ? "none" : "1.5px solid #e2e8f0", borderRadius: 20, padding: "6px 14px",
                background: statusF === k ? "#4338ca" : "#fff", color: statusF === k ? "#fff" : "#374151",
                fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" }}>
          {filtered.length} of {employees.length} employees
        </div>
        <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}></th>
                <th style={th}>Name</th>
                <th style={th}>Person Code</th>
                <th style={th}>Department</th>
                <th style={th}>Designation</th>
                <th style={th}>DOJ</th>
                <th style={th}>Tenure</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={8}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={8}>No employees match.</td></tr>
              ) : filtered.map(e => (
                <tr key={e.id} onClick={() => setSelectedId(e.id)} style={{ cursor: "pointer" }}
                  onMouseEnter={ev => ev.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                  <td style={{ ...td, width: 44 }}><Avatar url={e.photoUrl} name={e.fullName} /></td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{e.fullName}</div>
                    {e.linkedUsername && <div style={{ fontSize: 11.5, color: "#059669" }}>@{e.linkedUsername}</div>}
                  </td>
                  <td style={{ ...td, color: "#475569" }}>{e.personCode || "—"}</td>
                  <td style={td}>{e.department || "—"}</td>
                  <td style={td}>{e.designation || "—"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(e.doj)}</td>
                  <td style={td}>{tenure(e.doj, e.dor)}</td>
                  <td style={td}>
                    {e.dor ? (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#fef2f2", color: "#b91c1c" }}>Exited</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#ecfdf5", color: "#059669" }}>Active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
