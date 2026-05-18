import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronDown, Save } from 'lucide-react';
import { projectsApi, pwjDocsApi } from './accountApi';
import api from './accountApi';

const CATEGORY_LABELS = {
  material:     { label: 'Material',      color: '#10b981', bg: '#d1fae5' },
  labour:       { label: 'Labour',        color: '#3b82f6', bg: '#dbeafe' },
  subcontract:  { label: 'Sub-Contract',  color: '#8b5cf6', bg: '#ede9fe' },
  consultants:  { label: 'Consultants',   color: '#f59e0b', bg: '#fef3c7' },
  miscellaneous:{ label: 'Miscellaneous', color: '#64748b', bg: '#f1f5f9' },
};

const CATEGORY_PWJ_TYPES = {
  material:     ['PO'],
  labour:       ['WO'],
  subcontract:  ['JO'],
  consultants:  ['PO', 'WO', 'JO'],
  miscellaneous:['PO', 'WO', 'JO'],
};

const GST_OPTIONS = ['0', '5', '12', '18', '28'];
const PAY_OPTIONS = ['', 'PO', 'WO', 'JO', 'JW', 'CHEQUE', 'NEFT', 'UPI'];
const NCOL = 21;

const EMPTY_ROW = {
  _new: true, description: '', partyName: '', monthYear: '', refNo: '',
  pwjGross: '', gstPercent: '18', pwjGstAmount: '0', pwjTotalPayable: '0',
  vendorGross: '', vendorGstPercent: '18', vendorGstAmount: '0', vendorTotalPayable: '0',
  paymentDate: '', paymentAgainst: '', paidAmount: '', paidTo: '', remarks: '',
};

function n(v) { return parseFloat(v) || 0; }

// ── Cell components defined OUTSIDE the parent to prevent remount on each render ──
const INP   = { border: 'none', outline: 'none', background: 'transparent', fontSize: 11, width: '100%', fontFamily: 'inherit', textAlign: 'right', padding: '1px 2px' };
const INP_L = { ...INP, textAlign: 'left' };
const SEL   = { border: 'none', outline: 'none', background: 'transparent', fontSize: 11, fontFamily: 'inherit', width: '100%', cursor: 'pointer', padding: '1px 0' };

