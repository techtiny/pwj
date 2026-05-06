import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, X, Bell, BellOff, Send } from 'lucide-react';
import api from './accountApi';

const STAGES = [
  { value: 'ADVANCE', label: 'Advance' },
  { value: 'STAGE_1', label: 'Stage 1' },
  { value: 'STAGE_2', label: 'Stage 2' },
  { value: 'STAGE_3', label: 'Stage 3' },
  { value: 'FINAL',   label: 'Final'   },
];

const INTERVALS = [3, 5, 7, 10, 14, 21, 30];

const fmt = n => {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = d => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  stage: 'ADVANCE', amount: '', collectedAmt: '0', collectedDate: '',
  dueDate: '', paymentDate: '', paymentIntervalDays: '',
};

const stageBadge = stage => {
  const colors = {
    ADVANCE: { bg: '#eff6ff', color: '#1d4ed8' },
    STAGE_1: { bg: '#f0fdf4', color: '#15803d' },
    STAGE_2: { bg: '#fefce8', color: '#a16207' },
    STAGE_3: { bg: '#fff7ed', color: '#c2410c' },
    FINAL:   { bg: '#fdf4ff', color: '#7e22ce' },
  };
  const s = STAGES.find(x => x.value === stage);
  const c = colors[stage] || { bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s ? s.label : stage}
    </span>
  );
};

