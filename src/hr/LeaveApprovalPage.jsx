import { useEffect, useState, useCallback, useMemo } from "react";
import { leaveApi, fmtDate, fmtDateTime, leaveTypeLabel } from "./hrApi";
import { ApproveBtn, RejectBtn } from "../ActionButtons";

const STATUS_CFG = {
  PENDING:   { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED:  { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  REJECTED:  { bg: "#fef2f2", color: "var(--hz-danger)", label: "Rejected" },
  CANCELLED: { bg: "#f8fafc", color: "var(--hz-ink-2)", label: "Cancelled" },
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

  const badge  = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: "var(--hz-text-sm)", fontWeight: 600, whiteSpace: "nowrap" });
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
    fontSize: "var(--hz-text-md)", fontFamily: "inherit", outline: "none", color: "var(--hz-ink)", background: "#fff",
  };
  const FILTER_LBL = { fontSize: "var(--hz-text-sm)", fontWeight: 500, color: "var(--hz-ink-2)", marginBottom: 4, display: "block" };

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Page title */}
      <div style={{ fontSize: "var(--hz-text-2xl)", fontWeight: 800, color: "var(--hz-ink)", marginBottom: 2 }}>Leave &amp; Permission Approvals</div>
      <div style={{ fontSize: "var(--hz-text-md)", color: "var(--hz-muted)", marginBottom: 18 }}>Review requests and see what has been approved or not approved.</div>

      {/* Summary tiles — click to switch view */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { key: "pending",  label: "Pending",      n: counts.pending,  color: "#d97706", sub: `${pending.filter(l => l.leaveType === "PERMISSION").length} permission(s)` },
          { key: "approved", label: "Approved",     n: counts.approved, color: "#059669", sub: "Granted" },
          { key: "rejected", label: "Not Approved", n: counts.rejected, color: "var(--hz-danger)", sub: "Rejected" },
          { key: "all",      label: "All Requests", n: counts.all,      color: "var(--hz-primary)", sub: "Everything" },
        ].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={active}
              style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: "#fff", borderRadius: 12, padding: "14px 16px",
                border: `1.5px solid ${active ? t.color : "#e2e8f0"}`, boxShadow: active ? `0 0 0 3px ${t.color}1f` : "0 1px 2px rgba(15,23,42,.04)", borderTop: `3px solid ${t.color}` }}>
              <div style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-muted)" }}>{t.label}</div>
              <div style={{ fontSize: "var(--hz-text-3xl)", fontWeight: 800, color: t.color, lineHeight: 1.1, marginTop: 4 }}>{t.n}</div>
              <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-faint)", marginTop: 4 }}>{t.sub}</div>
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
                style={{ border: "none", borderRadius: 7, padding: "7px 14px", fontSize: "var(--hz-text-md)", fontWeight: active ? 700 : 600, fontFamily: "inherit", cursor: "pointer",
                  background: active ? "#1e3a5f" : "transparent", color: active ? "var(--hz-on-dark)" : "var(--hz-ink-2)", display: "inline-flex", alignItems: "center", gap: 7 }}>
                {t.label}
                <span style={{ fontSize: "var(--hz-text-xs)", fontWeight: 700, borderRadius: 99, padding: "1px 7px", background: active ? "rgba(255,255,255,.2)" : "#e2e8f0", color: active ? "var(--hz-on-dark)" : "var(--hz-ink-2)" }}>{counts[t.key]}</span>
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
                style={{ border: "none", borderRadius: 7, padding: "7px 14px", fontSize: "var(--hz-text-md)", fontWeight: active ? 700 : 600, fontFamily: "inherit", cursor: "pointer",
                  background: active ? "#fff" : "transparent", color: active ? "#7c3aed" : "var(--hz-ink-2)", boxShadow: active ? "0 1px 2px rgba(15,23,42,.12)" : "none" }}>
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
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", color: "var(--hz-ink-2)", fontWeight: 600, fontSize: "var(--hz-text-sm)", cursor: "pointer", fontFamily: "inherit" }}>
              Clear Filters
            </button>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ ...card, padding: 60, textAlign: "center", color: "var(--hz-ink-2)", fontSize: "var(--hz-text-md)" }}>
          {tab === "pending" ? "No pending leave approvals"
            : hasFilters ? "No leave requests match the selected filters."
            : tab === "approved" ? "No approved requests yet" : tab === "rejected" ? "No requests have been rejected" : "No leave requests found"}
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="hr-approval-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Employee", "Applied", "Type", "From", "To / Time", "Days / Hrs", "Reason", "Status", tab === "pending" ? "Comment" : "Decision", tab === "pending" ? "Action" : ""].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "12px 14px", fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-ink-2)", textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(l => {
                  const s = STATUS_CFG[l.status] || STATUS_CFG.PENDING;
                  const isProcessing = processing === l.id + "approve" || processing === l.id + "reject";
                  const isPerm = l.leaveType === "PERMISSION";
                  const td = { padding: "12px 14px", fontSize: "var(--hz-text-md)", color: "var(--hz-ink)", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
                  return (
                    <tr key={l.id}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--hz-on-dark)", fontWeight: 700, fontSize: "var(--hz-text-md)", flexShrink: 0 }}>
                            {(l.fullName || l.username || "?").charAt(0).toUpperCase()}
                          </div>
                          <strong>{l.fullName || l.username}</strong>
                        </div>
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: "var(--hz-ink-2)" }}>{fmtDate(l.createdAt)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700, color: isPerm ? "#7c3aed" : "var(--hz-ink)" }}>{leaveTypeLabel(l.leaveType)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(l.fromDate)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{isPerm ? (l.fromTime && l.toTime ? `${l.fromTime} – ${l.toTime}` : "—") : fmtDate(l.toDate)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700, color: isPerm ? "#7c3aed" : "var(--hz-ink)" }}>{isPerm ? `${l.permissionHours || "—"} h` : l.totalDays}</td>
                      <td style={{ ...td, minWidth: 220, maxWidth: 340, color: "var(--hz-ink-2)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.reason}</td>
                      <td style={td}><span style={badge(s)}>{s.label}</span></td>
                      {tab === "pending" ? (
                        <>
                          <td style={{ ...td, minWidth: 190 }}>
                            {l.status === "PENDING" && (
                              <input value={commentMap[l.id] || ""} onChange={e => setCommentMap(m => ({ ...m, [l.id]: e.target.value }))} placeholder="Comment (optional)"
                                style={{ width: "100%", boxSizing: "border-box", height: 36, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "0 10px", fontSize: "var(--hz-text-sm)", fontFamily: "inherit", outline: "none", color: "var(--hz-ink-2)" }} />
                            )}
                          </td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            {l.status === "PENDING" && (
                              <div style={{ display: "flex", gap: 8 }}>
                                <ApproveBtn onClick={() => handleAction(l.id, "approve")} disabled={isProcessing} title="Approve" size="md" />
                                <RejectBtn onClick={() => handleAction(l.id, "reject")} disabled={isProcessing} title="Reject" size="md" />
                              </div>
                            )}
                          </td>
                        </>
                      ) : (
                        <td style={{ ...td, minWidth: 200, fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)" }}>
                          {l.approvalComment && <div style={{ color: s.color, fontWeight: 600, marginBottom: 2 }}>{l.approvalComment}</div>}
                          {(l.approvedBy || l.approvedAt) ? <div>{l.approvedBy ? `by ${l.approvedBy}` : ""}{l.approvedAt ? ` · ${fmtDateTime(l.approvedAt)}` : ""}</div> : (!l.approvalComment && "—")}
                        </td>
                      )}
                      {tab !== "pending" && <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {l.status === "PENDING" && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <ApproveBtn onClick={() => handleAction(l.id, "approve")} disabled={isProcessing} title="Approve" size="md" />
                            <RejectBtn onClick={() => handleAction(l.id, "reject")} disabled={isProcessing} title="Reject" size="md" />
                          </div>
                        )}
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
