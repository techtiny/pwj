import { useEffect, useState, useCallback } from "react";
import { attendanceApi, fmtTime, fmtDate, fmtHours } from "./hrApi";

const STATUS_COLOR = {
  PRESENT:  { bg: "#ecfdf5", color: "#059669", label: "Present" },
  HALF_DAY: { bg: "#fffbeb", color: "#d97706", label: "Half Day" },
  ON_LEAVE: { bg: "#eff6ff", color: "#2563eb", label: "On Leave" },
  ABSENT:   { bg: "#fef2f2", color: "#dc2626", label: "Absent" },
};

async function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
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
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export default function AttendancePage({ user, adminView = false }) {
  const [today, setToday]     = useState(null);
  const [history, setHistory] = useState([]);
  const [allRec, setAllRec]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [locMsg, setLocMsg]   = useState("");
  const [summary, setSummary] = useState(null);

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
      const r = await attendanceApi.getAll();
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
        ? `\n\n⚠️ Low GPS accuracy (±${Math.round(accuracy)}m). The address shown may not be precise — move outdoors or near a window for a better signal, then try again.`
        : "";
      if (accuracyNote) {
        const proceed = window.confirm(`📍 ${address}${accuracyNote}\n\nProceed anyway?`);
        if (!proceed) return;
      }
      const r = await apiFn({ username, lat, lng, address });
      if (r.data?.success) await load();
      else alert(r.data?.message || `${label} failed`);
    } catch (e) {
      alert(e.message);
    } finally { setLoading(false); setLocMsg(""); }
  };

  const handleCheckIn  = () => captureAndRecord(attendanceApi.checkIn,  "Check-in");
  const handleCheckOut = () => captureAndRecord(attendanceApi.checkOut, "Check-out");

  // PWJ design tokens
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

  if (adminView) {
    return (
      <div style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 4, letterSpacing: "-0.3px" }}>All Attendance Records</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>{allRec.length} total records</div>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }} className="table-scroll-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                {["Employee","Date","Check-In","Location In","Check-Out","Location Out","Duration","Status"].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRec.map(a => {
                const s = STATUS_COLOR[a.status] || STATUS_COLOR.ABSENT;
                return (
                  <tr key={a.id}>
                    <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{a.fullName}</td>
                    <td style={TD()}>{fmtDate(a.workDate)}</td>
                    <td style={TD()}>{fmtTime(a.checkInTime)}</td>
                    <td style={TD({ fontSize: 12, color: "#64748b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={a.checkInAddress}>{a.checkInAddress || "—"}</td>
                    <td style={TD()}>{fmtTime(a.checkOutTime)}</td>
                    <td style={TD({ fontSize: 12, color: "#64748b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={a.checkOutAddress}>{a.checkOutAddress || "—"}</td>
                    <td style={TD({ fontWeight: 600 })}>{fmtHours(a.totalMinutes)}</td>
                    <td style={TD()}>
                      <span style={badge(s)}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
              {allRec.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 52, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>No records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const checkedIn  = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;

  return (
    <div style={{ padding: "24px 32px", background: "#f1f5f9", minHeight: "calc(100vh - 108px)" }}>

      {/* Summary stats — PWJ statCard style */}
      {summary && (
        <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
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

      {/* Today's check-in card */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 22px", marginBottom: 24, maxWidth: 520 }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Today's Attendance</div>
        <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 20 }}>
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </div>

        {/* Status timeline */}
        <div className="att-timeline" style={{ display: "flex", alignItems: "flex-start", gap: 0, marginBottom: 24, position: "relative" }}>
          {[
            { label: "Check In",  time: today?.checkInTime,  addr: today?.checkInAddress,  done: checkedIn },
            { label: "Check Out", time: today?.checkOutTime, addr: today?.checkOutAddress, done: checkedOut },
          ].map((step, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
              {i === 1 && (
                <div className="att-line" style={{ position: "absolute", left: 0, right: 0, top: 18, height: 2, background: checkedIn ? "#1e3a5f" : "#e2e8f0", zIndex: 0 }} />
              )}
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

      {/* Attendance History */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Attendance History</div>
          <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{history.length} records</div>
        </div>
        <div className="table-scroll-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                {["Date","Check-In","Location","Check-Out","Duration","Status"].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(a => {
                const s = STATUS_COLOR[a.status] || STATUS_COLOR.ABSENT;
                return (
                  <tr key={a.id}>
                    <td style={TD({ fontWeight: 600, color: "#0f172a" })}>{fmtDate(a.workDate)}</td>
                    <td style={TD()}>{fmtTime(a.checkInTime)}</td>
                    <td style={TD({ fontSize: 12, color: "#64748b", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })} title={a.checkInAddress}>{a.checkInAddress || "—"}</td>
                    <td style={TD()}>{fmtTime(a.checkOutTime)}</td>
                    <td style={TD({ fontWeight: 600 })}>{fmtHours(a.totalMinutes)}</td>
                    <td style={TD()}>
                      <span style={badge(s)}>{s.label}</span>
                    </td>
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
    </div>
  );
}
