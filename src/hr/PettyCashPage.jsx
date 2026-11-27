import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { pettyCashApi, projectsApi, uploadDocument, attachmentFullUrl, fmtDate, fmtDateTime } from "./hrApi";
import { ApproveBtn, DeleteBtn, RejectBtn } from "../ActionButtons";

const CATEGORIES = ["TRAVEL", "FOOD", "OFFICE_SUPPLIES", "UTILITIES", "MAINTENANCE", "OTHERS"];

const STATUS_CFG = {
  PENDING:          { bg: "#fffbeb", color: "#d97706", label: "Pending" },
  APPROVED:         { bg: "#ecfdf5", color: "#059669", label: "Approved" },
  CASH_TRANSFERRED: { bg: "#eff6ff", color: "#2563eb", label: "Cash Transferred" },
  PROOF_SUBMITTED:  { bg: "#fef9c3", color: "#854d0e", label: "Proof Submitted — Awaiting Tally" },
  PROOF_VERIFIED:   { bg: "#f0fdf4", color: "#15803d", label: "Verified ✓" },
  REJECTED:         { bg: "#fef2f2", color: "var(--hz-danger)", label: "Rejected" },
};

const EMPTY_FORM = {
  expenseDate: new Date().toISOString().split("T")[0],
  projectName: "",
  category: "TRAVEL",
  description: "",
  amount: "",
};

const fmtINR = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(v || 0);

