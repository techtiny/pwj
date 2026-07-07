import { useEffect, useState, useCallback } from "react";
import { leaveApi, uploadDocument, attachmentFullUrl, fmtDate, leaveTypeLabel } from "./hrApi";

const LEAVE_TYPES = [
  { value: "CASUAL",     label: "Casual Leave (CL)" },
  { value: "SICK",       label: "Sick Leave (SL)" },
  { value: "PERMISSION", label: "Permission (Short Leave)" },
  { value: "OTHER",      label: "Other" },
];

const STATUS_CFG = {
  PENDING:   { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED:  { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  REJECTED:  { bg: "#fef2f2", color: "#dc2626", label: "Rejected" },
  CANCELLED: { bg: "#f8fafc", color: "#374151", label: "Cancelled" },
};

const EMPTY = { leaveType: "CASUAL", fromDate: "", toDate: "", reason: "", permissionHours: "1" };

const RESTRICTED_ROLES = ["VP", "CEO", "OH"];

export default function LeavePage({ user }) {
  const canApplyLeave = !RESTRICTED_ROLES.includes(user?.role);
  const [leaves, setLeaves]       = useState([]);
  const [summary, setSummary]     = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [errors, setErrors]       = useState({});
  const [saving, setSaving]       = useState(false);
  const [file, setFile]           = useState(null);
  const [filterView, setFilterView] = useState("all"); // all | leaves | permissions

  const isPermission = form.leaveType === "PERMISSION";

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
    if (isPermission) return null;
    if (!form.fromDate || !form.toDate) return 0;
    const diff = (new Date(form.toDate) - new Date(form.fromDate)) / 86400000;
    return diff < 0 ? 0 : diff + 1;
  };

  const validate = () => {
    const e = {};
    if (!form.fromDate) e.fromDate = "Required";
    if (!isPermission) {
      if (!form.toDate) e.toDate = "Required";
      if (form.fromDate && form.toDate && form.toDate < form.fromDate) e.toDate = "Must be after from date";
    }
    if (isPermission && (!form.permissionHours || Number(form.permissionHours) < 1)) {
      e.permissionHours = "Enter valid hours (1–8)";
    }
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
      if (file) attachmentUrl = await uploadDocument(file);
      const payload = {
        ...form,
        username,
        attachmentUrl,
        toDate: isPermission ? form.fromDate : form.toDate,
        permissionHours: isPermission ? String(form.permissionHours) : undefined,
      };
      const r = await leaveApi.apply(payload);
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
  const LBL = { fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 5, display: "block" };
  const TH  = {
    background: "#f8fafc", padding: "12px 14px", textAlign: "left",
    fontWeight: 600, fontSize: 13, color: "#374151",
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
  const badge = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 13, fontWeight: 600 });

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Summary stats — PWJ statCard style */}
      {summary && (
        <div className="hr-stat-flex" style={{ display: "flex", gap: 14, marginBottom: 24, maxWidth: 520 }}>
          {[
            { label: "Pending",  value: summary.pending,  accent: "#d97706" },
            { label: "Approved", value: summary.approved, accent: "#059669" },
            { label: "Rejected", value: summary.rejected, accent: "#dc2626" },
          ].map(k => (
            <div key={k.label} style={statCard(k.accent)}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Header row */}
      <div className="hr-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>My Leaves &amp; Permissions</div>
        <button
          disabled={!canApplyLeave}
          onClick={() => { if (canApplyLeave) { setShowForm(true); setForm(EMPTY); setErrors({}); } }}
          title={!canApplyLeave ? "Leave applications are not applicable for VP, CEO and OH roles" : ""}
          style={{ border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 14, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
            background: canApplyLeave ? "#1e3a5f" : "#e2e8f0",
            color: canApplyLeave ? "#fff" : "#94a3b8",
            cursor: canApplyLeave ? "pointer" : "not-allowed",
            opacity: canApplyLeave ? 1 : 0.7,
          }}>
          + Apply
        </button>
      </div>

      {/* Filter tabs */}
      <div className="hr-pill-row" style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "all",         label: `All (${leaves.length})` },
          { key: "leaves",      label: `Leaves (${leaves.filter(l => l.leaveType !== "PERMISSION").length})` },
          { key: "permissions", label: `Permissions (${leaves.filter(l => l.leaveType === "PERMISSION").length})` },
        ].map(t => {
          const active = filterView === t.key;
          return (
            <button key={t.key} onClick={() => setFilterView(t.key)}
              style={{ border: active ? "none" : "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 16px",
                background: active ? "#1e3a5f" : "#fff", color: active ? "#fff" : "#000",
                fontWeight: active ? 600 : 500, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Apply leave / permission form */}
      {showForm && canApplyLeave && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "22px 26px", marginBottom: 24, maxWidth: 560 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 18 }}>
            {isPermission ? "New Permission Request" : "New Leave Application"}
          </div>
          <form onSubmit={handleSubmit} className="hr-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>

            {/* Type selector */}
            <div>
              <label style={LBL}>Type</label>
              <select style={INP()} value={form.leaveType}
                onChange={e => setForm(f => ({ ...f, leaveType: e.target.value, toDate: "", permissionHours: "1" }))}>
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Duration summary card */}
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "10px 16px", width: "100%", textAlign: "center", border: "1px solid #e2e8f0" }}>
                {isPermission ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Hours</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{form.permissionHours || "—"}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Total Days</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{totalDays()}</div>
                  </>
                )}
              </div>
            </div>

            {/* Date fields — Permission: single date; Leave: from + to */}
            {isPermission ? (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LBL}>Date *</label>
                <input style={INP(errors.fromDate)} type="date" value={form.fromDate}
                  onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))} />
                {errors.fromDate && <div style={{ fontSize: 13, color: "#ef4444", marginTop: 3 }}>{errors.fromDate}</div>}
              </div>
            ) : (
              <>
                <div>
                  <label style={LBL}>From Date *</label>
                  <input style={INP(errors.fromDate)} type="date" value={form.fromDate}
                    onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))} />
                  {errors.fromDate && <div style={{ fontSize: 13, color: "#ef4444", marginTop: 3 }}>{errors.fromDate}</div>}
                </div>
                <div>
                  <label style={LBL}>To Date *</label>
                  <input style={INP(errors.toDate)} type="date" value={form.toDate}
                    onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))} />
                  {errors.toDate && <div style={{ fontSize: 13, color: "#ef4444", marginTop: 3 }}>{errors.toDate}</div>}
                </div>
              </>
            )}

            {/* Hours — only for Permission */}
            {isPermission && (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LBL}>Hours Required *</label>
                <div className="hr-perm-hours" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4].map(h => (
                    <button key={h} type="button"
                      onClick={() => setForm(f => ({ ...f, permissionHours: String(h) }))}
                      style={{
                        border: form.permissionHours === String(h) ? "none" : "1.5px solid #e2e8f0",
                        borderRadius: 8, padding: "8px 22px", fontWeight: 700, fontSize: 14,
                        background: form.permissionHours === String(h) ? "#1e3a5f" : "#fff",
                        color: form.permissionHours === String(h) ? "#fff" : "#374151",
                        cursor: "pointer", fontFamily: "inherit",
                      }}>
                      {h}h
                    </button>
                  ))}
                  <input type="number" min={1} max={8} placeholder="Custom"
                    value={[1,2,3,4].includes(Number(form.permissionHours)) ? "" : form.permissionHours}
                    onChange={e => setForm(f => ({ ...f, permissionHours: e.target.value }))}
                    style={{ ...INP(errors.permissionHours), width: 90, boxSizing: "border-box" }} />
                </div>
                {errors.permissionHours && <div style={{ fontSize: 13, color: "#ef4444", marginTop: 3 }}>{errors.permissionHours}</div>}
              </div>
            )}

            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Reason *</label>
              <textarea
                style={{ ...INP(errors.reason), resize: "vertical", minHeight: 78 }}
                rows={3} value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder={isPermission ? "Please describe why you need permission…" : "Please describe the reason for your leave…"}
              />
              {errors.reason && <div style={{ fontSize: 13, color: "#ef4444", marginTop: 3 }}>{errors.reason}</div>}
            </div>

            {!isPermission && (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LBL}>Attachment <span style={{ color: "#374151", fontWeight: 400 }}>(optional — image or PDF, max 20MB)</span></label>
                <label style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  border: "1.5px dashed #cbd5e1", borderRadius: 8, padding: "10px 14px",
                  background: file ? "#f0fdf4" : "#f8fafc", color: file ? "#059669" : "#94a3b8",
                  fontSize: 14, fontWeight: 500,
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
            )}

            <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving}
                style={{ flex: 1, border: "none", borderRadius: 9, padding: "12px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Submitting…" : isPermission ? "Submit Permission" : "Submit Application"}
              </button>
              <button type="button" onClick={handleFormClose}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "12px 22px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Leave / Permission history table */}
      {(() => {
        const filtered = leaves.filter(l =>
          filterView === "all" ? true :
          filterView === "permissions" ? l.leaveType === "PERMISSION" :
          l.leaveType !== "PERMISSION"
        );
        return (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 52, textAlign: "center", color: "#374151", fontSize: 15 }}>
                {leaves.length === 0 ? 'No requests yet. Click "+ Apply" to get started.' : "No records in this category."}
              </div>
            ) : (
              <div className="table-scroll-wrap">
                <table className="leave-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      {["Type","Date","Duration","Reason","Status","Approved By","Attachment","Action"].map(h => (
                        <th key={h} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(l => {
                      const s = STATUS_CFG[l.status] || STATUS_CFG.PENDING;
                      const isPerm = l.leaveType === "PERMISSION";
                      return (
                        <tr key={l.id}>
                          <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{leaveTypeLabel(l.leaveType)}</td>
                          <td style={TD()}>
                            {isPerm
                              ? fmtDate(l.fromDate)
                              : l.fromDate === l.toDate
                                ? fmtDate(l.fromDate)
                                : `${fmtDate(l.fromDate)} → ${fmtDate(l.toDate)}`}
                          </td>
                          <td style={TD({ fontWeight: 700, textAlign: "center" })}>
                            {isPerm
                              ? <span style={{ color: "#7c3aed" }}>{l.permissionHours || "—"}h</span>
                              : `${l.totalDays}d`}
                          </td>
                          <td style={TD({ color: "#1e293b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={l.reason}>{l.reason}</td>
                          <td style={TD()}>
                            <span style={badge(s)}>{s.label}</span>
                            {l.approvalComment && <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{l.approvalComment}</div>}
                          </td>
                          <td style={TD({ color: "#374151" })}>{l.approvedBy || "—"}</td>
                          <td style={TD()}>
                            {l.attachmentUrl
                              ? /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(l.attachmentUrl)
                                ? <a href={attachmentFullUrl(l.attachmentUrl)} target="_blank" rel="noreferrer">
                                    <img src={attachmentFullUrl(l.attachmentUrl)} alt="attachment"
                                      style={{ width: 56, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0", display: "block" }} />
                                  </a>
                                : <a href={attachmentFullUrl(l.attachmentUrl)} target="_blank" rel="noreferrer"
                                    style={{ color: "#1e3a5f", fontWeight: 600, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                    📄 View
                                  </a>
                              : <span style={{ color: "#374151" }}>—</span>}
                          </td>
                          <td style={TD()}>
                            {l.status === "PENDING" && (
                              <button onClick={() => handleCancel(l.id)}
                                style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#dc2626", fontFamily: "inherit" }}>
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
        );
      })()}
    </div>
  );
}
