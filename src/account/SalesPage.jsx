import { useState } from "react";
import SalesDashboard from "./SalesDashboard";
import SalesPipeline from "./SalesPipeline";
import NavBar from "../NavBar";
import { LayoutDashboard, Kanban } from "lucide-react";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "pipeline",  label: "Pipeline",  icon: Kanban },
];

export default function SalesPage() {
  const [tab, setTab] = useState("dashboard");
  return (
    <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 108px)" }}>
      {/* Top menu bar */}
      <NavBar ariaLabel="Sales menu" items={TABS} active={tab} onChange={setTab} />
      {tab === "dashboard" && <SalesDashboard />}
      {tab === "pipeline"  && <SalesPipeline />}
    </div>
  );
}
