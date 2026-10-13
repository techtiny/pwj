import { useCallback, useEffect, useMemo, useState } from "react";
import { employeeApi, performanceApi, usersApi, uploadImage, attachmentFullUrl } from "./hrApi";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" };
const inputS = { border: "1px solid #cbd5e1", borderRadius: 9, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });

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

function InfoChip({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 10, padding: "6px 12px" }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, accent, accentBg, hint }) {
  return (
    <div className="ep-statcard" style={{ ...card, padding: "16px 18px", flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: accentBg, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 27, fontWeight: 800, color: "#0f172a", marginTop: 2, lineHeight: 1.1 }}>{value}</div>
        {hint && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{hint}</div>}
      </div>
    </div>
  );
}

function StarRating({ value, onChange, readOnly }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => !readOnly && onChange && onChange(n)} className={readOnly ? "" : "ep-star"}
          style={{ fontSize: readOnly ? 15 : 24, cursor: readOnly ? "default" : "pointer", color: n <= value ? "#f59e0b" : "#d1d5db", lineHeight: 1, transition: "transform .1s" }}>★</span>
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
  const [photoZoom, setPhotoZoom] = useState(false);
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
  if (!emp) return <div className="hr-page" style={{ padding: "24px 32px" }}>Employee not found. {onBack && <button onClick={onBack} style={btn("#1e3a5f")}>Back</button>}</div>;

  const isExited = !!emp.dor;
  const birthdaySoon = isBirthdaySoon(emp.dob);
  const isSelf = !!(emp.linkedUsername && user?.username && emp.linkedUsername.toLowerCase() === user.username.toLowerCase());

  return (
    <div className="hr-page ep-page" style={{ padding: "24px 32px", background: "#f1f5f9" }}>
      <style>{`
        .ep-statcard { transition: transform .15s ease, box-shadow .15s ease; }
        .ep-statcard:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,23,42,0.08); }
        .ep-star:hover { transform: scale(1.18); }
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
              <div style={{ width: 96, height: 96, borderRadius: "50%", background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 34, border: "4px solid #fff", boxShadow: "0 4px 14px rgba(15,23,42,0.18)" }}>
                {emp.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            {(canManage || isSelf) && (
              <label className="ep-banner-btn" style={{ position: "absolute", bottom: 2, right: 2, background: "linear-gradient(135deg,#1e3a5f,#0f766e)", color: "#fff", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
                {busy === "photo" ? "…" : "📷"}
                <input type="file" accept="image/*" hidden onChange={(e) => handlePhoto(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 220, paddingTop: 48 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 21, fontWeight: 800, color: "#0f172a" }}>{emp.fullName}</div>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: isExited ? "#fef2f2" : "#ecfdf5", color: isExited ? "#b91c1c" : "#059669", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: isExited ? "#b91c1c" : "#059669", display: "inline-block" }} />
                {isExited ? "Exited" : "Active"}
              </span>
              {birthdaySoon !== false && (
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: "linear-gradient(135deg,#fef3c7,#fde68a)", color: "#92400e" }}>
                  🎂 {birthdaySoon === 0 ? "Birthday today!" : `Birthday in ${birthdaySoon}d`}
                </span>
              )}
              {isSelf && (
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: "#eff6ff", color: "#1d4ed8" }}>
                  This is you
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, color: "#475569", marginTop: 3, fontWeight: 600 }}>{emp.designation || "—"} · {emp.department || "—"}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <InfoChip icon="🪪" label="Code" value={emp.personCode || "—"} />
              <InfoChip icon="📅" label="DOJ" value={fmtDate(emp.doj) || emp.dojRaw || "—"} />
              <InfoChip icon="⏳" label="Tenure" value={tenure(emp.doj, emp.dor)} />
              {emp.dob && <InfoChip icon="🎈" label="Age" value={ageFromDob(emp.dob)} />}
              <InfoChip icon="⚧" label="Gender" value={emp.gender || "—"} />
            </div>

            {emp.linkedUsername ? (
              <div style={{ fontSize: 12.5, color: "#059669", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                ✓ Linked to app account <b>@{emp.linkedUsername}</b>
                {canManage && <button onClick={openLinkModal} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>change</button>}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#92400e", marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Not linked to an app account — PR/attendance stats unavailable.
                {canManage && <button onClick={openLinkModal} style={{ background: "none", border: "none", color: "#92400e", cursor: "pointer", fontSize: 12, fontWeight: 700, textDecoration: "underline" }}>Link now</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      {isExited && (
        <div style={{ ...card, padding: "16px 20px", marginBottom: 20, borderLeft: "4px solid #dc2626" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
            🚪 Exit Details
          </div>
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
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 7 }}>📊 Performance Stats</div>
        <div style={{ display: "flex", gap: 6, background: "#fff", padding: 3, borderRadius: 22, border: "1px solid #e2e8f0" }}>
          {Object.entries(RANGE_LABEL).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)}
              style={{ border: "none", borderRadius: 20, padding: "6px 13px",
                background: range === k ? "#1e3a5f" : "transparent", color: range === k ? "#fff" : "#374151",
                fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard icon="📝" label="PRs Raised" value={stats ? stats.prRaised : "—"} accent="#3b82f6" accentBg="#eff6ff" />
        <StatCard icon="✅" label="Correct Check-ins" value={stats ? stats.correctCheckins : "—"} accent="#059669" accentBg="#ecfdf5" hint="Checked in and out" />
        <StatCard icon="⚠️" label="Incomplete Check-ins" value={stats ? stats.incompleteCheckins : "—"} accent="#dc2626" accentBg="#fef2f2" hint="Checked in, never checked out" />
        <StatCard icon="⭐" label="Avg. Performance" value={avgRating ? `${avgRating} ★` : "—"} accent="#d97706" accentBg="#fffbeb" hint={trend ? `${trend.icon} ${trend.label}` : `${remarks.length} rated day(s)`} />
      </div>
      {stats && !stats.linked && (
        <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: -14, marginBottom: 20 }}>
          These stats need an app account link to compute — see above.
        </div>
      )}

      {/* Daily performance remark */}
      <div style={{ ...card, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>📋 Daily Performance Remark</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14 }}>One entry per day — track how {emp.fullName.split(" ")[0]} is doing, day by day.</div>
        {canManage ? (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 12, padding: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Today ({fmtDate(today)})</div>
              <StarRating value={form.rating} onChange={(n) => setForm(f => ({ ...f, rating: n }))} />
            </div>
            <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="What stood out today — good or bad?" style={{ ...inputS, flex: 1, minWidth: 220, minHeight: 40, resize: "vertical", background: "#fff" }} />
            <button onClick={saveRemark} disabled={busy === "remark"} style={{ ...btn("#1e3a5f"), opacity: busy === "remark" ? 0.7 : 1 }}>
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
                <div key={r.id} className="ep-history-row" style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: 10, borderBottom: "1px solid #f8fafc" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#475569", width: 84, flexShrink: 0, background: "#f1f5f9", borderRadius: 8, padding: "3px 8px", textAlign: "center" }}>{fmtDate(r.remarkDate)}</div>
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
        <div onClick={() => setLinkModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 400, maxWidth: "92vw", padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,.28)" }}>
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

      {photoZoom && emp.photoUrl && (
        <div onClick={() => setPhotoZoom(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, cursor: "zoom-out", padding: 24 }}>
          <img src={attachmentFullUrl(emp.photoUrl)} alt={emp.fullName}
            style={{ maxWidth: "min(90vw, 480px)", maxHeight: "85vh", borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,.5)", objectFit: "contain" }} />
          <button onClick={() => setPhotoZoom(false)}
            style={{ position: "absolute", top: 20, right: 24, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 36, height: 36, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
