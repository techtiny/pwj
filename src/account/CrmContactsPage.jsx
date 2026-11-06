import { useCallback, useEffect, useMemo, useState } from "react";
import { crmApi } from "./accountApi";
import { usersApi } from "../hr/hrApi";
import { DeleteBtn } from "../ActionButtons";

// Sales CRM — the "People" and "Companies" sheets of the CRM workbook. One page, two field sets.
const TAGS          = ["Plan", "High", "Low", "Estimate", "Followup", "Investment", "Ongoing", "Hot/Strategic"];
const CONTACT_TYPES = ["Potential Customer", "Current Customer", "Other"];
const STATUSES      = ["Pending", "Connected"];
const SOURCES       = ["Advertising", "Cold Call", "Email", "Direct", "BNIO", "Lodge", "Referral", "Other"];

const CONFIG = {
  people: {
    title: "People", add: "+ Add Person", nameLabel: "Name", empty: "No people yet",
    byLabel: "Connect by",
    // columns shown in the table: [heading, field]
    cols: [["Tag", "tag"], ["Name", "name"], ["Company", "company"], ["Source", "source"], ["Title", "title"], ["Contact Type", "contactType"],
           ["Work Phone", "workPhone"], ["Connect by", "connectBy"], ["Followed by", "followedBy"], ["Status", "status"], ["Description", "description"]],
  },
  companies: {
    title: "Companies", add: "+ Add Company", nameLabel: "Company Name", empty: "No companies yet",
    byLabel: "Assignee",
    cols: [["Tag", "tag"], ["Company Name", "name"], ["Contact Type", "contactType"], ["Name", "contactName"], ["Title", "title"],
           ["Work Phone", "workPhone"], ["Assignee", "connectBy"], ["Followed by", "followedBy"], ["Status", "status"], ["Description", "description"]],
  },
};

const EMPTY = { tag: "", name: "", company: "", contactName: "", source: "", title: "", contactType: "", workPhone: "", connectBy: "", followedBy: "", status: "Pending", description: "" };

