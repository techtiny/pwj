import { useCallback, useEffect, useMemo, useState } from "react";
import { campaignApi, crmApi, setCampaignUser, BASE_URL } from "./accountApi";
import { DeleteBtn } from "../ActionButtons";

// Sales → Campaigns: WhatsApp festival messages. Link a number once by QR scan (like WhatsApp Web), keep a separate
// campaign contact list (added by hand or moved over from People / Companies), then send a message to a chosen set.
const inp = { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 16, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", color: "#0f172a", background: "#fff" };
const lbl = { fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 5, display: "block" };
const th  = { padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: 14, textTransform: "uppercase", whiteSpace: "nowrap", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" };
const td  = { padding: "10px 14px", color: "#0f172a", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", background: bg, color: fg, cursor: "pointer", fontSize: 15, fontFamily: "inherit", fontWeight: 700 });
const green = "linear-gradient(135deg,#10b981,#059669)";
const errMsg = (e, d) => e.response?.data?.message || e.response?.data?.error || d;

// card = a greeting image (with the Happizo logo) sent along with the message as its caption
const cardUrl = (c) => `${BASE_URL}/api/campaign/card/${String(c).toLowerCase()}.png`;
const TEMPLATES = [
  ["Diwali", "Dear {name},\n\nWishing you and your family a very Happy Diwali. May this festival of lights bring you happiness, prosperity and success.\n\nWith warm wishes,\n*Team Happizo*", "DIWALI"],
  ["Pongal", "Happy Pongal, {name}! May this harvest festival fill your life with happiness and prosperity. — Team Happizo"],
  ["New Year", "Happy New Year, {name}! Wishing you a year full of success, health and happiness. — Team Happizo"],
  ["Christmas", "Merry Christmas, {name}! Wishing you peace, joy and happiness this season. — Team Happizo"],
];

const STATUS = {
  DRAFT:   { bg: "#f1f5f9", color: "#475569", label: "Draft" },
  SENDING: { bg: "#eff6ff", color: "#1d4ed8", label: "Sending…" },
  DONE:    { bg: "#ecfdf5", color: "#047857", label: "Done" },
  STOPPED: { bg: "#fffbeb", color: "#b45309", label: "Stopped" },
  PENDING: { bg: "#f1f5f9", color: "#475569", label: "Pending" },
  SENT:    { bg: "#ecfdf5", color: "#047857", label: "Sent" },
  FAILED:  { bg: "#fef2f2", color: "#b91c1c", label: "Failed" },
};
const Pill = ({ s }) => { const t = STATUS[s] || STATUS.DRAFT; return <span style={{ background: t.bg, color: t.color, borderRadius: 8, padding: "3px 10px", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{t.label}</span>; };
const fmtTime = (v) => (v ? new Date(v.endsWith?.("Z") ? v : v + "Z").toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—");

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="cmp-modal-bg" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="cmp-modal" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: wide ? 760 : 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#0f172a" }}>{title}</div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 22, color: "#64748b" }}>×</button>
        </div>
        <div className="cmp-modal-body" style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

// ── WhatsApp connection (QR) ─────────────────────────────────────────────────────────────────────
function WhatsAppCard({ onStatus }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let live = true;
    const poll = () => campaignApi.waStatus().then(r => { if (live) { setSt(r.data); onStatus?.(r.data?.status); } }).catch(() => { if (live) { setSt({ status: "unreachable" }); onStatus?.("unreachable"); } });
    poll();
    const t = setInterval(poll, 3000);
    return () => { live = false; clearInterval(t); };
  }, [onStatus]);
  const s = st?.status;
  const disconnect = async () => { if (window.confirm("Disconnect this WhatsApp number? You will need to scan the QR code again.")) { await campaignApi.waLogout(); } };
  return (
    <div className="cmp-wa" style={{ ...card, padding: 16, marginBottom: 16, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", marginBottom: 4 }}>WhatsApp</div>
        {s === "connected" && <div style={{ color: "#047857", fontWeight: 600 }}>● Connected{st.phone ? ` as +${st.phone}` : ""}</div>}
        {s === "qr" && <div style={{ color: "#475569" }}>Open WhatsApp on the phone → <b>Linked devices</b> → <b>Link a device</b> → scan this code.</div>}
        {(s === "starting" || !s) && <div style={{ color: "#64748b" }}>Starting WhatsApp…</div>}
        {s === "disconnected" && <div style={{ color: "#b45309" }}>Disconnected — a new QR code will appear in a moment.</div>}
        {s === "unreachable" && <div style={{ color: "#b91c1c" }}>The WhatsApp service isn't running, so messages can't be sent. Start the <b>wa-gateway</b> service.</div>}
        {s === "connected" && <button onClick={disconnect} style={{ ...btn("#fff", "#b91c1c"), border: "1.5px solid #fecaca", marginTop: 10 }}>Disconnect</button>}
      </div>
      {s === "qr" && st.qr && <img className="cmp-qr" src={st.qr} alt="WhatsApp QR code" width={200} height={200} style={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />}
    </div>
  );
}

// Phone-contact helpers ---------------------------------------------------------------------------------------
// The Contact Picker API opens the phone's own contact chooser. It exists on Chrome for Android (over HTTPS) only;
// everywhere else (iPhone, desktop) a .vcf file shared from the Contacts app does the same job.
const canPickContacts = () => typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

/** Name + first phone number from the (name, tel) lists the Contact Picker returns. */
const fromPicker = (list) => list.map(c => ({ name: (c.name?.[0] || "").trim(), phone: (c.tel?.[0] || "").trim() })).filter(c => c.name || c.phone);

/** Name + first phone number of every card in a .vcf file. */
function parseVcf(text) {
  const cards = text.replace(/\r\n[ \t]/g, "").split(/BEGIN:VCARD/i).slice(1);   // unfold long lines first
  return cards.map(card => {
    const line = (re) => (card.match(re) || [])[1]?.trim() || "";
    const fn = line(/^FN[^:]*:(.*)$/im) || line(/^N[^:]*:(.*)$/im).split(";").filter(Boolean).reverse().join(" ");
    return { name: fn, phone: line(/^(?:ITEM\d+\.)?TEL[^:]*:(.*)$/im) };
  }).filter(c => c.name || c.phone);
}

// ── Campaign contact list ────────────────────────────────────────────────────────────────────────
function ContactsTab() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);       // { id?, name, phone, company }
  const [err, setErr] = useState("");
  const [pick, setPick] = useState(null);         // import dialog state
  const load = useCallback(() => campaignApi.contacts().then(r => setRows(r.data || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);

  const shown = rows.filter(r => !q.trim() || `${r.name} ${r.phone} ${r.company || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const [note, setNote] = useState("");

  /** Add a batch of phone contacts straight to the list and tell the user what happened. */
  async function addMany(items) {
    let added = 0; const skipped = [];
    for (const c of items) {
      try { await campaignApi.addContact({ name: c.name || c.phone, phone: c.phone, company: "" }); added++; }
      catch (x) { skipped.push(`${c.name || c.phone}: ${errMsg(x, "could not add")}`); }
    }
    await load();
    return { added, skipped };
  }

  /** Called with the contacts chosen on the phone (or read from a .vcf): one fills the form, several are added at once. */
  async function useChosen(items) {
    if (items.length === 0) return;
    if (items.length === 1) { setErr(""); setNote(""); setModal(m => ({ ...(m || {}), name: items[0].name, phone: items[0].phone, company: m?.company || "" })); return; }
    const r = await addMany(items);
    setModal(null);
    alert(`Added ${r.added} of ${items.length} contacts.${r.skipped.length ? `\n\nSkipped:\n${r.skipped.slice(0, 8).join("\n")}${r.skipped.length > 8 ? `\n…and ${r.skipped.length - 8} more` : ""}` : ""}`);
  }

  async function pickFromPhone() {
    if (!canPickContacts()) { setNote("Phone contact picking works in Chrome on Android. On iPhone or a computer, use “Import .vcf file” instead."); return; }
    try { useChosen(fromPicker(await navigator.contacts.select(["name", "tel"], { multiple: true }))); }
    catch (x) { if (x?.name !== "AbortError") setNote("Couldn't open your contacts — allow contact access and try again."); }
  }

  async function importVcf(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    const items = parseVcf(await file.text());
    if (items.length === 0) { setNote("No contacts found in that file."); return; }
    useChosen(items);
  }

  async function save(e) {
    e.preventDefault(); setErr("");
    try { modal.id ? await campaignApi.updateContact(modal.id, modal) : await campaignApi.addContact(modal); setModal(null); load(); }
    catch (x) { setErr(errMsg(x, "Could not save")); }
  }
  const remove = async (r) => { if (window.confirm(`Remove ${r.name} from the campaign list?`)) { await campaignApi.deleteContact(r.id); load(); } };

  async function openImport(list) {
    const r = await crmApi.getAll(list).catch(() => ({ data: [] }));
    setPick({ list, rows: r.data || [], sel: new Set(), q: "", result: null });
  }
  const pickRows = pick ? pick.rows.filter(r => !pick.q.trim() || `${r.name} ${r.company || ""} ${r.contactName || ""}`.toLowerCase().includes(pick.q.trim().toLowerCase())) : [];
  const toggle = (id) => setPick(p => { const s = new Set(p.sel); s.has(id) ? s.delete(id) : s.add(id); return { ...p, sel: s }; });
  async function doImport() {
    const r = await campaignApi.importContacts(pick.list, [...pick.sel]);
    setPick(p => ({ ...p, result: r.data, sel: new Set() })); load();
  }

  return (
    <div>
      <div className="cmp-head" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <input style={{ ...inp, width: 240 }} placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ flex: 1 }} />
        <button onClick={() => openImport("people")} style={btn("#eff6ff", "#1d4ed8")}>⇦ From People</button>
        <button onClick={() => openImport("companies")} style={btn("#eff6ff", "#1d4ed8")}>⇦ From Companies</button>
        <button onClick={() => { setErr(""); setNote(""); setModal({ name: "", phone: "", company: "" }); }} style={{ ...btn("#10b981"), background: green }}>+ Add Contact</button>
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="cmp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
            <thead><tr>{["Name", "WhatsApp number", "Company", "Added from", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={5} className="cmp-empty" style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 40 }}>{rows.length ? "Nothing matches" : "No contacts yet — add one, or move people over from the People / Companies lists."}</td></tr>
                : shown.map(r => (
                  <tr key={r.id}>
                    <td data-label="Name" style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                    <td data-label="Number" style={td}>+{r.phone}</td>
                    <td data-label="Company" style={td}>{r.company || "—"}</td>
                    <td data-label="From" style={td}>{r.origin === "PERSON" ? "People" : r.origin === "COMPANY" ? "Companies" : "Manual"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={() => { setErr(""); setModal({ ...r, company: r.company || "" }); }} style={{ background: "#eff6ff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#3b82f6", fontFamily: "inherit" }}>Edit</button>
                        <DeleteBtn onClick={() => remove(r)} title="Remove" />
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal.id ? "Edit Contact" : "Add Contact"} onClose={() => setModal(null)}>
          <form onSubmit={save} style={{ display: "grid", gap: 14 }}>
            {!modal.id && (
              <div style={{ background: "#f0fdf4", border: "1px dashed #86efac", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 14.5, color: "#166534", fontWeight: 600, marginBottom: 8 }}>Fetch from your phone contacts</div>
                <div className="cmp-toolbar" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={pickFromPhone} style={btn("#fff", "#166534")}>📱 Pick from phone contacts</button>
                  <label style={{ ...btn("#fff", "#166534"), display: "inline-block", textAlign: "center" }}>
                    📇 Import .vcf file<input type="file" accept=".vcf,text/vcard,text/x-vcard" onChange={importVcf} style={{ display: "none" }} />
                  </label>
                </div>
                {note && <div style={{ fontSize: 14, color: "#b45309", marginTop: 8 }}>{note}</div>}
                <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 8 }}>Pick one to fill this form, or several to add them all at once.</div>
              </div>
            )}
            <div><label style={lbl}>Name *</label><input style={inp} autoFocus value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} /></div>
            <div><label style={lbl}>WhatsApp number *</label><input style={inp} value={modal.phone} onChange={e => setModal(m => ({ ...m, phone: e.target.value }))} placeholder="10-digit number, or with country code" /></div>
            <div><label style={lbl}>Company</label><input style={inp} value={modal.company} onChange={e => setModal(m => ({ ...m, company: e.target.value }))} /></div>
            {err && <div style={{ color: "#b91c1c", fontSize: 15 }}>{err}</div>}
            <button type="submit" style={{ ...btn("#10b981"), background: green, padding: 11, fontSize: 17 }}>{modal.id ? "💾 Update" : "+ Add Contact"}</button>
          </form>
        </Modal>
      )}

      {pick && (
        <Modal title={`Add from ${pick.list === "people" ? "People" : "Companies"}`} onClose={() => setPick(null)} wide>
          <div style={{ fontSize: 15, color: "#475569", marginBottom: 10 }}>Choose who to add to the campaign list. Rows without a phone number can't be added — fill the Work Phone first.</div>
          <div className="cmp-toolbar" style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Search…" value={pick.q} onChange={e => setPick(p => ({ ...p, q: e.target.value }))} />
            <button onClick={() => setPick(p => ({ ...p, sel: new Set(pickRows.filter(r => r.workPhone).map(r => r.id)) }))} style={btn("#f1f5f9", "#334155")}>Select all with phone</button>
            <button onClick={() => setPick(p => ({ ...p, sel: new Set() }))} style={btn("#f1f5f9", "#334155")}>Clear</button>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            {pickRows.map(r => (
              <label key={r.id} className="cmp-pick" style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", borderBottom: "1px solid #f1f5f9", opacity: r.workPhone ? 1 : 0.5, cursor: r.workPhone ? "pointer" : "not-allowed" }}>
                <input type="checkbox" disabled={!r.workPhone} checked={pick.sel.has(r.id)} onChange={() => toggle(r.id)} />
                <span style={{ flex: 1, fontWeight: 600 }}>{r.name}{pick.list === "people" && r.company ? <span style={{ fontWeight: 400, color: "#64748b" }}> · {r.company}</span> : null}{pick.list === "companies" && r.contactName ? <span style={{ fontWeight: 400, color: "#64748b" }}> · {r.contactName}</span> : null}</span>
                <span style={{ color: r.workPhone ? "#0f172a" : "#b45309", fontSize: 14 }}>{r.workPhone || "no phone"}</span>
              </label>
            ))}
            {pickRows.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>Nothing to show</div>}
          </div>
          {pick.result && <div style={{ marginTop: 12, background: "#ecfdf5", color: "#065f46", borderRadius: 8, padding: "9px 12px", fontSize: 15 }}>
            Added {pick.result.added}{pick.result.duplicate ? ` · ${pick.result.duplicate} already in the list` : ""}{pick.result.noPhone ? ` · ${pick.result.noPhone} skipped (no valid number)` : ""}</div>}
          <button disabled={pick.sel.size === 0} onClick={doImport} style={{ ...btn("#10b981"), background: green, marginTop: 14, width: "100%", padding: 11, fontSize: 17, opacity: pick.sel.size ? 1 : 0.5 }}>
            Add {pick.sel.size || ""} to campaign list
          </button>
        </Modal>
      )}
    </div>
  );
}

// ── Campaigns ────────────────────────────────────────────────────────────────────────────────────
function CampaignsTab({ userName, waStatus }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);         // campaign id whose detail is shown
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);         // new campaign dialog { name, message, sel:Set, contacts }
  const [err, setErr] = useState("");
  const load = useCallback(() => campaignApi.list().then(r => setRows(r.data || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const loadDetail = useCallback((id) => campaignApi.detail(id).then(r => setDetail(r.data)).catch(() => setDetail(null)), []);
  useEffect(() => { if (open) loadDetail(open); else setDetail(null); }, [open, loadDetail]);
  // live progress while a campaign is sending
  useEffect(() => {
    if (!open || detail?.campaign?.status !== "SENDING") return;
    const t = setInterval(() => { loadDetail(open); load(); }, 3000);
    return () => clearInterval(t);
  }, [open, detail?.campaign?.status, loadDetail, load]);

  async function openNew() {
    const r = await campaignApi.contacts().catch(() => ({ data: [] }));
    setErr(""); setForm({ name: "", message: "", card: "", sel: new Set((r.data || []).map(c => c.id)), contacts: r.data || [], q: "" });
  }
  async function create(e) {
    e.preventDefault(); setErr("");
    try {
      const r = await campaignApi.create({ name: form.name, message: form.message, card: form.card, contactIds: [...form.sel], createdBy: userName });
      setForm(null); await load(); setOpen(r.data.id);
    } catch (x) { setErr(errMsg(x, "Could not create the campaign")); }
  }
  const act = async (fn, id) => { try { await fn(id); await loadDetail(id); load(); } catch (x) { alert(errMsg(x, "Could not do that")); } };
  const remove = async (c) => { if (window.confirm(`Delete the campaign "${c.name}"?`)) { try { await campaignApi.remove(c.id); setOpen(null); load(); } catch (x) { alert(errMsg(x, "Could not delete")); } } };

  const formContacts = useMemo(() => (form ? form.contacts.filter(c => !form.q.trim() || `${c.name} ${c.phone} ${c.company || ""}`.toLowerCase().includes(form.q.trim().toLowerCase())) : []), [form]);

  if (open && detail) {
    const c = detail.campaign, total = detail.recipients.length, done = detail.sent + detail.failed;
    return (
      <div>
        <button onClick={() => setOpen(null)} style={{ ...btn("#f1f5f9", "#334155"), marginBottom: 12 }}>← All campaigns</button>
        <div style={{ ...card, padding: 16, marginBottom: 14 }}>
          <div className="cmp-detail-head" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{c.name}</div><Pill s={c.status} />
            <div style={{ flex: 1 }} />
            {c.status !== "SENDING" && detail.pending > 0 && <button onClick={() => act(campaignApi.start, c.id)} style={{ ...btn("#10b981"), background: green }}>{c.startedAt ? "▶ Resume" : "▶ Start sending"}</button>}
            {c.status === "SENDING" && <button onClick={() => act(campaignApi.stop, c.id)} style={btn("#b45309")}>■ Stop</button>}
            {c.status !== "SENDING" && detail.failed > 0 && <button onClick={() => act(campaignApi.retryFailed, c.id)} style={btn("#eff6ff", "#1d4ed8")}>↻ Retry failed</button>}
            {c.status !== "SENDING" && <DeleteBtn onClick={() => remove(c)} title="Delete campaign" />}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            {c.card && <img src={cardUrl(c.card)} alt="Greeting card" style={{ width: 150, borderRadius: 10, border: "1px solid #e2e8f0" }} />}
            <div style={{ flex: 1, minWidth: 200, whiteSpace: "pre-wrap", background: "#f8fafc", borderRadius: 8, padding: "10px 12px", color: "#334155", fontSize: 15 }}>{c.message}</div>
          </div>
          <div style={{ marginTop: 12, height: 10, background: "#e2e8f0", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${total ? (done / total) * 100 : 0}%`, height: "100%", background: detail.failed ? "#f59e0b" : "#10b981", transition: "width .4s" }} />
          </div>
          <div style={{ fontSize: 15, color: "#475569", marginTop: 6 }}>{detail.sent} sent · {detail.failed} failed · {detail.pending} pending · {total} total{c.note ? ` — ${c.note}` : ""}</div>
          {waStatus !== "connected" && c.status !== "DONE" && <div style={{ marginTop: 8, color: "#b45309", fontSize: 15 }}>WhatsApp isn't connected — scan the QR code above before sending.</div>}
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="cmp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
              <thead><tr>{["Name", "Number", "Status", "Sent at", "Note"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{detail.recipients.map(r => (
                <tr key={r.id}>
                  <td data-label="Name" style={{ ...td, fontWeight: 600 }}>{r.name}</td><td data-label="Number" style={td}>+{r.phone}</td>
                  <td data-label="Status" style={td}><Pill s={r.status} /></td><td data-label="Sent at" style={td}>{fmtTime(r.sentAt)}</td>
                  <td data-label="Note" style={{ ...td, color: "#b91c1c" }}>{r.error || ""}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button onClick={openNew} style={{ ...btn("#10b981"), background: green }}>+ New Campaign</button>
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="cmp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
            <thead><tr>{["Campaign", "Status", "Created", "By", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={5} className="cmp-empty" style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 40 }}>No campaigns yet — create one for the next festival.</td></tr>
                : rows.map(c => (
                  <tr key={c.id}>
                    <td data-label="Campaign" style={{ ...td, fontWeight: 600 }}>{c.name}</td><td data-label="Status" style={td}><Pill s={c.status} /></td>
                    <td data-label="Created" style={td}>{fmtTime(c.createdAt)}</td><td data-label="By" style={td}>{c.createdBy || "—"}</td>
                    <td style={td}><button onClick={() => setOpen(c.id)} style={{ background: "#eff6ff", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#3b82f6", fontFamily: "inherit" }}>Open</button></td>
                  </tr>))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title="New Campaign" onClose={() => setForm(null)} wide>
          <form onSubmit={create} style={{ display: "grid", gap: 14 }}>
            <div><label style={lbl}>Campaign name *</label><input style={inp} autoFocus placeholder="e.g. Diwali 2026" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Message * <span style={{ fontWeight: 400, color: "#64748b" }}>— <b>{"{name}"}</b> is replaced with each contact's first name</span></label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                {TEMPLATES.map(([t, m, card]) => <button type="button" key={t} onClick={() => setForm(f => ({ ...f, message: m, name: f.name || t, card: card || "" }))} style={{ ...btn("#f1f5f9", "#334155"), padding: "4px 12px", fontSize: 14 }}>{t}</button>)}
              </div>
              <textarea style={{ ...inp, resize: "vertical" }} rows={5} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Greeting card <span style={{ fontWeight: 400, color: "#64748b" }}>— a colourful image with the Happizo logo; your message is sent as its caption</span></label>
              <select style={{ ...inp, maxWidth: 360 }} value={form.card} onChange={e => setForm(f => ({ ...f, card: e.target.value }))}>
                <option value="">None — text message only</option>
                <option value="DIWALI">Diwali card</option>
              </select>
              {form.card && <img src={cardUrl(form.card)} alt={`${form.card} greeting card`} style={{ display: "block", marginTop: 10, width: 240, maxWidth: "100%", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,.12)" }} />}
            </div>
            <div>
              <label style={lbl}>Send to ({form.sel.size} of {form.contacts.length} selected)</label>
              <div className="cmp-toolbar" style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="Search…" value={form.q} onChange={e => setForm(f => ({ ...f, q: e.target.value }))} />
                <button type="button" onClick={() => setForm(f => ({ ...f, sel: new Set(f.contacts.map(c => c.id)) }))} style={btn("#f1f5f9", "#334155")}>All</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, sel: new Set() }))} style={btn("#f1f5f9", "#334155")}>None</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                {formContacts.map(c => (
                  <label key={c.id} className="cmp-pick" style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}>
                    <input type="checkbox" checked={form.sel.has(c.id)} onChange={() => setForm(f => { const s = new Set(f.sel); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return { ...f, sel: s }; })} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{c.name}{c.company ? <span style={{ fontWeight: 400, color: "#64748b" }}> · {c.company}</span> : null}</span>
                    <span style={{ color: "#475569", fontSize: 14 }}>+{c.phone}</span>
                  </label>))}
                {form.contacts.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>The campaign list is empty — add contacts first.</div>}
              </div>
            </div>
            <div style={{ fontSize: 14, color: "#64748b" }}>Messages go out one by one with a short random pause between them, to keep the number safe from WhatsApp's spam limits. Only message people who expect to hear from you.</div>
            {err && <div style={{ color: "#b91c1c", fontSize: 15 }}>{err}</div>}
            <button type="submit" style={{ ...btn("#10b981"), background: green, padding: 11, fontSize: 17 }}>Create campaign</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

const ROLE_LABEL = { OH: "OH", VP: "VP", CEO: "CEO" };

export default function CampaignsPage({ userName = "", username = "", role = "" }) {
  setCampaignUser(username);   // before any child effect fires its first request
  const [tab, setTab] = useState("campaigns");
  const [wa, setWa] = useState(null);
  const onStatus = useCallback((s) => setWa(s), []);
  return (
    <div className="cmp-page" style={{ padding: 16, background: "#f8fafc", minHeight: "calc(100vh - 148px)" }}>
      <style>{`
        @media (max-width: 768px) {
          .cmp-page { padding: 12px !important; }
          .cmp-head > * { flex: 1 1 100% !important; width: 100% !important; }
          .cmp-table, .cmp-table tbody, .cmp-table tr, .cmp-table td { display: block; width: 100%; box-sizing: border-box; }
          .cmp-table thead { display: none; }
          .cmp-table tbody tr { border: 1px solid #e2e8f0; border-radius: 12px; margin: 10px; width: auto; padding: 4px 0; background: #fff; }
          .cmp-table td { border-bottom: 1px solid #f1f5f9 !important; padding: 7px 14px !important; white-space: normal !important; }
          .cmp-table td:last-child { border-bottom: none !important; }
          .cmp-table td[data-label] { display: grid; grid-template-columns: 96px minmax(0, 1fr); column-gap: 10px; align-items: start; }
          .cmp-table td[data-label]::before { content: attr(data-label); font-size: 12px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: .4px; padding-top: 3px; }
          .cmp-table td.cmp-empty { display: block; }
          /* dialogs become a near full-screen sheet */
          .cmp-modal-bg { padding: 8px !important; align-items: flex-end !important; }
          .cmp-modal { max-width: 100% !important; max-height: 94vh !important; border-radius: 16px 16px 12px 12px !important; }
          .cmp-modal-body { padding: 14px !important; }
          .cmp-modal-body img { max-width: 70% !important; }
          /* WhatsApp connection: QR centred under the text */
          .cmp-wa { flex-direction: column; align-items: stretch !important; }
          .cmp-qr { align-self: center; width: min(240px, 72vw) !important; height: auto !important; }
          /* checkbox rows: number drops under the name */
          .cmp-pick { flex-wrap: wrap; row-gap: 2px; }
          .cmp-pick > span:last-child { flex-basis: 100%; padding-left: 28px; }
          .cmp-toolbar > * { flex: 1 1 100% !important; width: 100% !important; min-width: 0 !important; }
          .cmp-toolbar > button { flex: 1 1 calc(50% - 5px) !important; width: auto !important; }
          /* campaign page: action buttons stack full-width */
          .cmp-detail-head > button { flex: 1 1 100%; }
          .cmp-detail-head > div:first-child { flex: 1 1 100%; }
        }
      `}</style>
      <div style={{ fontSize: 22.5, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>Campaigns</div>
      <div style={{ fontSize: 16, color: "#64748b", marginBottom: 14 }}>Send festival greetings to your contacts on WhatsApp. This is the <b>{ROLE_LABEL[role] || role}</b> list — contacts and campaigns here are shared with other {ROLE_LABEL[role] || role} users only.</div>
      <WhatsAppCard onStatus={onStatus} />
      <div style={{ display: "inline-flex", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 3, marginBottom: 14 }}>
        {[["campaigns", "Campaigns"], ["contacts", "Campaign List"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: tab === k ? 700 : 500, padding: "7px 16px", borderRadius: 6, background: tab === k ? "#0f766e" : "transparent", color: tab === k ? "#fff" : "#000" }}>{l}</button>
        ))}
      </div>
      {tab === "campaigns" ? <CampaignsTab userName={userName} waStatus={wa} /> : <ContactsTab />}
    </div>
  );
}
