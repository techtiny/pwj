import React, { useState, useEffect } from 'react';
import {
  FolderOpen, Edit2, X, Save, AlertTriangle, Plus,
  TrendingUp, IndianRupee, BarChart2, FileText
} from 'lucide-react';
import api from './accountApi';
import CollectionPage from './CollectionPage';

const BUDGET_RATIO = 0.80;
const STORAGE_KEY = 'pwj_projects_v2';

const EMPTY_EXPENSES = { material: 0, labour: 0, subcontract: 0, consultants: 0, miscellaneous: 0 };

const INITIAL_PROJECTS = [
  {
    // Real data from PDF — Padma Shyam project
    id: 1,
    name: 'Padma Shyam res Perungudi',
    client: 'Padma Shyam Suryodev',
    fy: '2025-2026',
    quoteGross: 1215840,
    collectionReceived: 610000,
    expenses: { material: 399363, labour: 157761, subcontract: 0, consultants: 39600, miscellaneous: 35730 },
    status: 'active',
  },
  {
    // 3BHK villa full interior — active, carcass done, finishing stage
    id: 2,
    name: 'Ravi Kumar Villa — Adyar',
    client: 'Ravi Kumar Sharma',
    fy: '2025-2026',
    quoteGross: 2450000,
    collectionReceived: 1837500,
    expenses: { material: 875200, labour: 298500, subcontract: 162000, consultants: 68000, miscellaneous: 38750 },
    status: 'active',
  },
  {
    // 2BHK apartment full interior — handed over, payments closed
    id: 3,
    name: 'Meenakshi Apt Interiors — Velachery',
    client: 'Meenakshi Rajendran',
    fy: '2025-2026',
    quoteGross: 875000,
    collectionReceived: 875000,
    expenses: { material: 294500, labour: 112800, subcontract: 0, consultants: 33000, miscellaneous: 17640 },
    status: 'completed',
  },
  {
    // Commercial office 4500 sqft fit-out — mid execution, subcontractor heavy
    id: 4,
    name: 'Sundar Tech Office Fit-out — Nungambakkam',
    client: 'Sundar Pichai Enterprises',
    fy: '2025-2026',
    quoteGross: 3820000,
    collectionReceived: 1910000,
    expenses: { material: 648000, labour: 196000, subcontract: 524000, consultants: 88000, miscellaneous: 49500 },
    status: 'active',
  },
  {
    // 4BHK bungalow — recently started, advance received, design & procurement phase
    id: 5,
    name: 'Lakshmi Narayan res — Besant Nagar',
    client: 'Lakshmi Narayan Iyer',
    fy: '2025-2026',
    quoteGross: 1680000,
    collectionReceived: 840000,
    expenses: { material: 312500, labour: 118400, subcontract: 0, consultants: 56000, miscellaneous: 22800 },
    status: 'active',
  },
  {
    // Boutique showroom refit — completed and handed over last quarter
    id: 6,
    name: 'Priya Boutique Showroom Refit — T Nagar',
    client: 'Priya Fashion House',
    fy: '2025-2026',
    quoteGross: 990000,
    collectionReceived: 990000,
    expenses: { material: 318400, labour: 129600, subcontract: 96000, consultants: 27500, miscellaneous: 16200 },
    status: 'completed',
  },
  {
    // New 3BHK residence — WO signed, design approved, material procurement starting
    id: 7,
    name: 'Anand Residence — Porur',
    client: 'Anand Krishnamurthy',
    fy: '2025-2026',
    quoteGross: 1540000,
    collectionReceived: 770000,
    expenses: { material: 198600, labour: 64200, subcontract: 0, consultants: 52000, miscellaneous: 14800 },
    status: 'active',
  },
  {
    // Dental clinic interior — on hold due to client delay in civil works
    id: 8,
    name: 'Kavitha Dental Clinic — Chromepet',
    client: 'Dr. Kavitha Subramanian',
    fy: '2025-2026',
    quoteGross: 620000,
    collectionReceived: 310000,
    expenses: { material: 148200, labour: 58400, subcontract: 0, consultants: 24000, miscellaneous: 12600 },
    status: 'onhold',
  },
];