const inp = { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 16, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", color: "#0f172a", background: "#fff" };
const lbl = { fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" };
const th  = { padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: 14, textTransform: "uppercase", whiteSpace: "nowrap", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" };
const td  = { padding: "10px 14px", color: "#0f172a", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

const STATUS_STYLE = {
  pending:   { bg: "#fffbeb", color: "#b45309" },
  connected: { bg: "#ecfdf5", color: "#047857" },
};
const statusStyle = (s) => STATUS_STYLE[(s || "").toLowerCase()] || { bg: "#f1f5f9", color: "#475569" };

export default function CrmContactsPage({ list }) {
  const cfg = CONFIG[list];
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState("");
  const [typeF, setTypeF]     = useState("");
  const [statusF, setStatusF] = useState("");
  const [tagF, setTagF]       = useState("");
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY);
  const [error, setError]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [staff, setStaff]     = useState([]);   // suggestions for Connect by / Assignee / Followed by

  const load = useCallback(async () => {
    try { setRows((await crmApi.getAll(list)).data || []); } catch { setRows([]); }
    setLoading(false);
  }, [list]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    usersApi.getAll().then(r => setStaff((r.data?.data || []).filter(u => u.active !== false && !u.exited).map(u => u.fullName))).catch(() => {});
  }, []);

  const f = (v) => setForm(p => ({ ...p, ...v }));
  const openAdd  = () => { setEditing(null); setForm(EMPTY); setError(""); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, r[k] || ""])) }); setError(""); setModal(true); };

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError(`${cfg.nameLabel} is required`); return; }
    setSaving(true); setError("");
    try {
      if (editing) await crmApi.update(list, editing.id, form); else await crmApi.create(list, form);
      setModal(false); await load();
    } catch (err) { setError(err.response?.data?.message || err.response?.data?.error || "Could not save"); }
    finally { setSaving(false); }
  }
  async function remove(r) {
    if (!window.confirm(`Delete ${r.name}?`)) return;
    try { await crmApi.delete(list, r.id); await load(); } catch { alert("Could not delete"); }
  }

  const shown = useMemo(() => rows.filter(r =>
    (!typeF || r.contactType === typeF) && (!statusF || (r.status || "").toLowerCase() === statusF.toLowerCase()) && (!tagF || r.tag === tagF)
    && (!q.trim() || [r.name, r.company, r.contactName, r.title, r.connectBy, r.followedBy, r.workPhone, r.description].filter(Boolean).join(" ").toLowerCase().includes(q.trim().toLowerCase()))
  ), [rows, q, typeF, statusF, tagF]);

  const statusCount = (s) => rows.filter(r => (r.status || "").toLowerCase() === s.toLowerCase()).length;
  const isPeople = list === "people";
  const textField = (key, label, extra = {}) => (
    <div>
      <label style={lbl}>{label}</label>
      <input style={inp} value={form[key]} onChange={e => f({ [key]: e.target.value })} {...extra} />
    </div>
  );
  const selectField = (key, label, opts) => (
    <div>
      <label style={lbl}>{label}</label>
      <select style={inp} value={form[key]} onChange={e => f({ [key]: e.target.value })}>
        <option value="">— Select —</option>
        {form[key] && !opts.includes(form[key]) && <option value={form[key]}>{form[key]}</option>}
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="crm-page" style={{ padding: 16, background: "#f8fafc", minHeight: "calc(100vh - 148px)" }}>
      <style>{`
        @media (max-width: 768px) {
          .crm-page { padding: 12px !important; }
          .crm-head { flex-direction: column; align-items: stretch !important; }
          .crm-head button { width: 100%; }
          .crm-filters > * { width: 100% !important; flex: 1 1 100%; }
          /* each row becomes a card: label on the left, value on the right */
          .crm-table, .crm-table tbody, .crm-table tr, .crm-table td { display: block; width: 100%; box-sizing: border-box; }
          .crm-table thead { display: none; }
          .crm-table tbody tr { border: 1px solid #e2e8f0; border-radius: 12px; margin: 10px; width: auto; padding: 4px 0; background: #fff; }
          .crm-table td { border-bottom: 1px solid #f1f5f9 !important; padding: 7px 14px !important; white-space: normal !important; min-width: 0 !important; }
          .crm-table td:last-child { border-bottom: none !important; }
          .crm-table td[data-label] { display: grid; grid-template-columns: 104px minmax(0, 1fr); column-gap: 10px; align-items: start; }
          .crm-table td[data-label]::before { content: attr(data-label); font-size: 12px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: .4px; padding-top: 3px; }
          .crm-table td.crm-empty { display: block; }
          .crm-form { grid-template-columns: 1fr !important; padding: 16px !important; }
          .crm-form > div { grid-column: 1 / -1 !important; }
        }
      `}</style>
      <datalist id="crm-staff">{staff.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="crm-sources">{SOURCES.map(n => <option key={n} value={n} />)}</datalist>

      <div className="crm-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22.5, fontWeight: 800, color: "#0f172a" }}>{cfg.title}</div>
          <div style={{ fontSize: 16, color: "#64748b", marginTop: 2 }}>
            {rows.length} {rows.length === 1 ? "record" : "records"} · {statusCount("Connected")} connected · {statusCount("Pending")} pending
          </div>
        </div>
        <button onClick={openAdd}
          style={{ border: "none", borderRadius: 8, padding: "8px 18px", background: "linear-gradient(135deg,#10b981,#059669)", cursor: "pointer", fontSize: 16, fontFamily: "inherit", fontWeight: 700, color: "#fff" }}>
          {cfg.add}
        </button>
      </div>

      <div className="crm-filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input style={{ ...inp, width: 260 }} placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...inp, width: 190 }} value={typeF} onChange={e => setTypeF(e.target.value)}>
          <option value="">All contact types</option>{CONTACT_TYPES.map(o => <option key={o}>{o}</option>)}
        </select>
        <select style={{ ...inp, width: 150 }} value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="">All status</option>{STATUSES.map(o => <option key={o}>{o}</option>)}
        </select>
        <select style={{ ...inp, width: 160 }} value={tagF} onChange={e => setTagF(e.target.value)}>
          <option value="">All tags</option>{TAGS.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="crm-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
            <thead><tr>{cfg.cols.map(([h]) => <th key={h} style={th}>{h}</th>)}<th style={th}></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={cfg.cols.length + 1} className="crm-empty" style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 40 }}>Loading…</td></tr>
                : shown.length === 0 ? <tr><td colSpan={cfg.cols.length + 1} className="crm-empty" style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 40 }}>{rows.length ? "Nothing matches the filters" : cfg.empty}</td></tr>
                : shown.map(r => (
                  <tr key={r.id}>
                    {cfg.cols.map(([h, k]) => (
                      <td key={k} data-label={h} style={{ ...td, fontWeight: k === "name" ? 600 : 400, minWidth: k === "description" ? 200 : undefined }}>
                        {k === "status" && r.status
                          ? <span style={{ ...statusStyle(r.status), background: statusStyle(r.status).bg, borderRadius: 8, padding: "3px 10px", fontSize: 14, fontWeight: 700 }}>{r.status}</span>
                          : (r[k] || "—")}
                      </td>
                    ))}
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={() => openEdit(r)} style={{ background: "#eff6ff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#3b82f6", fontFamily: "inherit" }}>Edit</button>
                        <DeleteBtn onClick={() => remove(r)} title="Delete" />
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 660, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a" }}>{editing ? `Edit ${isPeople ? "Person" : "Company"}` : isPeople ? "New Person" : "New Company"}</div>
              <button onClick={() => setModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 22.5, color: "#64748b" }}>×</button>
            </div>
            <form onSubmit={save} className="crm-form" style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>{textField("name", `${cfg.nameLabel} *`, { autoFocus: true })}</div>
              {isPeople ? textField("company", "Company") : textField("contactName", "Contact Name")}
              {textField("title", "Title")}
              {selectField("contactType", "Contact Type", CONTACT_TYPES)}
              {isPeople && textField("source", "Source", { list: "crm-sources" })}
              {textField("workPhone", "Work Phone")}
              {textField("connectBy", cfg.byLabel, { list: "crm-staff" })}
              {textField("followedBy", "Followed by", { list: "crm-staff" })}
              {selectField("status", "Status", STATUSES)}
              {selectField("tag", "Tag", TAGS)}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={form.description} onChange={e => f({ description: e.target.value })} />
              </div>
              {error && <div style={{ gridColumn: "1/-1", color: "#b91c1c", fontSize: 15 }}>{error}</div>}
              <div style={{ gridColumn: "1/-1", display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, border: "none", borderRadius: 8, padding: 11, background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontWeight: 700, fontSize: 17.5, cursor: "pointer", fontFamily: "inherit" }}>
                  {saving ? "Saving…" : editing ? "💾 Update" : cfg.add}
                </button>
                <button type="button" onClick={() => setModal(false)}
                  style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "11px 20px", background: "#fff", color: "#475569", fontWeight: 600, fontSize: 17.5, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
