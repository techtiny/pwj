import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Percent } from 'lucide-react';
import { expenseItemsApi } from './accountApi';

const TDS_OPTIONS = [1, 2, 10];

function fmt(v) {
  const num = Number(v) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function toDateInputValue(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}
const monthKeyOf = d => d ? new Date(d).toISOString().slice(0, 7) : 'undated'; // 'YYYY-MM'
const monthLabelOf = key => key === 'undated' ? 'Undated'
  : new Date(key + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

function tdsAmtOf(it) {
  return it.tdsAmount != null ? Number(it.tdsAmount)
    : (it.tdsPercent ? Number(it.sentAmount || 0) * Number(it.tdsPercent) / 100 : 0);
}

export default function TdsPage({ isAdmin = false }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState({}); // id -> true while a save is in flight

  const [filterMonth, setFilterMonth]     = useState('all');
  const [filterProject, setFilterProject] = useState('');
  const [filterParty, setFilterParty]     = useState('');
  const [filterFiled, setFilterFiled]     = useState('all'); // all | yes | no
  const [filterTdsPct, setFilterTdsPct]   = useState('all'); // all | 1 | 2 | 10

  const load = useCallback(() => {
    setLoading(true);
    expenseItemsApi.getSentForPayment()
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only OH-approved entries land here — TDS can't be set before OH has signed off.
  const ohApproved = useMemo(
    () => [...items.filter(it => (it.ohApprovalStatus || 'PENDING') === 'APPROVED')]
      .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0)),
    [items],
  );

  const monthOptions = useMemo(() => {
    const set = new Set(ohApproved.map(it => monthKeyOf(it.sentAt)));
    return [...set];
  }, [ohApproved]);

  const projectOptions = useMemo(() => {
    const map = new Map();
    ohApproved.forEach(it => { if (it.projectId != null) map.set(it.projectId, it.projectName); });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [ohApproved]);

  const filtered = useMemo(() => {
    const partyQ = filterParty.trim().toLowerCase();
    return ohApproved.filter(it => {
      if (filterMonth !== 'all' && monthKeyOf(it.sentAt) !== filterMonth) return false;
      if (filterProject && String(it.projectId) !== String(filterProject)) return false;
      if (partyQ && !(it.partyName || '').toLowerCase().includes(partyQ)) return false;
      if (filterFiled !== 'all' && !!it.tdsFiled !== (filterFiled === 'yes')) return false;
      if (filterTdsPct !== 'all' && String(it.tdsPercent != null ? Number(it.tdsPercent) : '') !== filterTdsPct) return false;
      return true;
    });
  }, [ohApproved, filterMonth, filterProject, filterParty, filterFiled, filterTdsPct]);

  const totalTdsAmt = useMemo(() => filtered.reduce((sum, it) => sum + tdsAmtOf(it), 0), [filtered]);

  async function handleTdsPercentChange(item, tdsPercent) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      const deductionAmount = item.deductionAmount != null ? Number(item.deductionAmount) : null;
      await expenseItemsApi.setDeductions(item.id, tdsPercent, deductionAmount, !!item.gstDeducted);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not save TDS %');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  async function handleFilingChange(item, patch) {
    const invoiceNo = patch.invoiceNo !== undefined ? patch.invoiceNo : (item.invoiceNo || '');
    const tdsPaidDate = patch.tdsPaidDate !== undefined ? patch.tdsPaidDate : (item.tdsPaidDate || null);
    const tdsFiled = patch.tdsFiled !== undefined ? patch.tdsFiled : !!item.tdsFiled;
    const remarks = patch.remarks !== undefined ? patch.remarks : (item.remarks || '');
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setTdsFiling(item.id, invoiceNo || null, tdsPaidDate || null, tdsFiled, remarks || null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not save TDS filing details');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  const inputStyle = { padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 11, fontFamily: 'inherit', background: '#fff' };

  return (
    <div className="pay-dash">
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', borderRadius: 12, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Percent size={24} color="white" />
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>TDS</div>
          <div style={{ color: '#e9d5ff', fontSize: 13.5, marginTop: 2 }}>
            TDS % and filing status on OH-approved payments
          </div>
        </div>
      </div>

      {/* Filters — one per column */}
      <div className="card" style={{ padding: 14, marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={inputStyle}>
          <option value="all">All Months</option>
          {monthOptions.map(k => <option key={k} value={k}>{monthLabelOf(k)}</option>)}
        </select>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={inputStyle}>
          <option value="">All Projects</option>
          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input placeholder="Search Party…" value={filterParty} onChange={e => setFilterParty(e.target.value)}
          style={{ ...inputStyle, minWidth: 160 }} />
        <select value={filterFiled} onChange={e => setFilterFiled(e.target.value)} style={inputStyle}>
          <option value="all">TDS Filed: All</option>
          <option value="yes">TDS Filed: Yes</option>
          <option value="no">TDS Filed: No</option>
        </select>
        <select value={filterTdsPct} onChange={e => setFilterTdsPct(e.target.value)} style={inputStyle}>
          <option value="all">TDS %: All</option>
          {TDS_OPTIONS.map(p => <option key={p} value={String(p)}>{p}%</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748b' }}>{filtered.length} of {ohApproved.length}</div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          No OH-approved entries match the current filters.
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date of Payment</th>
                  <th>Project</th>
                  <th>Party</th>
                  <th>PWJ No.</th>
                  <th>Invoice No.</th>
                  <th>TDS %</th>
                  <th style={{ textAlign: 'right' }} title="Amount Sent × TDS %">TDS Amt</th>
                  <th>TDS Paid Date</th>
                  <th>TDS Filed</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => {
                  const isBusy = !!busy[it.id];
                  const tdsAmt = tdsAmtOf(it);
                  return (
                    <tr key={it.id}>
                      <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(it.sentAt)}</td>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>{it.projectName}</td>
                      <td style={{ fontSize: 13 }}>{it.partyName || '—'}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{it.refNo || '—'}</td>

                      {/* Invoice No. */}
                      <td>
                        {isAdmin ? (
                          <input type="text" disabled={isBusy} defaultValue={it.invoiceNo || ''}
                            placeholder="Invoice #"
                            onBlur={e => {
                              const v = e.target.value.trim();
                              if (v !== (it.invoiceNo || '')) handleFilingChange(it, { invoiceNo: v });
                            }}
                            style={{ ...inputStyle, width: 100 }} />
                        ) : (
                          <span style={{ fontSize: 12 }}>{it.invoiceNo || '—'}</span>
                        )}
                      </td>

                      {/* TDS % */}
                      <td>
                        {isAdmin && (it.vpApprovalStatus || 'PENDING') !== 'APPROVED' ? (
                          <select style={inputStyle} disabled={isBusy}
                            value={it.tdsPercent != null ? String(Number(it.tdsPercent)) : ''}
                            onChange={e => handleTdsPercentChange(it, e.target.value === '' ? null : Number(e.target.value))}>
                            <option value="">—</option>
                            {TDS_OPTIONS.map(p => <option key={p} value={p}>{p}%</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{it.tdsPercent != null ? `${Number(it.tdsPercent)}%` : '—'}</span>
                        )}
                      </td>
                      {/* TDS Amt */}
                      <td style={{ textAlign: 'right', fontSize: 12, color: '#b45309' }}>{tdsAmt ? fmt(tdsAmt) : '—'}</td>

                      {/* TDS Paid Date */}
                      <td>
                        {isAdmin ? (
                          <input type="date" disabled={isBusy} defaultValue={toDateInputValue(it.tdsPaidDate)}
                            onChange={e => handleFilingChange(it, { tdsPaidDate: e.target.value || null })}
                            style={{ ...inputStyle, width: 130 }} />
                        ) : (
                          <span style={{ fontSize: 12 }}>{fmtDate(it.tdsPaidDate)}</span>
                        )}
                      </td>

                      {/* TDS Filed */}
                      <td>
                        {isAdmin ? (
                          <select style={inputStyle} disabled={isBusy}
                            value={it.tdsFiled ? 'yes' : 'no'}
                            onChange={e => handleFilingChange(it, { tdsFiled: e.target.value === 'yes' })}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{it.tdsFiled ? 'Yes' : 'No'}</span>
                        )}
                      </td>

                      {/* Remarks */}
                      <td>
                        {isAdmin ? (
                          <input type="text" disabled={isBusy} defaultValue={it.remarks || ''}
                            placeholder="Remarks"
                            onBlur={e => {
                              const v = e.target.value.trim();
                              if (v !== (it.remarks || '')) handleFilingChange(it, { remarks: v });
                            }}
                            style={{ ...inputStyle, width: 160 }} />
                        ) : (
                          <span style={{ fontSize: 12, color: '#475569' }}>{it.remarks || '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="card" style={{ padding: '12px 16px', marginTop: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Total TDS Amt</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#b45309' }}>{fmt(totalTdsAmt)}</span>
          </div>
        </>
      )}
    </div>
  );
}
