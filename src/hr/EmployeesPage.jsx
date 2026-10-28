import { useCallback, useEffect, useMemo, useState } from "react";
import { employeeApi, usersApi, attachmentFullUrl, isExitedEmp, tenureMonths } from "./hrApi";
import EmployeeProfilePage from "./EmployeeProfilePage";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const th = { padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "10px 14px", fontSize: 14, borderBottom: "1px solid #eef2f7", color: "#0f172a", verticalAlign: "middle" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function tenure(emp) {
  const months = tenureMonths(emp);
  if (months == null) return "—";
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
  const [addOpen, setAddOpen] = useState(false);
  const [appUsers, setAppUsers] = useState([]);
  const BLANK = { fullName: "", doj: "", dob: "", gender: "", department: "", designation: "", personCode: "", linkedUsername: "" };
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

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
      if (statusF === "active" && isExitedEmp(e)) return false;
      if (statusF === "exited" && !isExitedEmp(e)) return false;
      if (deptF && e.department !== deptF) return false;
      if (s && !`${e.fullName} ${e.personCode || ""} ${e.designation || ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [employees, q, deptF, statusF]);

  const openAdd = () => {
    setForm(BLANK); setFormErr(""); setAddOpen(true);
    usersApi.getAll().then(r => setAppUsers((r.data?.data || []).filter(u => !u.exited))).catch(() => setAppUsers([]));
  };
  // Logins not yet attached to an employee record.
  const freeUsers = useMemo(() => {
    const taken = new Set(employees.map(e => (e.linkedUsername || "").toLowerCase()).filter(Boolean));
    return appUsers.filter(u => !taken.has((u.username || "").toLowerCase()));
  }, [appUsers, employees]);

  const saveEmployee = async () => {
    if (!form.fullName.trim()) { setFormErr("Enter the employee's full name"); return; }
    if (!form.doj) { setFormErr("Enter the date of joining"); return; }
    setSaving(true); setFormErr("");
    try {
      const r = await employeeApi.create(form);
      setAddOpen(false);
      await load();
      const created = r.data?.data;
      if (created?.id) setSelectedId(created.id);
    } catch (e) { setFormErr(e.response?.data?.message || "Could not add the employee"); }
    finally { setSaving(false); }
  };

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
        {canManage && (
          <button onClick={openAdd} style={{ marginLeft: "auto", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#4338ca", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            + Add Employee
          </button>
        )}
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
                  <td style={td}>{tenure(e)}</td>
                  <td style={td}>
                    {isExitedEmp(e) ? (
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
      {addOpen && (
        <div onClick={() => setAddOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Add employee"
            style={{ background: "#fff", borderRadius: 16, width: 560, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,.28)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Add Employee</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Onboard a new employee into the Employee Master. The person code is generated automatically.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["fullName", "Full name *", "text", { full: true }],
                ["doj", "Date of joining *", "date"],
                ["dob", "Date of birth", "date"],
                ["gender", "Gender", "select", { options: ["", "M", "F", "Other"] }],
                ["personCode", "Person code (optional)", "text", { placeholder: "Auto, e.g. H-26-0055" }],
                ["department", "Department", "text", { list: "dept-list" }],
                ["designation", "Designation", "text"],
              ].map(([k, label, type, o = {}]) => (
                <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: o.full ? "1 / -1" : undefined, fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
                  {label}
                  {type === "select" ? (
                    <select value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ ...inputS, background: "#fff" }}>
                      {o.options.map(v => <option key={v} value={v}>{v || "—"}</option>)}
                    </select>
                  ) : (
                    <input type={type} value={form[k]} list={o.list} placeholder={o.placeholder} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={inputS} />
                  )}
                </label>
              ))}
              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1", fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
                Link to app login (optional)
                <select value={form.linkedUsername} onChange={e => setForm(f => ({ ...f, linkedUsername: e.target.value }))} style={{ ...inputS, background: "#fff" }}>
                  <option value="">— None —</option>
                  {freeUsers.map(u => <option key={u.id} value={u.username}>{u.fullName} (@{u.username})</option>)}
                </select>
              </label>
            </div>
            <datalist id="dept-list">{departments.map(d => <option key={d} value={d} />)}</datalist>
            {formErr && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginTop: 12 }}>{formErr}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={() => setAddOpen(false)} style={{ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#374151", background: "#f1f5f9", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={saveEmployee} disabled={saving} style={{ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#4338ca", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : "Add Employee"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
