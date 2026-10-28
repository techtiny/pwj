import { useEffect, useState, useCallback, useMemo } from "react";
import { leaveApi, fmtDate, fmtDateTime, leaveTypeLabel } from "./hrApi";

const STATUS_CFG = {
  PENDING:   { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED:  { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  REJECTED:  { bg: "#fef2f2", color: "#dc2626", label: "Rejected" },
  CANCELLED: { bg: "#f8fafc", color: "#374151", label: "Cancelled" },
};

export default function LeaveApprovalPage({ user }) {
  const [pending, setPending]       = useState([]);
  const [all, setAll]               = useState([]);
  const [tab, setTab]               = useState("pending");
  const [filterCategory, setFilterCategory] = useState("all"); // all | leaves | permissions
  const [commentMap, setCommentMap] = useState({});
  const [processing, setProcessing] = useState(null);

  const [filterName, setFilterName]     = useState("");
  const [filterType, setFilterType]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom]     = useState("");
  const [filterTo, setFilterTo]         = useState("");

  const load = useCallback(async () => {
    const [pRes, aRes] = await Promise.all([
      leaveApi.pending().catch(() => ({ data: { data: [] } })),
      leaveApi.all().catch(() => ({ data: { data: [] } })),
    ]);
    setPending(pRes.data?.data || []);
    setAll(aRes.data?.data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id, action) => {
    setProcessing(id + action);
    try {
      const body = { approvedBy: user?.fullName || user?.username, comment: commentMap[id] || "" };
      const r = action === "approve"
        ? await leaveApi.approve(id, body)
        : await leaveApi.reject(id, body);
      if (r.data?.success) {
        setCommentMap(m => { const c = { ...m }; delete c[id]; return c; });
        await load();
      } else alert(r.data?.message || "Failed");
    } catch (e) { alert(e.response?.data?.message || "Error"); }
    finally { setProcessing(null); }
  };

  const badge  = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" });
  const card   = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" };

  const employeeOptions = useMemo(() => {
    const names = new Set(all.map(l => l.fullName || l.username).filter(Boolean));
    return [...names].sort();
  }, [all]);

  const typeOptions = useMemo(() => {
    const types = new Set(all.map(l => l.leaveType).filter(Boolean));
    return [...types].sort();
  }, [all]);

  const countOf = (st) => all.filter(l => l.status === st).length;
  const counts = { pending: pending.length, approved: countOf("APPROVED"), rejected: countOf("REJECTED"), all: all.length };

  const filteredAll = useMemo(() => {
    return all.filter(l => {
      if (tab === "approved" && l.status !== "APPROVED") return false;
      if (tab === "rejected" && l.status !== "REJECTED") return false;
      if (filterName && (l.fullName || l.username) !== filterName) return false;
      if (filterType && l.leaveType !== filterType) return false;
      if (filterStatus && l.status !== filterStatus) return false;
      const day = l.fromDate ? String(l.fromDate).substring(0, 10) : "";
      if (filterFrom && day < filterFrom) return false;
      if (filterTo && day > filterTo) return false;
      return true;
    });
  }, [all, tab, filterName, filterType, filterStatus, filterFrom, filterTo]);

  const hasFilters = filterName || filterType || filterStatus || filterFrom || filterTo;
  const clearFilters = () => { setFilterName(""); setFilterType(""); setFilterStatus(""); setFilterFrom(""); setFilterTo(""); };

  const applyCategory = (arr) =>
    filterCategory === "permissions" ? arr.filter(l => l.leaveType === "PERMISSION") :
    filterCategory === "leaves"      ? arr.filter(l => l.leaveType !== "PERMISSION") : arr;

  const pendingFiltered = applyCategory(pending);
  const list = tab === "pending" ? pendingFiltered : applyCategory(filteredAll);

  const FILTER_INP = {
    border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
    fontSize: 14, fontFamily: "inherit", outline: "none", color: "#0f172a", background: "#fff",
  };
  const FILTER_LBL = { fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4, display: "block" };

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Page title */}
      <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>Leave &amp; Permission Approvals</div>
      <div style={{ fontSize: 14, color: "#64748b", marginBottom: 18 }}>Review requests and see what has been approved or not approved.</div>

      {/* Summary tiles — click to switch view */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { key: "pending",  label: "Pending",      n: counts.pending,  color: "#d97706", sub: `${pending.filter(l => l.leaveType === "PERMISSION").length} permission(s)` },
          { key: "approved", label: "Approved",     n: counts.approved, color: "#059669", sub: "Granted" },
          { key: "rejected", label: "Not Approved", n: counts.rejected, color: "#dc2626", sub: "Rejected" },
          { key: "all",      label: "All Requests", n: counts.all,      color: "#1e3a5f", sub: "Everything" },
        ].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={active}
              style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: "#fff", borderRadius: 12, padding: "14px 16px",
                border: `1.5px solid ${active ? t.color : "#e2e8f0"}`, boxShadow: active ? `0 0 0 3px ${t.color}1f` : "0 1px 2px rgba(15,23,42,.04)", borderTop: `3px solid ${t.color}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b" }}>{t.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: t.color, lineHeight: 1.1, marginTop: 4 }}>{t.n}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{t.sub}</div>
            </button>
          );
        })}
      </div>

      {/* One control bar: status view on the left, request type on the right */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "8px 10px", marginBottom: 16 }}>
        <div role="tablist" aria-label="Request status" style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 9, padding: 3, flexWrap: "wrap" }}>
          {[
            { key: "pending",  label: "Pending" },
            { key: "approved", label: "Approved" },
            { key: "rejected", label: "Not Approved" },
            { key: "all",      label: "All" },
          ].map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} role="tab" aria-selected={active} onClick={() => setTab(t.key)}
                style={{ border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 14, fontWeight: active ? 700 : 600, fontFamily: "inherit", cursor: "pointer",
                  background: active ? "#1e3a5f" : "transparent", color: active ? "#fff" : "#475569", display: "inline-flex", alignItems: "center", gap: 7 }}>
                {t.label}
                <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 99, padding: "1px 7px", background: active ? "rgba(255,255,255,.2)" : "#e2e8f0", color: active ? "#fff" : "#475569" }}>{counts[t.key]}</span>
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Request type" style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 9, padding: 3 }}>
          {[
            { key: "all",         label: "All types" },
            { key: "leaves",      label: "Leaves" },
            { key: "permissions", label: "Permissions" },
          ].map(c => {
            const active = filterCategory === c.key;
            return (
              <button key={c.key} onClick={() => setFilterCategory(c.key)} aria-pressed={active}
                style={{ border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 14, fontWeight: active ? 700 : 600, fontFamily: "inherit", cursor: "pointer",
                  background: active ? "#fff" : "transparent", color: active ? "#7c3aed" : "#475569", boxShadow: active ? "0 1px 2px rgba(15,23,42,.12)" : "none" }}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar — every view except Pending */}
      {tab !== "pending" && (
        <div className="hr-filter-bar" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={FILTER_LBL}>Employee</label>
            <select style={{ ...FILTER_INP, minWidth: 160 }} value={filterName} onChange={e => setFilterName(e.target.value)}>
              <option value="">All Employees</option>
              {employeeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={FILTER_LBL}>Leave Type</label>
            <select style={{ ...FILTER_INP, minWidth: 150 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {typeOptions.map(t => <option key={t} value={t}>{leaveTypeLabel(t)}</option>)}
            </select>
          </div>
          {tab === "all" && (
            <div>
              <label style={FILTER_LBL}>Status</label>
              <select style={{ ...FILTER_INP, minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {Object.entries(STATUS_CFG).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={FILTER_LBL}>From</label>
            <input type="date" style={FILTER_INP} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label style={FILTER_LBL}>To</label>
            <input type="date" style={FILTER_INP} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters}
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Clear Filters
            </button>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ ...card, padding: 60, textAlign: "center", color: "#374151", fontSize: 15 }}>
          {tab === "pending" ? "No pending leave approvals"
            : hasFilters ? "No leave requests match the selected filters."
            : tab === "approved" ? "No approved requests yet" : tab === "rejected" ? "No requests have been rejected" : "No leave requests found"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {list.map(l => {
            const s = STATUS_CFG[l.status] || STATUS_CFG.PENDING;
            const isProcessing = processing === l.id + "approve" || processing === l.id + "reject";
            const initials = (l.fullName || l.username || "?").charAt(0).toUpperCase();
            return (
              <div key={l.id} className="hr-approval-card" style={{ ...card, padding: "20px 24px" }}>
                <div className="hr-approval-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>

                  {/* Employee info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: "#1e3a5f",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
                      }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{l.fullName || l.username}</div>
                        <div style={{ fontSize: 13, color: "#374151" }}>Applied: {fmtDate(l.createdAt)}</div>
                      </div>
                      <span style={badge(s)}>{s.label}</span>
                    </div>

                    <div className="hr-leave-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,auto)", gap: "6px 24px", marginBottom: 12, fontSize: 14 }}>
                      <div><span style={{ color: "#374151" }}>Type: </span><strong style={{ color: l.leaveType === "PERMISSION" ? "#7c3aed" : "#0f172a" }}>{leaveTypeLabel(l.leaveType)}</strong></div>
                      <div><span style={{ color: "#374151" }}>Date: </span><strong style={{ color: "#0f172a" }}>{fmtDate(l.fromDate)}</strong></div>
                      {l.leaveType === "PERMISSION" ? (
                        <>
                          <div><span style={{ color: "#374151" }}>Hours: </span><strong style={{ color: "#7c3aed" }}>{l.permissionHours || "—"}h</strong></div>
                          {l.fromTime && l.toTime && (
                            <div><span style={{ color: "#374151" }}>Away: </span><strong style={{ color: "#0f172a" }}>{l.fromTime} – {l.toTime}</strong></div>
                          )}
                        </>
                      ) : (
                        <>
                          <div><span style={{ color: "#374151" }}>To: </span><strong style={{ color: "#0f172a" }}>{fmtDate(l.toDate)}</strong></div>
                          <div><span style={{ color: "#374151" }}>Days: </span><strong style={{ color: "#0f172a" }}>{l.totalDays}</strong></div>
                        </>
                      )}
                    </div>

                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#1e293b", marginBottom: l.status === "PENDING" ? 10 : 0, border: "1px solid #f1f5f9" }}>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>Reason: </span>{l.reason}
                    </div>

                    {(l.approvalComment || l.approvedAt) && (
                      <div style={{ background: s.bg, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: s.color, marginTop: 8 }}>
                        {l.approvalComment && <div><strong>Comment: </strong>{l.approvalComment}</div>}
                        <div style={{ fontSize: 13, marginTop: l.approvalComment ? 4 : 0, opacity: 0.85 }}>
                          {l.status === "APPROVED" ? "✓ Approved" : l.status === "REJECTED" ? "✕ Rejected" : "Updated"}
                          {l.approvedBy && <span> by {l.approvedBy}</span>}
                          {l.approvedAt && <span> · {fmtDateTime(l.approvedAt)}</span>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action area */}
                  {l.status === "PENDING" && (
                    <div className="hr-approval-action" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
                      <textarea
                        value={commentMap[l.id] || ""}
                        onChange={e => setCommentMap(m => ({ ...m, [l.id]: e.target.value }))}
                        placeholder="Add comment (optional)…"
                        rows={2}
                        style={{
                          border: "1.5px solid #e2e8f0", borderRadius: 8,
                          padding: "8px 10px", fontSize: 14,
                          fontFamily: "inherit", outline: "none", resize: "none",
                          color: "#374151",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleAction(l.id, "approve")} disabled={isProcessing}
                          style={{ flex: 1, border: "none", borderRadius: 8, padding: "10px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: isProcessing ? 0.6 : 1 }}>
                          {processing === l.id + "approve" ? "…" : "Approve"}
                        </button>
                        <button onClick={() => handleAction(l.id, "reject")} disabled={isProcessing}
                          style={{ flex: 1, border: "none", borderRadius: 8, padding: "10px", background: "linear-gradient(135deg,#dc2626,#ef4444)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: isProcessing ? 0.6 : 1 }}>
                          {processing === l.id + "reject" ? "…" : "Reject"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
