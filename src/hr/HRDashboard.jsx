import { useEffect, useMemo, useState } from "react";
import { attendanceApi, leaveApi, usersApi, employeeApi, performanceApi, fmtTime, fmtHours, fmtDate } from "./hrApi";

const CHECKIN_ROLES = ["ENGINEER", "PROJECT_MANAGER", "ADMIN", "PROCUREMENT"];
const EXCLUDED_USERNAMES = ["techtinyproc", "shobana", "techtinyadmin", "happizo"];
// Matched by employee number, not username — usernames can differ from what's shown as the
// display name, so this is the reliable way to keep specific test/admin accounts out of view.
const EXCLUDED_EMP_NOS = ["EMP0009", "EMP0019"];
const ROLE_LABELS = {
  ENGINEER: "Site Engineer",
  PROJECT_MANAGER: "PM",
  ADMIN: "Admin",
  PROCUREMENT: "Procurement",
};

const LEAVE_STATUS = {
  PENDING:   { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED:  { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  REJECTED:  { bg: "#fef2f2", color: "#dc2626", label: "Rejected" },
  CANCELLED: { bg: "#f8fafc", color: "#374151", label: "Cancelled" },
};

export default function HRDashboard({ user }) {
  const [today, setToday]           = useState(null);
  const [attSummary, setAttSum]     = useState(null);
  const [leaveSummary, setLeaveSum] = useState(null);
  const [recentLeaves, setLeaves]   = useState([]);
  const [todayAll, setTodayAll]     = useState([]);
  const [allUsers, setAllUsers]     = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [employees, setEmployees]   = useState([]);          // Employee Master rows, matched to users by linked login
  const [todayRemarks, setTodayRemarks] = useState([]);       // all comments recorded today
  const [draft, setDraft]           = useState({});           // employeeId -> text being typed
  const [savingId, setSavingId]     = useState(null);
  const isAdmin     = ["ADMIN","CEO","VP","OH"].includes(user?.role);
  const hidePersonal = ["VP","CEO","OH"].includes(user?.role);

  useEffect(() => {
    const u = user?.username;
    if (!u) return;
    attendanceApi.getToday(u).then(r => setToday(r.data?.data)).catch(() => {});
    attendanceApi.getSummary(u).then(r => setAttSum(r.data?.data)).catch(() => {});
    leaveApi.summary(u).then(r => setLeaveSum(r.data?.data)).catch(() => {});
    leaveApi.myLeaves(u).then(r => setLeaves((r.data?.data || []).slice(0, 5))).catch(() => {});
    if (isAdmin) {
      attendanceApi.getTodayAll().then(r => setTodayAll(r.data?.data || [])).catch(() => {});
      usersApi.getAll().then(r => setAllUsers(r.data?.data || [])).catch(() => {});
      leaveApi.pending().then(r => setPendingLeaves(r.data?.data || [])).catch(() => {});
      employeeApi.list().then(r => setEmployees(r.data?.data || [])).catch(() => {});
      performanceApi.byDate().then(r => setTodayRemarks(r.data?.data || [])).catch(() => {});
    }
  }, [user?.username]);

  // Dashboard row (login user) → Employee Master record, via the profile's linked username.
  const employeeByUsername = useMemo(
    () => new Map(employees.filter(e => e.linkedUsername).map(e => [e.linkedUsername.toLowerCase(), e])), [employees]);
  const remarksByEmployee = useMemo(() => {
    const m = new Map();
    todayRemarks.forEach(r => { if (!m.has(r.employeeId)) m.set(r.employeeId, []); m.get(r.employeeId).push(r); });
    return m;
  }, [todayRemarks]);
  // Same rule as the profile page: comments on management staff are CEO-only.
  const canRemark = (emp) => !!emp && (user?.role === "CEO" || !/management/i.test(emp.department || ""));

  const saveRemark = async (emp) => {
    const text = (draft[emp.id] || "").trim();
    if (!text || savingId) return;
    setSavingId(emp.id);
    try {
      const r = await performanceApi.add(emp.id, { date: new Date().toLocaleDateString("en-CA"), notes: text, actionBy: user?.fullName || user?.username, actorRole: user?.role });
      const saved = r.data?.data;
      if (saved) setTodayRemarks(list => [saved, ...list]);
      setDraft(d => ({ ...d, [emp.id]: "" }));
    } catch (e) { alert(e.response?.data?.message || "Could not save comment"); }
    finally { setSavingId(null); }
  };

  const todayByUsername = new Map(todayAll.map(a => [a.username, a]));
  const checkinTargets  = allUsers.filter(u => CHECKIN_ROLES.includes(u.role) && !u.username?.startsWith("test_")
    && !EXCLUDED_USERNAMES.includes(u.username?.toLowerCase()) && !EXCLUDED_EMP_NOS.includes(u.employeeNumber));
  const checkedInCount  = checkinTargets.filter(u => todayByUsername.get(u.username)?.checkInTime).length;

  const pendingPermissions = pendingLeaves.filter(l => l.leaveType === "PERMISSION");

  const card     = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 22px" };
  const secTitle = { fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 4 };
  const secSub   = { fontSize: 15, color: "#374151", marginBottom: 14 };
  const badge    = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" });
  const statCard = (accent) => ({
    background: "#fff", borderRadius: 12, padding: "18px 22px",
    flex: 1, border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`,
  });
  const th = { padding: "8px 12px", textAlign: "left", fontSize: 15, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, background: "#f8fafc", whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", fontSize: 16, color: "#1e293b", verticalAlign: "middle" };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 148px)" }}>

      {/* Hero */}
      <div className="hr-hero" style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        borderRadius: 14, padding: "22px 28px", marginBottom: 24,
        display: "flex", alignItems: "center", gap: 20,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
            Good {greeting}, {user?.fullName?.split(" ")[0]}
          </div>
          {today?.checkInTime ? (
            <div style={{ fontSize: 16, color: "rgba(255,255,255,.55)" }}>
              Checked in at {fmtTime(today.checkInTime)}
              {today.checkOutTime
                ? ` · Checked out at ${fmtTime(today.checkOutTime)} · ${fmtHours(today.totalMinutes)}`
                : " · Still working"}
            </div>
          ) : (
            <div style={{ fontSize: 16, color: "rgba(255,255,255,.35)" }}>Not checked in yet today</div>
          )}
        </div>
        <div className="hr-hero-icon" style={{
          width: 56, height: 56, borderRadius: 14,
          background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
        }}>
          {today?.checkInTime && !today?.checkOutTime ? "🏢" : today?.checkOutTime ? "🏠" : "⏰"}
        </div>
      </div>

      {/* Personal KPI row */}
      {!hidePersonal && (
        <div className="kpi-grid-4 hr-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Present (Month)", value: attSummary?.presentDays ?? "—", accent: "#059669" },
            { label: "Half Days",       value: attSummary?.halfDays    ?? "—", accent: "#d97706" },
            { label: "Leave Pending",   value: leaveSummary?.pending   ?? "—", accent: "#f59e0b" },
            { label: "Leave Approved",  value: leaveSummary?.approved  ?? "—", accent: "#1e3a5f" },
          ].map(k => (
            <div key={k.label} style={statCard(k.accent)}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#374151" }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Personal recent leaves */}
      {!hidePersonal && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={secTitle}>My Recent Leave Requests</div>
          <div style={secSub}>Latest 5 leave applications</div>
          {recentLeaves.length === 0 ? (
            <div style={{ color: "#374151", fontSize: 16, textAlign: "center", padding: "20px 0" }}>No leave requests yet</div>
          ) : recentLeaves.map(l => {
            const s = LEAVE_STATUS[l.status] || LEAVE_STATUS.PENDING;
            return (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{l.leaveType} Leave</div>
                  <div style={{ fontSize: 15, color: "#374151" }}>{fmtDate(l.fromDate)} → {fmtDate(l.toDate)} · {l.totalDays}d</div>
                </div>
                <span style={badge(s)}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Unified team attendance table (admin only) */}
      {isAdmin && (
        <div style={card}>
          <div className="hr-team-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={secTitle}>Today's Team Attendance</div>
              <div style={secSub}>
                {checkedInCount} checked in · {checkinTargets.length - checkedInCount} not yet · {checkinTargets.length} total
                {pendingPermissions.length > 0 && (
                  <span style={{ marginLeft: 10, background: "#f3e8ff", color: "#7c3aed", borderRadius: 5, padding: "2px 9px", fontSize: 15, fontWeight: 700 }}>
                    {pendingPermissions.length} permission{pendingPermissions.length > 1 ? "s" : ""} pending
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Emp No</th>
                  <th style={th}>Name</th>
                  <th style={th}>Designation</th>
                  <th style={th}>Check In</th>
                  <th style={th}>Check Out</th>
                  <th style={th}>Status</th>
                  <th style={th}>Hours</th>
                  <th style={{ ...th, minWidth: 280 }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {checkinTargets.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ ...td, textAlign: "center", color: "#374151", padding: "24px 0" }}>
                      Loading team data…
                    </td>
                  </tr>
                ) : checkinTargets.map((u, i) => {
                  const a      = todayByUsername.get(u.username);
                  const hasIn  = !!a?.checkInTime;
                  const hasOut = !!a?.checkOutTime;
                  // A synthetic leave-derived row (see AttendanceService.fillLeaveGaps) —
                  // approved leave for today, never a check-in to begin with.
                  const onLeave = !hasIn && a?.status === "ABSENT";
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ ...td, color: "#374151", width: 36 }}>{i + 1}</td>
                      <td style={{ ...td, color: "#475569", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{u.employeeNumber || "—"}</td>
                      <td style={{ ...td, fontWeight: 600, color: "#0f172a" }}>{u.fullName}</td>
                      <td style={{ ...td, color: "#374151" }}>{u.designation || ROLE_LABELS[u.role] || u.role}</td>
                      <td style={td}>{hasIn ? fmtTime(a.checkInTime) : <span style={{ color: "#374151" }}>—</span>}</td>
                      <td style={td}>{hasOut ? fmtTime(a.checkOutTime) : <span style={{ color: "#374151" }}>—</span>}</td>
                      <td style={td}>
                        <span title={onLeave ? a.notes : undefined} style={badge(
                          onLeave ? { bg: "#fef2f2", color: "#dc2626" } :
                          !hasIn  ? { bg: "#fffbeb", color: "#b45309" } :
                          hasOut  ? { bg: "#eff6ff", color: "#2563eb" } :
                                    { bg: "#ecfdf5", color: "#059669" }
                        )}>
                          {onLeave ? "Absent" : !hasIn ? "Not In" : hasOut ? "Checked Out" : "Working"}
                        </span>
                      </td>
                      <td style={{ ...td, color: "#374151" }}>{a?.totalMinutes ? fmtHours(a.totalMinutes) : <span style={{ color: "#374151" }}>—</span>}</td>
                      <td style={{ ...td, verticalAlign: "top" }}>
                        {(() => {
                          const emp = employeeByUsername.get((u.username || "").toLowerCase());
                          if (!emp) return <span style={{ color: "#94a3b8", fontSize: 14 }} title="Link this login to an Employee Master profile to add comments">—</span>;
                          const list = remarksByEmployee.get(emp.id) || [];
                          return (
                            <div>
                              {list.slice(0, 2).map(r => (
                                <div key={r.id} style={{ fontSize: 14, color: "#334155", marginBottom: 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                                  {r.notes} <span style={{ color: "#94a3b8", fontSize: 12.5 }}>· {fmtTime(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ""}</span>
                                </div>
                              ))}
                              {list.length > 2 && <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 4 }}>+{list.length - 2} more today — see the profile</div>}
                              {canRemark(emp) ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input value={draft[emp.id] || ""} placeholder="Add feedback…" maxLength={1000}
                                    onChange={e => setDraft(d => ({ ...d, [emp.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") saveRemark(emp); }}
                                    style={{ flex: 1, minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 9px", fontSize: 14, fontFamily: "inherit" }} />
                                  <button onClick={() => saveRemark(emp)} disabled={!(draft[emp.id] || "").trim() || savingId === emp.id}
                                    style={{ border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", color: "#fff",
                                      background: (draft[emp.id] || "").trim() ? "#1e3a5f" : "#cbd5e1", cursor: (draft[emp.id] || "").trim() ? "pointer" : "not-allowed" }}>
                                    {savingId === emp.id ? "…" : "Add"}
                                  </button>
                                </div>
                              ) : <span style={{ color: "#94a3b8", fontSize: 13 }}>CEO only</span>}
                            </div>
                          );
                        })()}
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
  );
}
