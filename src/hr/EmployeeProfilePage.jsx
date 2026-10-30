import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { employeeApi, performanceApi, usersApi, uploadImage, attachmentFullUrl, isExitedEmp, tenureMonths, serverDate } from "./hrApi";
import { PERF_CATEGORIES, CATEGORY_BY_KEY, PARAMETER_SUGGESTIONS, APPEAL_WINDOW_HOURS, scoreOf, CategoryChip, Stars } from "./PerformanceFactors";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 12px", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 14.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: .4, marginBottom: 6 };
const pill = (bg, color) => ({ display: "inline-block", background: bg, color, borderRadius: 999, padding: "3px 11px", fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap" });
const iconBtn = (bg, color, border) => ({ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${border}`, background: bg, color, fontSize: 19, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, fontFamily: "inherit" });
const ROLE_SHORT = { VP: "VP", OH: "OH", CEO: "CEO", ADMIN: "Admin" };
const roleLabel = (role) => (role ? ROLE_SHORT[role.toUpperCase()] || role : "");
const pth = { padding: "11px 12px", textAlign: "left", fontSize: 14.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: .4, background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 };
const ptd = { padding: "12px 12px", fontSize: 16.5, color: "#1e293b", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 15, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "—";
  return serverDate(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
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

function InfoChip({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 10, padding: "6px 12px" }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14.5, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, accent, accentBg, hint }) {
  return (
    <div className="ep-statcard" style={{ ...card, padding: "16px 18px", flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: accentBg, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14.5, color: "#64748b", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 29, fontWeight: 800, color: "#0f172a", marginTop: 2, lineHeight: 1.1 }}>{value}</div>
        {hint && <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>{hint}</div>}
      </div>
    </div>
  );
}

function StarRating({ value, onChange, readOnly }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => !readOnly && onChange && onChange(n)} className={readOnly ? "" : "ep-star"}
          style={{ fontSize: readOnly ? 17 : 26, cursor: readOnly ? "default" : "pointer", color: n <= value ? "#f59e0b" : "#d1d5db", lineHeight: 1, transition: "transform .1s" }}>★</span>
      ))}
    </div>
  );
}

export default function EmployeeProfilePage({ id, user, onBack }) {
  const isReviewer = ["ADMIN", "VP", "OH", "CEO"].includes(user?.role);
  const [emp, setEmp] = useState(null);
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState("cycle");
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [linkModal, setLinkModal] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(false);
  const [appUsers, setAppUsers] = useState([]);
  const [form, setForm] = useState({ notes: "", parameter: "" });
  const [decideFor, setDecideFor] = useState(null); // { id } of the appeal being rejected
  const [decideText, setDecideText] = useState("");
  const [finalRating, setFinalRating] = useState(0);
  const [finalCategory, setFinalCategory] = useState("");
  const [appealFor, setAppealFor] = useState(null); // remark id being appealed
  const [appealText, setAppealText] = useState("");

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
  // Plain comments (no stars, e.g. added from the HR dashboard) don't count towards ratings.
  const rated = useMemo(() => remarks.filter(r => r.rating), [remarks]);
  const trend = useMemo(() => {
    if (rated.length < 2) return null;
    const recent = rated.slice(0, 7), prior = rated.slice(7, 14);
    if (prior.length === 0) return null;
    const avg = (arr) => arr.reduce((s, r) => s + r.rating, 0) / arr.length;
    const diff = avg(recent) - avg(prior);
    if (Math.abs(diff) < 0.25) return { label: "Steady", icon: "→", color: "#64748b" };
    return diff > 0 ? { label: "Improving", icon: "▲", color: "#059669" } : { label: "Declining", icon: "▼", color: "#dc2626" };
  }, [rated]);
  const avgRating = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : null;

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
    if (!form.parameter.trim()) { alert("Enter the parameter being assessed"); return; }
    if (!form.notes.trim()) { alert("Enter the comment"); return; }
    setBusy("remark");
    try {
      await performanceApi.add(id, { date: today, notes: form.notes, parameter: form.parameter, actionBy: user?.fullName || user?.username, actorRole: user?.role });
      setForm({ notes: "", parameter: "" });
      await loadRemarks();
    } catch (e) { alert(e.response?.data?.message || "Could not save remark"); }
    finally { setBusy(null); }
  }

  async function decide(remarkId, decision, comment) {
    if (decision === "REJECT" && !comment.trim()) { alert("Add a comment explaining why the appeal is not accepted"); return; }
    if (decision === "REJECT" && !comment.trim()) return;
    setBusy("decide");
    try {
      await performanceApi.decide(id, remarkId, { decision, comment, actionBy: user?.fullName || user?.username, role: user?.role });
      setDecideFor(null); setDecideText("");
      await loadRemarks();
    } catch (e) { alert(e.response?.data?.message || "Could not save decision"); }
    finally { setBusy(null); }
  }

  async function finalizeRating(remarkId) {
    if (!finalRating || !finalCategory) { alert("Set the Rating and Category"); return; }
    setBusy("decide");
    try {
      await performanceApi.rate(id, remarkId, { rating: finalRating, category: finalCategory, actionBy: user?.fullName || user?.username, role: user?.role });
      setDecideFor(null);
      await loadRemarks();
    } catch (e) { alert(e.response?.data?.message || "Could not save rating"); }
    finally { setBusy(null); }
  }

  async function acknowledge(remarkId) {
    setBusy("ack");
    try {
      await performanceApi.acknowledge(id, remarkId, { username: user?.username });
      await loadRemarks();
    } catch (e) { alert(e.response?.data?.message || "Could not accept the comment"); }
    finally { setBusy(null); }
  }

  async function submitAppeal(remarkId) {
    if (!appealText.trim()) { alert("Enter the reason for your appeal"); return; }
    setBusy("appeal");
    try {
      await performanceApi.appeal(id, remarkId, { text: appealText, username: user?.username });
      setAppealFor(null);
      setAppealText("");
      await loadRemarks();
    } catch (e) { alert(e.response?.data?.message || "Could not submit appeal"); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="hr-page" style={{ padding: "24px 32px" }}>Loading…</div>;
  if (!emp) return <div className="hr-page" style={{ padding: "24px 32px" }}>Employee not found. {onBack && <button onClick={onBack} style={btn("#1e3a5f")}>Back</button>}</div>;

  const isExited = isExitedEmp(emp);
  const hasExitHistory = !!emp.dor;
  const birthdaySoon = isBirthdaySoon(emp.dob);
  const isSelf = !!(emp.linkedUsername && user?.username && emp.linkedUsername.toLowerCase() === user.username.toLowerCase());
  // Remarks on management staff are CEO-only; everyone else's go to Admin/VP/OH/CEO, and the employee sees their own.
  const isMgmtEmp = /management/i.test(emp.department || "");
  const canManage = isReviewer && (!isMgmtEmp || user?.role === "CEO");
  const canSeeRemarks = canManage || isSelf;
  const hoursLeft = (r) => r.createdAt ? APPEAL_WINDOW_HOURS - (Date.now() - serverDate(r.createdAt).getTime()) / 3600000 : 0;
  const canAppeal = (r) => isSelf && !r.appealedAt && !r.acknowledgedAt && !r.rating && hoursLeft(r) > 0;
  const isPendingAppeal = (r) => !!r.appealedAt && (!r.appealStatus || r.appealStatus === "PENDING");
  const scored = remarks.filter(r => r.category);
  const pendingAppeals = remarks.filter(isPendingAppeal).length;
  // Comments before the accept/appeal/rate flow started (REVIEW_FLOW_START on the backend) are never rated.
  const inReviewFlow = (r) => !!r.createdAt && serverDate(r.createdAt).getTime() >= Date.UTC(2026, 9, 30);
  const needsFinal = (r) => inReviewFlow(r) && !r.rating && (r.appealStatus === "REJECTED" || (!r.appealedAt && (r.acknowledgedAt || hoursLeft(r) <= 0)));
  // Running feed: waiting on the employee (✓ accept / appeal, 48h window) or on a reviewer's ✓/✕ for an appeal.
  // Everything else — accepted by the employee, appeal decided, or window lapsed — is settled and goes to the table.
  const inFeed = (r) => isPendingAppeal(r) || (!r.appealedAt && !r.acknowledgedAt && !r.rating && hoursLeft(r) > 0);
  const feed = remarks.filter(inFeed);
  const settled = remarks.filter(r => !inFeed(r));
  const openFinal = (r, mode) => { setDecideFor({ id: r.id, mode }); setDecideText(""); setFinalRating(0); setFinalCategory(""); setAppealFor(null); };
  const totals = (() => {
    const counted = remarks.filter(r => r.category && r.rating && r.appealStatus !== "ACCEPTED");
    const total = Math.round(counted.reduce((t, r) => t + (r.score ?? scoreOf(r.rating, r.category) ?? 0), 0) * 10) / 10;
    const max = counted.reduce((t, r) => t + (CATEGORY_BY_KEY[r.category]?.weight || 0), 0);
    return { total, max, pct: max ? Math.round((total / max) * 100) : 0 };
  })();
  const pendingCell = (r) => inReviewFlow(r)
    ? <span style={{ fontSize: 15, color: "#94a3b8", fontStyle: "italic" }}>Awaiting rating</span>
    : <span style={{ color: "#cbd5e1" }}>—</span>;
  const appealState = (r) => {
    if (r.appealStatus === "ACCEPTED") return { label: "Appeal accepted", accent: "#10b981", bg: "#ecfdf5", color: "#047857" };
    if (r.appealStatus === "REJECTED") return { label: needsFinal(r) && canManage ? "Appeal rejected · rate now" : "Appeal rejected", accent: "#ef4444", bg: "#fef2f2", color: "#b91c1c" };
    if (isPendingAppeal(r)) return { label: canManage ? "Appeal awaiting your review" : "Appeal under review", accent: "#f59e0b", bg: "#fffbeb", color: "#b45309" };
    if (r.acknowledgedAt) return needsFinal(r)
      ? { label: canManage ? "Accepted by employee · rate now" : "Accepted · awaiting rating", accent: "#8b5cf6", bg: "#f5f3ff", color: "#6d28d9" }
      : { label: "Accepted by employee", accent: "#10b981", bg: "#ecfdf5", color: "#047857" };
    const h = hoursLeft(r);
    if (h > 0) {
      const t = h >= 1 ? `${Math.floor(h)}h left` : `${Math.max(1, Math.round(h * 60))}m left`;
      return { label: `Appeal window open · ${t}`, accent: "#3b82f6", bg: "#eff6ff", color: "#1d4ed8" };
    }
    if (needsFinal(r)) return { label: canManage ? "No response in 48h · rate now" : "No response · awaiting rating", accent: "#8b5cf6", bg: "#f5f3ff", color: "#6d28d9" };
    return { label: "Closed · no appeal", accent: "#cbd5e1", bg: "#f1f5f9", color: "#64748b" };
  };

  return (
    <div className="hr-page ep-page" style={{ padding: "24px 32px", background: "#f1f5f9" }}>
      <style>{`
        .ep-statcard { transition: transform .15s ease, box-shadow .15s ease; }
        .ep-statcard:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,23,42,0.08); }
        .ep-star:hover { transform: scale(1.18); }
        @keyframes epRoll { from { transform: translateX(0); } to { transform: translateX(calc(-50% - 5px)); } }
        .ep-roll-wrap { container-type: inline-size; }
        .ep-feed-card { flex: 0 0 max(280px, calc((100cqw - 20px) / 3)); box-sizing: border-box; min-width: 0; }
        .ep-roll { animation-name: epRoll; animation-timing-function: linear; animation-iteration-count: infinite; }
        .ep-roll-wrap:hover .ep-roll { animation-play-state: paused; }
        @keyframes epPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.5); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }
        .ep-live-dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; animation: epPulse 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .ep-roll { animation: none; } }
        @media (max-width: 640px) {
          .ep-pc-table { min-width: 0 !important; table-layout: auto !important; }
          .ep-pc-table thead { display: none; }
          .ep-pc-table, .ep-pc-table tbody, .ep-pc-table tfoot, .ep-pc-table tr, .ep-pc-table td { display: block; width: 100% !important; box-sizing: border-box; }
          .ep-pc-table tbody tr { border-bottom: 1px solid #e2e8f0; padding: 8px 0; }
          .ep-pc-table td { border: none !important; padding: 5px 12px !important; }
          .ep-pc-table td[data-label] { display: grid; grid-template-columns: 96px minmax(0, 1fr); column-gap: 10px; align-items: start; }
          .ep-pc-table td[data-label] > * { grid-column: 2; justify-self: start; }
          .ep-pc-table td[data-label]::before { content: attr(data-label); grid-column: 1; grid-row: 1 / span 5; font-size: 13.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; padding-top: 3px; }
          .ep-pc-table .ep-m-hide { display: none !important; }
          .ep-pc-table .ep-m-action { text-align: left !important; padding-left: 118px !important; }
          .ep-pc-table .ep-m-action:empty, .ep-pc-table .ep-m-action:has(> span:only-child:not([style*="inline-flex"])) { display: none; }
          .ep-pc-table tfoot td { text-align: left !important; }
          .ep-pc-scroll { max-height: none !important; overflow: visible !important; }
          .ep-pc-table td span { white-space: normal !important; }
          .ep-pc-table tbody tr { box-shadow: none !important; border-left: 3px solid #e2e8f0; }
          .ep-feed-card { flex-basis: 100% !important; }
          .ep-roll .ep-feed-card { flex-basis: min(300px, 82vw) !important; }
        }
        @media (max-width: 760px) { .ep-pc-form { grid-template-columns: 1fr !important; } .ep-pc-form textarea { grid-column: auto !important; } }
        .ep-banner-btn:hover { filter: brightness(1.08); }
        .ep-history-row:last-child { border-bottom: none !important; padding-bottom: 0 !important; }
      `}</style>

      {onBack && (
        <button onClick={onBack} style={{ ...btn("#fff", "#374151"), border: "1.5px solid #e2e8f0", marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
          ← Back to Employees
        </button>
      )}

      {/* Header — cover banner + overlapping avatar */}
      <div style={{ ...card, marginBottom: 20, overflow: "hidden" }}>
        <div style={{
          height: 84,
          background: isExited
            ? "linear-gradient(120deg, #7f1d1d 0%, #b91c1c 55%, #dc2626 100%)"
            : "linear-gradient(120deg, #0f172a 0%, #1e3a5f 55%, #0f766e 100%)",
          position: "relative",
        }} />
        <div style={{ padding: "0 24px 22px", display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap", marginTop: -44 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {emp.photoUrl ? (
              <img src={attachmentFullUrl(emp.photoUrl)} alt={emp.fullName} onClick={() => setPhotoZoom(true)}
                title="Click to view full size"
                style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "4px solid #fff", boxShadow: "0 4px 14px rgba(15,23,42,0.18)", cursor: "zoom-in", display: "block" }} />
            ) : (
              <div style={{ width: 96, height: 96, borderRadius: "50%", background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 36, border: "4px solid #fff", boxShadow: "0 4px 14px rgba(15,23,42,0.18)" }}>
                {emp.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            {(isReviewer || isSelf) && (
              <label className="ep-banner-btn" style={{ position: "absolute", bottom: 2, right: 2, background: "linear-gradient(135deg,#1e3a5f,#0f766e)", color: "#fff", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
                {busy === "photo" ? "…" : "📷"}
                <input type="file" accept="image/*" hidden onChange={(e) => handlePhoto(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 220, paddingTop: 48 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 23, fontWeight: 800, color: "#0f172a" }}>{emp.fullName}</div>
              <span style={{ fontSize: 13.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: isExited ? "#fef2f2" : "#ecfdf5", color: isExited ? "#b91c1c" : "#059669", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: isExited ? "#b91c1c" : "#059669", display: "inline-block" }} />
                {isExited ? "Exited" : "Active"}
              </span>
              {birthdaySoon !== false && (
                <span style={{ fontSize: 13.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: "linear-gradient(135deg,#fef3c7,#fde68a)", color: "#92400e" }}>
                  🎂 {birthdaySoon === 0 ? "Birthday today!" : `Birthday in ${birthdaySoon}d`}
                </span>
              )}
              {isSelf && (
                <span style={{ fontSize: 13.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: "#eff6ff", color: "#1d4ed8" }}>
                  This is you
                </span>
              )}
            </div>
            <div style={{ fontSize: 16, color: "#475569", marginTop: 3, fontWeight: 600 }}>{emp.designation || "—"} · {emp.department || "—"}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <InfoChip icon="🪪" label="Code" value={emp.personCode || "—"} />
              <InfoChip icon="📅" label="DOJ" value={fmtDate(emp.doj) || emp.dojRaw || "—"} />
              <InfoChip icon="⏳" label="Tenure" value={(() => { const m = tenureMonths(emp); if (m == null) return "—"; const y = Math.floor(m / 12), r = m % 12; return [y ? `${y} yr` : null, (r || !y) ? `${r} mo` : null].filter(Boolean).join(" "); })()} />
              {emp.dob && <InfoChip icon="🎈" label="Age" value={ageFromDob(emp.dob)} />}
              <InfoChip icon="⚧" label="Gender" value={emp.gender || "—"} />
            </div>

            {emp.linkedUsername ? (
              <div style={{ fontSize: 14.5, color: "#059669", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                ✓ Linked to app account <b>@{emp.linkedUsername}</b>
                {isReviewer && <button onClick={openLinkModal} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, textDecoration: "underline" }}>change</button>}
              </div>
            ) : (
              <div style={{ fontSize: 14.5, color: "#92400e", marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Not linked to an app account — PR/attendance stats unavailable.
                {isReviewer && <button onClick={openLinkModal} style={{ background: "none", border: "none", color: "#92400e", cursor: "pointer", fontSize: 14, fontWeight: 700, textDecoration: "underline" }}>Link now</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      {hasExitHistory && (
        <div style={{ ...card, padding: "16px 20px", marginBottom: 20, borderLeft: `4px solid ${isExited ? "#dc2626" : "#f59e0b"}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
            🚪 {isExited ? "Exit Details" : "Exit & Rejoin History"}
          </div>
          <div style={{ fontSize: 15, color: "#374151", display: "flex", gap: 24, flexWrap: "wrap" }}>
            <span>DOR: <b>{fmtDate(emp.dor) || emp.dorRaw}</b></span>
            <span>Designation at exit: <b>{emp.designationAtExit || "—"}</b></span>
            {emp.doj2 && <span>Rejoined: <b>{fmtDate(emp.doj2)}</b> as <b>{emp.currentDesignation || "—"}</b></span>}
          </div>
          {emp.sheetRemarks && <div style={{ fontSize: 15, color: "#7c2d12", marginTop: 8, fontStyle: "italic" }}>"{emp.sheetRemarks}"</div>}
        </div>
      )}

      {/* Stats */}
      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 7 }}>📊 Performance Stats</div>
        <div style={{ display: "flex", gap: 6, background: "#fff", padding: 3, borderRadius: 22, border: "1px solid #e2e8f0" }}>
          {Object.entries(RANGE_LABEL).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)}
              style={{ border: "none", borderRadius: 20, padding: "6px 13px",
                background: range === k ? "#1e3a5f" : "transparent", color: range === k ? "#fff" : "#374151",
                fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard icon="📝" label="PRs Raised" value={stats ? stats.prRaised : "—"} accent="#3b82f6" accentBg="#eff6ff" />
        <StatCard icon="🔒" label="PRs Closed" value={stats ? stats.prClosed ?? 0 : "—"} accent="#0d9488" accentBg="#f0fdfa"
          hint={stats ? `of ${stats.prRaised} raised · ${Math.max(0, (stats.prRaised || 0) - (stats.prClosed || 0))} still open` : undefined} />
        <StatCard icon="✅" label="Correct Check-ins" value={stats ? stats.correctCheckins : "—"} accent="#059669" accentBg="#ecfdf5" hint="Checked in and out" />
        <StatCard icon="⚠️" label="Incomplete Check-ins" value={stats ? stats.incompleteCheckins : "—"} accent="#dc2626" accentBg="#fef2f2" hint="Checked in, never checked out" />
        <StatCard icon="⭐" label="Avg. Performance" value={canSeeRemarks && avgRating ? `${avgRating} ★` : "—"} accent="#d97706" accentBg="#fffbeb" hint={canSeeRemarks ? (trend ? `${trend.icon} ${trend.label}` : `${rated.length} rated · ${remarks.length} comment(s)`) : undefined} />
      </div>
      {stats && !stats.linked && (
        <div style={{ fontSize: 14.5, color: "#94a3b8", marginTop: -14, marginBottom: 20 }}>
          These stats need an app account link to compute — see above.
        </div>
      )}

      {/* Performance comments (added from the HR dashboard): running feed → employee ✓ accepts / appeals within 48h →
          reviewer ✓ / ✕ on appeals; settled comments move to the table for rating. */}
      {canSeeRemarks && remarks.length > 0 && (
      <div style={{ ...card, padding: "4px 22px 20px", marginBottom: 20 }}>
        {canSeeRemarks && feed.length > 0 && (() => {
          const rolling = false; // static grid — no auto-scroll
          const items = rolling ? [...feed, ...feed] : feed;
          return (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="ep-live-dot" />
                <span style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Running comments</span>
                <span style={pill("#eff6ff", "#1d4ed8")}>{feed.length}</span>
                <span style={{ fontSize: 15, color: "#64748b" }}>
                  {isSelf ? "— ✓ to accept, or Appeal, within 48 hours" : "— waiting on the employee, or on your ✓ / ✕ for appeals"}
                </span>
              </div>
              <div className="ep-roll-wrap" style={{ overflow: "hidden", borderRadius: 12, position: "relative" }}>
                <div className={rolling ? "ep-roll" : ""} style={{ display: "flex", gap: 10, alignItems: "stretch", width: rolling ? "max-content" : "auto", flexWrap: rolling ? "nowrap" : "wrap", animationDuration: `${feed.length * 7}s` }}>
                  {items.map((r, k) => {
                    const st = appealState(r);
                    const pendingAppeal = isPendingAppeal(r);
                    return (
                      <div key={`${r.id}-${k}`} className="ep-feed-card" style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: `4px solid ${st.accent}`, borderRadius: 12, padding: "11px 13px", boxShadow: "0 1px 2px rgba(15,23,42,.04)", display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#475569", background: "#f1f5f9", borderRadius: 7, padding: "2px 8px", whiteSpace: "nowrap" }}>{fmtDate(r.remarkDate)}</span>
                          <span style={{ fontSize: 14, color: "#94a3b8", whiteSpace: "nowrap" }}>Comment by {roleLabel(r.createdByRole) || r.createdBy}</span>
                          <span style={{ ...pill(st.bg, st.color), fontSize: 14 }}>{st.label}</span>
                          {canManage && pendingAppeal && decideFor?.id !== r.id && (
                            <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
                              <button title="Approve the appeal" onClick={() => decide(r.id, "ACCEPT", "")} disabled={busy === "decide"} style={iconBtn("#ecfdf5", "#059669", "#a7f3d0")}>✓</button>
                              <button title="Reject the appeal with remarks" onClick={() => openFinal(r, "reject")} style={iconBtn("#fef2f2", "#dc2626", "#fecaca")}>✕</button>
                            </span>
                          )}
                        </div>
                        {r.parameter && <div style={{ fontSize: 17.5, fontWeight: 700, color: "#0f172a", marginTop: 8 }}>{r.parameter}</div>}
                        <div style={{ fontSize: 17, color: "#334155", marginTop: r.parameter ? 2 : 8 }}>{r.notes}</div>
                        {r.appealedAt && (
                          <div style={{ marginTop: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "7px 11px", fontSize: 16, color: "#78350f" }}>
                            <b>Appeal by {emp.fullName}:</b> {r.appealText} <span style={{ color: "#a8a29e", fontSize: 14 }}>· {fmtDateTime(r.appealedAt)}</span>
                          </div>
                        )}
                        {/* actions */}
                        {canAppeal(r) && appealFor !== r.id && (
                          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                            <button title="Accept this comment" onClick={() => acknowledge(r.id)} disabled={busy === "ack"} style={iconBtn("#ecfdf5", "#059669", "#a7f3d0")}>✓</button>
                            <button onClick={() => { setAppealFor(r.id); setAppealText(""); setDecideFor(null); }} style={{ ...btn("#fff", "#b45309"), border: "1px solid #fcd34d", padding: "7px 16px" }}>Appeal</button>
                          </div>
                        )}
                        {appealFor === r.id && (
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                            <textarea autoFocus value={appealText} onChange={(e) => setAppealText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAppeal(r.id); } }} placeholder="Explain why you disagree with this comment" style={{ ...inputS, flex: 1, minWidth: 220, minHeight: 44, fontSize: 16.5 }} />
                            <button onClick={() => submitAppeal(r.id)} disabled={busy === "appeal"} style={btn("#b45309")}>{busy === "appeal" ? "Submitting…" : "Submit appeal"}</button>
                            <button onClick={() => setAppealFor(null)} style={btn("#f1f5f9", "#374151")}>Cancel</button>
                          </div>
                        )}
                        {decideFor?.id === r.id && (
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginTop: 10, background: "#fef2f2", borderRadius: 10, padding: 10 }}>
                            <textarea autoFocus value={decideText} onChange={(e) => setDecideText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (decideText.trim()) decide(r.id, "REJECT", decideText); } }} placeholder="Remarks — why is the appeal rejected? (required)" style={{ ...inputS, flex: 1, minWidth: 220, minHeight: 44, fontSize: 16.5, borderColor: "#fecaca", background: "#fff" }} />
                            <button onClick={() => decide(r.id, "REJECT", decideText)} disabled={busy === "decide" || !decideText.trim()} style={{ ...btn("#dc2626"), opacity: decideText.trim() ? 1 : .6 }}>{busy === "decide" ? "Saving…" : "✕ Reject appeal"}</button>
                            <button onClick={() => setDecideFor(null)} style={btn("#f1f5f9", "#374151")}>Cancel</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {rolling && <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 40, background: "linear-gradient(90deg, rgba(255,255,255,0), #fff)", pointerEvents: "none" }} />}
              </div>
            </div>
          );
        })()}

        {canSeeRemarks && settled.length > 0 && (
          <div style={{ marginTop: 20, fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: -10 }}>Settled comments</div>
        )}
        {canSeeRemarks && settled.length > 0 && (
          <div style={{ marginTop: 20, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <div className="ep-pc-scroll" style={{ overflowX: "auto", maxHeight: 620, overflowY: "auto" }}>
              <table className="ep-pc-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 860, tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ ...pth, width: 52 }}>S.No</th>
                    <th style={{ ...pth, width: 136 }}>Date</th>
                    <th style={{ ...pth, width: "22%" }}>Parameter</th>
                    <th style={{ ...pth, width: 150 }}>Category</th>
                    <th style={{ ...pth, width: 100 }}>Rating</th>
                    <th style={{ ...pth, width: 84 }}>Score</th>
                    <th style={pth}>Appeal</th>
                    <th style={{ ...pth, width: 110, textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {settled.map((r, i) => {
                    const status = appealState(r);
                    const withdrawn = r.appealStatus === "ACCEPTED";
                    const editing = appealFor === r.id || decideFor?.id === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr style={{ background: i % 2 ? "#fcfdff" : "#fff", boxShadow: `inset 3px 0 0 ${status.accent}` }}>
                          <td className="ep-m-hide" style={{ ...ptd, color: "#64748b", fontWeight: 700 }}>{i + 1}</td>
                          <td data-label="Date" style={{ ...ptd, whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 600 }}>{fmtDate(r.remarkDate)}</div>
                            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 2 }}>{roleLabel(r.createdByRole) || r.createdBy}</div>
                          </td>
                          <td data-label="Parameter" style={ptd}>
                            <div style={{ fontWeight: 600, color: withdrawn ? "#94a3b8" : "#0f172a", textDecoration: withdrawn ? "line-through" : "none" }}>{r.parameter || r.notes || <span style={{ color: "#cbd5e1" }}>—</span>}</div>
                          </td>
                          {withdrawn ? (
                            <td data-label="Score" colSpan={3} style={ptd}><span style={pill("#ecfdf5", "#047857")}>Withdrawn — not scored</span></td>
                          ) : !r.category || !r.rating ? (
                            <td data-label="Score" colSpan={3} style={ptd}>{pendingCell(r)}</td>
                          ) : (<>
                            <td data-label="Category" style={ptd}><CategoryChip category={r.category} /></td>
                            <td data-label="Rating" style={ptd}><Stars value={r.rating} size={15} /></td>
                            <td data-label="Score" style={{ ...ptd, whiteSpace: "nowrap" }}>
                              <span style={{ fontWeight: 800 }}>{r.score ?? scoreOf(r.rating, r.category)}<span style={{ color: "#94a3b8", fontWeight: 600 }}> / {CATEGORY_BY_KEY[r.category]?.weight}</span></span>
                            </td>
                          </>)}
                          <td data-label="Appeal" style={ptd}>
                            <span style={pill(status.bg, status.color)}>{status.label}</span>
                            {r.appealedAt && (
                              <div style={{ fontSize: 15.5, color: "#78350f", marginTop: 6 }}>
                                <b>Appeal by {emp.fullName}:</b> {r.appealText}
                                <span style={{ color: "#a8a29e", fontSize: 14 }}> · {fmtDateTime(r.appealedAt)}</span>
                              </div>
                            )}
                            {(r.appealStatus === "ACCEPTED" || r.appealStatus === "REJECTED") && (
                              <div style={{ fontSize: 15.5, color: r.appealStatus === "ACCEPTED" ? "#047857" : "#b91c1c", marginTop: 4 }}>
                                <b>{r.appealStatus === "ACCEPTED" ? "✓" : "✕"} {roleLabel(r.decisionRole) || r.decisionBy}:</b> {r.decisionComment || (r.appealStatus === "ACCEPTED" ? "Agreed" : "")}
                              </div>
                            )}
                          </td>
                          <td className="ep-m-action" style={{ ...ptd, textAlign: "center" }}>
                            {canAppeal(r) && appealFor !== r.id && (
                              <button onClick={() => { setAppealFor(r.id); setAppealText(""); setDecideFor(null); }} style={{ ...btn("#fff", "#b45309"), border: "1px solid #fcd34d", padding: "6px 12px", fontSize: 14.5 }}>Appeal</button>
                            )}
                            {canManage && isPendingAppeal(r) && decideFor?.id !== r.id && (
                              <span style={{ display: "inline-flex", gap: 8 }}>
                                <button title="Agree — accept the appeal" onClick={() => decide(r.id, "ACCEPT", "")} disabled={busy === "decide"} style={iconBtn("#ecfdf5", "#059669", "#a7f3d0")}>✓</button>
                                <button title="Disagree — reject the appeal, then set Rating + Category" onClick={() => openFinal(r, "reject")} style={iconBtn("#fef2f2", "#dc2626", "#fecaca")}>✕</button>
                              </span>
                            )}
                            {canManage && needsFinal(r) && decideFor?.id !== r.id && (
                              <button onClick={() => openFinal(r, "rate")} style={{ ...btn("#6d28d9"), padding: "6px 14px", fontSize: 14.5 }}>★&nbsp;Rate</button>
                            )}
                            {!canAppeal(r) && !(canManage && (isPendingAppeal(r) || needsFinal(r))) && <span style={{ color: "#cbd5e1" }}>—</span>}
                          </td>
                        </tr>
                        {editing && (
                          <tr style={{ background: appealFor === r.id ? "#fffbeb" : decideFor?.mode === "rate" ? "#f5f3ff" : "#fef2f2" }}>
                            <td style={ptd} />
                            <td colSpan={7} style={ptd}>
                              {appealFor === r.id ? (
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                                  <textarea autoFocus value={appealText} onChange={(e) => setAppealText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAppeal(r.id); } }} placeholder="Explain why you disagree with this comment" style={{ ...inputS, flex: 1, minWidth: 240, minHeight: 44, fontSize: 16.5 }} />
                                  <button onClick={() => submitAppeal(r.id)} disabled={busy === "appeal"} style={btn("#b45309")}>{busy === "appeal" ? "Submitting…" : "Submit appeal"}</button>
                                  <button onClick={() => setAppealFor(null)} style={btn("#f1f5f9", "#374151")}>Cancel</button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                                  {decideFor?.mode === "reject" && (
                                    <div style={{ flex: 1, minWidth: 240 }}>
                                      <label style={lbl}>Reply to the appeal</label>
                                      <textarea autoFocus value={decideText} onChange={(e) => setDecideText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (decideText.trim()) decide(r.id, "REJECT", decideText); } }} placeholder="Why is the appeal not accepted? (required)" style={{ ...inputS, width: "100%", minHeight: 44, fontSize: 16.5, borderColor: "#fecaca" }} />
                                    </div>
                                  )}
                                  <div>
                                    <label style={lbl}>Rating</label>
                                    <StarRating value={finalRating} onChange={(n) => setFinalRating(v => v === n ? 0 : n)} />
                                  </div>
                                  <div>
                                    <label style={lbl}>Category</label>
                                    <select value={finalCategory} onChange={(e) => setFinalCategory(e.target.value)} style={{ ...inputS, fontSize: 16.5, background: "#fff", minWidth: 190 }}>
                                      <option value="">Select category…</option>
                                      {PERF_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label} ({c.weight}%)</option>)}
                                    </select>
                                  </div>
                                  <div style={{ fontSize: 15.5, color: "#64748b", paddingBottom: 9 }}>
                                    Score: <b style={{ color: "#0f172a", fontSize: 17 }}>{scoreOf(finalRating, finalCategory) != null ? `${scoreOf(finalRating, finalCategory)} / ${CATEGORY_BY_KEY[finalCategory].weight}` : "—"}</b>
                                  </div>
                                  {decideFor?.mode === "reject"
                                    ? <button onClick={() => decide(r.id, "REJECT", decideText)} disabled={busy === "decide"} style={btn("#dc2626")}>{busy === "decide" ? "Saving…" : "✕ Reject appeal"}</button>
                                    : <button onClick={() => finalizeRating(r.id)} disabled={busy === "decide"} style={btn("#6d28d9")}>{busy === "decide" ? "Saving…" : "Save rating"}</button>}
                                  <button onClick={() => setDecideFor(null)} style={btn("#f1f5f9", "#374151")}>Cancel</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                {totals.max > 0 && (
                  <tfoot>
                    <tr style={{ background: "#f8fafc" }}>
                      <td colSpan={5} style={{ ...ptd, textAlign: "right", fontWeight: 700, color: "#475569", borderTop: "2px solid #e2e8f0" }}>Overall score</td>
                      <td colSpan={3} style={{ ...ptd, fontWeight: 800, color: "#0f172a", borderTop: "2px solid #e2e8f0" }}>
                        {totals.total} <span style={{ color: "#94a3b8", fontWeight: 600 }}>/ {totals.max}</span>
                        <span style={{ ...pill("#eff6ff", "#1d4ed8"), marginLeft: 10 }}>{totals.pct}%</span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
      )}


      {linkModal && (
        <div onClick={() => setLinkModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 400, maxWidth: "92vw", padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,.28)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Link to app account</div>
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

      {photoZoom && emp.photoUrl && (
        <div onClick={() => setPhotoZoom(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, cursor: "zoom-out", padding: 24 }}>
          <img src={attachmentFullUrl(emp.photoUrl)} alt={emp.fullName}
            style={{ maxWidth: "min(90vw, 480px)", maxHeight: "85vh", borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,.5)", objectFit: "contain" }} />
          <button onClick={() => setPhotoZoom(false)}
            style={{ position: "absolute", top: 20, right: 24, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
