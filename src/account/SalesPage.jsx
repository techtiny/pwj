import { useState } from "react";
import SalesDashboard from "./SalesDashboard";
import SalesPipeline from "./SalesPipeline";
import NavBar from "../NavBar";
import CrmContactsPage from "./CrmContactsPage";
import CampaignsPage from "./CampaignsPage";
import { LayoutDashboard, Kanban, Users, Building2, Megaphone } from "lucide-react";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "pipeline",  label: "Pipeline",  icon: Kanban },
  { key: "people",    label: "People",    icon: Users },
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
];

export default function SalesPage({ userName = "", username = "", role = "" }) {
  // Campaigns (WhatsApp) are for OH, VP and CEO — each role keeps its own contact list.
  const tabs = ["OH", "VP", "CEO"].includes(role) ? TABS : TABS.filter(t => t.key !== "campaigns");
  const [tab, setTab] = useState("dashboard");
  return (
    <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 108px)" }}>
      {/* Top menu bar */}
      <NavBar ariaLabel="Sales menu" items={tabs} active={tab} onChange={setTab} />
      {tab === "dashboard" && <SalesDashboard />}
      {tab === "pipeline"  && <SalesPipeline />}
      {tab === "people"    && <CrmContactsPage key="people" list="people" />}
      {tab === "companies" && <CrmContactsPage key="companies" list="companies" />}
      {tab === "campaigns" && <CampaignsPage userName={userName} username={username} role={role} />}
    </div>
  );
}
