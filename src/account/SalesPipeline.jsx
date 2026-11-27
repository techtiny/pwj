import { useEffect, useState, useCallback } from "react";
import { salesApi, formatLakh } from "./accountApi";
import { DeleteBtn } from "../ActionButtons";
import { usersApi } from "../hr/hrApi";

const STAGES = [
  { key: "PROSPECT",    label: "Prospect",    color: "#6366f1", bg: "#eef2ff" },
  { key: "QUALIFIED",   label: "Qualified",   color: "#3b82f6", bg: "#eff6ff" },
  { key: "PROPOSAL",    label: "Proposal",    color: "#f59e0b", bg: "#fffbeb" },
  { key: "NEGOTIATION", label: "Negotiation", color: "#f97316", bg: "#fff7ed" },
  { key: "WON",         label: "Won",         color: "#10b981", bg: "#ecfdf5" },
  { key: "LOST",        label: "Lost",        color: "#ef4444", bg: "#fef2f2" },
];

const SOURCES        = ["REPEAT_CLIENT", "DIRECT", "TENDER", "ONLINE", "OTHER"];
const BUSINESS_TYPES = ["Commercial Interior", "Residential", "Construction", "Renovation"];

const EMPTY_FORM = {
  title: "", client: "", contactPerson: "", contactPhone: "", contactEmail: "",
  stage: "PROSPECT", source: "", businessType: "", location: "", description: "",
  notes: "", dealValue: "", quoteValue: "", probabilityPct: "",
  expectedCloseDate: "", actualCloseDate: "", assignedTo: "",
};

