import { useState } from "react";
import "./account.css";
import NavBar from "../NavBar";
import { LayoutDashboard, FolderKanban, Receipt, Landmark, Send, Percent, FileText } from "lucide-react";
import AccountDashboard from "./Dashboard";
import AccountProjects from "./ProjectsPage";
import AccountExpenses from "./ExpensePage";
import CollectionPage from "./CollectionPage";
import PaymentsPage from "./PaymentsPage";
import SalaryPayments from "./SalaryPayments";
import TdsPage from "./TdsPage";
import GstPage from "./GstPage";
import FundManagementPage from "./FundManagementPage";

const EXPENSE_CATS = [
  { key: "material",      label: "Material",      color: "#10b981" },
  { key: "labour",        label: "Labour",        color: "#3b82f6" },
  { key: "subcontract",   label: "Sub-Contract",  color: "#8b5cf6" },
  { key: "consultants",   label: "Consultants",   color: "#f59e0b" },
  { key: "miscellaneous", label: "Miscellaneous", color: "#64748b" },
];

export default function AccountSection({ isCeo = false, isOH = false, isVP = false, isAdmin = false, userName = "", username = "", notifs = [] }) {
  // Pending counts per tab (notification.tab) — the VP's salary payments sit under Send for Payment → Team Payments.
  const tabCount = {};
  notifs.filter(n => n.module === "account").forEach(n => { tabCount[n.tab || "payments"] = (tabCount[n.tab || "payments"] || 0) + Number(n.count || 0); });
  const teamPayCount = notifs.filter(n => n.key === "salary-pay").reduce((t, n) => t + Number(n.count || 0), 0);
  const [tab, setTab]     = useState("dashboard");
  const [payKind, setPayKind] = useState("vendor"); // Send for Payment: vendor payments | salary
  const [expCat, setExpCat] = useState("material");

  const tabs = [
    { key: "dashboard",   label: "Dashboard",        icon: LayoutDashboard },
    { key: "projects",    label: "Project-wise",     icon: FolderKanban },
    { key: "expenses",    label: "Expenses",         icon: Receipt },
    { key: "fund-mgmt",   label: "Fund Management",  icon: Landmark },
    { key: "payments",    label: "Send for Payment", icon: Send },
    { key: "tds",         label: "TDS",              icon: Percent },
    { key: "gst",         label: "GST",              icon: FileText },
  ];

  return (
    <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 108px)" }}>

      {/* Top menu bar */}
      <NavBar ariaLabel="Account menu" items={tabs.map(t => ({ ...t, badge: tabCount[t.key] || 0 }))} active={tab} onChange={setTab} />

      {/* Expense category sub-nav */}
      {tab === "expenses" && (
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "8px 32px", display: "flex", gap: 8 }}>
          {EXPENSE_CATS.map(c => {
            const active = expCat === c.key;
            return (
              <button key={c.key} onClick={() => setExpCat(c.key)}
                style={{ border: "none", cursor: "pointer", fontFamily: "inherit",
                  padding: "5px 14px", fontSize: 12, fontWeight: active ? 700 : 500, borderRadius: 100,
                  background: active ? c.color : "#f1f5f9",
                  color: active ? "#fff" : "#64748b",
                  transition: "all .15s" }}>
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Page content */}
      <div className="acct-wrap">
        {tab === "dashboard"  && <AccountDashboard />}
        {tab === "projects"   && <div className="page-content"><AccountProjects isCeo={isCeo} /></div>}
        {tab === "expenses"   && <div className="page-content"><AccountExpenses category={expCat} isCeo={isCeo} /></div>}
        {tab === "fund-mgmt"   && <div className="page-content"><FundManagementPage /></div>}
        {tab === "payments"    && (
          <div className="page-content">
            {(isAdmin || isVP || isOH || isCeo) && (
              <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8edf4", borderRadius: 11, marginBottom: 16 }}>
                {[["vendor", "Vendor Payments"], ["salary", "Team Payments"]].map(([k, l]) => (
                  <button key={k} onClick={() => setPayKind(k)}
                    style={{ border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", fontSize: 15,
                      background: payKind === k ? "#fff" : "transparent", color: payKind === k ? "#1e3a5f" : "#334155",
                      fontWeight: payKind === k ? 700 : 500, boxShadow: payKind === k ? "0 1px 3px rgba(15,23,42,.18)" : "none" }}>
                    {l}
                    {k === "salary" && teamPayCount > 0 && <span className="nav-badge" style={{ marginLeft: 8 }}>{teamPayCount}</span>}
                  </button>
                ))}
              </div>
            )}
            {payKind === "salary" && (isAdmin || isVP || isOH || isCeo)
              ? <SalaryPayments username={username} isVP={isVP} />
              : <PaymentsPage isOH={isOH} isVP={isVP} isAdmin={isAdmin} />}
          </div>
        )}
        {tab === "tds"         && <div className="page-content"><TdsPage isAdmin={isAdmin} /></div>}
        {tab === "gst"         && <div className="page-content"><GstPage isAdmin={isAdmin} userName={userName} /></div>}
      </div>
    </div>
  );
}
