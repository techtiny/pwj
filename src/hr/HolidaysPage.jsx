import { useCallback, useEffect, useState } from "react";
import { holidayApi } from "./hrApi";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const th = { padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "12px 14px", fontSize: 14, borderBottom: "1px solid #eef2f7", color: "#0f172a" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

function dayName(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });
}
function fmtHolidayDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function HolidaysPage({ user }) {
  const canManage = ["ADMIN", "VP"].includes(user?.role);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ date: "", occasion: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await holidayApi.list();
      setHolidays(r.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitAdd(e) {
    e.preventDefault();
    if (!form.date || !form.occasion.trim()) return;
    setBusy("add");
    try {
      await holidayApi.add({ date: form.date, occasion: form.occasion.trim(), actionBy: user?.fullName || user?.username });
      setForm({ date: "", occasion: "" });
      await load();
    } catch (err) {
      alert(err.response?.data?.message || "Could not add holiday");
    } finally { setBusy(null); }
  }

  async function remove(h) {
    if (!window.confirm(`Remove ${h.occasion} (${fmtHolidayDate(h.date)})?`)) return;
    setBusy(h.id);
    try {
      await holidayApi.delete(h.id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || "Could not remove holiday");
    } finally { setBusy(null); }
  }

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      {/* Hero */}
      <div className="hr-hero" style={{ ...card, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, borderLeft: "4px solid #7c3aed" }}>
        <div className="hr-hero-icon" style={{ width: 46, height: 46, borderRadius: 12, background: "#f3e8ff", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📅</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>List of Holidays</div>
          <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 2 }}>
            Declared company holidays. These days are excluded from LOP in the Salary Sheet and from the Absent count in Attendance.
          </div>
        </div>
      </div>

      {canManage && (
        <form onSubmit={submitAdd} className="hr-form-grid" style={{ ...card, padding: "16px 18px", marginBottom: 20, display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 5 }}>Date</label>
            <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...inputS, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 5 }}>Occasion</label>
            <input required value={form.occasion} onChange={(e) => setForm((f) => ({ ...f, occasion: e.target.value }))} placeholder="e.g. Diwali" style={{ ...inputS, width: "100%" }} />
          </div>
          <button type="submit" disabled={busy === "add"} style={btn("#1e3a5f")}>{busy === "add" ? "Adding…" : "Add Holiday"}</button>
        </form>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", fontSize: 15, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #eef2f7" }}>
          Holidays <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {holidays.length}</span>
        </div>
        <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>S.No</th>
                <th style={th}>Date</th>
                <th style={th}>Day</th>
                <th style={th}>Occasion</th>
                {canManage && <th style={{ ...th, textAlign: "right" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={canManage ? 5 : 4}>Loading…</td></tr>
              ) : holidays.length === 0 ? (
                <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={canManage ? 5 : 4}>No holidays declared yet.</td></tr>
              ) : holidays.map((h, i) => (
                <tr key={h.id}>
                  <td style={{ ...td, color: "#475569" }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtHolidayDate(h.date)}</td>
                  <td style={td}>{dayName(h.date)}</td>
                  <td style={td}>{h.occasion}</td>
                  {canManage && (
                    <td style={{ ...td, textAlign: "right" }}>
                      <button disabled={busy === h.id} onClick={() => remove(h)} style={btn("#fee2e2", "#b91c1c")}>
                        {busy === h.id ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
