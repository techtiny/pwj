import { useState } from "react";
import HRDashboard from "./HRDashboard";
import AttendancePage from "./AttendancePage";
import LeavePage from "./LeavePage";
import LeaveApprovalPage from "./LeaveApprovalPage";
import PettyCashPage from "./PettyCashPage";

export default function HRSection({ user }) {
  const isApprover = ["VP", "OH", "ADMIN", "CEO"].includes(user?.role);
  const isAdmin    = ["ADMIN", "CEO"].includes(user?.role);

  const tabs = [
    { key: "dashboard",      label: "Dashboard" },
    { key: "attendance",     label: "Attendance" },
    { key: "leaves",       label: "My Leaves" },
    { key: "petty-cash",   label: "Petty Cash" },
    ...(isApprover ? [{ key: "approvals",      label: "Leave Approvals" }] : []),
    ...(isAdmin    ? [{ key: "all-attendance", label: "All Attendance"  }] : []),
  ];

  const [tab, setTab] = useState("dashboard");

  return (
    <div style={{ background: "#f1f5f9", minHeight: "calc(100vh - 108px)", fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Sub-nav — matches main app tab style exactly */}
      <div className="sub-nav" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", display: "flex" }}>
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                padding: "14px 22px", fontSize: 13.5, fontWeight: active ? 600 : 500,
                color: active ? "#0f172a" : "#94a3b8",
                borderBottom: active ? "2.5px solid #1e3a5f" : "2.5px solid transparent",
                marginBottom: -1, letterSpacing: 0.1, whiteSpace: "nowrap",
              }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard"      && <HRDashboard user={user} />}
      {tab === "attendance"     && <AttendancePage user={user} />}
      {tab === "leaves"         && <LeavePage user={user} />}
      {tab === "petty-cash"     && <PettyCashPage user={user} />}
      {tab === "approvals"      && <LeaveApprovalPage user={user} />}
      {tab === "all-attendance" && <AttendancePage user={user} adminView />}
    </div>
  );
}
