import { useEffect, useState, useCallback, useMemo } from "react";
import { bugApi, fmtDateTime } from "./bugApi";
import { usersApi, uploadDocument, attachmentFullUrl } from "../hr/hrApi";

const MODULES    = ["Vendors", "Projects", "HR", "Procurement", "Account", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES   = ["Open", "In Progress", "Testing", "Resolved", "Closed"];
const ASSIGNEES  = ["Happizo", "Techtiny"];

const SEVERITY_CFG = {
  Low:      { bg: "#f1f5f9", color: "#5a6878" },
  Medium:   { bg: "#fefce8", color: "#a07820" },
  High:     { bg: "#fff7ed", color: "#b85e22" },
  Critical: { bg: "#fef2f2", color: "#a83030" },
};

const STATUS_CFG = {
  Open:          { bg: "#eff6ff", color: "#3a6fa5" },
  "In Progress": { bg: "#fefce8", color: "#a07820" },
  Testing:       { bg: "#f5f3ff", color: "#6450b0" },
  Resolved:      { bg: "#ecfdf5", color: "#2a8a68" },
  Closed:        { bg: "#f8fafc", color: "#7a8a9a" },
};

const COMMENT_TYPE_CFG = {
  STATUS_CHANGE:   { bg: "#eff6ff", color: "#2563eb",  icon: "🔄" },
  SEVERITY_CHANGE: { bg: "#fff7ed", color: "#ea580c",  icon: "⚡" },
  ASSIGNED:        { bg: "#f5f3ff", color: "#7c3aed",  icon: "👤" },
  UPDATED:         { bg: "#f8fafc", color: "#475569",  icon: "✏️" },
  COMMENT:         { bg: "#f0fdf4", color: "#059669",  icon: "💬" },
};

const ROLE_LABELS = {
  ADMIN: "Admin",
  ENGINEER: "Engineer",
  PROCUREMENT: "Procurement",
  VP: "VP",
  OH: "OH",
  CEO: "CEO",
  PROJECT_MANAGER: "Project Manager",
};

const EMPTY_FORM = { title: "", description: "", module: "Other", severity: "Medium" };

export default function BugTrackerPage({ user }) {
  const isManager = ["ADMIN", "VP", "CEO", "OH"].includes(user?.role);
  const username  = user?.username;

  // ── List state ────────────────────────────────────────────────────────────
  const [bugs, setBugs]         = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [busyId, setBusyId]     = useState(null);
  const [file, setFile]         = useState(null);

  const [filterStatus, setFilterStatus]     = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterModule, setFilterModule]     = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [search, setSearch]                 = useState("");

  // ── Modal state ───────────────────────────────────────────────────────────
  const [viewBug, setViewBug]         = useState(null);
  const [editMode, setEditMode]       = useState(false);
  const [editForm, setEditForm]       = useState({});
  const [editErrors, setEditErrors]   = useState({});
  const [editSaving, setEditSaving]   = useState(false);
  const [comments, setComments]       = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  // ── Load bugs ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await bugApi.getFiltered({
        status:     filterStatus   || undefined,
        severity:   filterSeverity || undefined,
        module:     filterModule   || undefined,
        assignedTo: filterAssigned || undefined,
        search:     search.trim()  || undefined,
      });
      setBugs(r.data?.data || []);
    } catch {
      setBugs([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity, filterModule, filterAssigned, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    usersApi.getAll().then(r => setUsers(r.data?.data || [])).catch(() => {});
  }, []);

  // ── Load comments when modal opens ────────────────────────────────────────
  const loadComments = useCallback(async (id) => {
    try {
      const r = await bugApi.getComments(id);
      setComments(r.data?.data || []);
    } catch { setComments([]); }
  }, []);

  const openView = (bug) => {
    setViewBug(bug);
    setEditMode(false);
    setEditForm({});
    setEditErrors({});
    setCommentText("");
    loadComments(bug.id);
  };

  const openEdit = (bug) => {
    setViewBug(bug);
    setEditMode(true);
    setEditForm({ title: bug.title, description: bug.description, module: bug.module, severity: bug.severity });
    setEditErrors({});
    setCommentText("");
    loadComments(bug.id);
  };

  const closeModal = () => {
    setViewBug(null);
    setEditMode(false);
    setComments([]);
    setCommentText("");
  };

  // ── Bug report form ───────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.title.trim())       e.title       = "Required";
    if (!form.description.trim()) e.description = "Required";
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
      const r = await bugApi.create({ ...form, reportedBy: username, attachmentUrl });
      if (r.data?.success) {
        await load();
        setShowForm(false);
        setForm(EMPTY_FORM);
        setFile(null);
        setErrors({});
      } else { alert(r.data?.message || "Failed to report bug"); }
    } catch (err) { alert(err.response?.data?.message || "Failed to report bug"); }
    finally { setSaving(false); }
  };

  // ── Inline table handlers (pass actorUsername for audit log) ──────────────
  const handleStatusChange = async (id, status) => {
    setBusyId(id);
    try {
      const r = await bugApi.updateStatus(id, status, username);
      if (r.data?.success) await load();
      else alert(r.data?.message || "Failed");
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setBusyId(null); }
  };

  const handleSeverityChange = async (id, severity) => {
    setBusyId(id);
    try {
      const r = await bugApi.updateSeverity(id, severity, username);
      if (r.data?.success) await load();
      else alert(r.data?.message || "Failed");
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setBusyId(null); }
  };

  const handleAssignChange = async (id, assignedTo) => {
    setBusyId(id);
    try {
      const r = await bugApi.assign(id, assignedTo, username);
      if (r.data?.success) await load();
      else alert(r.data?.message || "Failed");
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this bug report?")) return;
    setBusyId(id);
    try {
      await bugApi.delete(id);
      await load();
    } catch (err) { alert(err.response?.data?.message || "Failed to delete"); }
    finally { setBusyId(null); }
  };

  // ── Modal edit save ───────────────────────────────────────────────────────
  const handleEditSave = async () => {
    const e = {};
    if (!editForm.title?.trim())       e.title       = "Required";
    if (!editForm.description?.trim()) e.description = "Required";
    if (Object.keys(e).length) { setEditErrors(e); return; }
    setEditSaving(true);
    try {
      const r = await bugApi.update(viewBug.id, { ...editForm, actorUsername: username });
      if (r.data?.success) {
        await load();
        const updated = r.data.data;
        setViewBug(updated);
        setEditMode(false);
        await loadComments(updated.id);
      } else { alert(r.data?.message || "Failed to update"); }
    } catch (err) { alert(err.response?.data?.message || "Failed to update"); }
    finally { setEditSaving(false); }
  };

  // ── Add comment ───────────────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setCommentSaving(true);
    try {
      const r = await bugApi.addComment(viewBug.id, commentText, username);
      if (r.data?.success) {
        setCommentText("");
        await loadComments(viewBug.id);
      } else { alert(r.data?.message || "Failed"); }
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setCommentSaving(false); }
  };

  const counts = useMemo(() => {
    const c = { Open: 0, "In Progress": 0, Testing: 0, Resolved: 0, Closed: 0 };
    bugs.forEach(b => { if (c[b.status] !== undefined) c[b.status]++; });
    return c;
  }, [bugs]);

  const hasFilters = filterStatus || filterSeverity || filterModule || filterAssigned || search;
  const clearFilters = () => {
    setFilterStatus(""); setFilterSeverity(""); setFilterModule("");
    setFilterAssigned(""); setSearch("");
  };

  // ── Style tokens ──────────────────────────────────────────────────────────
  const statCard = (accent) => ({
    background: "#fff", borderRadius: 12, padding: "18px 22px",
    flex: 1, border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`,
  });
  const TH = {
    background: "#f8fafc", padding: "12px 14px", textAlign: "left",
    fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
    fontWeight: 700, fontSize: 12, color: "#475569",
    textTransform: "uppercase", letterSpacing: 0.5,
    borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
  };
  const TD = (extra = {}) => ({
    padding: "12px 14px", color: "#0f172a",
    borderBottom: "1px solid #f1f5f9", fontSize: 14, fontWeight: 500,
    verticalAlign: "middle", ...extra,
  });
  const INP = (err) => ({
    border: `1.5px solid ${err ? "#ef4444" : "#e2e8f0"}`, borderRadius: 8,
    padding: "10px 13px", fontSize: 14, fontFamily: "inherit",
    outline: "none", width: "100%", boxSizing: "border-box", color: "#0f172a",
    background: "#fff",
  });
  const LBL = { fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" };
  const badge = (cfg) => ({ background: cfg.bg, color: cfg.color, borderRadius: 5, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" });
  const selectSm = { border: "1.5px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 12.5, fontFamily: "inherit", outline: "none", color: "#0f172a", background: "#fff", cursor: "pointer" };

  const usersByUsername = useMemo(() => {
    const map = {};
    users.forEach(u => { map[u.username] = u; });
    return map;
  }, [users]);

  const selectStatus = (status) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.Open;
    return { ...selectSm, background: cfg.bg, color: cfg.color, fontWeight: 700, border: "none" };
  };

  const MLBL = { fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 };

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Stat cards */}
      <div className="hr-stat-flex" style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Open",        value: counts.Open,           accent: "#3a6fa5" },
          { label: "In Progress", value: counts["In Progress"], accent: "#a07820" },
          { label: "Testing",     value: counts.Testing,        accent: "#6450b0" },
          { label: "Resolved",    value: counts.Resolved,       accent: "#2a8a68" },
          { label: "Closed",      value: counts.Closed,         accent: "#7a8a9a" },
        ].map(k => (
          <div key={k.label} style={statCard(k.accent)}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{k.label}</div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>Bug Tracker</div>
          <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>Report issues and track their resolution</div>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setErrors({}); }}
          style={{ border: "none", borderRadius: 8, padding: "9px 18px", background: "#1e3a5f", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          + Report Bug
        </button>
      </div>

      {/* New bug form */}
      {showForm && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "22px 26px", marginBottom: 24, maxWidth: 620 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 18 }}>Report a Bug</div>
          <form onSubmit={handleSubmit} className="hr-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Title *</label>
              <input type="text" style={INP(errors.title)} placeholder="Short summary of the issue"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              {errors.title && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.title}</div>}
            </div>
            <div>
              <label style={LBL}>Module / Page</label>
              <select style={INP()} value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))}>
                {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Severity</label>
              <select style={INP()} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Description *</label>
              <textarea style={{ ...INP(errors.description), resize: "vertical", minHeight: 90 }}
                placeholder="Steps to reproduce, expected vs actual behaviour, etc."
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              {errors.description && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.description}</div>}
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" }}>
                Attachment <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional — screenshot, image or PDF, max 20MB)</span>
              </label>
              <label style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                border: "1.5px dashed #cbd5e1", borderRadius: 8, padding: "10px 14px",
                background: file ? "#f0fdf4" : "#f8fafc", color: file ? "#059669" : "#94a3b8",
                fontSize: 13, fontWeight: 500,
              }}>
                <span style={{ fontSize: 18 }}>📎</span>
                <span>{file ? file.name : "Click to attach a screenshot or file"}</span>
                <input type="file" accept="image/*,application/pdf,.doc,.docx" style={{ display: "none" }}
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
                {saving ? "Submitting…" : "Submit Bug Report"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "12px 22px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Status</label>
          <select style={{ ...INP(), minWidth: 140, width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Severity</label>
          <select style={{ ...INP(), minWidth: 140, width: "auto" }} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
            <option value="">All Severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Module</label>
          <select style={{ ...INP(), minWidth: 150, width: "auto" }} value={filterModule} onChange={e => setFilterModule(e.target.value)}>
            <option value="">All Modules</option>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Assigned To</label>
          <select style={{ ...INP(), minWidth: 160, width: "auto" }} value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
            <option value="">Anyone</option>
            {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Search</label>
          <input type="text" style={INP()} placeholder="Search title or description…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {hasFilters && (
          <button onClick={clearFilters}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Bugs table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 52, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>Loading…</div>
        ) : bugs.length === 0 ? (
          <div style={{ padding: 52, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
            {hasFilters ? "No bugs match the selected filters." : 'No bugs reported yet. Click "+ Report Bug" to get started.'}
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {["S.No", "Title", "Module", "Severity", "Status", "Reported By", "Assigned To", "Attachment", "Created / Updated", ...(isManager ? ["Action"] : [])].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bugs.map((b, idx) => {
                  const sev    = SEVERITY_CFG[b.severity] || SEVERITY_CFG.Medium;
                  const st     = STATUS_CFG[b.status]     || STATUS_CFG.Open;
                  const isBusy = busyId === b.id;
                  const wasUpdated = b.updatedAt && b.createdAt && b.updatedAt !== b.createdAt;
                  return (
                    <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => openView(b)}>
                      <td style={TD({ color: "#94a3b8", fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" })} onClick={e => e.stopPropagation()}>{idx + 1}</td>
                      <td style={TD({ maxWidth: 260 })}>
                        <div style={{ fontWeight: 700, color: "#1e3a5f", textDecoration: "underline", textDecorationColor: "#cbd5e1" }}>{b.title}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.description}>
                          {b.description}
                        </div>
                      </td>
                      <td style={TD()} onClick={e => e.stopPropagation()}>
                        <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{b.module}</span>
                      </td>
                      <td style={TD()} onClick={e => e.stopPropagation()}>
                        {isManager ? (
                          <select style={selectSm} value={b.severity} disabled={isBusy}
                            onChange={e => handleSeverityChange(b.id, e.target.value)}>
                            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={badge(sev)}>{b.severity}</span>
                        )}
                      </td>
                      <td style={TD()} onClick={e => e.stopPropagation()}>
                        {isManager ? (
                          <select style={selectStatus(b.status)} value={b.status} disabled={isBusy}
                            onChange={e => handleStatusChange(b.id, e.target.value)}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={badge(st)}>{b.status}</span>
                        )}
                      </td>
                      <td style={TD({ whiteSpace: "nowrap" })}>
                        <div>{b.reportedByName || b.reportedBy}</div>
                        {usersByUsername[b.reportedBy]?.role && (
                          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>
                            {ROLE_LABELS[usersByUsername[b.reportedBy].role] || usersByUsername[b.reportedBy].role}
                          </div>
                        )}
                      </td>
                      <td style={TD()} onClick={e => e.stopPropagation()}>
                        {isManager ? (
                          <select style={selectSm} value={b.assignedTo || ""} disabled={isBusy}
                            onChange={e => handleAssignChange(b.id, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        ) : (
                          b.assignedToName || <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                      <td style={TD()}>
                        {b.attachmentUrl
                          ? /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(b.attachmentUrl)
                            ? <a href={attachmentFullUrl(b.attachmentUrl)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                <img src={attachmentFullUrl(b.attachmentUrl)} alt="attachment"
                                  style={{ width: 56, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0", display: "block" }} />
                              </a>
                            : <a href={attachmentFullUrl(b.attachmentUrl)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                style={{ color: "#1e3a5f", fontWeight: 600, fontSize: 12.5, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                📄 View
                              </a>
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={TD({ whiteSpace: "nowrap", color: "#64748b" })}>
                        <div>{fmtDateTime(b.createdAt)}</div>
                        {wasUpdated && (
                          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                            Updated: {fmtDateTime(b.updatedAt)}
                          </div>
                        )}
                      </td>
                      {isManager && (
                        <td style={TD()} onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => openEdit(b)} disabled={isBusy}
                              style={{ background: "#eff6ff", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#2563eb", fontFamily: "inherit", opacity: isBusy ? 0.6 : 1 }}>
                              Edit
                            </button>
                            <button onClick={() => handleDelete(b.id)} disabled={isBusy}
                              style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: "inherit", opacity: isBusy ? 0.6 : 1 }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── View / Edit modal ─────────────────────────────────────────────── */}
      {viewBug && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, padding: "28px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", marginBottom: 32 }}>

            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
                  Bug #{viewBug.id}
                </div>
                {editMode ? (
                  <>
                    <input style={INP(editErrors.title)} value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Bug title" />
                    {editErrors.title && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{editErrors.title}</div>}
                  </>
                ) : (
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.35 }}>{viewBug.title}</div>
                )}
              </div>
              <button onClick={closeModal}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#94a3b8", lineHeight: 1, padding: 4, flexShrink: 0 }}>✕</button>
            </div>

            {/* Fields grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 20px", marginBottom: 20 }}>
              <div>
                <div style={MLBL}>Module</div>
                {editMode
                  ? <select style={INP()} value={editForm.module} onChange={e => setEditForm(f => ({ ...f, module: e.target.value }))}>
                      {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  : <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 5, padding: "3px 10px", fontSize: 13, fontWeight: 600 }}>{viewBug.module}</span>}
              </div>
              <div>
                <div style={MLBL}>Severity</div>
                {editMode
                  ? <select style={INP()} value={editForm.severity} onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))}>
                      {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  : <span style={badge(SEVERITY_CFG[viewBug.severity] || SEVERITY_CFG.Medium)}>{viewBug.severity}</span>}
              </div>
              <div>
                <div style={MLBL}>Status</div>
                <span style={badge(STATUS_CFG[viewBug.status] || STATUS_CFG.Open)}>{viewBug.status}</span>
              </div>
              <div>
                <div style={MLBL}>Assigned To</div>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>
                  {viewBug.assignedToName || <span style={{ color: "#cbd5e1" }}>Unassigned</span>}
                </div>
              </div>
              <div>
                <div style={MLBL}>Reported By</div>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>{viewBug.reportedByName || viewBug.reportedBy}</div>
                {usersByUsername[viewBug.reportedBy]?.role && (
                  <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 1 }}>
                    {ROLE_LABELS[usersByUsername[viewBug.reportedBy].role] || usersByUsername[viewBug.reportedBy].role}
                  </div>
                )}
              </div>
              <div>
                <div style={MLBL}>Created</div>
                <div style={{ fontSize: 12.5, color: "#64748b" }}>{fmtDateTime(viewBug.createdAt)}</div>
                {viewBug.updatedAt && viewBug.updatedAt !== viewBug.createdAt && (
                  <>
                    <div style={{ ...MLBL, marginTop: 8 }}>Last Updated</div>
                    <div style={{ fontSize: 12.5, color: "#64748b" }}>{fmtDateTime(viewBug.updatedAt)}</div>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <div style={MLBL}>Description</div>
              {editMode ? (
                <>
                  <textarea style={{ ...INP(editErrors.description), resize: "vertical", minHeight: 100 }}
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                  {editErrors.description && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{editErrors.description}</div>}
                </>
              ) : (
                <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.65, whiteSpace: "pre-wrap", background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
                  {viewBug.description}
                </div>
              )}
            </div>

            {/* Attachment */}
            {viewBug.attachmentUrl && (
              <div style={{ marginBottom: 20 }}>
                <div style={MLBL}>Attachment</div>
                {/\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(viewBug.attachmentUrl)
                  ? <a href={attachmentFullUrl(viewBug.attachmentUrl)} target="_blank" rel="noreferrer">
                      <img src={attachmentFullUrl(viewBug.attachmentUrl)} alt="attachment"
                        style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, border: "1px solid #e2e8f0", display: "block" }} />
                    </a>
                  : <a href={attachmentFullUrl(viewBug.attachmentUrl)} target="_blank" rel="noreferrer"
                      style={{ color: "#1e3a5f", fontWeight: 600, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      📄 View Attachment
                    </a>}
              </div>
            )}

            {/* Modal action buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingBottom: 20, borderBottom: "1px solid #f1f5f9", marginBottom: 24 }}>
              {editMode ? (
                <>
                  <button onClick={handleEditSave} disabled={editSaving}
                    style={{ border: "none", borderRadius: 8, padding: "9px 22px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", opacity: editSaving ? 0.7 : 1 }}>
                    {editSaving ? "Saving…" : "Save Changes"}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditErrors({}); }}
                    style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {isManager && (
                    <button onClick={() => openEdit(viewBug)}
                      style={{ border: "none", borderRadius: 8, padding: "9px 22px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                      Edit
                    </button>
                  )}
                  <button onClick={closeModal}
                    style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                    Close
                  </button>
                </>
              )}
            </div>

            {/* Comments / Activity log */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Activity & Comments</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, maxHeight: 320, overflowY: "auto" }}>
                {comments.length === 0
                  ? <div style={{ color: "#cbd5e1", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No activity yet.</div>
                  : comments.map(c => {
                      const cfg = COMMENT_TYPE_CFG[c.type] || COMMENT_TYPE_CFG.COMMENT;
                      return (
                        <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                            {cfg.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13.5, color: "#0f172a", lineHeight: 1.5 }}>{c.commentText}</div>
                            <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                              {fmtDateTime(c.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
              </div>

              {/* Add comment input */}
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  rows={2}
                  placeholder="Add a comment…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                  style={{ ...INP(), resize: "none", flex: 1, padding: "8px 12px" }} />
                <button onClick={handleAddComment} disabled={commentSaving || !commentText.trim()}
                  style={{ border: "none", borderRadius: 8, padding: "8px 16px", background: "#1e3a5f", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-end", opacity: commentSaving || !commentText.trim() ? 0.5 : 1 }}>
                  {commentSaving ? "…" : "Send"}
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>Press Enter to send, Shift+Enter for new line</div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
