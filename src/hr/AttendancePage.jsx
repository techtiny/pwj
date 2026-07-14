import { useEffect, useState, useCallback, useMemo } from "react";
import { attendanceApi, fmtTime, fmtDate, fmtHours } from "./hrApi";

const EXCLUDED_USERNAMES = new Set(["techtiny", "techtinyproc", "tec123"]);

function toDateTimeLocal(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_COLOR = {
  PRESENT:  { bg: "#ecfdf5", color: "#059669", label: "Present" },
  HALF_DAY: { bg: "#fffbeb", color: "#d97706", label: "Half Day" },
  ON_LEAVE: { bg: "#eff6ff", color: "#2563eb", label: "On Leave" },
  ABSENT:   { bg: "#fef2f2", color: "#dc2626", label: "Absent" },
};

async function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Location not supported by this browser.")); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => reject(new Error("Location access denied. Please allow location permission and try again.")),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`);
    const d = await res.json();
    return d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

export function TodayAttendanceCard({ user, style }) {
  const [today, setToday]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [locMsg, setLocMsg]   = useState("");
  const username = user?.username;

  const load = useCallback(async () => {
    if (!username) return;
    try {
      const r = await attendanceApi.getToday(username);
      setToday(r.data?.data);
    } catch (e) { console.error(e); }
  }, [username]);

  useEffect(() => { load(); }, [load]);

  const captureAndRecord = async (apiFn, label) => {
    setLoading(true);
    setLocMsg("Getting your exact location…");
    try {
      const { lat, lng, accuracy } = await getLocation();
      setLocMsg("Resolving address…");
      const address = await reverseGeocode(lat, lng);
      setLocMsg("");
      const accuracyNote = accuracy > 200
        ? `\n\n⚠️ Low GPS accuracy (±${Math.round(accuracy)}m). Move outdoors for a better signal, then try again.`
        : "";
      if (accuracyNote && !window.confirm(`📍 ${address}${accuracyNote}\n\nProceed anyway?`)) return;
      const r = await apiFn({ username, lat, lng, address });
      if (r.data?.success) await load();
      else alert(r.data?.message || `${label} failed`);
    } catch (e) { alert(e.message); }
    finally { setLoading(false); setLocMsg(""); }
  };

  const handleCheckIn  = () => captureAndRecord(attendanceApi.checkIn,  "Check-in");
  const handleCheckOut = () => captureAndRecord(attendanceApi.checkOut, "Check-out");

  const checkedIn  = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;

  return (
    <div className="hr-check-card" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 22px", maxWidth: 520, ...style }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Today's Attendance</div>
      <div style={{ fontSize: 13, color: "#374151", marginBottom: 20 }}>
        {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
      </div>

      <div className="att-timeline" style={{ display: "flex", alignItems: "flex-start", gap: 0, marginBottom: 24, position: "relative" }}>
        {[
          { label: "Check In",  time: today?.checkInTime,  addr: today?.checkInAddress,  done: checkedIn },
          { label: "Check Out", time: today?.checkOutTime, addr: today?.checkOutAddress, done: checkedOut },
        ].map((step, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
            {i === 1 && <div className="att-line" style={{ position: "absolute", left: 0, right: 0, top: 18, height: 2, background: checkedIn ? "#1e3a5f" : "#e2e8f0", zIndex: 0 }} />}
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: step.done ? "#1e3a5f" : "#f8fafc",
              border: `2px solid ${step.done ? "#1e3a5f" : "#e2e8f0"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 8px", position: "relative", zIndex: 1,
              color: step.done ? "#fff" : "#94a3b8", fontSize: 15,
            }}>
              {step.done ? "✓" : (i === 0 ? "🏢" : "🏠")}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: step.done ? "#0f172a" : "#94a3b8" }}>{step.label}</div>
            {step.time && <div style={{ fontSize: 13, color: "#1e3a5f", fontWeight: 600, marginTop: 2 }}>{fmtTime(step.time)}</div>}
            {step.addr && (
              <div style={{ fontSize: 13, color: "#374151", marginTop: 2, maxWidth: 140, margin: "2px auto 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={step.addr}>
                📍 {step.addr}
              </div>
            )}
          </div>
        ))}
      </div>

      {today?.totalMinutes && (
        <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f" }}>⏱ Total: {fmtHours(today.totalMinutes)}</span>
        </div>
      )}

      {locMsg && (
        <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: "#1e293b" }}>
          📍 {locMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        {!checkedIn && (
          <button onClick={handleCheckIn} disabled={loading}
            style={{ flex: 1, border: "none", borderRadius: 9, padding: "12px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Getting location…" : "🏢 Check In"}
          </button>
        )}
        {checkedIn && !checkedOut && (
          <button onClick={handleCheckOut} disabled={loading}
            style={{ flex: 1, border: "none", borderRadius: 9, padding: "12px", background: "linear-gradient(135deg,#dc2626,#ef4444)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Getting location…" : "🏠 Check Out"}
          </button>
        )}
        {checkedOut && (
          <div style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 9, padding: "12px", textAlign: "center", color: "#1e3a5f", fontWeight: 700, fontSize: 14 }}>
            ✓ Day Complete
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact version — no card, just Check In and Check Out shown as two
 * separate icons with labels, each clickable directly. Pass `compact` to get
 * a horizontal pill (icon beside label) sized to sit inline in a nav bar row. */
export function AttendanceIconButton({ user, compact = false }) {
  const [today, setToday]     = useState(null);
  const [loading, setLoading] = useState(false);
  const username = user?.username;

  const load = useCallback(async () => {
    if (!username) return;
    try {
      const r = await attendanceApi.getToday(username);
      setToday(r.data?.data);
    } catch (e) { console.error(e); }
  }, [username]);

  useEffect(() => { load(); }, [load]);

  const checkedIn  = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;

  const doAction = async (apiFn, label) => {
    if (loading) return;
    setLoading(true);
    try {
      const { lat, lng, accuracy } = await getLocation();
      const address = await reverseGeocode(lat, lng);
      const accuracyNote = accuracy > 200
        ? `\n\n⚠️ Low GPS accuracy (±${Math.round(accuracy)}m). Move outdoors for a better signal, then try again.`
        : "";
      if (accuracyNote && !window.confirm(`📍 ${address}${accuracyNote}\n\nProceed anyway?`)) return;
      const r = await apiFn({ username, lat, lng, address });
      if (r.data?.success) await load();
      else alert(r.data?.message || `${label} failed`);
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const IconBtn = ({ done, active, disabled, onClick, emoji, label }) => compact ? (
    <button onClick={onClick} disabled={disabled || loading} title={label}
      style={{
        border: "none", background: "none", cursor: (disabled || loading) ? "default" : "pointer", fontFamily: "inherit",
        padding: "14px 14px", fontSize: 14.5, fontWeight: 700,
        color: done ? "#166534" : active ? "#dc2626" : "#94a3b8",
        display: "flex", alignItems: "center", gap: 7, opacity: (disabled && !done) ? 0.7 : 1,
      }}>
      <span style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        background: done ? "#dcfce7" : active ? "#fee2e2" : "#f1f5f9",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
      }}>
        {loading && active ? "…" : done ? "✓" : emoji}
      </span>
      {label}
    </button>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button onClick={onClick} disabled={disabled || loading} title={label}
        style={{
          width: 48, height: 48, borderRadius: "50%", border: "none",
          cursor: (disabled || loading) ? "default" : "pointer",
          background: done ? "#1e3a5f" : active ? "linear-gradient(135deg,#dc2626,#ef4444)" : "#e2e8f0",
          color: done || active ? "#fff" : "#64748b",
          fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(15,23,42,.14)", opacity: (disabled && !done) ? 0.6 : 1, fontFamily: "inherit",
        }}>
        {loading && active ? "…" : done ? "✓" : emoji}
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#000" }}>{label}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 0 : 18 }}>
      <IconBtn emoji="🏢" label="Check In" done={checkedIn}
        active={!checkedIn} disabled={checkedIn}
        onClick={() => doAction(attendanceApi.checkIn, "Check-in")} />
      <IconBtn emoji="🏠" label="Check Out" done={checkedOut}
        active={checkedIn && !checkedOut} disabled={!checkedIn || checkedOut}
        onClick={() => doAction(attendanceApi.checkOut, "Check-out")} />
    </div>
  );
}

const Tooltip = ({ tooltip }) => {
  if (!tooltip) return null;
  return (
    <div style={{
      position: "fixed", left: tooltip.x, top: tooltip.y,
      transform: "translateX(-50%)",
      background: "#1e293b", color: "#fff",
      padding: "8px 12px", borderRadius: 8,
      fontSize: 13, lineHeight: 1.6,
      maxWidth: 320, zIndex: 9999,
      pointerEvents: "none",
      boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
      whiteSpace: "normal", wordBreak: "break-word",
      textAlign: "center",
    }}>
      📍 {tooltip.text}
    </div>
  );
};

export default function AttendancePage({ user, adminView = false }) {
  const [history, setHistory] = useState([]);
  const [allRec, setAllRec]   = useState([]);
  const [summary, setSummary] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [subTab, setSubTab]   = useState("all");
  const [incomplete, setIncomplete] = useState([]);

  const [filterName, setFilterName]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom]     = useState("");
  const [filterTo, setFilterTo]         = useState("");

  const [editRec, setEditRec]   = useState(null);
  const [editIn, setEditIn]     = useState("");
  const [editOut, setEditOut]   = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const showTip = (e, text) => {
    if (!text) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTooltip({ text, x: r.left + r.width / 2, y: r.bottom + 8 });
  };
  const hideTip = () => setTooltip(null);

  const username = user?.username;

  const load = useCallback(async () => {
    if (!username) return;
    try {
      const [histRes, sumRes] = await Promise.all([
        attendanceApi.getHistory(username),
        attendanceApi.getSummary(username),
      ]);
      setHistory(histRes.data?.data || []);
      setSummary(sumRes.data?.data);
    } catch (e) { console.error(e); }
  }, [username]);

  const loadAll = useCallback(async () => {
    try {
      const r = await attendanceApi.getFieldStaff();
      setAllRec((r.data?.data || []).filter(a => !EXCLUDED_USERNAMES.has(a.username?.toLowerCase())));
    } catch (e) { console.error(e); }
  }, []);

  const loadIncomplete = useCallback(async () => {
    try {
      const r = await attendanceApi.getIncomplete();
      setIncomplete(r.data?.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); if (adminView) { loadAll(); loadIncomplete(); } }, [load, loadAll, loadIncomplete, adminView]);

  const TH = {
    background: "#f8fafc", padding: "12px 14px", textAlign: "left",
    fontWeight: 600, fontSize: 13, color: "#374151",
    textTransform: "uppercase", letterSpacing: 0.5,
    borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
  };
  const TD = (extra = {}) => ({
    padding: "12px 14px", color: "#374151",
    borderBottom: "1px solid #f1f5f9", fontSize: 14,
    verticalAlign: "middle", ...extra,
  });
  const statCard = (accent) => ({
    background: "#fff", borderRadius: 12, padding: "18px 22px",
    flex: 1, border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`,
  });
  const badge = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 13, fontWeight: 600 });

  const LocCell = ({ text, maxWidth = 160 }) => (
    <div
      onMouseEnter={e => showTip(e, text)}
      onMouseLeave={hideTip}
      style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "default", maxWidth }}
    >
      {text || "—"}
    </div>
  );

  const employeeOptions = useMemo(() => {
    const names = new Set(allRec.map(a => a.fullName).filter(Boolean));
    return [...names].sort();
  }, [allRec]);

  const filteredRec = useMemo(() => {
    return allRec.filter(a => {
      if (filterName && a.fullName !== filterName) return false;
      if (filterStatus && a.status !== filterStatus) return false;
      const day = a.workDate ? String(a.workDate).substring(0, 10) : "";
      if (filterFrom && day < filterFrom) return false;
      if (filterTo && day > filterTo) return false;
      return true;
    });
  }, [allRec, filterName, filterStatus, filterFrom, filterTo]);

  const hasFilters = filterName || filterStatus || filterFrom || filterTo;
  const clearFilters = () => { setFilterName(""); setFilterStatus(""); setFilterFrom(""); setFilterTo(""); };

  const openEdit = (a) => {
    setEditRec(a);
    setEditIn(toDateTimeLocal(a.checkInTime));
    setEditOut(toDateTimeLocal(a.checkOutTime));
    setEditNotes(a.notes || "");
  };

  const saveEdit = async () => {
    if (!editRec) return;
    setEditSaving(true);
    try {
      await attendanceApi.update(editRec.id, {
        checkInTime:  editIn  ? editIn.replace("T", "T").replace(" ", "T") : undefined,
        checkOutTime: editOut ? editOut.replace("T", "T").replace(" ", "T") : undefined,
        notes: editNotes || undefined,
      });
      setEditRec(null);
      await loadAll();
      if (adminView) await loadIncomplete();
    } catch (e) {
      alert("Failed to save. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  if (adminView) {
    const FILTER_INP = {
      border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
      fontSize: 14, fontFamily: "inherit", outline: "none", color: "#0f172a", background: "#fff",
    };
    const FILTER_LBL = { fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4, display: "block" };
    return (
      <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Team Attendance</div>
        <div style={{ fontSize: 13, color: "#374151", marginBottom: 16 }}>Engineers, Project Managers, Admin &amp; Procurement · {filteredRec.length} of {allRec.length} records</div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
          {[
            { key: "all",           label: "All Records" },
            { key: "needs-review",  label: `Needs Review — Missing Check-In/Out${incomplete.length ? ` (${incomplete.length})` : ""}` },
          ].map(t => {
            const active = subTab === t.key;
            return (
              <button key={t.key} onClick={() => setSubTab(t.key)}
                style={{
                  border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                  padding: "10px 18px", fontSize: 14.5, fontWeight: active ? 700 : 600,
                  color: t.key === "needs-review" && incomplete.length > 0 ? (active ? "#dc2626" : "#991b1b") : "#000",
                  borderBottom: active ? "2.5px solid #1e3a5f" : "2.5px solid transparent",
                  marginBottom: -1, whiteSpace: "nowrap",
                }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {subTab === "all" && (<>
        {/* Filter bar */}
        <div className="hr-filter-bar" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={FILTER_LBL}>Employee</label>
            <select style={{ ...FILTER_INP, minWidth: 160 }} value={filterName} onChange={e => setFilterName(e.target.value)}>
              <option value="">All Employees</option>
              {employeeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={FILTER_LBL}>Status</label>
            <select style={{ ...FILTER_INP, minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.entries(STATUS_COLOR).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={FILTER_LBL}>From</label>
            <input type="date" style={FILTER_INP} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label style={FILTER_LBL}>To</label>
            <input type="date" style={FILTER_INP} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters}
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Clear Filters
            </button>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }} className="table-scroll-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>{["Employee","Date","Check-In","Location In","Check-Out","Location Out","Duration","Status","Edit"].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredRec.map(a => {
                const s = STATUS_COLOR[a.status] || STATUS_COLOR.ABSENT;
                return (
                  <tr key={a.id}>
                    <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{a.fullName}</td>
                    <td style={TD()}>{fmtDate(a.workDate)}</td>
                    <td style={TD()}>{fmtTime(a.checkInTime)}</td>
                    <td style={TD({ maxWidth: 160 })}><LocCell text={a.checkInAddress} /></td>
                    <td style={TD()}>{fmtTime(a.checkOutTime)}</td>
                    <td style={TD({ maxWidth: 160 })}><LocCell text={a.checkOutAddress} /></td>
                    <td style={TD({ fontWeight: 600 })}>{fmtHours(a.totalMinutes)}</td>
                    <td style={TD()}><span style={badge(s)}>{s.label}</span></td>
                    <td style={TD()}>
                      <button onClick={() => openEdit(a)}
                        style={{ border: "1.5px solid #e2e8f0", borderRadius: 7, padding: "4px 12px", background: "#fff", color: "#1e3a5f", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        ✏️ Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRec.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 52, textAlign: "center", color: "#374151", fontSize: 15 }}>
                  {hasFilters ? "No records match the selected filters." : "No records"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>)}

        {subTab === "needs-review" && (
          <div className="hr-needs-review" style={{ background: "#fff", borderRadius: 12, border: "1px solid #fca5a5", borderLeft: "4px solid #dc2626", padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#dc2626" }}>Needs Review — Missing Check-Out</div>
                <div style={{ fontSize: 15, color: "#ef4444" }}>
                  {incomplete.length} record{incomplete.length !== 1 ? "s" : ""} auto-marked Absent — employee checked in but never checked out
                </div>
              </div>
            </div>
            <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Employee", "Date", "Check-In", "Location", "Edit"].map(h => (
                      <th key={h} style={{ ...TH, background: "#fef2f2" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incomplete.map(a => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #fee2e2" }}>
                      <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{a.fullName}</td>
                      <td style={TD()}>{fmtDate(a.workDate)}</td>
                      <td style={TD()}>{fmtTime(a.checkInTime)}</td>
                      <td style={TD({ maxWidth: 220 })}><LocCell text={a.checkInAddress} maxWidth={220} /></td>
                      <td style={TD()}>
                        <button onClick={() => openEdit(a)}
                          style={{ border: "1.5px solid #e2e8f0", borderRadius: 7, padding: "4px 12px", background: "#fff", color: "#1e3a5f", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                          ✏️ Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {incomplete.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 52, textAlign: "center", color: "#374151", fontSize: 15 }}>
                      🎉 No missing check-outs to review
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Tooltip tooltip={tooltip} />

        {/* Edit modal */}
        {editRec && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div className="hr-edit-modal" style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", fontFamily: "inherit" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Edit Attendance</div>
              <div style={{ fontSize: 14, color: "#374151", marginBottom: 20 }}>{editRec.fullName} · {fmtDate(editRec.workDate)}</div>

              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>Check-In Time</label>
              <input type="datetime-local" value={editIn} onChange={e => setEditIn(e.target.value)}
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14.5, fontFamily: "inherit", marginBottom: 16, boxSizing: "border-box", outline: "none" }} />

              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>Check-Out Time</label>
              <input type="datetime-local" value={editOut} onChange={e => setEditOut(e.target.value)}
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14.5, fontFamily: "inherit", marginBottom: 16, boxSizing: "border-box", outline: "none" }} />

              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>Admin Notes</label>
              <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Reason for correction…"
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14.5, fontFamily: "inherit", marginBottom: 22, boxSizing: "border-box", outline: "none" }} />

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEditRec(null)}
                  style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "10px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={editSaving}
                  style={{ flex: 2, border: "none", borderRadius: 9, padding: "10px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: editSaving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: editSaving ? 0.7 : 1 }}>
                  {editSaving ? "Saving…" : "Save Correction"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {summary && (
        <div className="hr-stat-flex" style={{ display: "flex", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Present",  value: summary.presentDays, accent: "#059669" },
            { label: "Half Day", value: summary.halfDays,    accent: "#d97706" },
            { label: "Total",    value: summary.totalDays,   accent: "#1e3a5f" },
            { label: "Absent",   value: summary.absentDays,  accent: "#dc2626" },
          ].map(k => (
            <div key={k.label} style={statCard(k.accent)}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{k.label} (Month)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <TodayAttendanceCard user={user} style={{ marginBottom: 24 }} />

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Attendance History</div>
          <div style={{ fontSize: 13, color: "#374151" }}>{history.length} records</div>
        </div>
        <div className="table-scroll-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>{["Date","Check-In","Location","Check-Out","Duration","Status"].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {history.map(a => {
                const s = STATUS_COLOR[a.status] || STATUS_COLOR.ABSENT;
                return (
                  <tr key={a.id}>
                    <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{fmtDate(a.workDate)}</td>
                    <td style={TD()}>{fmtTime(a.checkInTime)}</td>
                    <td style={TD({ maxWidth: 180 })}><LocCell text={a.checkInAddress} maxWidth={180} /></td>
                    <td style={TD()}>{fmtTime(a.checkOutTime)}</td>
                    <td style={TD({ fontWeight: 600 })}>{fmtHours(a.totalMinutes)}</td>
                    <td style={TD()}><span style={badge(s)}>{s.label}</span></td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 52, textAlign: "center", color: "#374151", fontSize: 15 }}>No records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Tooltip tooltip={tooltip} />
    </div>
  );
}
