import { useEffect, useState } from "react";
import { attendanceApi, leaveApi, usersApi, fmtTime, fmtHours, fmtDate } from "./hrApi";

const CHECKIN_ROLES = ["ENGINEER", "PROJECT_MANAGER", "ADMIN", "PROCUREMENT"];
const EXCLUDED_USERNAMES = ["techtinyproc", "shobana", "techtinyadmin", "happizo"];
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
  CANCELLED: { bg: "#f8fafc", color: "#94a3b8", label: "Cancelled" },
};

export default function HRDashboard({ user }) {
  const [today, setToday]           = useState(null);
  const [attSummary, setAttSum]     = useState(null);
  const [leaveSummary, setLeaveSum] = useState(null);
  const [recentLeaves, setLeaves]   = useState([]);
  const [todayAll, setTodayAll]     = useState([]);
  const [allUsers, setAllUsers]     = useState([]);
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
    }
  }, [user?.username]);

  const todayByUsername = new Map(todayAll.map(a => [a.username, a]));
  const checkinTargets  = allUsers.filter(u => CHECKIN_ROLES.includes(u.role) && !u.username?.startsWith("test_") && !EXCLUDED_USERNAMES.includes(u.username?.toLowerCase()));
  const checkedInCount  = checkinTargets.filter(u => todayByUsername.get(u.username)?.checkInTime).length;

  const card     = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 22px" };
  const secTitle = { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 };
  const secSub   = { fontSize: 12.5, color: "#94a3b8", marginBottom: 14 };
  const badge    = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" });
  const statCard = (accent) => ({
    background: "#fff", borderRadius: 12, padding: "18px 22px",
    flex: 1, border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`,
  });
  const th = { padding: "8px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, background: "#f8fafc", whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", fontSize: 13, color: "#334155", verticalAlign: "middle" };

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
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6, letterSpacing: "-0.3px" }}>
            Good {greeting}, {user?.fullName?.split(" ")[0]}
          </div>
          {today?.checkInTime ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)" }}>
              Checked in at {fmtTime(today.checkInTime)}
              {today.checkOutTime
                ? ` · Checked out at ${fmtTime(today.checkOutTime)} · ${fmtHours(today.totalMinutes)}`
                : " · Still working"}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>Not checked in yet today</div>
          )}
        </div>
        <div className="hr-hero-icon" style={{
          width: 56, height: 56, borderRadius: 14,
          background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
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
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{k.label}</div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
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
            <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No leave requests yet</div>
          ) : recentLeaves.map(l => {
            const s = LEAVE_STATUS[l.status] || LEAVE_STATUS.PENDING;
            return (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{l.leaveType} Leave</div>
                  <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{fmtDate(l.fromDate)} → {fmtDate(l.toDate)} · {l.totalDays}d</div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={secTitle}>Today's Team Attendance</div>
              <div style={secSub}>
                {checkedInCount} checked in · {checkinTargets.length - checkedInCount} not yet · {checkinTargets.length} total
              </div>
            </div>
          </div>
          <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Name</th>
                  <th style={th}>Designation</th>
                  <th style={th}>Check In</th>
                  <th style={th}>Check Out</th>
                  <th style={th}>Status</th>
                  <th style={th}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {checkinTargets.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: "24px 0" }}>Loading team data…</td>
                  </tr>
                ) : checkinTargets.map((u, i) => {
                  const a      = todayByUsername.get(u.username);
                  const hasIn  = !!a?.checkInTime;
                  const hasOut = !!a?.checkOutTime;
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ ...td, color: "#94a3b8", width: 36 }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600, color: "#0f172a" }}>{u.fullName}</td>
                      <td style={{ ...td, color: "#64748b" }}>{u.designation || ROLE_LABELS[u.role] || u.role}</td>
                      <td style={td}>{hasIn ? fmtTime(a.checkInTime) : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                      <td style={td}>{hasOut ? fmtTime(a.checkOutTime) : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                      <td style={td}>
                        <span style={badge(
                          !hasIn  ? { bg: "#fef2f2", color: "#dc2626" } :
                          hasOut  ? { bg: "#eff6ff", color: "#2563eb" } :
                                    { bg: "#ecfdf5", color: "#059669" }
                        )}>
                          {!hasIn ? "Not In" : hasOut ? "Checked Out" : "Working"}
                        </span>
                      </td>
                      <td style={{ ...td, color: "#94a3b8" }}>{a?.totalMinutes ? fmtHours(a.totalMinutes) : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
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
