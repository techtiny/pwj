import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Download, Undo2, Trash2, Pencil, Paperclip, Users, Send, Building2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { officeApi, uploadDocument, attachmentFullUrl } from "./hrApi";

// Office / Management expenses.
//  • HR → Office/Mgnt (mode "hr"): VP / Admin raise office expenses and manage the office staff paid a fixed
//    monthly amount — a salary line is created automatically for every month.
//  • Accounts → Weekly Payments → Office/Mgnt (mode "payments"): the same lines by month, like Team Payments —
//    "Send for Payment" downloads the bank Excel and marks the lines sent.

const CATEGORIES = ["Rent", "Electricity", "Internet / Phone", "Office Supplies", "Pantry / Refreshments",
  "Housekeeping", "Repairs & Maintenance", "Travel / Conveyance", "Courier / Postage", "Printing / Stationery", "Other"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: "var(--hz-text-sm)", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" });
const ghost = { ...btn("#fff", "#1e3a5f"), border: "1px solid #cbd5e1" };
const iconBtn = (color) => ({ border: "1px solid #e2e8f0", background: "#fff", color, borderRadius: 6, padding: "5px 7px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--hz-text-xs)", fontWeight: 700, fontFamily: "inherit" });
const th = { padding: "10px 12px", textAlign: "left", fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: "var(--hz-text-md)", borderBottom: "1px solid #eef2f7", color: "var(--hz-ink)", verticalAlign: "top" };
const lbl = { fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: "block", marginBottom: 5 };

const inr = (v) => "₹" + (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const monthLabel = (ym, full = false) => { if (!ym) return "—"; const [y, m] = ym.split("-").map(Number); return `${(full ? FULL_MONTHS : MONTHS)[m - 1]} ${y}`; };
const fmtD = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const errMsg = (e) => e?.response?.data?.message || e?.message || "Something went wrong";
const urlsOf = (r) => { try { return r.attachmentUrls ? JSON.parse(r.attachmentUrls) : []; } catch { return []; } };

const STATUS = {
  PENDING: { label: "Pending", bg: "#fef3c7", color: "#b45309" },
  PAID:    { label: "Paid",    bg: "#dcfce7", color: "#15803d" },
};
const Pill = ({ s }) => { const x = STATUS[s] || STATUS.PENDING; return <span style={{ background: x.bg, color: x.color, borderRadius: 100, padding: "3px 10px", fontSize: "var(--hz-text-xs)", fontWeight: 700, whiteSpace: "nowrap" }}>{x.label}</span>; };
const KindTag = ({ k }) => (
  <span style={{ background: k === "SALARY" ? "#ede9fe" : "#e0f2fe", color: k === "SALARY" ? "#6d28d9" : "#0369a1", borderRadius: 6, padding: "2px 8px", fontSize: "var(--hz-text-xs)", fontWeight: 700 }}>
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
  const [month, setMonth] = useState(thisMonth());
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null);       // raise / edit expense modal
  const [salaryEdit, setSalaryEdit] = useState(null);
  const [showStaff, setShowStaff] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    officeApi.list(username, month, status || undefined)
      .then(r => { setRows(r.data?.data || []); setErr(""); })
      .catch(e => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, [username, month, status]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const sum = (f) => rows.filter(f).reduce((t, r) => t + Number(r.amount || 0), 0);
    return {
      total: sum(() => true), salary: sum(r => r.kind === "SALARY"), expense: sum(r => r.kind === "EXPENSE"),
      pending: sum(r => r.status === "PENDING"), paid: sum(r => r.status === "PAID"),
    };
  }, [rows]);

  // Group by month so salaries and expenses of a month read together.
  const groups = useMemo(() => {
    const m = new Map();
    rows.forEach(r => { if (!m.has(r.periodMonth)) m.set(r.periodMonth, []); m.get(r.periodMonth).push(r); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  async function del(r) {
    if (!window.confirm(`Delete this office expense (${inr(r.amount)})?`)) return;
    try { await officeApi.remove(r.id, username); load(); } catch (e) { alert(errMsg(e)); }
  }

  function exportExcel() {
    const aoa = [["Month", "Type", "Date", "Category", "Payee", "Description", "Amount", "Status", "Paid On", "Payment Ref", "Raised By", "Remarks"],
      ...rows.map(r => [monthLabel(r.periodMonth, true), r.kind === "SALARY" ? "Salary" : "Expense", r.expenseDate || "", r.category || "", r.payee || "",
        r.description || "", Number(r.amount || 0), STATUS[r.status]?.label || r.status, r.paidDate || "", r.paymentRef || "", r.raisedBy || "", r.remarks || ""])];
    aoa.push(["", "", "", "", "", "TOTAL", totals.total, "", "", "", "", ""]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [14, 9, 12, 20, 20, 30, 12, 9, 12, 14, 18, 24].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Office-Mgnt");
    XLSX.writeFile(wb, `office-mgnt-${month === "ALL" ? "all" : month}${status ? "-" + status.toLowerCase() : ""}.xlsx`);
  }

  return (
    <div className="hr-page" style={{ padding: "24px 32px", maxWidth: 1400 }}>
      {/* Header */}
      <div className="hr-page-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--hz-text-xl)", fontWeight: 800, color: "var(--hz-ink)" }}>Office / Management Expenses</div>
          <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginTop: 4 }}>
            {"Office expenses raised by VP / Admin, plus the monthly Office Mgnt salaries. Everything here goes to Accounts → Weekly Payments → Office/Mgnt."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={ghost} onClick={() => setShowStaff(s => !s)}><Users size={14} /> Office Mgnt Salaries</button>
          {canManage && <button style={btn("var(--hz-primary)")} onClick={() => setForm({ expenseDate: today(), category: "", description: "", payee: "", amount: "", bankName: "", accountNumber: "", ifsc: "", files: [], existing: [] })}><Plus size={14} /> Raise Expense</button>}
          <button style={ghost} onClick={exportExcel} disabled={!rows.length}><Download size={14} /> Excel</button>
        </div>
      </div>

      {showStaff && <StaffPanel username={username} canManage={canManage} onChanged={load} />}

      {/* Filters */}
      <div className="hr-filter-bar" style={{ ...card, padding: "12px 16px", display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <label style={lbl}>Month</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="month" value={month === "ALL" ? "" : month} onChange={e => setMonth(e.target.value || "ALL")} style={{ ...inputS, width: 170 }} />
            <button style={{ ...ghost, padding: "6px 12px", background: month === "ALL" ? "#e0e7ff" : "#fff" }} onClick={() => setMonth("ALL")}>All months</button>
          </div>
        </div>
        <div>
          <label style={lbl}>Status</label>
          <div style={{ display: "inline-flex", gap: 4, padding: 3, background: "#e8edf4", borderRadius: 9 }}>
            {[["", "All"], ["PENDING", "Pending"], ["PAID", "Paid"]].map(([k, l]) => (
              <button key={k || "all"} onClick={() => setStatus(k)}
                style={{ border: "none", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--hz-text-sm)",
                  background: status === k ? "#fff" : "transparent", color: status === k ? "var(--hz-primary)" : "var(--hz-ink-2)", fontWeight: status === k ? 700 : 500 }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="hr-stat-flex" style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[["Total", totals.total, "var(--hz-ink)"], ["Salaries", totals.salary, "#6d28d9"], ["Expenses", totals.expense, "#0369a1"],
          ["Pending", totals.pending, "#b45309"], ["Paid", totals.paid, "#15803d"]].map(([l, v, c]) => (
          <div key={l} style={{ ...card, padding: "12px 18px", minWidth: 150 }}>
            <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
            <div style={{ fontSize: "var(--hz-text-xl)", fontWeight: 800, color: c, marginTop: 4 }}>{inr(v)}</div>
          </div>
        ))}
      </div>

      {err && <div style={{ ...card, padding: 14, color: "#b91c1c", marginBottom: 12 }}>{err}</div>}

      {/* Lines by month */}
      {loading ? <div style={{ color: "var(--hz-muted)", padding: 20 }}>Loading…</div>
        : !groups.length ? <div style={{ ...card, padding: 28, textAlign: "center", color: "var(--hz-muted)" }}>No office expenses for this selection.</div>
        : groups.map(([m, list]) => {
            const mTotal = list.reduce((t, r) => t + Number(r.amount || 0), 0);
            return (
              <div key={m} style={{ ...card, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 800, color: "var(--hz-ink)", fontSize: "var(--hz-text-md)" }}>{monthLabel(m, true)}</div>
                  <div style={{ fontWeight: 700, color: "var(--hz-ink-2)", fontSize: "var(--hz-text-sm)" }}>{list.length} line{list.length === 1 ? "" : "s"} · {inr(mTotal)}</div>
                </div>
                <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      {["Type", "Date", "Category", "Payee", "Description", "Amount", "Status", "Docs", ""].map((h, i) =>
                        <th key={i} style={{ ...th, textAlign: h === "Amount" ? "right" : "left" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {list.map(r => {
                        const urls = urlsOf(r);
                        return (
                          <tr key={r.id}>
                            <td style={td}><KindTag k={r.kind} /></td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{r.kind === "SALARY" ? monthLabel(r.periodMonth) : fmtD(r.expenseDate)}</td>
                            <td style={td}>{r.category || "—"}</td>
                            <td style={{ ...td, fontWeight: 600 }}>{r.payee || "—"}</td>
                            <td style={{ ...td, maxWidth: 320 }}>
                              {r.description || "—"}
                              {r.remarks && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 3 }}>Note: {r.remarks}</div>}
                              <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 3 }}>Raised by {r.raisedBy || "—"}</div>
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                              {canManage && r.kind === "SALARY" && r.status === "PENDING"
                                ? <AmountInput row={r} username={username} onSaved={load} />
                                : inr(r.amount)}
                            </td>
                            <td style={td}>
                              <Pill s={r.status} />
                              {r.status === "PAID" && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 4, whiteSpace: "nowrap" }}>
                                {fmtD(r.paidDate)}{r.paymentRef ? ` · ${r.paymentRef}` : ""}{r.paidBy ? <><br />by {r.paidBy}</> : null}
                              </div>}
                            </td>
                            <td style={td}>
                              {urls.length ? urls.map((u, i) => (
                                <a key={i} href={attachmentFullUrl(u)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginRight: 6, color: "var(--hz-primary)", fontSize: "var(--hz-text-xs)", fontWeight: 600 }}>
                                  <Paperclip size={12} />{urls.length > 1 ? i + 1 : "View"}
                                </a>)) : <span style={{ color: "#cbd5e1" }}>—</span>}
                            </td>
                            <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 6 }}>
                                {canManage && r.status === "PENDING" && (r.kind === "EXPENSE"
                                  ? <button title="Edit" style={iconBtn("#1e3a5f")} onClick={() => setForm({ id: r.id, expenseDate: r.expenseDate || today(), category: r.category || "", description: r.description || "", payee: r.payee || "", amount: r.amount, bankName: r.bankName || "", accountNumber: r.accountNumber || "", ifsc: r.ifsc || "", files: [], existing: urls })}><Pencil size={13} /></button>
                                  : <button title="Amount / note" style={iconBtn("#1e3a5f")} onClick={() => setSalaryEdit({ id: r.id, payee: r.payee, month: r.periodMonth, amount: r.amount, remarks: r.remarks || "" })}><Pencil size={13} /></button>)}
                                {canManage && r.status === "PENDING" && r.kind === "EXPENSE" && <button title="Delete" style={iconBtn("#b91c1c")} onClick={() => del(r)}><Trash2 size={13} /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

      {form && <ExpenseModal form={form} setForm={setForm} username={username} onSaved={() => { setForm(null); load(); }} />}
      {salaryEdit && <SalaryModal edit={salaryEdit} setEdit={setSalaryEdit} username={username} onSaved={() => { setSalaryEdit(null); load(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children, footer }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="hr-edit-modal" style={{ ...card, width: 520, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: "22px 24px" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)", marginBottom: 16 }}>{title}</div>
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>{footer}</div>
      </div>
    </div>
  );
}

function ExpenseModal({ form, setForm, username, onSaved }) {
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    if (!form.category) { alert("Choose a category"); return; }
    if (!(Number(form.amount) > 0)) { alert("Enter an amount greater than zero"); return; }
    setBusy(true);
    try {
      const uploaded = form.files.length ? await Promise.all(form.files.map(f => uploadDocument(f))) : [];
      const all = [...form.existing, ...uploaded];
      const body = { username, expenseDate: form.expenseDate, category: form.category, description: form.description, payee: form.payee,
        amount: form.amount, bankName: form.bankName, accountNumber: form.accountNumber, ifsc: form.ifsc, attachmentUrls: all.length ? JSON.stringify(all) : (form.id ? "" : undefined) };
      await (form.id ? officeApi.update(form.id, body) : officeApi.raise(body));
      onSaved();
    } catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={form.id ? "Edit Office Expense" : "Raise Office Expense"} onClose={() => setForm(null)}
      footer={<><button style={ghost} onClick={() => setForm(null)}>Cancel</button><button style={btn("var(--hz-primary)")} disabled={busy} onClick={save}>{busy ? "Saving…" : form.id ? "Save" : "Raise Expense"}</button></>}>
      <div className="hr-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={lbl}>Date *</label><input type="date" value={form.expenseDate} onChange={e => set("expenseDate", e.target.value)} style={inputS} /></div>
        <div><label style={lbl}>Amount (₹) *</label><input type="number" min="0" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} style={inputS} placeholder="0" /></div>
        <div><label style={lbl}>Category *</label>
          <select value={form.category} onChange={e => set("category", e.target.value)} style={inputS}>
            <option value="">Select…</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Paid to</label><input value={form.payee} onChange={e => set("payee", e.target.value)} style={inputS} placeholder="Vendor / person" /></div>
      </div>
      <div style={{ marginTop: 12, fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payee bank details — for the bank Excel</div>
      <div className="hr-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 6 }}>
        <div><label style={lbl}>Bank</label><input value={form.bankName} onChange={e => set("bankName", e.target.value)} style={inputS} placeholder="Bank name" /></div>
        <div><label style={lbl}>Account number</label><input value={form.accountNumber} onChange={e => set("accountNumber", e.target.value)} style={inputS} /></div>
        <div><label style={lbl}>IFSC</label><input value={form.ifsc} onChange={e => set("ifsc", e.target.value.toUpperCase())} style={inputS} /></div>
      </div>
      <div style={{ marginTop: 12 }}><label style={lbl}>Description</label>
        <textarea rows={3} value={form.description} onChange={e => set("description", e.target.value)} style={{ ...inputS, resize: "vertical" }} placeholder="What is this expense for?" /></div>
      <div style={{ marginTop: 12 }}>
        <label style={lbl}>Bills / documents</label>
        {form.existing.length > 0 && <div style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {form.existing.map((u, i) => (
            <span key={i} style={{ background: "#f1f5f9", borderRadius: 6, padding: "3px 8px", fontSize: "var(--hz-text-xs)" }}>
              <a href={attachmentFullUrl(u)} target="_blank" rel="noreferrer">File {i + 1}</a>
              <button onClick={() => set("existing", form.existing.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", marginLeft: 4 }}>×</button>
            </span>))}
        </div>}
        <input type="file" multiple accept="image/*,.pdf" onChange={e => set("files", [...form.files, ...Array.from(e.target.files || [])])} />
        {form.files.length > 0 && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 4 }}>
          {form.files.map((f, i) => <div key={i}>{f.name} <button onClick={() => set("files", form.files.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer" }}>×</button></div>)}
        </div>}
      </div>
    </Modal>
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
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input type="number" min="0" step="0.01" value={v} placeholder="Enter amount" disabled={busy}
        onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); }}
        style={{ ...inputS, width: 130, textAlign: "right", fontWeight: 700, borderColor: Number(row.amount) > 0 ? "#cbd5e1" : "#f59e0b", background: Number(row.amount) > 0 ? "#fff" : "#fffbeb" }} />
      {dirty && <button title="Save amount" style={iconBtn("#15803d")} disabled={busy} onClick={save}>Save</button>}
    </div>
  );
}

function SalaryModal({ edit, setEdit, username, onSaved }) {
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!(Number(edit.amount) >= 0)) { alert("Enter a valid amount"); return; }
    setBusy(true);
    try { await officeApi.update(edit.id, { username, amount: edit.amount, remarks: edit.remarks }); onSaved(); }
    catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={`Salary — ${edit.payee}, ${monthLabel(edit.month, true)}`} onClose={() => setEdit(null)}
      footer={<><button style={ghost} onClick={() => setEdit(null)}>Cancel</button><button style={btn("var(--hz-primary)")} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
      <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginBottom: 12 }}>Office Mgnt salaries vary — enter the amount for this month.</div>
      <label style={lbl}>Amount (₹)</label>
      <input type="number" min="0" step="0.01" value={edit.amount} onChange={e => setEdit({ ...edit, amount: e.target.value })} style={inputS} />
      <div style={{ marginTop: 12 }}><label style={lbl}>Note</label>
        <input value={edit.remarks} onChange={e => setEdit({ ...edit, remarks: e.target.value })} style={inputS} placeholder="e.g. part month" /></div>
    </Modal>
  );
}

function StaffPanel({ username, canManage, onChanged }) {
  const [staff, setStaff] = useState([]);
  const [edit, setEdit] = useState(null);   // add / edit modal
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { officeApi.staff(username).then(r => setStaff(r.data?.data || [])).catch(() => setStaff([])); }, [username]);
  useEffect(() => { load(); }, [load]);

  async function toggle(s) {
    if (!window.confirm(s.active ? `Stop the monthly salary for ${s.name}?` : `Restart the monthly salary for ${s.name}?`)) return;
    try { await officeApi.updateStaff(s.id, { username, active: !s.active }); load(); onChanged(); } catch (e) { alert(errMsg(e)); }
  }
  async function remove(s) {
    if (!window.confirm(`Delete ${s.name} from Office Mgnt Salaries? Their unpaid salary lines are deleted too.`)) return;
    try { await officeApi.deleteStaff(s.id, username); load(); onChanged(); } catch (e) { alert(errMsg(e)); }
  }
  async function save() {
    if (!edit.name.trim()) { alert("Enter the name"); return; }
    setBusy(true);
    try {
      const body = { username, name: edit.name, designation: edit.designation,
        bankName: edit.bankName, accountNumber: edit.accountNumber, ifsc: edit.ifsc };
      await (edit.id ? officeApi.updateStaff(edit.id, body) : officeApi.addStaff({ ...body, startMonth: edit.startMonth }));
      setEdit(null); load(); onChanged();
    } catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  }
  const set = (k, v) => setEdit(x => ({ ...x, [k]: v }));

  return (
    <div style={{ ...card, marginBottom: 16, overflow: "hidden", borderLeft: "4px solid #6d28d9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, color: "var(--hz-ink)" }}>Office Mgnt Salaries</div>
          <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>A salary line is created every month for each active person — enter that month's amount on the line</div>
        </div>
        {canManage && <button style={ghost} onClick={() => setEdit({ name: "", designation: "", startMonth: thisMonth(), bankName: "", accountNumber: "", ifsc: "" })}><Plus size={14} /> Add Person</button>}
      </div>
      <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Name", "Designation", "From", "Bank", "Account Number", "IFSC", "Status", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                <td style={{ ...td, fontWeight: 700 }}>{s.name}</td>
                <td style={td}>{s.designation || "—"}</td>
                <td style={td}>{monthLabel(s.startMonth)}</td>
                <td style={td}>{s.bankName || "—"}</td>
                <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{s.accountNumber || <span style={{ color: "#b91c1c", fontWeight: 600 }}>Missing</span>}</td>
                <td style={td}>{s.ifsc || <span style={{ color: "#b91c1c", fontWeight: 600 }}>Missing</span>}</td>
                <td style={td}>{s.active ? <span style={{ color: "#15803d", fontWeight: 700 }}>Active</span> : <span style={{ color: "var(--hz-muted)", fontWeight: 700 }}>Stopped</span>}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {canManage && <div style={{ display: "inline-flex", gap: 6 }}>
                    <button title="Edit" style={iconBtn("#1e3a5f")} onClick={() => setEdit({ id: s.id, name: s.name, designation: s.designation || "", bankName: s.bankName || "", accountNumber: s.accountNumber || "", ifsc: s.ifsc || "" })}><Pencil size={13} /></button>
                    <button style={iconBtn(s.active ? "#b91c1c" : "#15803d")} onClick={() => toggle(s)}>{s.active ? "Stop" : "Restart"}</button>
                    {!s.active && <button title="Delete" style={iconBtn("#b91c1c")} onClick={() => remove(s)}><Trash2 size={13} /></button>}
                  </div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? `Edit — ${edit.name}` : "Add to Office Mgnt Salaries"} onClose={() => setEdit(null)}
          footer={<><button style={ghost} onClick={() => setEdit(null)}>Cancel</button><button style={btn("var(--hz-primary)")} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
          <div className="hr-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>Name *</label><input value={edit.name} onChange={e => set("name", e.target.value)} style={inputS} /></div>
            <div><label style={lbl}>Designation</label><input value={edit.designation} onChange={e => set("designation", e.target.value)} style={inputS} /></div>
            {!edit.id && <div><label style={lbl}>Salary from</label><input type="month" value={edit.startMonth} onChange={e => set("startMonth", e.target.value)} style={inputS} /></div>}
            <div><label style={lbl}>Bank</label><input value={edit.bankName} onChange={e => set("bankName", e.target.value)} style={inputS} /></div>
            <div><label style={lbl}>Account number</label><input value={edit.accountNumber} onChange={e => set("accountNumber", e.target.value)} style={inputS} /></div>
            <div><label style={lbl}>IFSC</label><input value={edit.ifsc} onChange={e => set("ifsc", e.target.value.toUpperCase())} style={inputS} /></div>
          </div>
          {edit.id && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 10 }}>New bank details apply to their unpaid salary lines.</div>}
        </Modal>
      )}
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

function downloadOfficeExcel(month, lines, missing = []) {
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
    officeApi.list(username, "ALL")
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
    const ready = lines.filter(l => l.status === "PENDING" && hasBank(l) && Number(l.amount) > 0);
    const missing = lines.filter(l => l.status === "PENDING" && !hasBank(l) && Number(l.amount) > 0);
    const total = ready.reduce((t, l) => t + Number(l.amount || 0), 0);
    if (!window.confirm(`Send ${ready.length} payment${ready.length === 1 ? "" : "s"} of ${inr(total)} for ${monthLabel(month, true)}?\n\nThe bank Excel downloads now and these lines are marked sent for payment.`
      + (missing.length ? `\n\n${missing.length} line(s) without account number / IFSC stay pending.` : ""))) return;
    setBusy(month);
    try {
      await officeApi.send({ username, ids: ready.map(l => l.id) });
      downloadOfficeExcel(month, ready, missing);
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
            Office expenses and the monthly Office Mgnt salaries from HR → Office/Mgnt. Send for Payment downloads the bank Excel for the month and marks those lines sent.
          </div>
        </div>
      </div>

      {error && <div className="card" style={{ padding: "12px 16px", marginBottom: 16, background: "#fef2f2", border: "1px solid #fecaca", color: "#7f1d1d", fontSize: "var(--hz-text-md)" }}>{error}</div>}

      {months.length === 0 && !error && (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--hz-ink)", fontSize: "var(--hz-text-md)" }}>
          Nothing to pay yet. Office expenses and staff salaries raised in HR → Office/Mgnt appear here.
        </div>
      )}

      {months.map(([month, lines], idx) => {
        const total = lines.reduce((t, l) => t + Number(l.amount || 0), 0);
        const pending = lines.filter(l => l.status === "PENDING" && Number(l.amount) > 0);
        const pendingAmt = pending.reduce((t, l) => t + Number(l.amount || 0), 0);
        const ready = pending.filter(hasBank);
        const noAmount = lines.filter(l => l.status === "PENDING" && l.kind === "SALARY" && !(Number(l.amount) > 0));
        const missing = pending.filter(l => !hasBank(l));
        const sent = lines.filter(l => l.status === "PAID");
        const sentReady = sent.filter(hasBank);
        const st = MONTH_STATUS[!sent.length ? "PENDING" : pending.length ? "PARTLY" : "SENT"];
        const salaries = lines.filter(l => l.kind === "SALARY").length;
        const expenses = lines.length - salaries;
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
                  {salaries} salar{salaries === 1 ? "y" : "ies"} · {expenses} expense{expenses === 1 ? "" : "s"} · Total <b>{inr(total)}</b>
                  {pending.length > 0 && <> · Pending <b style={{ color: "#b45309" }}>{inr(pendingAmt)}</b></>}
                  {lastSent && <> · Last sent {fmtD(lastSent)}</>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {canManage && (
                  <button onClick={() => send(month, lines)} disabled={!canSend}
                    title={!ready.length ? (pending.length ? "Add account number / IFSC first" : "Nothing pending") : `Download the bank Excel and mark ${ready.length} line(s) sent`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "8px 14px", fontSize: "var(--hz-text-md)", fontWeight: 600, fontFamily: "inherit", border: "1px solid",
                      background: canSend ? "#2563eb" : "#f1f5f9", color: canSend ? "var(--hz-on-dark)" : "var(--hz-faint)",
                      borderColor: canSend ? "#1d4ed8" : "#cbd5e1", cursor: canSend ? "pointer" : "not-allowed",
                    }}>
                    <Send size={15} /> {mine ? "Sending…" : `Send for Payment${ready.length ? ` (${ready.length})` : ""}`}
                  </button>
                )}
                <button onClick={() => downloadOfficeExcel(month, sentReady)} disabled={!sentReady.length}
                  title={sentReady.length ? `Download the bank Excel of the ${sentReady.length} line(s) already sent` : "Available once lines are sent for payment"}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "8px 14px", fontSize: "var(--hz-text-md)", fontWeight: 600, fontFamily: "inherit", border: "1px solid",
                    background: sentReady.length ? "#0f766e" : "#f1f5f9", color: sentReady.length ? "var(--hz-on-dark)" : "var(--hz-faint)",
                    borderColor: sentReady.length ? "#0f766e" : "#cbd5e1", cursor: sentReady.length ? "pointer" : "not-allowed",
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
                  <b>{missing.length} line{missing.length === 1 ? " has" : "s have"} no account number / IFSC</b> — left out of the bank Excel until they're added in HR → Office/Mgnt:{" "}
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
                    {lines.map((l, i) => (
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
                    ))}
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
