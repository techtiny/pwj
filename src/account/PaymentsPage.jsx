import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Send, Download, Check, X, Clock, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { expenseItemsApi, fundManagementApi } from './accountApi';

// Read-only status — soft tint so a decision already made never looks like the solid, clickable Approve/Reject buttons
const APPROVAL_CFG = {
  PENDING:  { label: 'Pending',  color: "var(--hz-faint)", bg: '#f1f5f9', Icon: Clock },
  APPROVED: { label: 'Approved', color: '#15803d', bg: '#dcfce7', Icon: Check },
  REJECTED: { label: 'Rejected', color: '#b91c1c', bg: '#fee2e2', Icon: X },
};
function ApprovalBadge({ status }) {
  const cfg = APPROVAL_CFG[status] || APPROVAL_CFG.PENDING;
  return (
    <span title={cfg.label} aria-label={cfg.label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: cfg.bg, color: cfg.color, cursor: 'default' }}>
      <cfg.Icon size={14} strokeWidth={2.5} />
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

const todayStr = () => new Date().toISOString().slice(0, 10);

// The amount that actually goes to the vendor: Approved Value (after TDS / GST deductions) when set,
// otherwise the raw amount sent.
const payableAmount = it => (it.approvedValue != null && it.approvedValue !== ''
  ? Number(it.approvedValue) : Number(it.sentAmount || 0));

const STAGE_LABEL = { ADVANCE: 'Advance', STAGE_1: 'Stage 1', STAGE_2: 'Stage 2', STAGE_3: 'Stage 3', FINAL: 'Final' };
const fmtStage = v => (v ? (STAGE_LABEL[v] || v) : '—');
const PAYMENT_AGAINST_LABEL = { PO: 'PO', WO: 'WO', JO: 'JO', VENDOR_INVOICE: 'Vendor Invoice' };
const fmtPaymentAgainst = v => (v ? String(v).split(',').map(s => PAYMENT_AGAINST_LABEL[s.trim()] || s.trim()).filter(Boolean).join(', ') : '—');

// An Additional PO's doc number is always its base/original PO number plus one
// trailing letter (e.g. WO-2627-0004 -> WO-2627-0004A) — used to keep an
// additional PO's payment row grouped right under its original PO's row.
function baseRefNo(ref) {
  const m = /^(.+\d)[A-Z]$/.exec(ref || '');
  return m ? m[1] : (ref || '');
}
function isAdditionalPoRef(ref) {
  return /^(.+\d)[A-Z]$/.test(ref || '');
}

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

// A payment goes into the bank file on the day it was sent — unless its Required By date is more than BANK_CYCLE_DAYS later,
// then it waits for its own cycle (Required By − BANK_CYCLE_DAYS). Mirrors ExpenseItemService.bankFileDay on the backend.
const BANK_CYCLE_DAYS = 7;
function bankFileDay(it) {
  if (!it.sentAt) return null;
  const sent = new Date(it.sentAt).toLocaleDateString('en-CA');
  if (it.requiredByDate) {
    const d = new Date(it.requiredByDate + 'T00:00:00'); d.setDate(d.getDate() - BANK_CYCLE_DAYS);
    const pushed = d.toLocaleDateString('en-CA');
    if (pushed > sent) return pushed;
  }
  return sent;
}

export default function PaymentsPage({ isOH = false, isVP = false, isAdmin = false, isCeo = false, readOnly = false }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectFor, setRejectFor] = useState(null); // { item, level } — rejection reason dialog
  const [rejectText, setRejectText] = useState('');
  const [dedEdit, setDedEdit] = useState(null); // { id, mode: 'add' | 'set' } — Admin deduction editor
  const [dedVal, setDedVal] = useState('');
  const [dedNote, setDedNote] = useState('');
  const [dedAddFor, setDedAddFor] = useState(null); // item — "+" dialog: amount + remarks
  const [reviseFor, setReviseFor] = useState(null); // { item } — VP Revise dialog (pick Required By date)
  const [reviseDate, setReviseDate] = useState('');
  const [vpMode, setVpMode] = useState('RESCHEDULE'); // Level 3 (VP): move to next cycle, or reject outright
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [detail, setDetail]   = useState(null); // entry whose detail window is open
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

  async function handleOhDecision(item, status, remark) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setOhApproval(item.id, status, undefined, remark);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'OH approval failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleAdminDecision(item, status, remark) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setAdminApproval(item.id, status, remark);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Admin approval failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleVpDecision(item, status, remark) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setVpApproval(item.id, status, remark);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'VP approval failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleCeoDecision(item, status, remark) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setCeoApproval(item.id, status, remark);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'CEO approval failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleVpReschedule(item, date, remark, level = 'VP') {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await (level === 'ADMIN' ? expenseItemsApi.rescheduleAtAdmin : expenseItemsApi.rescheduleAtVp)(item.id, date, remark);
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.response?.data?.message || 'Rescheduling failed');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  // Admin edits TDS % / TDS Amt / Deduction right here. Amounts changed → Admin, VP and CEO approvals restart (OH's stays).
  async function saveDeductions(item, { pct, tdsAmt, ded, remarks }) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setDeductions(
        item.id,
        pct !== undefined ? pct : (tdsAmt !== undefined ? null : (item.tdsPercent != null ? Number(item.tdsPercent) : null)),
        ded !== undefined ? ded : (item.deductionAmount != null ? Number(item.deductionAmount) : null),
        !!item.gstDeducted,
        tdsAmt,
        remarks,
      );
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.response?.data?.message || 'Could not save the deduction');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
      setDedEdit(null);
    }
  }

  async function handleSetRequiredDate(item, date) {
    if (!date) return;
    setBusy(p => ({ ...p, [item.id]: true }));
    try { await expenseItemsApi.setRequiredDate(item.id, date); load(); }
    catch (e) { alert(e.response?.data?.error || 'Could not change the Required By date'); }
    finally { setBusy(p => { const c = { ...p }; delete c[item.id]; return c; }); }
  }

  async function handleVpRevise(item, date) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.reviseAtVp(item.id, date);
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

  // Paid Amt — total sent so far against the same doc (project + PWJ No), the same
  // "already sent" figure the Send for Payment dialog shows
  const paidByDoc = useMemo(() => {
    const m = {};
    items.forEach(it => {
      if (!it.refNo) return;
      const k = `${it.projectId}|${it.refNo}`;
      m[k] = (m[k] || 0) + Number(it.sentAmount || 0);
    });
    return m;
  }, [items]);
  const paidAmt = it => (it.refNo ? paidByDoc[`${it.projectId}|${it.refNo}`] || 0 : Number(it.sentAmount || 0));

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

  const selectStyle = { padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: "var(--hz-text-xs)", fontFamily: 'inherit', background: '#fff' };

  const HEADERS   = ['Transaction Type', 'Beneficiary Account Number', 'Instrument Amount', 'Beneficiary Name',
    'Beneficiary Code', 'Remarks', 'IFSC Code', 'Ben Email ID', 'Ben Mobile No'];
  const MANDATORY = ['Mandatory', 'Mandatory', 'Mandatory', 'Mandatory', 'Optional', 'Optional', 'Mandatory', 'Optional', 'Optional'];

  // Only entries approved all the way through Level 4 (CEO) are eligible for the bank file.
  const approvedForExport = useMemo(
    // A rejection at any level (OH / Admin / VP) keeps the entry out of the bank file and the Excel export.
    () => filtered.filter(it => (it.vpApprovalStatus || 'PENDING') === 'APPROVED'
      && it.ohApprovalStatus !== 'REJECTED' && it.adminApprovalStatus !== 'REJECTED'
      && (it.ceoApprovalStatus || 'PENDING') === 'APPROVED'),
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
      .filter(it => bankFileDay(it) === today)
      .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
  }, [approvedForExport]);

  // Generate today's bank payment file — pipe-delimited .txt, header + one line per approved transfer.
  function exportBankPayment() {
    if (approvedToday.length === 0) return;
    if (fundingBlocked) {
      const short = (funding.projects || []).filter(p => !p.funded).map(p => `${p.projectName} (short ${fmt(p.shortfall)})`).join(', ');
      alert(`Bank transfer not eligible — some projects are underfunded:\n\n${short}\n\nSettle the transfers in Funds → Inter Project Fund Flow first.`);
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
      {detail && (() => {
        const d = detail;
        const row = (label, val) => (
          <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: "var(--hz-text-sm)" }}>
            <div style={{ width: 130, color: "var(--hz-muted)", flexShrink: 0 }}>{label}</div>
            <div style={{ color: "var(--hz-ink)", fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{val}</div>
          </div>
        );
        return (
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', padding: '18px 22px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)" }}>Payment details</div>
                <button onClick={() => setDetail(null)} aria-label="Close" style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: "var(--hz-text-md)" }}>✕</button>
              </div>
              {row('Project', d.projectName || '—')}
              {row('Party', d.partyName || '—')}
              {row('PWJ No', (
                <>
                  {d.refNo || '—'}
                  {isAdditionalPoRef(d.refNo) && <div style={{ fontSize: "var(--hz-text-2xs)", color: '#b45309', fontWeight: 700 }}>↳ of {baseRefNo(d.refNo)}</div>}
                  {d.clubbedPrs?.length > 0 && <div style={{ fontSize: "var(--hz-text-2xs)", color: '#7c3aed', fontWeight: 700 }}>📎 Clubs {d.clubbedPrs.map(p => `PR #${p.id}`).join(', ')}</div>}
                </>
              ))}
              {row('Requested at', d.sentAt ? `${new Date(d.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${new Date(d.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '—')}
              {row('Required by', d.requiredByDate ? new Date(d.requiredByDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
              {row('Item description', <span style={{ whiteSpace: 'pre-wrap' }}>{d.description || '—'}</span>)}
              {row('Stage / Against', `${fmtStage(d.paymentStage)} · ${fmtPaymentAgainst(d.paymentMadeAgainst)}`)}
              {row('Payment requested', fmt(d.sentAmount))}
              {(() => {
                const t = d.tdsAmount != null ? Number(d.tdsAmount) : (d.tdsPercent ? Number(d.sentAmount || 0) * Number(d.tdsPercent) / 100 : 0);
                return <>
                  {row('TDS %', d.tdsPercent != null ? `${Number(d.tdsPercent)}%` : '—')}
                  {row('TDS Amt', t ? fmt(t) : '—')}
                </>;
              })()}
              {(() => {
                const t = d.tdsAmount != null ? Number(d.tdsAmount) : (d.tdsPercent ? Number(d.sentAmount || 0) * Number(d.tdsPercent) / 100 : 0);
                const o = Number(d.deductionAmount || 0);
                return (t || o) ? row('Deduction', `${fmt(t + o)} = TDS ${fmt(t)}${d.tdsPercent != null ? ` (${Number(d.tdsPercent)}%)` : ''} + Other ${fmt(o)}`) : null;
              })()}
              {row('Paid amount', fmt(paidAmt(d)))}
              {row('Remarks', remarkText(d) || '—')}
              {d.deductionRemarks && row('Deduction remarks', <span style={{ whiteSpace: 'pre-wrap' }}>{d.deductionRemarks}</span>)}
              {d.rejectionRemark && row(d.rejectedAtLevel === 'VP_RESCHEDULE' ? 'Rescheduled by VP' : d.rejectedAtLevel === 'ADMIN_RESCHEDULE' ? 'Rescheduled by Admin' : `Rejected (${d.rejectedAtLevel === 'ADMIN' ? 'Admin' : d.rejectedAtLevel || ''})`, <span style={{ color: '#991b1b' }}>{d.rejectionRemark}</span>)}
              {row('Approvals', `OH/VP: ${d.ohApprovalStatus || 'PENDING'} · Admin: ${d.adminApprovalStatus || 'PENDING'} · VP: ${d.vpApprovalStatus || 'PENDING'} · CEO: ${d.ceoApprovalStatus || 'PENDING'}`)}
            </div>
          </div>
        );
      })()}
      {dedAddFor && (() => {
        const it = dedAddFor; const cur = Number(it.deductionAmount || 0);
        const valid = Number(dedVal) > 0 && dedNote.trim();
        return (
          <div onClick={() => setDedAddFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, padding: '18px 22px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)", marginBottom: 4 }}>Add deduction</div>
              <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginBottom: 12 }}>{it.partyName || ''} · {fmt(it.sentAmount)}{cur ? ` — current deduction ${fmt(cur)}` : ''}</div>
              <label style={{ display: 'block', fontSize: "var(--hz-text-xs)", fontWeight: 700, color: 'var(--hz-ink-2)', marginBottom: 4 }}>Deduction amount <span style={{ color: '#dc2626' }}>*</span></label>
              <input autoFocus type="number" min="0" step="0.01" value={dedVal} onChange={e => setDedVal(e.target.value)} placeholder="₹ 0.00"
                style={{ width: '100%', boxSizing: 'border-box', height: 38, border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', fontSize: "var(--hz-text-sm)", fontFamily: 'inherit', marginBottom: 10 }} />
              <label style={{ display: 'block', fontSize: "var(--hz-text-xs)", fontWeight: 700, color: 'var(--hz-ink-2)', marginBottom: 4 }}>Remarks <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea rows={3} value={dedNote} onChange={e => setDedNote(e.target.value)} placeholder="Why is this deducted? (e.g. damaged material, retention)…"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: "var(--hz-text-sm)", fontFamily: 'inherit', resize: 'vertical' }} />
              {cur > 0 && Number(dedVal) > 0 && <div style={{ fontSize: "var(--hz-text-xs)", color: '#b45309', marginTop: 6 }}>New total deduction: <b>{fmt(cur + Number(dedVal))}</b></div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button onClick={() => setDedAddFor(null)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Cancel</button>
                <button disabled={!valid} onClick={() => {
                  const line = `${fmt(Number(dedVal))} — ${dedNote.trim()}`;
                  setDedAddFor(null);
                  saveDeductions(it, { ded: cur + Number(dedVal), remarks: it.deductionRemarks ? `${it.deductionRemarks}\n${line}` : line });
                }} style={{ border: 'none', background: valid ? '#c2410c' : '#fdba74', color: 'var(--hz-on-dark)', borderRadius: 8, padding: '8px 14px', cursor: valid ? 'pointer' : 'not-allowed', fontWeight: 700, fontFamily: 'inherit' }}>Add deduction</button>
              </div>
            </div>
          </div>
        );
      })()}
      {reviseFor && (
        <div onClick={() => setReviseFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, padding: '18px 22px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)", marginBottom: 4 }}>Revise payment</div>
            <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginBottom: 12 }}>{reviseFor.item.partyName || ''} · {fmt(reviseFor.item.sentAmount)} — set the new Required By date. It is revised and approved at your level in one step; earlier approvals are kept.</div>
            <label style={{ display: 'block', fontSize: "var(--hz-text-xs)", fontWeight: 700, color: 'var(--hz-ink-2)', marginBottom: 4 }}>Required By date</label>
            <input type="date" value={reviseDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setReviseDate(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', height: 38, border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', fontSize: "var(--hz-text-sm)", fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setReviseFor(null)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Cancel</button>
              <button disabled={!reviseDate} onClick={() => { const it = reviseFor.item; setReviseFor(null); handleVpRevise(it, reviseDate); }}
                style={{ border: 'none', background: reviseDate ? '#15803d' : '#86efac', color: 'var(--hz-on-dark)', borderRadius: 8, padding: '8px 14px', cursor: reviseDate ? 'pointer' : 'not-allowed', fontWeight: 700, fontFamily: 'inherit' }}>Revise &amp; Approve</button>
            </div>
          </div>
        </div>
      )}
      {rejectFor && (
        <div onClick={() => setRejectFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, padding: '18px 22px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)", marginBottom: 4 }}>{(rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && vpMode === 'RESCHEDULE' ? 'Reschedule to next cycle' : 'Reject payment'}</div>
            <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginBottom: 10 }}>{rejectFor.item.partyName || ''} · {fmt(rejectFor.item.sentAmount)} — {(rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && vpMode === 'RESCHEDULE' ? 'the payment moves to the date you pick and comes back for approval in that cycle.' : 'tell the requester why.'}</div>
            {(rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && (
              <>
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 9, padding: 3, marginBottom: 12 }}>
                  {[['RESCHEDULE', 'Reschedule'], ['REJECT', 'Reject']].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setVpMode(k)}
                      style={{ flex: 1, border: 'none', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', fontSize: "var(--hz-text-sm)",
                        background: vpMode === k ? '#fff' : 'transparent', color: vpMode === k ? (k === 'REJECT' ? '#dc2626' : '#1d4ed8') : 'var(--hz-ink-2)', boxShadow: vpMode === k ? '0 1px 2px rgba(15,23,42,.12)' : 'none' }}>{l}</button>
                  ))}
                </div>
                {vpMode === 'RESCHEDULE' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: "var(--hz-text-xs)", fontWeight: 700, color: 'var(--hz-ink-2)', marginBottom: 4 }}>
                      New payment date (next cycle) <span style={{ color: '#dc2626' }}>*</span>
                      {rejectFor.item.requiredByDate && <span style={{ fontWeight: 500, color: 'var(--hz-muted)' }}> · currently {new Date(rejectFor.item.requiredByDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                    </label>
                    <input type="date" value={rescheduleDate} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={e => setRescheduleDate(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', height: 38, border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', fontSize: "var(--hz-text-sm)", fontFamily: 'inherit' }} />
                  </div>
                )}
              </>
            )}
            <textarea autoFocus rows={4} value={rejectText} onChange={e => setRejectText(e.target.value)} placeholder={(rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && vpMode === 'RESCHEDULE' ? 'Reason for rescheduling (required)…' : 'Reason for rejection (required)…'}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: "var(--hz-text-sm)", fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setRejectFor(null)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Cancel</button>
              <button disabled={!rejectText.trim() || ((rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && vpMode === 'RESCHEDULE' && !rescheduleDate)} onClick={() => {
                const { item, level } = rejectFor; const remark = rejectText.trim(); setRejectFor(null);
                if ((level === 'VP' || level === 'ADMIN') && vpMode === 'RESCHEDULE') { handleVpReschedule(item, rescheduleDate, remark, level); return; }
                (level === 'OH' ? handleOhDecision : level === 'ADMIN' ? handleAdminDecision : level === 'CEO' ? handleCeoDecision : handleVpDecision)(item, 'REJECTED', remark);
              }} style={{ border: 'none', background: (!rejectText.trim() || ((rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && vpMode === 'RESCHEDULE' && !rescheduleDate)) ? '#fca5a5' : ((rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && vpMode === 'RESCHEDULE' ? '#1d4ed8' : '#dc2626'), color: "var(--hz-on-dark)", borderRadius: 8, padding: '8px 14px', cursor: rejectText.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontFamily: 'inherit' }}>{(rejectFor.level === 'VP' || rejectFor.level === 'ADMIN') && vpMode === 'RESCHEDULE' ? 'Reschedule' : 'Reject'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', borderRadius: 12, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Send size={24} color="white" />
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: "var(--hz-text-lg)" }}>Send for Payment Tracker</div>
          <div style={{ color: '#bfdbfe', fontSize: "var(--hz-text-sm)", marginTop: 2 }}>
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
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: "var(--hz-text-xs)", fontWeight: active ? 700 : 500,
                  padding: '6px 12px', borderRadius: 6,
                  background: active ? '#2563eb' : 'transparent',
                  color: active ? "var(--hz-on-dark)" : "var(--hz-ink-2)",
                }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {timeline === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={selectStyle} />
            <span style={{ color: "var(--hz-faint)", fontSize: "var(--hz-text-xs)" }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={selectStyle} />
          </div>
        )}

        {(filterProject || filterParty || timeline !== 'all') && (
          <button onClick={() => { setFilterProject(''); setFilterParty(''); setTimeline('all'); }}
            style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: "var(--hz-text-xs)", fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
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
            <div className="pay-kpi-label" style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", fontWeight: 500 }}>{label}</div>
            <div className="pay-kpi-value" style={{ fontSize: "var(--hz-text-xl)", fontWeight: 800, color: "var(--hz-ink)", marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {fundingBlocked && !readOnly && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: "var(--hz-text-xl)" }}>⚠️</span>
          <div style={{ fontSize: "var(--hz-text-sm)", color: '#7f1d1d' }}>
            <b>Bank transfer not eligible — shortfall {fmt(funding.totalShortfall)}.</b>{' '}
            {(funding.projects || []).filter(p => !p.funded).map(p => `${p.projectName} (short ${fmt(p.shortfall)})`).join(', ')}.
            {' '}Move fund in <b>Funds → Inter Project Fund Flow</b>, then generate the bank file.
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div className="pay-section-title" style={{ fontSize: "var(--hz-text-md)", fontWeight: 700, color: "var(--hz-ink)" }}>Payment History</div>
          {!readOnly && <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportBankPayment} disabled={approvedToday.length === 0 || fundingBlocked}
              title={approvedToday.length === 0
                ? 'No VP-approved entries sent for payment today'
                : fundingBlocked
                ? `Underfunded — settle transfers in Funds → Inter Project Fund Flow (shortfall ${fmt(funding.totalShortfall)})`
                : `Generate today's bank payment file (${approvedToday.length} ${approvedToday.length === 1 ? 'transfer' : 'transfers'})`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #1d4ed8', borderRadius: 8,
                padding: '7px 12px', fontSize: "var(--hz-text-xs)", fontWeight: 600, fontFamily: 'inherit',
                background: (approvedToday.length === 0 || fundingBlocked) ? '#f1f5f9' : '#2563eb',
                color: (approvedToday.length === 0 || fundingBlocked) ? "var(--hz-faint)" : "var(--hz-on-dark)",
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
                padding: '7px 12px', fontSize: "var(--hz-text-xs)", fontWeight: 600, fontFamily: 'inherit',
                background: approvedForExport.length === 0 ? '#f1f5f9' : '#fff',
                color: approvedForExport.length === 0 ? "var(--hz-faint)" : "var(--hz-ink)",
                cursor: approvedForExport.length === 0 ? 'not-allowed' : 'pointer',
              }}>
              <Download size={14} /> Export Excel{approvedForExport.length > 0 ? ` (${approvedForExport.length})` : ''}
            </button>
          </div>}
        </div>
        {loading ? (
          <div className="loading" style={{ height: 80 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: "var(--hz-faint)", fontSize: "var(--hz-text-sm)" }}>
            {items.length === 0
              ? 'Nothing sent for payment yet. Mark entries eligible in the Expenses tab, then use "Send for Payment".'
              : 'No entries match the current filters.'}
          </div>
        ) : (
          <div className="table-container">
            <table className="pay-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project</th>
                  <th>Party</th>
                  <th title="Total sent so far against this PWJ No (same as 'already sent' in the Send for Payment dialog)">Paid<br />Amt</th>
                  <th title="Date the requesting engineer needs this payment made by">Required<br />By</th>
                  <th>Payment<br />Requested</th>
                  <th>Level 1<br />OH/VP</th>
                  <th title="TDS rate applied on Payment Requested — Admin can change it here">TDS %</th>
                  <th title="Payment Requested × TDS %">TDS Amt</th>
                  <th title="Total deduction = TDS Amt + any other deduction — Admin: click to set the other deduction, + to add one">Deduction</th>
                  <th title="Payment Requested − Deduction (TDS + other) − GST Amt">Approved<br />Value</th>
                  <th>Level 2<br />Admin</th>
                  <th>Level 3<br />VP</th>
                  <th>Level 4<br />CEO</th>
                  {(isAdmin || isVP) && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => {
                  const isBusy = !!busy[it.id];
                  const adminEdits = isAdmin && !readOnly && (it.ceoApprovalStatus || 'PENDING') !== 'APPROVED' && it.ohApprovalStatus === 'APPROVED'
                    && it.adminApprovalStatus !== 'REJECTED' && it.vpApprovalStatus !== 'REJECTED' && it.ceoApprovalStatus !== 'REJECTED';
                  const ohPending = (it.ohApprovalStatus || 'PENDING') === 'PENDING';
                  const adminEligible = it.ohApprovalStatus === 'APPROVED' && (it.adminApprovalStatus || 'PENDING') === 'PENDING';
                  const vpEligible = it.adminApprovalStatus === 'APPROVED' && (it.vpApprovalStatus || 'PENDING') === 'PENDING';
                  const btn = (bg) => ({ border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: "var(--hz-text-2xs)", fontWeight: 700, color: "var(--hz-on-dark)", background: bg, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1 });
                  const tdsAmt = it.tdsAmount != null ? Number(it.tdsAmount)
                    : (it.tdsPercent ? Number(it.sentAmount || 0) * Number(it.tdsPercent) / 100 : 0);
                  const deductionAmt = Number(it.deductionAmount || 0);
                  const apprVal = it.approvedValue != null ? Number(it.approvedValue)
                    : (Number(it.sentAmount || 0) - tdsAmt - deductionAmt);
                  return (
                    <tr key={it.id} style={{ cursor: 'pointer' }} title="Click for details" onClick={e => { if (e.target.closest('button,a,input,select')) return; setDetail(it); }}>
                      <td style={{ color: "var(--hz-faint)", fontSize: "var(--hz-text-xs)" }}>{i + 1}</td>
                      <td className="col-wrap" style={{ fontSize: "var(--hz-text-sm)", fontWeight: 600 }}>{it.projectName}</td>
                      <td className="col-wrap" style={{ fontSize: "var(--hz-text-sm)" }}>{it.partyName || '—'}</td>
                      <td style={{ fontSize: "var(--hz-text-sm)", fontWeight: 700, color: '#0f766e' }}>{fmt(paidAmt(it))}</td>
                      <td style={{ fontSize: "var(--hz-text-xs)", color: '#0f766e', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {(isAdmin || isVP) && !readOnly && (it.ceoApprovalStatus || 'PENDING') !== 'APPROVED' && it.vpApprovalStatus !== 'REJECTED' && it.adminApprovalStatus !== 'REJECTED' && it.ohApprovalStatus !== 'REJECTED' ? (
                          <input type="date" disabled={isBusy} value={it.requiredByDate || ''} min={new Date().toISOString().slice(0, 10)} title="Choose the Required By date"
                            onChange={e => handleSetRequiredDate(it, e.target.value)}
                            style={{ height: 30, border: '1px solid #cbd5e1', borderRadius: 7, padding: '0 6px', fontSize: "var(--hz-text-xs)", fontFamily: 'inherit', color: '#0f766e', fontWeight: 600, background: '#fff' }} />
                        ) : (
                          it.requiredByDate ? new Date(it.requiredByDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
                        )}
                        {it.sentAt && bankFileDay(it) > new Date().toLocaleDateString('en-CA') && (
                          <div style={{ fontSize: "var(--hz-text-2xs)", color: '#b45309', fontWeight: 700 }} title={`Goes into the bank file on ${new Date(bankFileDay(it) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}>Payment rescheduled</div>
                        )}
                      </td>
                      <td style={{ fontWeight: 800, color: '#2563eb', fontSize: "var(--hz-text-md)" }}>{fmt(it.sentAmount)}</td>

                      {/* OH Approval — OH and VP can both act here */}
                      <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                        {(isOH || isVP) && ohPending ? (
                          <div className="appr-actions">
                            <button disabled={isBusy} onClick={() => handleOhDecision(it, 'APPROVED')} className="appr-btn appr-btn--ok" title="Approve" aria-label="Approve"><Check size={14} strokeWidth={2.5} /></button>
                            <button disabled={isBusy} onClick={() => { setRejectText(''); setRejectFor({ item: it, level: 'OH' }); }} className="appr-btn appr-btn--no" title="Reject" aria-label="Reject"><X size={14} strokeWidth={2.5} /></button>
                          </div>
                        ) : (
                          <ApprovalBadge status={it.ohApprovalStatus} />
                        )}
                      </td>


                      {/* TDS % — Admin can change it here (otherwise read-only) */}
                      <td>
                        {adminEdits ? (
                          <select disabled={isBusy} value={it.tdsPercent != null ? String(Number(it.tdsPercent)) : ''}
                            onChange={e => saveDeductions(it, { pct: e.target.value === '' ? null : Number(e.target.value) })}
                            style={{ height: 30, border: '1px solid #cbd5e1', borderRadius: 7, padding: '0 4px', fontSize: "var(--hz-text-xs)", fontFamily: 'inherit', background: '#fff' }}>
                            <option value="">—</option>
                            {[1, 2, 10].map(pc => <option key={pc} value={String(pc)}>{pc}%</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: "var(--hz-text-xs)" }}>{it.tdsPercent != null ? `${Number(it.tdsPercent)}%` : '—'}</span>
                        )}
                      </td>
                      {/* TDS Amt — Admin can type an amount directly */}
                      <td style={{ fontSize: "var(--hz-text-xs)", color: '#b45309' }}>
                        {adminEdits ? (
                          <input key={`tds-${it.id}-${tdsAmt}`} type="number" min="0" step="0.01" disabled={isBusy} defaultValue={tdsAmt ? Number(tdsAmt).toFixed(2) : ''} placeholder="0.00"
                            onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (Number(v.toFixed(2)) !== Number(Number(tdsAmt || 0).toFixed(2))) saveDeductions(it, { tdsAmt: v }); }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                            style={{ width: 96, height: 30, border: '1px solid #cbd5e1', borderRadius: 7, padding: '0 6px', fontSize: "var(--hz-text-xs)", fontFamily: 'inherit', color: '#b45309', background: '#fff' }} />
                        ) : (tdsAmt ? fmt(tdsAmt) : '—')}
                      </td>
                      {/* Deduction — Admin: click the value to set it, "+" to add an amount on top */}
                      <td>
                        {adminEdits && dedEdit?.id === it.id ? (
                          <input autoFocus type="number" min="0" step="0.01" value={dedVal} onChange={e => setDedVal(e.target.value)} placeholder="Other deduction ₹" disabled={isBusy}
                            onKeyDown={e => { if (e.key === 'Escape') setDedEdit(null); if (e.key === 'Enter') e.target.blur(); }}
                            onBlur={() => {
                              const v = dedVal === '' ? 0 : Math.max(0, Number(dedVal));
                              if (dedEdit?.id !== it.id) return;
                              if (Number(v.toFixed(2)) === Number(deductionAmt.toFixed(2))) { setDedEdit(null); return; }
                              saveDeductions(it, { ded: v });
                            }}
                            style={{ width: 96, height: 30, border: '1px solid #cbd5e1', borderRadius: 7, padding: '0 6px', fontSize: "var(--hz-text-xs)", fontFamily: 'inherit' }} />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div>
                              <span onClick={adminEdits ? () => { setDedVal(deductionAmt ? String(deductionAmt) : ''); setDedEdit({ id: it.id, mode: 'set' }); } : undefined}
                                title={[`TDS ${fmt(tdsAmt || 0)}${deductionAmt ? ` + other deduction ${fmt(deductionAmt)}` : ''}`, it.deductionRemarks, adminEdits ? 'Click to set the other deduction (TDS is set in TDS % / TDS Amt)' : ''].filter(Boolean).join('\n')}
                                style={{ fontSize: "var(--hz-text-xs)", color: '#b45309', fontWeight: 700, cursor: adminEdits ? 'pointer' : 'default', textDecoration: adminEdits ? 'underline dotted' : 'none' }}>{(tdsAmt || deductionAmt) ? fmt((tdsAmt || 0) + deductionAmt) : '—'}</span>
                            </div>
                            {adminEdits && (
                              <button type="button" disabled={isBusy} title="Add a deduction amount" aria-label="Add deduction"
                                onClick={() => { setDedVal(''); setDedNote(''); setDedAddFor(it); }}
                                style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #fdba74', background: '#fff7ed', color: '#c2410c', fontWeight: 800, lineHeight: 1, cursor: 'pointer', padding: 0 }}>+</button>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Approved Value */}
                      <td style={{ fontSize: "var(--hz-text-sm)", fontWeight: 800, color: '#15803d' }}>{fmt(apprVal)}</td>

                      {/* Admin Approval */}
                      <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                        {isAdmin && adminEligible ? (
                          <div className="appr-actions">
                            <button disabled={isBusy} onClick={() => handleAdminDecision(it, 'APPROVED')} className="appr-btn appr-btn--ok" title="Approve" aria-label="Approve"><Check size={14} strokeWidth={2.5} /></button>
                            <button disabled={isBusy} onClick={() => { setRejectText(''); setVpMode('RESCHEDULE'); setRescheduleDate(''); setRejectFor({ item: it, level: 'ADMIN' }); }} className="appr-btn appr-btn--no" title="Reject" aria-label="Reject"><X size={14} strokeWidth={2.5} /></button>
                          </div>
                        ) : it.ohApprovalStatus === 'APPROVED' ? (
                          <ApprovalBadge status={it.adminApprovalStatus} />
                        ) : (
                          <span style={{ fontSize: "var(--hz-text-2xs)", color: '#cbd5e1', fontStyle: 'italic' }}>Awaiting OH</span>
                        )}
                      </td>

                      {/* VP Approval */}
                      <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                        {isVP && vpEligible ? (
                          <div className="appr-actions">
                            <button disabled={isBusy} onClick={() => handleVpDecision(it, 'APPROVED')} className="appr-btn appr-btn--ok" title="Approve" aria-label="Approve"><Check size={14} strokeWidth={2.5} /></button>
                            <button disabled={isBusy} onClick={() => { setRejectText(''); setVpMode('RESCHEDULE'); setRescheduleDate(''); setRejectFor({ item: it, level: 'VP' }); }} className="appr-btn appr-btn--no" title="Reject" aria-label="Reject"><X size={14} strokeWidth={2.5} /></button>
                            <button disabled={isBusy} onClick={() => { setReviseDate(it.requiredByDate || ''); setReviseFor({ item: it }); }} className="appr-btn appr-btn--revise" title="Revise the Required By date and approve">Revise</button>
                          </div>
                        ) : it.adminApprovalStatus === 'APPROVED' ? (
                          <ApprovalBadge status={it.vpApprovalStatus} />
                        ) : (
                          <span style={{ fontSize: "var(--hz-text-2xs)", color: '#cbd5e1', fontStyle: 'italic' }}>Awaiting Admin</span>
                        )}
                      </td>

                      {/* CEO Approval — Level 4, after VP */}
                      <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                        {isCeo && it.vpApprovalStatus === 'APPROVED' && (it.ceoApprovalStatus || 'PENDING') === 'PENDING' ? (
                          <div className="appr-actions">
                            <button disabled={isBusy} onClick={() => handleCeoDecision(it, 'APPROVED')} className="appr-btn appr-btn--ok" title="Approve" aria-label="Approve"><Check size={14} strokeWidth={2.5} /></button>
                            <button disabled={isBusy} onClick={() => { setRejectText(''); setRejectFor({ item: it, level: 'CEO' }); }} className="appr-btn appr-btn--no" title="Reject" aria-label="Reject"><X size={14} strokeWidth={2.5} /></button>
                          </div>
                        ) : it.vpApprovalStatus === 'APPROVED' ? (
                          <ApprovalBadge status={it.ceoApprovalStatus} />
                        ) : (
                          <span style={{ fontSize: "var(--hz-text-2xs)", color: '#cbd5e1', fontStyle: 'italic' }}>Awaiting VP</span>
                        )}
                      </td>

                      {(isAdmin || isVP) && (
                        <td>
                          <button disabled={isBusy} onClick={() => handleDelete(it)}
                            title="Delete this Send for Payment entry" aria-label="Delete"
                            className="appr-btn appr-btn--delete">
                            <Trash2 size={14} strokeWidth={2.25} />
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
