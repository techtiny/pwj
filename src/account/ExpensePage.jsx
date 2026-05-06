import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Save, ChevronDown } from 'lucide-react';
import { projectsApi, formatCurrency } from './accountApi';
import api from './accountApi';

const CATEGORY_LABELS = {
  material:     { label: 'Material',     color: '#10b981', bg: '#d1fae5' },
  labour:       { label: 'Labour',       color: '#3b82f6', bg: '#dbeafe' },
  subcontract:  { label: 'Sub-Contract', color: '#8b5cf6', bg: '#ede9fe' },
  consultants:  { label: 'Consultants',  color: '#f59e0b', bg: '#fef3c7' },
  miscellaneous:{ label: 'Miscellaneous',color: '#64748b', bg: '#f1f5f9' },
};

const EMPTY_FORM = {
  description: '', partyName: '', monthYear: '', refNo: '',
  pwjGross: '', gstPercent: '0', pwjGstAmount: '', pwjTotalPayable: '',
  vendorGross: '', vendorGstPercent: '0', vendorGstAmount: '', vendorTotalPayable: '',
  paymentDate: '', paymentAgainst: '', paidAmount: '0', paidTo: '', remarks: '',
};

function fmt(n) {
  if (!n && n !== 0) return '—';
  const num = Number(n);
  if (num === 0) return '₹0';
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ExpensePage({ category, isCeo = false }) {
  const cfg = CATEGORY_LABELS[category] || CATEGORY_LABELS.material;
  const apiCat = category.toUpperCase();

  const [projects, setProjects]       = useState([]);
  const [selectedProject, setSelected] = useState(null);
  const [items, setItems]             = useState([]);
  const [summary, setSummary]         = useState(null);
  const [loading, setLoading]         = useState(false);
  const [modal, setModal]             = useState(null); // null | 'add' | item
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);

  // Load active projects on mount
  useEffect(() => {
    projectsApi.getAll().then(r => {
      const active = r.data.filter(p => p.status === 'active');
      setProjects(active);
      if (active.length > 0) setSelected(active[0]);
    }).catch(() => {});
  }, []);

  // Load items when project or category changes
  const loadItems = useCallback(() => {
    if (!selectedProject) return;
    setLoading(true);
    Promise.all([
      api.get(`/expenses/${selectedProject.id}/${apiCat}`),
      api.get(`/expenses/${selectedProject.id}/${apiCat}/summary`),
    ]).then(([itemsRes, summaryRes]) => {
      setItems(itemsRes.data);
      setSummary(summaryRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedProject, apiCat]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Auto-compute GST amounts when gross / percent changes
  function handleFormChange(key, val) {
    setForm(f => {
      const updated = { ...f, [key]: val };
      // Auto-compute PWJ GST
      if (key === 'pwjGross' || key === 'gstPercent') {
        const gross = parseFloat(updated.pwjGross) || 0;
        const pct   = parseFloat(updated.gstPercent) || 0;
        const gst   = (gross * pct / 100);
        updated.pwjGstAmount    = gst.toFixed(2);
        updated.pwjTotalPayable = (gross + gst).toFixed(2);
        // Mirror to vendor if not independently set
        updated.vendorGross        = updated.pwjGross;
        updated.vendorGstPercent   = updated.gstPercent;
        updated.vendorGstAmount    = updated.pwjGstAmount;
        updated.vendorTotalPayable = updated.pwjTotalPayable;
      }
      return updated;
    });
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setModal('add');
  }

  function openEdit(item) {
    setForm({
      description: item.description || '', partyName: item.partyName || '',
      monthYear: item.monthYear || '', refNo: item.refNo || '',
      pwjGross: item.pwjGross || '0', gstPercent: item.gstPercent || '0',
      pwjGstAmount: item.pwjGstAmount || '0', pwjTotalPayable: item.pwjTotalPayable || '0',
      vendorGross: item.vendorGross || '0', vendorGstPercent: item.vendorGstPercent || '0',
      vendorGstAmount: item.vendorGstAmount || '0', vendorTotalPayable: item.vendorTotalPayable || '0',
      paymentDate: item.paymentDate || '', paymentAgainst: item.paymentAgainst || '',
      paidAmount: item.paidAmount || '0', paidTo: item.paidTo || '', remarks: item.remarks || '',
    });
    setModal(item);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      projectId: selectedProject.id,
      category: apiCat,
      ...Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
      ),
      pwjGross: parseFloat(form.pwjGross) || 0,
      gstPercent: parseFloat(form.gstPercent) || 0,
      pwjGstAmount: parseFloat(form.pwjGstAmount) || 0,
      pwjTotalPayable: parseFloat(form.pwjTotalPayable) || 0,
      vendorGross: parseFloat(form.vendorGross) || 0,
      vendorGstPercent: parseFloat(form.vendorGstPercent) || 0,
      vendorGstAmount: parseFloat(form.vendorGstAmount) || 0,
      vendorTotalPayable: parseFloat(form.vendorTotalPayable) || 0,
      paidAmount: parseFloat(form.paidAmount) || 0,
      paymentDate: form.paymentDate || null,
    };
    try {
      if (modal === 'add') {
        await api.post('/expenses', payload);
      } else {
        await api.put(`/expenses/${modal.id}`, payload);
      }
      setModal(null);
      loadItems();
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this expense entry?')) return;
    await api.delete(`/expenses/${id}`);
    loadItems();
  }

  const catColor = cfg.color;

  return (
    <div>
      {/* ── Project selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ padding: '4px 14px', borderRadius: 100, background: cfg.bg, color: catColor, fontWeight: 700, fontSize: 13 }}>
            {cfg.label}
          </div>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedProject?.id || ''}
              onChange={e => setSelected(projects.find(p => p.id === Number(e.target.value)))}
              className="form-control"
              style={{ paddingRight: 32, appearance: 'none', minWidth: 260, fontWeight: 600 }}
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
          </div>
        </div>
        {!isCeo && (
          <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Add Entry
          </button>
        )}
      </div>

      {/* ── Summary header ── */}
      {summary && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Total Gross (PWJ)',    val: summary.totalGrossAsPwj,    color: '#0f172a' },
              { label: 'Total Payable (PWJ)',  val: summary.totalPayableAsPwj,  color: '#6366f1' },
              { label: 'Total GST',            val: summary.totalGst,           color: '#f59e0b' },
              { label: 'Total Payable (Actual)',val: summary.totalPayableActual, color: '#6366f1' },
              { label: 'Total Paid',           val: summary.totalPaid,          color: '#10b981' },
              { label: 'Balance (as per PWJ)', val: summary.balanceAsPwj,       color: summary.balanceAsPwj > 0 ? '#ef4444' : '#10b981' },
              { label: 'Balance (as per Actual)',val: summary.balanceAsActual,  color: summary.balanceAsActual > 0 ? '#ef4444' : '#10b981' },
              { label: 'Total Gross (Actual)', val: summary.totalGrossActual,   color: '#0f172a' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color }}>{fmt(val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Line items table ── */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 1400 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Description</th>
                <th>Party Name</th>
                <th>Month</th>
                <th>Ref No</th>
                <th style={{ textAlign: 'right' }}>PWJ Gross</th>
                <th style={{ textAlign: 'right' }}>GST%</th>
                <th style={{ textAlign: 'right' }}>GST Amt</th>
                <th style={{ textAlign: 'right' }}>Total (PWJ)</th>
                <th style={{ textAlign: 'right' }}>Total (Vendor)</th>
                <th>Pay Date</th>
                <th>Against</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right', color: '#ef4444' }}>Bal (PWJ)</th>
                <th style={{ textAlign: 'right', color: '#ef4444' }}>Bal (Actual)</th>
                <th>Paid To</th>
                <th>Remarks</th>
                <th style={{ width: 72 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={18} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={18} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>No entries yet. Click "Add Entry" to start.</td></tr>
              ) : items.map((item, i) => (
                <tr key={item.id}>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontWeight: 500, fontSize: 13, maxWidth: 180 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description || '—'}</div>
                  </td>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{item.partyName || '—'}</td>
                  <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{item.monthYear || '—'}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{item.refNo || '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(item.pwjGross)}</td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>{item.gstPercent}%</td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(item.pwjGstAmount)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 12 }}>{fmt(item.pwjTotalPayable)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 12, color: '#6366f1' }}>{fmt(item.vendorTotalPayable)}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(item.paymentDate)}</td>
                  <td style={{ fontSize: 12 }}>
                    {item.paymentAgainst
                      ? <span style={{ padding: '2px 8px', borderRadius: 100, background: '#f1f5f9', fontSize: 11, fontWeight: 600 }}>{item.paymentAgainst}</span>
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#10b981', fontSize: 12 }}>{fmt(item.paidAmount)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: item.balanceAsPerPwj > 0 ? '#ef4444' : '#10b981', fontSize: 12 }}>
                    {fmt(item.balanceAsPerPwj)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: item.balanceAsPerActual > 0 ? '#ef4444' : '#10b981', fontSize: 12 }}>
                    {fmt(item.balanceAsPerActual)}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{item.paidTo || '—'}</td>
                  <td style={{ fontSize: 11, color: '#94a3b8', maxWidth: 120 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.remarks || ''}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEdit(item)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6366f1', padding: 4 }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(item.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              {items.length > 0 && summary && (
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={5} style={{ color: '#0f172a', paddingLeft: 16 }}>TOTAL</td>
                  <td style={{ textAlign: 'right' }}>{fmt(summary.totalGrossAsPwj)}</td>
                  <td /><td style={{ textAlign: 'right' }}>{fmt(summary.totalGst)}</td>
                  <td style={{ textAlign: 'right', color: '#6366f1' }}>{fmt(summary.totalPayableAsPwj)}</td>
                  <td style={{ textAlign: 'right', color: '#6366f1' }}>{fmt(summary.totalPayableActual)}</td>
                  <td colSpan={2} />
                  <td style={{ textAlign: 'right', color: '#10b981' }}>{fmt(summary.totalPaid)}</td>
                  <td style={{ textAlign: 'right', color: '#ef4444' }}>{fmt(summary.balanceAsPwj)}</td>
                  <td style={{ textAlign: 'right', color: '#ef4444' }}>{fmt(summary.balanceAsActual)}</td>
                  <td colSpan={3} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                {modal === 'add' ? 'Add' : 'Edit'} {cfg.label} Entry
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <Section label="Item Details">
                <div className="grid grid-2" style={{ gap: 12 }}>
                  <Field label="Description" span={2}><input className="form-control" value={form.description} onChange={e => handleFormChange('description', e.target.value)} /></Field>
                  <Field label="Party Name"><input className="form-control" value={form.partyName} onChange={e => handleFormChange('partyName', e.target.value)} /></Field>
                  <Field label="Month / Year (e.g. Mar-26)"><input className="form-control" value={form.monthYear} onChange={e => handleFormChange('monthYear', e.target.value)} /></Field>
                  <Field label="Ref No"><input className="form-control" value={form.refNo} onChange={e => handleFormChange('refNo', e.target.value)} /></Field>
                </div>
              </Section>

              <Section label="PWJ Details">
                <div className="grid grid-2" style={{ gap: 12 }}>
                  <Field label="Gross Amount (₹)"><input type="number" min="0" className="form-control" value={form.pwjGross} onChange={e => handleFormChange('pwjGross', e.target.value)} /></Field>
                  <Field label="GST %"><input type="number" min="0" max="28" className="form-control" value={form.gstPercent} onChange={e => handleFormChange('gstPercent', e.target.value)} /></Field>
                  <Field label="GST Amount (₹)"><input type="number" className="form-control" value={form.pwjGstAmount} onChange={e => handleFormChange('pwjGstAmount', e.target.value)} /></Field>
                  <Field label="Total Payable (₹)"><input type="number" className="form-control" value={form.pwjTotalPayable} onChange={e => handleFormChange('pwjTotalPayable', e.target.value)} /></Field>
                </div>
              </Section>

              <Section label="Vendor Invoice (if different from PWJ)">
                <div className="grid grid-2" style={{ gap: 12 }}>
                  <Field label="Vendor Gross (₹)"><input type="number" min="0" className="form-control" value={form.vendorGross} onChange={e => setForm(f => ({ ...f, vendorGross: e.target.value }))} /></Field>
                  <Field label="Vendor GST %"><input type="number" min="0" className="form-control" value={form.vendorGstPercent} onChange={e => setForm(f => ({ ...f, vendorGstPercent: e.target.value }))} /></Field>
                  <Field label="Vendor GST Amt (₹)"><input type="number" className="form-control" value={form.vendorGstAmount} onChange={e => setForm(f => ({ ...f, vendorGstAmount: e.target.value }))} /></Field>
                  <Field label="Vendor Total Payable (₹)"><input type="number" className="form-control" value={form.vendorTotalPayable} onChange={e => setForm(f => ({ ...f, vendorTotalPayable: e.target.value }))} /></Field>
                </div>
              </Section>

              <Section label="Payment">
                <div className="grid grid-2" style={{ gap: 12 }}>
                  <Field label="Payment Date"><input type="date" className="form-control" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} /></Field>
                  <Field label="Payment Against (PO / WO / JW)">
                    <select className="form-control" value={form.paymentAgainst} onChange={e => setForm(f => ({ ...f, paymentAgainst: e.target.value }))}>
                      <option value="">— None —</option>
                      <option value="PO">PO (Purchase Order)</option>
                      <option value="WO">WO (Work Order)</option>
                      <option value="JW">JW (Journal Voucher)</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="NEFT">NEFT</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </Field>
                  <Field label="Paid Amount (₹)"><input type="number" min="0" className="form-control" value={form.paidAmount} onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))} /></Field>
                  <Field label="Paid To"><input className="form-control" value={form.paidTo} onChange={e => setForm(f => ({ ...f, paidTo: e.target.value }))} /></Field>
                  <Field label="Remarks" span={2}><input className="form-control" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></Field>
                </div>
              </Section>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Save size={14} /> {saving ? 'Saving…' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <div style={span === 2 ? { gridColumn: '1 / -1' } : {}}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}
