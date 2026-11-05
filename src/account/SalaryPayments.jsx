import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, Download, Landmark, AlertTriangle, Send } from 'lucide-react';
import * as XLSX from 'xlsx';
import { salaryPayoutApi } from './accountApi';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS = {
  PENDING:  { label: 'Awaiting VP approval', bg: '#fffbeb', color: '#b45309' },
  APPROVED: { label: 'Approved by VP',       bg: '#dcfce7', color: '#15803d' },
  REJECTED: { label: 'Rejected by VP',       bg: '#fee2e2', color: '#b91c1c' },
};

const inr = (v) => '₹' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Server LocalDateTime values are UTC without a zone suffix — read them as UTC, show in IST.
const asUtc = (d) => new Date(typeof d === 'string' && !d.endsWith('Z') && !d.includes('+') ? d + 'Z' : d);
const fmtWhen = (d) => (d ? asUtc(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '');

// Same bank bulk-transfer layout as the vendor Send for Payment export.
const HEADERS   = ['Transaction Type', 'Beneficiary Account Number', 'Instrument Amount', 'Beneficiary Name',
  'Beneficiary Code', 'Remarks', 'IFSC Code', 'Ben Email ID', 'Ben Mobile No'];
const MANDATORY = ['Mandatory', 'Mandatory', 'Mandatory', 'Mandatory', 'Optional', 'Optional', 'Mandatory', 'Optional', 'Optional'];

function downloadExcel(batch) {
  const label = `${MONTHS[batch.month - 1]} ${batch.year}`;
  const ready = batch.lines.filter((l) => !l.bankMissing);
  const rows = ready.map((l) => ['N', l.accountNumber, Number(Number(l.netPay).toFixed(2)), l.fullName, l.personCode || '', `Salary ${label}`, l.ifsc, '', '']);
  const aoa = [HEADERS, MANDATORY, ...rows];
  aoa.push(['', '', Number(rows.reduce((s, r) => s + r[2], 0).toFixed(2)), 'GRAND TOTAL', '', '', '', '', '']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Salary ${label}`.slice(0, 31));
  // Anyone without account details can't be paid by bank file — list them so they are paid another way.
  const missing = batch.lines.filter((l) => l.bankMissing);
  if (missing.length) {
    const ms = XLSX.utils.aoa_to_sheet([['Person Code', 'Employee', 'Net Pay', 'Missing'],
      ...missing.map((l) => [l.personCode || '', l.fullName, Number(Number(l.netPay).toFixed(2)),
        [!l.accountNumber && 'Account number', !l.ifsc && 'IFSC'].filter(Boolean).join(' + ')])]);
    ms['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ms, 'Missing bank details');
  }
  XLSX.writeFile(wb, `salary-payment-${batch.year}-${String(batch.month).padStart(2, '0')}.xlsx`);
}

// Bank Payment file — same pipe-delimited .txt as the vendor Send for Payment page: one header line, one line per
// transfer, CRLF line endings, file named payfile_<date><second-of-day>.txt. Employees without bank details are left out.
function downloadBankFile(batch) {
  const label = `${MONTHS[batch.month - 1]} ${batch.year}`;
  const clean = (v) => String(v ?? '').replace(/[|\r\n]+/g, ' ').trim();
  const lines = batch.lines.filter((l) => !l.bankMissing).map((l) => [
    'N',                                              // Transaction Type — NEFT
    clean(l.accountNumber),                           // Beneficiary Account Number (Employee Master)
    String(Number(Number(l.netPay).toFixed(2))),      // Instrument Amount — net pay
    clean(l.fullName),                                // Beneficiary Name
    clean(l.personCode),                              // Beneficiary Code — person code
    clean(`Salary ${label}`),                         // Remarks
    clean(l.ifsc),                                    // IFSC Code (Employee Master)
    '',                                               // Ben Email ID
    '',                                               // Ben Mobile No
  ].join('|'));
  const content = [HEADERS.join('|'), ...lines].join('\r\n') + '\r\n';

  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const secOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payfile_${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}${secOfDay}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SalaryPayments({ username = '', isVP = false }) {
  const [batches, setBatches] = useState(null); // null = loading
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState('');
  const [open, setOpen]       = useState({});   // 'year-month' -> employee list expanded

  const load = useCallback(() => {
    salaryPayoutApi.list(username)
      .then((r) => { setBatches(r.data?.data || []); setError(''); })
      .catch((e) => { setBatches([]); setError(e.response?.data?.message || 'Could not load salary payments'); });
  }, [username]);
  useEffect(() => { load(); }, [load]);

  async function approve(b) {
    if (!window.confirm(`Approve the ${MONTHS[b.month - 1]} ${b.year} salary payment of ${inr(b.payable)}? The bank Excel can be downloaded once you approve.`)) return;
    setBusy(`${b.year}-${b.month}`);
    try { await salaryPayoutApi.approve(b.year, b.month, username); load(); }
    catch (e) { alert(e.response?.data?.message || 'Could not approve'); }
    finally { setBusy(''); }
  }

  async function reject(b) {
    const remark = window.prompt('Reason for rejecting this salary payment:');
    if (remark === null) return;
    if (!remark.trim()) { alert('Enter a reason for rejecting'); return; }
    setBusy(`${b.year}-${b.month}`);
    try { await salaryPayoutApi.reject(b.year, b.month, username, remark.trim()); load(); }
    catch (e) { alert(e.response?.data?.message || 'Could not reject'); }
    finally { setBusy(''); }
  }

  async function revise(b) {
    if (b.status === 'APPROVED' && !window.confirm(
      `The ${MONTHS[b.month - 1]} ${b.year} salary payment was already approved. Revising deletes it from this list and removes its Actual Outflow from Fund Management — a fresh payment appears here once the corrected salary is released and approved again.\n\nIt does NOT undo a bank transfer that has already been made.\n\nContinue?`)) return;
    const remark = window.prompt(`Revise the ${MONTHS[b.month - 1]} ${b.year} salary — what needs to change? It goes back to Admin, this payment leaves this list, and every approval starts again.`);
    if (remark === null) return;
    if (!remark.trim()) { alert('Enter what needs to be revised'); return; }
    setBusy(`${b.year}-${b.month}`);
    try { await salaryPayoutApi.revise(b.year, b.month, username, remark.trim()); load(); }
    catch (e) { alert(e.response?.data?.message || 'Could not revise'); }
    finally { setBusy(''); }
  }

  if (batches === null) return <div className="loading" style={{ height: 80 }}>Loading…</div>;

  return (
    <div className="pay-dash">
      <style>{`
        @media (max-width: 768px) {
          .sal-pay-table, .sal-pay-table tbody, .sal-pay-table tr, .sal-pay-table td { display: block; width: 100%; box-sizing: border-box; }
          .sal-pay-table thead { display: none; }
          .sal-pay-table tbody tr { border: 1px solid #e2e8f0; border-radius: 10px; margin: 8px 0; padding: 4px 0; background: #fff !important; }
          .sal-pay-table td { border: none !important; padding: 5px 12px !important; white-space: normal !important; width: auto !important; }
          .sal-pay-table td[data-label] { display: grid; grid-template-columns: 104px minmax(0, 1fr); column-gap: 10px; }
          .sal-pay-table td[data-label]::before { content: attr(data-label); font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: .4px; padding-top: 2px; }
        }
      `}</style>

      <div style={{ background: 'linear-gradient(135deg,#0f766e,#115e59)', borderRadius: 12, padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Landmark size={24} color="white" />
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>Salary Payment</div>
          <div style={{ color: '#ccfbf1', fontSize: 13.5, marginTop: 2 }}>
            A month's net pay lands here when the CEO releases it. Once the VP approves, generate the Bank Payment file or download the Excel — beneficiary details come from the Employee Master.
          </div>
        </div>
      </div>

      {error && <div className="card" style={{ padding: '12px 16px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#7f1d1d', fontSize: 14 }}>{error}</div>}

      {batches.length === 0 && !error && (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: '#0f172a', fontSize: 14 }}>
          No salary has been released for payment yet. Once the CEO releases a month's salary, it appears here for VP approval.
        </div>
      )}

      {batches.map((b, idx) => {
        const key = `${b.year}-${b.month}`;
        const st = STATUS[b.status] || STATUS.PENDING;
        const expanded = open[key] ?? idx === 0;
        const mine = busy === key;
        const missing = b.lines.filter((l) => l.bankMissing);
        return (
          <div key={key} className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="pay-section-title" style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  Salary — {MONTHS[b.month - 1]} {b.year}
                  <span style={{ marginLeft: 10, padding: '3px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: st.bg, color: st.color, verticalAlign: 'middle' }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 13.5, color: '#0f172a', marginTop: 4 }}>
                  {b.count} employee{b.count === 1 ? '' : 's'} · Net pay <b>{inr(b.total)}</b>
                  {b.releasedAt && <> · Released {fmtWhen(b.releasedAt)}</>}
                  {b.status === 'APPROVED' && b.decidedAt && <> · Approved {fmtWhen(b.decidedAt)}</>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {isVP && b.status !== 'APPROVED' && (
                  <div className="appr-actions">
                    <button disabled={mine} onClick={() => approve(b)} className="appr-btn appr-btn--ok" title="Approve" aria-label="Approve" style={{ width: 34, height: 34 }}><Check size={18} strokeWidth={2.75} /></button>
                    {b.status === 'PENDING' && (
                      <button disabled={mine} onClick={() => reject(b)} className="appr-btn appr-btn--no" title="Reject" aria-label="Reject" style={{ width: 34, height: 34 }}><X size={18} strokeWidth={2.75} /></button>
                    )}
                  </div>
                )}
                {isVP && (
                  <button disabled={mine} onClick={() => revise(b)} className="appr-btn appr-btn--revise"
                    title="Send this month back to Admin to correct it" style={{ height: 34 }}>Revise</button>
                )}
                <button onClick={() => downloadBankFile(b)} disabled={b.status !== 'APPROVED' || b.payable <= 0}
                  title={b.status !== 'APPROVED' ? 'Available once the VP approves' : `Generate the bank payment file (${b.count - b.missingCount} transfers)`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8,
                    padding: '8px 14px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', border: '1px solid',
                    background: b.status === 'APPROVED' ? '#2563eb' : '#f1f5f9', color: b.status === 'APPROVED' ? '#fff' : '#94a3b8',
                    borderColor: b.status === 'APPROVED' ? '#1d4ed8' : '#cbd5e1', cursor: b.status === 'APPROVED' ? 'pointer' : 'not-allowed',
                  }}>
                  <Send size={15} /> Bank Payment{b.status === 'APPROVED' && b.count - b.missingCount > 0 ? ` (${b.count - b.missingCount})` : ''}
                </button>
                <button onClick={() => downloadExcel(b)} disabled={b.status !== 'APPROVED' || b.payable <= 0}
                  title={b.status !== 'APPROVED' ? 'Available once the VP approves' : `Download the bank Excel (${b.count - b.missingCount} transfers)`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #cbd5e1', borderRadius: 8,
                    padding: '8px 14px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                    background: b.status === 'APPROVED' ? '#0f766e' : '#f1f5f9', color: b.status === 'APPROVED' ? '#fff' : '#94a3b8',
                    borderColor: b.status === 'APPROVED' ? '#0f766e' : '#cbd5e1', cursor: b.status === 'APPROVED' ? 'pointer' : 'not-allowed',
                  }}>
                  <Download size={15} /> Download Excel
                </button>
              </div>
            </div>

            {b.status === 'REJECTED' && b.remark && (
              <div style={{ marginTop: 12, fontSize: 14, color: '#7f1d1d', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
                Rejected{b.decidedBy ? ` by ${b.decidedBy}` : ''}: {b.remark}
              </div>
            )}

            {missing.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px' }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <b>{missing.length} employee{missing.length === 1 ? ' has' : 's have'} no account number / IFSC in the Employee Master</b> — left out of the bank file and the Excel (the Excel lists them on its second sheet) until HR adds them:{' '}
                  {missing.map((l) => l.fullName).join(', ')}.
                </div>
              </div>
            )}

            <button onClick={() => setOpen((o) => ({ ...o, [key]: !expanded }))}
              style={{ border: 'none', background: 'none', color: '#0f766e', fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: '12px 0 0', fontFamily: 'inherit' }}>
              {expanded ? 'Hide employees' : `Show employees (${b.count})`}
            </button>

            {expanded && (
              <div className="table-container" style={{ marginTop: 8 }}>
                <table className="sal-pay-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Person Code</th><th>Employee</th><th>Bank</th><th>Account Number</th><th>IFSC</th>
                      <th style={{ textAlign: 'right' }}>Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.lines.map((l, i) => (
                      <tr key={l.userId}>
                        <td data-label="#">{i + 1}</td>
                        <td data-label="Person code">{l.personCode || '—'}</td>
                        <td data-label="Employee" style={{ fontWeight: 600 }}>{l.fullName}</td>
                        <td data-label="Bank">{l.bankName || '—'}</td>
                        <td data-label="Account no." style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {l.accountNumber || <span style={{ color: '#b91c1c', fontWeight: 600 }}>Missing</span>}
                        </td>
                        <td data-label="IFSC">{l.ifsc || <span style={{ color: '#b91c1c', fontWeight: 600 }}>Missing</span>}</td>
                        <td data-label="Net pay" style={{ fontWeight: 800, textAlign: 'right' }}>{inr(l.netPay)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                      <td style={{ fontWeight: 800, textAlign: 'right' }}>{inr(b.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
