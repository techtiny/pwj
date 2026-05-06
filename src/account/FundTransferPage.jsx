import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRightLeft, Plus, Trash2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import api from './accountApi';

function fmt(n) {
  if (!n && n !== 0) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const today = () => new Date().toISOString().slice(0, 10);

export default function FundTransferPage({ isCeo = false }) {
  const [b2bProjects, setB2bProjects] = useState([]);
  const [transfers, setTransfers]     = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [fromBalance, setFromBalance] = useState(null);

  const [form, setForm] = useState({
    fromProjectId: '', toProjectId: '', amount: '', transferDate: today(), remarks: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/fund-transfers/b2b-projects'),
      api.get('/fund-transfers'),
    ]).then(([projRes, txRes]) => {
      setB2bProjects(projRes.data);
      setTransfers(txRes.data);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.fromProjectId) { setFromBalance(null); return; }
    api.get(`/fund-transfers/balance/${form.fromProjectId}`)
      .then(r => setFromBalance(r.data.availableBalance))
      .catch(() => setFromBalance(null));
  }, [form.fromProjectId]);

  function openForm() {
    setForm({ fromProjectId: '', toProjectId: '', amount: '', transferDate: today(), remarks: '' });
    setFromBalance(null);
    setError('');
    setShowForm(true);
  }

  async function handleSubmit() {
    setError('');
    if (!form.fromProjectId || !form.toProjectId) { setError('Select both source and destination projects.'); return; }
    if (form.fromProjectId === form.toProjectId)  { setError('Source and destination cannot be the same project.'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid transfer amount.'); return; }

    setSaving(true);
    try {
      await api.post('/fund-transfers', {
        fromProjectId: Number(form.fromProjectId),
        toProjectId:   Number(form.toProjectId),
        amount:        Number(form.amount),
        transferDate:  form.transferDate || null,
        remarks:       form.remarks || null,
      });
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.response?.data?.error || 'Transfer failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Reverse (delete) this transfer?')) return;
    try {
      await api.delete(`/fund-transfers/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete transfer.');
    }
  }

  const toProjects = b2bProjects.filter(p => String(p.id) !== String(form.fromProjectId));
  const totalTransferred = transfers.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      {/* ── Banner ── */}
      <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ArrowRightLeft size={22} color="white" />
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>B2B Fund Transfer</div>
            <div style={{ color: '#c4b5fd', fontSize: 12, marginTop: 2 }}>
              Only B2B → B2B transfers are permitted · {b2bProjects.length} eligible projects
            </div>
          </div>
        </div>
        {!isCeo && (
          <button className="btn" onClick={openForm}
            style={{ background: 'white', color: '#6366f1', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> New Transfer
          </button>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {[
          { label: 'Eligible B2B Projects', value: b2bProjects.length },
          { label: 'Total Transfers Done', value: transfers.length },
          { label: 'Total Amount Transferred', value: fmt(totalTransferred) },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── B2B Project Balances ── */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>B2B Project Balances</div>
        {loading ? (
          <div className="loading" style={{ height: 80 }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {b2bProjects.map(p => {
              const outgoing  = transfers.filter(t => t.fromProjectId === p.id).reduce((s, t) => s + Number(t.amount), 0);
              const incoming  = transfers.filter(t => t.toProjectId   === p.id).reduce((s, t) => s + Number(t.amount), 0);
              const available = Number(p.availableBalance);
              const collected = Number(p.collectionReceived);
              const pct       = collected > 0 ? Math.min((available / collected) * 100, 100) : 0;
              const barColor  = pct < 10 ? '#ef4444' : pct < 30 ? '#f59e0b' : '#10b981';
              return (
                <div key={p.id} style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1, lineHeight: 1.3, marginRight: 8 }}>{p.name}</div>
                    <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#7c3aed', flexShrink: 0 }}>B2B</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                    <span>Collected: {fmt(collected)}</span>
                    <span style={{ color: barColor, fontWeight: 700 }}>Avail: {fmt(available)}</span>
                  </div>
                  <div style={{ background: '#e2e8f0', borderRadius: 100, height: 6 }}>
                    <div style={{ width: `${pct}%`, background: barColor, borderRadius: 100, height: '100%' }} />
                  </div>
                  {(outgoing > 0 || incoming > 0) && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
                      {outgoing > 0 && <span style={{ color: '#ef4444' }}>↑ Out: {fmt(outgoing)}</span>}
                      {incoming > 0 && <span style={{ color: '#10b981' }}>↓ In: {fmt(incoming)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Transfer History ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Transfer History</div>
        {transfers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
            No transfers yet. Click "New Transfer" to get started.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>From Project</th>
                  <th></th>
                  <th>To Project</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Date</th>
                  <th>Remarks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr key={t.id}>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ fontSize: 13 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 100, background: '#ede9fe', color: '#7c3aed', fontSize: 10, fontWeight: 700, marginRight: 6 }}>B2B</span>
                      <span style={{ fontWeight: 600 }}>{t.fromProjectName}</span>
                    </td>
                    <td><ArrowRightLeft size={14} color="#6366f1" /></td>
                    <td style={{ fontSize: 13 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 100, background: '#ede9fe', color: '#7c3aed', fontSize: 10, fontWeight: 700, marginRight: 6 }}>B2B</span>
                      <span style={{ fontWeight: 600 }}>{t.toProjectName}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#6366f1', fontSize: 14 }}>{fmt(t.amount)}</td>
                    <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(t.transferDate)}</td>
                    <td style={{ fontSize: 12, color: '#94a3b8', maxWidth: 160 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.remarks || '—'}</div>
                    </td>
                    <td>
                      <button onClick={() => handleDelete(t.id)} title="Reverse transfer"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>New Fund Transfer</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Only B2B ↔ B2B transfers are allowed</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>

            <div style={{ padding: 24 }}>
              {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">From Project (B2B) *</label>
                <select className="form-control" value={form.fromProjectId}
                  onChange={e => setForm(f => ({ ...f, fromProjectId: e.target.value, toProjectId: '' }))}>
                  <option value="">— Select source —</option>
                  {b2bProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {fromBalance !== null && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <CheckCircle2 size={13} color="#10b981" />
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Available: {fmt(fromBalance)}</span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">To Project (B2B) *</label>
                <select className="form-control" value={form.toProjectId}
                  onChange={e => setForm(f => ({ ...f, toProjectId: e.target.value }))}
                  disabled={!form.fromProjectId}>
                  <option value="">— Select destination —</option>
                  {toProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Amount (₹) *</label>
                <input type="number" min="1" className="form-control"
                  placeholder={fromBalance !== null ? `Max available: ${fmt(fromBalance)}` : 'Enter amount'}
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                {fromBalance !== null && form.amount && Number(form.amount) > Number(fromBalance) && (
                  <div style={{ marginTop: 5, fontSize: 12, color: '#ef4444', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <AlertTriangle size={12} /> Exceeds available balance of {fmt(fromBalance)}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Transfer Date</label>
                <input type="date" className="form-control" value={form.transferDate}
                  onChange={e => setForm(f => ({ ...f, transferDate: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Remarks</label>
                <input className="form-control" placeholder="Optional note"
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowRightLeft size={15} />
                  {saving ? 'Processing…' : 'Transfer Funds'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
