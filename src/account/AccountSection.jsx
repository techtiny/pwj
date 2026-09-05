import { useState } from "react";
import "./account.css";
import AccountDashboard from "./Dashboard";
import AccountProjects from "./ProjectsPage";
import AccountExpenses from "./ExpensePage";
import AccountTransfers from "./FundTransferPage";
import CollectionPage from "./CollectionPage";
import PaymentsPage from "./PaymentsPage";
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

export default function AccountSection({ isCeo = false, isOH = false, isVP = false, isAdmin = false, userName = "" }) {
  const [tab, setTab]     = useState("dashboard");
  const [expCat, setExpCat] = useState("material");

  const tabs = [
    { key: "dashboard",   label: "Dashboard"    },
    { key: "projects",    label: "Project-wise" },
    { key: "expenses",    label: "Expenses"     },
    { key: "transfers",   label: "Fund Transfer"},
    { key: "fund-mgmt",   label: "Fund Management"},
    { key: "payments",    label: "Send for Payment"},
    { key: "tds",         label: "TDS"},
    { key: "gst",         label: "GST"},
  ];

  return (
    <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 108px)" }}>

      {/* Sub-navigation bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px" }}>
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                  padding: "12px 20px", fontSize: 13.5, fontWeight: active ? 600 : 500,
                  color: active ? "#6366f1" : "#94a3b8",
                  borderBottom: active ? "2.5px solid #6366f1" : "2.5px solid transparent",
                  marginBottom: -1, letterSpacing: 0.1, transition: "color .15s" }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

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
        {tab === "transfers"   && <div className="page-content"><AccountTransfers isCeo={isCeo} /></div>}
        {tab === "fund-mgmt"   && <div className="page-content"><FundManagementPage /></div>}
        {tab === "payments"    && <div className="page-content"><PaymentsPage isOH={isOH} isVP={isVP} isAdmin={isAdmin} /></div>}
        {tab === "tds"         && <div className="page-content"><TdsPage isAdmin={isAdmin} /></div>}
        {tab === "gst"         && <div className="page-content"><GstPage isAdmin={isAdmin} userName={userName} /></div>}
      </div>
    </div>
  );
}
