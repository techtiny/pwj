import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Trash2, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
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
  const [dir, setDir] = useState('INFLOW'); // INFLOW | OUTFLOW
  const [projects, setProjects] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const isInflow = dir === 'INFLOW';
  const partyLabel = isInflow ? 'Source Type' : 'Paid To (Project)';
  const modeLabel = isInflow ? 'Mode of Receipt' : 'Mode of Payment';
  const modes = isInflow ? RECEIPT_MODES : PAYMENT_MODES;

  useEffect(() => {
    projectsApi.getAll().then(r => setProjects(r.data || [])).catch(() => setProjects([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fundManagementApi.list(dir)
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [dir]);

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

      {/* Inflow / Outflow toggle + Add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          {[['INFLOW', 'Inflow', <ArrowDownLeft size={14} key="i" />], ['OUTFLOW', 'Outflow', <ArrowUpRight size={14} key="o" />]].map(([k, l, ic]) => (
            <button key={k} onClick={() => { setDir(k); setShowForm(false); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: dir === k ? 700 : 500,
                padding: '7px 16px', borderRadius: 6,
                background: dir === k ? (k === 'INFLOW' ? '#16a34a' : '#dc2626') : 'transparent',
                color: dir === k ? '#fff' : '#475569' }}>
              {ic}{l}
            </button>
          ))}
        </div>
        <button onClick={openForm}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#fff', background: '#0369a1', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={15} /> Add {isInflow ? 'Inflow' : 'Outflow'}
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#475569' }}>
          {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · <b style={{ color: isInflow ? '#16a34a' : '#dc2626' }}>{fmt(totalShown)}</b> total
        </div>
      </div>

      {/* Add form */}
      {showForm && (
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
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>{partyLabel}</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={th}>{modeLabel}</th>
                <th style={th}>Remarks</th>
                <th style={{ ...th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={6}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td style={{ ...td, color: '#94a3b8' }} colSpan={6}>No {isInflow ? 'inflow' : 'outflow'} entries yet.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.movementDate)}</td>
                  <td style={td}>
                    {r.party}
                    {r.projectId && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: 100, padding: '1px 7px' }}>Project</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: isInflow ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>{fmt(r.amount)}</td>
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
                  <td style={td} colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
