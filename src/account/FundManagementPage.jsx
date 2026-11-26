import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, X, ArrowUpRight, CalendarClock, ChevronRight, ChevronDown, Landmark, CheckCircle2, AlertTriangle, ArrowLeftRight } from 'lucide-react';
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
  const [view, setView] = useState('INFLOW'); // INFLOW | OUTFLOW | PLANNED_INFLOW | PLANNED_OUTFLOW
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
  const isPlanned = view === 'PLANNED_INFLOW' || view === 'PLANNED_OUTFLOW';
  const dir = isPlanned ? (view === 'PLANNED_INFLOW' ? 'INFLOW' : 'OUTFLOW') : view;
  const isInflow = view === 'INFLOW' || view === 'PLANNED_INFLOW';
  const api = isPlanned ? plannedFundApi : fundManagementApi;
  const partyLabel = isPlanned && isInflow ? 'Source / Description' : (isInflow ? 'Source Type' : 'Paid To (Project)');
  const modeLabel = isInflow ? 'Mode of Receipt' : 'Mode of Payment';
  const modes = isInflow ? RECEIPT_MODES : PAYMENT_MODES;
  const viewLabel = view === 'INFLOW' ? 'Actual Inflow' : view === 'OUTFLOW' ? 'Actual Outflow'
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
          ['PLANNED_INFLOW', 'Cash Flow', !isFunding],
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
        {!isFunding && (
          <button onClick={openForm}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "var(--hz-on-dark)", background: '#0369a1', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={15} /> Add {viewLabel}
          </button>
        )}
        {(
          <div style={{ marginLeft: 'auto', fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)" }}>
            {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · Total <Money v={totalShown} strong color={isInflow ? "var(--hz-success)" : "var(--hz-danger)"} />
          </div>
        )}
      </div>

      {/* Add form */}
      {showForm && (
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
      {(!isFunding || txnOpen) && (
      <div className="card" style={isFunding
        ? { overflow: 'hidden', borderRadius: '0 0 12px 12px', borderTop: 'none', marginTop: 0, marginBottom: 18, padding: 0 }
        : { overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>{partyLabel}</th>
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
                    {r.party}
                    {r.projectId && <span style={{ marginLeft: 6, fontSize: "var(--hz-text-2xs)", fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: 100, padding: '1px 7px' }}>Project</span>}
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
