import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Send, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { expenseItemsApi, fundManagementApi } from './accountApi';

const PAYMENT_STATUS_CFG = {
  PART_PAYMENT_SENT: { label: 'Part Sent', color: '#b45309', bg: '#fef3c7' },
  FULL_PAYMENT_SENT: { label: 'Full Sent', color: '#15803d', bg: '#dcfce7' },
};

const APPROVAL_CFG = {
  PENDING:  { label: 'Pending',  color: '#64748b', bg: '#f1f5f9' },
  APPROVED: { label: 'Approved', color: '#15803d', bg: '#dcfce7' },
  REJECTED: { label: 'Rejected', color: '#b91c1c', bg: '#fee2e2' },
};
function ApprovalBadge({ status }) {
  const cfg = APPROVAL_CFG[status] || APPROVAL_CFG.PENDING;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 100, background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700 }}>
      {cfg.label}
    </span>
  );
}

const TIMELINE_OPTIONS = [
  { key: 'all',    label: 'All' },
  { key: 'day',    label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'custom', label: 'Custom' },
];

function fmt(v) {
  const num = Number(v) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// The amount that actually goes to the vendor: Approved Value (after TDS / GST deductions) when set,
// otherwise the raw amount sent.
const payableAmount = it => (it.approvedValue != null && it.approvedValue !== ''
  ? Number(it.approvedValue) : Number(it.sentAmount || 0));

const PAYMENT_AGAINST_LABEL = { PO: 'PO', WO: 'WO', JO: 'JO', VENDOR_INVOICE: 'Vendor Invoice' };
const fmtPaymentAgainst = v => (v ? String(v).split(',').map(s => PAYMENT_AGAINST_LABEL[s.trim()] || s.trim()).filter(Boolean).join(', ') : '—');

const STAGE_LABEL = { ADVANCE: 'Advance', STAGE_1: 'Stage 1', STAGE_2: 'Stage 2', STAGE_3: 'Stage 3', FINAL: 'Final' };
const fmtStage = v => (v ? (STAGE_LABEL[v] || v) : '—');

// Remarks carried into the dashboard cell and both exports: the free-text note (if any),
// plus the Project ID and the Ref No (PO/WO document number). " / " separated so it
// survives the pipe-delimited bank file.
const remarkText = it => {
  const parts = [];
  if (it.remarks && String(it.remarks).trim()) parts.push(String(it.remarks).trim());
  if (it.projectId != null && it.projectId !== '') parts.push(`Proj ${it.projectId}`);
  if (it.refNo && String(it.refNo).trim()) parts.push(String(it.refNo).trim());
  return parts.join(' / ');
};

export default function PaymentsPage({ isOH = false, isVP = false, isAdmin = false }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState({});  // id -> true while an approval call is in flight

  const [filterProject, setFilterProject] = useState('');
  const [filterParty, setFilterParty]     = useState('');
  const [timeline, setTimeline]           = useState('all');
  const [customFrom, setCustomFrom]       = useState(todayStr());
  const [customTo, setCustomTo]           = useState(todayStr());

  const [funding, setFunding] = useState(null); // { fundingInUse, allFunded, totalShortfall, projects: [...] }

  const load = useCallback(() => {
    setLoading(true);
    expenseItemsApi.getSentForPayment()
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    fundManagementApi.paymentFunding().then(r => setFunding(r.data || null)).catch(() => setFunding(null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const fundingBlocked = !!(funding && funding.fundingInUse && !funding.allFunded);

  async function handleOhDecision(item, status) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setOhApproval(item.id, status);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'OH approval failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleAdminDecision(item, status) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setAdminApproval(item.id, status);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Admin approval failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleVpDecision(item, status) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setVpApproval(item.id, status);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'VP approval failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleVpRevise(item) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.reviseAtVp(item.id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Sending back for revision failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(
      `Delete this Send for Payment entry?\n\n` +
      `${item.partyName || '—'} · ${fmt(item.sentAmount)}${item.refNo ? ` · ${item.refNo}` : ''}\n\n` +
      `This permanently removes the payment record. It does not touch the PWJ document.`
    )) return;
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.delete(item.id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not delete entry');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  const projectOptions = useMemo(() => {
    const map = new Map();
    items.forEach(it => { if (it.projectId != null) map.set(it.projectId, it.projectName); });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [items]);

  const filtered = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const partyQ = filterParty.trim().toLowerCase();

    return items.filter(it => {
      if (filterProject && String(it.projectId) !== String(filterProject)) return false;
      if (partyQ && !(it.partyName || '').toLowerCase().includes(partyQ)) return false;

      if (timeline !== 'all') {
        if (!it.sentAt) return false;
        const sentAt = new Date(it.sentAt);
        if (timeline === 'day') {
          if (sentAt.toDateString() !== now.toDateString()) return false;
        } else if (timeline === 'week') {
          if (sentAt < weekAgo || sentAt > now) return false;
        } else if (timeline === 'custom') {
          const from = customFrom ? new Date(customFrom + 'T00:00:00') : null;
          const to   = customTo   ? new Date(customTo   + 'T23:59:59') : null;
          if (from && sentAt < from) return false;
          if (to   && sentAt > to)   return false;
        }
      }
      return true;
    });
  }, [items, filterProject, filterParty, timeline, customFrom, customTo]);

  const totalSent = filtered.reduce((s, i) => s + Number(i.sentAmount || 0), 0);
  const partCount = filtered.filter(i => i.paymentStatus === 'PART_PAYMENT_SENT').length;
  const fullCount = filtered.filter(i => i.paymentStatus === 'FULL_PAYMENT_SENT').length;

  const selectStyle = { padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' };

  const HEADERS   = ['Transaction Type', 'Beneficiary Account Number', 'Instrument Amount', 'Beneficiary Name',
    'Beneficiary Code', 'Remarks', 'IFSC Code', 'Ben Email ID', 'Ben Mobile No'];
  const MANDATORY = ['Mandatory', 'Mandatory', 'Mandatory', 'Mandatory', 'Optional', 'Optional', 'Mandatory', 'Optional', 'Optional'];

  // Only VP-approved entries are eligible for the bank file.
  const approvedForExport = useMemo(
    () => filtered.filter(it => (it.vpApprovalStatus || 'PENDING') === 'APPROVED'),
    [filtered],
  );

  // Build a multi-tab .xlsx workbook — one worksheet per sent-date, bank bulk-transfer layout on each.
  // Beneficiary account / IFSC / email / mobile come from the matched Vendor record (see backend enrichBeneficiary).
  function exportExcel() {
    if (approvedForExport.length === 0) return;
    const groups = new Map(); // 'YYYY-MM-DD' -> entries
    [...approvedForExport]
      .sort((a, b) => new Date(a.sentAt || 0) - new Date(b.sentAt || 0))
      .forEach(it => {
        const key = it.sentAt ? new Date(it.sentAt).toLocaleDateString('en-CA') : 'undated';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      });

    const wb = XLSX.utils.book_new();
    for (const [date, items] of groups) {
      // Merge multiple entries to the same beneficiary into a single row — one combined
      // Instrument Amount per Beneficiary Name — then a grand-total row at the end.
      const byBeneficiary = new Map();
      items.forEach(it => {
        const key = (it.benAccountNumber && it.benAccountNumber.trim()) || `party:${it.partyName || ''}`;
        if (!byBeneficiary.has(key)) byBeneficiary.set(key, []);
        byBeneficiary.get(key).push(it);
      });
      const mergedRows = [...byBeneficiary.values()].map(group => {
        const first = group[0];
        const totalAmt = group.reduce((sum, it) => sum + payableAmount(it), 0);
        const combinedRemarks = group.map(remarkText).filter(Boolean).join(' | ');
        return [
          'N',
          first.benAccountNumber || '',
          Number(totalAmt.toFixed(2)),
          first.partyName || '',
          '',
          combinedRemarks,
          first.benIfscCode || '',
          first.benEmail || '',
          first.benMobile || '',
        ];
      });
      const aoa = [HEADERS, MANDATORY, ...mergedRows];
      const grandTotal = mergedRows.reduce((sum, row) => sum + row[2], 0);
      aoa.push(['', '', Number(grandTotal.toFixed(2)), 'GRAND TOTAL', '', '', '', '', '']);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, String(date).slice(0, 31));
    }
    XLSX.writeFile(wb, `send-for-payment-${todayStr()}.xlsx`);
  }

  // VP-approved entries sent for payment *today* — feeds the pipe-delimited bank payment file.
  const approvedToday = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return approvedForExport
      .filter(it => it.sentAt && new Date(it.sentAt).toLocaleDateString('en-CA') === today)
      .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
  }, [approvedForExport]);

  // Generate today's bank payment file — pipe-delimited .txt, header + one line per approved transfer.
  function exportBankPayment() {
    if (approvedToday.length === 0) return;
    if (fundingBlocked) {
      const short = (funding.projects || []).filter(p => !p.funded).map(p => `${p.projectName} (short ${fmt(p.shortfall)})`).join(', ');
      alert(`Bank transfer not eligible — some projects are underfunded:\n\n${short}\n\nSettle the transfers in Fund Management → Payment Funding first.`);
      return;
    }
    const clean = v => String(v ?? '').replace(/[|\r\n]+/g, ' ').trim();
    const header = HEADERS.join('|');

    // Merge multiple entries to the same beneficiary account into a single transfer line —
    // a bank instruction can only move one lump sum to one account. Falls back to Party
    // name when the account number is blank.
    const groups = new Map();
    approvedToday.forEach(it => {
      const key = (it.benAccountNumber && it.benAccountNumber.trim()) || `party:${it.partyName || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });

    const lines = [...groups.values()].map(group => {
      const first = group[0];
      const totalAmt = group.reduce((sum, it) => sum + payableAmount(it), 0);
      const combinedRemarks = group.map(remarkText).filter(Boolean).join(' | ');
      return [
        'N',                            // Transaction Type — NEFT by default
        clean(first.benAccountNumber),  // Beneficiary Account Number (from Vendor)
        String(totalAmt),               // Instrument Amount — summed Approved Value across the group
        clean(first.partyName),         // Beneficiary Name
        '',                             // Beneficiary Code
        clean(combinedRemarks),         // Remarks — every merged entry's note + Project ID + PO value
        clean(first.benIfscCode),       // IFSC Code (from Vendor)
        clean(first.benEmail),          // Ben Email ID (from Vendor)
        clean(first.benMobile),         // Ben Mobile No (from Vendor)
      ].join('|');
    });
    const content = [header, ...lines].join('\r\n') + '\r\n';

    const now = new Date();
    const p2 = n => String(n).padStart(2, '0');
    const secOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const fname = `payfile_${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}${secOfDay}.txt`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pay-dash">
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', borderRadius: 12, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Send size={24} color="white" />
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>Send for Payment Tracker</div>
          <div style={{ color: '#bfdbfe', fontSize: 13.5, marginTop: 2 }}>
            Every expense entry sent for payment, across all projects
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selectStyle}>
          <option value="">All Projects</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <input value={filterParty} onChange={e => setFilterParty(e.target.value)} placeholder="Search party…"
          style={{ ...selectStyle, minWidth: 160 }} />

        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          {TIMELINE_OPTIONS.map(t => {
            const active = timeline === t.key;
            return (
              <button key={t.key} onClick={() => setTimeline(t.key)}
                style={{
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 700 : 500,
                  padding: '6px 12px', borderRadius: 6,
                  background: active ? '#2563eb' : 'transparent',
                  color: active ? '#fff' : '#475569',
                }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {timeline === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={selectStyle} />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={selectStyle} />
          </div>
        )}

        {(filterProject || filterParty || timeline !== 'all') && (
          <button onClick={() => { setFilterProject(''); setFilterParty(''); setTimeline('all'); }}
            style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
            Clear filters
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Entries Sent',    value: filtered.length },
          { label: 'Part / Full',           value: `${partCount} / ${fullCount}` },
          { label: 'Total Amount Sent',     value: fmt(totalSent) },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: 20 }}>
            <div className="pay-kpi-label" style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</div>
            <div className="pay-kpi-value" style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {fundingBlocked && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 13, color: '#7f1d1d' }}>
            <b>Bank transfer not eligible — shortfall {fmt(funding.totalShortfall)}.</b>{' '}
            {(funding.projects || []).filter(p => !p.funded).map(p => `${p.projectName} (short ${fmt(p.shortfall)})`).join(', ')}.
            {' '}Move fund in <b>Fund Management → Payment Funding</b>, then generate the bank file.
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div className="pay-section-title" style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Payment History</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportBankPayment} disabled={approvedToday.length === 0 || fundingBlocked}
              title={approvedToday.length === 0
                ? 'No VP-approved entries sent for payment today'
                : fundingBlocked
                ? `Underfunded — settle transfers in Fund Management → Payment Funding (shortfall ${fmt(funding.totalShortfall)})`
                : `Generate today's bank payment file (${approvedToday.length} ${approvedToday.length === 1 ? 'transfer' : 'transfers'})`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #1d4ed8', borderRadius: 8,
                padding: '7px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                background: (approvedToday.length === 0 || fundingBlocked) ? '#f1f5f9' : '#2563eb',
                color: (approvedToday.length === 0 || fundingBlocked) ? '#94a3b8' : '#fff',
                borderColor: (approvedToday.length === 0 || fundingBlocked) ? '#cbd5e1' : '#1d4ed8',
                cursor: (approvedToday.length === 0 || fundingBlocked) ? 'not-allowed' : 'pointer',
              }}>
              <Send size={14} /> Bank Payment{approvedToday.length > 0 ? ` (${approvedToday.length})` : ''}
            </button>
            <button onClick={exportExcel} disabled={approvedForExport.length === 0}
              title={approvedForExport.length === 0
                ? 'No VP-approved entries to export'
                : `Export ${approvedForExport.length} VP-approved ${approvedForExport.length === 1 ? 'entry' : 'entries'}, one tab per date`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #cbd5e1', borderRadius: 8,
                padding: '7px 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                background: approvedForExport.length === 0 ? '#f1f5f9' : '#fff',
                color: approvedForExport.length === 0 ? '#94a3b8' : '#0f172a',
                cursor: approvedForExport.length === 0 ? 'not-allowed' : 'pointer',
              }}>
              <Download size={14} /> Export Excel{approvedForExport.length > 0 ? ` (${approvedForExport.length})` : ''}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="loading" style={{ height: 80 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
            {items.length === 0
              ? 'Nothing sent for payment yet. Mark entries eligible in the Expenses tab, then use "Send for Payment".'
              : 'No entries match the current filters.'}
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project</th>
                  <th>Party</th>
                  <th>Ref No</th>
                  <th>Stage</th>
                  <th>Payment Against</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount Sent</th>
                  <th style={{ textAlign: 'right' }}>Due Amount</th>
                  <th>Sent At</th>
                  <th>Remarks</th>
                  <th title="TDS rate applied on Amount Sent — set on the TDS tab">TDS %</th>
                  <th style={{ textAlign: 'right' }} title="Amount Sent × TDS %">TDS Amt</th>
                  <th style={{ textAlign: 'right' }} title="Manual deduction — set on the TDS tab">Deduction</th>
                  <th style={{ textAlign: 'right' }} title="Amount Sent − TDS Amt − GST Amt − Deduction">Approved Value</th>
                  <th>OH Approval</th>
                  <th>Admin Approval</th>
                  <th>VP Approval</th>
                  {(isAdmin || isVP) && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => {
                  const status = PAYMENT_STATUS_CFG[it.paymentStatus] || PAYMENT_STATUS_CFG.PART_PAYMENT_SENT;
                  const isBusy = !!busy[it.id];
                  const ohPending = (it.ohApprovalStatus || 'PENDING') === 'PENDING';
                  const adminEligible = it.ohApprovalStatus === 'APPROVED' && (it.adminApprovalStatus || 'PENDING') === 'PENDING';
                  const vpEligible = it.adminApprovalStatus === 'APPROVED' && (it.vpApprovalStatus || 'PENDING') === 'PENDING';
                  const btn = (bg) => ({ border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 10.5, fontWeight: 700, color: '#fff', background: bg, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1 });
                  const tdsAmt = it.tdsAmount != null ? Number(it.tdsAmount)
                    : (it.tdsPercent ? Number(it.sentAmount || 0) * Number(it.tdsPercent) / 100 : 0);
                  const deductionAmt = Number(it.deductionAmount || 0);
                  const apprVal = it.approvedValue != null ? Number(it.approvedValue)
                    : (Number(it.sentAmount || 0) - tdsAmt - deductionAmt);
                  return (
                    <tr key={it.id}>
                      <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>{it.projectName}</td>
                      <td style={{ fontSize: 13 }}>{it.partyName || '—'}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{it.refNo || '—'}</td>
                      <td style={{ fontSize: 12, color: '#334155' }}>{fmtStage(it.paymentStage)}</td>
                      <td style={{ fontSize: 12, color: '#334155' }}>{fmtPaymentAgainst(it.paymentMadeAgainst)}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 100, background: status.bg, color: status.color, fontSize: 10, fontWeight: 700 }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#2563eb', fontSize: 14 }}>{fmt(it.sentAmount)}</td>
                      <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmt(Number(it.pwjTotalPayable || 0) - Number(it.sentAmount || 0))}</td>
                      <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDateTime(it.sentAt)}</td>
                      <td style={{ fontSize: 12, color: '#475569', maxWidth: 240, whiteSpace: 'pre-wrap' }}>{remarkText(it) || '—'}</td>

                      {/* TDS % — read-only; set from the TDS tab */}
                      <td>
                        <span style={{ fontSize: 12 }}>{it.tdsPercent != null ? `${Number(it.tdsPercent)}%` : '—'}</span>
                      </td>
                      {/* TDS Amt */}
                      <td style={{ textAlign: 'right', fontSize: 12, color: '#b45309' }}>{tdsAmt ? fmt(tdsAmt) : '—'}</td>
                      {/* Deduction — read-only; set from the TDS tab */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: '#b45309' }}>{deductionAmt ? fmt(deductionAmt) : '—'}</span>
                      </td>
                      {/* Approved Value */}
                      <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#15803d' }}>{fmt(apprVal)}</td>

                      {/* OH Approval */}
                      <td style={{ minWidth: 150 }}>
                        {isOH && ohPending ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button disabled={isBusy} onClick={() => handleOhDecision(it, 'APPROVED')} style={btn('#15803d')}>Approve</button>
                            <button disabled={isBusy} onClick={() => handleOhDecision(it, 'REJECTED')} style={btn('#dc2626')}>Reject</button>
                          </div>
                        ) : (
                          <ApprovalBadge status={it.ohApprovalStatus} />
                        )}
                      </td>

                      {/* Admin Approval */}
                      <td style={{ minWidth: 130 }}>
                        {isAdmin && adminEligible ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button disabled={isBusy} onClick={() => handleAdminDecision(it, 'APPROVED')} style={btn('#15803d')}>Approve</button>
                            <button disabled={isBusy} onClick={() => handleAdminDecision(it, 'REJECTED')} style={btn('#dc2626')}>Reject</button>
                          </div>
                        ) : it.ohApprovalStatus === 'APPROVED' ? (
                          <ApprovalBadge status={it.adminApprovalStatus} />
                        ) : (
                          <span style={{ fontSize: 10.5, color: '#cbd5e1', fontStyle: 'italic' }}>Awaiting OH</span>
                        )}
                      </td>

                      {/* VP Approval */}
                      <td style={{ minWidth: 130 }}>
                        {isVP && vpEligible ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button disabled={isBusy} onClick={() => handleVpDecision(it, 'APPROVED')} style={btn('#15803d')}>Approve</button>
                            <button disabled={isBusy} onClick={() => handleVpDecision(it, 'REJECTED')} style={btn('#dc2626')}>Reject</button>
                            <button disabled={isBusy} onClick={() => handleVpRevise(it)} style={btn('#b45309')} title="Send back to Admin to adjust TDS/Deduction">Revise</button>
                          </div>
                        ) : it.adminApprovalStatus === 'APPROVED' ? (
                          <ApprovalBadge status={it.vpApprovalStatus} />
                        ) : (
                          <span style={{ fontSize: 10.5, color: '#cbd5e1', fontStyle: 'italic' }}>Awaiting Admin</span>
                        )}
                      </td>

                      {(isAdmin || isVP) && (
                        <td>
                          <button disabled={isBusy} onClick={() => handleDelete(it)}
                            title="Delete this Send for Payment entry"
                            style={{ ...btn('#fee2e2'), color: '#b91c1c' }}>
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
