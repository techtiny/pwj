import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronDown, Save } from 'lucide-react';
import { projectsApi, pwjDocsApi, expenseItemsApi } from './accountApi';
import api from './accountApi';

const CATEGORY_LABELS = {
  material:     { label: 'Material',      color: '#10b981', bg: '#d1fae5' },
  labour:       { label: 'Labour',        color: '#3b82f6', bg: '#dbeafe' },
  subcontract:  { label: 'Sub-Contract',  color: '#8b5cf6', bg: '#ede9fe' },
  consultants:  { label: 'Consultants',   color: '#f59e0b', bg: '#fef3c7' },
  miscellaneous:{ label: 'Miscellaneous', color: '#64748b', bg: '#f1f5f9' },
};

// Which PWJ doc types are shown in each tab's doc-picker dropdown
const CATEGORY_PWJ_TYPES = {
  material:     ['PO', 'JO'],
  labour:       ['WO', 'JO'],
  subcontract:  ['WO'],
  consultants:  ['WO'],
  miscellaneous:['JO'],
};

// Which tabs get auto-filled from PWJ docs (and which types)
const AUTO_FILL_TYPES = {
  material:    ['PO', 'JO'],
  subcontract: ['WO'],
};

// Allowed target categories per doc type (for "Move to" / "Save to" selectors)
const MOVE_OPTIONS = {
  WO: ['SUBCONTRACT', 'LABOUR', 'CONSULTANTS'],
  JO: ['MATERIAL', 'LABOUR', 'MISCELLANEOUS'],
};

const CAT_LABELS = {
  MATERIAL: 'Material', LABOUR: 'Labour',
  SUBCONTRACT: 'Sub-Contract', CONSULTANTS: 'Consultants', MISCELLANEOUS: 'Misc',
};

function getDocType(paymentAgainst) {
  if (!paymentAgainst) return null;
  const u = paymentAgainst.toUpperCase();
  if (u.startsWith('WO')) return 'WO';
  if (u.startsWith('JO')) return 'JO';
  if (u.startsWith('PO')) return 'PO';
  return null;
}

function defaultCatForDocType(pwjType) {
  return pwjType === 'WO' ? 'SUBCONTRACT' : 'MATERIAL';
}

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

function makeAutoRow(doc) {
  const dt = doc.pwjType;
  return {
    ...EMPTY_ROW,
    _key: `auto_${doc.docNumber}`,
    refNo: doc.docNumber || '',
    paymentAgainst: dt || '',
    _targetCategory: defaultCatForDocType(dt),
    description: doc.materialRequired || '',
    partyName: doc.vendor || '',
    pwjGross: String(doc.gross ?? 0),
    gstPercent: String(Math.round(doc.gstPct ?? 18)),
    pwjGstAmount: String(doc.gstAmount ?? 0),
    pwjTotalPayable: String(doc.totalPayable ?? 0),
    vendorGross: String(doc.gross ?? 0),
    vendorGstPercent: String(Math.round(doc.gstPct ?? 18)),
    vendorGstAmount: String(doc.gstAmount ?? 0),
    vendorTotalPayable: String(doc.totalPayable ?? 0),
  };
}

