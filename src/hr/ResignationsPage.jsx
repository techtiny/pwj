import { useCallback, useEffect, useMemo, useState } from "react";
import { resignationApi, usersApi } from "./hrApi";

// Resignation workflow — VP / Admin enables it for an employee → the employee applies with a 2-month notice period
// (last working day = resignation date + 2 months) → VP / Admin can change the dates / reason and accept or withdraw it.
const NOTICE_MONTHS = 2;
const MANAGERS = ["ADMIN", "VP"];

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: "var(--hz-text-sm)", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
const ghost = { ...btn("#fff", "#1e3a5f"), border: "1px solid #cbd5e1" };
const th = { padding: "12px 14px", textAlign: "left", fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "12px 14px", fontSize: "var(--hz-text-md)", borderBottom: "1px solid #eef2f7", color: "var(--hz-ink)", verticalAlign: "top" };

export const STATUS = {
  ENABLED:   { label: "Enabled — not applied", bg: "#e0f2fe", color: "#0369a1" },
  SUBMITTED: { label: "Submitted",             bg: "#fef3c7", color: "#b45309" },
  ACCEPTED:  { label: "Accepted",              bg: "#dcfce7", color: "#15803d" },
  WITHDRAWN: { label: "Withdrawn",             bg: "#f1f5f9", color: "#475569" },
  DISABLED:  { label: "Disabled",              bg: "#f1f5f9", color: "#475569" },
};
const Pill = ({ status }) => {
  const s = STATUS[status] || STATUS.DISABLED;
  return <span style={{ background: s.bg, color: s.color, borderRadius: 100, padding: "3px 10px", fontSize: "var(--hz-text-sm)", fontWeight: 700, whiteSpace: "nowrap" }}>{s.label}</span>;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addMonths = (isoDate, n) => { const [y, m, d] = isoDate.split("-").map(Number); const t = new Date(y, m - 1 + n, d); return iso(t); };
const fmt = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const daysLeft = (lwd) => {
  if (!lwd) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${String(lwd).slice(0, 10)}T00:00:00`) - t) / 86400000);
};
const errMsg = (e) => e?.response?.data?.message || e?.message || "Something went wrong";

/** Employee side (My Profile): shown only once a VP / Admin has enabled resignation for them. */
export function MyResignation({ user }) {
  const [r, setR] = useState(undefined);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => {
    resignationApi.mine(user.username).then(x => setR(x.data?.data || null)).catch(() => setR(null));
  }, [user?.username]);
  useEffect(() => { load(); }, [load]);

  if (!r || r.status === "DISABLED") return null;
  const today = iso(new Date());
  const submit = async () => {
    if (!reason.trim()) { alert("Enter the reason for resigning"); return; }
    setBusy(true);
    try { await resignationApi.apply({ username: user.username, reason: reason.trim() }); setConfirm(false); load(); }
    catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  };
  const left = daysLeft(r.lastWorkingDay);

  return (
    <div style={{ ...card, padding: "18px 22px", marginBottom: 18, borderLeft: "4px solid #b45309" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontSize: "var(--hz-text-md)", fontWeight: 700, color: "var(--hz-ink)" }}>Resignation</div>
        <Pill status={r.status} />
      </div>
      {r.status === "ENABLED" ? (
        <>
          <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginBottom: 12 }}>
            Resignation has been enabled for you by {r.enabledBy || "VP / Admin"}. It carries a {NOTICE_MONTHS}-month notice period.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div><div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", fontWeight: 600 }}>Resignation date</div><div style={{ fontWeight: 700 }}>{fmt(today)} (today)</div></div>
            <div><div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", fontWeight: 600 }}>Last working day ({NOTICE_MONTHS}-month notice)</div><div style={{ fontWeight: 700 }}>{fmt(addMonths(today, NOTICE_MONTHS))}</div></div>
          </div>
          <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: "block", marginBottom: 5 }}>Reason for resigning</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason" style={{ ...inputS, resize: "vertical" }} />
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {!confirm
              ? <button onClick={() => { if (!reason.trim()) { alert("Enter the reason for resigning"); return; } setConfirm(true); }} style={btn("#b45309")}>Apply resignation</button>
              : <>
                  <span style={{ fontWeight: 600 }}>Submit your resignation with last working day {fmt(addMonths(today, NOTICE_MONTHS))}?</span>
                  <button onClick={submit} disabled={busy} style={{ ...btn("#b91c1c"), opacity: busy ? 0.6 : 1 }}>{busy ? "Submitting…" : "Yes, submit"}</button>
                  <button onClick={() => setConfirm(false)} style={ghost}>Cancel</button>
                </>}
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, fontSize: "var(--hz-text-sm)" }}>
          <div><div style={{ color: "var(--hz-muted)", fontWeight: 600 }}>Resignation date</div><div style={{ fontWeight: 700, fontSize: "var(--hz-text-md)" }}>{fmt(r.resignationDate)}</div></div>
          <div><div style={{ color: "var(--hz-muted)", fontWeight: 600 }}>Last working day</div>
            <div style={{ fontWeight: 700, fontSize: "var(--hz-text-md)" }}>{fmt(r.lastWorkingDay)}
              {r.status !== "WITHDRAWN" && left != null && <span style={{ fontWeight: 500, color: "var(--hz-muted)" }}> · {left > 0 ? `${left} days left` : left === 0 ? "today" : "passed"}</span>}</div></div>
          <div><div style={{ color: "var(--hz-muted)", fontWeight: 600 }}>Reason</div><div>{r.reason || "—"}</div></div>
          {r.remarks && <div><div style={{ color: "var(--hz-muted)", fontWeight: 600 }}>Remarks from {r.updatedBy || "VP / Admin"}</div><div>{r.remarks}</div></div>}
        </div>
      )}
    </div>
  );
}

/** HR → Employee Master → Resignations. VP / Admin enable and change; OH / CEO can view. */
export default function ResignationsPage({ user }) {
  const canManage = MANAGERS.includes(user?.role);
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null); // resignation being changed
  const [filter, setFilter] = useState("OPEN");

  const load = useCallback(() => {
    resignationApi.all(user.username).then(r => setRows(r.data?.data || [])).catch(() => setRows([]));
  }, [user?.username]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canManage) return;
    usersApi.getAll().then(r => setUsers((r.data?.data || r.data || []).filter(u => u.active !== false && !u.exited))).catch(() => setUsers([]));
  }, [canManage]);

  const openNames = useMemo(() => new Set((rows || []).filter(r => ["ENABLED", "SUBMITTED", "ACCEPTED"].includes(r.status)).map(r => r.username.toLowerCase())), [rows]);
  const candidates = users.filter(u => u.username && u.username.toLowerCase() !== user.username.toLowerCase() && !openNames.has(u.username.toLowerCase()))
    .sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
  const shown = (rows || []).filter(r => filter === "ALL" || (filter === "OPEN" ? ["ENABLED", "SUBMITTED", "ACCEPTED"].includes(r.status) : r.status === filter));

  const enable = async () => {
    if (!pick) return;
    setBusy(true);
    try { await resignationApi.enable({ username: user.username, employee: pick }); setPick(""); load(); }
    catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  };
  const disable = async (r) => {
    if (!window.confirm(`Disable resignation for ${r.fullName}?`)) return;
    try { await resignationApi.disable(r.id, { username: user.username }); load(); } catch (e) { alert(errMsg(e)); }
  };

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      <div style={{ fontSize: "var(--hz-text-2xl)", fontWeight: 800, color: "var(--hz-ink)" }}>Resignations</div>
      <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", margin: "4px 0 18px" }}>
        A VP or Admin enables resignation for an employee. The employee then applies from My Profile with a {NOTICE_MONTHS}-month notice period, and a VP or Admin can change it, accept it or mark it withdrawn.
        Record the final exit on the Employee Exit tab.
      </div>

      {canManage && (
        <div style={{ ...card, padding: "16px 20px", marginBottom: 18, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", maxWidth: 460 }}>
            <label style={{ fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: "block", marginBottom: 5 }}>Enable resignation for</label>
            <select value={pick} onChange={e => setPick(e.target.value)} style={inputS}>
              <option value="">— Select employee —</option>
              {candidates.map(u => <option key={u.username} value={u.username}>{u.fullName || u.username}{u.role ? ` · ${u.role}` : ""}</option>)}
            </select>
          </div>
          <button onClick={enable} disabled={!pick || busy} style={{ ...btn("#1e3a5f"), opacity: !pick || busy ? 0.5 : 1 }}>{busy ? "Enabling…" : "Enable resignation"}</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[["OPEN", "Open"], ["SUBMITTED", "Submitted"], ["ACCEPTED", "Accepted"], ["WITHDRAWN", "Withdrawn"], ["ALL", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={filter === k ? btn("#1e3a5f") : ghost}>{l}</button>
        ))}
      </div>

      <div style={{ ...card, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
          <thead><tr>
            <th style={th}>Employee</th><th style={th}>Status</th><th style={th}>Resignation date</th><th style={th}>Last working day</th>
            <th style={th}>Reason</th><th style={th}>Remarks</th><th style={th}>Enabled by</th>{canManage && <th style={th}></th>}
          </tr></thead>
          <tbody>
            {rows == null ? <tr><td style={td} colSpan={8}>Loading…</td></tr>
              : shown.length === 0 ? <tr><td style={{ ...td, color: "var(--hz-faint)" }} colSpan={8}>No resignations here.</td></tr>
              : shown.map(r => {
                const left = daysLeft(r.lastWorkingDay);
                return (
                  <tr key={r.id}>
                    <td style={td}><div style={{ fontWeight: 700 }}>{r.fullName || r.username}</div><div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)" }}>{r.employeeRole || ""}</div></td>
                    <td style={td}><Pill status={r.status} /></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(r.resignationDate)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(r.lastWorkingDay)}
                      {["SUBMITTED", "ACCEPTED"].includes(r.status) && left != null && <div style={{ fontSize: "var(--hz-text-sm)", color: left < 0 ? "var(--hz-danger)" : "var(--hz-muted)" }}>{left > 0 ? `${left} days left` : left === 0 ? "today" : `${-left} days ago`}</div>}</td>
                    <td style={{ ...td, maxWidth: 260 }}>{r.reason || "—"}</td>
                    <td style={{ ...td, maxWidth: 220, color: "var(--hz-ink-2)" }}>{r.remarks || "—"}{r.updatedBy && r.remarks && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>— {r.updatedBy}</div>}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.enabledBy || "—"}<div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)" }}>{fmt(r.enabledAt)}</div></td>
                    {canManage && (
                      <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                        {r.status === "ENABLED" && <button onClick={() => disable(r)} style={ghost}>Disable</button>}
                        {["SUBMITTED", "ACCEPTED", "WITHDRAWN"].includes(r.status) && r.username.toLowerCase() !== user.username.toLowerCase() &&
                          <button onClick={() => setEdit(r)} style={btn("#1e3a5f")}>Change</button>}
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {edit && <ChangeModal r={edit} user={user} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function ChangeModal({ r, user, onClose, onSaved }) {
  const [f, setF] = useState({
    resignationDate: String(r.resignationDate || "").slice(0, 10),
    lastWorkingDay: String(r.lastWorkingDay || "").slice(0, 10),
    reason: r.reason || "", remarks: r.remarks || "", status: r.status,
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.resignationDate && f.lastWorkingDay && f.lastWorkingDay < f.resignationDate) { alert("Last working day can't be before the resignation date"); return; }
    setBusy(true);
    try {
      await resignationApi.update(r.id, { username: user.username, resignationDate: f.resignationDate || null, lastWorkingDay: f.lastWorkingDay || null,
        reason: f.reason, remarks: f.remarks, status: f.status });
      onSaved();
    } catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  };
  const lbl = { fontSize: "var(--hz-text-xs)", fontWeight: 600, color: "var(--hz-ink-2)", display: "block", marginBottom: 5 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...card, width: "100%", maxWidth: 560, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800 }}>Change resignation · {r.fullName}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "var(--hz-muted)" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={lbl}>Resignation date</label>
            <input type="date" value={f.resignationDate}
              onChange={e => { const v = e.target.value; setF(x => ({ ...x, resignationDate: v, lastWorkingDay: v ? addMonths(v, NOTICE_MONTHS) : x.lastWorkingDay })); }} style={inputS} />
          </div>
          <div>
            <label style={lbl}>Last working day</label>
            <input type="date" value={f.lastWorkingDay} min={f.resignationDate || undefined} onChange={e => setF(x => ({ ...x, lastWorkingDay: e.target.value }))} style={inputS} />
            <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", marginTop: 3 }}>Changing the resignation date resets this to {NOTICE_MONTHS} months later.</div>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Status</label>
            <select value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value }))} style={inputS}>
              <option value="SUBMITTED">Submitted (under review)</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Reason</label>
            <textarea rows={2} value={f.reason} onChange={e => setF(x => ({ ...x, reason: e.target.value }))} style={{ ...inputS, resize: "vertical" }} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Remarks (shown to the employee)</label>
            <textarea rows={2} value={f.remarks} onChange={e => setF(x => ({ ...x, remarks: e.target.value }))} style={{ ...inputS, resize: "vertical" }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={ghost}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ ...btn("#1e3a5f"), opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}
