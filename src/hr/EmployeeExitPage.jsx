import { useCallback, useEffect, useMemo, useState } from "react";
import { usersApi, EXIT_TYPES, fmtDate, fmtDateTime } from "./hrApi";

const ROLE_LABELS = {
  ENGINEER: "Site Engineer",
  PROJECT_MANAGER: "Project Manager",
  ADMIN: "Admin",
  PROCUREMENT: "Procurement",
  VP: "VP",
  OH: "OH",
  CEO: "CEO",
};

const EXIT_TYPE_LABEL = Object.fromEntries(EXIT_TYPES.map((t) => [t.value, t.label]));

const card = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};
const th = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  whiteSpace: "nowrap",
};
const td = { padding: "12px 14px", fontSize: 14, borderBottom: "1px solid #eef2f7", color: "#0f172a", verticalAlign: "top" };
const btn = (bg, fg = "#fff") => ({
  border: "none",
  borderRadius: 8,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 700,
  color: fg,
  background: bg,
  cursor: "pointer",
  fontFamily: "inherit",
});

export default function EmployeeExitPage({ user }) {
  const canManage = ["ADMIN", "VP"].includes(user?.role);
  const [active, setActive] = useState([]);
  const [exited, setExited] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null); // { emp }
  const [form, setForm] = useState({ exitDate: new Date().toISOString().slice(0, 10), exitType: "RESIGNED", exitReason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [a, x] = await Promise.all([
      usersApi.getAll().catch(() => ({ data: { data: [] } })),
      usersApi.getExited().catch(() => ({ data: { data: [] } })),
    ]);
    setActive((a.data?.data || []).filter((u) => !u.exited));
    setExited(x.data?.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return active;
    return active.filter((u) =>
      [u.fullName, u.username, u.email, u.designation, ROLE_LABELS[u.role]]
        .filter(Boolean).some((v) => v.toLowerCase().includes(s)));
  }, [active, q]);

  function openExit(emp) {
    setForm({ exitDate: new Date().toISOString().slice(0, 10), exitType: "RESIGNED", exitReason: "" });
    setModal({ emp });
  }

  async function submitExit() {
    if (!modal) return;
    setBusy(modal.emp.id);
    try {
      await usersApi.markExit(modal.emp.id, {
        exitDate: form.exitDate || null,
        exitType: form.exitType,
        exitReason: form.exitReason.trim() || null,
        markedBy: user?.fullName || user?.username,
      });
      setModal(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || "Could not mark exit");
    } finally {
      setBusy(null);
    }
  }

  async function reinstate(emp) {
    if (!window.confirm(`Reinstate ${emp.fullName}? They will be able to log in again.`)) return;
    setBusy(emp.id);
    try {
      await usersApi.reinstate(emp.id);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || "Could not reinstate");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      {/* Hero */}
      <div className="hr-hero" style={{ ...card, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, borderLeft: "4px solid #7c3aed" }}>
        <div className="hr-hero-icon" style={{ width: 46, height: 46, borderRadius: 12, background: "#f3e8ff", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🚪</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Employee Exit</div>
          <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 2 }}>
            Mark an employee as exited from Happizo. Their login is disabled — every record they created (PWJ entries, leaves, petty cash) stays in the system.
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Active Employees", value: active.length, color: "#059669" },
          { label: "Exited", value: exited.length, color: "#dc2626" },
        ].map((k) => (
          <div key={k.label} style={{ ...card, padding: "14px 20px", minWidth: 150 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color, marginTop: 2 }}>{loading ? "—" : k.value}</div>
          </div>
        ))}
      </div>

      {/* Active employees */}
      <div style={{ ...card, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #eef2f7" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Active Employees</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, email…"
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", minWidth: 220 }} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Emp No</th>
                <th style={th}>Employee</th>
                <th style={th}>Role / Designation</th>
                <th style={th}>Contact</th>
                <th style={th}>Joined</th>
                {canManage && <th style={{ ...th, textAlign: "right" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={canManage ? 6 : 5}>Loading…</td></tr>
              ) : activeFiltered.length === 0 ? (
                <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={canManage ? 6 : 5}>No employees match.</td></tr>
              ) : activeFiltered.map((u) => (
                <tr key={u.id}>
                  <td style={{ ...td, color: "#475569", whiteSpace: "nowrap" }}>{u.employeeNumber || "—"}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{u.fullName}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>@{u.username}</div>
                  </td>
                  <td style={td}>
                    <div>{ROLE_LABELS[u.role] || u.role}</div>
                    {u.designation && <div style={{ fontSize: 12, color: "#64748b" }}>{u.designation}</div>}
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 13 }}>{u.email || "—"}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{u.phone || ""}</div>
                  </td>
                  <td style={td}>{fmtDate(u.createdAt)}</td>
                  {canManage && (
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button disabled={busy === u.id || u.id === user?.id}
                        title={u.id === user?.id ? "You can't exit your own account" : ""}
                        onClick={() => openExit(u)}
                        style={{ ...btn("#fee2e2", "#b91c1c"), opacity: u.id === user?.id ? 0.4 : 1 }}>
                        Mark Exit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exited employees */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", fontSize: 15, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #eef2f7" }}>
          Exited Employees <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {exited.length}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Emp No</th>
                <th style={th}>Employee</th>
                <th style={th}>Role</th>
                <th style={th}>Exit Date</th>
                <th style={th}>Type</th>
                <th style={th}>Reason</th>
                <th style={th}>Marked By</th>
                {canManage && <th style={{ ...th, textAlign: "right" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={canManage ? 8 : 7}>Loading…</td></tr>
              ) : exited.length === 0 ? (
                <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={canManage ? 8 : 7}>No exited employees.</td></tr>
              ) : exited.map((u) => (
                <tr key={u.id}>
                  <td style={{ ...td, color: "#475569", whiteSpace: "nowrap" }}>{u.employeeNumber || "—"}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{u.fullName}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>@{u.username}</div>
                  </td>
                  <td style={td}>{ROLE_LABELS[u.role] || u.role}</td>
                  <td style={td}>{fmtDate(u.exitDate)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#fef2f2", color: "#b91c1c" }}>
                      {EXIT_TYPE_LABEL[u.exitType] || u.exitType || "—"}
                    </span>
                  </td>
                  <td style={{ ...td, maxWidth: 260, whiteSpace: "pre-wrap" }}>{u.exitReason || "—"}</td>
                  <td style={td}>
                    <div>{u.exitMarkedBy || "—"}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{fmtDateTime(u.exitMarkedAt) || ""}</div>
                  </td>
                  {canManage && (
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button disabled={busy === u.id} onClick={() => reinstate(u)} style={btn("#dcfce7", "#15803d")}>
                        Reinstate
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark-exit modal */}
      {modal && (
        <div onClick={() => setModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
          <div onClick={(e) => e.stopPropagation()} className="hr-edit-modal"
            style={{ background: "#fff", borderRadius: 16, width: 440, maxWidth: "94vw", padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,.28)" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Mark Exit — {modal.emp.fullName}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 3, marginBottom: 16 }}>
              @{modal.emp.username} · {ROLE_LABELS[modal.emp.role] || modal.emp.role}. Login is disabled immediately; their data is kept.
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#475569" }}>Last working day</label>
            <input type="date" value={form.exitDate} onChange={(e) => setForm((f) => ({ ...f, exitDate: e.target.value }))}
              style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", margin: "5px 0 14px", boxSizing: "border-box" }} />

            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#475569" }}>Exit type</label>
            <select value={form.exitType} onChange={(e) => setForm((f) => ({ ...f, exitType: e.target.value }))}
              style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", margin: "5px 0 14px", background: "#fff", boxSizing: "border-box" }}>
              {EXIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#475569" }}>Reason / notes</label>
            <textarea value={form.exitReason} onChange={(e) => setForm((f) => ({ ...f, exitReason: e.target.value }))}
              placeholder="Optional — context for the exit"
              style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", margin: "5px 0 18px", minHeight: 70, resize: "vertical", boxSizing: "border-box" }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setModal(null)} style={btn("#f1f5f9", "#334155")}>Cancel</button>
              <button disabled={busy === modal.emp.id} onClick={submitExit} style={btn("#dc2626")}>
                {busy === modal.emp.id ? "Saving…" : "Confirm Exit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
