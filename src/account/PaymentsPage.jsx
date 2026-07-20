import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Send } from 'lucide-react';
import { expenseItemsApi } from './accountApi';

const CATEGORY_LABELS = {
  MATERIAL:      { label: 'Material',      color: '#10b981', bg: '#d1fae5' },
  LABOUR:        { label: 'Labour',        color: '#3b82f6', bg: '#dbeafe' },
  SUBCONTRACT:   { label: 'Sub-Contract',  color: '#8b5cf6', bg: '#ede9fe' },
  CONSULTANTS:   { label: 'Consultants',   color: '#f59e0b', bg: '#fef3c7' },
  MISCELLANEOUS: { label: 'Miscellaneous', color: '#64748b', bg: '#f1f5f9' },
};

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

export default function PaymentsPage({ isOH = false, isVP = false }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [ohEdits, setOhEdits] = useState({}); // id -> revised amount string
  const [busy, setBusy]       = useState({});  // id -> true while an approval call is in flight

  const [filterProject, setFilterProject] = useState('');
  const [filterParty, setFilterParty]     = useState('');
  const [timeline, setTimeline]           = useState('all');
  const [customFrom, setCustomFrom]       = useState(todayStr());
  const [customTo, setCustomTo]           = useState(todayStr());

  const load = useCallback(() => {
    setLoading(true);
    expenseItemsApi.getSentForPayment()
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleOhDecision(item, status) {
    setBusy(p => ({ ...p, [item.id]: true }));
    try {
      const raw = ohEdits[item.id];
      const revisedAmount = raw !== undefined && raw !== '' && Number(raw) !== Number(item.sentAmount)
        ? Number(raw) : undefined;
      await expenseItemsApi.setOhApproval(item.id, status, revisedAmount);
      setOhEdits(p => { const c = { ...p }; delete c[item.id]; return c; });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'OH approval failed');
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

  return (
    <div>
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Send size={22} color="white" />
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>Send for Payment Tracker</div>
          <div style={{ color: '#bfdbfe', fontSize: 12, marginTop: 2 }}>
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
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Payment History</div>
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
                  <th>Category</th>
                  <th>Description</th>
                  <th>Party</th>
                  <th>Ref No</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount Sent</th>
                  <th style={{ textAlign: 'right' }}>Due Amount</th>
                  <th>Sent At</th>
                  <th>OH Approval</th>
                  <th>VP Approval</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => {
                  const cat = CATEGORY_LABELS[it.category] || CATEGORY_LABELS.MISCELLANEOUS;
                  const status = PAYMENT_STATUS_CFG[it.paymentStatus] || PAYMENT_STATUS_CFG.PART_PAYMENT_SENT;
                  const isBusy = !!busy[it.id];
                  const ohPending = (it.ohApprovalStatus || 'PENDING') === 'PENDING';
                  const vpEligible = it.ohApprovalStatus === 'APPROVED' && (it.vpApprovalStatus || 'PENDING') === 'PENDING';
                  const btn = (bg) => ({ border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 10.5, fontWeight: 700, color: '#fff', background: bg, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1 });
                  return (
                    <tr key={it.id}>
                      <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontSize: 13, fontWeight: 600 }}>{it.projectName}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 100, background: cat.bg, color: cat.color, fontSize: 10, fontWeight: 700 }}>
                          {cat.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{it.description || '—'}</td>
                      <td style={{ fontSize: 13 }}>{it.partyName || '—'}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{it.refNo || '—'}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 100, background: status.bg, color: status.color, fontSize: 10, fontWeight: 700 }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#2563eb', fontSize: 14 }}>{fmt(it.sentAmount)}</td>
                      <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{fmt(Number(it.pwjTotalPayable || 0) - Number(it.sentAmount || 0))}</td>
                      <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDateTime(it.sentAt)}</td>

                      {/* OH Approval */}
                      <td style={{ minWidth: 150 }}>
                        {isOH && ohPending ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input type="number" placeholder="Amount"
                              value={ohEdits[it.id] !== undefined ? ohEdits[it.id] : it.sentAmount}
                              onChange={e => setOhEdits(p => ({ ...p, [it.id]: e.target.value }))}
                              style={{ width: 90, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 11 }} />
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button disabled={isBusy} onClick={() => handleOhDecision(it, 'APPROVED')} style={btn('#15803d')}>Approve</button>
                              <button disabled={isBusy} onClick={() => handleOhDecision(it, 'REJECTED')} style={btn('#dc2626')}>Reject</button>
                            </div>
                          </div>
                        ) : (
                          <ApprovalBadge status={it.ohApprovalStatus} />
                        )}
                      </td>

                      {/* VP Approval */}
                      <td style={{ minWidth: 130 }}>
                        {isVP && vpEligible ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button disabled={isBusy} onClick={() => handleVpDecision(it, 'APPROVED')} style={btn('#15803d')}>Approve</button>
                            <button disabled={isBusy} onClick={() => handleVpDecision(it, 'REJECTED')} style={btn('#dc2626')}>Reject</button>
                          </div>
                        ) : it.ohApprovalStatus === 'APPROVED' ? (
                          <ApprovalBadge status={it.vpApprovalStatus} />
                        ) : (
                          <span style={{ fontSize: 10.5, color: '#cbd5e1', fontStyle: 'italic' }}>Awaiting OH</span>
                        )}
                      </td>
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
