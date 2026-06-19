import { useEffect, useState, useCallback, useMemo } from "react";
import { attendanceApi, fmtTime, fmtDate, fmtHours } from "./hrApi";

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

const Tooltip = ({ tooltip }) => {
  if (!tooltip) return null;
  return (
    <div style={{
      position: "fixed", left: tooltip.x, top: tooltip.y,
      transform: "translateX(-50%)",
      background: "#1e293b", color: "#fff",
      padding: "8px 12px", borderRadius: 8,
      fontSize: 12, lineHeight: 1.6,
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
  const [today, setToday]     = useState(null);
  const [history, setHistory] = useState([]);
  const [allRec, setAllRec]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [locMsg, setLocMsg]   = useState("");
  const [summary, setSummary] = useState(null);
  const [tooltip, setTooltip] = useState(null);

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
      const [todayRes, histRes, sumRes] = await Promise.all([
        attendanceApi.getToday(username),
        attendanceApi.getHistory(username),
        attendanceApi.getSummary(username),
      ]);
      setToday(todayRes.data?.data);
      setHistory(histRes.data?.data || []);
      setSummary(sumRes.data?.data);
    } catch (e) { console.error(e); }
  }, [username]);

  const loadAll = useCallback(async () => {
    try {
      const r = await attendanceApi.getFieldStaff();
      setAllRec(r.data?.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); if (adminView) loadAll(); }, [load, loadAll, adminView]);

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

  const TH = {
    background: "#f8fafc", padding: "12px 14px", textAlign: "left",
    fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
    fontWeight: 600, fontSize: 11.5, color: "#64748b",
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
  const badge = (s) => ({ background: s.bg, color: s.color, borderRadius: 5, padding: "3px 10px", fontSize: 12.5, fontWeight: 600 });

  const LocCell = ({ text, maxWidth = 160 }) => (
    <div
      onMouseEnter={e => showTip(e, text)}
      onMouseLeave={hideTip}
      style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "default", maxWidth }}
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
    } catch (e) {
      alert("Failed to save. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  if (adminView) {
    const FILTER_INP = {
      border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px",
      fontSize: 13, fontFamily: "inherit", outline: "none", color: "#0f172a", background: "#fff",
    };
    const FILTER_LBL = { fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };
    return (
      <div className="hr-page" style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.3px" }}>Field Staff Attendance</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Site Engineers &amp; Project Managers · {filteredRec.length} of {allRec.length} records</div>

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
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
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
                        style={{ border: "1.5px solid #e2e8f0", borderRadius: 7, padding: "4px 12px", background: "#fff", color: "#1e3a5f", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                        ✏️ Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredRec.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 52, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
                  {hasFilters ? "No records match the selected filters." : "No records"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Tooltip tooltip={tooltip} />

        {/* Edit modal */}
        {editRec && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div className="hr-edit-modal" style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", fontFamily: "inherit" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Edit Attendance</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>{editRec.fullName} · {fmtDate(editRec.workDate)}</div>

              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>Check-In Time</label>
              <input type="datetime-local" value={editIn} onChange={e => setEditIn(e.target.value)}
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit", marginBottom: 16, boxSizing: "border-box", outline: "none" }} />

              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>Check-Out Time</label>
              <input type="datetime-local" value={editOut} onChange={e => setEditOut(e.target.value)}
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit", marginBottom: 16, boxSizing: "border-box", outline: "none" }} />

              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>Admin Notes</label>
              <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Reason for correction…"
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit", marginBottom: 22, boxSizing: "border-box", outline: "none" }} />

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEditRec(null)}
                  style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "10px", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={editSaving}
                  style={{ flex: 2, border: "none", borderRadius: 9, padding: "10px", background: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: editSaving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: editSaving ? 0.7 : 1 }}>
                  {editSaving ? "Saving…" : "Save Correction"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const checkedIn  = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;

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
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{k.label} (Month)</div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="hr-check-card" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 22px", marginBottom: 24, maxWidth: 520 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Today's Attendance</div>
        <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 20 }}>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: step.done ? "#0f172a" : "#94a3b8" }}>{step.label}</div>
              {step.time && <div style={{ fontSize: 11.5, color: "#1e3a5f", fontWeight: 600, marginTop: 2 }}>{fmtTime(step.time)}</div>}
              {step.addr && (
                <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2, maxWidth: 140, margin: "2px auto 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={step.addr}>
                  📍 {step.addr}
                </div>
              )}
            </div>
          ))}
        </div>

        {today?.totalMinutes && (
          <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>⏱ Total: {fmtHours(today.totalMinutes)}</span>
          </div>
        )}

        {locMsg && (
          <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12.5, color: "#475569" }}>
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

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Attendance History</div>
          <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{history.length} records</div>
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
                <tr><td colSpan={6} style={{ padding: 52, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>No records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Tooltip tooltip={tooltip} />
    </div>
  );
}
