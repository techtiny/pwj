import { useState } from "react";
import SalesDashboard from "./SalesDashboard";
import SalesPipeline from "./SalesPipeline";

const TABS = [
  { key: "dashboard", label: "📊 Dashboard" },
  { key: "pipeline",  label: "🗂 Pipeline"  },
];

export default function SalesPage() {
  const [tab, setTab] = useState("dashboard");
  return (
    <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 108px)" }}>
      {/* Sub-nav */}
      <div className="sub-nav" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px" }}>
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                  padding: "12px 22px", fontSize: 13.5, fontWeight: active ? 700 : 500,
                  color: active ? "#10b981" : "#94a3b8",
                  borderBottom: active ? "2.5px solid #10b981" : "2.5px solid transparent",
                  marginBottom: -1, transition: "color .15s" }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab === "dashboard" && <SalesDashboard />}
      {tab === "pipeline"  && <SalesPipeline />}
    </div>
  );
}
