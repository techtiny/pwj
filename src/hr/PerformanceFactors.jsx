import { fmtDate } from "./hrApi";

// KPI categories and their weight (= max score). Mirrors PerformanceRemark.CATEGORY_WEIGHTS
// on the backend: Score = Rating / 5 × weight, weights total 100.
export const PERF_CATEGORIES = [
  { key: "DELIVERY",      label: "Delivery",      weight: 30, color: "#2563eb", bg: "#eff6ff" },
  { key: "QUALITY",       label: "Quality",       weight: 25, color: "#7c3aed", bg: "#f5f3ff" },
  { key: "ATTENDANCE",    label: "Attendance",    weight: 15, color: "#0891b2", bg: "#ecfeff" },
  { key: "COMMUNICATION", label: "Communication", weight: 15, color: "#d97706", bg: "#fffbeb" },
  { key: "TEAMWORK",      label: "Teamwork",      weight: 15, color: "#059669", bg: "#ecfdf5" },
];
export const CATEGORY_BY_KEY = Object.fromEntries(PERF_CATEGORIES.map(c => [c.key, c]));

export const PARAMETER_SUGGESTIONS = [
  "Site handover on schedule", "Daily progress reporting", "BOQ / quantity accuracy", "Workmanship quality",
  "Snag closure", "Punctuality", "Check-in / check-out discipline", "Client communication",
  "Vendor coordination", "Team support", "Safety compliance", "Documentation",
];

export const APPEAL_WINDOW_HOURS = 48;

export function scoreOf(rating, category) {
  const c = CATEGORY_BY_KEY[category];
  if (!c || !rating) return null;
  return Math.round((rating / 5) * c.weight * 10) / 10;
}

export function CategoryChip({ category }) {
  const c = CATEGORY_BY_KEY[category];
  if (!c) return <span style={{ color: "var(--hz-faint)" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c.bg, color: c.color, border: `1px solid ${c.color}33`,
      borderRadius: 999, padding: "3px 11px", fontSize: "var(--hz-text-sm)", fontWeight: 700, whiteSpace: "nowrap" }}>
      {c.label} <span style={{ fontWeight: 600, opacity: .7 }}>· {c.weight}%</span>
    </span>
  );
}

export function Stars({ value, size = 16 }) {
  return (
    <span style={{ whiteSpace: "nowrap", letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(n => <span key={n} style={{ fontSize: size, color: n <= value ? "#f59e0b" : "#d1d5db" }}>★</span>)}
    </span>
  );
}

const gradeOf = (pct) =>
  pct >= 85 ? { label: "Outstanding", color: "#059669" } :
  pct >= 70 ? { label: "Good", color: "#2563eb" } :
  pct >= 50 ? { label: "Needs improvement", color: "#d97706" } :
              { label: "Below expectations", color: "var(--hz-danger)" };

/** Employee-facing performance table: S.No, Date, Parameters, Ratings, Score, Category.
 *  Only categorised (scored) comments count; appeals accepted by a reviewer are shown as withdrawn. */
export function PerformanceFactorsTable({ remarks, title = "Performance Factors", compact = false }) {
  // Final once the appeal stage is over: rated (no appeal / appeal rejected) or withdrawn (appeal accepted).
  const rows = (remarks || []).filter(r => r.category || r.appealStatus === "ACCEPTED");
  const counted = rows.filter(r => r.appealStatus !== "ACCEPTED" && r.rating);
  const total = counted.reduce((s, r) => s + (r.score ?? scoreOf(r.rating, r.category) ?? 0), 0);
  const max = counted.reduce((s, r) => s + (CATEGORY_BY_KEY[r.category]?.weight || 0), 0);
  const pct = max ? Math.round((total / max) * 100) : null;
  const grade = pct != null ? gradeOf(pct) : null;

  const th = { padding: "11px 14px", textAlign: "left", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "var(--hz-ink-2)", textTransform: "uppercase", letterSpacing: .5, background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" };
  const td = { padding: "12px 14px", fontSize: "var(--hz-text-md)", color: "var(--hz-ink-2)", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: compact ? "14px 18px" : "16px 20px", borderBottom: "1px solid #eef2f7", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: "var(--hz-text-lg)", fontWeight: 800, color: "var(--hz-ink)" }}>📊 {title}</div>
          <div style={{ fontSize: "var(--hz-text-sm)", color: "var(--hz-muted)", marginTop: 2 }}>Score = Rating ÷ 5 × category weight · accepted appeals are withdrawn from the score</div>
        </div>
        {pct != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "var(--hz-text-xs)", color: "var(--hz-muted)", fontWeight: 600 }}>Overall</div>
              <div style={{ fontSize: "var(--hz-text-2xl)", fontWeight: 800, color: "var(--hz-ink)", lineHeight: 1.1 }}>{Math.round(total * 10) / 10}<span style={{ fontSize: "var(--hz-text-md)", color: "var(--hz-faint)", fontWeight: 600 }}> / {max}</span></div>
            </div>
            <div style={{ background: `${grade.color}14`, color: grade.color, border: `1px solid ${grade.color}40`, borderRadius: 12, padding: "6px 12px", textAlign: "center" }}>
              <div style={{ fontSize: "var(--hz-text-xl)", fontWeight: 800, lineHeight: 1.1 }}>{pct}%</div>
              <div style={{ fontSize: "var(--hz-text-2xs)", fontWeight: 700 }}>{grade.label}</div>
            </div>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "26px 20px", textAlign: "center", color: "var(--hz-faint)", fontSize: "var(--hz-text-md)" }}>No performance factors recorded yet.</div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: compact ? 360 : 460, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ ...th, width: 56 }}>S.No</th>
                <th style={th}>Date</th>
                <th style={th}>Parameters</th>
                <th style={th}>Category</th>
                <th style={th}>Ratings</th>
                <th style={th}>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const withdrawn = r.appealStatus === "ACCEPTED";
                const c = CATEGORY_BY_KEY[r.category];
                const sc = r.score ?? scoreOf(r.rating, r.category);
                return (
                  <tr key={r.id} style={{ background: withdrawn ? "#f8fafc" : i % 2 ? "#fcfdff" : "#fff" }}>
                    <td style={{ ...td, color: "var(--hz-muted)", fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(r.remarkDate)}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, textDecoration: withdrawn ? "line-through" : "none", color: withdrawn ? "var(--hz-faint)" : "var(--hz-ink)" }}>{r.parameter || r.notes}</div>
                    </td>
                    <td style={td}>{r.category && !withdrawn ? <CategoryChip category={r.category} /> : <span style={{ color: "var(--hz-faint)" }}>—</span>}</td>
                    <td style={td}>{r.rating && !withdrawn ? <Stars value={r.rating} /> : <span style={{ color: "var(--hz-faint)" }}>—</span>}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {withdrawn
                        ? <span style={{ fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "#059669", background: "#ecfdf5", borderRadius: 999, padding: "3px 10px" }}>✓ Withdrawn</span>
                        : <span style={{ fontWeight: 800 }}>{sc}<span style={{ color: "var(--hz-faint)", fontWeight: 600 }}> / {c?.weight}</span></span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