export default function PettyCashPage({ user, title = "Petty Cash", defaultTab = "mine" }) {
  const isApprover = ["ADMIN", "CEO", "VP", "OH"].includes(user?.role);
  const requestType = title === "Reimbursement" ? "REIMBURSEMENT" : "PETTY_CASH";

  const [entries, setEntries]       = useState([]);
  const [allEntries, setAll]        = useState([]);
  const [summary, setSummary]       = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [errors, setErrors]         = useState({});
  const [saving, setSaving]         = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState([]); // Reimbursement only — one or more receipts / invoices
  const [viewTab, setViewTab]       = useState(defaultTab);
  const [commentMap, setCommentMap]       = useState({});
  const [tallyCommentMap, setTallyMap]    = useState({});
  const [processing, setProcessing]       = useState(null);
  const [projects, setProjects]     = useState([]);
  const [proofState, setProofState] = useState({}); // { [id]: { files: [], uploading } }

  const [filterName, setFilterName]         = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterFrom, setFilterFrom]         = useState("");
  const [filterTo, setFilterTo]             = useState("");

  const username = user?.username;

  const load = useCallback(async () => {
    if (!username) return;
    const [myRes, sumRes] = await Promise.all([
      pettyCashApi.getMyEntries(username, requestType).catch(() => ({ data: { data: [] } })),
      pettyCashApi.getSummary(username, requestType).catch(() => ({ data: { data: {} } })),
    ]);
    setEntries(myRes.data?.data || []);
    setSummary(sumRes.data?.data);
  }, [username, requestType]);

  const loadAll = useCallback(async () => {
    const r = await pettyCashApi.getAll(requestType).catch(() => ({ data: { data: [] } }));
    setAll(r.data?.data || []);
  }, [requestType]);

  useEffect(() => {
    load();
    if (isApprover) loadAll();
    projectsApi.getActive()
      .then(r => setProjects(r.data?.data || []))
      .catch(() => {});
  }, [load, loadAll, isApprover]);

  // Up to 2 untallied requests may stay open per project at once; a 3rd is
  // blocked until the oldest of those is tallied (PROOF_VERIFIED).
  const ACTIVE_STATUSES = new Set(["PENDING", "APPROVED", "CASH_TRANSFERRED", "PROOF_SUBMITTED"]);
  const activeCountByProject = useMemo(() => {
    const m = new Map();
    entries.filter(e => ACTIVE_STATUSES.has(e.status)).forEach(e => {
      m.set(e.projectName, (m.get(e.projectName) || 0) + 1);
    });
    return m;
  }, [entries]);
  const blockedProjects = useMemo(
    () => new Set([...activeCountByProject.entries()].filter(([, count]) => count >= 2).map(([p]) => p)),
    [activeCountByProject]
  );
  const selectedProjectBlocked = form.projectName && blockedProjects.has(form.projectName);

  const validate = () => {
    const e = {};
    if (!form.expenseDate) e.expenseDate = "Required";
    if (!form.projectName) e.projectName = "Select a project";
    if (selectedProjectBlocked) e.projectName = "2 untallied requests already exist for this project";
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
      const attachmentUrls = attachmentFiles.length ? await Promise.all(attachmentFiles.map(f => uploadDocument(f))) : [];
      const r = await pettyCashApi.create({ ...form, username, requestType, amount: Number(form.amount),
        ...(attachmentUrls.length ? { attachmentUrl: attachmentUrls[0], attachmentUrls } : {}) });
      if (r.data?.success) {
        await load();
        if (isApprover) await loadAll();
        setShowForm(false);
        setForm(EMPTY_FORM);
        setAttachmentFiles([]);
        setErrors({});
      } else {
        alert(r.data?.message || "Failed to create entry");
      }
    } catch (err) {
      const msg = err.response?.data?.message || "";
      if (msg.startsWith("ACTIVE_REQUEST_EXISTS:")) {
        setErrors({ projectName: "2 untallied requests already exist for this project. The oldest one must be tallied before raising another." });
      } else {
        alert(msg || "Failed");
      }
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

  const handleVerifyProof = async (id) => {
    setProcessing(id + "verify");
    try {
      const r = await pettyCashApi.verifyProof(id, {
        verifiedBy: user?.fullName || username,
        tallyComment: tallyCommentMap[id] || "",
      });
      if (r.data?.success) {
        setTallyMap(m => { const c = { ...m }; delete c[id]; return c; });
        await load();
        await loadAll();
      } else alert(r.data?.message || "Failed");
    } catch (e) { alert(e.response?.data?.message || "Error"); }
    finally { setProcessing(null); }
  };

  const handleMarkTransferred = async (id) => {
    setProcessing(id + "transfer");
    try {
      const r = await pettyCashApi.markTransferred(id);
      if (r.data?.success) { await load(); await loadAll(); }
      else alert(r.data?.message || "Failed");
    } catch (e) { alert(e.response?.data?.message || "Error"); }
    finally { setProcessing(null); }
  };

  const handleProofFilesChange = (id, fileList) => {
    const files = Array.from(fileList || []);
    setProofState(s => ({ ...s, [id]: { files, uploading: false } }));
  };

  const handleRemoveProofFile = (id, idx) => {
    setProofState(s => {
      const files = (s[id]?.files || []).filter((_, i) => i !== idx);
      return { ...s, [id]: { ...s[id], files } };
    });
  };

  const handleSubmitProof = async (id) => {
    const { files = [] } = proofState[id] || {};
    if (!files.length) return;
    setProofState(s => ({ ...s, [id]: { ...s[id], uploading: true } }));
    try {
      const proofUrls = await Promise.all(files.map(f => uploadDocument(f)));
      const r = await pettyCashApi.submitProof(id, { username, proofUrls });
      if (r.data?.success) {
        setProofState(s => { const c = { ...s }; delete c[id]; return c; });
        await load();
        if (isApprover) await loadAll();
      } else alert(r.data?.message || "Failed");
    } catch (e) { alert(e.response?.data?.message || "Error"); }
    finally { setProofState(s => ({ ...s, [id]: { ...s[id], uploading: false } })); }
  };

  // Styles
  const TH = {
    background: "#f8fafc", padding: "12px 14px", textAlign: "left",
    fontWeight: 600, fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)",
    textTransform: "uppercase", letterSpacing: 0.5,
    borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
  };
  const TD = (extra = {}) => ({
    padding: "12px 14px", color: "var(--hz-ink-2)",
    borderBottom: "1px solid #f1f5f9", fontSize: "var(--hz-text-md)",
    verticalAlign: "middle", ...extra,
  });
  const statCard = (accent) => ({
    background: "#fff", borderRadius: 12, padding: "18px 22px",
    flex: 1, border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`,
  });
  const INP = (err) => ({
    border: `1.5px solid ${err ? "#ef4444" : "#e2e8f0"}`, borderRadius: 8,
    padding: "10px 13px", fontSize: "var(--hz-text-md)", fontFamily: "inherit",
    outline: "none", width: "100%", boxSizing: "border-box", color: "var(--hz-ink)",
    background: "#fff",
  });
  const LBL = { fontSize: "var(--hz-text-md)", fontWeight: 600, color: "var(--hz-ink-2)", marginBottom: 5, display: "block" };
  const badge = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: "var(--hz-text-sm)", fontWeight: 600, whiteSpace: "nowrap" });

  const employeeOptions = useMemo(() => {
    const names = new Set(allEntries.map(e => e.fullName || e.username).filter(Boolean));
    return [...names].sort();
  }, [allEntries]);

  const filteredAllEntries = useMemo(() => {
    return allEntries.filter(e => {
      if (filterName && (e.fullName || e.username) !== filterName) return false;
      if (filterCategory && e.category !== filterCategory) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      const day = e.expenseDate ? String(e.expenseDate).substring(0, 10) : "";
      if (filterFrom && day < filterFrom) return false;
      if (filterTo && day > filterTo) return false;
      return true;
    });
  }, [allEntries, filterName, filterCategory, filterStatus, filterFrom, filterTo]);

  const hasFilters = filterName || filterCategory || filterStatus || filterFrom || filterTo;
  const clearFilters = () => { setFilterName(""); setFilterCategory(""); setFilterStatus(""); setFilterFrom(""); setFilterTo(""); };

  const displayList = viewTab === "mine" ? entries : filteredAllEntries;

  const AttachmentLink = ({ url, label }) => {
    if (!url) return null;
    return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(url)
      ? <a href={attachmentFullUrl(url)} target="_blank" rel="noreferrer">
          <img src={attachmentFullUrl(url)} alt="doc"
            style={{ width: 48, height: 38, objectFit: "cover", borderRadius: 5, border: "1px solid #e2e8f0", display: "block" }} />
        </a>
      : <a href={attachmentFullUrl(url)} target="_blank" rel="noreferrer"
          style={{ color: "var(--hz-primary)", fontWeight: 600, fontSize: "var(--hz-text-sm)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
          📄 {label || "View"}
        </a>;
  };

  // Receipts attached when the request was raised: every file in attachmentUrls (older entries: just attachmentUrl).
  const ReceiptCell = ({ entry }) => {
    let urls = [];
    if (entry.attachmentUrls) {
      try { urls = JSON.parse(entry.attachmentUrls); } catch { urls = [entry.attachmentUrl].filter(Boolean); }
    } else if (entry.attachmentUrl) {
      urls = [entry.attachmentUrl];
    }
    if (!urls.length) return <span style={{ color: "var(--hz-ink-2)" }}>—</span>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {urls.map((url, i) => <AttachmentLink key={i} url={url} label={urls.length > 1 ? `Doc ${i + 1}` : "View"} />)}
      </div>
    );
  };

  const ProofCell = ({ entry }) => {
    let urls = [];
    if (entry.proofUrls) {
      try { urls = JSON.parse(entry.proofUrls); } catch { urls = [entry.proofUrl].filter(Boolean); }
    } else if (entry.proofUrl) {
      urls = [entry.proofUrl];
    }
    if (!urls.length) return <span style={{ color: "var(--hz-ink-2)" }}>—</span>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {urls.map((url, i) => <AttachmentLink key={i} url={url} label={`Doc ${i + 1}`} />)}
      </div>
    );
  };

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>
      <style>{`
        @media (max-width: 640px) {
          .hr-page { padding: 12px 14px !important; }
          .pc-stat-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .pc-header { flex-wrap: wrap; gap: 10px; }
          .pc-header-btn { width: 100%; }
          .hr-form-grid { grid-template-columns: 1fr !important; }
          .hr-form-grid > div[style*="1/-1"] { grid-column: 1 !important; }
          .pc-filter-bar { flex-direction: column !important; gap: 10px !important; }
          .pc-filter-bar > div { width: 100% !important; }
          .pc-filter-bar select, .pc-filter-bar input { width: 100% !important; min-width: unset !important; box-sizing: border-box; }
          .pc-filter-bar button { width: 100% !important; }
          .pc-table thead { display: none !important; }
          .pc-table tbody tr {
            display: block !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 10px !important;
            margin-bottom: 12px !important;
            padding: 12px 14px !important;
            background: #fff !important;
          }
          .pc-table td {
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            padding: 6px 0 !important;
            border-bottom: 1px solid #f1f5f9 !important;
            font-size: 13px !important;
            gap: 8px;
          }
          .pc-table td:last-child { border-bottom: none !important; }
          .pc-table td::before {
            content: attr(data-label);
            font-size: 11px !important;
            font-weight: 700 !important;
            color: #94a3b8 !important;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            min-width: 80px;
            flex-shrink: 0;
          }
          .pc-table td[data-label=""] { display: none !important; }
          .pc-table td[data-label="Action"] { flex-direction: column !important; align-items: stretch !important; }
          .pc-table td[data-label="Action"]::before { margin-bottom: 6px; }
          .pc-table td[data-label="Status"] { flex-direction: column !important; align-items: flex-start !important; }
          .pc-table td[data-label="Proof"] { flex-direction: column !important; align-items: flex-start !important; }
          .pc-actions { flex-wrap: wrap !important; }
          .pc-view-toggle { gap: 6px !important; }
          .pc-view-toggle button { font-size: 12px !important; padding: 7px 12px !important; }
        }
      `}</style>

      {/* Summary stat cards */}
      {summary && (
        <div className="hr-stat-flex pc-stat-grid" style={{ display: "flex", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Approved Amount",  value: fmtINR(summary.totalApproved), accent: "#059669" },
            { label: "Pending Amount",   value: fmtINR(summary.totalPending),  accent: "#d97706" },
            { label: "Pending Entries",  value: summary.countPending,           accent: "#f59e0b" },
            { label: "Approved Entries", value: summary.countApproved,          accent: "#1e3a5f" },
          ].map(k => (
            <div key={k.label} style={statCard(k.accent)}>
              <div style={{ fontSize: "var(--hz-text-sm)", fontWeight: 500, color: "var(--hz-ink-2)" }}>{k.label}</div>
              <div style={{ fontSize: "var(--hz-text-xl)", fontWeight: 800, color: "var(--hz-ink)", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="pc-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: "var(--hz-text-xl)", fontWeight: 700, color: "var(--hz-ink)", letterSpacing: "-0.3px" }}>{title}</div>
          <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)", marginTop: 2 }}>
            {blockedProjects.size > 0
              ? `2 untallied requests open for: ${[...blockedProjects].join(", ")}`
              : "Record and track your out-of-pocket expenses"}
          </div>
        </div>
        {(!isApprover || title === "Reimbursement" || user?.role === "ADMIN") && (
          <button
            onClick={() => { setShowForm(v => !v); setForm(EMPTY_FORM); setErrors({}); }}
            className="pc-header-btn"
            style={{ border: "none", borderRadius: 8, padding: "9px 18px", background: "#1e3a5f", color: "var(--hz-on-dark)", fontWeight: 600, fontSize: "var(--hz-text-md)", cursor: "pointer", fontFamily: "inherit" }}>
            {showForm ? "Cancel" : "+ New Request"}
          </button>
        )}
      </div>

      {/* New request form */}
      {showForm && (!isApprover || title === "Reimbursement" || user?.role === "ADMIN") && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "22px 26px", marginBottom: 24, maxWidth: 620 }}>
          <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 700, color: "var(--hz-ink)", marginBottom: 18 }}>New {title} Request</div>
          <form onSubmit={handleSubmit} className="hr-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Required Date *</label>
              <input type="date" style={INP(errors.expenseDate)}
                value={form.expenseDate}
                onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
              {errors.expenseDate && <div style={{ fontSize: "var(--hz-text-sm)", color: "#ef4444", marginTop: 3 }}>{errors.expenseDate}</div>}
            </div>

            <div>
              <label style={LBL}>Amount (₹) *</label>
              <input type="number" min="1" step="0.01" style={INP(errors.amount)}
                placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              {errors.amount && <div style={{ fontSize: "var(--hz-text-sm)", color: "#ef4444", marginTop: 3 }}>{errors.amount}</div>}
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Project *</label>
              <select style={INP(errors.projectName)} value={form.projectName}
                onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}>
                <option value="">— Select project —</option>
                {projects.map(p => {
                  const blocked = blockedProjects.has(p.name);
                  return (
                    <option key={p.id} value={p.name} disabled={blocked}>
                      {p.name}{blocked ? " (2 open requests)" : ""}
                    </option>
                  );
                })}
              </select>
              {errors.projectName && <div style={{ fontSize: "var(--hz-text-sm)", color: "#ef4444", marginTop: 3 }}>{errors.projectName}</div>}
              {selectedProjectBlocked && !errors.projectName && (() => {
                const oldestBlocking = entries
                  .filter(e => e.projectName === form.projectName && ACTIVE_STATUSES.has(e.status))
                  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
                const isAwaitingTally = oldestBlocking?.status === "PROOF_SUBMITTED";
                return (
                  <div style={{ fontSize: "var(--hz-text-sm)", color: isAwaitingTally ? "#7c3aed" : "#d97706", marginTop: 3 }}>
                    {isAwaitingTally
                      ? "🔍 Proof submitted on the oldest request — awaiting Admin tally. You can raise a new request once it's verified."
                      : "⏳ 2 untallied requests already exist for this project. Get the oldest one tallied first."}
                  </div>
                );
              })()}
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

            {title === "Reimbursement" && (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LBL}>Attachments (receipts / invoices) — you can add more than one</label>
                {attachmentFiles.length > 0 && (
                  <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                    {attachmentFiles.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", fontSize: "var(--hz-text-sm)" }}>
                        <span>📄</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <button type="button" onClick={() => setAttachmentFiles(fs => fs.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}
                          style={{ border: "none", background: "none", color: "var(--hz-danger)", cursor: "pointer", fontWeight: 700, fontSize: "var(--hz-text-md)" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1.5px dashed #94a3b8", borderRadius: 8, cursor: "pointer", fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "var(--hz-primary)" }}>
                  📎 {attachmentFiles.length ? "Add more files" : "Attach files"}
                  <input type="file" accept="image/*,application/pdf,.doc,.docx" multiple style={{ display: "none" }}
                    onChange={e => { const add = Array.from(e.target.files || []); setAttachmentFiles(fs => [...fs, ...add]); e.target.value = ""; }} />
                </label>
                {attachmentFiles.length > 0 && <span style={{ marginLeft: 10, fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>{attachmentFiles.length} file{attachmentFiles.length === 1 ? "" : "s"} selected</span>}
              </div>
            )}

            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Description *</label>
              <textarea style={{ ...INP(errors.description), resize: "vertical", minHeight: 72 }}
                placeholder="Describe the expense (what it was for, where, etc.)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              {errors.description && <div style={{ fontSize: "var(--hz-text-sm)", color: "#ef4444", marginTop: 3 }}>{errors.description}</div>}
            </div>

            <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving || selectedProjectBlocked}
                style={{ flex: 1, border: "none", borderRadius: 9, padding: "12px", background: selectedProjectBlocked ? "#94a3b8" : "#1e3a5f", color: "var(--hz-on-dark)", fontWeight: 700, fontSize: "var(--hz-text-md)", cursor: selectedProjectBlocked ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Submitting…" : "Submit Request"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setErrors({}); setAttachmentFiles([]); }}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "12px 22px", background: "#fff", color: "var(--hz-ink-2)", fontWeight: 600, fontSize: "var(--hz-text-md)", cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View toggle for approvers */}
      {isApprover && (
        <div className="pc-view-toggle" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "mine", label: "My Entries" },
            { key: "all",  label: `All Entries (${allEntries.length})` },
          ].map(t => {
            const active = viewTab === t.key;
            return (
              <button key={t.key} onClick={() => setViewTab(t.key)}
                style={{
                  border: active ? "none" : "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px",
                  background: active ? "#1e3a5f" : "#fff", color: active ? "var(--hz-on-dark)" : "var(--hz-ink)",
                  fontWeight: active ? 600 : 500, fontSize: "var(--hz-text-md)", cursor: "pointer", fontFamily: "inherit",
                }}>
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      {isApprover && viewTab === "all" && (
        <div className="pc-filter-bar" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "var(--hz-text-sm)", fontWeight: 500, color: "var(--hz-ink-2)", marginBottom: 4, display: "block" }}>Employee</label>
            <select style={{ ...INP(), minWidth: 160, width: "auto" }} value={filterName} onChange={e => setFilterName(e.target.value)}>
              <option value="">All Employees</option>
              {employeeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "var(--hz-text-sm)", fontWeight: 500, color: "var(--hz-ink-2)", marginBottom: 4, display: "block" }}>Category</label>
            <select style={{ ...INP(), minWidth: 150, width: "auto" }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "var(--hz-text-sm)", fontWeight: 500, color: "var(--hz-ink-2)", marginBottom: 4, display: "block" }}>Status</label>
            <select style={{ ...INP(), minWidth: 160, width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CFG).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "var(--hz-text-sm)", fontWeight: 500, color: "var(--hz-ink-2)", marginBottom: 4, display: "block" }}>From</label>
            <input type="date" style={{ ...INP(), width: "auto" }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: "var(--hz-text-sm)", fontWeight: 500, color: "var(--hz-ink-2)", marginBottom: 4, display: "block" }}>To</label>
            <input type="date" style={{ ...INP(), width: "auto" }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters}
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", color: "var(--hz-ink-2)", fontWeight: 600, fontSize: "var(--hz-text-sm)", cursor: "pointer", fontFamily: "inherit" }}>
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Entries table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {displayList.length === 0 ? (
          <div style={{ padding: 52, textAlign: "center", color: "var(--hz-ink-2)", fontSize: "var(--hz-text-md)" }}>
            {viewTab === "all" && hasFilters
              ? "No entries match the selected filters."
              : "No requests yet."}
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table className="pc-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--hz-text-md)" }}>
              <thead>
                <tr>
                  {[
                    ...(viewTab === "all" ? ["Employee"] : []),
                    "Date", "Project", "Category", "Description", "Amount",
                    "Status", "Receipt",
                    ...(title === "Reimbursement" ? [] : ["Proof"]),
                    "Action",
                  ].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {displayList.map((entry, i) => {
                  // Reimbursement: only Admin and VP approve — CEO/OH can submit their own
                  // but have no approval access on any entry. Doesn't apply to Petty Cash.
                  const isReimbursement = title === "Reimbursement";
                  // Only entries actually raised by VP/CEO/OH show "Submitted" — everyone else's
                  // Reimbursement follows the normal Petty-Cash-style approval workflow/timeline.
                  const raisedByExecRole = ["VP", "CEO", "OH"].includes(entry.raisedByRole);
                  const s = isReimbursement && raisedByExecRole && entry.status === "PENDING"
                    ? { ...STATUS_CFG.PENDING, label: "Submitted" }
                    : STATUS_CFG[entry.status] || STATUS_CFG.PENDING;
                  const isMine = entry.username === username;
                  const canApprove = isApprover && (!isReimbursement || ["ADMIN", "VP"].includes(user?.role));
                  const isProc = processing === entry.id + "approve" || processing === entry.id + "reject";
                  const proof  = proofState[entry.id] || {};

                  return (
                    <tr key={entry.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      {viewTab === "all" && (
                        <td data-label="Employee" style={TD({ fontWeight: 600, color: "var(--hz-ink)" })}>{entry.fullName}</td>
                      )}
                      <td data-label="Date" style={TD({ whiteSpace: "nowrap" })}>{fmtDate(entry.expenseDate)}</td>
                      <td data-label="Project" style={TD({ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={entry.projectName}>
                        {entry.projectName
                          ? <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 5, padding: "2px 8px", fontSize: "var(--hz-text-sm)", fontWeight: 600 }}>{entry.projectName}</span>
                          : <span style={{ color: "var(--hz-ink-2)" }}>—</span>}
                      </td>
                      <td data-label="Category" style={TD()}>
                        <span style={{ background: "#f1f5f9", color: "var(--hz-ink-2)", borderRadius: 5, padding: "2px 8px", fontSize: "var(--hz-text-sm)", fontWeight: 600 }}>
                          {entry.category.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td data-label="Description" style={TD({ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={entry.description}>
                        {entry.description}
                      </td>
                      <td data-label="Amount" style={TD({ fontWeight: 700, color: "var(--hz-ink)", whiteSpace: "nowrap" })}>{fmtINR(entry.amount)}</td>

                      {/* Status + date timeline */}
                      <td data-label="Status" style={TD({ minWidth: 160 })}>
                        <span style={badge(s)}>{s.label}</span>
                        <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
                          {entry.createdAt && (
                            <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)" }}>✦ Raised: {fmtDateTime(entry.createdAt)}</div>
                          )}
                          {entry.approvedAt && (
                            <div style={{ fontSize: "var(--hz-text-sm)", color: entry.status === "REJECTED" ? "var(--hz-danger)" : "#059669" }}>
                              {entry.status === "REJECTED" ? "✕ Rejected" : "✓ Approved"}: {fmtDateTime(entry.approvedAt)}
                              {entry.approvedBy && <span style={{ color: "var(--hz-ink-2)" }}> · {entry.approvedBy}{entry.approvedByRole ? ` (${entry.approvedByRole})` : ""}</span>}
                            </div>
                          )}
                          {entry.approvalComment && (
                            <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)", fontStyle: "italic" }}>{entry.approvalComment}</div>
                          )}
                          {entry.cashTransferredAt && (
                            <div style={{ fontSize: "var(--hz-text-sm)", color: "#2563eb" }}>💸 Transferred: {fmtDateTime(entry.cashTransferredAt)}</div>
                          )}
                          {entry.proofSubmittedAt && (
                            <div style={{ fontSize: "var(--hz-text-sm)", color: "#166534" }}>📎 Proof submitted: {fmtDateTime(entry.proofSubmittedAt)}</div>
                          )}
                          {entry.proofVerifiedAt && (
                            <div style={{ fontSize: "var(--hz-text-sm)", color: "#15803d", fontWeight: 600 }}>
                              ✓ Tallied: {fmtDateTime(entry.proofVerifiedAt)}
                              {entry.proofVerifiedBy && <span style={{ color: "var(--hz-ink-2)", fontWeight: 400 }}> · {entry.proofVerifiedBy}</span>}
                            </div>
                          )}
                          {entry.tallyComment && (
                            <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-ink-2)", fontStyle: "italic" }}>"{entry.tallyComment}"</div>
                          )}
                        </div>
                      </td>

                      {/* Receipt (initial attachment) */}
                      <td data-label="Receipt" style={TD()}>
                        <ReceiptCell entry={entry} />
                      </td>

                      {/* Proof (multi-doc, post-transfer) — Reimbursement already attaches the
                          receipt at request time, so no separate post-transfer proof step. */}
                      {title !== "Reimbursement" && (
                      <td data-label="Proof" style={TD({ minWidth: 160 })}>
                        {entry.proofUrl || entry.proofUrls ? (
                          <ProofCell entry={entry} />
                        ) : isMine && entry.status === "CASH_TRANSFERRED" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {/* Selected files list */}
                            {(proof.files || []).map((f, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--hz-text-sm)", color: "#059669" }}>
                                <span>📎</span>
                                <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                <button type="button" onClick={() => handleRemoveProofFile(entry.id, i)}
                                  style={{ background: "none", border: "none", color: "var(--hz-danger)", cursor: "pointer", fontSize: "var(--hz-text-md)", lineHeight: 1, padding: 0 }}>✕</button>
                              </div>
                            ))}
                            {/* Add files button */}
                            <label style={{
                              display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                              border: "1.5px dashed #cbd5e1", borderRadius: 7, padding: "5px 10px",
                              background: "#f8fafc", color: "var(--hz-ink-2)", fontSize: "var(--hz-text-sm)", fontWeight: 500,
                            }}>
                              📎 {(proof.files || []).length > 0 ? "Add more" : "Attach proof"}
                              <input type="file" accept="image/*,application/pdf,.doc,.docx" multiple
                                style={{ display: "none" }}
                                onChange={e => {
                                  const existing = proof.files || [];
                                  const newFiles = Array.from(e.target.files || []);
                                  setProofState(s => ({ ...s, [entry.id]: { ...s[entry.id], files: [...existing, ...newFiles] } }));
                                  e.target.value = "";
                                }} />
                            </label>
                            {(proof.files || []).length > 0 && (
                              <button onClick={() => handleSubmitProof(entry.id)} disabled={proof.uploading}
                                style={{ border: "none", borderRadius: 6, padding: "5px 10px", background: "#1e3a5f", color: "var(--hz-on-dark)", fontSize: "var(--hz-text-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: proof.uploading ? 0.6 : 1 }}>
                                {proof.uploading ? `Uploading ${(proof.files||[]).length} file(s)…` : `Submit ${(proof.files||[]).length} Proof Doc(s)`}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--hz-ink-2)", fontSize: "var(--hz-text-sm)" }}>
                            {entry.status === "PENDING" || entry.status === "REJECTED" ? "—" : "Awaiting"}
                          </span>
                        )}
                      </td>
                      )}

                      {/* Action */}
                      <td data-label="Action" style={TD()}>
                        <div className="pc-actions" style={{ display: "flex", gap: 8, flexWrap: "nowrap", alignItems: "center", whiteSpace: "nowrap" }}>
                          {/* Approve / Reject on PENDING — not needed for Reimbursement entries
                              raised by VP/OH/CEO; these are self-submitted and need no sign-off. */}
                          {canApprove && entry.status === "PENDING" && !(isReimbursement && raisedByExecRole) && (
                            <>
                              <input
                                placeholder="Comment"
                                value={commentMap[entry.id] || ""}
                                onChange={e => setCommentMap(m => ({ ...m, [entry.id]: e.target.value }))}
                                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "0 10px", height: 32, boxSizing: "border-box", fontSize: "var(--hz-text-md)", fontFamily: "inherit", outline: "none", width: 130, color: "var(--hz-ink)" }}
                              />
                              <ApproveBtn onClick={() => handleAction(entry.id, "approve")} disabled={isProc} title="Approve" />
                              <RejectBtn onClick={() => handleAction(entry.id, "reject")} disabled={isProc} title="Reject" />
                            </>
                          )}

                          {isMine && entry.status === "PENDING" && !(isReimbursement && raisedByExecRole) && (
                            <DeleteBtn onClick={() => handleDelete(entry.id)} title="Delete" />
                          )}

                          {/* Mark Cash Transferred on APPROVED */}
                          {canApprove && entry.status === "APPROVED" && (
                            <button onClick={() => handleMarkTransferred(entry.id)}
                              disabled={processing === entry.id + "transfer"}
                              style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: "var(--hz-text-sm)", fontWeight: 600, color: "#1d4ed8", fontFamily: "inherit", opacity: processing === entry.id + "transfer" ? 0.6 : 1 }}>
                              {processing === entry.id + "transfer" ? "…" : "Mark Transferred"}
                            </button>
                          )}

                          {/* Tally & Verify proof — Admin only, on PROOF_SUBMITTED */}
                          {canApprove && entry.status === "PROOF_SUBMITTED" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              <div style={{ fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "#854d0e", textTransform: "uppercase", letterSpacing: 0.4 }}>Review Proof</div>
                              <input
                                placeholder="Tally note (optional)"
                                value={tallyCommentMap[entry.id] || ""}
                                onChange={e => setTallyMap(m => ({ ...m, [entry.id]: e.target.value }))}
                                style={{ border: "1.5px solid #fde68a", borderRadius: 6, padding: "4px 8px", fontSize: "var(--hz-text-sm)", fontFamily: "inherit", outline: "none", width: 120, color: "var(--hz-ink-2)", background: "#fffbeb" }}
                              />
                              <button onClick={() => handleVerifyProof(entry.id)}
                                disabled={processing === entry.id + "verify"}
                                style={{ background: "#15803d", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "var(--hz-on-dark)", fontFamily: "inherit", opacity: processing === entry.id + "verify" ? 0.6 : 1 }}>
                                {processing === entry.id + "verify" ? "…" : "✓ Tally & Verify"}
                              </button>
                            </div>
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
