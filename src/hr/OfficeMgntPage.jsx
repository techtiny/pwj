import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Download, Undo2, Trash2, Pencil, Paperclip, Send, Building2, AlertTriangle, Check, X, TrendingDown } from "lucide-react";
import * as XLSX from "xlsx";
import { officeApi, uploadDocument, attachmentFullUrl } from "./hrApi";

// Office / Management expenses.
//  • HR → Office/Mgnt (mode "hr"): VP / Admin raise office expenses and manage the office staff paid a fixed
//    monthly amount — a salary line is created automatically for every month.
//  • Accounts → Weekly Payments → Office/Mgnt (mode "payments"): the same lines by month, like Team Payments —
//    "Send for Payment" downloads the bank Excel and marks the lines sent.

// Two divisions: Management (incl. the monthly Office Mgnt salaries) and Office.
const DIVISIONS = {
  MANAGEMENT: { label: "Management", color: "#6d28d9", bg: "#ede9fe",
    categories: ["Travel", "Business Meeting / Hospitality", "Professional / Consultancy Fees", "Vehicle / Fuel",
      "Subscriptions / Memberships", "Mobile / Internet", "Gifts / Welfare", "Other"],
    blurb: "Management salaries (default amount each month — change it on the line if needed) and management expenses raised by VP / Admin." },
  OFFICE: { label: "Office", color: "#0369a1", bg: "#e0f2fe",
    categories: ["Rent", "Electricity", "Internet / Phone", "Office Supplies", "Pantry / Refreshments",
      "Housekeeping", "Repairs & Maintenance", "Travel / Conveyance", "Courier / Postage", "Printing / Stationery", "Other"],
    blurb: "Office running expenses raised by VP / Admin." },
};
const FREQ = { ONE_TIME: "One-time", WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly" };
const freqOf = (r) => r.frequency || (r.kind === "SALARY" ? "MONTHLY" : "ONE_TIME");
// End of the cycle that starts on `start` (YYYY-MM-DD): weekly +6 days, monthly / yearly the day before the same date
// next month / year, one-time the start itself.
const cycleEnd = (start, freq) => {
  if (!start) return null;
  const [y, m, d] = String(start).slice(0, 10).split("-").map(Number);
  const t = freq === "WEEKLY" ? new Date(y, m - 1, d + 6)
    : freq === "MONTHLY" ? new Date(y, m, d - 1)
    : freq === "YEARLY" ? new Date(y + 1, m - 1, d - 1)
    : new Date(y, m - 1, d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
// A line's cycle end: the saved one, else worked out from its start date and frequency.
const endOf = (r) => r.cycleEndDate || cycleEnd(r.expenseDate || `${r.periodMonth}-01`, freqOf(r));
const divOf = (r) => r.division || (r.kind === "SALARY" ? "MANAGEMENT" : "OFFICE");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" });
const ghost = { ...btn("#fff", "#1e3a5f"), border: "1px solid #cbd5e1" };
const txtBtn = (fg, border, bg) => ({ border: `1px solid ${border}`, background: bg, color: fg, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: "var(--hz-text-xs)", fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" });
const iconBtn = (color) => ({ border: "1px solid #e2e8f0", background: "#fff", color, borderRadius: 6, padding: "5px 7px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--hz-text-xs)", fontWeight: 700, fontFamily: "inherit" });
const th = { padding: "10px 12px", textAlign: "left", fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: "var(--hz-text-md)", borderBottom: "1px solid #eef2f7", color: "var(--hz-ink)", verticalAlign: "top" };
// Black-lined grid (shared .fund-grid class, as in Funds): fixed columns that hug their content.
const GRID_COLS = [36, 104, 130, 126, 140, 96, 150, 116, 50, 160, 136, 80];
const GRID_W = GRID_COLS.reduce((a, b) => a + b, 0);
const gth = { padding: "10px 12px", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "var(--hz-ink)", whiteSpace: "nowrap" };
const gtd = { padding: "10px 12px", fontSize: "var(--hz-text-md)", color: "var(--hz-ink)", verticalAlign: "middle", wordBreak: "break-word" };
const cellIn = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: "var(--hz-text-sm)", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };

const inr = (v) => "₹" + (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const monthLabel = (ym, full = false) => { if (!ym) return "—"; const [y, m] = ym.split("-").map(Number); return `${(full ? FULL_MONTHS : MONTHS)[m - 1]} ${y}`; };
const fmtD = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const errMsg = (e) => e?.response?.data?.message || e?.message || "Something went wrong";
const urlsOf = (r) => { try { return r.attachmentUrls ? JSON.parse(r.attachmentUrls) : []; } catch { return []; } };

const Tag = ({ bg, fg, children }) => <span style={{ background: bg, color: fg, borderRadius: 100, padding: "2px 8px", fontSize: "var(--hz-text-xs)", fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
const KindTag = ({ k }) => (
  <span style={{ background: k === "SALARY" ? "#ede9fe" : "#e0f2fe", color: k === "SALARY" ? "#6d28d9" : "#0369a1", borderRadius: 6, padding: "2px 8px", fontSize: "var(--hz-text-xs)", fontWeight: 700, whiteSpace: "nowrap" }}>
    {k === "SALARY" ? "Salary" : "Expense"}
  </span>
);

export default function OfficeMgntPage({ username, canManage = false, mode = "hr" }) {
  return mode === "payments"
    ? <OfficePayments username={username} canManage={canManage} />
    : <OfficeExpensesHR username={username} canManage={canManage} />;
}

// ── HR → Office/Mgnt ─────────────────────────────────────────────────────────────────────────────────────────
function OfficeExpensesHR({ username, canManage }) {
  const [division, setDivision] = useState("MANAGEMENT");
  const D = DIVISIONS[division];
  const isMgmt = division === "MANAGEMENT";
  const [sel, setSel] = useState(new Set());      // ticked line ids
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(null);        // the row being edited in place
  const [drafts, setDrafts] = useState({});      // month -> new entry being typed in the + row
  const [people, setPeople] = useState([]);      // Paid to — the active Office Mgnt people
  useEffect(() => { officeApi.staff(username).then(r => setPeople((r.data?.data || []).filter(p => p.active))).catch(() => setPeople([])); }, [username]);
  useEffect(() => { setDrafts({}); setSel(new Set()); setEdit(null); }, [division]);

  const load = useCallback(() => {
    setLoading(true);
    officeApi.list(username, "ALL", undefined, division)
      .then(r => { setRows(r.data?.data || []); setErr(""); })
      .catch(e => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, [username, division]);
  useEffect(() => { load(); }, [load]);


  // Group by month so salaries and expenses of a month read together.

  // The selected month always shows a table (even when empty) so the + row can add its first entry.
  // One table for every month: newest month first, salaries before expenses, then by date.
  const shown = useMemo(() => {
    const all = [...rows].sort((a, b) => b.periodMonth.localeCompare(a.periodMonth)
      || (a.kind === b.kind ? 0 : a.kind === "SALARY" ? -1 : 1)
      || String(b.expenseDate || "").localeCompare(String(a.expenseDate || "")) || a.id - b.id);
    return [["ALL", all]];
  }, [rows]);

  async function saveEdit(r) {
    if (!(Number(edit.amount) >= 0) || edit.amount === "") { alert("Enter the amount"); return; }
    if (!edit.payee) { alert("Choose who it is paid to"); return; }
    if (r.status === "PAID" && !window.confirm("This line is already paid. Save the changes anyway?")) return;
    setEdit(x => ({ ...x, busy: true }));
    try {
      const uploaded = edit.files.length ? await Promise.all(edit.files.map(f => uploadDocument(f))) : [];
      const all = [...edit.existing, ...uploaded];
      await officeApi.update(r.id, {
        username, amount: edit.amount, description: edit.description,
        attachmentUrls: all.length ? JSON.stringify(all) : "",
        expenseDate: edit.expenseDate, cycleEndDate: edit.cycleEndDate || null, category: edit.category, payee: edit.payee, frequency: edit.frequency,
      });
      setEdit(null);
      load();
    } catch (e) { alert(errMsg(e)); setEdit(x => x && ({ ...x, busy: false })); }
  }

  async function saveDraft(m) {
    const d = drafts[m];
    if (!d.category) { alert("Choose a category"); return; }
    if (!d.payee) { alert("Choose who it is paid to"); return; }
    if (!(Number(d.amount) > 0)) { alert("Enter an amount greater than zero"); return; }
    setDrafts(x => ({ ...x, [m]: { ...x[m], busy: true } }));
    try {
      const urls = d.files.length ? await Promise.all(d.files.map(f => uploadDocument(f))) : [];
      await officeApi.raise({ username, division, frequency: d.frequency, expenseDate: d.expenseDate, cycleEndDate: d.cycleEndDate || undefined, category: d.category, payee: d.payee,
        description: d.description, amount: d.amount, attachmentUrls: urls.length ? JSON.stringify(urls) : undefined });
      setDrafts(x => { const n = { ...x }; delete n[m]; return n; });
      load();
    } catch (e) {
      alert(errMsg(e));
      setDrafts(x => ({ ...x, [m]: { ...x[m], busy: false } }));
    }
  }

  const toggle = (id) => setSel(x => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function bulk(kind, list) {
    const picked = list.filter(r => sel.has(r.id));
    if (!picked.length) return;
    try {
      if (kind === "send") {
        const toSend = picked.filter(r => !r.sentForPayment && r.status === "PENDING");
        if (toSend.some(r => !(Number(r.amount) > 0))) { alert("Enter an amount on every ticked line first"); return; }
        if (!toSend.length) { alert("The ticked lines are already in Weekly Payments"); return; }
        if (!window.confirm(`Send ${toSend.length} line${toSend.length === 1 ? "" : "s"} (${inr(toSend.reduce((t, r) => t + Number(r.amount || 0), 0))}) to Accounts → Weekly Payments → Office/Mgnt?`)) return;
        await officeApi.sendToPayments({ username, ids: toSend.map(r => r.id) });
      } else if (kind === "recall") {
        await officeApi.recallFromPayments({ username, ids: picked.map(r => r.id) });
      } else {
        const on = !picked.every(r => r.inCashFlow);
        await officeApi.setCashFlow({ username, ids: picked.map(r => r.id), on });
      }
      setSel(x => { const n = new Set(x); picked.forEach(r => n.delete(r.id)); return n; });
      load();
    } catch (e) { alert(errMsg(e)); }
  }

  // Per-row Initiate Payment / Take back / Cash Flow.
  async function rowAction(kind, r) {
    try {
      if (kind === "send") {
        if (!(Number(r.amount) > 0)) { alert("Enter the amount first"); return; }
        if (!window.confirm(`Send ${r.payee || r.category} — ${inr(r.amount)} to Accounts → Weekly Payments → Office/Mgnt?`)) return;
        await officeApi.sendToPayments({ username, ids: [r.id] });
      } else if (kind === "recall") {
        await officeApi.recallFromPayments({ username, ids: [r.id] });
      } else {
        await officeApi.setCashFlow({ username, ids: [r.id], on: !r.inCashFlow });
      }
      load();
    } catch (e) { alert(errMsg(e)); }
  }

  async function del(r) {
    if (!window.confirm(r.kind === "SALARY"
      ? `Delete ${r.payee}'s ${monthLabel(r.periodMonth, true)} salary (${inr(r.amount)})? It won't be created again for this month.`
      : `Delete this expense (${inr(r.amount)})?`)) return;
    try { await officeApi.remove(r.id, username); load(); } catch (e) { alert(errMsg(e)); }
  }

  function exportExcel(m, list) {
    const mTotal = list.reduce((t, r) => t + Number(r.amount || 0), 0);
    const aoa = [["Month", "Type", "Frequency", "Cycle Start Date", "Cycle End Date", "Category", "Payee", "Description", "Amount", "Status", "Paid On", "Payment Ref", "Raised By", "Remarks"],
      ...list.map(r => [monthLabel(r.periodMonth, true), r.kind === "SALARY" ? "Salary" : "Expense", FREQ[freqOf(r)], r.expenseDate || `${r.periodMonth}-01`, endOf(r) || "", r.category || "", r.payee || "",
        r.description || "", Number(r.amount || 0), (r.status === "PAID" ? "Paid" : r.sentForPayment ? "In Weekly Payments" : "Pending"), r.paidDate || "", r.paymentRef || "", r.raisedBy || "", r.remarks || ""])];
    aoa.push(["", "", "", "", "", "", "", "TOTAL", mTotal, "", "", "", "", ""]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [14, 9, 11, 14, 14, 20, 20, 30, 12, 9, 12, 14, 18, 24].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, D.label);
    XLSX.writeFile(wb, `${isMgmt ? "management" : "office"}-expense-${m === "ALL" ? "all" : m}.xlsx`);
  }

  return (
    <div className="hr-page" style={{ padding: "24px 32px", maxWidth: 1400 }}>
      {/* Two divisions */}
      <div className="hr-pill-row" style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8edf4", borderRadius: 11, marginBottom: 18 }}>
        {Object.entries(DIVISIONS).map(([k, d]) => (
          <button key={k} onClick={() => setDivision(k)}
            style={{ border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--hz-text-md)",
              background: division === k ? "#fff" : "transparent", color: division === k ? d.color : "var(--hz-ink-2)",
              fontWeight: division === k ? 700 : 500, boxShadow: division === k ? "0 1px 3px rgba(15,23,42,.18)" : "none" }}>{d.label}</button>
        ))}
      </div>
      {/* Header */}
      <div className="hr-page-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--hz-text-xl)", fontWeight: 800, color: "var(--hz-ink)" }}>{D.label}</div>
          <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginTop: 4 }}>
            {D.blurb} Everything here goes to Accounts → Weekly Payments → Office/Mgnt.
          </div>
        </div>
      </div>


      {err && <div style={{ ...card, padding: 14, color: "#b91c1c", marginBottom: 12 }}>{err}</div>}

      {/* Lines by month — black-lined grid like Funds, with a + row under each table to add an entry */}
      {loading ? <div style={{ color: "var(--hz-muted)", padding: 20 }}>Loading…</div>
        : !rows.length && !canManage ? <div style={{ ...card, padding: 28, textAlign: "center", color: "var(--hz-muted)" }}>No {D.label.toLowerCase()} expenses yet.</div>
        : shown.map(([m, list]) => {
            const mTotal = list.reduce((t, r) => t + Number(r.amount || 0), 0);
            const draft = drafts[m];
            const setD = (k, v) => setDrafts(d => ({ ...d, [m]: { ...d[m], [k]: v,
              ...(k === "expenseDate" || k === "frequency" ? { cycleEndDate: cycleEnd(k === "expenseDate" ? v : d[m].expenseDate, k === "frequency" ? v : d[m].frequency) } : {}) } }));
            return (
              <div key={m} style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, width: GRID_W, maxWidth: "100%" }}>
                  <div style={{ fontWeight: 800, color: "var(--hz-ink)", fontSize: "var(--hz-text-lg)" }}>All entries</div>
                  <div style={{ marginLeft: "auto", fontWeight: 700, color: "var(--hz-ink-2)", fontSize: "var(--hz-text-sm)" }}>{list.length} line{list.length === 1 ? "" : "s"} · {inr(mTotal)}</div>
                  <button style={{ ...ghost, padding: "6px 12px" }} onClick={() => exportExcel(m, list)} disabled={!list.length}><Download size={14} /> Excel</button>
                  {canManage && (() => {
                    const picked = list.filter(r => sel.has(r.id));
                    const allSent = picked.length > 0 && picked.every(r => r.sentForPayment && r.status === "PENDING");
                    const allCf = picked.length > 0 && picked.every(r => r.inCashFlow);
                    const dis = !picked.length;
                    const b2 = (bg) => ({ ...btn(dis ? "#cbd5e1" : bg), padding: "7px 12px", cursor: dis ? "default" : "pointer" });
                    return (<>
                      <button style={b2(allSent ? "#b45309" : "#2563eb")} disabled={dis} onClick={() => bulk(allSent ? "recall" : "send", list)}
                        title={dis ? "Tick lines to send" : allSent ? "Take the ticked lines back from Weekly Payments" : "Send the ticked lines to Accounts → Weekly Payments"}>
                        {allSent ? <Undo2 size={14} /> : <Send size={14} />} {allSent ? "Revoke Payment" : "Initiate Payment"}{picked.length ? ` (${picked.length})` : ""}
                      </button>
                      <button style={b2("#0f766e")} disabled={dis} onClick={() => bulk("cf", list)}
                        title={dis ? "Tick lines to plan" : allCf ? "Remove the ticked lines from Cash Flow → Planned Outflow" : "Put the ticked lines into Funds → Cash Flow → Planned Outflow"}>
                        <TrendingDown size={14} /> {allCf ? "Remove from Cash Flow" : "Cash Flow"}{picked.length ? ` (${picked.length})` : ""}
                      </button>
                    </>);
                  })()}
                  {canManage && (
                    <button title="Add entry" disabled={!!draft}
                      onClick={() => setDrafts(d => ({ ...d, [m]: { frequency: "ONE_TIME", expenseDate: today(), cycleEndDate: today(), category: "", payee: "", description: "", amount: "", files: [] } }))}
                      style={{ ...btn("var(--hz-primary)"), padding: 0, width: 34, height: 34, justifyContent: "center", opacity: draft ? 0.5 : 1, cursor: draft ? "default" : "pointer" }}>
                      <Plus size={18} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
                  <table className="fund-grid" style={{ width: GRID_W, borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <colgroup>{GRID_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                    <thead><tr>
                      <th style={{ ...gth, textAlign: "center", padding: "10px 6px" }}>
                        {canManage && (() => {
                          const ids = list.filter(r => r.status === "PENDING").map(r => r.id);
                          const all = ids.length > 0 && ids.every(id => sel.has(id));
                          return <input type="checkbox" checked={all} disabled={!ids.length} title="Tick all"
                            onChange={() => setSel(x => { const n = new Set(x); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n; })} />;
                        })()}
                      </th>
                      {["Frequency", "Cycle Start Date", "Cycle End Date", "Category", "Paid To", "Description", "Amount (₹)", "Docs", "Payment", "Cash Flow", ""].map((h, i) =>
                        <th key={i} title={h === "Docs" ? "Docs / bills" : undefined} style={{ ...gth, textAlign: i === 6 ? "right" : i >= 7 ? "center" : "left" }}>
                          {h === "Docs" ? <Paperclip size={15} style={{ verticalAlign: "middle" }} /> : h}</th>)}
                    </tr></thead>
                    <tbody>
                      {list.map(r => {
                        const urls = urlsOf(r);
                        if (edit && edit.id === r.id) {
                          const sal = r.kind === "SALARY";
                          const setE = (k, v) => setEdit(x => ({ ...x, [k]: v,
                            ...(k === "expenseDate" || k === "frequency" ? { cycleEndDate: cycleEnd(k === "expenseDate" ? v : x.expenseDate, k === "frequency" ? v : x.frequency) } : {}) }));
                          return (
                            <tr key={r.id} style={{ background: "#f8fafc" }}>
                              <td style={gtd} />
                                <td style={gtd}>
                                <select value={edit.frequency} onChange={e => setE("frequency", e.target.value)} style={cellIn}
                                  title={r.recurSourceId ? "Changes the frequency of the whole series" : ""}>
                                  {Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                </select>
                              </td>
                              <td style={gtd}><input type="date" value={edit.expenseDate} onChange={e => setE("expenseDate", e.target.value)} style={cellIn} /></td>
                              <td style={gtd}><input type="date" value={edit.cycleEndDate || ""} min={edit.expenseDate || undefined} onChange={e => setE("cycleEndDate", e.target.value)} style={cellIn} /></td>
                              <td style={gtd}>
                                <select value={edit.category} onChange={e => setE("category", e.target.value)} style={cellIn}>
                                  {[...(sal || edit.category === "Salary" ? ["Salary"] : []), ...D.categories].map(c => <option key={c}>{c}</option>)}
                                  {edit.category && edit.category !== "Salary" && !D.categories.includes(edit.category) && <option>{edit.category}</option>}
                                </select>
                              </td>
                              <td style={gtd}>
                                <select value={edit.payee} onChange={e => setE("payee", e.target.value)} style={cellIn}>
                                  <option value="">Paid to…</option>
                                  {people.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                  {edit.payee && !people.some(p => p.name === edit.payee) && <option value={edit.payee}>{edit.payee}</option>}
                                </select>
                              </td>
                              <td style={gtd}>
                                <input value={edit.description} onChange={e => setE("description", e.target.value)} placeholder="Description" style={cellIn} />
                              </td>
                              <td style={gtd}><input type="number" min="0" step="0.01" value={edit.amount} onChange={e => setE("amount", e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") saveEdit(r); }} style={{ ...cellIn, textAlign: "right", fontWeight: 700 }} /></td>
                              <td style={gtd}>
                                {edit.existing.map((u, i) => (
                                  <span key={i} style={{ display: "inline-flex", alignItems: "center", marginRight: 4, fontSize: "var(--hz-text-xs)" }}>
                                    <a href={attachmentFullUrl(u)} target="_blank" rel="noreferrer">{i + 1}</a>
                                    <button title="Remove" onClick={() => setE("existing", edit.existing.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", padding: "0 2px" }}>×</button>
                                  </span>))}
                                <label title="Attach bills" style={{ ...iconBtn("#1e3a5f"), cursor: "pointer" }}>
                                  <Paperclip size={13} />{edit.files.length ? `+${edit.files.length}` : ""}
                                  <input type="file" multiple accept="image/*,.pdf" style={{ display: "none" }} onChange={e => setE("files", [...edit.files, ...Array.from(e.target.files || [])])} />
                                </label>
                              </td>
                              <td style={gtd} />
                              <td style={gtd} />
                              <td style={{ ...gtd, whiteSpace: "nowrap", textAlign: "center" }}>
                                <div style={{ display: "inline-flex", gap: 6 }}>
                                  <button title="Save" disabled={edit.busy} style={{ ...iconBtn("#15803d"), borderColor: "#86efac" }} onClick={() => saveEdit(r)}><Check size={14} /></button>
                                  <button title="Cancel" style={iconBtn("#b91c1c")} onClick={() => setEdit(null)}><X size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={r.id}>
                            <td style={{ ...gtd, textAlign: "center", padding: "10px 6px" }}>
                              {canManage && r.status === "PENDING" && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />}
                            </td>
                            <td style={gtd}>{FREQ[freqOf(r)]}</td>
                            <td style={{ ...gtd, whiteSpace: "nowrap" }}>{fmtD(r.expenseDate || `${r.periodMonth}-01`)}</td>
                            <td style={{ ...gtd, whiteSpace: "nowrap" }}>{fmtD(endOf(r))}</td>
                            <td style={gtd}>{r.category || "—"}</td>
                            <td style={{ ...gtd, fontWeight: 600 }}>{r.payee || "—"}</td>
                            <td style={gtd}>
                              {r.description || "—"}
                              {r.remarks && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 3 }}>Note: {r.remarks}</div>}
                            </td>
                            <td style={{ ...gtd, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                              {canManage && r.kind === "SALARY" && r.status === "PENDING"
                                ? <AmountInput row={r} username={username} onSaved={load} />
                                : inr(r.amount)}
                            </td>
                            <td style={{ ...gtd, textAlign: "center" }}>
                              {urls.length ? (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                                  {urls.map((u, i) => (
                                    <a key={i} href={attachmentFullUrl(u)} target="_blank" rel="noreferrer" title={urls.length > 1 ? `Open file ${i + 1} of ${urls.length}` : "Open attachment"}
                                      style={{ ...iconBtn("#1d4ed8"), background: "#eff6ff", textDecoration: "none" }}><Paperclip size={13} /></a>))}
                                </div>
                              ) : <span style={{ color: "#94a3b8" }}>—</span>}
                            </td>
                            <td style={{ ...gtd, textAlign: "center" }}>
                              {r.status === "PAID" ? <Tag bg="#dcfce7" fg="#15803d">Paid {fmtD(r.paidDate)}</Tag>
                                : !canManage ? (r.sentForPayment ? <Tag bg="#dbeafe" fg="#1d4ed8">In Weekly Payments</Tag> : "—")
                                : r.sentForPayment
                                  ? <button title="Revoke — take it back from Weekly Payments" style={txtBtn("#b45309", "#fcd34d", "#fffbeb")} onClick={() => rowAction("recall", r)}>Revoke Payment</button>
                                  : <button title="Send to Accounts → Weekly Payments" style={txtBtn("#1d4ed8", "#93c5fd", "#eff6ff")} onClick={() => rowAction("send", r)}>Initiate Payment</button>}
                            </td>
                            <td style={{ ...gtd, textAlign: "center" }}>
                              {canManage ? <button title={r.inCashFlow ? "Remove from Funds → Cash Flow → Planned Outflow" : "Add to Funds → Cash Flow → Planned Outflow"}
                                  style={r.inCashFlow ? txtBtn("#fff", "#0f766e", "#0f766e") : txtBtn("#0f766e", "#5eead4", "#f0fdfa")} onClick={() => rowAction("cf", r)}>
                                  {r.inCashFlow ? "In Cash Flow ✓" : "Cash Flow"}</button>
                                : r.inCashFlow ? <Tag bg="#ccfbf1" fg="#0f766e">In Cash Flow</Tag> : "—"}
                            </td>
                            <td style={{ ...gtd, textAlign: "center", whiteSpace: "nowrap" }}>
                              <div style={{ display: "inline-flex", gap: 6 }}>
                                {canManage && <button title="Edit" style={iconBtn("#1e3a5f")} disabled={!!edit}
                                  onClick={() => setEdit({ id: r.id, frequency: freqOf(r), cycleEndDate: endOf(r), expenseDate: r.expenseDate || (r.kind === "SALARY" ? `${r.periodMonth}-01` : today()), category: r.category || "",
                                    payee: r.payee || "", description: r.description || "", remarks: r.remarks || "", amount: r.amount ?? "", files: [], existing: urls })}><Pencil size={13} /></button>}
                                {canManage && r.status === "PENDING" && <button title="Delete" style={iconBtn("#b91c1c")} onClick={() => del(r)}><Trash2 size={13} /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* New entry row — opened by the + at the table's top-right corner */}
                      {canManage && (draft ? (
                        <tr>
                          <td style={gtd} />
                          <td style={gtd}>
                            <select value={draft.frequency} onChange={e => setD("frequency", e.target.value)} style={cellIn}>
                              {Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          </td>
                          <td style={gtd}><input type="date" value={draft.expenseDate} onChange={e => setD("expenseDate", e.target.value)} style={cellIn} /></td>
                          <td style={gtd}><input type="date" value={draft.cycleEndDate || ""} min={draft.expenseDate || undefined} onChange={e => setD("cycleEndDate", e.target.value)} style={cellIn} /></td>
                          <td style={gtd}>
                            <select value={draft.category} onChange={e => setD("category", e.target.value)} style={cellIn}>
                              <option value="">Category…</option>
                              {D.categories.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </td>
                          <td style={gtd}>
                            <select value={draft.payee} onChange={e => setD("payee", e.target.value)} style={cellIn}>
                              <option value="">Paid to…</option>
                              {people.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </select>
                          </td>
                          <td style={gtd}><input value={draft.description} onChange={e => setD("description", e.target.value)} placeholder="Description" style={cellIn} /></td>
                          <td style={gtd}><input type="number" min="0" step="0.01" value={draft.amount} onChange={e => setD("amount", e.target.value)} placeholder="0" style={{ ...cellIn, textAlign: "right", fontWeight: 700 }}
                            onKeyDown={e => { if (e.key === "Enter") saveDraft(m); }} /></td>
                          <td style={gtd}>
                            <label title="Attach bills" style={{ ...iconBtn("#1e3a5f"), cursor: "pointer" }}>
                              <Paperclip size={13} />{draft.files.length || ""}
                              <input type="file" multiple accept="image/*,.pdf" style={{ display: "none" }} onChange={e => setD("files", [...draft.files, ...Array.from(e.target.files || [])])} />
                            </label>
                          </td>
                          <td style={gtd} />
                          <td style={gtd} />
                          <td style={{ ...gtd, whiteSpace: "nowrap", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", gap: 6 }}>
                              <button title="Save" disabled={draft.busy} style={{ ...iconBtn("#15803d"), borderColor: "#86efac" }} onClick={() => saveDraft(m)}><Check size={14} /></button>
                              <button title="Cancel" style={iconBtn("#b91c1c")} onClick={() => setDrafts(d => { const n = { ...d }; delete n[m]; return n; })}><X size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ) : null)}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={7} style={{ ...gtd, textAlign: "right", fontWeight: 800 }}>Total</td>
                        <td style={{ ...gtd, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>{inr(mTotal)}</td>
                        <td colSpan={4} style={gtd} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}

    </div>
  );
}

// Inline entry of a month's salary amount (Office Mgnt salaries are not fixed).
function AmountInput({ row, username, onSaved }) {
  const [v, setV] = useState(Number(row.amount) > 0 ? String(row.amount) : "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(Number(row.amount) > 0 ? String(row.amount) : ""); }, [row.amount]);
  const dirty = (Number(v) || 0) !== (Number(row.amount) || 0);
  async function save() {
    if (!dirty) return;
    if (v !== "" && !(Number(v) >= 0)) { alert("Enter a valid amount"); return; }
    setBusy(true);
    try { await officeApi.update(row.id, { username, amount: v === "" ? 0 : v }); onSaved(); }
    catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", width: "100%" }}>
      <input type="number" min="0" step="0.01" value={v} placeholder="Amount" disabled={busy}
        onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }}
        style={{ ...cellIn, flex: 1, minWidth: 0, textAlign: "right", fontWeight: 700, borderColor: Number(row.amount) > 0 ? "#cbd5e1" : "#f59e0b", background: Number(row.amount) > 0 ? "#fff" : "#fffbeb" }} />
      {dirty && <button title="Save amount" style={{ ...iconBtn("#15803d"), padding: "5px" }} disabled={busy} onClick={save}><Check size={13} /></button>}
    </div>
  );
}

// ── Accounts → Weekly Payments → Office/Mgnt ─────────────────────────────────────────────────────────────────
// Laid out like Team Payments: one card per month. "Send for Payment" downloads the bank Excel of the month's
// unpaid lines and marks them sent; "Download Excel" re-downloads what was already sent.

const BANK_HEADERS   = ["Transaction Type", "Beneficiary Account Number", "Instrument Amount", "Beneficiary Name",
  "Beneficiary Code", "Remarks", "IFSC Code", "Ben Email ID", "Ben Mobile No"];
const BANK_MANDATORY = ["Mandatory", "Mandatory", "Mandatory", "Mandatory", "Optional", "Optional", "Mandatory", "Optional", "Optional"];
const hasBank = (l) => !!(l.accountNumber && l.ifsc);
const remarkOf = (l) => (l.kind === "SALARY" ? `Salary ${monthLabel(l.periodMonth, true)}` : [l.category, l.description].filter(Boolean).join(" - ")).slice(0, 60);

// Bank payment .txt — same layout as Team Payments' Bank Payment file: one header line, one pipe-delimited line per
// transfer, CRLF line endings, named payfile_<yyyymmdd><second-of-day>.txt. Only lines with account number + IFSC.
function downloadOfficeTxt(lines) {
  const clean = (v) => String(v ?? "").replace(/[|\r\n]+/g, " ").trim();
  const body = lines.map(l => [
    "N",                                       // Transaction Type — NEFT
    clean(l.accountNumber),                    // Beneficiary Account Number
    String(Number(Number(l.amount).toFixed(2))), // Instrument Amount
    clean(l.payee),                            // Beneficiary Name
    "",                                        // Beneficiary Code
    clean(remarkOf(l)),                        // Remarks
    clean(l.ifsc),                             // IFSC Code
    "", "",                                    // Ben Email ID, Ben Mobile No
  ].join("|"));
  const content = [BANK_HEADERS.join("|"), ...body].join("\r\n") + "\r\n";
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const secOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `payfile_${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}${secOfDay}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadOfficeExcel(month, lines, missing = [], separate = []) {
  const rows = lines.map(l => ["N", l.accountNumber, Number(Number(l.amount).toFixed(2)), l.payee || l.category || "", "", remarkOf(l), l.ifsc, "", ""]);
  const aoa = [BANK_HEADERS, BANK_MANDATORY, ...rows];
  aoa.push(["", "", Number(rows.reduce((t, r) => t + r[2], 0).toFixed(2)), "GRAND TOTAL", "", "", "", "", ""]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [16, 24, 16, 26, 14, 30, 14, 22, 14].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Office-Mgnt ${monthLabel(month)}`.slice(0, 31));
  if (missing.length) {
    const ms = XLSX.utils.aoa_to_sheet([["Type", "Payee", "Remarks", "Amount", "Missing"],
      ...missing.map(l => [l.kind === "SALARY" ? "Salary" : "Expense", l.payee || "", remarkOf(l), Number(Number(l.amount).toFixed(2)),
        [!l.accountNumber && "Account number", !l.ifsc && "IFSC"].filter(Boolean).join(" + ")])]);
    ms["!cols"] = [10, 24, 30, 12, 24].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ms, "Missing bank details");
  }
  if (separate.length) {
    const ss = XLSX.utils.aoa_to_sheet([["Division", "Date", "Category", "Paid To", "Description", "Amount"],
      ...separate.map(l => [DIVISIONS[divOf(l)].label, l.expenseDate || "", l.category || "", l.payee || "", l.description || "", Number(Number(l.amount).toFixed(2))]),
      ["", "", "", "", "TOTAL", Number(separate.reduce((t, l) => t + Number(l.amount || 0), 0).toFixed(2))]]);
    ss["!cols"] = [20, 12, 22, 22, 32, 12].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ss, "Pay separately");
  }
  XLSX.writeFile(wb, `office-mgnt-payment-${month}.xlsx`);
}

const MONTH_STATUS = {
  PENDING: { label: "Awaiting payment",  bg: "#fffbeb", color: "#b45309" },
  PARTLY:  { label: "Partly sent",       bg: "#e0f2fe", color: "#0369a1" },
  SENT:    { label: "Sent for payment",  bg: "#dcfce7", color: "#15803d" },
};

function OfficePayments({ username, canManage }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState({});

  const load = useCallback(() => {
    officeApi.list(username, "ALL", undefined, undefined, true) // only lines sent from HR → Office/Mgnt
      .then(r => { setRows(r.data?.data || []); setError(""); })
      .catch(e => { setRows([]); setError(errMsg(e)); });
  }, [username]);
  useEffect(() => { load(); }, [load]);

  const months = useMemo(() => {
    const m = new Map();
    (rows || []).forEach(r => { if (!m.has(r.periodMonth)) m.set(r.periodMonth, []); m.get(r.periodMonth).push(r); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  async function send(month, lines) {
    const pend = lines.filter(l => l.status === "PENDING" && Number(l.amount) > 0);
    const bank = pend.filter(hasBank);
    const separate = pend.filter(l => !hasBank(l) && l.kind === "EXPENSE");   // expenses are paid outside the bank file
    const held = pend.filter(l => !hasBank(l) && l.kind === "SALARY");         // salaries wait for bank details
    const toSend = [...bank, ...separate];
    const total = toSend.reduce((t, l) => t + Number(l.amount || 0), 0);
    if (!window.confirm(`Send ${toSend.length} payment${toSend.length === 1 ? "" : "s"} of ${inr(total)} for ${monthLabel(month, true)}?\n\nThe bank payment .txt file downloads now and these lines are marked sent for payment.`
      + (separate.length ? `\n\n${separate.length} expense(s) have no bank details — listed on the "pay separately" list.` : "")
      + (held.length ? `\n\n${held.length} salar${held.length === 1 ? "y has" : "ies have"} no account number / IFSC and stay pending.` : ""))) return;
    setBusy(month);
    try {
      await officeApi.send({ username, ids: toSend.map(l => l.id) });
      if (bank.length) downloadOfficeTxt(bank);
      if (separate.length) alert(`${separate.length} expense(s) without bank details are not in the .txt file — pay them separately:\n` + separate.map(l => `${l.payee || l.category} — ${inr(l.amount)}`).join("\n"));
      load();
    } catch (e) { alert(errMsg(e)); }
    finally { setBusy(""); }
  }
  async function unsend(l) {
    if (!window.confirm(`Move ${l.payee || "this line"} (${inr(l.amount)}) back to awaiting payment?`)) return;
    try { await officeApi.markUnpaid(l.id, { username }); load(); } catch (e) { alert(errMsg(e)); }
  }

  if (rows === null) return <div className="loading" style={{ height: 80 }}>Loading…</div>;

  return (
    <div className="pay-dash">
      <style>{`
        @media (max-width: 768px) {
          .off-pay-table, .off-pay-table tbody, .off-pay-table tr, .off-pay-table td { display: block; width: 100%; box-sizing: border-box; }
          .off-pay-table thead { display: none; }
          .off-pay-table tbody tr { border: 1px solid #e2e8f0; border-radius: 10px; margin: 8px 0; padding: 4px 0; background: #fff !important; }
          .off-pay-table td { border: none !important; padding: 5px 12px !important; white-space: normal !important; width: auto !important; text-align: left !important; }
          .off-pay-table td[data-label] { display: grid; grid-template-columns: 104px minmax(0, 1fr); column-gap: 10px; }
          .off-pay-table td[data-label]::before { content: attr(data-label); font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: .4px; padding-top: 2px; }
        }
      `}</style>

      <div style={{ background: "linear-gradient(135deg,#4338ca,#3730a3)", borderRadius: 12, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <Building2 size={24} color="white" />
        <div>
          <div style={{ color: "white", fontWeight: 700, fontSize: "var(--hz-text-lg)" }}>Office/Mgnt Payment</div>
          <div style={{ color: "#e0e7ff", fontSize: "var(--hz-text-sm)", marginTop: 2 }}>
            Management (incl. the monthly Office Mgnt salaries) and Office expenses from HR → Office/Mgnt. Send for Payment downloads the bank payment .txt file for the month and marks those lines sent.
          </div>
        </div>
      </div>

      {error && <div className="card" style={{ padding: "12px 16px", marginBottom: 16, background: "#fef2f2", border: "1px solid #fecaca", color: "#7f1d1d", fontSize: "var(--hz-text-md)" }}>{error}</div>}

      {months.length === 0 && !error && (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--hz-ink)", fontSize: "var(--hz-text-md)" }}>
          Nothing to pay yet. Lines sent with Initiate Payment in HR → Office/Mgnt appear here.
        </div>
      )}

      {months.map(([month, lines], idx) => {
        const total = lines.reduce((t, l) => t + Number(l.amount || 0), 0);
        const pending = lines.filter(l => l.status === "PENDING" && Number(l.amount) > 0);
        const pendingAmt = pending.reduce((t, l) => t + Number(l.amount || 0), 0);
        const ready = pending.filter(l => hasBank(l) || l.kind === "EXPENSE");
        const noAmount = lines.filter(l => l.status === "PENDING" && l.kind === "SALARY" && !(Number(l.amount) > 0));
        const missing = pending.filter(l => !hasBank(l) && l.kind === "SALARY");
        const sent = lines.filter(l => l.status === "PAID");
        const sentReady = sent.filter(hasBank);
        const sentAny = sent.length > 0;
        const st = MONTH_STATUS[!sent.length ? "PENDING" : pending.length ? "PARTLY" : "SENT"];
        const lastSent = sent.map(l => l.paidDate).filter(Boolean).sort().pop();
        const expanded = open[month] ?? idx === 0;
        const mine = busy === month;
        const canSend = canManage && ready.length > 0 && !mine;
        return (
          <div key={month} className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="pay-section-title" style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)" }}>
                  Office/Mgnt — {monthLabel(month, true)}
                  <span style={{ marginLeft: 10, padding: "3px 10px", borderRadius: 999, fontSize: "var(--hz-text-xs)", fontWeight: 700, background: st.bg, color: st.color, verticalAlign: "middle" }}>{st.label}</span>
                </div>
                <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-ink)", marginTop: 4 }}>
                  Management <b>{inr(lines.filter(l => divOf(l) === "MANAGEMENT").reduce((t, l) => t + Number(l.amount || 0), 0))}</b>
                  {" "}· Office <b>{inr(lines.filter(l => divOf(l) === "OFFICE").reduce((t, l) => t + Number(l.amount || 0), 0))}</b>
                  {" "}· Total <b>{inr(total)}</b>
                  {pending.length > 0 && <> · Pending <b style={{ color: "#b45309" }}>{inr(pendingAmt)}</b></>}
                  {lastSent && <> · Last sent {fmtD(lastSent)}</>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {canManage && (
                  <button onClick={() => send(month, lines)} disabled={!canSend}
                    title={!ready.length ? (pending.length ? "Add account number / IFSC first" : "Nothing pending") : `Download the bank .txt file and mark ${ready.length} line(s) sent`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "8px 14px", fontSize: "var(--hz-text-md)", fontWeight: 600, fontFamily: "inherit", border: "1px solid",
                      background: canSend ? "#2563eb" : "#f1f5f9", color: canSend ? "var(--hz-on-dark)" : "var(--hz-faint)",
                      borderColor: canSend ? "#1d4ed8" : "#cbd5e1", cursor: canSend ? "pointer" : "not-allowed",
                    }}>
                    <Send size={15} /> {mine ? "Sending…" : `Send for Payment${ready.length ? ` (${ready.length})` : ""}`}
                  </button>
                )}
                <button onClick={() => downloadOfficeExcel(month, sentReady, [], sent.filter(l => !hasBank(l)))} disabled={!sentAny}
                  title={sentAny ? `Download the Excel of the ${sent.length} line(s) already sent` : "Available once lines are sent for payment"}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "8px 14px", fontSize: "var(--hz-text-md)", fontWeight: 600, fontFamily: "inherit", border: "1px solid",
                    background: sentAny ? "#0f766e" : "#f1f5f9", color: sentAny ? "var(--hz-on-dark)" : "var(--hz-faint)",
                    borderColor: sentAny ? "#0f766e" : "#cbd5e1", cursor: sentAny ? "pointer" : "not-allowed",
                  }}>
                  <Download size={15} /> Download Excel
                </button>
              </div>
            </div>

            {noAmount.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--hz-text-md)", color: "#7c2d12", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 12px" }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <b>{noAmount.length} salar{noAmount.length === 1 ? "y has" : "ies have"} no amount entered</b> — enter this month's amount in HR → Office/Mgnt:{" "}
                  {noAmount.map(l => l.payee).join(", ")}.
                </div>
              </div>
            )}

            {missing.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--hz-text-md)", color: "#7c2d12", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 12px" }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <b>{missing.length} salar{missing.length === 1 ? "y has" : "ies have"} no account number / IFSC</b> — held back until they're added in the Employee Master:{" "}
                  {missing.map(l => l.payee || l.category).join(", ")}.
                </div>
              </div>
            )}

            <button onClick={() => setOpen(o => ({ ...o, [month]: !expanded }))}
              style={{ border: "none", background: "none", color: "#4338ca", fontWeight: 700, fontSize: "var(--hz-text-md)", cursor: "pointer", padding: "12px 0 0", fontFamily: "inherit" }}>
              {expanded ? "Hide lines" : `Show lines (${lines.length})`}
            </button>

            {expanded && (
              <div className="table-container" style={{ marginTop: 8 }}>
                <table className="off-pay-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Type</th><th>Payee</th><th>Details</th><th>Bank</th><th>Account Number</th><th>IFSC</th>
                      <th style={{ textAlign: "right" }}>Amount</th><th>Status</th>{canManage && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(DIVISIONS).map(([dk, dv]) => {
                      const dl = lines.filter(l => divOf(l) === dk);
                      if (!dl.length) return null;
                      const dTotal = dl.reduce((t, l) => t + Number(l.amount || 0), 0);
                      return [
                        <tr key={dk + "-h"} className="off-div-row">
                          <td colSpan={canManage ? 10 : 9} style={{ background: dv.bg, color: dv.color, fontWeight: 800, fontSize: "var(--hz-text-md)" }}>
                            {dv.label}<span style={{ float: "right" }}>{dl.length} line{dl.length === 1 ? "" : "s"} · {inr(dTotal)}</span>
                          </td>
                        </tr>,
                        ...dl.map((l, i) => (
                      <tr key={l.id}>
                          <td data-label="#">{i + 1}</td>
                          <td data-label="Type"><KindTag k={l.kind} /></td>
                          <td data-label="Payee" style={{ fontWeight: 600 }}>{l.payee || "—"}</td>
                          <td data-label="Details">
                            {l.kind === "SALARY" ? `Salary ${monthLabel(l.periodMonth, true)}` : <>{l.category}{l.description ? ` — ${l.description}` : ""}<div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>{fmtD(l.expenseDate)} · Raised by {l.raisedBy || "—"}</div></>}
                            {l.remarks && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>Note: {l.remarks}</div>}
                          </td>
                          <td data-label="Bank">{l.bankName || "—"}</td>
                          <td data-label="Account no." style={{ fontVariantNumeric: "tabular-nums" }}>{l.accountNumber || <span style={{ color: "#b91c1c", fontWeight: 600 }}>Missing</span>}</td>
                          <td data-label="IFSC">{l.ifsc || <span style={{ color: "#b91c1c", fontWeight: 600 }}>Missing</span>}</td>
                          <td data-label="Amount" style={{ fontWeight: 800, textAlign: "right" }}>{inr(l.amount)}</td>
                          <td data-label="Status">
                            {l.status === "PAID"
                              ? <span style={{ color: "#15803d", fontWeight: 700, whiteSpace: "nowrap" }}>Sent {fmtD(l.paidDate)}</span>
                              : <span style={{ color: "#b45309", fontWeight: 700 }}>Pending</span>}
                          </td>
                          {canManage && <td style={{ textAlign: "right" }}>
                            {l.status === "PAID" && <button title="Move back to awaiting payment" style={iconBtn("#b45309")} onClick={() => unsend(l)}><Undo2 size={13} /></button>}
                          </td>}
                        </tr>
                        )),
                      ];
                    })}
                    <tr>
                      <td colSpan={7} style={{ textAlign: "right", fontWeight: 700 }}>Total</td>
                      <td style={{ fontWeight: 800, textAlign: "right" }}>{inr(total)}</td>
                      <td colSpan={canManage ? 2 : 1} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
