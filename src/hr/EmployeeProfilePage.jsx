import { useCallback, useEffect, useMemo, useState } from "react";
import { employeeApi, performanceApi, usersApi, uploadImage, attachmentFullUrl } from "./hrApi";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function tenure(doj, dor) {
  if (!doj) return "—";
  const start = new Date(doj + "T00:00:00");
  const end = dor ? new Date(dor + "T00:00:00") : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (months < 0) return "—";
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} yr` : null, (m || !y) ? `${m} mo` : null].filter(Boolean).join(" ");
}
function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00"), now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}
function isBirthdaySoon(dob) {
  if (!dob) return false;
  const d = new Date(dob + "T00:00:00"), now = new Date();
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
  const days = Math.round((next - now) / 86400000);
  return days >= 0 && days <= 14 ? days : false;
}

const RANGE_LABEL = { cycle: "This Payroll Cycle", "30d": "Last 30 Days", all: "All Time" };

function StatCard({ label, value, accent, hint }) {
  return (
    <div style={{ ...card, padding: "14px 18px", flex: 1, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function StarRating({ value, onChange, readOnly }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => !readOnly && onChange && onChange(n)}
          style={{ fontSize: readOnly ? 15 : 22, cursor: readOnly ? "default" : "pointer", color: n <= value ? "#f59e0b" : "#d1d5db", lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}

export default function EmployeeProfilePage({ id, user, onBack }) {
  const canManage = ["ADMIN", "VP", "OH", "CEO"].includes(user?.role);
  const [emp, setEmp] = useState(null);
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState("cycle");
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [linkModal, setLinkModal] = useState(false);
  const [appUsers, setAppUsers] = useState([]);
  const [form, setForm] = useState({ rating: 0, notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await employeeApi.get(id);
      setEmp(r.data?.data);
    } catch { setEmp(null); }
    setLoading(false);
  }, [id]);

  const loadStats = useCallback(async () => {
    try {
      const r = await employeeApi.stats(id, range);
      setStats(r.data?.data);
    } catch { setStats(null); }
  }, [id, range]);

  const loadRemarks = useCallback(async () => {
    try {
      const r = await performanceApi.history(id);
      setRemarks(r.data?.data || []);
    } catch { setRemarks([]); }
  }, [id]);

  useEffect(() => { load(); loadRemarks(); }, [load, loadRemarks]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const today = new Date().toISOString().slice(0, 10);
  const todaysRemark = useMemo(() => remarks.find(r => r.remarkDate === today), [remarks, today]);
  useEffect(() => {
    setForm({ rating: todaysRemark?.rating || 0, notes: todaysRemark?.notes || "" });
  }, [todaysRemark]);

  const trend = useMemo(() => {
    if (remarks.length < 2) return null;
    const recent = remarks.slice(0, 7), prior = remarks.slice(7, 14);
    if (prior.length === 0) return null;
    const avg = (arr) => arr.reduce((s, r) => s + r.rating, 0) / arr.length;
    const diff = avg(recent) - avg(prior);
    if (Math.abs(diff) < 0.25) return { label: "Steady", icon: "→", color: "#64748b" };
    return diff > 0 ? { label: "Improving", icon: "▲", color: "#059669" } : { label: "Declining", icon: "▼", color: "#dc2626" };
  }, [remarks]);
  const avgRating = remarks.length ? (remarks.reduce((s, r) => s + r.rating, 0) / remarks.length).toFixed(1) : null;

  async function handlePhoto(file) {
    if (!file) return;
    setBusy("photo");
    try {
      const url = await uploadImage(file);
      await employeeApi.updatePhoto(id, url);
      await load();
    } catch { alert("Photo upload failed"); }
    finally { setBusy(null); }
  }

  async function openLinkModal() {
    if (appUsers.length === 0) {
      try { const r = await usersApi.getAll(); setAppUsers((r.data?.data || []).filter(u => !u.exited)); } catch {}
    }
    setLinkModal(true);
  }

  async function submitLink(username) {
    setBusy("link");
    try {
      await employeeApi.link(id, username);
      setLinkModal(false);
      await load();
      await loadStats();
    } catch (e) { alert(e.response?.data?.message || "Could not link account"); }
    finally { setBusy(null); }
  }

  async function saveRemark() {
    if (!form.rating) { alert("Pick a rating (1-5) first"); return; }
    setBusy("remark");
    try {
      await performanceApi.upsert(id, { date: today, rating: form.rating, notes: form.notes, actionBy: user?.fullName || user?.username });
      await loadRemarks();
    } catch (e) { alert(e.response?.data?.message || "Could not save remark"); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="hr-page" style={{ padding: "24px 32px" }}>Loading…</div>;
  if (!emp) return <div className="hr-page" style={{ padding: "24px 32px" }}>Employee not found. <button onClick={onBack} style={btn("#1e3a5f")}>Back</button></div>;

  const isExited = !!emp.dor;
  const birthdaySoon = isBirthdaySoon(emp.dob);

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f8fafc" }}>
      <button onClick={onBack} style={{ ...btn("#fff", "#374151"), border: "1.5px solid #e2e8f0", marginBottom: 16 }}>← Back to Employees</button>

      {/* Header */}
      <div style={{ ...card, padding: "22px 24px", marginBottom: 20, display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          {emp.photoUrl ? (
            <img src={attachmentFullUrl(emp.photoUrl)} alt={emp.fullName} style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" }} />
          ) : (
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 32 }}>
              {emp.fullName.charAt(0).toUpperCase()}
            </div>
          )}
          {canManage && (
            <label style={{ position: "absolute", bottom: -2, right: -2, background: "#1e3a5f", color: "#fff", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13 }}>
              {busy === "photo" ? "…" : "📷"}
              <input type="file" accept="image/*" hidden onChange={(e) => handlePhoto(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{emp.fullName}</div>
            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 100, background: isExited ? "#fef2f2" : "#ecfdf5", color: isExited ? "#b91c1c" : "#059669" }}>
              {isExited ? "Exited" : "Active"}
            </span>
            {birthdaySoon !== false && <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 100, background: "#fef3c7", color: "#92400e" }}>🎂 {birthdaySoon === 0 ? "Birthday today!" : `Birthday in ${birthdaySoon}d`}</span>}
          </div>
          <div style={{ fontSize: 14, color: "#374151", marginTop: 3 }}>{emp.designation || "—"} · {emp.department || "—"}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 8, display: "flex", gap: 18, flexWrap: "wrap" }}>
            <span>Code: <b>{emp.personCode || "—"}</b></span>
            <span>DOJ: <b>{fmtDate(emp.doj) || emp.dojRaw || "—"}</b></span>
            <span>Tenure: <b>{tenure(emp.doj, emp.dor)}</b></span>
            {emp.dob && <span>Age: <b>{ageFromDob(emp.dob)}</b></span>}
            <span>Gender: <b>{emp.gender || "—"}</b></span>
          </div>
          {emp.linkedUsername ? (
            <div style={{ fontSize: 12.5, color: "#059669", marginTop: 8 }}>
              ✓ Linked to app account <b>@{emp.linkedUsername}</b>
              {canManage && <button onClick={openLinkModal} style={{ marginLeft: 10, background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>change</button>}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "#92400e", marginTop: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
              Not linked to an app account — PR/attendance stats unavailable.
              {canManage && <button onClick={openLinkModal} style={{ marginLeft: 8, background: "none", border: "none", color: "#92400e", cursor: "pointer", fontSize: 12, fontWeight: 700, textDecoration: "underline" }}>Link now</button>}
            </div>
          )}
        </div>
      </div>

      {isExited && (
        <div style={{ ...card, padding: "16px 20px", marginBottom: 20, borderLeft: "4px solid #dc2626" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Exit Details</div>
          <div style={{ fontSize: 13, color: "#374151", display: "flex", gap: 24, flexWrap: "wrap" }}>
            <span>DOR: <b>{fmtDate(emp.dor) || emp.dorRaw}</b></span>
            <span>Designation at exit: <b>{emp.designationAtExit || "—"}</b></span>
            {emp.doj2 && <span>Rejoined: <b>{fmtDate(emp.doj2)}</b> as <b>{emp.currentDesignation || "—"}</b></span>}
          </div>
          {emp.sheetRemarks && <div style={{ fontSize: 13, color: "#7c2d12", marginTop: 8, fontStyle: "italic" }}>"{emp.sheetRemarks}"</div>}
        </div>
      )}

      {/* Stats */}
      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Performance Stats</div>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(RANGE_LABEL).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)}
              style={{ border: range === k ? "none" : "1.5px solid #e2e8f0", borderRadius: 20, padding: "5px 13px",
                background: range === k ? "#1e3a5f" : "#fff", color: range === k ? "#fff" : "#374151",
                fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="PRs Raised" value={stats ? stats.prRaised : "—"} accent="#3b82f6" />
        <StatCard label="Correct Check-ins" value={stats ? stats.correctCheckins : "—"} accent="#059669" hint="Checked in and out" />
        <StatCard label="Incomplete Check-ins" value={stats ? stats.incompleteCheckins : "—"} accent="#dc2626" hint="Checked in, never checked out" />
        <StatCard label="Avg. Performance" value={avgRating ? `${avgRating} ★` : "—"} accent="#f59e0b" hint={trend ? `${trend.icon} ${trend.label}` : `${remarks.length} rated day(s)`} />
      </div>
      {stats && !stats.linked && (
        <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: -14, marginBottom: 20 }}>
          These stats need an app account link to compute — see above.
        </div>
      )}

      {/* Daily performance remark */}
      <div style={{ ...card, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Daily Performance Remark</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>One entry per day — track how {emp.fullName.split(" ")[0]} is doing, day by day.</div>
        {canManage ? (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Today ({fmtDate(today)})</div>
              <StarRating value={form.rating} onChange={(n) => setForm(f => ({ ...f, rating: n }))} />
            </div>
            <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="What stood out today — good or bad?" style={{ ...inputS, flex: 1, minWidth: 220, minHeight: 40, resize: "vertical" }} />
            <button onClick={saveRemark} disabled={busy === "remark"} style={btn("#1e3a5f")}>
              {busy === "remark" ? "Saving…" : todaysRemark ? "Update" : "Save"}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Only Admin/VP/OH/CEO can add performance remarks.</div>
        )}

        {remarks.length > 0 && (
          <div style={{ marginTop: 18, borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>History</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
              {remarks.map(r => (
                <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: 10, borderBottom: "1px solid #f8fafc" }}>
                  <div style={{ fontSize: 12, color: "#64748b", width: 80, flexShrink: 0 }}>{fmtDate(r.remarkDate)}</div>
                  <StarRating value={r.rating} readOnly />
                  <div style={{ flex: 1, fontSize: 13, color: "#374151" }}>{r.notes || <span style={{ color: "#cbd5e1" }}>No note</span>}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{r.createdBy}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {linkModal && (
        <div onClick={() => setLinkModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 400, maxWidth: "92vw", padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Link to app account</div>
            <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={() => submitLink(null)} style={{ ...btn("#f1f5f9", "#374151"), textAlign: "left" }}>— None (unlink) —</button>
              {appUsers.map(u => (
                <button key={u.id} onClick={() => submitLink(u.username)} style={{ ...btn("#fff", "#0f172a"), border: "1px solid #e2e8f0", textAlign: "left" }}>
                  {u.fullName} <span style={{ color: "#94a3b8" }}>@{u.username}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setLinkModal(false)} style={{ ...btn("#f1f5f9", "#374151"), width: "100%", marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
