import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Trash2, X, ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { fundManagementApi, projectsApi } from './accountApi';

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

const RECEIPT_MODES = ['Bank Transfer / NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Card', 'Adjustment'];
const PAYMENT_MODES = ['Bank Transfer / NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Card', 'Adjustment'];

const ADD_CUSTOM = '__ADD_CUSTOM__';

const inputS = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' };
const th = { padding: '11px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' };
const td = { padding: '11px 14px', fontSize: 13.5, borderBottom: '1px solid #eef2f7', color: '#0f172a' };

const EMPTY = { movementDate: today(), party: '', projectId: '', customParty: '', amount: '', mode: '', remarks: '' };

export default function FundManagementPage() {
  const [view, setView] = useState('INFLOW'); // INFLOW | OUTFLOW | FUNDING
  const [projects, setProjects] = useState([]);
  const [rows, setRows] = useState([]);
  const [balances, setBalances] = useState({}); // projectId -> { inflow, outflow, available }
  const [funding, setFunding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [xfer, setXfer] = useState(null); // { toProjectId, toName, shortfall }

  const isFunding = view === 'FUNDING';
  const dir = isFunding ? 'INFLOW' : view;
  const isInflow = view === 'INFLOW';
  const partyLabel = isInflow ? 'Source Type' : 'Paid To (Project)';
  const modeLabel = isInflow ? 'Mode of Receipt' : 'Mode of Payment';
  const modes = isInflow ? RECEIPT_MODES : PAYMENT_MODES;

  useEffect(() => {
    projectsApi.getAll().then(r => setProjects(r.data || [])).catch(() => setProjects([]));
  }, []);

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
    if (isFunding) { setLoading(true); loadFunding(); loadBalances(); setLoading(false); return; }
    setLoading(true);
    fundManagementApi.list(dir)
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    loadBalances();
  }, [dir, isFunding, loadBalances, loadFunding]);

  useEffect(() => { load(); }, [load]);

  const projectNames = useMemo(() => new Set(projects.map(p => p.name)), [projects]);

  // Inflow Source Type options: active projects + any custom values already used.
  const customSources = useMemo(() => {
    if (!isInflow) return [];
    return [...new Set(rows.map(r => r.party).filter(p => p && !projectNames.has(p)))];
  }, [rows, projectNames, isInflow]);

  const totalShown = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  function openForm() {
    setForm({ ...EMPTY, movementDate: today() });
    setError('');
    setShowForm(true);
  }

  async function submit() {
    setError('');
    const amount = Number(form.amount);
    if (!(amount > 0)) { setError('Enter an amount greater than zero'); return; }

    const payload = {
      direction: dir,
      movementDate: form.movementDate || today(),
      amount,
      mode: form.mode || null,
      remarks: form.remarks || null,
      projectId: null,
      party: '',
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
      await fundManagementApi.create(payload);
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
      await fundManagementApi.delete(id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not delete');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Hero */}
      <div className="card" style={{ padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid #0ea5e9' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏦</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Happizo Fund Management</div>
          <div style={{ fontSize: 13.5, color: '#64748b', marginTop: 2 }}>Record every rupee that comes in (Inflow) and goes out (Outflow).</div>
        </div>
      </div>

      {/* View toggle + Add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          {[['INFLOW', 'Inflow', <ArrowDownLeft size={14} key="i" />], ['OUTFLOW', 'Outflow', <ArrowUpRight size={14} key="o" />], ['FUNDING', 'Payment Funding', <Scale size={14} key="f" />]].map(([k, l, ic]) => (
            <button key={k} onClick={() => { setView(k); setShowForm(false); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: view === k ? 700 : 500,
                padding: '7px 16px', borderRadius: 6,
                background: view === k ? (k === 'INFLOW' ? '#16a34a' : k === 'OUTFLOW' ? '#dc2626' : '#7c3aed') : 'transparent',
                color: view === k ? '#fff' : '#475569' }}>
              {ic}{l}
            </button>
          ))}
        </div>
        {!isFunding && (
          <button onClick={openForm}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#fff', background: '#0369a1', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={15} /> Add {isInflow ? 'Inflow' : 'Outflow'}
          </button>
        )}
        {!isFunding && (
          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#475569' }}>
            {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · <b style={{ color: isInflow ? '#16a34a' : '#dc2626' }}>{fmt(totalShown)}</b> total
          </div>
        )}
      </div>

      {isFunding && (
        <FundingPanel funding={funding} onTransfer={(to) => setXfer(to)} onReload={load} />
      )}

      {/* Add form */}
      {!isFunding && showForm && (
        <div className="card" style={{ padding: 18, marginBottom: 16, border: '1.5px solid #bae6fd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>New {isInflow ? 'Inflow' : 'Outflow'} entry</div>
            <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Date</label>
              <input type="date" style={inputS} value={form.movementDate} onChange={e => setForm(f => ({ ...f, movementDate: e.target.value }))} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>{partyLabel}</label>
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
                <div style={{ fontSize: 12, marginTop: 6, color: (balances[form.projectId]?.available ?? 0) >= 0 ? '#0f766e' : '#dc2626' }}>
                  Available: <b>{fmt(balances[form.projectId]?.available ?? 0)}</b>
                  <span style={{ color: '#94a3b8', fontWeight: 500 }}>
                    {'  '}(in {fmt(balances[form.projectId]?.inflow ?? 0)} · out {fmt(balances[form.projectId]?.outflow ?? 0)})
                  </span>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Amount</label>
              <input type="number" min="0" step="0.01" style={inputS} placeholder="0.00"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>{modeLabel}</label>
              <input style={inputS} list="fund-mode-list" placeholder="Select or type"
                value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))} />
              <datalist id="fund-mode-list">{modes.map(m => <option key={m} value={m} />)}</datalist>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Remarks</label>
              <input style={inputS} placeholder="Optional note"
                value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={() => setShowForm(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button disabled={saving} onClick={submit} style={{ border: 'none', background: '#0369a1', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Add entry'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {!isFunding && (
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>{partyLabel}</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                {!isInflow && <th style={{ ...th, textAlign: 'right' }} title="Inflow received for this project − Outflow paid to it">Available</th>}
                <th style={th}>{modeLabel}</th>
                <th style={th}>Remarks</th>
                <th style={{ ...th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={isInflow ? 6 : 7}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={isInflow ? 6 : 7}>No {isInflow ? 'inflow' : 'outflow'} entries yet.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.movementDate)}</td>
                  <td style={td}>
                    {r.party}
                    {r.projectId && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: 100, padding: '1px 7px' }}>Project</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: isInflow ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>{fmt(r.amount)}</td>
                  {!isInflow && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700,
                      color: r.projectId == null ? '#94a3b8' : (balances[r.projectId]?.available ?? 0) >= 0 ? '#0f766e' : '#dc2626' }}>
                      {r.projectId == null ? '—' : fmt(balances[r.projectId]?.available ?? 0)}
                    </td>
                  )}
                  <td style={td}>{r.mode || '—'}</td>
                  <td style={{ ...td, color: '#475569', maxWidth: 280, whiteSpace: 'pre-wrap' }}>{r.remarks || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button disabled={busyId === r.id} onClick={() => del(r.id)}
                      title="Delete" style={{ border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: 7, padding: '5px 8px', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <td style={td} colSpan={2}>Total</td>
                  <td style={{ ...td, textAlign: 'right', color: isInflow ? '#16a34a' : '#dc2626' }}>{fmt(totalShown)}</td>
                  <td style={td} colSpan={isInflow ? 3 : 4}></td>
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
          onDone={() => { setXfer(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Payment Funding panel ───
function FundingPanel({ funding, onTransfer }) {
  if (!funding) return <div className="card" style={{ padding: 24, color: '#64748b' }}>Loading…</div>;
  const { projects = [], surplus = [], allFunded, totalShortfall, fundingInUse, date } = funding;

  return (
    <>
      <div className="card" style={{ padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12,
        background: !fundingInUse ? '#f8fafc' : allFunded ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${!fundingInUse ? '#e2e8f0' : allFunded ? '#86efac' : '#fecaca'}` }}>
        <div style={{ fontSize: 22 }}>{!fundingInUse ? '💤' : allFunded ? '✅' : '⚠️'}</div>
        <div>
          <div style={{ fontWeight: 800, color: !fundingInUse ? '#475569' : allFunded ? '#15803d' : '#b91c1c' }}>
            {!fundingInUse ? 'No fund movements recorded yet' :
              allFunded ? "Every project is funded — today's bank transfer file is eligible"
                : `Shortfall of ${fmt(totalShortfall)} — settle the transfers below to make the bank file eligible`}
          </div>
          <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
            Today's bank transfer demand vs available fund · {fmtDate(date)}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #eef2f7' }}>Projects in today's bank transfer</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Project</th>
              <th style={{ ...th, textAlign: 'right' }}>Available Fund</th>
              <th style={{ ...th, textAlign: 'right' }}>Today's Demand</th>
              <th style={{ ...th, textAlign: 'right' }}>Shortfall</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr></thead>
            <tbody>
              {projects.length === 0 ? (
                <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={6}>Nothing approved for bank transfer today.</td></tr>
              ) : projects.map(p => (
                <tr key={p.projectId} style={{ background: p.funded ? '#fff' : '#fef2f2' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.projectName}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmt(p.available)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(p.demand)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: p.shortfall > 0 ? '#b91c1c' : '#94a3b8' }}>{p.shortfall > 0 ? fmt(p.shortfall) : '—'}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 100,
                      background: p.funded ? '#dcfce7' : '#fee2e2', color: p.funded ? '#15803d' : '#b91c1c' }}>
                      {p.funded ? 'Funded' : 'Underfunded'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {!p.funded && (
                      <button onClick={() => onTransfer({ toProjectId: p.projectId, toName: p.projectName, shortfall: p.shortfall })}
                        style={{ border: 'none', background: '#7c3aed', color: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Transfer fund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #eef2f7' }}>Available fund in other projects</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Project</th>
              <th style={{ ...th, textAlign: 'right' }}>Available Fund</th>
              <th style={{ ...th, textAlign: 'right' }}>Free to Transfer</th>
            </tr></thead>
            <tbody>
              {surplus.length === 0 ? (
                <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={3}>No project currently has surplus fund.</td></tr>
              ) : surplus.map(s => (
                <tr key={s.projectId}>
                  <td style={{ ...td, fontWeight: 600 }}>{s.projectName}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmt(s.available)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#15803d' }}>{fmt(s.free)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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

  async function submit() {
    setError('');
    const amt = Number(amount);
    if (!fromProjectId) { setError('Pick the project to transfer from'); return; }
    if (!(amt > 0)) { setError('Enter an amount'); return; }
    if (picked && amt > Number(picked.free)) { setError(`Only ${fmt(picked.free)} free in ${picked.projectName}`); return; }
    setSaving(true);
    try {
      await fundManagementApi.transfer({ fromProjectId: Number(fromProjectId), toProjectId: xfer.toProjectId, amount: amt, remarks });
      onDone();
    } catch (e) {
      setError(e.response?.data?.error || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 440, maxWidth: '94vw', padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,.28)' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Transfer fund → {xfer.toName}</div>
        <div style={{ fontSize: 13, color: '#64748b', margin: '3px 0 16px' }}>Shortfall {fmt(xfer.shortfall)}. Move fund from a surplus project.</div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>From project</label>
        <select style={inputS} value={fromProjectId} onChange={e => setFrom(e.target.value)}>
          <option value="">— Select surplus project —</option>
          {options.map(s => <option key={s.projectId} value={s.projectId}>{s.projectName} — {fmt(s.free)} free</option>)}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', margin: '14px 0 5px' }}>Amount</label>
        <input type="number" min="0" step="0.01" style={inputS} value={amount} onChange={e => setAmount(e.target.value)} />

        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', margin: '14px 0 5px' }}>Remarks</label>
        <input style={inputS} value={remarks} onChange={e => setRemarks(e.target.value)} />

        {error && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Cancel</button>
          <button disabled={saving} onClick={submit} style={{ border: 'none', background: '#7c3aed', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}