export default function CollectionPage({ isCeo = false, preselectedProjectId = null, hideProjectSelector = false }) {
  const [projects, setProjects]       = useState([]);
  const [selectedProject, setSelected] = useState(preselectedProjectId ? String(preselectedProjectId) : '');
  const [collections, setCollections] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [triggering, setTriggering]   = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [editCollected, setEditCollected] = useState('');
  const [editCollectedDate, setEditCollectedDate] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editInterval, setEditInterval] = useState('');

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (preselectedProjectId) setSelected(String(preselectedProjectId));
  }, [preselectedProjectId]);

  const load = useCallback(() => {
    if (!selectedProject) { setCollections([]); return; }
    setLoading(true);
    api.get(`/collections/project/${selectedProject}`)
      .then(r => setCollections(r.data || []))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, [selectedProject]);

  useEffect(() => { load(); }, [load]);

  const project = projects.find(p => String(p.id) === String(selectedProject));
  const workOrderValue = project ? (Number(project.quoteGross) || 0) : 0;
  const totalCollected = collections.reduce((s, c) => s + Number(c.collectedAmt || 0), 0);
  const totalDue       = Math.max(0, workOrderValue - totalCollected);

  const usedStages      = new Set(collections.map(c => c.stage));
  const availableStages = STAGES.filter(s => !usedStages.has(s.value));

  async function triggerAlerts() {
    setTriggering(true);
    try {
      const res = await api.post('/collections/trigger-alerts');
      alert(res.data?.message || 'Alerts triggered successfully!');
    } catch {
      alert('Failed to trigger alerts. Please check backend logs.');
    } finally { setTriggering(false); }
  }

  async function handleAdd() {
    if (!selectedProject || !form.stage || !form.amount) return;
    setSaving(true);
    try {
      await api.post('/collections', {
        projectId: Number(selectedProject),
        stage: form.stage,
        amount: Number(form.amount),
        collectedAmt: Number(form.collectedAmt || 0),
        collectedDate: form.collectedDate || null,
        dueDate: form.dueDate || null,
        paymentDate: form.paymentDate || null,
        paymentIntervalDays: 3,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function saveEdit(row) {
    setSaving(true);
    try {
      await api.put(`/collections/${row.id}`, {
        stage: row.stage,
        amount: Number(row.amount),
        collectedAmt: Number(editCollected),
        collectedDate: editCollectedDate || null,
        dueDate: row.dueDate || null,
        paymentDate: editPaymentDate || null,
        paymentIntervalDays: 3,
      });
      setEditingId(null);
      load();
    } finally { setSaving(false); }
  }

  async function toggleAlert(row) {
    await api.put(`/collections/${row.id}`, {
      stage: row.stage,
      amount: Number(row.amount),
      collectedAmt: Number(row.collectedAmt),
      dueDate: row.dueDate || null,
      paymentDate: row.paymentDate || null,
      paymentIntervalDays: 3,
      alertActive: !row.alertActive,
    });
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this collection entry?')) return;
    await api.delete(`/collections/${id}`);
    load();
  }

  function openEdit(row) {
    setEditingId(row.id);
    setEditCollected(String(row.collectedAmt ?? 0));
    setEditCollectedDate(row.collectedDate || '');
    setEditPaymentDate(row.paymentDate || '');
    setEditInterval(row.paymentIntervalDays ? String(row.paymentIntervalDays) : '');
  }

  const inp = {
    border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 10px',
    fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', color: '#0f172a',
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Project Collections</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Track payment collections by stage</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={triggerAlerts} disabled={triggering}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: triggering ? '#e2e8f0' : '#fff', border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: triggering ? 'not-allowed' : 'pointer', color: triggering ? '#94a3b8' : '#0f172a', fontFamily: 'inherit' }}>
            <Send size={14} style={{ color: triggering ? '#94a3b8' : '#6366f1' }} />
            {triggering ? 'Sending…' : 'Trigger Alert Now'}
          </button>
          {!isCeo && availableStages.length > 0 && (
            <button className="btn btn-primary" onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, stage: availableStages[0]?.value || 'ADVANCE' }); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Add Collection
            </button>
          )}
        </div>
      </div>

      {/* ── Project selector ── */}
      {!hideProjectSelector && <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Select Project</div>
        <select value={selectedProject} onChange={e => setSelected(e.target.value)}
          style={{ ...inp, width: '100%', maxWidth: 440 }}>
          <option value="">— Choose a project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>}


      {/* ── KPI row ── */}
      {selectedProject && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          {[
            { label: 'Work Order Value', value: fmt(workOrderValue), color: '#6366f1' },
            { label: 'Total Collected',  value: fmt(totalCollected), color: '#10b981' },
            { label: 'Total Due',        value: fmt(totalDue),       color: totalDue > 0 ? '#ef4444' : '#10b981' },
            { label: 'Stages',           value: collections.length,  color: '#f59e0b' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add form ── */}
      {showForm && !isCeo && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'nowrap' }}>
            {[
              { label: 'Stage *', node: (
                <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} style={{ ...inp, width: 110 }}>
                  {availableStages.length > 0
                    ? availableStages.map(s => <option key={s.value} value={s.value}>{s.label}</option>)
                    : <option disabled>All stages added</option>}
                </select>
              )},
              { label: 'Amount (₹) *', node: (
                <input type="number" min="0" placeholder="0.00" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, width: 160 }} />
              )},
              { label: 'Collected (₹)', node: (
                <input type="number" min="0" placeholder="0.00" value={form.collectedAmt}
                  onChange={e => setForm(f => ({ ...f, collectedAmt: e.target.value }))} style={{ ...inp, width: 160 }} />
              )},
              { label: 'Collected Date', node: (
                <input type="date" value={form.collectedDate}
                  onChange={e => setForm(f => ({ ...f, collectedDate: e.target.value }))} style={{ ...inp, width: 140 }} />
              )},
              { label: 'Next Stage Payment', node: (
                <input type="date" value={form.paymentDate}
                  onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} style={{ ...inp, width: 130 }} />
              )},
            ].map(({ label, node }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>{label}</div>
                {node}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !form.amount}
                style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', height: 36 }}>
                {saving ? 'Saving…' : <><Plus size={13} /> Save</>}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}
                style={{ height: 36, whiteSpace: 'nowrap' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {selectedProject && (
        <div className="card">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : collections.length === 0 ? (
            <div className="loading" style={{ height: 160 }}>
              No collection entries yet{!isCeo && ' — click "Add Collection" to start'}.
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th style={{ textAlign: 'right', minWidth: 140 }}>Stage Amount</th>
                    <th style={{ textAlign: 'right' }}>Collected</th>
                    <th>Collected Date</th>
                    <th style={{ textAlign: 'right' }}>Stage Due Amount</th>
                    <th>Next Stage Payment</th>
                    <th>Alert</th>
                    {!isCeo && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {collections.map(row => {
                    const isEditing = editingId === row.id;
                    const dueAmt = Number(row.dueAmount || 0);
                    return (
                      <tr key={row.id}>
                        <td>{stageBadge(row.stage)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a', minWidth: 140 }}>{fmt(row.amount)}</td>

                        {/* Collected — editable */}
                        <td style={{ textAlign: 'right' }}>
                          {isEditing ? (
                            <input type="number" min="0" value={editCollected}
                              onChange={e => setEditCollected(e.target.value)}
                              style={{ ...inp, width: 110, textAlign: 'right', padding: '4px 8px' }} />
                          ) : (
                            <span style={{ fontWeight: 600, color: '#10b981', cursor: isCeo ? 'default' : 'pointer' }}
                              onClick={() => !isCeo && openEdit(row)}>
                              {fmt(row.collectedAmt)}
                              {!isCeo && <span style={{ fontSize: 10, color: '#cbd5e1', marginLeft: 4 }}>✏</span>}
                            </span>
                          )}
                        </td>

                        {/* Collected Date — editable */}
                        <td>
                          {isEditing ? (
                            <input type="date" value={editCollectedDate}
                              onChange={e => setEditCollectedDate(e.target.value)}
                              style={{ ...inp, padding: '4px 8px', fontSize: 12 }} />
                          ) : (
                            <span style={{ fontSize: 13, color: '#64748b', cursor: isCeo ? 'default' : 'pointer' }}
                              onClick={() => !isCeo && openEdit(row)}>
                              {row.collectedDate ? fmtDate(row.collectedDate) : <span style={{ color: '#cbd5e1' }}>—</span>}
                              {!isCeo && <span style={{ fontSize: 10, color: '#cbd5e1', marginLeft: 4 }}>✏</span>}
                            </span>
                          )}
                        </td>

                        {/* Due Amount */}
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: dueAmt > 0 ? '#ef4444' : '#10b981' }}>
                            {fmt(row.dueAmount)}
                          </span>
                        </td>

                        {/* Next Stage Payment — editable */}
                        <td>
                          {isEditing ? (
                            <input type="date" value={editPaymentDate}
                              onChange={e => setEditPaymentDate(e.target.value)}
                              style={{ ...inp, padding: '4px 8px', fontSize: 12 }} />
                          ) : (
                            <span style={{ fontSize: 13, color: '#64748b', cursor: isCeo ? 'default' : 'pointer' }}
                              onClick={() => !isCeo && openEdit(row)}>
                              {fmtDate(row.paymentDate)}
                              {!isCeo && <span style={{ fontSize: 10, color: '#cbd5e1', marginLeft: 4 }}>✏</span>}
                            </span>
                          )}
                        </td>

                        {/* Alert toggle */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Status indicator */}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                              color: row.alertActive ? '#16a34a' : '#94a3b8' }}>
                              {row.alertActive ? <Bell size={13} /> : <BellOff size={13} />}
                              {row.alertActive ? 'Active' : 'Off'}
                            </span>
                            {/* Toggle button */}
                            {!isCeo && (
                              <button onClick={() => toggleAlert(row)}
                                style={{ border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                  background: row.alertActive ? '#fee2e2' : '#dcfce7',
                                  color: row.alertActive ? '#dc2626' : '#16a34a' }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                {row.alertActive ? 'Disable' : 'Enable'}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        {!isCeo && (
                          <td>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {isEditing ? (
                                <>
                                  <button onClick={() => saveEdit(row)} disabled={saving}
                                    style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    {saving ? '…' : 'Save'}
                                  </button>
                                  <button onClick={() => setEditingId(null)}
                                    style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => handleDelete(row.id)}
                                  style={{ background: '#fff1f2', border: 'none', color: '#f43f5e', cursor: 'pointer', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontFamily: 'inherit' }}
                                  title="Delete">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>TOTAL</td>
                    <td style={{ textAlign: 'right', padding: '12px 16px', color: '#0f172a', minWidth: 140 }}>
                      {fmt(collections.reduce((s, c) => s + Number(c.amount || 0), 0))}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 16px', color: '#10b981' }}>
                      {fmt(collections.reduce((s, c) => s + Number(c.collectedAmt || 0), 0))}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 16px', color: '#ef4444' }}>
                      {fmt(collections.reduce((s, c) => s + Number(c.dueAmount || 0), 0))}
                    </td>
                    <td colSpan={isCeo ? 2 : 3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
