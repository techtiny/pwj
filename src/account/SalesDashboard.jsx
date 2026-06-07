import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, FunnelChart, Funnel, LabelList,
} from "recharts";
import { salesApi, formatLakh } from "./accountApi";

const STAGES = [
  { key: "PROSPECT",    label: "Prospect",    color: "#6366f1" },
  { key: "QUALIFIED",   label: "Qualified",   color: "#3b82f6" },
  { key: "PROPOSAL",    label: "Proposal",    color: "#f59e0b" },
  { key: "NEGOTIATION", label: "Negotiation", color: "#f97316" },
  { key: "WON",         label: "Won",         color: "#10b981" },
  { key: "LOST",        label: "Lost",        color: "#ef4444" },
];

const KPI_CFG = [
  { key: "pipelineValue",  label: "Pipeline Value",  fmt: "lakh", grad: "linear-gradient(135deg,#6366f1,#8b5cf6)", icon: "📈" },
  { key: "wonValue",       label: "Won Value",        fmt: "lakh", grad: "linear-gradient(135deg,#10b981,#059669)", icon: "🏆" },
  { key: "active",         label: "Active Leads",     fmt: "num",  grad: "linear-gradient(135deg,#f59e0b,#f97316)", icon: "🎯" },
  { key: "conversionRate", label: "Conversion Rate",  fmt: "pct",  grad: "linear-gradient(135deg,#3b82f6,#06b6d4)", icon: "🔄" },
  { key: "total",          label: "Total Leads",      fmt: "num",  grad: "linear-gradient(135deg,#0d9488,#14b8a6)", icon: "📋" },
  { key: "lost",           label: "Lost Leads",       fmt: "num",  grad: "linear-gradient(135deg,#94a3b8,#64748b)", icon: "❌" },
];

function fmtVal(v, fmt) {
  if (fmt === "lakh") return formatLakh(v || 0);
  if (fmt === "pct")  return `${Number(v || 0).toFixed(1)}%`;
  return v ?? 0;
}

const CTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}>
      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{d.payload.label || d.name}</div>
      <div style={{ color: d.fill || d.color, fontWeight: 600 }}>
        Count: {d.payload.count ?? d.payload.value}
      </div>
      {d.payload.value != null && d.payload.count != null && (
        <div style={{ color: "#64748b" }}>Value: {formatLakh(d.payload.dealValue || 0)}</div>
      )}
    </div>
  );
};

