import { useEffect, useState, useCallback } from "react";
import { leaveApi, fmtDate } from "./hrApi";

const STATUS_CFG = {
  PENDING:   { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED:  { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  REJECTED:  { bg: "#fef2f2", color: "#dc2626", label: "Rejected" },
  CANCELLED: { bg: "#f8fafc", color: "#94a3b8", label: "Cancelled" },
};

export default function LeaveApprovalPage({ user }) {
  const [pending, setPending]       = useState([]);
  const [all, setAll]               = useState([]);
  const [tab, setTab]               = useState("pending");
  const [commentMap, setCommentMap] = useState({});
  const [processing, setProcessing] = useState(null);

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

  const badge  = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" });
  const card   = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" };
  const list   = tab === "pending" ? pending : all;

  return (
    <div style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Page title */}
      <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.3px" }}>Leave Approvals</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        {pending.length} pending approval{pending.length !== 1 ? "s" : ""}
      </div>

      {/* Tab pills — PWJ hBtn style */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "pending", label: `Pending (${pending.length})` },
          { key: "all",     label: "All Requests" },
        ].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                border: active ? "none" : "1.5px solid #e2e8f0",
                borderRadius: 8, padding: "8px 16px",
                background: active ? "#1e3a5f" : "#fff",
                color: active ? "#fff" : "#374151",
                fontWeight: active ? 600 : 500, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div style={{ ...card, padding: 60, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
          {tab === "pending" ? "No pending leave approvals" : "No leave requests found"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {list.map(l => {
            const s = STATUS_CFG[l.status] || STATUS_CFG.PENDING;
            const isProcessing = processing === l.id + "approve" || processing === l.id + "reject";
            const initials = (l.fullName || l.username || "?").charAt(0).toUpperCase();
            return (
              <div key={l.id} style={{ ...card, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>

                  {/* Employee info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: "#1e3a5f",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
                        fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
                      }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{l.fullName || l.username}</div>
                        <div style={{ fontSize: 11.5, color: "#94a3b8" }}>Applied: {fmtDate(l.createdAt)}</div>
                      </div>
                      <span style={badge(s)}>{s.label}</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,auto)", gap: "6px 24px", marginBottom: 12, fontSize: 13 }}>
                      <div><span style={{ color: "#94a3b8" }}>Type: </span><strong style={{ color: "#0f172a" }}>{l.leaveType}</strong></div>
                      <div><span style={{ color: "#94a3b8" }}>From: </span><strong style={{ color: "#0f172a" }}>{fmtDate(l.fromDate)}</strong></div>
                      <div><span style={{ color: "#94a3b8" }}>To: </span><strong style={{ color: "#0f172a" }}>{fmtDate(l.toDate)}</strong></div>
                      <div><span style={{ color: "#94a3b8" }}>Days: </span><strong style={{ color: "#0f172a" }}>{l.totalDays}</strong></div>
                    </div>

                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#475569", marginBottom: l.status === "PENDING" ? 10 : 0, border: "1px solid #f1f5f9" }}>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>Reason: </span>{l.reason}
                    </div>

                    {l.approvalComment && (
                      <div style={{ background: s.bg, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: s.color, marginTop: 8 }}>
                        <strong>Comment: </strong>{l.approvalComment}
                        {l.approvedBy && <span style={{ marginLeft: 8, opacity: 0.7 }}>— {l.approvedBy}</span>}
                      </div>
                    )}
                  </div>

                  {/* Action area */}
                  {l.status === "PENDING" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
                      <textarea
                        value={commentMap[l.id] || ""}
                        onChange={e => setCommentMap(m => ({ ...m, [l.id]: e.target.value }))}
                        placeholder="Add comment (optional)…"
                        rows={2}
                        style={{
                          border: "1.5px solid #e2e8f0", borderRadius: 8,
                          padding: "8px 10px", fontSize: 13,
                          fontFamily: "inherit", outline: "none", resize: "none",
                          color: "#374151",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleAction(l.id, "approve")} disabled={isProcessing}
                          style={{ flex: 1, border: "none", borderRadius: 8, padding: "10px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: isProcessing ? 0.6 : 1 }}>
                          {processing === l.id + "approve" ? "…" : "Approve"}
                        </button>
                        <button onClick={() => handleAction(l.id, "reject")} disabled={isProcessing}
                          style={{ flex: 1, border: "none", borderRadius: 8, padding: "10px", background: "linear-gradient(135deg,#dc2626,#ef4444)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: isProcessing ? 0.6 : 1 }}>
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
