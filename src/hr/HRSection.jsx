import { useState } from "react";
import HRDashboard from "./HRDashboard";
import AttendancePage from "./AttendancePage";
import LeavePage from "./LeavePage";
import LeaveApprovalPage from "./LeaveApprovalPage";
import PettyCashPage from "./PettyCashPage";

export default function HRSection({ user }) {
  const isApprover  = ["VP", "OH", "ADMIN", "CEO"].includes(user?.role);
  const canViewAll  = ["VP", "OH", "ADMIN", "CEO"].includes(user?.role);
  const hidePersonal = ["CEO", "OH", "VP"].includes(user?.role);
  const canViewReimbursement = ["CEO", "VP", "OH"].includes(user?.role);

  const tabs = [
    { key: "dashboard",      label: "Dashboard" },
    ...(hidePersonal ? [] : [
      { key: "attendance",   label: "Attendance" },
      { key: "leaves",       label: "My Leaves" },
    ]),
    { key: "petty-cash",     label: "Petty Cash" },
    ...(canViewReimbursement ? [{ key: "reimbursement", label: "Reimbursement" }] : []),
    ...(isApprover  ? [{ key: "approvals",      label: "Leave Approvals" }] : []),
    ...(canViewAll  ? [{ key: "all-attendance", label: "All Attendance"  }] : []),
  ];

  const [tab, setTab] = useState("dashboard");

  return (
    <div style={{ background: "#f1f5f9", minHeight: "calc(100vh - 108px)", fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`
        @media (max-width: 768px) {
          .hr-page { padding: 12px 16px !important; }
          .sub-nav { padding: 0 4px !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .sub-nav::-webkit-scrollbar { display: none; }
          .sub-nav button { padding: 10px 12px !important; font-size: 12px !important; }
          .hr-hero { padding: 14px 16px !important; gap: 10px !important; }
          .hr-hero-icon { width: 42px !important; height: 42px !important; font-size: 22px !important; flex-shrink: 0; }
          .hr-kpi-grid { grid-template-columns: repeat(2,1fr) !important; gap: 10px !important; margin-bottom: 16px !important; }
          .hr-kpi-grid > div, .hr-stat-flex > div { padding: 14px 14px !important; }
          .hr-admin-grid { grid-template-columns: 1fr !important; }
          .hr-stat-flex { flex-wrap: wrap !important; gap: 10px !important; max-width: 100% !important; }
          .hr-stat-flex > div { flex: 1 1 calc(50% - 5px) !important; min-width: 0 !important; }
          .hr-check-card { max-width: 100% !important; }
          .hr-form-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .hr-approval-card { padding: 14px 16px !important; }
          .hr-approval-body { flex-direction: column !important; gap: 12px !important; }
          .hr-leave-info-grid { grid-template-columns: repeat(2,1fr) !important; gap: 6px 12px !important; }
          .hr-approval-action { width: 100% !important; min-width: 0 !important; }
          .table-scroll-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        }
      `}</style>
      {/* Sub-nav — matches main app tab style exactly */}
      <div className="sub-nav" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", display: "flex", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
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
      {tab === "petty-cash"     && <PettyCashPage user={user} title="Petty Cash" defaultTab={canViewReimbursement ? "all" : "mine"} />}
      {tab === "reimbursement"  && <PettyCashPage user={user} title="Reimbursement" defaultTab="mine" />}
      {tab === "approvals"      && <LeaveApprovalPage user={user} />}
      {tab === "all-attendance" && <AttendancePage user={user} adminView />}
    </div>
  );
}
