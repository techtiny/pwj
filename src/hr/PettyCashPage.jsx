import { useEffect, useState, useCallback } from "react";
import { pettyCashApi, projectsApi, uploadDocument, attachmentFullUrl, fmtDate } from "./hrApi";

const CATEGORIES   = ["TRAVEL", "FOOD", "OFFICE_SUPPLIES", "UTILITIES", "MAINTENANCE", "OTHERS"];
const PAYMENT_MODES = ["CASH", "UPI", "CARD", "OTHER"];

const STATUS_CFG = {
  PENDING:  { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED: { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  REJECTED: { bg: "#fef2f2", color: "#dc2626", label: "Rejected" },
};

const EMPTY_FORM = {
  expenseDate: new Date().toISOString().split("T")[0],
  projectName: "",
  category: "TRAVEL",
  description: "",
  amount: "",
  paymentMode: "CASH",
};

const fmtINR = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(v || 0);

export default function PettyCashPage({ user, title = "Petty Cash" }) {
  const isApprover = ["ADMIN", "CEO", "VP", "OH"].includes(user?.role);

  const [entries, setEntries]     = useState([]);
  const [allEntries, setAll]      = useState([]);
  const [summary, setSummary]     = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [errors, setErrors]       = useState({});
  const [saving, setSaving]       = useState(false);
  const [file, setFile]           = useState(null);
  const [viewTab, setViewTab]     = useState("mine");   // "mine" | "all"
  const [commentMap, setCommentMap] = useState({});
  const [processing, setProcessing] = useState(null);
  const [projects, setProjects]   = useState([]);

  const username = user?.username;

  const load = useCallback(async () => {
    if (!username) return;
    const [myRes, sumRes] = await Promise.all([
      pettyCashApi.getMyEntries(username).catch(() => ({ data: { data: [] } })),
      pettyCashApi.getSummary(username).catch(() => ({ data: { data: {} } })),
    ]);
    setEntries(myRes.data?.data || []);
    setSummary(sumRes.data?.data);
  }, [username]);

  const loadAll = useCallback(async () => {
    const r = await pettyCashApi.getAll().catch(() => ({ data: { data: [] } }));
    setAll(r.data?.data || []);
  }, []);

  useEffect(() => {
    load();
    if (isApprover) loadAll();
    projectsApi.getActive()
      .then(r => setProjects(r.data?.data || []))
      .catch(() => {});
  }, [load, loadAll, isApprover]);

  const validate = () => {
    const e = {};
    if (!form.expenseDate) e.expenseDate = "Required";
    if (!form.projectName) e.projectName = "Select a project";
    if (!form.description.trim()) e.description = "Required";
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = "Enter a valid amount";
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      let attachmentUrl = null;
      if (file) attachmentUrl = await uploadDocument(file);
      const r = await pettyCashApi.create({ ...form, username, amount: Number(form.amount), attachmentUrl });
      if (r.data?.success) {
        await load();
        if (isApprover) await loadAll();
        setShowForm(false);
        setForm(EMPTY_FORM);
        setFile(null);
        setErrors({});
      } else {
        alert(r.data?.message || "Failed to create entry");
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await pettyCashApi.delete(id, username);
      await load();
      if (isApprover) await loadAll();
    } catch (err) {
      alert(err.response?.data?.message || "Cannot delete");
    }
  };

  const handleAction = async (id, action) => {
    setProcessing(id + action);
    try {
      const body = { approvedBy: user?.fullName || username, approvedByRole: user?.role || "", comment: commentMap[id] || "" };
      const r = action === "approve"
        ? await pettyCashApi.approve(id, body)
        : await pettyCashApi.reject(id, body);
      if (r.data?.success) {
        setCommentMap(m => { const c = { ...m }; delete c[id]; return c; });
        await load();
        await loadAll();
      } else alert(r.data?.message || "Failed");
    } catch (e) { alert(e.response?.data?.message || "Error"); }
    finally { setProcessing(null); }
  };

  // PWJ design tokens
  const TH = {
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
  const INP = (err) => ({
    border: `1.5px solid ${err ? "#ef4444" : "#e2e8f0"}`, borderRadius: 8,
    padding: "10px 13px", fontSize: 14, fontFamily: "inherit",
    outline: "none", width: "100%", boxSizing: "border-box", color: "#0f172a",
    background: "#fff",
  });
  const LBL = { fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" };
  const badge = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" });

  const displayList = viewTab === "mine" ? entries : allEntries;

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Summary stat cards */}
      {summary && (
        <div className="hr-stat-flex" style={{ display: "flex", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Approved Amount",  value: fmtINR(summary.totalApproved), accent: "#059669" },
            { label: "Pending Amount",   value: fmtINR(summary.totalPending),  accent: "#d97706" },
            { label: "Pending Entries",  value: summary.countPending,           accent: "#f59e0b" },
            { label: "Approved Entries", value: summary.countApproved,          accent: "#1e3a5f" },
          ].map(k => (
            <div key={k.label} style={statCard(k.accent)}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{k.label}</div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: typeof k.value === "string" ? 22 : 32, fontWeight: 700, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>{title}</div>
          <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>Record and track your out-of-pocket expenses</div>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setErrors({}); }}
          style={{ border: "none", borderRadius: 8, padding: "9px 18px", background: "#1e3a5f", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          + New Entry
        </button>
      </div>

      {/* New entry form */}
      {showForm && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "22px 26px", marginBottom: 24, maxWidth: 620 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 18 }}>New {title} Entry</div>
          <form onSubmit={handleSubmit} className="hr-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>

            <div>
              <label style={LBL}>Expense Date *</label>
              <input type="date" style={INP(errors.expenseDate)}
                value={form.expenseDate}
                onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
              {errors.expenseDate && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.expenseDate}</div>}
            </div>

            <div>
              <label style={LBL}>Amount (₹) *</label>
              <input type="number" min="1" step="0.01" style={INP(errors.amount)}
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              {errors.amount && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.amount}</div>}
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Project *</label>
              <select style={INP(errors.projectName)} value={form.projectName}
                onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}>
                <option value="">— Select project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
              {errors.projectName && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.projectName}</div>}
            </div>

            <div>
              <label style={LBL}>Category</label>
              <select style={INP()} value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={LBL}>Payment Mode</label>
              <select style={INP()} value={form.paymentMode}
                onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))}>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Description *</label>
              <textarea style={{ ...INP(errors.description), resize: "vertical", minHeight: 72 }}
                placeholder="Describe the expense (what it was for, where, etc.)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              {errors.description && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.description}</div>}
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" }}>
                Receipt / Attachment <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional — image or PDF, max 20MB)</span>
              </label>
              <label style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                border: "1.5px dashed #cbd5e1", borderRadius: 8, padding: "10px 14px",
                background: file ? "#f0fdf4" : "#f8fafc", color: file ? "#059669" : "#94a3b8",
                fontSize: 13, fontWeight: 500,
              }}>
                <span style={{ fontSize: 18 }}>📎</span>
                <span>{file ? file.name : "Click to attach a receipt or document"}</span>
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
                {saving ? (file ? "Uploading…" : "Saving…") : "Submit Entry"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFile(null); }}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "12px 22px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View toggle for admins */}
      {isApprover && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "mine", label: "My Entries" },
            { key: "all",  label: `All Entries (${allEntries.length})` },
          ].map(t => {
            const active = viewTab === t.key;
            return (
              <button key={t.key} onClick={() => setViewTab(t.key)}
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
      )}

      {/* Entries table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {displayList.length === 0 ? (
          <div style={{ padding: 52, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
            No {title.toLowerCase()} entries yet. Click "+ New Entry" to get started.
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {[
                    ...(viewTab === "all" ? ["Employee"] : []),
                    "Date", "Project", "Category", "Description", "Amount", "Mode", "Status", "Receipt", "Action",
                  ].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {displayList.map(entry => {
                  const s = STATUS_CFG[entry.status] || STATUS_CFG.PENDING;
                  const isMine = entry.username === username;
                  const isProc = processing === entry.id + "approve" || processing === entry.id + "reject";
                  return (
                    <tr key={entry.id}>
                      {viewTab === "all" && (
                        <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{entry.fullName}</td>
                      )}
                      <td style={TD({ whiteSpace: "nowrap" })}>{fmtDate(entry.expenseDate)}</td>
                      <td style={TD({ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={entry.projectName}>
                        {entry.projectName
                          ? <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{entry.projectName}</span>
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={TD()}>
                        <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>
                          {entry.category.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={TD({ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={entry.description}>
                        {entry.description}
                      </td>
                      <td style={TD({ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" })}>{fmtINR(entry.amount)}</td>
                      <td style={TD({ color: "#64748b" })}>{entry.paymentMode}</td>
                      <td style={TD()}>
                        <span style={badge(s)}>{s.label}</span>
                        {entry.approvalComment && (
                          <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>{entry.approvalComment}</div>
                        )}
                        {entry.approvedBy && (
                          <div style={{ fontSize: 10.5, color: "#94a3b8" }}>
                            by {entry.approvedBy}{entry.approvedByRole ? ` · ${entry.approvedByRole}` : ""}
                          </div>
                        )}
                      </td>
                      <td style={TD()}>
                        {entry.attachmentUrl
                          ? /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(entry.attachmentUrl)
                            ? <a href={attachmentFullUrl(entry.attachmentUrl)} target="_blank" rel="noreferrer">
                                <img src={attachmentFullUrl(entry.attachmentUrl)} alt="receipt"
                                  style={{ width: 56, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0", display: "block" }} />
                              </a>
                            : <a href={attachmentFullUrl(entry.attachmentUrl)} target="_blank" rel="noreferrer"
                                style={{ color: "#1e3a5f", fontWeight: 600, fontSize: 12.5, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                📄 View
                              </a>
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={TD()}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {/* User can delete their own pending entries */}
                          {isMine && entry.status === "PENDING" && (
                            <button onClick={() => handleDelete(entry.id)}
                              style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: "inherit" }}>
                              Delete
                            </button>
                          )}
                          {/* Approver actions */}
                          {isApprover && entry.status === "PENDING" && (
                            <>
                              <input
                                placeholder="Comment"
                                value={commentMap[entry.id] || ""}
                                onChange={e => setCommentMap(m => ({ ...m, [entry.id]: e.target.value }))}
                                style={{ border: "1.5px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", width: 90, color: "#374151" }}
                              />
                              <button onClick={() => handleAction(entry.id, "approve")} disabled={isProc}
                                style={{ background: "#1e3a5f", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "inherit", opacity: isProc ? 0.6 : 1 }}>
                                {processing === entry.id + "approve" ? "…" : "Approve"}
                              </button>
                              <button onClick={() => handleAction(entry.id, "reject")} disabled={isProc}
                                style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: "inherit", opacity: isProc ? 0.6 : 1 }}>
                                {processing === entry.id + "reject" ? "…" : "Reject"}
                              </button>
                            </>
                          )}
                        </div>
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
