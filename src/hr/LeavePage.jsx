import { useEffect, useState, useCallback } from "react";
import { leaveApi, uploadDocument, attachmentFullUrl, fmtDate } from "./hrApi";

const LEAVE_TYPES = ["CASUAL", "SICK", "EARNED", "COMP_OFF", "OTHER"];

const STATUS_CFG = {
  PENDING:   { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED:  { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  REJECTED:  { bg: "#fef2f2", color: "#dc2626", label: "Rejected" },
  CANCELLED: { bg: "#f8fafc", color: "#94a3b8", label: "Cancelled" },
};

const EMPTY = { leaveType: "CASUAL", fromDate: "", toDate: "", reason: "" };

export default function LeavePage({ user }) {
  const [leaves, setLeaves]     = useState([]);
  const [summary, setSummary]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [file, setFile]         = useState(null);

  const username = user?.username;

  const load = useCallback(async () => {
    if (!username) return;
    const [lRes, sRes] = await Promise.all([
      leaveApi.myLeaves(username).catch(() => ({ data: { data: [] } })),
      leaveApi.summary(username).catch(() => ({ data: { data: {} } })),
    ]);
    setLeaves(lRes.data?.data || []);
    setSummary(sRes.data?.data);
  }, [username]);

  useEffect(() => { load(); }, [load]);

  const totalDays = () => {
    if (!form.fromDate || !form.toDate) return 0;
    const diff = (new Date(form.toDate) - new Date(form.fromDate)) / 86400000;
    return diff < 0 ? 0 : diff + 1;
  };

  const validate = () => {
    const e = {};
    if (!form.fromDate) e.fromDate = "Required";
    if (!form.toDate)   e.toDate   = "Required";
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) e.toDate = "Must be after from date";
    if (!form.reason.trim()) e.reason = "Please provide a reason";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      let attachmentUrl = null;
      if (file) {
        attachmentUrl = await uploadDocument(file);
      }
      const r = await leaveApi.apply({ ...form, username, attachmentUrl });
      if (r.data?.success) { await load(); setShowForm(false); setForm(EMPTY); setFile(null); }
      else alert(r.data?.message || "Failed");
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setSaving(false); }
  };

  const handleFormClose = () => { setShowForm(false); setFile(null); };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this leave request?")) return;
    const r = await leaveApi.cancel(id, { username });
    if (r.data?.success) load();
  };

  // PWJ design tokens
  const INP = (err) => ({
    border: `1.5px solid ${err ? "#ef4444" : "#e2e8f0"}`, borderRadius: 8,
    padding: "10px 13px", fontSize: 14, fontFamily: "inherit",
    outline: "none", width: "100%", boxSizing: "border-box", color: "#0f172a",
  });
  const LBL = { fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" };
  const TH  = {
    background: "#f8fafc", padding: "12px 14px", textAlign: "left",
    fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
    fontWeight: 600, fontSize: 11.5, color: "#64748b",
    textTransform: "uppercase", letterSpacing: 0.5,
    borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
  };
  const TD = (extra = {}) => ({
    padding: "12px 14px", color: "#374151",
    borderBottom: "1px solid #f1f5f9", fontSize: 14,
    verticalAlign: "middle", ...extra,
  });
  const statCard = (accent) => ({
    background: "#fff", borderRadius: 12, padding: "18px 22px",
    flex: 1, border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`,
  });
  const badge = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 12.5, fontWeight: 600 });

  return (
    <div style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Summary stats — PWJ statCard style */}
      {summary && (
        <div style={{ display: "flex", gap: 14, marginBottom: 24, maxWidth: 520 }}>
          {[
            { label: "Pending",  value: summary.pending,  accent: "#d97706" },
            { label: "Approved", value: summary.approved, accent: "#059669" },
            { label: "Rejected", value: summary.rejected, accent: "#dc2626" },
          ].map(k => (
            <div key={k.label} style={statCard(k.accent)}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{k.label}</div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>My Leave Requests</div>
        <button onClick={() => { setShowForm(true); setForm(EMPTY); setErrors({}); }}
          style={{ border: "none", borderRadius: 8, padding: "9px 18px", background: "#1e3a5f", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
          + Apply Leave
        </button>
      </div>

      {/* Apply leave form */}
      {showForm && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "22px 26px", marginBottom: 24, maxWidth: 560 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 18 }}>New Leave Application</div>
          <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
            <div>
              <label style={LBL}>Leave Type</label>
              <select style={INP()} value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))}>
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase().replace("_", " ")}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "10px 16px", width: "100%", textAlign: "center", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>Total Days</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 26, fontWeight: 700, color: "#0f172a" }}>{totalDays()}</div>
              </div>
            </div>
            <div>
              <label style={LBL}>From Date *</label>
              <input style={INP(errors.fromDate)} type="date" value={form.fromDate} onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))} />
              {errors.fromDate && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.fromDate}</div>}
            </div>
            <div>
              <label style={LBL}>To Date *</label>
              <input style={INP(errors.toDate)} type="date" value={form.toDate} onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))} />
              {errors.toDate && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.toDate}</div>}
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Reason *</label>
              <textarea
                style={{ ...INP(errors.reason), resize: "vertical", minHeight: 78 }}
                rows={3} value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Please describe the reason for your leave…"
              />
              {errors.reason && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.reason}</div>}
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Attachment <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional — image or PDF, max 20MB)</span></label>
              <label style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                border: "1.5px dashed #cbd5e1", borderRadius: 8, padding: "10px 14px",
                background: file ? "#f0fdf4" : "#f8fafc", color: file ? "#059669" : "#94a3b8",
                fontSize: 13, fontWeight: 500,
              }}>
                <span style={{ fontSize: 18 }}>📎</span>
                <span>{file ? file.name : "Click to attach a file"}</span>
                <input type="file" accept="image/*,application/pdf,.doc,.docx"
                  style={{ display: "none" }}
                  onChange={e => setFile(e.target.files[0] || null)} />
                {file && (
                  <button type="button" onClick={e => { e.preventDefault(); setFile(null); }}
                    style={{ marginLeft: "auto", background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
                )}
              </label>
            </div>

            <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving}
                style={{ flex: 1, border: "none", borderRadius: 9, padding: "12px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                {saving ? (file ? "Uploading…" : "Submitting…") : "Submit Application"}
              </button>
              <button type="button" onClick={handleFormClose}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "12px 22px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Leave history table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {leaves.length === 0 ? (
          <div style={{ padding: 52, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
            No leave requests yet. Click "Apply Leave" to get started.
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table className="leave-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {["Type","From","To","Days","Reason","Status","Approved By","Attachment","Action"].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => {
                  const s = STATUS_CFG[l.status] || STATUS_CFG.PENDING;
                  return (
                    <tr key={l.id}>
                      <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{l.leaveType}</td>
                      <td style={TD()}>{fmtDate(l.fromDate)}</td>
                      <td style={TD()}>{fmtDate(l.toDate)}</td>
                      <td style={TD({ fontWeight: 700, textAlign: "center" })}>{l.totalDays}</td>
                      <td style={TD({ color: "#475569", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={l.reason}>{l.reason}</td>
                      <td style={TD()}>
                        <span style={badge(s)}>{s.label}</span>
                        {l.approvalComment && <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>{l.approvalComment}</div>}
                      </td>
                      <td style={TD({ color: "#64748b" })}>{l.approvedBy || "—"}</td>
                      <td style={TD()}>
                        {l.attachmentUrl
                          ? /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(l.attachmentUrl)
                            ? <a href={attachmentFullUrl(l.attachmentUrl)} target="_blank" rel="noreferrer">
                                <img src={attachmentFullUrl(l.attachmentUrl)} alt="attachment"
                                  style={{ width: 56, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0", display: "block" }} />
                              </a>
                            : <a href={attachmentFullUrl(l.attachmentUrl)} target="_blank" rel="noreferrer"
                                style={{ color: "#1e3a5f", fontWeight: 600, fontSize: 12.5, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                📄 View
                              </a>
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={TD()}>
                        {l.status === "PENDING" && (
                          <button onClick={() => handleCancel(l.id)}
                            style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: "inherit" }}>
                            Cancel
                          </button>
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
