import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Percent, Upload, History } from 'lucide-react';
import { expenseItemsApi, gstImportApi, BASE_URL } from './accountApi';

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

// GST on the amount actually sent for payment (this instalment), not the flat GST amount
// on the whole PO/WO/JO — mirrors how TDS Amt is computed off Amount Sent.
function gstAmtOf(it) {
  return Number(it.sentAmount || 0) * Number(it.gstPercent || 0) / 100;
}

export default function GstPage({ isAdmin = false, userName = '' }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState({}); // id -> true while a save is in flight

  const [filterMonth, setFilterMonth]     = useState('all');
  const [filterProject, setFilterProject] = useState('');
  const [filterParty, setFilterParty]     = useState('');
  const [filterInput, setFilterInput]     = useState('all'); // all | yes | no

  const [importBusy, setImportBusy]     = useState(false);
  const [importHistory, setImportHistory] = useState([]);
  const [showHistory, setShowHistory]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    expenseItemsApi.getSentForPayment()
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const loadHistory = useCallback(() => {
    gstImportApi.history().then(r => setImportHistory(r.data?.data || [])).catch(() => setImportHistory([]));
  }, []);

  useEffect(() => { load(); loadHistory(); }, [load, loadHistory]);

  async function handleImport(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setImportBusy(true);
    try {
      const r = await gstImportApi.upload(file, userName);
      alert(r.data?.message || 'Import complete');
      load();
      loadHistory();
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || 'Import failed');
    } finally {
      setImportBusy(false);
    }
  }

  const currentMonthKey = monthKeyOf(new Date());

  // Only OH-approved entries land here — same scope as the TDS tab.
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
      if (filterInput !== 'all' && !!it.gstInputStatus !== (filterInput === 'yes')) return false;
      return true;
    });
  }, [ohApproved, filterMonth, filterProject, filterParty, filterInput]);

  const totalGstAmt = useMemo(() => filtered.reduce((sum, it) => sum + gstAmtOf(it), 0), [filtered]);

  async function handleFilingChange(item, patch) {
    const gstInvoiceNo = patch.gstInvoiceNo !== undefined ? patch.gstInvoiceNo : (item.gstInvoiceNo || '');
    const gstInputStatus = patch.gstInputStatus !== undefined ? patch.gstInputStatus : !!item.gstInputStatus;
    const gstInputDate = patch.gstInputDate !== undefined ? patch.gstInputDate : (item.gstInputDate || null);
    const gstPaidToVendorDate = patch.gstPaidToVendorDate !== undefined ? patch.gstPaidToVendorDate : (item.gstPaidToVendorDate || null);
    const gstPaidStatus = patch.gstPaidStatus !== undefined ? patch.gstPaidStatus : !!item.gstPaidStatus;
    const gstRemarks = patch.gstRemarks !== undefined ? patch.gstRemarks : (item.gstRemarks || '');
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      await expenseItemsApi.setGstFiling(item.id, gstInvoiceNo || null, gstInputStatus, gstInputDate || null, gstPaidToVendorDate || null, gstPaidStatus, gstRemarks || null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not save GST filing details');
    } finally {
      setBusy(p => { const c = { ...p }; delete c[item.id]; return c; });
    }
  }

  const inputStyle = { padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 11, fontFamily: 'inherit', background: '#fff' };

  return (
    <div className="pay-dash">
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9)', borderRadius: 12, padding: '18px 22px', marginBottom: isAdmin ? 12 : 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Percent size={24} color="white" />
        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>GST</div>
          <div style={{ color: '#e0f2fe', fontSize: 13.5, marginTop: 2 }}>
            GST % from the originating PO/WO/JO doc, GST Amt on the amount sent for payment, plus input &amp; payment filing status
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: importBusy ? 'default' : 'pointer', opacity: importBusy ? 0.6 : 1 }}>
              <Upload size={14} />
              {importBusy ? 'Importing…' : 'Import GSTR-2B'}
              <input type="file" accept=".xlsx" disabled={importBusy} onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <button onClick={() => setShowHistory(s => !s)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <History size={14} /> History{importHistory.length > 0 ? ` (${importHistory.length})` : ''}
            </button>
          </div>
        )}
      </div>

      {/* Import history */}
      {isAdmin && showHistory && (
        <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13.5, color: '#374151', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            GSTR-2B Import History
          </div>
          {importHistory.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No imports yet.</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Uploaded By</th>
                    <th>Uploaded At</th>
                    <th style={{ textAlign: 'right' }}>Rows Read</th>
                    <th style={{ textAlign: 'right' }}>Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {importHistory.map(h => (
                    <tr key={h.id}>
                      <td style={{ fontSize: 12.5 }}>
                        <a href={`${BASE_URL}${h.downloadUrl}`} target="_blank" rel="noreferrer" style={{ color: '#0369a1' }}>{h.originalFilename}</a>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{h.uploadedBy || '—'}</td>
                      <td style={{ fontSize: 12.5, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(h.uploadedAt)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12.5 }}>{h.rowsRead}</td>
                      <td style={{ textAlign: 'right', fontSize: 12.5, color: '#15803d', fontWeight: 700 }}>{h.rowsMatched}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
        <select value={filterInput} onChange={e => setFilterInput(e.target.value)} style={inputStyle}>
          <option value="all">GST Input Status: All</option>
          <option value="yes">GST Input Status: Yes</option>
          <option value="no">GST Input Status: No</option>
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
                  <th title="Fetched from the originating PO/WO/JO doc">GST %</th>
                  <th style={{ textAlign: 'right' }} title="Amount Sent × GST %">GST Amt</th>
                  <th>GST Input Status</th>
                  <th>GST Input Date</th>
                  <th>GST Paid to Vendor Date</th>
                  <th>GST Paid Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => {
                  const isBusy = !!busy[it.id];
                  const gstAmt = gstAmtOf(it);
                  // Not yet confirmed in an excel import, and the payment wasn't sent this month —
                  // flag it red since the GSTR-2B window for it has likely already passed.
                  const isUnreconciled = !it.gstInputStatus && monthKeyOf(it.sentAt) !== currentMonthKey;
                  return (
                    <tr key={it.id}>
                      <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(it.sentAt)}</td>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>{it.projectName}</td>
                      <td style={{ fontSize: 13 }}>{it.partyName || '—'}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{it.refNo || '—'}</td>

                      {/* Invoice No. — independent of the TDS tab's own Invoice No. */}
                      <td>
                        {isAdmin ? (
                          <input type="text" disabled={isBusy} defaultValue={it.gstInvoiceNo || ''}
                            placeholder="Invoice #"
                            onBlur={e => {
                              const v = e.target.value.trim();
                              if (v !== (it.gstInvoiceNo || '')) handleFilingChange(it, { gstInvoiceNo: v });
                            }}
                            style={{ ...inputStyle, width: 100 }} />
                        ) : (
                          <span style={{ fontSize: 12 }}>{it.gstInvoiceNo || '—'}</span>
                        )}
                      </td>

                      {/* GST % — read-only, fetched from PO/WO/JO */}
                      <td style={{ fontSize: 12 }}>{it.gstPercent != null ? `${Number(it.gstPercent)}%` : '—'}</td>
                      {/* GST Amt — read-only, fetched from PO/WO/JO */}
                      <td style={{ textAlign: 'right', fontSize: 12, color: '#0369a1' }}>{gstAmt ? fmt(gstAmt) : '—'}</td>

                      {/* GST Input Status — red when still unfiled and the payment is from a past month */}
                      <td>
                        {isAdmin ? (
                          <select disabled={isBusy}
                            value={it.gstInputStatus ? 'yes' : 'no'}
                            onChange={e => handleFilingChange(it, { gstInputStatus: e.target.value === 'yes' })}
                            style={isUnreconciled
                              ? { ...inputStyle, background: '#fee2e2', borderColor: '#dc2626', color: '#dc2626', fontWeight: 700 }
                              : inputStyle}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        ) : (
                          <span style={isUnreconciled
                            ? { fontSize: 12, color: '#dc2626', fontWeight: 700 }
                            : { fontSize: 12 }}>
                            {it.gstInputStatus ? 'Yes' : 'No'}
                          </span>
                        )}
                      </td>

                      {/* GST Input Date */}
                      <td>
                        {isAdmin ? (
                          <input type="date" disabled={isBusy} defaultValue={toDateInputValue(it.gstInputDate)}
                            onChange={e => handleFilingChange(it, { gstInputDate: e.target.value || null })}
                            style={{ ...inputStyle, width: 130 }} />
                        ) : (
                          <span style={{ fontSize: 12 }}>{fmtDate(it.gstInputDate)}</span>
                        )}
                      </td>

                      {/* GST Paid to Vendor Date */}
                      <td>
                        {isAdmin ? (
                          <input type="date" disabled={isBusy} defaultValue={toDateInputValue(it.gstPaidToVendorDate)}
                            onChange={e => handleFilingChange(it, { gstPaidToVendorDate: e.target.value || null })}
                            style={{ ...inputStyle, width: 130 }} />
                        ) : (
                          <span style={{ fontSize: 12 }}>{fmtDate(it.gstPaidToVendorDate)}</span>
                        )}
                      </td>

                      {/* GST Paid Status */}
                      <td>
                        {isAdmin ? (
                          <select style={inputStyle} disabled={isBusy}
                            value={it.gstPaidStatus ? 'yes' : 'no'}
                            onChange={e => handleFilingChange(it, { gstPaidStatus: e.target.value === 'yes' })}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{it.gstPaidStatus ? 'Yes' : 'No'}</span>
                        )}
                      </td>

                      {/* Remarks — independent of the TDS tab's own Remarks */}
                      <td>
                        {isAdmin ? (
                          <input type="text" disabled={isBusy} defaultValue={it.gstRemarks || ''}
                            placeholder="Remarks"
                            onBlur={e => {
                              const v = e.target.value.trim();
                              if (v !== (it.gstRemarks || '')) handleFilingChange(it, { gstRemarks: v });
                            }}
                            style={{ ...inputStyle, width: 160 }} />
                        ) : (
                          <span style={{ fontSize: 12, color: '#475569' }}>{it.gstRemarks || '—'}</span>
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
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Total GST Amt</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#0369a1' }}>{fmt(totalGstAmt)}</span>
          </div>
        </>
      )}
    </div>
  );
}
