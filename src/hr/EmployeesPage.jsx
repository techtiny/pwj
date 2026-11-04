import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, ChevronRight, Cake, CalendarDays, Hourglass, Hash, Building2, Briefcase, AtSign } from "lucide-react";
import { employeeApi, usersApi, attachmentFullUrl, isExitedEmp, tenureMonths } from "./hrApi";
import EmployeeProfilePage from "./EmployeeProfilePage";

const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function tenure(emp) {
  const months = tenureMonths(emp);
  if (months == null) return "—";
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y}y` : null, m || !y ? `${m}m` : null].filter(Boolean).join(" ");
}

const AVATAR_TONES = [
  ["#e0e7ff", "#4338ca"], ["#dcfce7", "#15803d"], ["#fef3c7", "#b45309"], ["#fce7f3", "#be185d"],
  ["#e0f2fe", "#0369a1"], ["#ede9fe", "#6d28d9"], ["#ffedd5", "#c2410c"], ["#ccfbf1", "#0f766e"],
];
const toneFor = (name) => AVATAR_TONES[[...(name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];

function Avatar({ url, name, size = 36 }) {
  const [bg, fg] = toneFor(name);
  return url ? (
    <img src={attachmentFullUrl(url)} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4, flexShrink: 0 }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

const EM_CSS = `
.em-head { display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
.em-title { font-size:22px; font-weight:800; color:#0f172a; letter-spacing:-0.3px; }
.em-sub { font-size:13.5px; color:#64748b; margin-top:2px; }
.em-add { margin-left:auto; display:inline-flex; align-items:center; gap:6px; border:none; border-radius:10px; padding:10px 18px; font-size:14px; font-weight:700; color:#fff; background:#1e3a5f; cursor:pointer; font-family:inherit; white-space:nowrap; transition:background .15s; }
.em-add:hover { background:#16304f; }

.em-shell { display:grid; grid-template-columns:380px minmax(0,1fr); background:#fff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; height:calc(100vh - 250px); min-height:520px; }
.em-side { display:flex; flex-direction:column; border-right:1px solid #e2e8f0; min-height:0; }
.em-tools { padding:14px; border-bottom:1px solid #eef2f7; display:flex; flex-direction:column; gap:10px; }
.em-search { position:relative; }
.em-search svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; }
.em-search input { width:100%; box-sizing:border-box; border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; padding:10px 12px 10px 38px; font-size:14px; font-family:inherit; color:#0f172a; outline:none; transition:border-color .15s, background .15s, box-shadow .15s; }
.em-search input:focus { border-color:#1e3a5f; background:#fff; box-shadow:0 0 0 3px rgba(30,58,95,.12); }
.em-row2 { display:flex; gap:8px; }
.em-select { flex:1; min-width:0; border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; padding:8px 10px; font-size:13px; font-family:inherit; color:#0f172a; cursor:pointer; outline:none; }
.em-seg { display:flex; background:#f1f5f9; border-radius:10px; padding:3px; gap:2px; }
.em-seg button { flex:1; border:none; background:transparent; border-radius:8px; padding:6px 10px; font-size:12.5px; font-weight:600; color:#64748b; cursor:pointer; font-family:inherit; white-space:nowrap; transition:background .15s, color .15s; }
.em-seg button.on { background:#fff; color:#0f172a; box-shadow:0 1px 2px rgba(0,0,0,.1); }
.em-count { padding:9px 16px; font-size:12px; color:#64748b; border-bottom:1px solid #eef2f7; background:#fafbfc; }

.em-list { overflow-y:auto; flex:1; min-height:0; }
.em-grp { position:sticky; top:0; z-index:1; padding:8px 16px; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#64748b; background:#f1f5f9; border-bottom:1px solid #e8edf3; display:flex; justify-content:space-between; }
.em-item { display:flex; align-items:center; gap:12px; padding:10px 16px; cursor:pointer; border-left:3px solid transparent; border-bottom:1px solid #f4f6f9; transition:background .12s; }
.em-item:hover { background:#f8fafc; }
.em-item.sel { background:#eef3f9; border-left-color:#1e3a5f; }
.em-item-main { flex:1; min-width:0; }
.em-item-name { font-size:14px; font-weight:600; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.em-item-sub { font-size:12.5px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
.em-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.em-dot.active { background:#22c55e; }
.em-dot.exited { background:#ef4444; }
.em-item.exited .em-item-name { color:#64748b; }

.em-panel { overflow-y:auto; min-width:0; background:#fafbfc; }
.em-hero { background:linear-gradient(135deg,#1e3a5f 0%,#2c5282 100%); padding:30px 32px 56px; color:#fff; }
.em-hero-in { display:flex; align-items:center; gap:20px; }
.em-hero-av { padding:4px; background:rgba(255,255,255,.2); border-radius:50%; flex-shrink:0; }
.em-hero-name { font-size:24px; font-weight:800; letter-spacing:-0.3px; }
.em-hero-role { font-size:15px; opacity:.85; margin-top:3px; }
.em-badge { display:inline-flex; align-items:center; gap:6px; margin-top:10px; font-size:12px; font-weight:700; padding:4px 11px; border-radius:100px; background:rgba(255,255,255,.18); }
.em-badge i { width:7px; height:7px; border-radius:50%; display:inline-block; }
.em-body { margin:-34px 24px 24px; background:#fff; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 4px 16px rgba(15,23,42,.06); padding:6px 22px 22px; }
.em-facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 28px; }
.em-fact { display:flex; align-items:center; gap:14px; padding:15px 0; border-bottom:1px solid #f1f5f9; }
.em-fact-ic { width:36px; height:36px; border-radius:10px; background:#eef3f9; color:#1e3a5f; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.em-fact-l { font-size:11.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; }
.em-fact-v { font-size:15px; font-weight:600; color:#0f172a; margin-top:2px; }
.em-open { margin-top:22px; display:inline-flex; align-items:center; gap:6px; border:none; border-radius:10px; padding:11px 20px; font-size:14px; font-weight:700; color:#fff; background:#1e3a5f; cursor:pointer; font-family:inherit; transition:background .15s; }
.em-open:hover { background:#16304f; }
.em-none { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#94a3b8; font-size:14px; padding:24px; text-align:center; }

@media (max-width: 900px) {
  .em-shell { grid-template-columns:1fr; height:auto; }
  .em-side { border-right:none; }
  .em-list { max-height:420px; }
  .em-panel { border-top:1px solid #e2e8f0; }
  .em-facts { grid-template-columns:1fr; }
  .em-hero { padding:22px 20px 50px; }
  .em-body { margin:-30px 14px 16px; }
}
@media (max-width: 600px) { .em-add { margin-left:0; width:100%; justify-content:center; } }
`;

export default function EmployeesPage({ user }) {
  const canManage = ["ADMIN", "VP", "OH", "CEO"].includes(user?.role);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [deptF, setDeptF] = useState("");
  const [statusF, setStatusF] = useState("active"); // active | exited | all
  const [previewId, setPreviewId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState(null); // set while the Add/Edit dialog is editing an existing record
  const canExit = ["ADMIN", "VP"].includes(user?.role);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitForm, setExitForm] = useState({ exitDate: "", exitType: "RESIGNED", exitReason: "" });
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [appUsers, setAppUsers] = useState([]);
  const BLANK = { fullName: "", doj: "", dob: "", gender: "", department: "", designation: "", personCode: "", linkedUsername: "" };
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await employeeApi.list();
      setEmployees(r.data?.data || []);
    } catch { setEmployees([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter(e => {
      if (statusF === "active" && isExitedEmp(e)) return false;
      if (statusF === "exited" && !isExitedEmp(e)) return false;
      if (deptF && e.department !== deptF) return false;
      if (s && !`${e.fullName} ${e.personCode || ""} ${e.designation || ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [employees, q, deptF, statusF]);

  // Grouped by department, people sorted by name within each group.
  const groups = useMemo(() => {
    const map = new Map();
    [...filtered].sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")).forEach(e => {
      const k = e.department || "No department";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    });
    return [...map.entries()].sort(([a], [b]) => (a === "No department") - (b === "No department") || a.localeCompare(b));
  }, [filtered]);

  // Keep the preview on a visible person: fall back to the first match when the filter hides the current one.
  const preview = filtered.find(e => e.id === previewId) || filtered[0] || null;

  const openAdd = () => {
    setForm(BLANK); setFormErr(""); setEditId(null); setAddOpen(true);
    usersApi.getAll().then(r => setAppUsers((r.data?.data || []).filter(u => !u.exited))).catch(() => setAppUsers([]));
  };
  // Logins not yet attached to an employee record.
  const freeUsers = useMemo(() => {
    const taken = new Set(employees.map(e => (e.linkedUsername || "").toLowerCase()).filter(Boolean));
    return appUsers.filter(u => !taken.has((u.username || "").toLowerCase()));
  }, [appUsers, employees]);

  const saveEmployee = async () => {
    if (!form.fullName.trim()) { setFormErr("Enter the employee's full name"); return; }
    if (!form.doj) { setFormErr("Enter the date of joining"); return; }
    setSaving(true); setFormErr("");
    try {
      if (editId) {
        const { linkedUsername, ...details } = form;
        await employeeApi.update(editId, details);
        setAddOpen(false); setEditId(null);
        await load();
      } else {
        const r = await employeeApi.create(form);
        setAddOpen(false);
        await load();
        const created = r.data?.data;
        if (created?.id) setSelectedId(created.id);
      }
    } catch (e) { setFormErr(e.response?.data?.message || "Could not add the employee"); }
    finally { setSaving(false); }
  };

  const openEdit = () => {
    setForm({
      fullName: preview.fullName || "", doj: preview.doj || "", dob: preview.dob || "", gender: preview.gender || "",
      department: preview.department || "", designation: preview.designation || "", personCode: preview.personCode || "", linkedUsername: "",
    });
    setFormErr(""); setEditId(preview.id); setAddOpen(true);
  };
  const openExit = () => {
    setExitForm({ exitDate: new Date().toISOString().slice(0, 10), exitType: "RESIGNED", exitReason: "" });
    setExitErr(""); setExitOpen(true);
  };
  const submitExit = async () => {
    if (!exitForm.exitDate) { setExitErr("Pick the last working day"); return; }
    setExitBusy(true); setExitErr("");
    try {
      await employeeApi.markExit(preview.id, { ...exitForm, markedBy: user?.fullName || user?.username });
      setExitOpen(false);
      await load();
    } catch (e) { setExitErr(e.response?.data?.message || "Could not move the employee to Exited"); }
    finally { setExitBusy(false); }
  };
  const reinstate = async () => {
    if (!window.confirm(`Reinstate ${preview.fullName}? They go back to the Active list${preview.linkedUsername ? " and their login is restored" : ""}.`)) return;
    try { await employeeApi.reinstate(preview.id); await load(); }
    catch (e) { alert(e.response?.data?.message || "Could not reinstate"); }
  };

  if (selectedId) {
    return <EmployeeProfilePage id={selectedId} user={user} onBack={() => { setSelectedId(null); load(); }} />;
  }

  const exitedPreview = preview ? isExitedEmp(preview) : false;
  const facts = preview ? [
    [Hash, "Person code", preview.personCode],
    [Building2, "Department", preview.department],
    [Briefcase, "Designation", preview.designation],
    [CalendarDays, "Date of joining", preview.doj ? fmtDate(preview.doj) : null],
    [Hourglass, "Tenure", tenure(preview)],
    [Cake, "Date of birth", preview.dob ? fmtDate(preview.dob) : null],
    ...(preview.dor ? [[CalendarDays, "Date of exit", fmtDate(preview.dor)]] : []),
    ...(preview.linkedUsername ? [[AtSign, "App login", "@" + preview.linkedUsername]] : []),
  ] : [];

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      <style>{EM_CSS}</style>

      <div className="em-head">
        <div>
          <div className="em-title">Employee Master</div>
          <div className="em-sub">Everyone who has worked at Happizo — pick a person to see their summary, open the profile for the full history.</div>
        </div>
        {canManage && <button className="em-add" onClick={openAdd}><Plus size={16} strokeWidth={2.5} /> Add Employee</button>}
      </div>

      <div className="em-shell">
        <div className="em-side">
          <div className="em-tools">
            <div className="em-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or designation" />
            </div>
            <div className="em-row2">
              <select className="em-select" value={deptF} onChange={(e) => setDeptF(e.target.value)}>
                <option value="">All departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="em-seg">
              {[["active", "Active"], ["exited", "Exited"], ["all", "All"]].map(([k, l]) => (
                <button key={k} className={statusF === k ? "on" : ""} onClick={() => setStatusF(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="em-count">{loading ? "Loading…" : `${filtered.length} of ${employees.length} employees`}</div>
          <div className="em-list">
            {!loading && filtered.length === 0 && <div className="em-none" style={{ height: 160 }}>No employees match your search.</div>}
            {groups.map(([dept, list]) => (
              <div key={dept}>
                <div className="em-grp"><span>{dept}</span><span>{list.length}</span></div>
                {list.map(e => (
                  <div key={e.id} className={`em-item ${preview?.id === e.id ? "sel" : ""} ${isExitedEmp(e) ? "exited" : ""}`}
                    onClick={() => setPreviewId(e.id)} onDoubleClick={() => setSelectedId(e.id)}>
                    <Avatar url={e.photoUrl} name={e.fullName} size={38} />
                    <div className="em-item-main">
                      <div className="em-item-name">{e.fullName}</div>
                      <div className="em-item-sub">{e.designation || "—"}</div>
                    </div>
                    <span className={`em-dot ${isExitedEmp(e) ? "exited" : "active"}`} title={isExitedEmp(e) ? "Exited" : "Active"} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="em-panel">
          {!preview ? (
            <div className="em-none">Select an employee to see their summary.</div>
          ) : (
            <>
              <div className="em-hero">
                <div className="em-hero-in">
                  <div className="em-hero-av"><Avatar url={preview.photoUrl} name={preview.fullName} size={88} /></div>
                  <div>
                    <div className="em-hero-name">{preview.fullName}</div>
                    <div className="em-hero-role">{preview.designation || "—"}{preview.department ? ` · ${preview.department}` : ""}</div>
                    <span className="em-badge"><i style={{ background: exitedPreview ? "#f87171" : "#4ade80" }} />{exitedPreview ? "Exited" : "Active"}</span>
                  </div>
                </div>
              </div>
              <div className="em-body">
                <div className="em-facts">
                  {facts.map(([Icon, l, v]) => (
                    <div className="em-fact" key={l}>
                      <div className="em-fact-ic"><Icon size={17} /></div>
                      <div><div className="em-fact-l">{l}</div><div className="em-fact-v">{v || "—"}</div></div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 22 }}>
                  <button className="em-open" style={{ marginTop: 0 }} onClick={() => setSelectedId(preview.id)}>Open full profile <ChevronRight size={16} /></button>
                  {canManage && (
                    <button className="em-open" style={{ marginTop: 0, background: "#fff", color: "#1e3a5f", border: "1px solid #cbd5e1" }} onClick={openEdit}>Edit details</button>
                  )}
                  {canExit && !exitedPreview && (
                    <button className="em-open" style={{ marginTop: 0, background: "#fff", color: "#b91c1c", border: "1px solid #fecaca" }} onClick={openExit}>Move to Exited</button>
                  )}
                  {canExit && exitedPreview && (
                    <button className="em-open" style={{ marginTop: 0, background: "#fff", color: "#047857", border: "1px solid #a7f3d0" }} onClick={reinstate}>Reinstate</button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {exitOpen && preview && (
        <div onClick={() => setExitOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Move to exited"
            style={{ background: "#fff", borderRadius: 16, width: 460, maxWidth: "100%", padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,.28)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Move to Exited — {preview.fullName}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              {preview.personCode || "No person code"}{preview.linkedUsername ? " · their app login will be blocked and any live session ended. Records they created stay." : " · no app login is linked."}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
                Last working day *
                <input type="date" value={exitForm.exitDate} onChange={e => setExitForm(f => ({ ...f, exitDate: e.target.value }))} style={inputS} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
                Exit type
                <select value={exitForm.exitType} onChange={e => setExitForm(f => ({ ...f, exitType: e.target.value }))} style={{ ...inputS, background: "#fff" }}>
                  {["RESIGNED", "TERMINATED", "ABSCONDED", "RETIRED", "OTHER"].map(t => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
                Reason (optional)
                <input value={exitForm.exitReason} onChange={e => setExitForm(f => ({ ...f, exitReason: e.target.value }))} style={inputS} />
              </label>
            </div>
            {exitErr && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginTop: 12 }}>{exitErr}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={() => setExitOpen(false)} style={{ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#374151", background: "#f1f5f9", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={submitExit} disabled={exitBusy} style={{ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#b91c1c", cursor: "pointer", fontFamily: "inherit", opacity: exitBusy ? 0.7 : 1 }}>
                {exitBusy ? "Moving…" : "Move to Exited"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div onClick={() => setAddOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Add employee"
            style={{ background: "#fff", borderRadius: 16, width: 560, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,.28)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>{editId ? "Edit Employee" : "Add Employee"}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>{editId ? "Update this employee's details. Changing the person code also updates their employee number everywhere." : "Onboard a new employee into the Employee Master. The person code is generated automatically."}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["fullName", "Full name *", "text", { full: true }],
                ["doj", "Date of joining *", "date"],
                ["dob", "Date of birth", "date"],
                ["gender", "Gender", "select", { options: ["", "M", "F", "Other"] }],
                ["personCode", editId ? "Person code" : "Person code (optional)", "text", { placeholder: "Auto, e.g. H-26-0055" }],
                ["department", "Department", "text", { list: "dept-list" }],
                ["designation", "Designation", "text"],
              ].map(([k, label, type, o = {}]) => (
                <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: o.full ? "1 / -1" : undefined, fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
                  {label}
                  {type === "select" ? (
                    <select value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ ...inputS, background: "#fff" }}>
                      {o.options.map(v => <option key={v} value={v}>{v || "—"}</option>)}
                    </select>
                  ) : (
                    <input type={type} value={form[k]} list={o.list} placeholder={o.placeholder} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={inputS} />
                  )}
                </label>
              ))}
              {!editId && <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1", fontSize: 12.5, fontWeight: 600, color: "#475569" }}>
                Link to app login (optional)
                <select value={form.linkedUsername} onChange={e => setForm(f => ({ ...f, linkedUsername: e.target.value }))} style={{ ...inputS, background: "#fff" }}>
                  <option value="">— None —</option>
                  {freeUsers.map(u => <option key={u.id} value={u.username}>{u.fullName} (@{u.username})</option>)}
                </select>
              </label>}
            </div>
            <datalist id="dept-list">{departments.map(d => <option key={d} value={d} />)}</datalist>
            {formErr && <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginTop: 12 }}>{formErr}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={() => setAddOpen(false)} style={{ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#374151", background: "#f1f5f9", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={saveEmployee} disabled={saving} style={{ border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#1e3a5f", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : editId ? "Save Changes" : "Add Employee"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
