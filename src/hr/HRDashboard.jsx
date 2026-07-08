import { useEffect, useState, useMemo } from "react";
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
  CANCELLED: { bg: "#f8fafc", color: "#374151", label: "Cancelled" },
};

export default function HRDashboard({ user }) {
  const [today, setToday]           = useState(null);
  const [attSummary, setAttSum]     = useState(null);
  const [leaveSummary, setLeaveSum] = useState(null);
  const [recentLeaves, setLeaves]   = useState([]);
  const [todayAll, setTodayAll]     = useState([]);
  const [allUsers, setAllUsers]     = useState([]);
  const [incomplete, setIncomplete]   = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [attFilter, setAttFilter]     = useState("all"); // all | permissions-today
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
      attendanceApi.getIncomplete().then(r => setIncomplete(r.data?.data || [])).catch(() => {});
      leaveApi.pending().then(r => setPendingLeaves(r.data?.data || [])).catch(() => {});
    }
  }, [user?.username]);

  const todayByUsername = new Map(todayAll.map(a => [a.username, a]));
  const checkinTargets  = allUsers.filter(u => CHECKIN_ROLES.includes(u.role) && !u.username?.startsWith("test_") && !EXCLUDED_USERNAMES.includes(u.username?.toLowerCase()));
  const checkedInCount  = checkinTargets.filter(u => todayByUsername.get(u.username)?.checkInTime).length;

  const pendingPermissions = pendingLeaves.filter(l => l.leaveType === "PERMISSION");

  const todayDate = new Date().toISOString().slice(0, 10);
  const permissionsApprovedToday = useMemo(() =>
    new Set(pendingLeaves
      .filter(l => l.leaveType === "PERMISSION" && l.status === "APPROVED" && l.fromDate === todayDate)
      .map(l => l.username)
    ), [pendingLeaves, todayDate]);

  const displayTargets = attFilter === "permissions-today"
    ? checkinTargets.filter(u => permissionsApprovedToday.has(u.username))
    : checkinTargets;

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

      {/* Needs Review — past records with missing check-out (auto-marked Absent) */}
      {isAdmin && incomplete.length > 0 && (
        <div className="hr-needs-review" style={{ ...card, marginBottom: 20, border: "1px solid #fca5a5", borderLeft: "4px solid #dc2626" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ ...secTitle, color: "#dc2626", marginBottom: 0 }}>Needs Review — Missing Check-Out</div>
              <div style={{ fontSize: 15, color: "#ef4444" }}>
                {incomplete.length} record{incomplete.length > 1 ? "s" : ""} auto-marked Absent — employee checked in but never checked out
              </div>
            </div>
          </div>
          <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Employee", "Date", "Check-In", "Location"].map(h => (
                    <th key={h} style={{ ...th, background: "#fef2f2" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incomplete.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #fee2e2" }}>
                    <td style={{ ...td, fontWeight: 600, color: "#0f172a" }}>{a.fullName}</td>
                    <td style={td}>{fmtDate(a.workDate)}</td>
                    <td style={td}>{fmtTime(a.checkInTime)}</td>
                    <td style={{ ...td, fontSize: 15, color: "#374151", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.checkInAddress || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 15, color: "#374151" }}>
            Go to <strong>All Attendance</strong> tab to correct check-in / check-out times.
          </div>
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
            {/* Filter pills */}
            <div className="hr-pill-row" style={{ display: "flex", gap: 6 }}>
              {[
                { key: "all",               label: "All" },
                { key: "permissions-today", label: "Permissions Today" },
              ].map(f => {
                const active = attFilter === f.key;
                return (
                  <button key={f.key} onClick={() => setAttFilter(f.key)}
                    style={{ border: active ? "none" : "1.5px solid #e2e8f0", borderRadius: 20, padding: "5px 13px",
                      background: active ? "#7c3aed" : "#fff", color: active ? "#fff" : "#000",
                      fontWeight: active ? 600 : 500, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                    {f.label}
                  </button>
                );
              })}
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
                {displayTargets.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: "#374151", padding: "24px 0" }}>
                      {attFilter === "permissions-today" ? "No approved permissions for today" : "Loading team data…"}
                    </td>
                  </tr>
                ) : displayTargets.map((u, i) => {
                  const a      = todayByUsername.get(u.username);
                  const hasIn  = !!a?.checkInTime;
                  const hasOut = !!a?.checkOutTime;
                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ ...td, color: "#374151", width: 36 }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600, color: "#0f172a" }}>{u.fullName}</td>
                      <td style={{ ...td, color: "#374151" }}>{u.designation || ROLE_LABELS[u.role] || u.role}</td>
                      <td style={td}>{hasIn ? fmtTime(a.checkInTime) : <span style={{ color: "#374151" }}>—</span>}</td>
                      <td style={td}>{hasOut ? fmtTime(a.checkOutTime) : <span style={{ color: "#374151" }}>—</span>}</td>
                      <td style={td}>
                        <span style={badge(
                          !hasIn  ? { bg: "#fef2f2", color: "#dc2626" } :
                          hasOut  ? { bg: "#eff6ff", color: "#2563eb" } :
                                    { bg: "#ecfdf5", color: "#059669" }
                        )}>
                          {!hasIn ? "Not In" : hasOut ? "Checked Out" : "Working"}
                        </span>
                      </td>
                      <td style={{ ...td, color: "#374151" }}>{a?.totalMinutes ? fmtHours(a.totalMinutes) : <span style={{ color: "#374151" }}>—</span>}</td>
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