function fmt(n) {
  if (!n && n !== 0) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function totalExpenses(exp) {
  return (exp.material || 0) + (exp.labour || 0) + (exp.subcontract || 0) + (exp.consultants || 0) + (exp.miscellaneous || 0);
}

function getBudgetStatus(spent, budget) {
  if (budget <= 0) return 'idle';
  const pct = spent / budget;
  if (pct >= 1) return 'exceeded';
  if (pct >= 0.9) return 'critical';
  if (pct >= 0.75) return 'warning';
  return 'ok';
}

const STATUS_COLORS = {
  active: { bg: '#d1fae5', color: '#065f46', label: 'Active' },
  pending: { bg: '#f1f5f9', color: '#475569', label: 'Pending' },
  completed: { bg: '#dbeafe', color: '#1e40af', label: 'Completed' },
  onhold: { bg: '#fef3c7', color: '#92400e', label: 'On Hold' },
};

const EXPENSE_FIELDS = [
  { key: 'material', label: 'Material' },
  { key: 'labour', label: 'Labour' },
  { key: 'subcontract', label: 'Sub-Contract' },
  { key: 'consultants', label: 'Consultants' },
  { key: 'miscellaneous', label: 'Miscellaneous' },
];

const EXPENSE_COLORS = {
  material: '#10b981',
  labour: '#3b82f6',
  subcontract: '#8b5cf6',
  consultants: '#f59e0b',
  miscellaneous: '#64748b',
};

export default function ProjectsPage({ isCeo = false }) {
  const [projects, setProjects] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
    } catch {
      return INITIAL_PROJECTS;
    }
  });

  const [editing, setEditing] = useState(null); // project id or 'new'
  const [collectionProjectId, setCollectionProjectId] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [blockMsg, setBlockMsg] = useState('');
  const [pwjProjects, setPwjProjects] = useState([]);
  const [selectedPwjId, setSelectedPwjId] = useState('');
  const [summaryProject, setSummaryProject] = useState(null); // project for summary modal
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  // ── Aggregate summary ──
  const totalBudget = projects.reduce((s, p) => s + p.quoteGross * BUDGET_RATIO, 0);
  const totalSpent = projects.reduce((s, p) => s + totalExpenses(p.expenses), 0);
  const totalCollection = projects.reduce((s, p) => s + (p.collectionReceived || 0), 0);
  const totalQuote = projects.reduce((s, p) => s + (p.quoteGross || 0), 0);
  const avgMargin = totalQuote > 0
    ? (((totalQuote - totalSpent) / totalQuote) * 100).toFixed(1)
    : 0;

  function openEdit(project) {
    setEditing(project.id);
    setCollectionProjectId(project.id);
    setSelectedPwjId('');
    fetch('/api/v1/projects')
      .then(r => r.json())
      .then(r => setPwjProjects(r.data || []))
      .catch(() => setPwjProjects([]));
    setForm({
      name: project.name, client: project.client, fy: project.fy,
      quoteGross: project.quoteGross, collectionReceived: project.collectionReceived,
      expenses: { ...project.expenses }, status: project.status,
      businessType: project.businessType || '',
      location: project.location || '', description: project.description || '',
      clientGstNo: project.clientGstNo || '', clientAddress: project.clientAddress || '',
      billingAddress: project.billingAddress || '', poWoStatus: project.poWoStatus || '',
      gstPct: project.gstPct ?? null, quoteGstPct: project.quoteGstPct ?? null, quoteValue: project.quoteValue ?? null, totalValue: project.totalValue ?? null,
    });
    setErrors({});
    setBlockMsg('');
  }

  function openSummary(project) {
    setSummaryProject(project);
    setSummaryData(null);
    setSummaryLoading(true);
    api.get(`/projects/${project.id}/expense-summary`)
      .then(r => setSummaryData(r.data))
      .catch(() => setSummaryData(null))
      .finally(() => setSummaryLoading(false));
  }

  function openAdd() {
    setEditing('new');
    setForm({
      name: '', client: '', fy: '2025-2026', quoteGross: 0,
      collectionReceived: 0, expenses: { ...EMPTY_EXPENSES },
      status: 'pending', businessType: '',
      location: '', description: '', clientGstNo: '',
      clientAddress: '', billingAddress: '', poWoStatus: '',
      gstPct: null, quoteGstPct: null, quoteValue: null, totalValue: null,
    });
    setErrors({});
    setBlockMsg('');
  }

  function closeEdit() {
    setEditing(null);
    setForm(null);
    setErrors({});
    setBlockMsg('');
  }

  function handleExpenseChange(key, rawVal) {
    const val = parseFloat(rawVal) || 0;
    const budget = (parseFloat(form.quoteGross) || 0) * BUDGET_RATIO;

    const updated = { ...form.expenses, [key]: val };
    const newTotal = totalExpenses(updated);

    if (budget > 0 && newTotal > budget) {
      setBlockMsg(
        `Cannot enter ₹${Number(val).toLocaleString('en-IN')} for ${key}. ` +
        `Total expenses (${fmt(newTotal)}) would exceed the 80% budget limit of ${fmt(budget)}.`
      );
      return; // block the change
    }

    setBlockMsg('');
    setForm(f => ({ ...f, expenses: updated }));
  }

  function handleSave() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Project name is required';
    if (form.quoteGross < 0) errs.quoteGross = 'Quote must be ≥ 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const budget = (parseFloat(form.quoteGross) || 0) * BUDGET_RATIO;
    const spent = totalExpenses(form.expenses);
    if (budget > 0 && spent > budget) {
      setBlockMsg(`Total expenses ${fmt(spent)} exceed the 80% budget ${fmt(budget)}. Adjust values before saving.`);
      return;
    }

    if (editing === 'new') {
      const newId = Math.max(0, ...projects.map(p => p.id)) + 1;
      setProjects(prev => [...prev, {
        id: newId,
        ...form,
        quoteGross: parseFloat(form.quoteGross) || 0,
        collectionReceived: parseFloat(form.collectionReceived) || 0,
      }]);
    } else {
      setProjects(prev => prev.map(p =>
        p.id === editing ? { ...p, ...form, quoteGross: parseFloat(form.quoteGross) || 0, collectionReceived: parseFloat(form.collectionReceived) || 0, businessType: form.businessType } : p
      ));
    }
    closeEdit();
  }


  const isNew = editing === 'new';

  return (
    <div>
      {/* ── Page header with Add button ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        {!isCeo && (
          <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Add Project
          </button>
        )}
      </div>

      {/* ── Summary KPI Row ── */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <SummaryCard
          icon={<FolderOpen size={20} color="white" />}
          gradient="linear-gradient(135deg,#6366f1,#8b5cf6)"
          label="Total Projects"
          value={projects.length}
          sub={`${projects.filter(p => p.status === 'active').length} active`}
        />
        <SummaryCard
          icon={<IndianRupee size={20} color="white" />}
          gradient="linear-gradient(135deg,#10b981,#059669)"
          label="Total Quote Value"
          value={fmt(totalQuote)}
          sub={`Budget (80%): ${fmt(totalBudget)}`}
        />
        <SummaryCard
          icon={<BarChart2 size={20} color="white" />}
          gradient="linear-gradient(135deg,#f59e0b,#d97706)"
          label="Total Spent"
          value={fmt(totalSpent)}
          sub={`${totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0}% of budget`}
        />
        <SummaryCard
          icon={<TrendingUp size={20} color="white" />}
          gradient="linear-gradient(135deg,#3b82f6,#1d4ed8)"
          label="Avg Profit Margin"
          value={`${avgMargin}%`}
          sub={`Target: 20% | Collected: ${fmt(totalCollection)}`}
        />
      </div>

      {/* ── Project Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {projects.map(project => {
          const budget = project.quoteGross * BUDGET_RATIO;
          const spent = totalExpenses(project.expenses);
          const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
          const profitTarget = project.quoteGross * 0.20;
          const currentProfit = project.quoteGross - spent;
          const status = getBudgetStatus(spent, budget);
          const sc = STATUS_COLORS[project.status] || STATUS_COLORS.pending;

          const barColor = status === 'exceeded' ? '#ef4444'
            : status === 'critical' ? '#ef4444'
            : status === 'warning' ? '#f59e0b'
            : '#10b981';

          return (
            <div key={project.id} className="card" style={{ padding: 20, position: 'relative' }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {project.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {project.client || <span style={{ fontStyle: 'italic' }}>No client</span>} · FY {project.fy}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                    {sc.label}
                  </span>
                  {project.businessType && (
                    <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: project.businessType === 'B2B' ? '#ede9fe' : '#dbeafe', color: project.businessType === 'B2B' ? '#7c3aed' : '#1d4ed8' }}>
                      {project.businessType}
                    </span>
                  )}
                  <button
                    onClick={() => openSummary(project)}
                    style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#10b981' }}
                  >
                    <FileText size={13} /> Summary
                  </button>
                  {!isCeo && (
                    <button
                      onClick={() => openEdit(project)}
                      style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6366f1' }}
                    >
                      <Edit2 size={13} /> Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Financial overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                <MiniStat label="Quote (Gross)" value={fmt(project.quoteGross)} />
                <MiniStat label={`Budget (80%)`} value={fmt(budget)} highlight />
                <MiniStat label="Collected" value={fmt(project.collectionReceived)} />
              </div>

              {/* Budget utilisation bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Budget Utilisation</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{pct.toFixed(1)}%</span>
                </div>
                <div style={{ background: '#f1f5f9', borderRadius: 100, height: 8 }}>
                  <div style={{ width: `${pct}%`, background: barColor, borderRadius: 100, height: '100%', transition: 'width 0.4s ease' }} />
                </div>
                {status === 'exceeded' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 11, color: '#ef4444' }}>
                    <AlertTriangle size={12} /> Over budget by {fmt(spent - budget)}
                  </div>
                )}
              </div>

              {/* Expense breakdown mini bars */}
              <div style={{ marginBottom: 14 }}>
                {EXPENSE_FIELDS.map(({ key, label }) => {
                  const val = project.expenses[key] || 0;
                  const expPct = budget > 0 ? Math.min((val / budget) * 100, 100) : 0;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: '#64748b', width: 80, flexShrink: 0 }}>{label}</span>
                      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 100, height: 5 }}>
                        <div style={{ width: `${expPct}%`, background: EXPENSE_COLORS[key], borderRadius: 100, height: '100%' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', width: 80, textAlign: 'right', flexShrink: 0 }}>{fmt(val)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Footer row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Total Expenses</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>{fmt(spent)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Est. Profit</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: currentProfit >= profitTarget ? '#10b981' : '#f59e0b' }}>
                    {fmt(currentProfit)} {project.quoteGross > 0 && `(${((currentProfit / project.quoteGross) * 100).toFixed(1)}%)`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Profit Target (20%)</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>{fmt(profitTarget)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Overall Summary Table ── */}
      <div className="card" style={{ padding: 20, marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Project Summary — All Categories</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Project</th>
                <th>Type</th>
                <th>Quote (Gross)</th>
                <th>Budget (80%)</th>
                <th>Material</th>
                <th>Labour</th>
                <th>Sub-Contract</th>
                <th>Consultants</th>
                <th>Misc</th>
                <th>Total Spent</th>
                <th>Est. Profit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => {
                const budget = p.quoteGross * BUDGET_RATIO;
                const spent = totalExpenses(p.expenses);
                const profit = p.quoteGross - spent;
                const overBudget = budget > 0 && spent > budget;
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS.pending;
                return (
                  <tr key={p.id}>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 180 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      {p.client && <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.client}</div>}
                    </td>
                    <td>
                      {p.businessType && (
                        <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: p.businessType === 'B2B' ? '#ede9fe' : '#dbeafe', color: p.businessType === 'B2B' ? '#7c3aed' : '#1d4ed8' }}>
                          {p.businessType}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 500 }}>{fmt(p.quoteGross)}</td>
                    <td style={{ color: '#6366f1', fontWeight: 600 }}>{fmt(budget)}</td>
                    <td>{fmt(p.expenses.material)}</td>
                    <td>{fmt(p.expenses.labour)}</td>
                    <td>{fmt(p.expenses.subcontract)}</td>
                    <td>{fmt(p.expenses.consultants)}</td>
                    <td>{fmt(p.expenses.miscellaneous)}</td>
                    <td style={{ fontWeight: 700, color: overBudget ? '#ef4444' : '#0f172a' }}>
                      {fmt(spent)}
                      {overBudget && <span title="Over budget" style={{ marginLeft: 4 }}><AlertTriangle size={12} color="#ef4444" style={{ verticalAlign: 'middle' }} /></span>}
                    </td>
                    <td style={{ fontWeight: 600, color: profit >= p.quoteGross * 0.2 ? '#10b981' : '#f59e0b' }}>
                      {p.quoteGross > 0 ? `${fmt(profit)} (${((profit / p.quoteGross) * 100).toFixed(1)}%)` : '—'}
                    </td>
                    <td>
                      <span style={{ padding: '3px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>{sc.label}</span>
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                <td colSpan={2} style={{ fontWeight: 700, color: '#0f172a' }}>TOTAL</td>
                <td style={{ color: '#0f172a' }}>{fmt(totalQuote)}</td>
                <td style={{ color: '#6366f1' }}>{fmt(totalBudget)}</td>
                <td>{fmt(projects.reduce((s, p) => s + p.expenses.material, 0))}</td>
                <td>{fmt(projects.reduce((s, p) => s + p.expenses.labour, 0))}</td>
                <td>{fmt(projects.reduce((s, p) => s + p.expenses.subcontract, 0))}</td>
                <td>{fmt(projects.reduce((s, p) => s + p.expenses.consultants, 0))}</td>
                <td>{fmt(projects.reduce((s, p) => s + p.expenses.miscellaneous, 0))}</td>
                <td style={{ color: '#ef4444' }}>{fmt(totalSpent)}</td>
                <td style={{ color: '#10b981' }}>{fmt(totalQuote - totalSpent)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Expense Summary Modal ── */}
      {summaryProject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{summaryProject.name}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {summaryProject.client} · FY {summaryProject.fy}
                </div>
              </div>
              <button onClick={() => setSummaryProject(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>

            <div style={{ padding: 24 }}>
              {summaryLoading && <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading summary…</div>}

              {!summaryLoading && summaryData && (() => {
                const d = summaryData;
                const balColor = Number(d.balanceAsOnDate) >= 0 ? '#10b981' : '#ef4444';
                const fmtR = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                return (
                  <>
                    {/* Quote & collection banner */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                      {[
                        { label: 'Quote Value (Gross)', val: fmtR(d.quoteGross), color: '#6366f1' },
                        { label: 'Collection Received', val: fmtR(d.collectionReceived), color: '#10b981' },
                        { label: 'Balance as on Date', val: fmtR(d.balanceAsOnDate), color: balColor },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Paid Expenses as of Today */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Paid Expenses as of Today
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>Category</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>As per PO</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.categories.map(row => (
                            <tr key={row.category} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '9px 12px', fontWeight: 500 }}>{row.category.charAt(0) + row.category.slice(1).toLowerCase()}</td>
                              <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6366f1', fontWeight: 600 }}>{fmtR(row.pwjTotal)}</td>
                              <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtR(row.actualPaid)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #e2e8f0' }}>
                            <td style={{ padding: '10px 12px', color: '#0f172a' }}>Total Paid Expenses</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6366f1' }}>{fmtR(d.totals.pwjTotal)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f172a' }}>{fmtR(d.totals.actualPaid)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Credit & Balance Due Payments */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Credit & Balance Due Payments
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>Category</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>As per PO</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.categories.map(row => (
                            <tr key={row.category} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '9px 12px', fontWeight: 500 }}>{row.category.charAt(0) + row.category.slice(1).toLowerCase()}</td>
                              <td style={{ padding: '9px 12px', textAlign: 'right', color: row.balancePwj > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{fmtR(row.balancePwj)}</td>
                              <td style={{ padding: '9px 12px', textAlign: 'right', color: row.balanceActual > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{fmtR(row.balanceActual)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#fee2e2', fontWeight: 800, borderTop: '2px solid #fca5a5' }}>
                            <td style={{ padding: '10px 12px', color: '#dc2626' }}>Total Balance to be Paid</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>{fmtR(d.totals.balancePwj)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>{fmtR(d.totals.balanceActual)}</td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Balance as on date */}
                      <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: Number(d.balanceAsOnDate) >= 0 ? '#d1fae5' : '#fee2e2', border: `1px solid ${Number(d.balanceAsOnDate) >= 0 ? '#6ee7b7' : '#fca5a5'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: Number(d.balanceAsOnDate) >= 0 ? '#065f46' : '#dc2626' }}>Balance as on Date</span>
                        <span style={{ fontWeight: 800, fontSize: 18, color: Number(d.balanceAsOnDate) >= 0 ? '#065f46' : '#dc2626' }}>{fmtR(d.balanceAsOnDate)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}

              {!summaryLoading && !summaryData && (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                  No expense data found for this project yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editing && form && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'white', borderRadius: 16, width: '100%', maxWidth: isNew ? 860 : 1440,
            maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{isNew ? 'Add New Project' : 'Project Info'}</div>
                {!isNew && <div style={{ fontSize: 12, color: '#64748b' }}>{projects.find(p => p.id === editing)?.name}</div>}
              </div>
              <button onClick={closeEdit} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Budget alert */}
              {blockMsg && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: '#dc2626' }}>{blockMsg}</span>
                </div>
              )}

              {/* Project Info */}
              <SectionLabel>Project Information</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                {/* Row 1 */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Project Name *</label>
                  <input className={`form-control${errors.name ? ' error' : ''}`} value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  {errors.name && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{errors.name}</div>}
                </div>
                <div>
                  <label className="form-label">Client Name</label>
                  <input className="form-control" value={form.client}
                    onChange={e => setForm(f => ({ ...f, client: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Client GST No</label>
                  <input className="form-control" value={form.clientGstNo || ''}
                    onChange={e => setForm(f => ({ ...f, clientGstNo: e.target.value }))} />
                </div>
                {/* Row 2 — Financial: Work Order */}
                <div>
                  <label className="form-label">Work Order Value (₹)</label>
                  <input type="number" min="0" className="form-control" value={form.quoteGross}
                    onChange={e => { setForm(f => ({ ...f, quoteGross: parseFloat(e.target.value) || 0 })); setBlockMsg(''); }} />
                </div>
                <div>
                  <label className="form-label">GST %</label>
                  <select className="form-control" value={form.gstPct ?? ''}
                    onChange={e => setForm(f => ({ ...f, gstPct: e.target.value ? parseInt(e.target.value) : null, totalValue: e.target.value ? ((f.quoteGross || 0) * (1 + parseInt(e.target.value) / 100)) : null }))}>
                    <option value="">— %</option>
                    <option value="9">9%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Total Value (₹)</label>
                  <input className="form-control" readOnly
                    style={{ background: '#f8fafc', color: '#166534', fontWeight: 700 }}
                    value={form.quoteGross && form.gstPct ? `₹ ${(form.quoteGross * (1 + form.gstPct / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : ''} />
                </div>
                {/* Quote */}
                <div>
                  <label className="form-label">Quote Value (₹)</label>
                  <input type="number" min="0" className="form-control" value={form.quoteValue ?? ''}
                    onChange={e => setForm(f => ({ ...f, quoteValue: e.target.value ? parseFloat(e.target.value) : null }))} />
                </div>
                <div>
                  <label className="form-label">Quote GST %</label>
                  <select className="form-control" value={form.quoteGstPct ?? ''}
                    onChange={e => setForm(f => ({ ...f, quoteGstPct: e.target.value ? parseInt(e.target.value) : null }))}>
                    <option value="">— %</option>
                    <option value="9">9%</option>
                    <option value="18">18%</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Quote Total (₹)</label>
                  <input className="form-control" readOnly
                    style={{ background: '#f8fafc', color: '#166534', fontWeight: 700 }}
                    value={form.quoteValue && form.quoteGstPct ? `₹ ${(form.quoteValue * (1 + form.quoteGstPct / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : ''} />
                </div>
                <div>
                  <label className="form-label">Collection Received (₹)</label>
                  <input type="number" min="0" className="form-control" value={form.collectionReceived}
                    onChange={e => setForm(f => ({ ...f, collectionReceived: parseFloat(e.target.value) || 0 }))} />
                </div>
                {/* Row 3 */}
                <div>
                  <label className="form-label">Financial Year</label>
                  <input className="form-control" value={form.fy}
                    onChange={e => setForm(f => ({ ...f, fy: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="onhold">On Hold</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Business Type</label>
                  <select className="form-control" value={form.businessType}
                    onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="B2B">B2B</option>
                    <option value="B2C">B2C</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">PO / WO Status</label>
                  <input className="form-control" value={form.poWoStatus || ''}
                    onChange={e => setForm(f => ({ ...f, poWoStatus: e.target.value }))} />
                </div>
                {/* Row 4 */}
                <div>
                  <label className="form-label">Location</label>
                  <input className="form-control" value={form.location || ''}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                  <label className="form-label">Description</label>
                  <input className="form-control" value={form.description || ''}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                {/* Row 5 — addresses */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Client Address</label>
                  <input className="form-control" value={form.clientAddress || ''}
                    onChange={e => setForm(f => ({ ...f, clientAddress: e.target.value }))} />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Site Address</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500, color: '#6366f1', cursor: 'pointer', fontSize: 11 }}>
                      <input type="checkbox"
                        checked={form.billingAddress === form.clientAddress && !!form.clientAddress}
                        onChange={e => setForm(f => ({ ...f, billingAddress: e.target.checked ? f.clientAddress : '' }))}
                        style={{ cursor: 'pointer' }} />
                      Same as Client Address
                    </label>
                  </label>
                  <input className="form-control" value={form.billingAddress || ''}
                    onChange={e => setForm(f => ({ ...f, billingAddress: e.target.value }))} />
                </div>
              </div>


              {/* Budget display */}
              {form.quoteGross > 0 && (() => {
                const budget = form.quoteGross * BUDGET_RATIO;
                const spent = totalExpenses(form.expenses);
                const remaining = budget - spent;
                const pct = Math.min((spent / budget) * 100, 100);
                const barColor = pct >= 100 ? '#ef4444' : pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#10b981';
                return (
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Budget (80% of Quote)</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#6366f1' }}>{fmt(budget)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Total Spent</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>{fmt(spent)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Remaining Budget</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: remaining >= 0 ? '#10b981' : '#ef4444' }}>{fmt(remaining)}</div>
                      </div>
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: 100, height: 10 }}>
                      <div style={{ width: `${pct}%`, background: barColor, borderRadius: 100, height: '100%', transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{pct.toFixed(1)}% utilised</span>
                      <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>Profit Target: {fmt(form.quoteGross * 0.2)} (20%)</span>
                    </div>
                    {remaining <= 0 && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#dc2626', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <AlertTriangle size={13} />
                        Budget limit reached. No further expenses can be added.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={closeEdit}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Save size={15} /> Save Project
                </button>
              </div>
            </div>

            {/* ── Collections inside edit modal ── */}
            {!isNew && (
              <div style={{ borderTop: '2px solid #f1f5f9', padding: '24px 24px 28px' }}>
                <CollectionPage isCeo={isCeo} preselectedProjectId={editing} hideProjectSelector />
              </div>
            )}

          </div>
        </div>
      )}


    </div>
  );
}

function SummaryCard({ icon, gradient, label, value, sub }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, highlight }) {
  return (
    <div style={{ background: highlight ? '#eff6ff' : '#f8fafc', borderRadius: 8, padding: '8px 10px', border: `1px solid ${highlight ? '#bfdbfe' : '#f1f5f9'}` }}>
      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: highlight ? '#1d4ed8' : '#0f172a' }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
      {children}
    </div>
  );
}
