import { useEffect, useState } from "react";
import { LayoutDashboard, UserRound, CalendarCheck, CalendarOff, Wallet, Users, FileText } from "lucide-react";
import NavBar from "../NavBar";
import HRDashboard from "./HRDashboard";
import AttendancePage from "./AttendancePage";
import LeavePage from "./LeavePage";
import LeaveApprovalPage from "./LeaveApprovalPage";
import PettyCashPage from "./PettyCashPage";
import AdvancePage from "./AdvancePage";
import SalaryStatementsPage from "./SalaryStatementsPage";
import EmployeeExitPage from "./EmployeeExitPage";
import EmployeesPage from "./EmployeesPage";
import SalaryPage from "./SalaryPage";
import MyProfilePage from "./MyProfilePage";

// One icon per top-level HR menu item.
const NAV_ICONS = { dashboard: LayoutDashboard, "my-profile": UserRound, attendance: CalendarCheck, leave: CalendarOff, expenses: Wallet, people: Users, "salary-statements": FileText };

export default function HRSection({ user, initialTab, onConsumeInitialTab, notifs = [] }) {
  // Pending counts per sub-tab (notification.tab) — shown on the pill, and summed onto its top-menu group.
  const tabCount = {};
  notifs.filter(n => n.module === "hr").forEach(n => { tabCount[n.tab] = (tabCount[n.tab] || 0) + Number(n.count || 0); });
  const isApprover  = ["VP", "OH", "ADMIN", "CEO"].includes(user?.role);
  const canViewAll  = ["VP", "OH", "ADMIN", "CEO", "PROJECT_MANAGER"].includes(user?.role);
  const hidePersonal = ["CEO", "OH", "VP"].includes(user?.role);
  const canViewReimbursement = ["CEO", "VP", "OH", "ADMIN"].includes(user?.role);
  // Reimbursement tab itself is open to every Engineer-type role too (ENGINEER,
  // PROCUREMENT_ENGINEER, COSTING_PLANNING_ENGINEER, ...), but they still default to
  // "My Entries" (only canViewReimbursement above decides Petty Cash's default "all" vs "mine").
  const canViewReimbursementTab = canViewReimbursement || (user?.role || "").includes("ENGINEER");
  const canViewExits = ["ADMIN", "VP", "CEO", "OH"].includes(user?.role);

  // Grouped nav: a handful of top-level tabs, each holding the related pages
  // as sub-tabs (shown as a second pill row only when a group has more than
  // one). The actual `tab` keys below are unchanged from before grouping, so
  // every render condition further down still matches as-is.
  const groups = [
    { key: "dashboard", label: "Dashboard", tabs: [{ key: "dashboard", label: "Dashboard" }] },
    { key: "my-profile", label: "My Profile", tabs: [{ key: "my-profile", label: "My Profile" }] },
    {
      key: "attendance",
      label: "Attendance",
      tabs: [
        ...(hidePersonal ? [] : [{ key: "attendance", label: "My Attendance" }]),
        ...(canViewAll ? [{ key: "all-attendance", label: "Team Attendance" }] : []),
      ],
    },
    {
      key: "leave",
      label: "Leave/Permission",
      tabs: [
        ...(hidePersonal ? [] : [{ key: "leaves", label: "My Leaves" }]),
        ...(isApprover ? [{ key: "approvals", label: "Approvals" }] : []),
      ],
    },
    {
      key: "expenses",
      label: "Claims/Advance",
      tabs: [
        { key: "petty-cash", label: "Petty Cash" },
        ...(canViewReimbursementTab ? [{ key: "reimbursement", label: "Reimbursement" }] : []),
        { key: "advance", label: "Advance" },
      ],
    },
    ...(["ADMIN", "VP", "OH", "CEO"].includes(user?.role) ? [{
      key: "salary-statements",
      label: "Salary Statements",
      tabs: [{ key: "salary-statements", label: "Salary Statements" }],
    }] : []),
    ...(canViewExits ? [{
      key: "people",
      label: "Employee Master",
      tabs: [
        { key: "employee-master", label: "Employee Profiles" },
        { key: "employees",       label: "Employee Exit" },
        { key: "salary",          label: "Salary" },
      ],
    }] : []),
  ].filter(g => g.tabs.length > 0);

  const [tab, setTab] = useState(initialTab || "dashboard");
  const activeGroup = groups.find(g => g.tabs.some(t => t.key === tab)) || groups[0];

  // Lets a caller (e.g. clicking the header avatar) jump straight to a sub-tab
  // whether HRSection is already mounted or is mounting fresh for this — runs
  // on every mount too, so the useState initializer above isn't load-bearing
  // on its own, just a head start for the common "navigating in fresh" case.
  useEffect(() => {
    if (initialTab) { setTab(initialTab); onConsumeInitialTab?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "calc(100vh - 108px)", fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`
        @media (max-width: 768px) {
          /* General page */
          .hr-page { padding: 12px 16px !important; }


          /* Hero banner */
          .hr-hero { padding: 14px 16px !important; gap: 10px !important; }
          .hr-hero-icon { width: 42px !important; height: 42px !important; font-size: 22px !important; flex-shrink: 0; }

          /* KPI cards */
          .hr-kpi-grid { grid-template-columns: repeat(2,1fr) !important; gap: 10px !important; margin-bottom: 16px !important; }
          .hr-kpi-grid > div, .hr-stat-flex > div { padding: 12px 12px !important; }
          .hr-kpi-grid > div div:last-child, .hr-stat-flex > div div:last-child { font-size: 26px !important; }

          /* Stat cards row */
          .hr-stat-flex { flex-wrap: wrap !important; gap: 10px !important; max-width: 100% !important; }
          .hr-stat-flex > div { flex: 1 1 calc(50% - 5px) !important; min-width: 0 !important; }

          /* Admin grid */
          .hr-admin-grid { grid-template-columns: 1fr !important; }

          /* Check-in card */
          .hr-check-card { max-width: 100% !important; }
          .att-timeline { gap: 0 !important; }
          .att-line { top: 16px !important; }

          /* Form */
          .hr-form-grid { grid-template-columns: 1fr !important; gap: 12px !important; }

          /* Filter bar — stacks inputs vertically */
          .hr-filter-bar { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; padding: 12px 14px !important; }
          .hr-filter-bar > div { width: 100% !important; }
          .hr-filter-bar select,
          .hr-filter-bar input[type="date"] { width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }

          /* Pill/tab rows — wrap */
          .hr-pill-row { flex-wrap: wrap !important; gap: 6px !important; margin-bottom: 14px !important; }
          .hr-pill-row button { font-size: 12px !important; padding: 6px 12px !important; }

          /* Page header (title + action button) */
          .hr-page-header { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          .hr-page-header button { width: 100% !important; justify-content: center !important; }

          /* Permission hour buttons */
          .hr-perm-hours { flex-wrap: wrap !important; gap: 6px !important; }
          .hr-perm-hours button { flex: 1 1 calc(33% - 4px) !important; min-width: 0 !important; }
          .hr-perm-hours input[type="number"] { width: 100% !important; box-sizing: border-box !important; }

          /* Team header (title + filter pills) */
          .hr-team-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }

          /* Approval cards */
          .hr-approval-card { padding: 14px 16px !important; }
          .hr-approval-body { flex-direction: column !important; gap: 12px !important; }
          .hr-leave-info-grid { grid-template-columns: repeat(2,1fr) !important; gap: 6px 12px !important; }
          .hr-approval-action { width: 100% !important; min-width: 0 !important; }

          /* Edit modal */
          .hr-edit-modal { width: 92vw !important; padding: 20px 16px !important; max-height: 90vh; overflow-y: auto; }

          /* Tables */
          .table-scroll-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }

          /* Needs review section */
          .hr-needs-review { padding: 14px 14px !important; }
        }
      `}</style>
      {/* Top menu bar */}
      <NavBar ariaLabel="HR menu" active={activeGroup.key}
        items={groups.map(g => ({ key: g.key, label: g.label, icon: NAV_ICONS[g.key], badge: g.tabs.reduce((t, x) => t + (tabCount[x.key] || 0), 0) }))}
        onChange={key => setTab(groups.find(g => g.key === key).tabs[0].key)} />

      {/* Second-level pills — only shown when the active group has more than one page */}
      {activeGroup.tabs.length > 1 && (
        <div className="hr-pill-row" style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "12px 32px" }}>
          <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8edf4", borderRadius: 11, maxWidth: "100%", overflowX: "auto" }}>
            {activeGroup.tabs.map(t => {
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{
                    border: "none", borderRadius: 8, padding: "8px 20px",
                    background: active ? "#fff" : "transparent", color: active ? "#1e3a5f" : "#334155",
                    boxShadow: active ? "0 1px 3px rgba(15,23,42,.18)" : "none",
                    fontWeight: active ? 700 : 500, fontSize: 15, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                    transition: "background .15s, color .15s",
                  }}>
                  {t.label}
                  {tabCount[t.key] > 0 && <span className="nav-badge" style={{ marginLeft: 8 }}>{tabCount[t.key] > 99 ? "99+" : tabCount[t.key]}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === "dashboard"      && <HRDashboard user={user} />}
      {tab === "my-profile"     && <MyProfilePage user={user} />}
      {tab === "attendance"     && <AttendancePage user={user} />}
      {tab === "leaves"         && <LeavePage user={user} />}
      {tab === "petty-cash"     && <PettyCashPage user={user} title="Petty Cash" defaultTab={canViewReimbursement ? "all" : "mine"} />}
      {tab === "advance"        && <AdvancePage user={user} />}
      {tab === "salary-statements" && <SalaryStatementsPage user={user} />}
      {tab === "reimbursement"  && <PettyCashPage user={user} title="Reimbursement" defaultTab="mine" />}
      {tab === "approvals"      && <LeaveApprovalPage user={user} />}
      {tab === "all-attendance" && <AttendancePage user={user} adminView />}
      {tab === "employee-master" && <EmployeesPage user={user} />}
      {tab === "employees"      && <EmployeeExitPage user={user} />}
      {tab === "salary"         && <SalaryPage user={user} />}
    </div>
  );
}
