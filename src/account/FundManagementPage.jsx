import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, X, ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, ChevronDown, Landmark, CheckCircle2, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { fundManagementApi, fundTransferApi, plannedFundApi, projectsApi, pwjDocsApi } from './accountApi';
import { DeleteBtn } from "../ActionButtons";

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

const RECEIPT_MODES = ['Bank Transfer / NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Card', 'Adjustment'];
const PAYMENT_MODES = ['Bank Transfer / NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Card', 'Adjustment'];

const SOURCE_TYPES = [
  { value: 'LOAN', label: 'Loan' },
  { value: 'CLIENT_PAYMENT', label: 'Client Payment' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'OTHER', label: 'Other' },
];
const sourceTypeLabel = v => SOURCE_TYPES.find(s => s.value === v)?.label || v || '—';

const ADD_CUSTOM = '__ADD_CUSTOM__';

const inputS = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 11px', fontSize: "var(--hz-text-sm)", fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' };
const th = { padding: '12px 16px', textAlign: 'left', fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-ink-2)", borderBottom: '1px solid var(--hz-border)', background: 'var(--hz-bg)', whiteSpace: 'nowrap' };
const td = { padding: '12px 16px', fontSize: "var(--hz-text-md)", borderBottom: '1px solid #eef2f7', color: "var(--hz-ink)", fontVariantNumeric: 'tabular-nums' };
const num = { textAlign: 'right', whiteSpace: 'nowrap' };

// Readable rupee amount: aligned (tabular) digits, quieter ₹ sign and paise so the rupees stand out.
function Money({ v, color, strong, dash, size }) {
  const n = Number(v || 0);
  if (dash && n === 0) return <span style={{ color: "var(--hz-faint)" }}>—</span>;
  const [int, dec] = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: strong ? 700 : 500, color: color || "var(--hz-ink)", fontSize: size }}>
      {n < 0 && '−'}<span style={{ opacity: 0.55, fontWeight: 500, marginRight: 2 }}>₹</span>{int}<span style={{ opacity: 0.5, fontSize: '0.82em', fontWeight: 500 }}>.{dec}</span>
    </span>
  );
}

// White card with a title bar — every block on the page uses it so they line up.
function Section({ title, subtitle, right, children, flush, headerWidth }) {
  return (
    <div style={{ background: "var(--hz-surface)", border: '1px solid var(--hz-border)', borderRadius: 12, boxShadow: "var(--hz-shadow-sm)", overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ borderBottom: flush ? 'none' : '1px solid var(--hz-border)' }}>
      {/* headerWidth: keep the title row as wide as the table below, so `right` sits above the table's last column */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: headerWidth, boxSizing: 'border-box' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--hz-font-display)", fontSize: "var(--hz-text-lg)", fontWeight: 700, color: "var(--hz-ink)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{right}</div>}
      </div>
      </div>
      {children}
    </div>
  );
}

function Pill({ tone = 'neutral', children, title }) {
  const t = { success: ["var(--hz-success-bg)", "var(--hz-success)"], danger: ["var(--hz-danger-bg)", "var(--hz-danger)"],
    warning: ["var(--hz-warning-bg)", "var(--hz-warning)"], neutral: ["var(--hz-surface-2)", "var(--hz-ink-2)"] }[tone];
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: "var(--hz-text-xs)", fontWeight: 600, padding: '3px 10px', borderRadius: 100, background: t[0], color: t[1], whiteSpace: 'nowrap' }}>{children}</span>;
}

// Summary figure for the top strip.
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: "var(--hz-surface)", border: '1px solid var(--hz-border)', borderRadius: 12, boxShadow: "var(--hz-shadow-sm)", padding: '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-muted)" }}>{label}</div>
      <div style={{ marginTop: 6, lineHeight: 1.15 }}><Money v={value} strong color={color || "var(--hz-primary)"} size="var(--hz-text-2xl)" /></div>
      {sub && <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-on-dark)", background: "var(--hz-primary)", cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--hz-border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-ink-2)", background: "var(--hz-surface)", cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };

const EMPTY = { movementDate: today(), party: '', projectId: '', customParty: '', amount: '', mode: '', sourceType: '', referenceNo: '', remarks: '' };