export default function ExpensePage({ category }) {
  const cfg    = CATEGORY_LABELS[category] || CATEGORY_LABELS.material;
  const apiCat = category.toUpperCase();

  const [projects, setProjects]               = useState([]);
  const [selectedProject, setSelected]        = useState(null);
  const [items, setItems]                     = useState([]);
  const [summary, setSummary]                 = useState(null);
  const [loading, setLoading]                 = useState(false);
  const [newRows, setNewRows]                 = useState([]);
  const [saving, setSaving]                   = useState({});
  const [dirty, setDirty]                     = useState({});
  const [editData, setEditData]               = useState({});
  const [pwjDocs, setPwjDocs]                 = useState([]);
  const [docSearch, setDocSearch]             = useState({});
  const [docOpen, setDocOpen]                 = useState({});
  const [loadedProjectId, setLoadedProjectId] = useState(null);
  const [pwjStatus, setPwjStatus]             = useState('loading');
  const [trackedRefs, setTrackedRefs]         = useState(new Set());
  const savingRef  = useRef({});
  const newRowsRef = useRef([]);

  // Keep newRowsRef in sync with state (to read in effects without triggering re-runs)
  useEffect(() => { newRowsRef.current = newRows; }, [newRows]);

  // Load projects on mount
  useEffect(() => {
    projectsApi.getAll().then(r => {
      const all = r.data || [];
      setProjects(all);
      if (all.length > 0) setSelected(all[0]);
    }).catch(() => {});
  }, []);

  // Fetch PWJ docs when project changes
  useEffect(() => {
    if (!selectedProject) return;
    setPwjStatus('loading');
    setPwjDocs([]);
    pwjDocsApi.getDocs(selectedProject.id)
      .then(r => {
        const docs = r.data || [];
        setPwjDocs(docs);
        setPwjStatus(docs.length > 0 ? 'ok' : 'empty');
      })
      .catch(() => setPwjStatus('error'));
  }, [selectedProject?.id]);

  // Fetch tracked refs (saved expense items' refNos across all categories) when project changes
  useEffect(() => {
    if (!selectedProject) return;
    setTrackedRefs(new Set());
    expenseItemsApi.getTrackedRefs(selectedProject.id)
      .then(r => setTrackedRefs(new Set(r.data || [])))
      .catch(() => {});
  }, [selectedProject?.id]);

  const refreshTrackedRefs = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const r = await expenseItemsApi.getTrackedRefs(selectedProject.id);
      setTrackedRefs(new Set(r.data || []));
    } catch {}
  }, [selectedProject]);

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
      setLoadedProjectId(selectedProject.id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedProject, apiCat]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Clear unsaved rows when switching expense tabs
  useEffect(() => { setNewRows([]); }, [category]);

  // Auto-populate rows with untracked PWJ docs for this tab
  useEffect(() => {
    const autoFillTypes = AUTO_FILL_TYPES[category];
    if (!autoFillTypes?.length || !selectedProject || !pwjDocs.length) return;
    if (loadedProjectId !== selectedProject.id) return;

    const existingRefs = new Set(newRowsRef.current.map(r => r.refNo).filter(Boolean));

    const docsToAdd = pwjDocs.filter(d =>
      autoFillTypes.includes(d.pwjType) &&
      !trackedRefs.has(d.docNumber) &&
      !existingRefs.has(d.docNumber)
    );

    if (!docsToAdd.length) return;
    setNewRows(prev => [...prev, ...docsToAdd.map(makeAutoRow)]);
  }, [category, selectedProject?.id, loadedProjectId, pwjDocs, trackedRefs]);

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
    await refreshTrackedRefs();
    loadItems();
  }

  async function moveExistingRow(id, newCategory) {
    try {
      await expenseItemsApi.moveCategory(id, newCategory);
      await refreshTrackedRefs();
      loadItems();
    } catch (e) {
      alert(e.response?.data?.error || 'Move failed');
    }
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
    const targetCat = (row._targetCategory || apiCat).toUpperCase();
    const payload = {
      projectId: selectedProject.id, category: targetCat,
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
      await refreshTrackedRefs();
      loadItems();
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed');
    }
  }

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

  const TH_BASE = { padding: '5px 6px', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap', border: '1px solid #93c5fd', textAlign: 'center', verticalAlign: 'middle' };
  const TH_GRP  = { ...TH_BASE, background: '#1e40af', color: '#fff', fontSize: 11 };
  const TH_SUB  = { ...TH_BASE, background: '#dbeafe', color: '#1e3a8a' };
  const TD = { padding: '3px 4px', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e8edf2', fontSize: 11, verticalAlign: 'middle' };

  const MOVE_SEL_BASE = { border: '1px solid', borderRadius: 3, fontSize: 9, padding: '1px 2px', maxWidth: 78, cursor: 'pointer' };

  function renderRow(item, isNew = false, rowKey) {
    const ed       = isNew ? {} : (editData[item.id] || {});
    const isDirty  = isNew ? true : dirty[item.id];
    const isSaving = isNew ? false : saving[item.id];
    const rowBg    = isNew ? '#f0fdf4' : (isDirty ? '#fffbeb' : '#fff');

    const gv  = (f) => isNew ? (item[f] ?? '') : getVal(item, f);
    const sv  = (f, val) => isNew ? setNewVal(rowKey, f, val) : setVal(item.id, f, val);

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
      sv('paymentAgainst', doc.pwjType    || '');
      sv('pwjGross',       String(doc.gross       ?? 0));
      sv('gstPercent',     String(Math.round(doc.gstPct ?? 18)));
      sv('pwjGstAmount',   String(doc.gstAmount   ?? 0));
      sv('pwjTotalPayable',String(doc.totalPayable ?? 0));
      sv('vendorGross',       String(doc.gross       ?? 0));
      sv('vendorGstPercent',  String(Math.round(doc.gstPct ?? 18)));
      sv('vendorGstAmount',   String(doc.gstAmount   ?? 0));
      sv('vendorTotalPayable',String(doc.totalPayable ?? 0));
      if (isNew) setNewVal(rowKey, '_targetCategory', defaultCatForDocType(doc.pwjType));
      setDocSearch(p => ({ ...p, [pickerKey]: doc.docNumber || '' }));
      setDocOpen(p => ({ ...p, [pickerKey]: false }));
    }

    const pwjGstPct = parseInt(gv('gstPercent')) || 0;
    const vnGstPct  = parseInt(gv('vendorGstPercent')) || 0;
    const bPwj    = balPwj(item, ed);
    const bActual = balActual(item, ed);

    const pwjGstAmt  = isNew ? n(item.pwjGstAmount)      : n(ed.pwjGstAmount     !== undefined ? ed.pwjGstAmount     : item.pwjGstAmount);
    const pwjTotal   = isNew ? n(item.pwjTotalPayable)   : n(ed.pwjTotalPayable  !== undefined ? ed.pwjTotalPayable  : item.pwjTotalPayable);
    const vnGstAmt   = isNew ? n(item.vendorGstAmount)   : n(ed.vendorGstAmount  !== undefined ? ed.vendorGstAmount  : item.vendorGstAmount);
    const vnTotal    = isNew ? n(item.vendorTotalPayable) : n(ed.vendorTotalPayable !== undefined ? ed.vendorTotalPayable : item.vendorTotalPayable);
    const newBPwj    = isNew ? n(item.pwjTotalPayable)   - n(item.paidAmount) : bPwj;
    const newBActual = isNew ? n(item.vendorTotalPayable) - n(item.paidAmount) : bActual;

    // Move / save-to controls
    const rowDocType  = getDocType(gv('paymentAgainst'));
    const moveOpts    = MOVE_OPTIONS[rowDocType] || [];
    const currentCat  = isNew ? (item._targetCategory || apiCat) : (item.category || apiCat);
    const movableOpts = isNew ? moveOpts : moveOpts.filter(c => c !== currentCat.toUpperCase());

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
        {/* PWJ GST Amt */}
        <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{fmt(pwjGstAmt)}</td>
        {/* PWJ Total Payable */}
        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, background: '#eff6ff' }}>{fmt(pwjTotal)}</td>
        {/* Vendor Gross */}
        <td style={{ ...TD, textAlign: 'right' }}>
          <CI r v={gv('vendorGross')} on={v => sv('vendorGross', v)} type="number" sx={{ color: '#dc2626' }} />
        </td>
        {/* Vendor GST% */}
        <td style={{ ...TD, textAlign: 'center', background: '#f0fdf4' }}>
          <CS v={vnGstPct + '%'} on={v => sv('vendorGstPercent', v.replace('%', ''))} opts={GST_OPTIONS.map(o => o + '%')} />
        </td>
        {/* Vendor GST Amt */}
        <td style={{ ...TD, textAlign: 'right', color: '#dc2626' }}>{fmt(vnGstAmt)}</td>
        {/* Vendor Total Payable */}
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
        <td style={{ ...TD, textAlign: 'center', minWidth: 90 }}>
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>

            {/* For new WO/JO rows: "Save to" selector */}
            {isNew && movableOpts.length > 0 && (
              <select
                value={item._targetCategory || apiCat.toUpperCase()}
                onChange={e => setNewVal(rowKey, '_targetCategory', e.target.value)}
                title="Save to tab"
                style={{ ...MOVE_SEL_BASE, borderColor: '#a7f3d0', background: '#f0fdf4', color: '#065f46' }}
              >
                {moveOpts.map(cat => (
                  <option key={cat} value={cat}>{CAT_LABELS[cat]}</option>
                ))}
              </select>
            )}

            {/* For saved WO/JO items: "Move to" selector */}
            {!isNew && movableOpts.length > 0 && (
              <select
                value=""
                onChange={e => { if (e.target.value) moveExistingRow(item.id, e.target.value); }}
                title="Move to another tab"
                style={{ ...MOVE_SEL_BASE, borderColor: '#c4b5fd', background: '#f5f3ff', color: '#6d28d9' }}
              >
                <option value="">Move→</option>
                {movableOpts.map(cat => (
                  <option key={cat} value={cat}>{CAT_LABELS[cat]}</option>
                ))}
              </select>
            )}

            {/* Save button for dirty saved rows */}
            {isDirty && !isNew && (
              <button onClick={() => saveRow(item)} disabled={isSaving}
                style={{ border: 'none', background: '#10b981', color: '#fff', borderRadius: 3, padding: '2px 5px', cursor: 'pointer', lineHeight: 1 }}>
                {isSaving ? '…' : <Save size={10} />}
              </button>
            )}

            {/* Save button for new rows */}
            {isNew && (
              <button onClick={() => saveNewRow(item)}
                style={{ border: 'none', background: '#10b981', color: '#fff', borderRadius: 3, padding: '2px 5px', cursor: 'pointer', lineHeight: 1 }}>
                <Save size={10} />
              </button>
            )}

            {/* Delete button */}
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

  // Status badge for auto-fill tabs
  const statusBadge = (() => {
    if (!AUTO_FILL_TYPES[category] || !selectedProject) return null;
    const types = AUTO_FILL_TYPES[category];
    if (pwjStatus === 'error')   return <span style={{ fontSize: 11, color: '#dc2626', fontStyle: 'italic' }}>⚠ PWJ tracker unreachable</span>;
    if (pwjStatus === 'loading') return <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Loading PWJ docs…</span>;
    const total     = pwjDocs.filter(d => types.includes(d.pwjType)).length;
    const untracked = pwjDocs.filter(d => types.includes(d.pwjType) && !trackedRefs.has(d.docNumber)).length;
    if (total === 0) return <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No docs in PWJ for this project</span>;
    return (
      <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
        {untracked > 0
          ? `${untracked} untracked of ${total} doc${total !== 1 ? 's' : ''} from PWJ`
          : `All ${total} doc${total !== 1 ? 's' : ''} tracked ✓`}
      </span>
    );
  })();

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
              onChange={e => {
                setSelected(projects.find(p => p.id === Number(e.target.value)));
                setNewRows([]);
              }}
              className="form-control"
              style={{ paddingRight: 28, appearance: 'none', minWidth: 200, fontSize: 12, fontWeight: 600, height: 32, padding: '0 28px 0 10px' }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {statusBadge}
          <button className="btn btn-primary btn-sm" onClick={addNewRow} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Plus size={13} /> Add Row
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ minWidth: 2000, borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            {/* Row 1: Project name + summary labels */}
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

            {/* Row 2: Financial year + summary values */}
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

            {/* Row 3: Column group headers */}
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
              <th rowSpan={2} style={{ ...TH_SUB, width: 90 }}></th>
            </tr>

            {/* Row 4: Sub-column headers */}
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

                {/* Total row */}
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
