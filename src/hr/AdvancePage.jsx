import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { advanceApi, fmtDate } from "./hrApi";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const inr = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const TERMS = Array.from({ length: 12 }, (_, i) => i + 1);

const STATUS = {
  PENDING:   { bg: "#fffbeb", color: "#b45309", label: "Pending approval" },
  APPROVED:  { bg: "#eff6ff", color: "#1d4ed8", label: "Approved — awaiting payment" },
  PAID:      { bg: "#ecfdf5", color: "#047857", label: "Paid — repaying" },
  REPAID:    { bg: "#f0fdf4", color: "#166534", label: "Fully repaid" },
  REJECTED:  { bg: "#fef2f2", color: "#b91c1c", label: "Rejected" },
  CANCELLED: { bg: "#f1f5f9", color: "#000", label: "Cancelled" },
};
const statusOf = (a) => (a.status === "PAID" && Number(a.balance) <= 0 ? "REPAID" : a.status);

const th = { padding: "10px 12px", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#000", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 15.5, borderBottom: "1px solid #eef2f7", color: "#0f172a", verticalAlign: "top" };
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 15.5, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 15, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
const iconBtn = (bg, color, border) => ({ width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${border}`, background: bg, color, fontSize: 17, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontFamily: "inherit" });
const pill = (s) => ({ display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 14, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" });

export default function AdvancePage({ user }) {
  const role = user?.role;
  const isApprover = role === "OH" || role === "VP";
  const isAdmin = role === "ADMIN";
  const canRaise = role !== "CEO";
  const canSeeAll = isAdmin || isApprover || role === "CEO";

  const tabs = [
    ...(canRaise ? [["mine", "My Advances"]] : []),
    ...(isApprover ? [["approvals", "Approvals"]] : []),
    ...(canSeeAll ? [["all", "All Advances"]] : []),
  ];
  const [tab, setTab] = useState(isAdmin ? "all" : (canRaise ? "mine" : "all"));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(null);          // advance id whose repayment schedule is expanded
  const [terms, setTerms] = useState({});          // approver's term change per request id
  const [form, setForm] = useState({ amount: "", termMonths: 3, reason: "" });
  const [startDlg, setStartDlg] = useState(null);  // { a, mode: "pay" | "change", options, choice } — which payroll month recovery starts in

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = tab === "mine" ? await advanceApi.mine(user?.username)
        : tab === "approvals" ? await advanceApi.pending() : await advanceApi.all();
      setRows(r.data?.data || []);
    } catch { setRows([]); }
    setLoading(false);
  }, [tab, user?.username]);
  useEffect(() => { load(); }, [load]);

  const amount = Number(form.amount || 0);
  const instalment = amount > 0 ? amount / form.termMonths : 0;

  async function raise() {
    if (!(amount > 0)) { alert("Enter the advance amount"); return; }
    setBusy("raise");
    try {
      await advanceApi.raise({ username: user?.username, amount, termMonths: form.termMonths, reason: form.reason });
      setForm({ amount: "", termMonths: 3, reason: "" });
      await load();
    } catch (e) { alert(e.response?.data?.message || "Could not raise the request"); }
    finally { setBusy(null); }
  }

  async function act(label, fn) {
    setBusy(label);
    try { await fn(); await load(); }
    catch (e) { alert(e.response?.data?.message || `Could not ${label}`); }
    finally { setBusy(null); }
  }

  const approve = (a) => act("approve", () => advanceApi.approve(a.id, { username: user?.username, termMonths: terms[a.id] ?? a.termMonths }));
  const reject = (a) => {
    const c = window.prompt(`Reason for rejecting ${a.fullName}'s advance:`);
    if (c === null) return;
    if (!c.trim()) { alert("Enter a reason for rejecting"); return; }
    act("reject", () => advanceApi.reject(a.id, { username: user?.username, comment: c.trim() }));
  };
  // Admin picks the payroll month the first instalment comes off — defaults to the earliest one not yet released.
  async function openStart(a, mode) {
    try {
      const r = await advanceApi.startOptions(a.id);
      const d = r.data?.data;
      const cur = mode === "change" ? { year: a.startYear, month: a.startMonth } : d?.default;
      setStartDlg({ a, mode, options: d?.options || [], choice: cur ? `${cur.year}-${cur.month}` : "" });
    } catch (e) { alert(e.response?.data?.message || "Could not load payroll months"); }
  }
  async function confirmStart() {
    const { a, mode, choice } = startDlg;
    if (!choice) { alert("Pick the payroll month"); return; }
    const [y, m] = choice.split("-").map(Number);
    setBusy("start");
    try {
      if (mode === "pay") await advanceApi.paid(a.id, { username: user?.username, startYear: y, startMonth: m });
      else await advanceApi.changeStart(a.id, { username: user?.username, startYear: y, startMonth: m });
      setStartDlg(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || "Could not save"); }
    finally { setBusy(null); }
  }
  const cancel = (a) => { if (window.confirm("Cancel this advance request?")) act("cancel", () => advanceApi.cancel(a.id, { username: user?.username })); };

  const showEmployee = tab !== "mine";
  const colCount = 7 + (showEmployee ? 1 : 0);

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>Advance</div>
      <div style={{ fontSize: 15.5, color: "#000", margin: "2px 0 16px" }}>
        Request a salary advance and choose how many monthly instalments to repay it in. Once it is paid, the instalment is deducted from your salary every month until it's cleared.
      </div>

      {tabs.length > 1 && (
        <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 3, width: "fit-content", marginBottom: 16 }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: tab === k ? 700 : 500, padding: "7px 14px", borderRadius: 6, background: tab === k ? "#0f766e" : "transparent", color: tab === k ? "#fff" : "#000" }}>{l}</button>
          ))}
        </div>
      )}

      {tab === "mine" && canRaise && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 12 }}>Request an advance</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, fontWeight: 600, color: "#000" }}>
              Purpose of Advance
              <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} style={{ ...inputS, width: 300, maxWidth: "100%" }} placeholder="What is the advance for?" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, fontWeight: 600, color: "#000" }}>
              Amount (₹)
              <input type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={{ ...inputS, width: 150 }} placeholder="e.g. 10000" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, fontWeight: 600, color: "#000" }}>
              Repay over
              <select value={form.termMonths} onChange={(e) => setForm((f) => ({ ...f, termMonths: Number(e.target.value) }))} style={{ ...inputS, width: 150 }}>
                {TERMS.map((t) => <option key={t} value={t}>{t} month{t > 1 ? "s" : ""}</option>)}
              </select>
            </label>
            <button onClick={raise} disabled={busy === "raise"} style={{ ...btn("#0f766e"), opacity: busy === "raise" ? 0.6 : 1 }}>{busy === "raise" ? "Sending…" : "Request advance"}</button>
          </div>
          {amount > 0 && (
            <div style={{ fontSize: 15, color: "#000", marginTop: 10, background: "#f8fafc", borderRadius: 8, padding: "8px 10px", width: "fit-content" }}>
              About <b>{inr(Math.round(instalment * 100) / 100)}</b> a month for <b>{form.termMonths}</b> month{form.termMonths > 1 ? "s" : ""}, deducted from your salary.
            </div>
          )}
        </div>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Raised</th>
                {showEmployee && <th style={th}>Employee</th>}
                <th style={th}>Amount</th>
                <th style={th}>Repayment term</th>
                <th style={th}>Purpose of Advance</th>
                <th style={th}>Status</th>
                <th style={th}>Repayment Status</th>
                <th style={{ ...th, textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={colCount}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td style={{ ...td, color: "#000" }} colSpan={colCount}>{tab === "approvals" ? "No advance requests waiting for approval." : "No advance requests yet."}</td></tr>
              ) : rows.map((a) => {
                const st = STATUS[statusOf(a)] || STATUS.PENDING;
                const mine = a.username === user?.username;
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate((a.createdAt || "").slice(0, 10))}</td>
                      {showEmployee && <td style={{ ...td, fontWeight: 600 }}>{a.fullName}</td>}
                      <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{inr(a.amount)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {tab === "approvals" && a.status === "PENDING" ? (
                          <select value={terms[a.id] ?? a.termMonths} onChange={(e) => setTerms((t) => ({ ...t, [a.id]: Number(e.target.value) }))} style={{ ...inputS, padding: "5px 8px" }}>
                            {TERMS.map((t) => <option key={t} value={t}>{t} month{t > 1 ? "s" : ""}</option>)}
                          </select>
                        ) : (
                          <>{a.termMonths} month{a.termMonths > 1 ? "s" : ""}{a.termMonths !== a.requestedTermMonths && <span style={{ color: "#b45309", fontSize: 14 }}> (asked {a.requestedTermMonths})</span>}</>
                        )}
                        <div style={{ fontSize: 14, color: "#000" }}>{inr(a.monthlyInstalment)} / month</div>
                      </td>
                      <td style={{ ...td, maxWidth: 240, whiteSpace: "normal", fontSize: 15 }}>{a.reason || "—"}</td>
                      <td style={td}>
                        <span style={pill(st)}>{st.label}</span>
                        {a.approvedBy && <div style={{ fontSize: 14, color: "#000", marginTop: 4 }}>{a.status === "REJECTED" ? "Rejected" : "Approved"} by {a.approvedByRole || a.approvedBy}{a.approvalComment ? ` — ${a.approvalComment}` : ""}</div>}
                        {a.paidBy && <div style={{ fontSize: 14, color: "#000" }}>Paid by {a.paidBy} · {fmtDate((a.paidAt || "").slice(0, 10))}</div>}
                      </td>
                      <td style={td}>
                        {a.status === "PAID" ? (
                          <>
                            <div style={{ fontSize: 14 }}>Starts <b>{MONTHS[a.startMonth - 1]} {a.startYear}</b> salary</div>
                            <div style={{ fontSize: 15 }}>Recovered <b>{inr(a.recovered)}</b></div>
                            <div style={{ fontSize: 15 }}>Balance <b>{inr(a.balance)}</b></div>
                            <button onClick={() => setOpen(open === a.id ? null : a.id)} style={{ border: "none", background: "none", color: "#0f766e", fontWeight: 700, fontSize: 14, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                              {open === a.id ? "Hide schedule" : "View schedule"}
                            </button>
                            {isAdmin && Number(a.recovered) === 0 && (
                              <div><button onClick={() => openStart(a, "change")} style={{ border: "none", background: "none", color: "#1d4ed8", fontWeight: 700, fontSize: 14, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Change start month</button></div>
                            )}
                          </>
                        ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                        {tab === "approvals" && a.status === "PENDING" && !mine && (
                          <span style={{ display: "inline-flex", gap: 8 }}>
                            <button title="Approve" aria-label="Approve" onClick={() => approve(a)} disabled={!!busy} style={iconBtn("#166534", "#fff", "#166534")}>✓</button>
                            <button title="Reject" aria-label="Reject" onClick={() => reject(a)} disabled={!!busy} style={iconBtn("#b91c1c", "#fff", "#b91c1c")}>✕</button>
                          </span>
                        )}
                        {isAdmin && a.status === "APPROVED" && (
                          <button onClick={() => openStart(a, "pay")} disabled={!!busy} style={btn("#1d4ed8")}>Mark paid</button>
                        )}
                        {mine && a.status === "PENDING" && tab === "mine" && (
                          <button onClick={() => cancel(a)} disabled={!!busy} style={{ ...btn("#fff", "#b91c1c"), border: "1px solid #fecaca" }}>Cancel</button>
                        )}
                      </td>
                    </tr>
                    {open === a.id && (
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={td} colSpan={colCount}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {a.schedule.map((s, i) => (
                              <span key={i} style={{ fontSize: 14, padding: "5px 10px", borderRadius: 8, border: "1px solid " + (s.recovered ? "#bbf7d0" : "#e2e8f0"), background: s.recovered ? "#f0fdf4" : "#fff", color: s.recovered ? "#166534" : "#000" }}>
                                {MONTHS[s.month - 1]} {s.year} · <b>{inr(s.amount)}</b>{s.recovered ? " ✓" : ""}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {startDlg && (
        <div onClick={() => setStartDlg(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" style={{ background: "#fff", borderRadius: 16, width: 440, maxWidth: "100%", padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,.28)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              {startDlg.mode === "pay" ? "Mark as paid" : "Change start month"} — {startDlg.a.fullName}
            </div>
            <div style={{ fontSize: 14.5, color: "#000", marginBottom: 14 }}>
              {inr(startDlg.a.amount)} over {startDlg.a.termMonths} month{startDlg.a.termMonths > 1 ? "s" : ""} ({inr(startDlg.a.monthlyInstalment)} a month). Choose the payroll the first instalment comes off. A released month can't take it.
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, fontWeight: 600, color: "#000" }}>
              First deduction from
              <select value={startDlg.choice} onChange={(e) => setStartDlg((d) => ({ ...d, choice: e.target.value }))} style={inputS}>
                {startDlg.options.map((o) => (
                  <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`} disabled={o.released}>
                    {MONTHS[o.month - 1]} {o.year} salary{o.released ? " — released" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={() => setStartDlg(null)} style={btn("#f1f5f9", "#374151")}>Cancel</button>
              <button onClick={confirmStart} disabled={busy === "start"} style={{ ...btn("#1d4ed8"), opacity: busy === "start" ? 0.6 : 1 }}>{busy === "start" ? "Saving…" : startDlg.mode === "pay" ? "Mark paid" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
