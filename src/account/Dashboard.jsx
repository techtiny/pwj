import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  FolderKanban, IndianRupee, TrendingUp, TrendingDown,
  CheckCircle2, Clock, PauseCircle, Activity,
} from 'lucide-react';
import { dashboardApi, formatCurrency, formatLakh } from './accountApi';

const CAT_COLORS = {
  MATERIAL:      '#10b981',
  LABOUR:        '#3b82f6',
  SUBCONTRACTOR: '#8b5cf6',
  SUBCONTRACT:   '#8b5cf6',
  OVERHEAD:      '#f59e0b',
  CONSULTANTS:   '#f59e0b',
  MISCELLANEOUS: '#64748b',
};

const STATUS_CFG = {
  active:    { label: 'Active',    color: '#10b981', icon: Activity },
  completed: { label: 'Completed', color: '#6366f1', icon: CheckCircle2 },
  onhold:    { label: 'On Hold',   color: '#f59e0b', icon: PauseCircle },
  pending:   { label: 'Pending',   color: '#94a3b8', icon: Clock },
};

const BAR_CATS = [
  { key: 'MATERIAL',      color: '#10b981', label: 'Material' },
  { key: 'LABOUR',        color: '#3b82f6', label: 'Labour' },
  { key: 'SUBCONTRACTOR', color: '#8b5cf6', label: 'Sub-Contract' },
  { key: 'OVERHEAD',      color: '#f59e0b', label: 'Overhead' },
];

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 12, minWidth: 190, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f172a', fontSize: 13 }}>{label}</div>
      {payload.map((p, i) => p.value > 0 && (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.fill, marginBottom: 3 }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{formatLakh(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 6, paddingTop: 6, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#64748b' }}>Total</span>
        <span style={{ color: '#0f172a' }}>{formatLakh(total)}</span>
      </div>
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <span style={{ color: CAT_COLORS[name] || '#6366f1', fontWeight: 700 }}>{name}</span>
      <span style={{ color: '#0f172a', fontWeight: 700, marginLeft: 8 }}>{formatLakh(value)}</span>
    </div>
  );
};

function shorten(name) {
  return name && name.length > 16 ? name.substring(0, 15) + '…' : name;
}

function KpiCard({ icon: Icon, label, value, sub, subColor, valueColor }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color="#6366f1" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: valueColor || '#0f172a', lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: subColor || '#94a3b8', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function AccountDashboard() {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    dashboardApi.getStats()
      .then(res => setStats(res.data))
      .catch(() => setError('Cannot connect to Account backend.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', animation: 'acct-spin 0.8s linear infinite' }} />
      <span style={{ color: '#64748b', fontSize: 14 }}>Loading dashboard…</span>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: '20px 28px', color: '#dc2626', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Dashboard unavailable</div>
        <div style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
        <button onClick={load} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ↺ Retry
        </button>
      </div>
    </div>
  );

  const {
    totalQuote = 0, totalBudget = 0, totalSpent = 0, totalCollection = 0,
    avgProfitMargin = 0, totalProjects = 0, activeProjects = 0, completedProjects = 0,
    categoryBreakdown = [], projectExpenses = [],
  } = stats;

  const budgetUsedPct = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0;
  const collectionPct = totalQuote > 0 ? ((totalCollection / totalQuote) * 100).toFixed(1) : 0;
  const profitAmt     = totalQuote - totalSpent;
  const isHealthy     = avgProfitMargin >= 20;
  const onholdCount   = totalProjects - activeProjects - completedProjects;
  const pieData       = categoryBreakdown.filter(c => c.value > 0);
  const projectBars   = projectExpenses.map(p => ({ ...p, shortName: shorten(p.name) }));

  return (
    <div className="page-content">
      {/* KPI Row */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <KpiCard icon={FolderKanban} label="Total Projects" value={totalProjects} sub={`${activeProjects} active · ${completedProjects} completed`} />
        <KpiCard icon={IndianRupee}  label="Total Quote Value" value={formatLakh(totalQuote)} sub={`Budget (80%): ${formatLakh(totalBudget)}`} />
        <KpiCard icon={Activity}     label="Total Spent" value={formatLakh(totalSpent)} sub={`${budgetUsedPct}% of budget · ${formatLakh(totalCollection)} collected`} subColor={budgetUsedPct > 90 ? '#ef4444' : '#94a3b8'} />
        <KpiCard icon={isHealthy ? TrendingUp : TrendingDown} label="Avg Profit Margin" value={`${avgProfitMargin}%`} valueColor={isHealthy ? '#059669' : '#dc2626'} sub={`Est. profit: ${formatLakh(profitAmt)} · Target: 20%`} subColor={isHealthy ? '#94a3b8' : '#ef4444'} />
      </div>

      {/* Portfolio Health */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Portfolio Health</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Quote · Collection · Budget · Spent</div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[{ label: 'Collected', pct: collectionPct, color: '#10b981' }, { label: 'Spent', pct: budgetUsedPct, color: '#6366f1' }].map(({ label, pct, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color }}>{pct}%</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        {[
          { label: 'Quote Value',  value: totalQuote,      max: totalQuote, color: '#e2e8f0' },
          { label: 'Collection',   value: totalCollection, max: totalQuote, color: '#10b981' },
          { label: 'Budget (80%)', value: totalBudget,     max: totalQuote, color: '#6366f1' },
          { label: 'Total Spent',  value: totalSpent,      max: totalQuote, color: totalSpent > totalBudget ? '#ef4444' : '#f59e0b' },
        ].map(({ label, value, max, color }) => {
          const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
          return (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{formatCurrency(value)}</span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 100, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: color, borderRadius: 100, height: '100%', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Project Expense Breakdown</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Stacked by category</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', maxWidth: 200, justifyContent: 'flex-end' }}>
              {BAR_CATS.map(({ key, color, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} /> {label}
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={projectBars} margin={{ top: 4, right: 8, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: '#94a3b8' }} angle={-35} textAnchor="end" interval={0} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => formatLakh(v)} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<BarTooltip />} />
              {BAR_CATS.map(({ key, color, label }, i) => (
                <Bar key={key} dataKey={key} stackId="a" fill={color} name={label} radius={i === BAR_CATS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Spend by Category</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Across all projects</div>
          </div>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={48} paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={CAT_COLORS[entry.name] || '#6366f1'} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {pieData.map((entry, i) => {
                  const total = pieData.reduce((s, c) => s + c.value, 0);
                  const pct   = total > 0 ? ((entry.value / total) * 100).toFixed(1) : 0;
                  const color = CAT_COLORS[entry.name] || '#6366f1';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#64748b', flex: 1 }}>{entry.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{formatLakh(entry.value)}</span>
                      <span style={{ fontSize: 12, color: '#94a3b8', width: 38, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="loading" style={{ height: 260 }}>No expense data yet</div>
          )}
        </div>
      </div>

      {/* Status + Top Spenders */}
      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Project Status Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'active',    count: activeProjects },
              { key: 'completed', count: completedProjects },
              { key: 'onhold',    count: Math.max(0, onholdCount) },
              { key: 'pending',   count: 0 },
            ].map(({ key, count }) => {
              const cfg  = STATUS_CFG[key];
              const Icon = cfg.icon;
              const pct  = totalProjects > 0 ? ((count / totalProjects) * 100).toFixed(0) : 0;
              return (
                <div key={key} style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}30`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Icon size={16} color={cfg.color} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{pct}% of portfolio</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, height: 8, borderRadius: 100, background: '#f1f5f9', display: 'flex', overflow: 'hidden' }}>
            {[{ count: activeProjects, color: '#10b981' }, { count: completedProjects, color: '#6366f1' }, { count: Math.max(0, onholdCount), color: '#f59e0b' }].map(({ count, color }, i) => (
              <div key={i} style={{ flex: count, background: color, transition: 'flex 0.5s ease' }} />
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Top Projects by Spend</div>
          {projectExpenses.slice(0, 5).map((p, i) => {
            const max    = projectExpenses[0]?.total || 1;
            const pct    = ((p.total / max) * 100).toFixed(0);
            const colors = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'];
            return (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#0f172a', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: colors[i], fontWeight: 700 }}>{formatLakh(p.total)}</span>
                </div>
                <div style={{ background: '#f1f5f9', borderRadius: 100, height: 7 }}>
                  <div style={{ width: `${pct}%`, background: colors[i], borderRadius: 100, height: '100%', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial Table */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>Project Financial Overview</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Category Mix</th>
                <th style={{ textAlign: 'right' }}>Material</th>
                <th style={{ textAlign: 'right' }}>Labour</th>
                <th style={{ textAlign: 'right' }}>Sub-Contract</th>
                <th style={{ textAlign: 'right' }}>Overhead</th>
                <th style={{ textAlign: 'right' }}>Total Spent</th>
              </tr>
            </thead>
            <tbody>
              {projectExpenses.map((p, i) => {
                const bars = [{ key: 'MATERIAL', color: '#10b981' }, { key: 'LABOUR', color: '#3b82f6' }, { key: 'SUBCONTRACTOR', color: '#8b5cf6' }, { key: 'OVERHEAD', color: '#f59e0b' }];
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 160 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    </td>
                    <td style={{ width: 120 }}>
                      <div style={{ display: 'flex', height: 8, borderRadius: 100, overflow: 'hidden', background: '#f1f5f9' }}>
                        {bars.map(({ key, color }) => <div key={key} style={{ flex: p[key] || 0, background: color }} />)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{formatLakh(p.MATERIAL)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{formatLakh(p.LABOUR)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{formatLakh(p.SUBCONTRACTOR)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{formatLakh(p.OVERHEAD)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{formatLakh(p.total)}</td>
                  </tr>
                );
              })}
              <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                <td colSpan={2} style={{ color: '#0f172a' }}>TOTAL</td>
                <td style={{ textAlign: 'right', color: '#10b981' }}>{formatLakh(categoryBreakdown.find(c => c.name === 'MATERIAL')?.value || 0)}</td>
                <td style={{ textAlign: 'right', color: '#3b82f6' }}>{formatLakh(categoryBreakdown.find(c => c.name === 'LABOUR')?.value || 0)}</td>
                <td style={{ textAlign: 'right', color: '#8b5cf6' }}>{formatLakh(categoryBreakdown.find(c => c.name === 'SUBCONTRACT')?.value || 0)}</td>
                <td style={{ textAlign: 'right', color: '#f59e0b' }}>{formatLakh((categoryBreakdown.find(c => c.name === 'CONSULTANTS')?.value || 0) + (categoryBreakdown.find(c => c.name === 'MISCELLANEOUS')?.value || 0))}</td>
                <td style={{ textAlign: 'right', color: '#6366f1' }}>{formatLakh(totalSpent)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
