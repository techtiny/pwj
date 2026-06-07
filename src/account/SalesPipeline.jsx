import { useEffect, useState, useCallback } from "react";
import { salesApi, formatLakh } from "./accountApi";

const STAGES = [
  { key: "PROSPECT",    label: "Prospect",    color: "#6366f1", bg: "#eef2ff" },
  { key: "QUALIFIED",   label: "Qualified",   color: "#3b82f6", bg: "#eff6ff" },
  { key: "PROPOSAL",    label: "Proposal",    color: "#f59e0b", bg: "#fffbeb" },
  { key: "NEGOTIATION", label: "Negotiation", color: "#f97316", bg: "#fff7ed" },
  { key: "WON",         label: "Won",         color: "#10b981", bg: "#ecfdf5" },
  { key: "LOST",        label: "Lost",        color: "#ef4444", bg: "#fef2f2" },
];

const SOURCES        = ["REFERRAL", "DIRECT", "TENDER", "ONLINE", "OTHER"];
const BUSINESS_TYPES = ["Infrastructure", "Electrical", "Civil", "Mechanical", "IT", "Consulting", "Other"];

const EMPTY_FORM = {
  title: "", client: "", contactPerson: "", contactPhone: "", contactEmail: "",
  stage: "PROSPECT", source: "", businessType: "", location: "", description: "",
  notes: "", dealValue: "", quoteValue: "", probabilityPct: "",
  expectedCloseDate: "", actualCloseDate: "", assignedTo: "",
};

function stageOf(key) { return STAGES.find(s => s.key === key) || STAGES[0]; }

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

  const load = useCallback(async () => {
    try {
      const [lRes, sRes] = await Promise.all([salesApi.getAll(), salesApi.getSummary()]);
      setLeads(lRes.data);
      setSummary(sRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const inp = { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", color: "#0f172a" };
  const lbl = { fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" };

  return (
    <div style={{ padding: "16px 16px", background: "#f8fafc", minHeight: "calc(100vh - 148px)" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Pipeline</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {leads.length} leads · {summary ? formatLakh(summary.pipelineValue) : "…"} active pipeline
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView(v => v === "board" ? "list" : "board")}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600, color: "#475569" }}>
            {view === "board" ? "☰ List" : "⊞ Board"}
          </button>
          <button onClick={openAdd}
            style={{ border: "none", borderRadius: 8, padding: "8px 18px", background: "linear-gradient(135deg,#10b981,#059669)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700, color: "#fff" }}>
            + Add Lead
          </button>
        </div>
      </div>

      {/* Stage filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[{ key: "ALL", label: "All", color: "#64748b", bg: "#f1f5f9" }, ...STAGES].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            style={{ padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              background: filterStage === s.key ? s.color : (s.bg || "#f1f5f9"),
              color:      filterStage === s.key ? "#fff"  : (s.color || "#64748b") }}>
            {s.label}
            {s.key !== "ALL" && summary?.stages?.[s.key] && (
              <span style={{ marginLeft: 5, opacity: 0.85 }}>({summary.stages[s.key].count})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>
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
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{stage.label}</span>
                    <span style={{ background: stage.bg, color: stage.color, borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{stageLeads.length}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{formatLakh(stageVal)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stageLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onEdit={openEdit} onDelete={handleDelete} onMove={moveStage} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Title","Client","Stage","Deal Value","Probability","Expected Close","Assigned",""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const st = stageOf(lead.stage);
                return (
                  <tr key={lead.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a" }}>{lead.title}</td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{lead.client || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ background: st.bg, color: st.color, borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatLakh(lead.dealValue)}</td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{lead.probabilityPct != null ? `${lead.probabilityPct}%` : "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{lead.expectedCloseDate || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#475569" }}>{lead.assignedTo || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(lead)} style={{ background: "#eff6ff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#3b82f6", fontFamily: "inherit" }}>Edit</button>
                        <button onClick={() => handleDelete(lead.id)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#ef4444", fontFamily: "inherit" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No leads found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 660, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>{editing ? "Edit Lead" : "New Sales Lead"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748b" }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Lead Title *</label>
                <input style={{ ...inp, borderColor: errors.title ? "#ef4444" : "#e2e8f0" }} value={form.title} onChange={e => f({ title: e.target.value })} placeholder="e.g. Electrical work – XYZ Tower" />
                {errors.title && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 3 }}>{errors.title}</div>}
              </div>
              <div>
                <label style={lbl}>Client *</label>
                <input style={{ ...inp, borderColor: errors.client ? "#ef4444" : "#e2e8f0" }} value={form.client} onChange={e => f({ client: e.target.value })} placeholder="Client / Company" />
                {errors.client && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 3 }}>{errors.client}</div>}
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
                {errors.dealValue && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 3 }}>{errors.dealValue}</div>}
              </div>
              <div>
                <label style={lbl}>Quote Value (₹)</label>
                <input style={inp} type="number" value={form.quoteValue} onChange={e => f({ quoteValue: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Win Probability (%)</label>
                <input style={{ ...inp, borderColor: errors.probabilityPct ? "#ef4444" : "#e2e8f0" }} type="number" min="0" max="100" value={form.probabilityPct} onChange={e => f({ probabilityPct: e.target.value })} placeholder="50" />
                {errors.probabilityPct && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 3 }}>{errors.probabilityPct}</div>}
              </div>
              <div>
                <label style={lbl}>Assigned To</label>
                <input style={inp} value={form.assignedTo} onChange={e => f({ assignedTo: e.target.value })} placeholder="Team member" />
              </div>
              <div>
                <label style={lbl}>Lead Source</label>
                <select style={inp} value={form.source} onChange={e => f({ source: e.target.value })}>
                  <option value="">— Select —</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Business Type</label>
                <select style={inp} value={form.businessType} onChange={e => f({ businessType: e.target.value })}>
                  <option value="">— Select —</option>
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
                  style={{ flex: 1, border: "none", borderRadius: 8, padding: "11px", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  {saving ? "Saving…" : editing ? "💾 Update Lead" : "+ Add Lead"}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "11px 20px", background: "#fff", color: "#475569", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
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

function LeadCard({ lead, onEdit, onDelete, onMove }) {
  const st        = stageOf(lead.stage);
  const nextStage = STAGES[STAGES.findIndex(s => s.key === lead.stage) + 1];
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12, border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", flex: 1, marginRight: 6 }}>{lead.title}</div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <button onClick={() => onEdit(lead)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2, fontSize: 13 }}>✏️</button>
          <button onClick={() => onDelete(lead.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fca5a5", padding: 2, fontSize: 13 }}>🗑</button>
        </div>
      </div>
      {lead.client && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{lead.client}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{formatLakh(lead.dealValue)}</div>
        {lead.probabilityPct != null && <div style={{ fontSize: 11, color: st.color, fontWeight: 600 }}>{lead.probabilityPct}%</div>}
      </div>
      {lead.expectedCloseDate && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Close: {lead.expectedCloseDate}</div>}
      {nextStage && (
        <button onClick={() => onMove(lead, nextStage.key)}
          style={{ marginTop: 8, width: "100%", background: nextStage.bg, color: nextStage.color, border: `1px solid ${nextStage.color}33`, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          → {nextStage.label}
        </button>
      )}
    </div>
  );
}
