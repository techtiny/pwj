import { useEffect, useState, useCallback, useMemo } from "react";
import { bugApi, fmtDateTime } from "./bugApi";
import { usersApi, uploadDocument, attachmentFullUrl } from "../hr/hrApi";

const MODULES    = ["Vendors", "Projects", "HR", "Procurement", "Account", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES   = ["Open", "In Progress", "Testing", "Resolved", "Closed"];

const SEVERITY_CFG = {
  Low:      { bg: "#f1f5f9", color: "#475569" },
  Medium:   { bg: "#fffbeb", color: "#d97706" },
  High:     { bg: "#fff7ed", color: "#ea580c" },
  Critical: { bg: "#fef2f2", color: "#dc2626" },
};

const STATUS_CFG = {
  Open:        { bg: "#eff6ff", color: "#2563eb" },
  "In Progress": { bg: "#fffbeb", color: "#d97706" },
  Testing:     { bg: "#f5f3ff", color: "#7c3aed" },
  Resolved:    { bg: "#ecfdf5", color: "#059669" },
  Closed:      { bg: "#f8fafc", color: "#94a3b8" },
};

const EMPTY_FORM = { title: "", description: "", module: "Other", severity: "Medium" };

export default function BugTrackerPage({ user }) {
  const isManager = ["ADMIN", "VP", "CEO", "OH"].includes(user?.role);
  const username = user?.username;

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await bugApi.getFiltered({
        status: filterStatus || undefined,
        severity: filterSeverity || undefined,
        module: filterModule || undefined,
        assignedTo: filterAssigned || undefined,
        search: search.trim() || undefined,
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

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = "Required";
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
      } else {
        alert(r.data?.message || "Failed to report bug");
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to report bug");
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (id, status) => {
    setBusyId(id);
    try {
      const r = await bugApi.updateStatus(id, status);
      if (r.data?.success) await load();
      else alert(r.data?.message || "Failed");
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setBusyId(null); }
  };

  const handleSeverityChange = async (id, severity) => {
    setBusyId(id);
    try {
      const r = await bugApi.updateSeverity(id, severity);
      if (r.data?.success) await load();
      else alert(r.data?.message || "Failed");
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setBusyId(null); }
  };

  const handleAssignChange = async (id, assignedTo) => {
    setBusyId(id);
    try {
      const r = await bugApi.assign(id, assignedTo);
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

  const counts = useMemo(() => {
    const c = { Open: 0, "In Progress": 0, Testing: 0, Resolved: 0, Closed: 0 };
    bugs.forEach(b => { if (c[b.status] !== undefined) c[b.status]++; });
    return c;
  }, [bugs]);

  const hasFilters = filterStatus || filterSeverity || filterModule || filterAssigned || search;
  const clearFilters = () => {
    setFilterStatus(""); setFilterSeverity(""); setFilterModule(""); setFilterAssigned(""); setSearch("");
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

  const assignableUsers = users.filter(u => !u.username?.startsWith("test_"));

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Stat cards */}
      <div className="hr-stat-flex" style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Open",        value: counts.Open,        accent: "#2563eb" },
          { label: "In Progress",  value: counts["In Progress"], accent: "#d97706" },
          { label: "Testing",     value: counts.Testing,     accent: "#7c3aed" },
          { label: "Resolved",    value: counts.Resolved,    accent: "#059669" },
          { label: "Closed",      value: counts.Closed,      accent: "#94a3b8" },
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
              <input type="text" style={INP(errors.title)}
                placeholder="Short summary of the issue"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              {errors.title && <div style={{ fontSize: 11.5, color: "#ef4444", marginTop: 3 }}>{errors.title}</div>}
            </div>

            <div>
              <label style={LBL}>Module / Page</label>
              <select style={INP()} value={form.module}
                onChange={e => setForm(f => ({ ...f, module: e.target.value }))}>
                {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label style={LBL}>Severity</label>
              <select style={INP()} value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={LBL}>Description *</label>
              <textarea style={{ ...INP(errors.description), resize: "vertical", minHeight: 90 }}
                placeholder="Steps to reproduce, expected vs actual behaviour, etc."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
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
            {assignableUsers.map(u => <option key={u.username} value={u.username}>{u.fullName || u.username}</option>)}
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
                  {["Title", "Module", "Severity", "Status", "Reported By", "Assigned To", "Attachment", "Created", ...(isManager ? ["Action"] : [])].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bugs.map(b => {
                  const sev = SEVERITY_CFG[b.severity] || SEVERITY_CFG.Medium;
                  const st  = STATUS_CFG[b.status] || STATUS_CFG.Open;
                  const isBusy = busyId === b.id;
                  return (
                    <tr key={b.id}>
                      <td style={TD({ maxWidth: 260 })}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{b.title}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.description}>
                          {b.description}
                        </div>
                      </td>
                      <td style={TD()}>
                        <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>{b.module}</span>
                      </td>
                      <td style={TD()}>
                        {isManager ? (
                          <select style={selectSm} value={b.severity} disabled={isBusy}
                            onChange={e => handleSeverityChange(b.id, e.target.value)}>
                            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={badge(sev)}>{b.severity}</span>
                        )}
                      </td>
                      <td style={TD()}>
                        {isManager ? (
                          <select style={selectSm} value={b.status} disabled={isBusy}
                            onChange={e => handleStatusChange(b.id, e.target.value)}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={badge(st)}>{b.status}</span>
                        )}
                      </td>
                      <td style={TD({ whiteSpace: "nowrap" })}>{b.reportedByName || b.reportedBy}</td>
                      <td style={TD()}>
                        {isManager ? (
                          <select style={selectSm} value={b.assignedTo || ""} disabled={isBusy}
                            onChange={e => handleAssignChange(b.id, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {assignableUsers.map(u => <option key={u.username} value={u.username}>{u.fullName || u.username}</option>)}
                          </select>
                        ) : (
                          b.assignedToName || <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                      <td style={TD()}>
                        {b.attachmentUrl
                          ? /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(b.attachmentUrl)
                            ? <a href={attachmentFullUrl(b.attachmentUrl)} target="_blank" rel="noreferrer">
                                <img src={attachmentFullUrl(b.attachmentUrl)} alt="attachment"
                                  style={{ width: 56, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0", display: "block" }} />
                              </a>
                            : <a href={attachmentFullUrl(b.attachmentUrl)} target="_blank" rel="noreferrer"
                                style={{ color: "#1e3a5f", fontWeight: 600, fontSize: 12.5, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                📄 View
                              </a>
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={TD({ whiteSpace: "nowrap", color: "#64748b" })}>{fmtDateTime(b.createdAt)}</td>
                      {isManager && (
                        <td style={TD()}>
                          <button onClick={() => handleDelete(b.id)} disabled={isBusy}
                            style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: "inherit", opacity: isBusy ? 0.6 : 1 }}>
                            Delete
                          </button>
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
    </div>
  );
}