function CI({ v, on, r, type = 'text', sx = {} }) {
  return <input type={type} value={v ?? ''} onChange={e => on(e.target.value)} style={{ ...(r ? INP : INP_L), ...sx }} />;
}
function CS({ v, on, opts }) {
  return (
    <select value={v} onChange={e => on(e.target.value)} style={SEL}>
      {opts.map(o => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  );
}
function fmt(v) {
  const num = n(v);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function computeGst(gross, pct) {
  const g = n(gross), p = n(pct);
  const gstAmt = +(g * p / 100).toFixed(2);
  return { gstAmt, total: +(g + gstAmt).toFixed(2) };
}

export default function ExpensePage({ category }) {
  const cfg    = CATEGORY_LABELS[category] || CATEGORY_LABELS.material;
  const apiCat = category.toUpperCase();

  const [projects, setProjects]        = useState([]);
  const [selectedProject, setSelected] = useState(null);
  const [items, setItems]              = useState([]);
  const [summary, setSummary]          = useState(null);
  const [loading, setLoading]          = useState(false);
  const [newRows, setNewRows]          = useState([]);
  const [saving, setSaving]            = useState({});
  const [dirty, setDirty]              = useState({});
  const [editData, setEditData]        = useState({});
  const [pwjDocs, setPwjDocs]          = useState([]);
  const [docSearch, setDocSearch]      = useState({});  // { rowKey: searchText }
  const [docOpen, setDocOpen]          = useState({});  // { rowKey: bool }
  const savingRef = useRef({});

  useEffect(() => {
    pwjDocsApi.getDocs().then(r => setPwjDocs(r.data?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    projectsApi.getAll().then(r => {
      const all = r.data || [];
      setProjects(all);
      if (all.length > 0) setSelected(all[0]);
    }).catch(() => {});
  }, []);

  const loadItems = useCallback(() => {
    if (!selectedProject) return;
    setLoading(true);
    Promise.all([
      api.get(`/expenses/${selectedProject.id}/${apiCat}`),
      api.get(`/expenses/${selectedProject.id}/${apiCat}/summary`),
    ]).then(([ir, sr]) => {
      setItems(ir.data || []);
      setSummary(sr.data);
      setEditData({});
      setDirty({});
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedProject, apiCat]);

  useEffect(() => { loadItems(); }, [loadItems]);

  function getVal(item, field) {
    return editData[item.id]?.[field] !== undefined
      ? editData[item.id][field]
      : (item[field] ?? '');
  }

  function setVal(id, field, val) {
    const cur = items.find(i => i.id === id);
    setEditData(prev => {
      const row = { ...(prev[id] || {}) };
      row[field] = val;
      if (field === 'pwjGross' || field === 'gstPercent') {
        const gross = field === 'pwjGross' ? val : (prev[id]?.pwjGross ?? String(cur?.pwjGross ?? ''));
        const pct   = field === 'gstPercent' ? val : (prev[id]?.gstPercent ?? String(cur?.gstPercent ?? '18'));
        const { gstAmt, total } = computeGst(gross, pct);
        row.pwjGstAmount    = String(gstAmt);
        row.pwjTotalPayable = String(total);
        row.vendorGross        = String(n(field === 'pwjGross' ? val : gross));
        row.vendorGstPercent   = String(n(field === 'gstPercent' ? val : pct));
        row.vendorGstAmount    = String(gstAmt);
        row.vendorTotalPayable = String(total);
      }
      if (field === 'vendorGross' || field === 'vendorGstPercent') {
        const g = field === 'vendorGross' ? val : (prev[id]?.vendorGross ?? String(cur?.vendorGross ?? ''));
        const p = field === 'vendorGstPercent' ? val : (prev[id]?.vendorGstPercent ?? String(cur?.vendorGstPercent ?? '18'));
        const { gstAmt, total } = computeGst(g, p);
        row.vendorGstAmount    = String(gstAmt);
        row.vendorTotalPayable = String(total);
      }
      return { ...prev, [id]: row };
    });
    setDirty(prev => ({ ...prev, [id]: true }));
  }

  async function saveRow(item) {
    const id = item.id;
    if (savingRef.current[id]) return;
    savingRef.current[id] = true;
    setSaving(p => ({ ...p, [id]: true }));
    const merged = { ...item, ...(editData[id] || {}) };
    const payload = {
      projectId: selectedProject.id, category: apiCat,
      description: merged.description || '', partyName: merged.partyName || '',
      monthYear: merged.monthYear || '', refNo: merged.refNo || '',
      pwjGross: n(merged.pwjGross), gstPercent: n(merged.gstPercent),
      pwjGstAmount: n(merged.pwjGstAmount), pwjTotalPayable: n(merged.pwjTotalPayable),
      vendorGross: n(merged.vendorGross), vendorGstPercent: n(merged.vendorGstPercent),
      vendorGstAmount: n(merged.vendorGstAmount), vendorTotalPayable: n(merged.vendorTotalPayable),
      paymentDate: merged.paymentDate || null, paymentAgainst: merged.paymentAgainst || null,
      paidAmount: n(merged.paidAmount), paidTo: merged.paidTo || '',
      remarks: merged.remarks || '',
    };
    try {
      await api.put(`/expenses/${id}`, payload);
      setDirty(p => { const c = { ...p }; delete c[id]; return c; });
      setEditData(p => { const c = { ...p }; delete c[id]; return c; });
      loadItems();
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed');
    } finally {
      savingRef.current[id] = false;
      setSaving(p => { const c = { ...p }; delete c[id]; return c; });
    }
  }

  async function deleteRow(id) {
    if (!window.confirm('Delete this entry?')) return;
    await api.delete(`/expenses/${id}`);
    loadItems();
  }

  function addNewRow() {
    setNewRows(r => [...r, { ...EMPTY_ROW, _key: Date.now() }]);
  }

  function setNewVal(key, field, val) {
    setNewRows(rows => rows.map(r => {
      if (r._key !== key) return r;
      const updated = { ...r, [field]: val };
      if (field === 'pwjGross' || field === 'gstPercent') {
        const { gstAmt, total } = computeGst(
          field === 'pwjGross' ? val : r.pwjGross,
          field === 'gstPercent' ? val : r.gstPercent,
        );
        updated.pwjGstAmount    = String(gstAmt);
        updated.pwjTotalPayable = String(total);
        updated.vendorGross        = updated.pwjGross;
        updated.vendorGstPercent   = updated.gstPercent;
        updated.vendorGstAmount    = String(gstAmt);
        updated.vendorTotalPayable = String(total);
      }
      if (field === 'vendorGross' || field === 'vendorGstPercent') {
        const { gstAmt, total } = computeGst(
          field === 'vendorGross' ? val : r.vendorGross,
          field === 'vendorGstPercent' ? val : r.vendorGstPercent,
        );
        updated.vendorGstAmount    = String(gstAmt);
        updated.vendorTotalPayable = String(total);
      }
      return updated;
    }));
  }

  async function saveNewRow(row) {
    const payload = {
      projectId: selectedProject.id, category: apiCat,
      description: row.description || '', partyName: row.partyName || '',
      monthYear: row.monthYear || '', refNo: row.refNo || '',
      pwjGross: n(row.pwjGross), gstPercent: n(row.gstPercent),
      pwjGstAmount: n(row.pwjGstAmount), pwjTotalPayable: n(row.pwjTotalPayable),
      vendorGross: n(row.vendorGross), vendorGstPercent: n(row.vendorGstPercent),
      vendorGstAmount: n(row.vendorGstAmount), vendorTotalPayable: n(row.vendorTotalPayable),
      paymentDate: row.paymentDate || null, paymentAgainst: row.paymentAgainst || null,
      paidAmount: n(row.paidAmount), paidTo: row.paidTo || '',
      remarks: row.remarks || '',
    };
    try {
      await api.post('/expenses', payload);
      setNewRows(r => r.filter(x => x._key !== row._key));
      loadItems();
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed');
    }
  }

  // Assign S.No only to rows that have a description
  const itemsWithSno = (() => {
    let sno = 1;
    return items.map(item => ({ ...item, _sno: item.description ? sno++ : null }));
  })();

  const balPwj = (item, ed) => {
    const payable = ed.pwjTotalPayable !== undefined ? n(ed.pwjTotalPayable) : n(item.pwjTotalPayable);
    const paid    = ed.paidAmount !== undefined      ? n(ed.paidAmount)      : n(item.paidAmount);
    return payable - paid;
  };
  const balActual = (item, ed) => {
    const payable = ed.vendorTotalPayable !== undefined ? n(ed.vendorTotalPayable) : n(item.vendorTotalPayable);
    const paid    = ed.paidAmount !== undefined         ? n(ed.paidAmount)         : n(item.paidAmount);
    return payable - paid;
  };

  // ── Shared styles ────────────────────────────────────────────────
  const TH_BASE = { padding: '5px 6px', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap', border: '1px solid #93c5fd', textAlign: 'center', verticalAlign: 'middle' };
  const TH_GRP  = { ...TH_BASE, background: '#1e40af', color: '#fff', fontSize: 11 };
  const TH_SUB  = { ...TH_BASE, background: '#dbeafe', color: '#1e3a8a' };

  const TD = { padding: '3px 4px', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e8edf2', fontSize: 11, verticalAlign: 'middle' };

  function renderRow(item, isNew = false, rowKey) {
    const ed       = isNew ? {} : (editData[item.id] || {});
    const isDirty  = isNew ? true : dirty[item.id];
    const isSaving = isNew ? false : saving[item.id];
    const rowBg    = isNew ? '#f0fdf4' : (isDirty ? '#fffbeb' : '#fff');

    const gv  = (f) => isNew ? (item[f] ?? '') : getVal(item, f);
    const sv  = (f, val) => isNew ? setNewVal(rowKey, f, val) : setVal(item.id, f, val);

    // Doc picker helpers
    const pickerKey  = isNew ? rowKey : `ex_${item.id}`;
    const searchText = docSearch[pickerKey] ?? gv('refNo') ?? '';
    const isOpen     = !!docOpen[pickerKey];
    const allowedTypes = CATEGORY_PWJ_TYPES[category] || ['PO', 'WO', 'JO'];
    const filteredDocs = pwjDocs.filter(d =>
      allowedTypes.includes(d.pwjType) &&
      (!searchText || d.docNumber?.toLowerCase().includes(searchText.toLowerCase()) ||
       d.materialRequired?.toLowerCase().includes(searchText.toLowerCase()) ||
       d.vendor?.toLowerCase().includes(searchText.toLowerCase()))
    );

    function applyDoc(doc) {
      sv('refNo',          doc.docNumber  || '');
      sv('description',    doc.materialRequired || '');
      sv('partyName',      doc.vendor     || '');
      sv('pwjGross',       String(doc.gross       ?? 0));
      sv('gstPercent',     String(Math.round(doc.gstPct ?? 18)));
      sv('pwjGstAmount',   String(doc.gstAmount   ?? 0));
      sv('pwjTotalPayable',String(doc.totalPayable ?? 0));
      sv('vendorGross',       String(doc.gross       ?? 0));
      sv('vendorGstPercent',  String(Math.round(doc.gstPct ?? 18)));
      sv('vendorGstAmount',   String(doc.gstAmount   ?? 0));
      sv('vendorTotalPayable',String(doc.totalPayable ?? 0));
      setDocSearch(p => ({ ...p, [pickerKey]: doc.docNumber || '' }));
      setDocOpen(p => ({ ...p, [pickerKey]: false }));
    }

    const pwjGstPct = parseInt(gv('gstPercent')) || 0;
    const vnGstPct  = parseInt(gv('vendorGstPercent')) || 0;
    const bPwj    = balPwj(item, ed);
    const bActual = balActual(item, ed);

    const pwjGstAmt     = isNew ? n(item.pwjGstAmount)     : n(ed.pwjGstAmount     !== undefined ? ed.pwjGstAmount     : item.pwjGstAmount);
    const pwjTotal      = isNew ? n(item.pwjTotalPayable)  : n(ed.pwjTotalPayable  !== undefined ? ed.pwjTotalPayable  : item.pwjTotalPayable);
    const vnGstAmt      = isNew ? n(item.vendorGstAmount)  : n(ed.vendorGstAmount  !== undefined ? ed.vendorGstAmount  : item.vendorGstAmount);
    const vnTotal       = isNew ? n(item.vendorTotalPayable): n(ed.vendorTotalPayable !== undefined ? ed.vendorTotalPayable : item.vendorTotalPayable);
    const newBPwj    = isNew ? n(item.pwjTotalPayable)   - n(item.paidAmount)   : bPwj;
    const newBActual = isNew ? n(item.vendorTotalPayable) - n(item.paidAmount)   : bActual;

    return (
      <tr key={isNew ? rowKey : item.id} style={{ background: rowBg }}>
        <td style={{ ...TD, textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 10 }}>
          {isNew ? '*' : (item._sno || '')}
        </td>
        <td style={TD}><CI v={gv('description')} on={v => sv('description', v)} /></td>
        <td style={TD}><CI v={gv('partyName')} on={v => sv('partyName', v)} /></td>
        <td style={TD}><CI v={gv('monthYear')} on={v => sv('monthYear', v)} /></td>
        {/* Ref No — searchable PWJ doc picker */}
        <td style={{ ...TD, position: 'relative' }}>
          <input
            value={searchText}
            onChange={e => {
              setDocSearch(p => ({ ...p, [pickerKey]: e.target.value }));
              sv('refNo', e.target.value);
              setDocOpen(p => ({ ...p, [pickerKey]: true }));
            }}
            onFocus={() => setDocOpen(p => ({ ...p, [pickerKey]: true }))}
            onBlur={() => setTimeout(() => setDocOpen(p => ({ ...p, [pickerKey]: false })), 200)}
            placeholder="Search doc…"
            style={{ ...INP_L, fontSize: 10 }}
          />
          {isOpen && filteredDocs.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 999,
              background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 340, maxHeight: 220, overflowY: 'auto',
            }}>
              {filteredDocs.map(doc => (
                <div key={doc.docNumber} onMouseDown={() => applyDoc(doc)}
                  style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 11 }}
                  onMouseEnter={e => e.currentTarget.style.background='#eff6ff'}
                  onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                  <div style={{ fontWeight: 700, color: '#1e40af' }}>{doc.docNumber}
                    <span style={{ marginLeft: 6, fontWeight: 400, color: '#64748b', fontSize: 10 }}>{doc.pwjType}</span>
                  </div>
                  <div style={{ color: '#374151', fontSize: 10 }}>{doc.materialRequired} · {doc.vendor}</div>
                  <div style={{ color: '#10b981', fontSize: 10, fontWeight: 600 }}>
                    Gross: ₹{Number(doc.gross).toLocaleString('en-IN')} · GST {doc.gstPct}% · Total: ₹{Number(doc.totalPayable).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </td>
        {/* PWJ Gross */}
        <td style={{ ...TD, textAlign: 'right' }}>
          <CI r v={gv('pwjGross')} on={v => sv('pwjGross', v)} type="number" />
        </td>
        {/* PWJ GST% */}
        <td style={{ ...TD, textAlign: 'center', background: '#f8faff' }}>
          <CS v={pwjGstPct + '%'} on={v => sv('gstPercent', v.replace('%', ''))} opts={GST_OPTIONS.map(o => o + '%')} />
        </td>
        {/* PWJ GST Amt (computed) */}
        <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{fmt(pwjGstAmt)}</td>
        {/* PWJ Total Payable (computed) */}
        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, background: '#eff6ff' }}>{fmt(pwjTotal)}</td>
        {/* Vendor Gross */}
        <td style={{ ...TD, textAlign: 'right' }}>
          <CI r v={gv('vendorGross')} on={v => sv('vendorGross', v)} type="number" sx={{ color: '#dc2626' }} />
        </td>
        {/* Vendor GST% */}
        <td style={{ ...TD, textAlign: 'center', background: '#f0fdf4' }}>
          <CS v={vnGstPct + '%'} on={v => sv('vendorGstPercent', v.replace('%', ''))} opts={GST_OPTIONS.map(o => o + '%')} />
        </td>
        {/* Vendor GST Amt (computed) */}
        <td style={{ ...TD, textAlign: 'right', color: '#dc2626' }}>{fmt(vnGstAmt)}</td>
        {/* Vendor Total Payable (computed) */}
        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#dc2626', background: '#fef2f2' }}>{fmt(vnTotal)}</td>
        {/* Payment date */}
        <td style={TD}><CI v={gv('paymentDate')} on={v => sv('paymentDate', v)} type="date" /></td>
        {/* Payment Against */}
        <td style={{ ...TD, textAlign: 'center' }}>
          <CS v={gv('paymentAgainst') || ''} on={v => sv('paymentAgainst', v)} opts={PAY_OPTIONS} />
        </td>
        {/* Paid Amount */}
        <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>
          <CI r v={gv('paidAmount')} on={v => sv('paidAmount', v)} type="number" sx={{ color: '#10b981', fontWeight: 600 }} />
        </td>
        {/* Balance as per PWJ */}
        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, background: '#faf5ff', color: newBPwj > 0.01 ? '#dc2626' : '#10b981' }}>
          {fmt(newBPwj)}
        </td>
        {/* Balance as per actual */}
        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, background: '#faf5ff', color: newBActual > 0.01 ? '#dc2626' : '#10b981' }}>
          {fmt(newBActual)}
        </td>
        {/* Paid to */}
        <td style={TD}><CI v={gv('paidTo')} on={v => sv('paidTo', v)} /></td>
        {/* Remarks */}
        <td style={TD}><CI v={gv('remarks')} on={v => sv('remarks', v)} /></td>
        {/* Actions */}
        <td style={{ ...TD, textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            {isDirty && !isNew && (
              <button onClick={() => saveRow(item)} disabled={isSaving}
                style={{ border: 'none', background: '#10b981', color: '#fff', borderRadius: 3, padding: '2px 5px', cursor: 'pointer', lineHeight: 1 }}>
                {isSaving ? '…' : <Save size={10} />}
              </button>
            )}
            {isNew && (
              <button onClick={() => saveNewRow(item)}
                style={{ border: 'none', background: '#10b981', color: '#fff', borderRadius: 3, padding: '2px 5px', cursor: 'pointer', lineHeight: 1 }}>
                <Save size={10} />
              </button>
            )}
            <button
              onClick={() => isNew
                ? setNewRows(r => r.filter(x => x._key !== rowKey))
                : deleteRow(item.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 1 }}>
              <Trash2 size={11} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div>
      {/* Project selector + Add Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ padding: '3px 12px', borderRadius: 100, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: 12 }}>
            {cfg.label}
          </span>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedProject?.id || ''}
              onChange={e => { setSelected(projects.find(p => p.id === Number(e.target.value))); setNewRows([]); }}
              className="form-control"
              style={{ paddingRight: 28, appearance: 'none', minWidth: 200, fontSize: 12, fontWeight: 600, height: 32, padding: '0 28px 0 10px' }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={addNewRow} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          <Plus size={13} /> Add Row
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ minWidth: 2000, borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            {/* ── Row 1: Project name  +  summary LABELS ── */}
            <tr style={{ background: '#eff6ff' }}>
              <td colSpan={4} style={{ ...TD, padding: '5px 10px', borderRight: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Project Name:</span>
                <span style={{ fontSize: 12, color: '#1e3a8a', fontWeight: 700, marginLeft: 6 }}>{selectedProject?.name || '—'}</span>
              </td>
              <td style={{ ...TD, borderRight: '1px solid #bfdbfe' }} />
              <td colSpan={2} style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total Gross as per PWJ</td>
              <td style={{ ...TD, borderRight: '1px solid #bfdbfe' }} />
              <td style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total payable as per PWJ</td>
              <td colSpan={2} style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total Gross as per actuals</td>
              <td style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total GST</td>
              <td style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total Payable as per invoice</td>
              <td colSpan={2} style={{ ...TD, borderRight: '1px solid #bfdbfe' }} />
              <td style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total paid</td>
              <td style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total balance due as per PWJ</td>
              <td style={{ ...TD, textAlign: 'center', fontSize: 9, fontWeight: 600, color: '#374151', borderRight: '1px solid #bfdbfe' }}>Total balance due as per actuals</td>
              <td colSpan={3} style={TD} />
            </tr>

            {/* ── Row 2: Financial year  +  summary VALUES ── */}
            <tr style={{ background: '#eff6ff' }}>
              <td colSpan={4} style={{ ...TD, padding: '4px 10px', borderRight: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Financial Year :</span>
                <span style={{ fontSize: 11, color: '#1e3a8a', fontWeight: 700, marginLeft: 6 }}>{selectedProject?.fy || ''}</span>
              </td>
              <td style={{ ...TD, borderRight: '1px solid #bfdbfe' }} />
              <td colSpan={2} style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.totalGrossAsPwj) : ''}</td>
              <td style={{ ...TD, borderRight: '1px solid #bfdbfe' }} />
              <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.totalPayableAsPwj) : ''}</td>
              <td colSpan={2} style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.totalGrossActual) : ''}</td>
              <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.totalGst) : ''}</td>
              <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.totalPayableActual) : ''}</td>
              <td colSpan={2} style={{ ...TD, borderRight: '1px solid #bfdbfe' }} />
              <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.totalPaid) : ''}</td>
              <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.balanceAsPwj) : ''}</td>
              <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#1e3a8a', borderRight: '1px solid #bfdbfe' }}>{summary ? fmt(summary.balanceAsActual) : ''}</td>
              <td colSpan={3} style={TD} />
            </tr>

            {/* ── Row 3: Column group headers (with rowSpan=2 for non-grouped cols) ── */}
            <tr>
              <th rowSpan={2} style={{ ...TH_SUB, width: 36 }}>S.No</th>
              <th rowSpan={2} style={{ ...TH_SUB, minWidth: 140, textAlign: 'left', padding: '5px 8px' }}>Description of Item</th>
              <th rowSpan={2} style={{ ...TH_SUB, minWidth: 120, textAlign: 'left', padding: '5px 8px' }}>Party Name</th>
              <th rowSpan={2} style={{ ...TH_SUB, width: 62 }}>Month - Year</th>
              <th colSpan={5} style={{ ...TH_GRP }}>PWJ Details</th>
              <th colSpan={4} style={{ ...TH_GRP, background: '#14532d' }}>Vendor Invoice detail</th>
              <th rowSpan={2} style={{ ...TH_SUB, width: 88 }}>Payment date</th>
              <th rowSpan={2} style={{ ...TH_SUB, width: 80 }}>Payment made Against</th>
              <th rowSpan={2} style={{ ...TH_SUB, width: 88, textAlign: 'right' }}>Paid Amount</th>
              <th colSpan={2} style={{ ...TH_GRP, background: '#4c1d95' }}>Balance to be paid</th>
              <th rowSpan={2} style={{ ...TH_SUB, minWidth: 100, textAlign: 'left', padding: '5px 8px' }}>Paid to</th>
              <th rowSpan={2} style={{ ...TH_SUB, minWidth: 100, textAlign: 'left', padding: '5px 8px' }}>Remarks, if any</th>
              <th rowSpan={2} style={{ ...TH_SUB, width: 44 }}></th>
            </tr>

            {/* ── Row 4: Sub-column headers for PWJ / Vendor / Balance groups ── */}
            <tr>
              <th style={{ ...TH_SUB, width: 78 }}>Ref no.</th>
              <th style={{ ...TH_SUB, width: 92, textAlign: 'right' }}>Gross Amount</th>
              <th style={{ ...TH_SUB, width: 52 }}>GST %</th>
              <th style={{ ...TH_SUB, width: 88, textAlign: 'right' }}>GST Amount</th>
              <th style={{ ...TH_SUB, width: 92, textAlign: 'right', background: '#bfdbfe' }}>Total Payable</th>
              <th style={{ ...TH_SUB, width: 92, textAlign: 'right', background: '#dcfce7' }}>Gross Amount</th>
              <th style={{ ...TH_SUB, width: 52, background: '#dcfce7' }}>GST %</th>
              <th style={{ ...TH_SUB, width: 88, textAlign: 'right', background: '#dcfce7' }}>GST Amount</th>
              <th style={{ ...TH_SUB, width: 92, textAlign: 'right', background: '#bbf7d0' }}>Total Payable</th>
              <th style={{ ...TH_SUB, width: 92, textAlign: 'right', background: '#ede9fe' }}>As per PWJ</th>
              <th style={{ ...TH_SUB, width: 92, textAlign: 'right', background: '#ede9fe' }}>As per actual</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={NCOL} style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>Loading…</td></tr>
            ) : (
              <>
                {itemsWithSno.map(item => renderRow(item, false, item.id))}

                {newRows.map(row => renderRow(row, true, row._key))}

                {/* TOTAL row */}
                {items.length > 0 && summary && (
                  <tr style={{ background: '#dbeafe', fontWeight: 700 }}>
                    <td colSpan={5} style={{ ...TD, color: '#1e3a8a', paddingLeft: 10, letterSpacing: 1 }}>TOTAL</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#1e3a8a' }}>{fmt(summary.totalGrossAsPwj)}</td>
                    <td style={TD} />
                    <td style={{ ...TD, textAlign: 'right' }}>{fmt(summary.totalGst)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#6366f1' }}>{fmt(summary.totalPayableAsPwj)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#dc2626' }}>{fmt(summary.totalGrossActual)}</td>
                    <td style={TD} />
                    <td style={{ ...TD, textAlign: 'right', color: '#dc2626' }}>{fmt(summary.totalGst)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#dc2626' }}>{fmt(summary.totalPayableActual)}</td>
                    <td colSpan={2} style={TD} />
                    <td style={{ ...TD, textAlign: 'right', color: '#10b981' }}>{fmt(summary.totalPaid)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#ef4444' }}>{fmt(summary.balanceAsPwj)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#ef4444' }}>{fmt(summary.balanceAsActual)}</td>
                    <td colSpan={3} style={TD} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