function stageOf(key) { return STAGES.find(s => s.key === key) || STAGES[0]; }
// Forward moves: each stage goes to the next one; Negotiation closes as either Won or Lost; Won / Lost are final.
const NEXT = { PROSPECT: ["QUALIFIED"], QUALIFIED: ["PROPOSAL"], PROPOSAL: ["NEGOTIATION"], NEGOTIATION: ["WON", "LOST"] };
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const prettySource = (s) => (!s ? "—" : s.toUpperCase() === s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ").replace(/ \w/g, c => c.toUpperCase()) : s);

export default function SalesPipeline() {
  const [leads, setLeads]         = useState([]);
  const [summary, setSummary]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [errors, setErrors]       = useState({});
  const [saving, setSaving]       = useState(false);
  const [view, setView]           = useState("board");
  const [filterStage, setFilter]  = useState("ALL");
  const [detail, setDetail]       = useState(null);   // lead opened in the details view

  const load = useCallback(async () => {
    try {
      const [lRes, sRes] = await Promise.all([salesApi.getAll(), salesApi.getSummary()]);
      setLeads(lRes.data);
      setDetail(d => d ? (lRes.data || []).find(l => l.id === d.id) || null : d);
      setSummary(sRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // "Assigned To" is picked from the active Costing & Planning Engineers.
  const [costingEngineers, setCostingEngineers] = useState([]);
  useEffect(() => {
    usersApi.getAll()
      .then(r => setCostingEngineers((r.data?.data || []).filter(u => u.role === "COSTING_PLANNING_ENGINEER" && u.active !== false && !u.exited)))
      .catch(() => setCostingEngineers([]));
  }, []);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setErrors({}); setShowModal(true); };
  const openEdit = (lead) => {
    setEditing(lead);
    setForm({
      title:             lead.title             || "",
      client:            lead.client            || "",
      contactPerson:     lead.contactPerson     || "",
      contactPhone:      lead.contactPhone      || "",
      contactEmail:      lead.contactEmail      || "",
      stage:             lead.stage             || "PROSPECT",
      source:            lead.source            || "",
      businessType:      lead.businessType      || "",
      location:          lead.location          || "",
      description:       lead.description       || "",
      notes:             lead.notes             || "",
      dealValue:         lead.dealValue   != null ? String(lead.dealValue)         : "",
      quoteValue:        lead.quoteValue  != null ? String(lead.quoteValue)        : "",
      probabilityPct:    lead.probabilityPct != null ? String(lead.probabilityPct) : "",
      expectedCloseDate: lead.expectedCloseDate || "",
      actualCloseDate:   lead.actualCloseDate   || "",
      assignedTo:        lead.assignedTo        || "",
    });
    setErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const e = {};
    if (!form.title.trim())  e.title  = "Title is required";
    if (!form.client.trim()) e.client = "Client is required";
    if (form.dealValue && isNaN(parseFloat(form.dealValue))) e.dealValue = "Must be a number";
    if (form.probabilityPct) {
      const p = parseInt(form.probabilityPct);
      if (isNaN(p) || p < 0 || p > 100) e.probabilityPct = "0–100 only";
    }
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        dealValue:      form.dealValue      ? parseFloat(form.dealValue)    : 0,
        quoteValue:     form.quoteValue     ? parseFloat(form.quoteValue)   : null,
        probabilityPct: form.probabilityPct ? parseInt(form.probabilityPct) : null,
        expectedCloseDate: form.expectedCloseDate || null,
        actualCloseDate:   form.actualCloseDate   || null,
      };
      editing ? await salesApi.update(editing.id, payload) : await salesApi.create(payload);
      await load();
      setShowModal(false);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    await salesApi.delete(id);
    await load();
  };

  const moveStage = async (lead, newStage) => {
    await salesApi.update(lead.id, { ...lead, stage: newStage });
    await load();
  };

  const f = (v) => setForm(prev => ({ ...prev, ...v }));
  const filtered = filterStage === "ALL" ? leads : leads.filter(l => l.stage === filterStage);

  const inp = { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: "var(--hz-text-lg)", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", color: "var(--hz-ink)" };
  const lbl = { fontSize: "var(--hz-text-md)", fontWeight: 600, color: "var(--hz-ink-2)", marginBottom: 5, display: "block" };

  return (
    <div style={{ padding: "16px 16px", background: "#f8fafc", minHeight: "calc(100vh - 148px)" }}>
      <style>{`.lead-row:hover { background: #f8fafc; } .lead-card:hover { border-color: #94a3b8 !important; box-shadow: 0 2px 8px rgba(15,23,42,.08); } @media (max-width: 768px) { .sales-lead-form { grid-template-columns: 1fr !important; padding: 16px !important; } .sales-lead-form > div { grid-column: 1 / -1 !important; } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: "var(--hz-text-2xl)", fontWeight: 800, color: "var(--hz-ink)" }}>Pipeline</div>
          <div style={{ fontSize: "var(--hz-text-lg)", color: "var(--hz-muted)", marginTop: 2 }}>
            {leads.length} leads · {summary ? formatLakh(summary.pipelineValue) : "…"} active pipeline
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView(v => v === "board" ? "list" : "board")}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", cursor: "pointer", fontSize: "var(--hz-text-lg)", fontFamily: "inherit", fontWeight: 600, color: "var(--hz-ink-2)" }}>
            {view === "board" ? "☰ List" : "⊞ Board"}
          </button>
          <button onClick={openAdd}
            style={{ border: "none", borderRadius: 8, padding: "8px 18px", background: "linear-gradient(135deg,#10b981,#059669)", cursor: "pointer", fontSize: "var(--hz-text-lg)", fontFamily: "inherit", fontWeight: 700, color: "var(--hz-on-dark)" }}>
            + Add Lead
          </button>
        </div>
      </div>

      {/* Stage filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[{ key: "ALL", label: "All", color: "var(--hz-muted)", bg: "#f1f5f9" }, ...STAGES].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            style={{ padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: "var(--hz-text-md)", fontWeight: 600, fontFamily: "inherit",
              background: filterStage === s.key ? s.color : (s.bg || "#f1f5f9"),
              color:      filterStage === s.key ? "var(--hz-on-dark)"  : (s.color || "var(--hz-muted)") }}>
            {s.label}
            {s.key !== "ALL" && summary?.stages?.[s.key] && (
              <span style={{ marginLeft: 5, opacity: 0.85 }}>({summary.stages[s.key].count})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--hz-faint)" }}>Loading…</div>
      ) : view === "board" ? (
        <div className="kanban-board" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage.key);
            const stageVal   = stageLeads.reduce((s, l) => s + (l.dealValue || 0), 0);
            return (
              <div key={stage.key} style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0", minHeight: 100 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: stage.color, display: "inline-block" }} />
                    <span style={{ fontWeight: 700, fontSize: "var(--hz-text-lg)", color: "var(--hz-ink)" }}>{stage.label}</span>
                    <span style={{ background: stage.bg, color: stage.color, borderRadius: 10, padding: "1px 8px", fontSize: "var(--hz-text-md)", fontWeight: 700 }}>{stageLeads.length}</span>
                  </div>
                  <span style={{ fontSize: "var(--hz-text-md)", color: "var(--hz-muted)", fontWeight: 600 }}>{formatLakh(stageVal)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stageLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onOpen={setDetail} onEdit={openEdit} onDelete={handleDelete} onMove={moveStage} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--hz-text-lg)" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Title","Client","Stage","Deal Value","Probability","Expected Close","Assigned",""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "var(--hz-ink-2)", fontSize: "var(--hz-text-md)", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const st = stageOf(lead.stage);
                return (
                  <tr key={lead.id} onClick={() => setDetail(lead)} title="Open lead details" className="lead-row"
                    style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--hz-ink)" }}>{lead.title}</td>
                    <td style={{ padding: "10px 14px", color: "var(--hz-ink-2)" }}>{lead.client || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ background: st.bg, color: st.color, borderRadius: 8, padding: "3px 10px", fontSize: "var(--hz-text-md)", fontWeight: 700 }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatLakh(lead.dealValue)}</td>
                    <td style={{ padding: "10px 14px", color: "var(--hz-ink-2)" }}>{lead.probabilityPct != null ? `${lead.probabilityPct}%` : "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--hz-ink-2)" }}>{lead.expectedCloseDate || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--hz-ink-2)" }}>{lead.assignedTo || "—"}</td>
                    <td style={{ padding: "10px 14px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={() => openEdit(lead)} style={{ background: "#eff6ff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: "var(--hz-text-md)", fontWeight: 600, color: "#3b82f6", fontFamily: "inherit" }}>Edit</button>
                        <DeleteBtn onClick={() => handleDelete(lead.id)} title="Delete" />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--hz-faint)" }}>No leads found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && !showModal && (
        <LeadDetail lead={detail} onClose={() => setDetail(null)}
          onEdit={() => openEdit(detail)}
          onMove={async (st) => { await moveStage(detail, st); }}
          onDelete={() => handleDelete(detail.id)} />
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 660, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: "var(--hz-text-xl)", color: "var(--hz-ink)" }}>{editing ? "Edit Lead" : "New Sales Lead"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: "var(--hz-text-2xl)", color: "var(--hz-muted)" }}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="sales-lead-form" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Lead Title *</label>
                <input style={{ ...inp, borderColor: errors.title ? "#ef4444" : "#e2e8f0" }} value={form.title} onChange={e => f({ title: e.target.value })} placeholder="e.g. Electrical work – XYZ Tower" />
                {errors.title && <div style={{ fontSize: "var(--hz-text-md)", color: "#ef4444", marginTop: 3 }}>{errors.title}</div>}
              </div>
              <div>
                <label style={lbl}>Client *</label>
                <input style={{ ...inp, borderColor: errors.client ? "#ef4444" : "#e2e8f0" }} value={form.client} onChange={e => f({ client: e.target.value })} placeholder="Client / Company" />
                {errors.client && <div style={{ fontSize: "var(--hz-text-md)", color: "#ef4444", marginTop: 3 }}>{errors.client}</div>}
              </div>
              <div>
                <label style={lbl}>Stage</label>
                <select style={inp} value={form.stage} onChange={e => f({ stage: e.target.value })}>
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Contact Person</label>
                <input style={inp} value={form.contactPerson} onChange={e => f({ contactPerson: e.target.value })} placeholder="Name" />
              </div>
              <div>
                <label style={lbl}>Phone</label>
                <input style={inp} value={form.contactPhone} onChange={e => f({ contactPhone: e.target.value })} placeholder="+91 …" />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={form.contactEmail} onChange={e => f({ contactEmail: e.target.value })} placeholder="contact@company.com" />
              </div>
              <div>
                <label style={lbl}>Deal Value (₹)</label>
                <input style={{ ...inp, borderColor: errors.dealValue ? "#ef4444" : "#e2e8f0" }} type="number" value={form.dealValue} onChange={e => f({ dealValue: e.target.value })} placeholder="0" />
                {errors.dealValue && <div style={{ fontSize: "var(--hz-text-md)", color: "#ef4444", marginTop: 3 }}>{errors.dealValue}</div>}
              </div>
              <div>
                <label style={lbl}>Quote Value (₹)</label>
                <input style={inp} type="number" value={form.quoteValue} onChange={e => f({ quoteValue: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Win Probability (%)</label>
                <input style={{ ...inp, borderColor: errors.probabilityPct ? "#ef4444" : "#e2e8f0" }} type="number" min="0" max="100" value={form.probabilityPct} onChange={e => f({ probabilityPct: e.target.value })} placeholder="50" />
                {errors.probabilityPct && <div style={{ fontSize: "var(--hz-text-md)", color: "#ef4444", marginTop: 3 }}>{errors.probabilityPct}</div>}
              </div>
              <div>
                <label style={lbl}>Assigned To</label>
                <select style={inp} value={form.assignedTo} onChange={e => f({ assignedTo: e.target.value })}>
                  <option value="">— Select Costing & Planning Engineer —</option>
                  {/* keep a previously typed name selectable so editing an older lead doesn't wipe it */}
                  {form.assignedTo && !costingEngineers.some(u => u.fullName === form.assignedTo) && <option value={form.assignedTo}>{form.assignedTo}</option>}
                  {costingEngineers.map(u => (
                    <option key={u.id} value={u.fullName}>{u.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Lead Source</label>
                {/* "Other" takes any value — a source that isn't one of the standard options is shown as Other + its text */}
                <select style={inp} value={form.source && !SOURCES.includes(form.source) ? "OTHER" : form.source} onChange={e => f({ source: e.target.value })}>
                  <option value="">— Select —</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ").replace(/ \w/g, c => c.toUpperCase())}</option>)}
                </select>
                {(form.source === "OTHER" || (form.source && !SOURCES.includes(form.source))) && (
                  <input style={{ ...inp, marginTop: 6 }} value={form.source === "OTHER" ? "" : form.source}
                    onChange={e => f({ source: e.target.value.trim() ? e.target.value : "OTHER" })}
                    placeholder="Enter the lead source" autoFocus />
                )}
              </div>
              <div>
                <label style={lbl}>Business Type</label>
                <select style={inp} value={form.businessType} onChange={e => f({ businessType: e.target.value })}>
                  <option value="">— Select —</option>
                  {/* keep an older lead's previous type selectable so editing doesn't wipe it */}
                  {form.businessType && !BUSINESS_TYPES.includes(form.businessType) && <option value={form.businessType}>{form.businessType}</option>}
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Expected Close</label>
                <input style={inp} type="date" value={form.expectedCloseDate} onChange={e => f({ expectedCloseDate: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>Actual Close</label>
                <input style={inp} type="date" value={form.actualCloseDate} onChange={e => f({ actualCloseDate: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Location</label>
                <input style={inp} value={form.location} onChange={e => f({ location: e.target.value })} placeholder="City / Site" />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={form.description} onChange={e => f({ description: e.target.value })} placeholder="Brief description" />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Notes</label>
                <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={form.notes} onChange={e => f({ notes: e.target.value })} placeholder="Follow-up, internal notes…" />
              </div>
              <div style={{ gridColumn: "1/-1", display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, border: "none", borderRadius: 8, padding: "11px", background: "linear-gradient(135deg,#10b981,#059669)", color: "var(--hz-on-dark)", fontWeight: 700, fontSize: "var(--hz-text-lg)", cursor: "pointer", fontFamily: "inherit" }}>
                  {saving ? "Saving…" : editing ? "💾 Update Lead" : "+ Add Lead"}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "11px 20px", background: "#fff", color: "var(--hz-ink-2)", fontWeight: 600, fontSize: "var(--hz-text-lg)", cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, onOpen, onEdit, onDelete, onMove }) {
  const st        = stageOf(lead.stage);
  const nextStages = (NEXT[lead.stage] || []).map(stageOf);
  return (
    <div className="lead-card" onClick={() => onOpen(lead)} title="Open lead details"
      style={{ background: "#f8fafc", borderRadius: 10, padding: 12, border: "1px solid #e2e8f0", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: "var(--hz-text-lg)", color: "var(--hz-ink)", flex: 1, marginRight: 6 }}>{lead.title}</div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(lead)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--hz-faint)", padding: 2, fontSize: "var(--hz-text-lg)" }}>✏️</button>
          <DeleteBtn onClick={() => onDelete(lead.id)} title="Delete" size="sm" />
        </div>
      </div>
      {lead.client && <div style={{ fontSize: "var(--hz-text-md)", color: "var(--hz-muted)", marginBottom: 6 }}>{lead.client}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: "var(--hz-text-lg)", color: "var(--hz-ink)" }}>{formatLakh(lead.dealValue)}</div>
        {lead.probabilityPct != null && <div style={{ fontSize: "var(--hz-text-md)", color: st.color, fontWeight: 600 }}>{lead.probabilityPct}%</div>}
      </div>
      {lead.expectedCloseDate && <div style={{ fontSize: "var(--hz-text-md)", color: "var(--hz-faint)", marginTop: 4 }}>Close: {lead.expectedCloseDate}</div>}
      {nextStages.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
          {nextStages.map(n => (
            <button key={n.key} onClick={() => onMove(lead, n.key)}
              style={{ flex: 1, background: n.bg, color: n.color, border: `1px solid ${n.color}33`, borderRadius: 6, padding: "4px 8px", fontSize: "var(--hz-text-md)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              → {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Full details of one lead, opened by clicking it on the board or in the list.
function LeadDetail({ lead, onClose, onEdit, onMove, onDelete }) {
  const st = stageOf(lead.stage);
  const nextStages = (NEXT[lead.stage] || []).map(stageOf);
  const Field = ({ label, children, wide }) => (
    <div style={{ gridColumn: wide ? "1/-1" : undefined }}>
      <div style={{ fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: "var(--hz-text-lg)", color: "var(--hz-ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{children || "—"}</div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "var(--hz-text-xl)", color: "var(--hz-ink)" }}>{lead.title}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ background: st.bg, color: st.color, borderRadius: 8, padding: "3px 10px", fontSize: "var(--hz-text-md)", fontWeight: 700 }}>{st.label}</span>
              {lead.client && <span style={{ color: "var(--hz-muted)", fontSize: "var(--hz-text-md)" }}>{lead.client}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: "var(--hz-text-2xl)", color: "var(--hz-muted)", flexShrink: 0 }}>×</button>
        </div>
        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Deal Value">{formatLakh(lead.dealValue)}</Field>
          <Field label="Quote Value">{lead.quoteValue != null ? formatLakh(lead.quoteValue) : null}</Field>
          <Field label="Win Probability">{lead.probabilityPct != null ? `${lead.probabilityPct}%` : null}</Field>
          <Field label="Assigned To">{lead.assignedTo}</Field>
          <Field label="Expected Close">{lead.expectedCloseDate ? fmtDate(lead.expectedCloseDate) : null}</Field>
          <Field label="Actual Close">{lead.actualCloseDate ? fmtDate(lead.actualCloseDate) : null}</Field>
          <Field label="Contact Person">{lead.contactPerson}</Field>
          <Field label="Phone">{lead.contactPhone ? <a href={`tel:${lead.contactPhone}`} style={{ color: "var(--hz-primary)" }}>{lead.contactPhone}</a> : null}</Field>
          <Field label="Email">{lead.contactEmail ? <a href={`mailto:${lead.contactEmail}`} style={{ color: "var(--hz-primary)" }}>{lead.contactEmail}</a> : null}</Field>
          <Field label="Lead Source">{prettySource(lead.source)}</Field>
          <Field label="Business Type">{lead.businessType}</Field>
          <Field label="Location">{lead.location}</Field>
          <Field label="Description" wide>{lead.description}</Field>
          <Field label="Notes" wide>{lead.notes}</Field>
          {(lead.createdAt || lead.updatedAt) && (
            <div style={{ gridColumn: "1/-1", fontSize: "var(--hz-text-sm)", color: "var(--hz-faint)" }}>
              {lead.createdAt && <>Created {fmtDate(lead.createdAt)}</>}{lead.createdAt && lead.updatedAt && " · "}{lead.updatedAt && <>Updated {fmtDate(lead.updatedAt)}</>}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 24px 20px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={onEdit} style={{ border: "none", borderRadius: 8, padding: "9px 18px", background: "linear-gradient(135deg,#10b981,#059669)", color: "var(--hz-on-dark)", fontWeight: 700, fontSize: "var(--hz-text-md)", cursor: "pointer", fontFamily: "inherit" }}>Edit Lead</button>
          {nextStages.map(n => (
            <button key={n.key} onClick={() => onMove(n.key)}
              style={{ background: n.bg, color: n.color, border: `1px solid ${n.color}55`, borderRadius: 8, padding: "8px 14px", fontSize: "var(--hz-text-md)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              → {n.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto" }}><DeleteBtn onClick={onDelete} title="Delete lead" /></div>
        </div>
      </div>
    </div>
  );
}