export default function SalesDashboard() {
  const [leads, setLeads]     = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [lRes, sRes] = await Promise.all([salesApi.getAll(), salesApi.getSummary()]);
      setLeads(lRes.data);
      setSummary(sRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320, color: "#94a3b8", fontSize: 14 }}>
      Loading Sales Dashboard…
    </div>
  );

  if (!summary) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 320, color: "#94a3b8", fontSize: 14 }}>
      No data available
    </div>
  );

  // ── Derived data ───────────────────────────────────────────────────────────
  const stageBar = STAGES.map(s => ({
    label: s.label,
    color: s.color,
    count: summary.stages?.[s.key]?.count || 0,
    dealValue: Number(summary.stages?.[s.key]?.value || 0),
    value: summary.stages?.[s.key]?.count || 0,
  }));

  const stagePie = STAGES
    .map(s => ({ name: s.label, value: summary.stages?.[s.key]?.count || 0, color: s.color }))
    .filter(d => d.value > 0);

  const funnelData = STAGES.filter(s => s.key !== "LOST").map(s => ({
    name: s.label,
    value: summary.stages?.[s.key]?.count || 0,
    fill: s.color,
  }));

  // Top clients by total deal value
  const clientMap = {};
  leads.forEach(l => {
    if (!l.client) return;
    clientMap[l.client] = (clientMap[l.client] || 0) + (l.dealValue || 0);
  });
  const topClients = Object.entries(clientMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 17) + "…" : name, value }));

  // Source breakdown
  const sourceMap = {};
  leads.forEach(l => { const s = l.source || "OTHER"; sourceMap[s] = (sourceMap[s] || 0) + 1; });
  const sourceData = Object.entries(sourceMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const sourceColors = ["#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#f97316"];

  // Recent 6 leads
  const recentLeads = [...leads].slice(0, 6);

  // Business type breakdown
  const btMap = {};
  leads.forEach(l => { const b = l.businessType || "Other"; btMap[b] = (btMap[b] || 0) + 1; });
  const btData = Object.entries(btMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  const btColors = ["#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#f97316", "#64748b"];

  const card = { background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 20 };
  const secTitle = { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 };
  const secSub   = { fontSize: 12, color: "#94a3b8", marginBottom: 16 };

  return (
    <div style={{ padding: "16px 16px", background: "#f8fafc", minHeight: "calc(100vh - 148px)" }}>

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="kpi-grid-6" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14, marginBottom: 24 }}>
        {KPI_CFG.map(k => (
          <div key={k.key} style={{ ...card, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: k.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
              {k.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{k.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{fmtVal(summary[k.key], k.fmt)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Stage Bar + Funnel ───────────────────────────────────────── */}
      <div className="chart-row-2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Stage pipeline bar chart */}
        <div style={card}>
          <div style={secTitle}>Pipeline by Stage</div>
          <div style={secSub}>Lead count across each pipeline stage</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stageBar} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {stageBar.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage Pie */}
        <div style={card}>
          <div style={secTitle}>Stage Distribution</div>
          <div style={secSub}>Share of leads per stage</div>
          {stagePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={stagePie} cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {stagePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>No leads yet</div>
          )}
        </div>
      </div>

      {/* ── Row 3: Sales Funnel + Top Clients ────────────────────────────────── */}
      <div className="chart-row-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Sales Funnel */}
        <div style={card}>
          <div style={secTitle}>Sales Funnel</div>
          <div style={secSub}>Lead progression from Prospect to Won</div>
          {funnelData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <FunnelChart>
                <Tooltip formatter={(v) => [v, "Leads"]} />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  <LabelList position="right" fill="#475569" stroke="none" dataKey="name" style={{ fontSize: 11, fontWeight: 600 }} />
                  <LabelList position="center" fill="#fff" stroke="none" dataKey="value" style={{ fontSize: 12, fontWeight: 800 }} />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>No funnel data yet</div>
          )}
        </div>

        {/* Top Clients */}
        <div style={card}>
          <div style={secTitle}>Top Clients by Deal Value</div>
          <div style={secSub}>Highest value opportunities</div>
          {topClients.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topClients} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => formatLakh(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip formatter={v => [formatLakh(v), "Deal Value"]} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>No client data yet</div>
          )}
        </div>
      </div>

      {/* ── Row 4: Source + Business Type + Recent Leads ─────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 20 }}>

        {/* Lead Source */}
        <div style={card}>
          <div style={secTitle}>Lead Sources</div>
          <div style={secSub}>Where leads are coming from</div>
          {sourceData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {sourceData.map((s, i) => {
                const pct = leads.length > 0 ? Math.round((s.value / leads.length) * 100) : 0;
                return (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{s.name.charAt(0) + s.name.slice(1).toLowerCase()}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{s.value} ({pct}%)</span>
                    </div>
                    <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: sourceColors[i % sourceColors.length], borderRadius: 4, transition: "width .5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>No data</div>
          )}
        </div>

        {/* Business Type */}
        <div style={card}>
          <div style={secTitle}>Business Types</div>
          <div style={secSub}>Category of opportunities</div>
          {btData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {btData.map((b, i) => {
                const pct = leads.length > 0 ? Math.round((b.value / leads.length) * 100) : 0;
                return (
                  <div key={b.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{b.name}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{b.value} ({pct}%)</span>
                    </div>
                    <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: btColors[i % btColors.length], borderRadius: 4, transition: "width .5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>No data</div>
          )}
        </div>

        {/* Recent Leads */}
        <div style={card}>
          <div style={secTitle}>Recent Leads</div>
          <div style={secSub}>Latest entries in the pipeline</div>
          {recentLeads.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {recentLeads.map((lead, i) => {
                const st = STAGES.find(s => s.key === lead.stage) || STAGES[0];
                return (
                  <div key={lead.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < recentLeads.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.title}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{lead.client || "—"}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{formatLakh(lead.dealValue)}</div>
                      <span style={{ background: st.color + "18", color: st.color, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{st.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>No leads yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