export default function FundManagementPage() {
  // Two modules: Inter Project Fund Flow (payment funding + Actual Inflow, view INFLOW) and
  // Cash Flow (Planned Inflow / Actual Outflow / Planned Outflow).
  const [view, setView] = useState('INFLOW'); // INFLOW (Inter Project Fund Flow) | CF_INFLOW (Cash Flow → Actual Inflow) | OUTFLOW | PLANNED_INFLOW | PLANNED_OUTFLOW
  const [projects, setProjects] = useState([]);
  const [rows, setRows] = useState([]);
  const [balances, setBalances] = useState({}); // projectId -> { inflow, outflow, available }
  const [funding, setFunding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false); // Transaction Details (Inter Project Fund Flow) starts minimised
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [xfer, setXfer] = useState(null); // { toProjectId, toName, shortfall }
  const [notice, setNotice] = useState(''); // result of the last transfer / repayment
  const [pwjDocs, setPwjDocs] = useState([]); // Planned Outflow — docs for the selected project
  const [docSearchOpen, setDocSearchOpen] = useState(false);
  const [b2bProjects, setB2bProjects] = useState([]); // for Bank Balance / Total Project Balance tiles

  const isFunding = view === 'INFLOW'; // Inter Project Fund Flow module
  const showPlanner = view === 'PLANNED_OUTFLOW'; // Cash Flow → Planned Outflow shows the outflow planner (calendar / list); Actual Outflow shows paid entries
  const isPlanned = view === 'PLANNED_INFLOW' || view === 'PLANNED_OUTFLOW';
  const dir = isPlanned ? (view === 'PLANNED_INFLOW' ? 'INFLOW' : 'OUTFLOW') : (view === 'CF_INFLOW' ? 'INFLOW' : view);
  const isInflow = view === 'INFLOW' || view === 'CF_INFLOW' || view === 'PLANNED_INFLOW';
  const api = isPlanned ? plannedFundApi : fundManagementApi;
  const partyLabel = isPlanned && isInflow ? 'Source / Description' : (isInflow ? 'Source Type' : 'Paid To (Project)');
  const modeLabel = isInflow ? 'Mode of Receipt' : 'Mode of Payment';
  const modes = isInflow ? RECEIPT_MODES : PAYMENT_MODES;
  const viewLabel = view === 'INFLOW' || view === 'CF_INFLOW' ? 'Actual Inflow' : view === 'OUTFLOW' ? 'Actual Outflow'
    : view === 'PLANNED_INFLOW' ? 'Planned Inflow' : view === 'PLANNED_OUTFLOW' ? 'Planned Outflow' : '';

  useEffect(() => {
    projectsApi.getAll().then(r => setProjects(r.data || [])).catch(() => setProjects([]));
  }, []);

  const loadB2b = useCallback(() => {
    fundTransferApi.getProjects().then(r => setB2bProjects(r.data || [])).catch(() => setB2bProjects([]));
  }, []);

  useEffect(() => { loadB2b(); }, [loadB2b, view, rows]);

  const totalBank = b2bProjects.reduce((s, p) => s + Number(p.collectionReceived ?? 0), 0);
  const totalProject = b2bProjects.reduce((s, p) => s + Number(p.availableBalance ?? 0), 0);

  const loadFunding = useCallback(() => {
    fundManagementApi.paymentFunding().then(r => setFunding(r.data || null)).catch(() => setFunding(null));
  }, []);

  const loadBalances = useCallback(() => {
    fundManagementApi.balances()
      .then(r => {
        const map = {};
        (r.data || []).forEach(b => { map[b.projectId] = b; });
        setBalances(map);
      })
      .catch(() => setBalances({}));
  }, []);

  const load = useCallback(() => {
    if (isFunding) loadFunding();
    setLoading(true);
    api.list(dir)
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    loadBalances();
  }, [dir, isFunding, api, loadBalances, loadFunding]);

  useEffect(() => { load(); }, [load]);

  // Planned Outflow: fetch the selected project's PO/WO/JO docs to pick a Reference No. from.
  useEffect(() => {
    if (view !== 'PLANNED_OUTFLOW' || !form.projectId || form.projectId === ADD_CUSTOM) { setPwjDocs([]); return; }
    pwjDocsApi.getDocs(form.projectId).then(r => setPwjDocs(r.data || [])).catch(() => setPwjDocs([]));
  }, [view, form.projectId]);

  const projectNames = useMemo(() => new Set(projects.map(p => p.name)), [projects]);

  // Inflow Source Type options: active projects + any custom values already used.
  const customSources = useMemo(() => {
    if (!isInflow) return [];
    return [...new Set(rows.map(r => r.party).filter(p => p && !projectNames.has(p)))];
  }, [rows, projectNames, isInflow]);

  const totalShown = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const colCount = (isInflow ? 6 : 7) + (isPlanned ? 2 : 0);

  function openForm() {
    setForm({ ...EMPTY, movementDate: today() });
    setError('');
    setDocSearchOpen(false);
    setShowForm(true);
  }

  async function submit() {
    setError('');
    const amount = Number(form.amount);
    if (!(amount > 0)) { setError('Enter an amount greater than zero'); return; }
    if (isPlanned && !form.sourceType) { setError('Select a Source Type'); return; }

    const payload = {
      direction: dir,
      movementDate: form.movementDate || today(),
      amount,
      mode: form.mode || null,
      remarks: form.remarks || null,
      projectId: null,
      party: '',
      ...(isPlanned ? { sourceType: form.sourceType, referenceNo: form.referenceNo || null } : {}),
    };

    if (isInflow) {
      if (form.projectId === ADD_CUSTOM) {
        if (!form.customParty.trim()) { setError('Enter the new Source Type value'); return; }
        payload.party = form.customParty.trim();
      } else if (form.projectId) {
        const p = projects.find(x => String(x.id) === String(form.projectId));
        if (p) { payload.projectId = p.id; payload.party = p.name; }
        else { payload.party = form.projectId; } // a remembered custom source
      } else {
        setError('Select or add a Source Type'); return;
      }
    } else {
      if (!form.projectId || form.projectId === ADD_CUSTOM) { setError('Select the project the payment was made to'); return; }
      const p = projects.find(x => String(x.id) === String(form.projectId));
      if (!p) { setError('Select a valid project'); return; }
      payload.projectId = p.id;
      payload.party = p.name;
    }

    setSaving(true);
    try {
      await api.create(payload);
      setShowForm(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    if (!window.confirm('Delete this entry?')) return;
    setBusyId(id);
    try {
      await api.delete(id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not delete');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Header: title + bank / project balances */}
      <div style={{ background: "var(--hz-surface)", border: '1px solid var(--hz-border)', borderRadius: 12, boxShadow: "var(--hz-shadow-sm)", padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--hz-primary-tint)", color: "var(--hz-primary)", display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Landmark size={24} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--hz-font-display)", fontSize: "var(--hz-text-xl)", fontWeight: 800, color: "var(--hz-ink)" }}>Happizo Funds</div>
          <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginTop: 2 }}>
            {isFunding ? 'Project balances, inter-project loans and money received.' : 'Planned inflow and actual / planned outflow.'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: 0 }}>
          {[
            { label: 'Bank Balance', value: totalBank, color: "var(--hz-primary)" },
            { label: 'Total Project Balance', value: totalProject, color: totalProject < 0 ? "var(--hz-danger)" : "var(--hz-success)" },
          ].map((t, i) => (
            <div key={t.label} style={{ padding: '2px 22px', borderLeft: i ? '1px solid var(--hz-border)' : 'none', textAlign: 'right' }}>
              <div style={{ fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-muted)" }}>{t.label}</div>
              <div style={{ marginTop: 2 }}><Money v={t.value} strong color={t.color} size="var(--hz-text-2xl)" /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Module tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1.5px solid #e2e8f0', marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          ['INFLOW', 'Inter Project Fund Flow', isFunding],
          ['CF_INFLOW', 'Cash Flow', !isFunding],
        ].map(([k, l, active]) => (
          <button key={l} onClick={() => { if (!active) { setView(k); setShowForm(false); } }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 18px',
              fontSize: "var(--hz-text-md)", fontWeight: active ? 700 : 600, color: active ? "var(--hz-primary)" : "var(--hz-muted)",
              borderBottom: active ? '2.5px solid var(--hz-brand)' : '2.5px solid transparent', marginBottom: -1.5 }}>
            {l}
          </button>
        ))}
      </div>

      {isFunding && (
        <FundingPanel funding={funding} onTransfer={(to) => setXfer(to)} onReload={load}
          notice={notice} onNotice={setNotice} />
      )}

      {/* View toggle + Add (Cash Flow) / "Transaction Details" heading (Inter Project Fund Flow) */}
      <div style={isFunding
        ? { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: "var(--hz-surface)", border: '1px solid var(--hz-border)', boxShadow: "var(--hz-shadow-sm)",
            borderRadius: txnOpen ? '12px 12px 0 0' : 12, padding: '14px 18px', marginBottom: txnOpen ? 0 : 18 }
        : { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {isFunding && (
          <button onClick={() => setTxnOpen(o => !o)} aria-expanded={txnOpen} title={txnOpen ? 'Minimise' : 'Show transactions'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: "var(--hz-font-display)",
              fontSize: "var(--hz-text-lg)", fontWeight: 700, color: "var(--hz-ink)" }}>
            {txnOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Transaction Details
          </button>
        )}
        {!isFunding && <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3, flexWrap: 'wrap' }}>
          {[
            ['CF_INFLOW', 'Actual Inflow', <ArrowDownLeft size={14} key="ai" />, '#16a34a'],
            ['PLANNED_INFLOW', 'Planned Inflow', <CalendarClock size={14} key="pi" />, '#0d9488'],
            ['OUTFLOW', 'Actual Outflow', <ArrowUpRight size={14} key="o" />, '#dc2626'],
            ['PLANNED_OUTFLOW', 'Planned Outflow', <CalendarClock size={14} key="po" />, '#b45309'],
          ].map(([k, l, ic, accent]) => (
            <button key={k} onClick={() => { setView(k); setShowForm(false); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: "var(--hz-text-sm)", fontWeight: view === k ? 700 : 500,
                padding: '7px 16px', borderRadius: 6,
                background: view === k ? accent : 'transparent',
                color: view === k ? "var(--hz-on-dark)" : "var(--hz-ink-2)" }}>
              {ic}{l}
            </button>
          ))}
        </div>}
        {false && ( /* All Cash Flow "Add" buttons removed on request (Actual / Planned Inflow, Actual / Planned Outflow) */
          <button onClick={openForm}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "var(--hz-on-dark)", background: '#0369a1', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={15} /> Add {viewLabel}
          </button>
        )}
        {!showPlanner && (
          <div style={{ marginLeft: 'auto', fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)" }}>
            {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · Total <Money v={totalShown} strong color={isInflow ? "var(--hz-success)" : "var(--hz-danger)"} />
          </div>
        )}
      </div>

      {/* Add form */}
      {showForm && !showPlanner && (
        <div className="card" style={{ padding: 18, marginBottom: 16, border: '1.5px solid #bae6fd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: "var(--hz-text-md)", fontWeight: 700, color: "var(--hz-ink)" }}>New {viewLabel} entry</div>
            <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: "var(--hz-muted)" }}><X size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>Date</label>
              <input type="date" style={inputS} value={form.movementDate} onChange={e => setForm(f => ({ ...f, movementDate: e.target.value }))} />
            </div>

            <div>
              <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>{partyLabel}</label>
              <select style={inputS} value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value, customParty: '' }))}>
                <option value="">— Select {isInflow ? 'source' : 'project'} —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                {isInflow && customSources.map(s => <option key={s} value={s}>{s}</option>)}
                {isInflow && <option value={ADD_CUSTOM}>＋ Add new value…</option>}
              </select>
              {isInflow && form.projectId === ADD_CUSTOM && (
                <input style={{ ...inputS, marginTop: 6 }} placeholder="Type the new Source Type"
                  value={form.customParty} onChange={e => setForm(f => ({ ...f, customParty: e.target.value }))} autoFocus />
              )}
              {!isInflow && form.projectId && form.projectId !== ADD_CUSTOM && (
                <div style={{ fontSize: "var(--hz-text-xs)", marginTop: 6, color: (balances[form.projectId]?.available ?? 0) >= 0 ? '#0f766e' : "var(--hz-danger)" }}>
                  Available: <b>{fmt(balances[form.projectId]?.available ?? 0)}</b>
                  <span style={{ color: "var(--hz-faint)", fontWeight: 500 }}>
                    {'  '}(in {fmt(balances[form.projectId]?.inflow ?? 0)} · out {fmt(balances[form.projectId]?.outflow ?? 0)})
                  </span>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>Amount</label>
              <input type="number" min="0" step="0.01" style={inputS} placeholder="0.00"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>

            <div>
              <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>{modeLabel}</label>
              <input style={inputS} list="fund-mode-list" placeholder="Select or type"
                value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))} />
              <datalist id="fund-mode-list">{modes.map(m => <option key={m} value={m} />)}</datalist>
            </div>

            {isPlanned && (
              <div>
                <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>Source Type</label>
                <select style={inputS} value={form.sourceType} onChange={e => setForm(f => ({ ...f, sourceType: e.target.value }))}>
                  <option value="">— Select —</option>
                  {SOURCE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}

            {isPlanned && !isInflow && (
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>Reference No. (PWJ Doc Number)</label>
                <input style={inputS} placeholder={form.projectId ? 'Search PO/WO/JO doc number…' : 'Select a project first'}
                  disabled={!form.projectId}
                  value={form.referenceNo}
                  onFocus={() => setDocSearchOpen(true)}
                  onChange={e => { setForm(f => ({ ...f, referenceNo: e.target.value })); setDocSearchOpen(true); }} />
                {docSearchOpen && form.referenceNo && pwjDocs.length > 0 && (() => {
                  const q = form.referenceNo.trim().toLowerCase();
                  const matches = pwjDocs.filter(d => (d.docNumber || '').toLowerCase().includes(q)).slice(0, 8);
                  if (matches.length === 0) return null;
                  return (
                    <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.1)', marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                      {matches.map(d => (
                        <div key={d.docNumber} onClick={() => { setForm(f => ({ ...f, referenceNo: d.docNumber })); setDocSearchOpen(false); }}
                          style={{ padding: '8px 12px', fontSize: "var(--hz-text-xs)", cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                          onMouseDown={e => e.preventDefault()}>
                          <div style={{ fontWeight: 700, color: "var(--hz-ink)" }}>{d.docNumber}</div>
                          <div style={{ color: "var(--hz-muted)" }}>{d.pwjType} · {d.vendor || '—'} · {d.materialRequired || ''}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {isPlanned && isInflow && (
              <div>
                <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>Reference No. (Invoice No.)</label>
                <input style={inputS} placeholder="Enter the Invoice No."
                  value={form.referenceNo} onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))} />
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>Remarks</label>
              <input style={inputS} placeholder="Optional note"
                value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
          {error && <div style={{ color: "var(--hz-danger)", fontSize: "var(--hz-text-xs)", marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={() => setShowForm(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-ink-2)", cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button disabled={saving} onClick={submit} style={{ border: 'none', background: '#0369a1', color: "var(--hz-on-dark)", borderRadius: 8, padding: '8px 16px', fontSize: "var(--hz-text-sm)", fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Add entry'}
            </button>
          </div>
        </div>
      )}

      {/* Table (in Inter Project Fund Flow, only while Transaction Details is expanded) */}
      {!showPlanner && (!isFunding || txnOpen) && (
      <div className="card" style={isFunding
        ? { overflow: 'hidden', borderRadius: '0 0 12px 12px', borderTop: 'none', marginTop: 0, marginBottom: 18, padding: 0 }
        : { overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>{isFunding ? 'Transfer Proj' : partyLabel}</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                {!isInflow && <th style={{ ...th, textAlign: 'right' }} title="Inflow received for this project − Outflow paid to it">Available</th>}
                <th style={th}>{modeLabel}</th>
                {isPlanned && <th style={th}>Source Type</th>}
                {isPlanned && <th style={th}>Reference No.</th>}
                <th style={th}>Remarks</th>
                <th style={{ ...th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={colCount}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td style={{ ...td, color: "var(--hz-faint)" }} colSpan={colCount}>No {viewLabel.toLowerCase()} entries yet.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.movementDate)}</td>
                  <td style={td}>
                    {isFunding ? (
                      // Transaction Details: money moved From (sender) To (project credited).
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span><span style={{ color: "var(--hz-muted)" }}>From </span><b style={{ fontWeight: 600 }}>{r.party || '—'}</b></span>
                        <span style={{ color: "var(--hz-muted)" }}>→</span>
                        <span><span style={{ color: "var(--hz-muted)" }}>To </span><b style={{ fontWeight: 600 }}>{r.projectName || '—'}</b></span>
                      </span>
                    ) : r.party}
                    {!isFunding && r.projectId && <span style={{ marginLeft: 6, fontSize: "var(--hz-text-2xs)", fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: 100, padding: '1px 7px' }}>Project</span>}
                    {r.sourceRef === 'LOAN' && <span title="Fund borrowed from this project — to be repaid" style={{ marginLeft: 6, fontSize: "var(--hz-text-2xs)", fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 100, padding: '1px 7px' }}>Loan</span>}
                    {r.sourceRef === 'LOAN-REPAY' && <span title="Repayment of fund borrowed earlier" style={{ marginLeft: 6, fontSize: "var(--hz-text-2xs)", fontWeight: 700, color: '#166534', background: '#dcfce7', borderRadius: 100, padding: '1px 7px' }}>Repayment</span>}
                    {r.sourceRef?.startsWith('SALARY-') && <span style={{ marginLeft: 6, fontSize: "var(--hz-text-2xs)", fontWeight: 700, color: '#0f766e', background: '#ccfbf1', borderRadius: 100, padding: '1px 7px' }}>Salary</span>}
                  </td>
                  <td style={{ ...td, ...num }}><Money v={r.amount} strong color={isInflow ? "var(--hz-success)" : "var(--hz-danger)"} /></td>
                  {!isInflow && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700,
                      color: r.projectId == null ? "var(--hz-faint)" : (balances[r.projectId]?.available ?? 0) >= 0 ? '#0f766e' : "var(--hz-danger)" }}>
                      {r.projectId == null ? '—' : fmt(balances[r.projectId]?.available ?? 0)}
                    </td>
                  )}
                  <td style={td}>{r.mode || '—'}</td>
                  {isPlanned && <td style={td}>{sourceTypeLabel(r.sourceType)}</td>}
                  {isPlanned && <td style={td}>{r.referenceNo || '—'}</td>}
                  <td style={{ ...td, color: "var(--hz-ink-2)", maxWidth: 280, whiteSpace: 'pre-wrap' }}>{r.remarks || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {r.sourceRef?.startsWith('SALARY-') ? (
                      <span title="Created automatically from the approved salary payment — can't be deleted here" style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-ink)" }}>Auto</span>
                    ) : (
                      <DeleteBtn onClick={() => del(r.id)} disabled={busyId === r.id} title="Delete" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td style={td} colSpan={2}>Total</td>
                  <td style={{ ...td, textAlign: 'right', color: isInflow ? '#16a34a' : "var(--hz-danger)" }}>{fmt(totalShown)}</td>
                  <td style={td} colSpan={colCount - 3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      )}

      {showPlanner && <OutflowPlanner />}

      {xfer && (
        <TransferModal
          xfer={xfer}
          surplus={funding?.surplus || []}
          onClose={() => setXfer(null)}
          onDone={(msg) => { setXfer(null); setNotice(msg || ''); load(); }}
        />
      )}
    </div>
  );
}

// ─── Inter Project Fund Flow panel: summary, today's bank transfer, loans, surplus ───
function FundingPanel({ funding, onTransfer, onReload, notice, onNotice }) {
  const [repaying, setRepaying] = useState(null);
  const [openLoans, setOpenLoans] = useState(() => new Set()); // "borrowerId-lenderId" keys of expanded loan rows
  const toggleLoan = (key) => setOpenLoans(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const [transfers, setTransfers] = useState(null); // every Fund Transfer outflow (loans + repayments)
  // Reload whenever the funding data changes (e.g. after a transfer or repayment) so the history stays current.
  useEffect(() => {
    fundManagementApi.list('OUTFLOW')
      .then(r => setTransfers((r.data || []).filter(m => m.mode === 'Fund Transfer')))
      .catch(() => setTransfers([]));
  }, [funding]);
  if (!funding) return <Section title="Inter Project Fund Flow"><div style={{ padding: 20, color: "var(--hz-muted)" }}>Loading…</div></Section>;
  const { projects = [], surplus = [], loans: allLoans = [], allFunded, totalShortfall, fundingInUse, date } = funding;
  // Fully repaid loans stay listed (with their history) below the ones still owed.
  const isSettled = (l) => l.settled || !(Number(l.outstanding) > 0);
  const openLoansList = allLoans.filter(l => !isSettled(l));
  const loans = [...openLoansList, ...allLoans.filter(isSettled)];
  const keyOf = (l) => `${l.borrowerId}-${l.lenderId}`;
  const totalOwed = openLoansList.reduce((t, l) => t + Number(l.outstanding || 0), 0);
  const totalFree = surplus.reduce((t, x) => t + Number(x.free || 0), 0);
  const totalDemand = projects.reduce((t, x) => t + Number(x.demand || 0), 0);

  async function repay(l) {
    const can = Math.min(Number(l.outstanding), Math.max(0, Number(l.borrowerSpare)));
    if (!(can > 0)) { alert(`${l.borrowerName} has no spare fund to repay ${l.lenderName} yet.`); return; }
    const partial = can < Number(l.outstanding);
    if (!window.confirm(`Repay ${fmt(can)} from ${l.borrowerName} back to ${l.lenderName}?` +
      (partial ? `\n\n${l.borrowerName} only has ${fmt(l.borrowerSpare)} spare, so ${fmt(Number(l.outstanding) - can)} will still be owed.` : ''))) return;
    const key = keyOf(l);
    setRepaying(key);
    try {
      const r = await fundManagementApi.repay({ borrowerId: l.borrowerId, lenderId: l.lenderId });
      onNotice(`${l.borrowerName} repaid ${fmt(r.data?.repaid)} to ${l.lenderName}` +
        (Number(r.data?.remaining) > 0 ? ` — ${fmt(r.data.remaining)} still owed.` : ' — fully settled.'));
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || 'Repayment failed');
    } finally {
      setRepaying(null);
    }
  }

  const status = !fundingInUse
    ? <Pill>No fund movements yet</Pill>
    : allFunded
      ? <Pill tone="success"><CheckCircle2 size={14} /> Bank file eligible</Pill>
      : <Pill tone="danger"><AlertTriangle size={14} /> Shortfall {fmt(totalShortfall)}</Pill>;
  const allOpen = loans.length > 0 && loans.every(l => openLoans.has(keyOf(l)));

  return (
    <>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Stat label="Due in today's bank transfer" value={totalDemand}
          sub={projects.length ? `${projects.length} project${projects.length === 1 ? '' : 's'} · ${allFunded ? 'all funded' : `${fmt(totalShortfall)} short`}` : 'Nothing due today'}
          color={!allFunded && fundingInUse ? "var(--hz-danger)" : undefined} />
        <Stat label="Outstanding inter-project loans" value={totalOwed} color={totalOwed > 0 ? "var(--hz-warning)" : "var(--hz-success)"}
          sub={`${openLoansList.length} open · ${allLoans.length - openLoansList.length} settled`} />
        <Stat label="Free to transfer" value={totalFree} color="var(--hz-success)"
          sub={`${surplus.length} project${surplus.length === 1 ? '' : 's'} with surplus`} />
      </div>

      {notice && (
        <div style={{ padding: '10px 16px', marginBottom: 18, borderRadius: 10, background: "var(--hz-success-bg)", color: "var(--hz-success)", fontSize: "var(--hz-text-md)", fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={18} />
          <div style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{notice}</div>
          <button onClick={() => onNotice('')} aria-label="Dismiss" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}><X size={16} /></button>
        </div>
      )}

      {/* Today's bank transfer */}
      <Section title="Today's bank transfer" subtitle={`Demand vs available fund · ${fmtDate(date)}`} right={status} flush
        headerWidth={projects.length ? TODAY_TABLE_W : undefined}>
        {projects.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            {/* Hugs its columns (no stretch) with black grid lines, like the loans table. */}
            <table className="fund-grid" style={{ width: TODAY_TABLE_W, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>{TODAY_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead><tr>
                <th style={th}>Project</th>
                <th style={{ ...th, ...num }}>Available fund</th>
                <th style={{ ...th, ...num }}>Today's demand</th>
                <th style={{ ...th, ...num }}>Shortfall</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr></thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.projectId}>
                    <td style={{ ...td, fontWeight: 600 }}>{p.projectName}</td>
                    <td style={{ ...td, ...num }}><Money v={p.available} /></td>
                    <td style={{ ...td, ...num }}><Money v={p.demand} strong /></td>
                    <td style={{ ...td, ...num }}><Money v={p.shortfall > 0 ? p.shortfall : 0} dash strong color="var(--hz-danger)" /></td>
                    <td style={td}>{p.funded ? <Pill tone="success">Funded</Pill> : <Pill tone="danger">Underfunded</Pill>}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {!p.funded && (
                        <button onClick={() => onTransfer({ toProjectId: p.projectId, toName: p.projectName, shortfall: p.shortfall })} style={btnPrimary}>
                          <ArrowLeftRight size={15} /> Transfer fund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Inter-project loans */}
      <Section title="Inter-project loans"
        subtitle="Fund borrowed from another project. It is repaid automatically before the borrower can transfer fund elsewhere."
        headerWidth={LOAN_TABLE_W}
        flush /* no divider under the title: the table's own black top border separates it */
        right={loans.length > 0 && (
          <button onClick={() => setOpenLoans(allOpen ? new Set() : new Set(loans.map(keyOf)))} style={btnGhost}>
            {allOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}>
        <div style={{ overflowX: 'auto' }}>
          {/* Table hugs its columns (no stretch to full width) so there is no empty gap before Action.
              Widths sum to LOAN_TABLE_W; an open loan's transactions are rows of this same table, so the lines align. */}
          <table className="fund-grid" style={{ width: LOAN_TABLE_W, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>{LOAN_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            {/* No column header row (removed on request); columns: Borrower, Borrowed from, Since, Outstanding, Borrower's spare fund, Action */}
            <tbody>
              {loans.length === 0 ? (
                <tr><td style={{ ...td, color: "var(--hz-faint)" }} colSpan={6}>No inter-project loans yet.</td></tr>
              ) : loans.map(l => {
                const key = keyOf(l);
                const settled = isSettled(l);
                const open = openLoans.has(key);
                const canPay = !settled && Number(l.borrowerSpare) > 0;
                return (
                  <React.Fragment key={key}>
                  <tr className={open ? 'loan-head' : undefined} onClick={() => toggleLoan(key)} title={open ? 'Hide transactions' : 'Show all transactions for this loan'}
                    style={{ cursor: 'pointer' }}>
                    <td style={{ ...td, fontWeight: 600, color: settled ? "var(--hz-ink-2)" : "var(--hz-ink)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: "var(--hz-muted)", display: 'inline-flex' }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>{l.borrowerName}
                      </span>
                    </td>
                    <td style={{ ...td, color: settled ? "var(--hz-ink-2)" : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.lenderName}>{l.lenderName}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: "var(--hz-ink-2)" }}>{fmtDate(l.since)}</td>
                    <td style={{ ...td, ...num }}>{settled ? <Money v={0} color="var(--hz-faint)" /> : <Money v={l.outstanding} strong color="var(--hz-warning)" />}</td>
                    <td style={{ ...td, ...num }}>{settled ? <span style={{ color: "var(--hz-faint)" }}>—</span> : <Money v={l.borrowerSpare} color={canPay ? "var(--hz-ink)" : "var(--hz-faint)"} />}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {settled ? (
                        <Pill tone="success" title="Fully repaid — click the row to see its transactions"><CheckCircle2 size={14} /> Settled</Pill>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); repay(l); }} disabled={!canPay || repaying === key}
                          title={canPay ? `Send fund from ${l.borrowerName} back to ${l.lenderName}` : `${l.borrowerName} has no spare fund yet`}
                          style={canPay ? { ...btnPrimary, opacity: repaying === key ? 0.6 : 1 } : { ...btnGhost, color: "var(--hz-faint)", cursor: 'not-allowed', background: "var(--hz-bg)" }}>
                          {repaying === key ? 'Repaying…' : `Repay ${l.lenderName}`}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && <LoanHistoryRows loan={l} transfers={transfers} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Surplus */}
      <Section title="Available fund in other projects" subtitle="Fund that can be lent to a project that is short."
        headerWidth={SURPLUS_TABLE_W} flush>
        <div style={{ overflowX: 'auto' }}>
          {/* Hugs its columns (no stretch) with black grid lines, like the loans table. */}
          <table className="fund-grid" style={{ width: SURPLUS_TABLE_W, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>{SURPLUS_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead><tr>
              <th style={th}>Project</th>
              <th style={{ ...th, ...num }}>Available fund</th>
              <th style={{ ...th, ...num }}>Owes (repaid first)</th>
              <th style={{ ...th, ...num }}>Free to transfer</th>
            </tr></thead>
            <tbody>
              {surplus.length === 0 ? (
                <tr><td style={{ ...td, color: "var(--hz-faint)" }} colSpan={4}>No project currently has surplus fund.</td></tr>
              ) : surplus.map(x => (
                <tr key={x.projectId}>
                  <td style={{ ...td, fontWeight: 600 }}>{x.projectName}</td>
                  <td style={{ ...td, ...num }}><Money v={x.available} /></td>
                  <td style={{ ...td, ...num }} title={(x.debts || []).map(d => `${fmt(d.outstanding)} to ${d.lenderName}`).join(', ')}>
                    {Number(x.owed) > 0
                      ? <><Money v={x.owed} strong color="var(--hz-warning)" /><div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>to {(x.debts || []).map(d => d.lenderName).join(', ')}</div></>
                      : <span style={{ color: "var(--hz-faint)" }}>—</span>}
                  </td>
                  <td style={{ ...td, ...num }}><Money v={x.free} strong color={Number(x.free) > 0 ? "var(--hz-success)" : "var(--hz-faint)"} /></td>
                </tr>
              ))}
            </tbody>
            {surplus.length > 1 && (
              <tfoot><tr>
                <td style={{ ...td, fontWeight: 700, background: "var(--hz-bg)" }}>Total</td>
                <td style={{ ...td, ...num, background: "var(--hz-bg)" }}><Money v={surplus.reduce((t, x) => t + Number(x.available || 0), 0)} strong /></td>
                <td style={{ ...td, ...num, background: "var(--hz-bg)" }}><Money v={surplus.reduce((t, x) => t + Number(x.owed || 0), 0)} dash strong color="var(--hz-warning)" /></td>
                <td style={{ ...td, ...num, background: "var(--hz-bg)" }}><Money v={totalFree} strong color="var(--hz-success)" /></td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </Section>
    </>
  );
}

// Column widths for the loans table. A loan's transactions are drawn as rows of the SAME table, so every
// column line runs straight through both:
//   Borrower       | Borrowed from              | Since  | Outstanding | Borrower's spare fund | Action
//   Date           | Borrowed from / Repaid to  | Debit  | Credit      | Amount                | Remarks
// The table is sized to the sum of its columns so it hugs its content instead of stretching across the page.
const LOAN_COLS = [240, 300, 170, 170, 240, 290];
const LOAN_TABLE_W = LOAN_COLS.reduce((a, b) => a + b, 0);
// Available fund in other projects: Project, Available fund, Owes (repaid first), Free to transfer
const SURPLUS_COLS = [300, 220, 260, 220];
// Today's bank transfer: Project, Available fund, Today's demand, Shortfall, Status, Action
const TODAY_COLS = [300, 220, 220, 200, 170, 200];
const TODAY_TABLE_W = TODAY_COLS.reduce((a, b) => a + b, 0);          // 1310
const SURPLUS_TABLE_W = SURPLUS_COLS.reduce((a, b) => a + b, 0);      // 1000            // 1410

// ─── One loan's transactions (borrower's view), oldest first, as rows of the loans table ───
// Borrowing is a Credit (money coming in), a repayment is a Debit (money going out);
// Amount = running balance (credits − debits), i.e. what is still owed after each row.
function LoanHistoryRows({ loan: l, transfers }) {
  const bg = "var(--hz-bg)";
  const c = { ...td, padding: '10px 16px', background: bg };
  const first = { ...c, paddingLeft: 44 };           // indent so the rows read as belonging to the loan above
  if (transfers == null) return <tr><td colSpan={6} style={{ ...first, color: "var(--hz-muted)" }}>Loading…</td></tr>;
  const isTo = (m, id, name) => (m.counterpartyProjectId != null ? m.counterpartyProjectId === id : m.party === name);
  const txns = transfers
    .filter(m => (m.projectId === l.lenderId && isTo(m, l.borrowerId, l.borrowerName))
              || (m.projectId === l.borrowerId && isTo(m, l.lenderId, l.lenderName)))
    .map(m => ({ ...m, lent: m.projectId === l.lenderId }))
    .sort((a, b) => String(a.movementDate).localeCompare(String(b.movementDate)) || a.id - b.id);
  let balance = 0;
  const rows = txns.map(m => { balance += (m.lent ? 1 : -1) * Number(m.amount || 0); return { ...m, balance }; });
  const lentTotal = txns.filter(m => m.lent).reduce((t, m) => t + Number(m.amount || 0), 0);
  const repaidTotal = txns.filter(m => !m.lent).reduce((t, m) => t + Number(m.amount || 0), 0);
  if (rows.length === 0) return <tr><td colSpan={6} style={{ ...first, color: "var(--hz-faint)" }}>No transfer records found for this loan.</td></tr>;
  const h = { ...th, padding: '13px 16px', background: "var(--hz-surface-2)", fontSize: "var(--hz-text-md)", fontWeight: 700, color: "var(--hz-ink)" };
  const tot = { ...c, background: "var(--hz-surface-2)" };
  return (
    <>
      <tr>
        <th style={{ ...h, paddingLeft: 44 }}>Date</th>
        <th style={h} title="The other project in this transaction">Borrowed from / Repaid to</th>
        <th style={{ ...h, ...num }} title={`Money ${l.borrowerName} gave back`}>Debit</th>
        <th style={{ ...h, ...num }} title={`Money ${l.borrowerName} received`}>Credit</th>
        <th style={{ ...h, ...num }} title="Balance still owed after this transaction (Credit − Debit)">Amount</th>
        <th style={h}>Remarks</th>
      </tr>
      {rows.map(m => (
        <tr key={m.id}>
          <td style={{ ...first, whiteSpace: 'nowrap', color: "var(--hz-ink-2)" }}>{fmtDate(m.movementDate)}</td>
          <td style={c}><span style={{ color: "var(--hz-muted)" }}>{m.lent ? 'Borrowed from' : 'Repaid to'}</span> <b style={{ fontWeight: 600 }}>{l.lenderName}</b></td>
          <td style={{ ...c, ...num }}>{m.lent ? <span style={{ color: "var(--hz-faint)" }}>—</span> : <Money v={m.amount} color="var(--hz-danger)" />}</td>
          <td style={{ ...c, ...num }}>{m.lent ? <Money v={m.amount} color="var(--hz-success)" /> : <span style={{ color: "var(--hz-faint)" }}>—</span>}</td>
          <td style={{ ...c, ...num }}><Money v={Math.max(0, m.balance)} strong /></td>
          <td style={{ ...c, color: "var(--hz-ink-2)", overflowWrap: 'anywhere' }}>{m.remarks || '—'}</td>
        </tr>
      ))}
      <tr>
        <td style={{ ...tot, paddingLeft: 44, fontWeight: 700 }}>Total</td>
        <td style={tot}></td>
        <td style={{ ...tot, ...num }}><Money v={repaidTotal} dash strong color="var(--hz-danger)" /></td>
        <td style={{ ...tot, ...num }}><Money v={lentTotal} strong color="var(--hz-success)" /></td>
        <td style={{ ...tot, ...num }}><Money v={l.outstanding} strong /></td>
        <td style={{ ...tot, color: "var(--hz-muted)", fontSize: "var(--hz-text-sm)" }}>{Number(l.outstanding) > 0 ? 'Outstanding' : 'Fully repaid'}</td>
      </tr>
    </>
  );
}

// ─── Cash Flow → Actual Outflow → Outflow Planner ───
// Planned outflow from issued BOQ documents (VP-approved PO / WO / JO), placed on each document's completion
// date (falls back to its required date, then its issue date) and grouped by week / month / quarter / year.
// Multi-vendor and Additional-PO sub-documents each come through as their own line (from /expenses/pwj-docs).
const PLAN_PERIODS = [['WEEK', 'Weekly'], ['MONTH', 'Monthly'], ['QUARTER', 'Quarterly'], ['YEAR', 'Yearly']];
const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDay = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
// Payments go out on the Wednesday / Saturday payment cycle: an outflow due on a date is paid on the first
// Wednesday or Saturday on or after it.
const PAY_DAYS = [3, 6]; // Date.getDay(): Wed, Sat
const payDayOf = (d) => { const dow = d.getDay(); const add = dow <= 3 ? 3 - dow : dow <= 6 ? 6 - dow : 3; return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (dow === 0 ? 3 : add)); };
const isPayDay = (d) => PAY_DAYS.includes(d.getDay());
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dshort = (d) => `${d.getDate()} ${MONTHS3[d.getMonth()]}`;
// Period a date falls in. Weeks run Monday–Sunday; quarters and years follow the Indian financial year (April–March).
function periodOf(d, mode) {
  const y = d.getFullYear(), mo = d.getMonth();
  if (mode === 'WEEK') {
    const start = new Date(y, mo, d.getDate() - ((d.getDay() + 6) % 7));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { key: dkey(start), start, end, label: `Week of ${dshort(start)} ${start.getFullYear()}`, sub: `${dshort(start)} – ${dshort(end)} ${end.getFullYear()}` };
  }
  if (mode === 'MONTH') {
    const start = new Date(y, mo, 1), end = new Date(y, mo + 1, 0);
    return { key: dkey(start), start, end, label: `${MONTHS3[mo]} ${y}`, sub: `1 – ${end.getDate()} ${MONTHS3[mo]}` };
  }
  const fy = mo >= 3 ? y : y - 1; // financial year starting April of `fy`
  const fyLabel = `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
  if (mode === 'QUARTER') {
    const q = Math.floor(((mo + 9) % 12) / 3); // Apr–Jun = 0 … Jan–Mar = 3
    const start = new Date(fy, 3 + q * 3, 1), end = new Date(fy, 3 + q * 3 + 3, 0);
    return { key: dkey(start), start, end, label: `Q${q + 1} ${fyLabel}`, sub: `${MONTHS3[start.getMonth()]} – ${MONTHS3[end.getMonth()]} ${end.getFullYear()}` };
  }
  const start = new Date(fy, 3, 1), end = new Date(fy + 1, 2, 31);
  return { key: dkey(start), start, end, label: fyLabel, sub: `Apr ${fy} – Mar ${fy + 1}` };
}

function OutflowPlannerList() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('WEEK');
  const [project, setProject] = useState('');
  const [upcoming, setUpcoming] = useState(false);
  const [closed, setClosed] = useState(() => new Set()); // period keys the user collapsed

  useEffect(() => {
    pwjDocsApi.getDocs()
      .then(r => setDocs(r.data || []))
      .catch(() => { setDocs([]); setError('Could not load the issued documents.'); });
  }, []);

  const lines = useMemo(() => (docs || [])
    .filter(x => x.docStatus === 'VP_APPROVED' && Number(x.totalPayable) > 0)
    .map(x => {
      const src = toDay(x.completionDate) ? 'completion' : toDay(x.requiredDate) ? 'required' : 'issued';
      const due = toDay(x.completionDate) || toDay(x.requiredDate) || toDay(x.issuedAt);
      // Placed on its payment day (next Wednesday / Saturday on or after the due date).
      return { ...x, dueDate: due, date: due ? payDayOf(due) : null, src, amount: Number(x.totalPayable) };
    })
    .filter(x => x.date), [docs]);

  const projectNames = useMemo(() => [...new Set(lines.map(x => x.projectName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [lines]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cur = periodOf(today, mode);
  const next = periodOf(new Date(cur.end.getFullYear(), cur.end.getMonth(), cur.end.getDate() + 1), mode);

  const shown = lines.filter(x => (!project || x.projectName === project) && (!upcoming || x.date >= cur.start));
  // period → project → documents
  const periods = useMemo(() => {
    const map = new Map();
    for (const x of shown) {
      const pr = periodOf(x.date, mode);
      if (!map.has(pr.key)) map.set(pr.key, { ...pr, total: 0, byProject: new Map() });
      const g = map.get(pr.key);
      g.total += x.amount;
      const pn = x.projectName || '—';
      if (!g.byProject.has(pn)) g.byProject.set(pn, { name: pn, total: 0, docs: [] });
      const pg = g.byProject.get(pn); pg.total += x.amount; pg.docs.push(x);
    }
    return [...map.values()].sort((a, b) => a.start - b.start).map(g => ({
      ...g, projects: [...g.byProject.values()].sort((a, b) => a.name.localeCompare(b.name))
        .map(pg => ({ ...pg, docs: pg.docs.sort((a, b) => a.date - b.date || String(a.docNumber).localeCompare(String(b.docNumber))) })),
    }));
  }, [shown, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalOf = (pr) => periods.find(g => g.key === pr.key)?.total || 0;
  const grand = shown.reduce((t, x) => t + x.amount, 0);
  const unit = { WEEK: 'week', MONTH: 'month', QUARTER: 'quarter', YEAR: 'year' }[mode];
  // Past periods start collapsed; the current and upcoming ones start open.
  const isOpen = (g) => (closed.has(g.key) ? false : g.end >= today) || closed.has('open:' + g.key);
  const toggle = (g) => setClosed(prev => {
    const n = new Set(prev); const open = isOpen(g);
    n.delete(g.key); n.delete('open:' + g.key);
    if (open) n.add(g.key); else n.add('open:' + g.key);
    return n;
  });
  const allOpen = periods.length > 0 && periods.every(isOpen);
  const setAll = (open) => setClosed(open ? new Set(periods.map(g => 'open:' + g.key)) : new Set(periods.map(g => g.key)));

  const COLS = [170, 185, 70, 100, 360, 210];
  const W = COLS.reduce((a, b) => a + b, 0);
  const seg = (active) => ({ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: "var(--hz-text-sm)", fontWeight: active ? 700 : 500, padding: '7px 14px', borderRadius: 6,
    background: active ? "var(--hz-primary)" : 'transparent', color: active ? "var(--hz-on-dark)" : "var(--hz-ink-2)" });

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Stat label={`This ${unit}`} value={totalOf(cur)} sub={cur.sub} color="var(--hz-danger)" />
        <Stat label={`Next ${unit}`} value={totalOf(next)} sub={next.sub} color="var(--hz-warning)" />
        <Stat label={upcoming ? 'Total planned (from this ' + unit + ')' : 'Total planned'} value={grand}
          sub={`${shown.length} document${shown.length === 1 ? '' : 's'}${project ? ` · ${project}` : ''}`} />
      </div>

      <Section title="Outflow Planner"
        subtitle="Planned outflow from issued BOQ documents (PO / WO / JO), on the Wednesday / Saturday payment day after each completion date."
        headerWidth={W} flush
        right={periods.length > 0 && (
          <button onClick={() => setAll(!allOpen)} style={btnGhost}>
            {allOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 18px 14px', maxWidth: W, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
            {PLAN_PERIODS.map(([k, l]) => <button key={k} onClick={() => { setMode(k); setClosed(new Set()); }} style={seg(mode === k)}>{l}</button>)}
          </div>
          <select value={project} onChange={e => setProject(e.target.value)} aria-label="Project"
            style={{ ...inputS, width: 'auto', minWidth: 220, padding: '7px 10px' }}>
            <option value="">All projects</option>
            {projectNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)", cursor: 'pointer' }}>
            <input type="checkbox" checked={upcoming} onChange={e => setUpcoming(e.target.checked)} /> From this {unit} onwards
          </label>
        </div>

        {docs == null ? <div style={{ padding: '0 18px 18px', color: "var(--hz-muted)" }}>Loading…</div>
          : error ? <div style={{ padding: '0 18px 18px', color: "var(--hz-danger)" }}>{error}</div>
          : periods.length === 0 ? <div style={{ padding: '0 18px 18px', color: "var(--hz-faint)" }}>No issued documents{project ? ` for ${project}` : ''}{upcoming ? ` from this ${unit} onwards` : ''}.</div>
          : (
          <div style={{ overflowX: 'auto' }}>
            <table className="fund-grid" style={{ width: W, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead><tr>
                <th style={th}>Payment day</th>
                <th style={th}>Document</th>
                <th style={th}>Type</th>
                <th style={th}>BOQ</th>
                <th style={th}>Vendor / Material</th>
                <th style={{ ...th, ...num }}>Planned outflow</th>
              </tr></thead>
              <tbody>
                {periods.map(g => {
                  const open = isOpen(g);
                  const isCur = g.key === cur.key;
                  return (
                    <React.Fragment key={g.key}>
                      <tr className={open ? 'loan-head' : undefined} onClick={() => toggle(g)} style={{ cursor: 'pointer' }}>
                        <td colSpan={5} style={{ ...td, fontWeight: 700 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: "var(--hz-muted)", display: 'inline-flex' }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                            {g.label}
                            <span style={{ fontWeight: 500, color: "var(--hz-muted)" }}>· {g.sub}</span>
                            {isCur && <Pill tone="warning">Current {unit}</Pill>}
                            {g.end < today && <Pill>Past</Pill>}
                          </span>
                        </td>
                        <td style={{ ...td, ...num }}><Money v={g.total} strong color="var(--hz-danger)" /></td>
                      </tr>
                      {open && g.projects.map(pg => (
                        <React.Fragment key={pg.name}>
                          {!project && (
                            <tr>
                              <td colSpan={5} style={{ ...td, paddingLeft: 40, fontWeight: 700, color: "var(--hz-primary)" }}>{pg.name}
                                <span style={{ fontWeight: 500, color: "var(--hz-muted)" }}> · {pg.docs.length} document{pg.docs.length === 1 ? '' : 's'}</span></td>
                              <td style={{ ...td, ...num }}><Money v={pg.total} strong /></td>
                            </tr>
                          )}
                          {pg.docs.map((x, i) => (
                            <tr key={`${x.entryId}-${x.docNumber}-${x.vendor}-${i}`}>
                              <td style={{ ...td, paddingLeft: project ? 16 : 40, whiteSpace: 'nowrap' }}>
                                {fmtDate(x.date)} <span style={{ color: "var(--hz-muted)", fontSize: "var(--hz-text-sm)" }}>{WEEKDAYS[(x.date.getDay() + 6) % 7]}</span>
                                <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>due {fmtDate(x.dueDate)}{x.src !== 'completion' ? ` (${x.src === 'required' ? 'required' : 'issue'} date)` : ''}</div>
                              </td>
                              <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{x.docNumber || x.baseDocNumber || '—'}
                                {x.isAdditionalPo && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", fontWeight: 500 }}>additional / split</div>}</td>
                              <td style={td}>{x.pwjType || '—'}</td>
                              <td style={td}>{x.boqNo || '—'}</td>
                              <td style={{ ...td, overflowWrap: 'anywhere' }}>
                                <div style={{ fontWeight: 600 }}>{x.vendor || '—'}</div>
                                {x.materialRequired && <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)" }}>{x.materialRequired}</div>}
                              </td>
                              <td style={{ ...td, ...num }}><Money v={x.amount} /></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={5} style={{ ...td, fontWeight: 800 }}>Total planned outflow</td>
                <td style={{ ...td, ...num }}><Money v={grand} strong color="var(--hz-danger)" /></td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

// ─── Outflow Planner: calendar view (default) with a List option ───
// Same data and dates as the list: issued BOQ documents on their completion date (else required date, else issue date).
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Compact rupees for small calendar cells: ₹12.4L, ₹1.2Cr, ₹45K.
const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 2).replace(/\.?0+$/, '')}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v >= 1e6 ? 1 : 2).replace(/\.?0+$/, '')}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.?0+$/, '')}K`;
  return `₹${Math.round(v)}`;
};
// Monday-first grid of weeks covering a month.
function monthWeeks(y, m) {
  const first = new Date(y, m, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
    if (w > 3 && row[0].getMonth() !== m) break;
    weeks.push(row);
  }
  return weeks;
}

// Distinct, calm colours so each project reads as its own "calendar" (assigned in name order).
const PROJECT_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#b91c1c', '#7c3aed'];

function OutflowPlanner() {
  const [layout, setLayout] = useState('CALENDAR'); // CALENDAR | LIST
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('MONTH');
  const [project, setProject] = useState('');
  const [anchor, setAnchor] = useState(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; });
  const [picked, setPicked] = useState(null); // selected day, or null = whole period

  useEffect(() => {
    pwjDocsApi.getDocs()
      .then(r => setDocs(r.data || []))
      .catch(() => { setDocs([]); setError('Could not load the issued documents.'); });
  }, []);

  const lines = useMemo(() => (docs || [])
    .filter(x => x.docStatus === 'VP_APPROVED' && Number(x.totalPayable) > 0)
    .map(x => {
      const src = toDay(x.completionDate) ? 'completion' : toDay(x.requiredDate) ? 'required' : 'issued';
      const due = toDay(x.completionDate) || toDay(x.requiredDate) || toDay(x.issuedAt);
      // Placed on its payment day (next Wednesday / Saturday on or after the due date).
      return { ...x, dueDate: due, date: due ? payDayOf(due) : null, src, amount: Number(x.totalPayable) };
    })
    .filter(x => x.date), [docs]);
  const projectNames = useMemo(() => [...new Set(lines.map(x => x.projectName || '—'))].sort((a, b) => a.localeCompare(b)), [lines]);
  const colorOf = (name) => PROJECT_COLORS[Math.max(0, projectNames.indexOf(name || '—')) % PROJECT_COLORS.length];
  const shown = useMemo(() => lines.filter(x => !project || (x.projectName || '—') === project), [lines, project]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const x of shown) {
      const k = dkey(x.date);
      if (!m.has(k)) m.set(k, { total: 0, docs: [] });
      const g = m.get(k); g.total += x.amount; g.docs.push(x);
    }
    return m;
  }, [shown]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pr = periodOf(anchor, mode);
  const inPeriod = shown.filter(x => x.date >= pr.start && x.date <= pr.end);
  const periodTotal = inPeriod.reduce((t, x) => t + x.amount, 0);
  const dayTotals = [...byDay.entries()].filter(([k]) => { const d = toDay(k); return d >= pr.start && d <= pr.end; }).map(([, g]) => g.total);
  const maxDay = Math.max(1, ...dayTotals);
  const unit = { WEEK: 'week', MONTH: 'month', QUARTER: 'quarter', YEAR: 'year' }[mode];
  const title = mode === 'MONTH' ? `${MONTHS_FULL[pr.start.getMonth()]} ${pr.start.getFullYear()}` : pr.label;

  const step = (dir) => {
    setPicked(null);
    setAnchor(a => mode === 'WEEK' ? addDays(a, 7 * dir)
      : mode === 'MONTH' ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
      : mode === 'QUARTER' ? new Date(a.getFullYear(), a.getMonth() + 3 * dir, 1)
      : new Date(a.getFullYear() + dir, a.getMonth(), 1));
  };
  const goToday = () => { setPicked(null); setAnchor(today); };
  const jump = (dir) => {
    const ds = shown.map(x => x.date).sort((a, b) => a - b);
    const target = dir > 0 ? ds.find(d => d > pr.end) : [...ds].reverse().find(d => d < pr.start);
    if (target) { setPicked(null); setAnchor(target); }
  };
  const hasBefore = shown.some(x => x.date < pr.start), hasAfter = shown.some(x => x.date > pr.end);
  const pick = (d) => setPicked(p => p && sameDay(p, d) ? null : d);

  // ── styles ──
  const LINE = '1px solid var(--hz-border-strong)';
  const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: LINE, borderRadius: 8, background: '#fff', cursor: 'pointer', color: "var(--hz-ink-2)" };
  const seg = (active) => ({ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: "var(--hz-text-sm)", fontWeight: active ? 700 : 500, padding: '6px 14px', borderRadius: 6,
    background: active ? '#fff' : 'transparent', color: active ? "var(--hz-primary)" : "var(--hz-ink-2)", boxShadow: active ? '0 1px 2px rgba(15,23,42,.12)' : 'none' });
  const segWrap = { display: 'flex', gap: 2, background: "var(--hz-surface-2)", borderRadius: 8, padding: 3 };
  const DayNum = ({ d, small, dim }) => {
    const isToday = sameDay(d, today);
    const sz = small ? 24 : 30;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: sz, height: sz, borderRadius: '50%',
        background: isToday ? "var(--hz-brand)" : 'transparent', color: isToday ? '#fff' : dim ? "var(--hz-faint)" : "var(--hz-ink)",
        fontWeight: isToday ? 700 : 600, fontSize: small ? 12.5 : "var(--hz-text-md)" }}>{d.getDate()}</span>
    );
  };
  const Chip = ({ x, compact }) => (
    <div title={`${x.docNumber || x.baseDocNumber} · ${x.projectName || '—'} · ${x.vendor || ''} · ${fmt(x.amount)}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, padding: compact ? '2px 6px' : '6px 8px', marginTop: 4,
        background: `${colorOf(x.projectName)}14`, borderLeft: `3px solid ${colorOf(x.projectName)}`, fontSize: compact ? 12.5 : "var(--hz-text-sm)", minWidth: 0 }}>
      <span style={{ fontWeight: 600, color: "var(--hz-ink)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{x.docNumber || x.baseDocNumber}</span>
      {!compact && <span style={{ whiteSpace: 'nowrap' }}><Money v={x.amount} /></span>}
    </div>
  );

  // ── Week: seven columns of event cards ──
  const WeekView = () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(pr.start, i));
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', border: LINE, borderRadius: 10, overflow: 'hidden', minWidth: 840 }}>
        {days.map((d, i) => {
          const g = byDay.get(dkey(d));
          const sel = picked && sameDay(picked, d);
          return (
            <div key={i} onClick={() => pick(d)} style={{ borderLeft: i ? LINE : 'none', minHeight: 320, cursor: 'pointer', background: sel ? "var(--hz-primary-tint)" : isPayDay(d) ? 'var(--hz-brand-tint)' : '#fff' }}>
              <div style={{ padding: '10px 10px 8px', borderBottom: LINE, textAlign: 'center' }}>
                <div style={{ fontSize: "var(--hz-text-xs)", fontWeight: 700, color: isPayDay(d) ? "var(--hz-info)" : "var(--hz-muted)", letterSpacing: '.06em' }}>{WEEKDAYS[i].toUpperCase()}{isPayDay(d) && ' · PAYMENT'}</div>
                <div style={{ marginTop: 4 }}><DayNum d={d} /></div>
                <div style={{ marginTop: 4, minHeight: 20, fontSize: "var(--hz-text-sm)" }}>{g ? <Money v={g.total} strong color="var(--hz-ink)" /> : <span style={{ color: "var(--hz-faint)" }}>—</span>}</div>
              </div>
              <div style={{ padding: 8 }}>
                {(g?.docs || []).map((x, j) => (
                  <div key={j} style={{ borderRadius: 8, padding: '8px 9px', marginBottom: 6, background: `${colorOf(x.projectName)}12`, borderLeft: `3px solid ${colorOf(x.projectName)}` }}>
                    <div style={{ fontWeight: 700, fontSize: "var(--hz-text-sm)" }}>{x.docNumber || x.baseDocNumber}</div>
                    <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.projectName || '—'} · {x.vendor || '—'}</div>
                    <div style={{ fontSize: "var(--hz-text-sm)", marginTop: 2 }}><Money v={x.amount} /></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Month: full grid with event chips ──
  const MonthView = ({ y, m }) => {
    const weeks = monthWeeks(y, m);
    return (
      <div style={{ border: LINE, borderRadius: 10, overflow: 'hidden', minWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: "var(--hz-bg)", borderBottom: LINE }}>
          {WEEKDAYS.map((w, i) => {
            const pay = i === 2 || i === 5; // Wed, Sat
            return <div key={w} style={{ padding: '9px 10px', fontSize: "var(--hz-text-xs)", fontWeight: 700, color: pay ? "var(--hz-info)" : "var(--hz-muted)", letterSpacing: '.06em',
              background: pay ? 'var(--hz-brand-tint)' : undefined }}>{w.toUpperCase()}{pay && <span style={{ fontWeight: 600 }}> · Payment</span>}</div>;
          })}
        </div>
        {weeks.map((row, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderTop: wi ? LINE : 'none' }}>
            {row.map((d, di) => {
              const inMonth = d.getMonth() === m;
              const g = inMonth ? byDay.get(dkey(d)) : null;
              const sel = picked && sameDay(picked, d);
              return (
                <div key={di} onClick={() => inMonth && pick(d)}
                  style={{ borderLeft: di ? LINE : 'none', minHeight: 112, padding: '6px 7px', cursor: inMonth ? 'pointer' : 'default', minWidth: 0,
                    background: sel ? "var(--hz-primary-tint)" : !inMonth ? "var(--hz-bg)" : isPayDay(d) ? 'var(--hz-brand-tint)' : '#fff', boxShadow: sel ? 'inset 0 0 0 2px var(--hz-primary)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <DayNum d={d} dim={!inMonth} />
                    {g && <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--hz-ink-2)" }}>{fmtShort(g.total)}</span>}
                  </div>
                  {g && g.docs.slice(0, 3).map((x, j) => <Chip key={j} x={x} compact />)}
                  {g && g.docs.length > 3 && <div style={{ fontSize: 12.5, color: "var(--hz-link)", fontWeight: 600, marginTop: 3 }}>+{g.docs.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // ── Quarter / Year: mini months, days tinted by outflow ──
  const MiniMonth = ({ y, m }) => {
    const weeks = monthWeeks(y, m);
    const mTotal = shown.filter(x => x.date.getFullYear() === y && x.date.getMonth() === m).reduce((t, x) => t + x.amount, 0);
    return (
      <div style={{ border: LINE, borderRadius: 10, padding: '10px 12px 12px', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <button onClick={() => { setMode('MONTH'); setAnchor(new Date(y, m, 1)); setPicked(null); }} title="Open this month"
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: "var(--hz-font-display)", fontSize: "var(--hz-text-md)", fontWeight: 700, color: "var(--hz-ink)" }}>
            {MONTHS_FULL[m]}
          </button>
          <span style={{ fontSize: "var(--hz-text-sm)", fontWeight: 700, color: mTotal ? "var(--hz-ink-2)" : "var(--hz-faint)" }}>{mTotal ? fmtShort(mTotal) : '—'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 3, textAlign: 'center' }}>
          {WEEKDAYS.map((w, i) => <div key={w} style={{ fontSize: 11.5, fontWeight: 700, color: i === 2 || i === 5 ? "var(--hz-info)" : "var(--hz-faint)", paddingBottom: 3 }}>{w[0]}</div>)}
          {weeks.flat().map((d, i) => {
            const inMonth = d.getMonth() === m;
            const g = inMonth ? byDay.get(dkey(d)) : null;
            const sel = picked && sameDay(picked, d);
            const t = g ? 0.18 + 0.62 * Math.sqrt(g.total / maxDay) : 0;
            const isToday = sameDay(d, today);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => inMonth && pick(d)} disabled={!inMonth}
                  title={g ? `${fmtDate(d)} · ${g.docs.length} document${g.docs.length === 1 ? '' : 's'} · ${fmt(g.total)}` : undefined}
                  style={{ width: mode === 'QUARTER' ? 38 : 30, height: mode === 'QUARTER' ? 38 : 30, borderRadius: '50%', border: sel ? '2px solid var(--hz-primary)' : isToday ? '2px solid var(--hz-brand)' : 'none',
                    background: g ? `rgba(30, 58, 95, ${t})` : 'transparent', color: g && t > 0.45 ? '#fff' : inMonth ? "var(--hz-ink)" : 'transparent',
                    fontSize: 12.5, fontWeight: g || isToday ? 700 : 500, cursor: inMonth ? 'pointer' : 'default', fontFamily: 'inherit', padding: 0 }}>
                  {d.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const months = mode === 'QUARTER' ? [0, 1, 2].map(i => new Date(pr.start.getFullYear(), pr.start.getMonth() + i, 1))
    : mode === 'YEAR' ? Array.from({ length: 12 }, (_, i) => new Date(pr.start.getFullYear(), pr.start.getMonth() + i, 1)) : [];

  // ── side panel: summary + agenda ──
  const focus = picked ? shown.filter(x => sameDay(x.date, picked)) : inPeriod;
  const focusTotal = focus.reduce((t, x) => t + x.amount, 0);
  const byProj = [...focus.reduce((m, x) => m.set(x.projectName || '—', (m.get(x.projectName || '—') || 0) + x.amount), new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const agenda = [...focus.reduce((m, x) => { const k = dkey(x.date); if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (layout === 'LIST') {
    return (
      <>
        <div style={{ ...segWrap, width: 'fit-content', marginBottom: 14 }}>
          {[['CALENDAR', 'Calendar'], ['LIST', 'List']].map(([k, l]) => <button key={k} onClick={() => setLayout(k)} style={seg(layout === k)}>{l}</button>)}
        </div>
        <OutflowPlannerList />
      </>
    );
  }

  return (
    <div style={{ background: "var(--hz-surface)", border: '1px solid var(--hz-border)', borderRadius: 14, boxShadow: "var(--hz-shadow-sm)", marginBottom: 18, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 20px', borderBottom: '1px solid var(--hz-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={goToday} style={{ ...btnGhost, padding: '7px 14px' }}>Today</button>
          <button onClick={() => step(-1)} title={`Previous ${unit}`} aria-label={`Previous ${unit}`} style={iconBtn}><ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} /></button>
          <button onClick={() => step(1)} title={`Next ${unit}`} aria-label={`Next ${unit}`} style={iconBtn}><ChevronRight size={18} /></button>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--hz-font-display)", fontSize: "var(--hz-text-xl)", fontWeight: 800, color: "var(--hz-ink)", lineHeight: 1.15 }}>{title}</div>
          <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)" }}>{pr.sub}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => jump(-1)} disabled={!hasBefore} style={{ ...btnGhost, padding: '5px 10px', fontSize: "var(--hz-text-xs)", opacity: hasBefore ? 1 : 0.45, cursor: hasBefore ? 'pointer' : 'default' }}>‹ Previous with outflow</button>
          <button onClick={() => jump(1)} disabled={!hasAfter} style={{ ...btnGhost, padding: '5px 10px', fontSize: "var(--hz-text-xs)", opacity: hasAfter ? 1 : 0.45, cursor: hasAfter ? 'pointer' : 'default' }}>Next with outflow ›</button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select value={project} onChange={e => { setProject(e.target.value); setPicked(null); }} aria-label="Project" style={{ ...inputS, width: 'auto', minWidth: 200, padding: '7px 10px' }}>
            <option value="">All projects</option>
            {projectNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div style={segWrap}>
            {PLAN_PERIODS.map(([k, l]) => <button key={k} onClick={() => { setMode(k); setPicked(null); }} style={seg(mode === k)}>{l.replace('ly', '').replace('Dai', 'Day').replace('Quarter', 'Quarter')}</button>)}
          </div>
          <div style={segWrap}>
            {[['CALENDAR', 'Calendar'], ['LIST', 'List']].map(([k, l]) => <button key={k} onClick={() => setLayout(k)} style={seg(layout === k)}>{l}</button>)}
          </div>
        </div>
      </div>

      {/* Calendar + side panel */}
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 760px', minWidth: 0, padding: 20, overflowX: 'auto' }}>
          {docs == null ? <div style={{ color: "var(--hz-muted)" }}>Loading…</div>
            : error ? <div style={{ color: "var(--hz-danger)" }}>{error}</div>
            : mode === 'WEEK' ? <WeekView />
            : mode === 'MONTH' ? <MonthView y={pr.start.getFullYear()} m={pr.start.getMonth()} />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: mode === 'QUARTER' ? 'repeat(3, minmax(250px, 1fr))' : 'repeat(4, minmax(230px, 1fr))', gap: 14 }}>
                {months.map(d => <MiniMonth key={dkey(d)} y={d.getFullYear()} m={d.getMonth()} />)}
              </div>
            )}
          {(mode === 'QUARTER' || mode === 'YEAR') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)" }}>
              Less {[0.2, 0.4, 0.6, 0.8].map(t => <span key={t} style={{ width: 14, height: 14, borderRadius: '50%', background: `rgba(30,58,95,${t})` }} />)} More outflow
              <span style={{ marginLeft: 12 }}>Click a month name to open it.</span>
            </div>
          )}
        </div>

        <aside style={{ flex: '0 1 380px', minWidth: 300, borderLeft: '1px solid var(--hz-border)', background: "var(--hz-bg)", display: 'flex', flexDirection: 'column', maxHeight: 820 }}>
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--hz-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-muted)" }}>{picked ? fmtDate(picked) : `Planned this ${unit}`}</div>
              {picked && <button onClick={() => setPicked(null)} style={{ border: 'none', background: 'none', color: "var(--hz-link)", fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: "var(--hz-text-sm)" }}>Whole {unit}</button>}
            </div>
            <div style={{ marginTop: 4 }}><Money v={focusTotal} strong color="var(--hz-primary)" size="var(--hz-text-2xl)" /></div>
            <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginTop: 2 }}>{focus.length} document{focus.length === 1 ? '' : 's'}{project ? ` · ${project}` : ''}</div>
            {byProj.length > 0 && (
              <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                {byProj.slice(0, 6).map(([name, v]) => (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: "var(--hz-text-sm)" }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: colorOf(name), flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      </span>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtShort(v)}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--hz-border)", marginTop: 4 }}>
                      <div style={{ width: `${Math.max(3, (v / byProj[0][1]) * 100)}%`, height: '100%', borderRadius: 3, background: colorOf(name) }} />
                    </div>
                  </div>
                ))}
                {byProj.length > 6 && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>+{byProj.length - 6} more projects</div>}
              </div>
            )}
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 14px 16px', flex: 1 }}>
            {agenda.length === 0 ? (
              <div style={{ padding: '24px 6px', color: "var(--hz-faint)", textAlign: 'center' }}>
                No planned outflow {picked ? 'on this day' : `this ${unit}`}.
                {!picked && (hasAfter || hasBefore) && <div style={{ marginTop: 8 }}>
                  <button onClick={() => jump(hasAfter ? 1 : -1)} style={{ ...btnGhost, fontSize: "var(--hz-text-xs)" }}>{hasAfter ? 'Go to next outflow' : 'Go to previous outflow'}</button>
                </div>}
              </div>
            ) : agenda.map(([k, items]) => (
              <div key={k} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-muted)", letterSpacing: '.04em', padding: '0 4px 6px' }}>
                  <span>{WEEKDAYS[(toDay(k).getDay() + 6) % 7].toUpperCase()} · {fmtDate(toDay(k)).toUpperCase()} · PAYMENT</span><span>{fmtShort(items.reduce((t, x) => t + x.amount, 0))}</span>
                </div>
                {items.map((x, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid var(--hz-border)', borderLeft: `4px solid ${colorOf(x.projectName)}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700 }}>{x.docNumber || x.baseDocNumber}</span>
                      <Money v={x.amount} strong />
                    </div>
                    <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)", marginTop: 2 }}>{x.vendor || '—'}</div>
                    <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 2 }}>Due {fmtDate(x.dueDate)}{x.src !== 'completion' ? ` (${x.src === 'required' ? 'required' : 'issue'} date)` : ' (completion)'}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <Pill>{x.pwjType || '—'}</Pill>
                      {x.boqNo && <Pill>BOQ {x.boqNo}</Pill>}
                      <Pill>{x.projectName || '—'}</Pill>
                      {x.isAdditionalPo && <Pill tone="warning">Split</Pill>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Transfer fund modal ───
function TransferModal({ xfer, surplus, onClose, onDone }) {
  const [fromProjectId, setFrom] = useState('');
  const [amount, setAmount] = useState(xfer.shortfall ? String(xfer.shortfall) : '');
  const [remarks, setRemarks] = useState(`To fund today's bank transfer for ${xfer.toName}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const options = surplus.filter(s => s.projectId !== xfer.toProjectId);
  const picked = options.find(s => String(s.projectId) === String(fromProjectId));
  // Debts the source must clear first. Money sent to its own lender is a repayment, so that debt isn't added on top.
  const repayFirst = (picked?.debts || []).filter(d => d.lenderId !== xfer.toProjectId);
  const owedToDest = (picked?.debts || []).find(d => d.lenderId === xfer.toProjectId);
  const repayTotal = repayFirst.reduce((s, d) => s + Number(d.outstanding), 0);
  const freeNow = picked ? Number(picked.free) + (owedToDest ? Number(owedToDest.outstanding) : 0) : 0;

  async function submit() {
    setError('');
    const amt = Number(amount);
    if (!fromProjectId) { setError('Pick the project to transfer from'); return; }
    if (!(amt > 0)) { setError('Enter an amount'); return; }
    if (picked && amt > freeNow) {
      setError(`Only ${fmt(freeNow)} free in ${picked.projectName}` + (repayTotal > 0 ? ` after repaying ${fmt(repayTotal)} it borrowed earlier` : ''));
      return;
    }
    setSaving(true);
    try {
      const r = await fundManagementApi.transfer({ fromProjectId: Number(fromProjectId), toProjectId: xfer.toProjectId, amount: amt, remarks });
      const d = r.data || {};
      const lines = (d.repaid || []).map(x => `↩ ${d.from} repaid ${fmt(x.outstanding)} to ${x.lenderName} (borrowed earlier)`);
      lines.push(`✅ ${d.from} → ${d.to}: ${fmt(d.transferred)} ${d.isRepayment ? 'repaid' : 'transferred'}`);
      onDone(lines.join('\n'));
    } catch (e) {
      setError(e.response?.data?.error || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 440, maxWidth: '94vw', padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,.28)' }}>
        <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)" }}>Transfer fund → {xfer.toName}</div>
        <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", margin: '3px 0 16px' }}>Shortfall {fmt(xfer.shortfall)}. Move fund from a surplus project.</div>

        <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', marginBottom: 5 }}>From project</label>
        <select style={inputS} value={fromProjectId} onChange={e => setFrom(e.target.value)}>
          <option value="">— Select surplus project —</option>
          {options.map(s => {
            const owesDest = (s.debts || []).find(d => d.lenderId === xfer.toProjectId);
            const free = Number(s.free) + (owesDest ? Number(owesDest.outstanding) : 0);
            return <option key={s.projectId} value={s.projectId}>{s.projectName} — {fmt(free)} free{Number(s.owed) > 0 ? ` (owes ${fmt(s.owed)})` : ''}</option>;
          })}
        </select>

        {repayTotal > 0 && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d', fontSize: "var(--hz-text-xs)", color: '#92400e', lineHeight: 1.5 }}>
            <b>⚠ {picked.projectName} has already borrowed fund.</b> It will repay that first, then send this transfer:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {repayFirst.map(d => <li key={d.lenderId}>Repay <b>{fmt(d.outstanding)}</b> to {d.lenderName}</li>)}
              <li>Then transfer <b>{fmt(Number(amount) || 0)}</b> to {xfer.toName}</li>
            </ul>
            <div style={{ marginTop: 4 }}>Total leaving {picked.projectName}: <b>{fmt(repayTotal + (Number(amount) || 0))}</b> · free after repayment: <b>{fmt(freeNow)}</b></div>
          </div>
        )}
        {owedToDest && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', fontSize: "var(--hz-text-xs)", color: '#166534' }}>
            {picked.projectName} owes {xfer.toName} {fmt(owedToDest.outstanding)} — this transfer counts as a repayment.
          </div>
        )}

        <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', margin: '14px 0 5px' }}>Amount</label>
        <input type="number" min="0" step="0.01" style={inputS} value={amount} onChange={e => setAmount(e.target.value)} />

        <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: 'block', margin: '14px 0 5px' }}>Remarks</label>
        <input style={inputS} value={remarks} onChange={e => setRemarks(e.target.value)} />

        {error && <div style={{ color: "var(--hz-danger)", fontSize: "var(--hz-text-xs)", marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-ink-2)", cursor: 'pointer' }}>Cancel</button>
          <button disabled={saving} onClick={submit} style={{ border: 'none', background: '#7c3aed', color: "var(--hz-on-dark)", borderRadius: 8, padding: '8px 16px', fontSize: "var(--hz-text-sm)", fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}
