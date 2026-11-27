import { useEffect, useState } from "react";
import { attendanceApi } from "./hrApi";

// Staff who don't check in (Office Staff, e.g. Chinna Ponnu): HR marks each day by hand.
// Absent = 1 LOP day and Half Day = ½ in the salary sheet; unmarked days count as present.
export const MANUAL_STATUS = {
  PRESENT:  { label: "Present",  short: "P", bg: "#ecfdf5", color: "#059669" },
  HALF_DAY: { label: "Half Day", short: "H", bg: "#fffbeb", color: "#b45309" },
  ABSENT:   { label: "Absent",   short: "A", bg: "#fef2f2", color: "#dc2626" },
};
const CYCLE = ["", "PRESENT", "HALF_DAY", "ABSENT"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function ManualAttendanceCard({ user, version = 0, onChanged }) {
  const [month, setMonth] = useState(() => ymOf(new Date()));
  const [data, setData] = useState({ staff: [], records: [] });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    attendanceApi.manualMonth(month).then(r => { setData(r.data?.data || { staff: [], records: [] }); setErr(""); })
      .catch(e => setErr(e.response?.data?.message || "Could not load manual attendance"));
  }, [month, version]);

  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const todayStr = new Date().toLocaleDateString("en-CA");
  const dateOf = (d) => `${month}-${String(d).padStart(2, "0")}`;
  const byKey = new Map((data.records || []).map(r => [`${r.username}|${r.workDate}`, r]));
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setMonth(ymOf(d)); };

  const mark = async (username, date, status) => {
    const key = `${username}|${date}`;
    setBusy(key);
    try {
      const r = await attendanceApi.markManual({ username, workDate: date, status: status || "CLEAR", markedBy: user?.username });
      const saved = r.data?.data;
      setData(d => ({ ...d, records: [...d.records.filter(x => `${x.username}|${x.workDate}` !== key), ...(saved ? [saved] : [])] }));
      setErr("");
      onChanged?.(saved || { workDate: date }, username);
    } catch (e) { setErr(e.response?.data?.message || "Could not mark attendance"); }
    finally { setBusy(null); }
  };

  const cellW = 30;
  const th = { padding: "6px 0", fontSize: "var(--hz-text-xs)", fontWeight: 700, color: "var(--hz-ink-2)", textAlign: "center", width: cellW, border: "1px solid #0f172a" };
  const navBtn = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, color: "var(--hz-ink)" };

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "18px 22px", marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 700, color: "var(--hz-ink)" }}>Manual Attendance</div>
          <div style={{ fontSize: "var(--hz-text-md)", color: "var(--hz-ink-2)" }}>
            No check-in for these staff — click a day to cycle Present → Half Day → Absent → clear. Absent = 1 LOP day, Half Day = ½ in Salary.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button style={navBtn} onClick={() => shift(-1)}>‹</button>
          <span style={{ fontWeight: 800, minWidth: 80, textAlign: "center", color: "var(--hz-ink)" }}>{MONTHS[m - 1]} {y}</span>
          <button style={navBtn} onClick={() => shift(1)} disabled={month >= ymOf(new Date())}>›</button>
        </div>
      </div>
      {err && <div style={{ color: "#b91c1c", marginBottom: 8, fontSize: "var(--hz-text-md)" }}>{err}</div>}
      <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 170, textAlign: "left", padding: "6px 10px" }}>Name</th>
              {Array.from({ length: days }, (_, i) => {
                const dow = new Date(y, m - 1, i + 1).getDay();
                return <th key={i} style={{ ...th, background: dow === 0 ? "#f1f5f9" : "#f8fafc", color: dow === 0 ? "var(--hz-faint)" : th.color }}>
                  {i + 1}<div style={{ fontWeight: 500, fontSize: 10 }}>{"SMTWTFS"[dow]}</div></th>;
              })}
              {["P", "H", "A"].map(h => <th key={h} style={{ ...th, width: 36 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(data.staff || []).map(s => {
              const count = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0 };
              return (
                <tr key={s.username}>
                  <td style={{ border: "1px solid #0f172a", padding: "6px 10px", fontWeight: 600, color: "var(--hz-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.fullName}{s.employeeNumber && <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", fontWeight: 500 }}>{s.employeeNumber}</div>}
                  </td>
                  {Array.from({ length: days }, (_, i) => {
                    const date = dateOf(i + 1);
                    const sunday = new Date(y, m - 1, i + 1).getDay() === 0;
                    const future = date > todayStr;
                    const rec = byKey.get(`${s.username}|${date}`);
                    const st = MANUAL_STATUS[rec?.status] ? rec.status : "";
                    if (st) count[st]++;
                    const c = MANUAL_STATUS[st];
                    const key = `${s.username}|${date}`;
                    const next = CYCLE[(CYCLE.indexOf(st) + 1) % CYCLE.length];
                    return (
                      <td key={i} title={future ? "" : `${date} — ${c ? c.label : "Not marked"}${rec?.notes ? ` · ${rec.notes}` : ""}\nClick: ${next ? MANUAL_STATUS[next].label : "clear"}`}
                        onClick={() => !future && busy !== key && mark(s.username, date, next)}
                        style={{ border: "1px solid #0f172a", textAlign: "center", height: 34, fontWeight: 800, fontSize: "var(--hz-text-sm)",
                          cursor: future ? "default" : "pointer", opacity: busy === key ? 0.4 : 1,
                          background: c ? c.bg : future ? "#f8fafc" : sunday ? "#f1f5f9" : "#fff", color: c ? c.color : "var(--hz-faint)" }}>
                        {c ? c.short : ""}
                      </td>
                    );
                  })}
                  {["PRESENT", "HALF_DAY", "ABSENT"].map(k => (
                    <td key={k} style={{ border: "1px solid #0f172a", textAlign: "center", fontWeight: 800, color: MANUAL_STATUS[k].color }}>{count[k]}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
