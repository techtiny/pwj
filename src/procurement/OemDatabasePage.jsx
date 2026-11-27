import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { Plus, Download, Pencil, Trash2, Check, X } from "lucide-react";

// Procurement → OEM Database (tab next to Vendors): brand / manufacturer contacts by category and item.
const BASE = import.meta.env.VITE_API_BASE_URL ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/oem` : "/api/v1/oem";
const oemApi = {
  list:   ()         => axios.get(BASE),
  create: (data)     => axios.post(BASE, data),
  update: (id, data) => axios.put(`${BASE}/${id}`, data),
  remove: (id)       => axios.delete(`${BASE}/${id}`),
};

const FIELDS = [
  ["category", "Category", 150],
  ["item", "Item", 200],
  ["brand", "Brand", 150],
  ["contactPerson", "Contact Person Name", 180],
  ["designation", "Designation", 150],
  ["contactNumber", "Contact Number", 150],
  ["contactEmail", "Contact Email ID", 230],
];
const CATEGORIES = ["Carpentry material", "Ceiling & Partition", "Hardwares", "Electricals", "Appliances", "Emulsion", "AC", "Plumbing", "Adhesives", "Flooring", "Civil"];
const GRID_COLS = [60, ...FIELDS.map(f => f[2]), 90];
const GRID_W = GRID_COLS.reduce((a, b) => a + b, 0);
const EMPTY = Object.fromEntries(FIELDS.map(([k]) => [k, ""]));

const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" });
const ghost = { ...btn("#fff", "#1e3a5f"), border: "1px solid #cbd5e1" };
const iconBtn = (color) => ({ border: "1px solid #e2e8f0", background: "#fff", color, borderRadius: 6, padding: "5px 7px", cursor: "pointer", display: "inline-flex", alignItems: "center", fontFamily: "inherit" });
const gth = { padding: "10px 12px", fontSize: "var(--hz-text-sm)", fontWeight: 700, color: "var(--hz-ink)", whiteSpace: "nowrap", textAlign: "center" };
const gtd = { padding: "10px 12px", fontSize: "var(--hz-text-md)", color: "var(--hz-ink)", verticalAlign: "middle", wordBreak: "break-word" };
const cellIn = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 8px", fontSize: "var(--hz-text-sm)", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };

export default function OemDatabasePage({ user, canManage = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [fCat, setFCat] = useState("");
  const [fItem, setFItem] = useState("");
  const [fBrand, setFBrand] = useState("");
  const [draft, setDraft] = useState(null);   // new row being typed
  const [edit, setEdit] = useState(null);     // { id, ...fields }
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await oemApi.list(); setRows(r.data?.data || []); setErr(""); }
    catch (e) { setErr(e.response?.data?.message || "Could not load the OEM database"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => (!fCat || r.category === fCat) && (!fItem || r.item === fItem) && (!fBrand || r.brand === fBrand)
      && (!q || FIELDS.some(([k]) => String(r[k] || "").toLowerCase().includes(q))));
  }, [rows, search, fCat, fItem, fBrand]);
  // Item / Brand choices narrow to what the other filters leave
  const uniq = (list, k) => [...new Set(list.map(r => r[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const catOpts = [...new Set([...CATEGORIES, ...uniq(rows, "category")])];
  const itemOpts = uniq(rows.filter(r => (!fCat || r.category === fCat) && (!fBrand || r.brand === fBrand)), "item");
  const brandOpts = uniq(rows.filter(r => (!fCat || r.category === fCat) && (!fItem || r.item === fItem)), "brand");
  const filtered = !!(search || fCat || fItem || fBrand);

  const save = async (data, id) => {
    setBusy(true);
    try {
      const body = { ...data, username: user?.username };
      if (id) { const r = await oemApi.update(id, body); setRows(x => x.map(o => o.id === id ? r.data.data : o)); setEdit(null); }
      else { const r = await oemApi.create(body); setRows(x => [...x, r.data.data]); setDraft(null); }
      setErr("");
    } catch (e) { setErr(e.response?.data?.message || "Save failed"); }
    finally { setBusy(false); }
  };
  const del = async (r) => {
    if (!window.confirm(`Delete ${r.brand || r.item || "this OEM contact"}?`)) return;
    try { await oemApi.remove(r.id); setRows(x => x.filter(o => o.id !== r.id)); }
    catch (e) { setErr(e.response?.data?.message || "Delete failed"); }
  };

  const exportExcel = () => {
    const aoa = [["S.No", ...FIELDS.map(f => f[1])], ...shown.map((r, i) => [i + 1, ...FIELDS.map(([k]) => r[k] || "")])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, ...FIELDS.map(f => ({ wch: Math.round(f[2] / 7) }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OEM Database");
    XLSX.writeFile(wb, "oem-database.xlsx");
  };

  const inputRow = (val, setVal, onSave, onCancel, key, sno) => (
    <tr key={key} style={{ background: "#f8fafc" }}>
      <td style={{ ...gtd, textAlign: "center" }}>{sno}</td>
      {FIELDS.map(([k, label], i) => (
        <td key={k} style={{ ...gtd, padding: "6px 8px" }}>
          {k === "category" ? (
            <select value={val[k] || ""} autoFocus style={cellIn} onChange={e => setVal(v => ({ ...v, category: e.target.value }))}
              onKeyDown={e => { if (e.key === "Escape") onCancel(); }}>
              <option value="">Select…</option>
              {[...CATEGORIES, ...(val[k] && !CATEGORIES.includes(val[k]) ? [val[k]] : [])].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : <input value={val[k] || ""} placeholder={label} autoFocus={i === 0} style={cellIn}
            type={k === "contactEmail" ? "email" : k === "contactNumber" ? "tel" : "text"}
            onChange={e => setVal(v => ({ ...v, [k]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />}
        </td>
      ))}
      <td style={{ ...gtd, textAlign: "center", whiteSpace: "nowrap" }}>
        <button style={{ ...iconBtn("#15803d"), marginRight: 4 }} disabled={busy} onClick={onSave} title="Save"><Check size={14} /></button>
        <button style={iconBtn("#64748b")} onClick={onCancel} title="Cancel"><X size={14} /></button>
      </td>
    </tr>
  );

  return (
    <div style={{ padding: "24px 36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, width: GRID_W, maxWidth: "100%" }}>
        <div style={{ fontWeight: 800, color: "var(--hz-ink)", fontSize: "var(--hz-text-xl, 20px)" }}>OEM Database</div>
        <span style={{ fontWeight: 500, color: "var(--hz-ink-2)", fontSize: "var(--hz-text-md)" }}>{shown.length} of {rows.length}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search category, item, brand, contact…"
          style={{ ...cellIn, width: 300, marginLeft: "auto", padding: "8px 10px" }} />
        <button style={{ ...ghost, padding: "6px 12px" }} onClick={exportExcel} disabled={!shown.length}><Download size={14} /> Excel</button>
        {canManage && (
          <button title="Add OEM" disabled={!!draft} onClick={() => { setEdit(null); setDraft({ ...EMPTY }); }}
            style={{ ...btn("var(--hz-primary)"), padding: 0, width: 34, height: 34, justifyContent: "center", opacity: draft ? 0.5 : 1, cursor: draft ? "default" : "pointer" }}>
            <Plus size={18} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, width: GRID_W, maxWidth: "100%", flexWrap: "wrap" }}>
        {[["Category", fCat, setFCat, catOpts], ["Item", fItem, setFItem, itemOpts], ["Brand", fBrand, setFBrand, brandOpts]].map(([label, v, setV, opts]) => (
          <select key={label} value={v} onChange={e => setV(e.target.value)}
            style={{ ...cellIn, width: 200, padding: "8px 10px", background: v ? "#eef3fa" : "#fff", fontWeight: v ? 700 : 400 }}>
            <option value="">All {label === "Category" ? "Categories" : label + "s"}</option>
            {[...opts, ...(v && !opts.includes(v) ? [v] : [])].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {filtered && <button style={{ ...ghost, padding: "6px 12px" }} onClick={() => { setSearch(""); setFCat(""); setFItem(""); setFBrand(""); }}><X size={14} /> Clear Filters</button>}
      </div>

      {err && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10, color: "#b91c1c", marginBottom: 12, width: GRID_W, maxWidth: "100%", boxSizing: "border-box" }}>{err}</div>}

      {loading ? <div style={{ color: "var(--hz-muted)", padding: 20 }}>Loading…</div> : (
        <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
          <table className="fund-grid" style={{ width: GRID_W, borderCollapse: "collapse", tableLayout: "fixed", background: "#fff" }}>
            <colgroup>{GRID_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead><tr>
              <th style={gth}>S.No</th>
              {FIELDS.map(([k, label]) => <th key={k} style={gth}>{label}</th>)}
              <th style={gth} />
            </tr></thead>
            <tbody>
              {shown.map((r, i) => edit && edit.id === r.id
                ? inputRow(edit, setEdit, () => save(edit, r.id), () => setEdit(null), r.id, i + 1)
                : (
                  <tr key={r.id}>
                    <td style={{ ...gtd, textAlign: "center" }}>{i + 1}</td>
                    {FIELDS.map(([k]) => (
                      <td key={k} style={gtd}>
                        {k === "contactEmail" && r[k] ? <a href={`mailto:${r[k]}`} style={{ color: "#1d4ed8" }}>{r[k]}</a>
                          : k === "contactNumber" && r[k] ? <a href={`tel:${r[k]}`} style={{ color: "inherit", textDecoration: "none" }}>{r[k]}</a>
                          : (r[k] || "")}
                      </td>
                    ))}
                    <td style={{ ...gtd, textAlign: "center", whiteSpace: "nowrap" }}>
                      {canManage && <>
                        <button style={{ ...iconBtn("#1e3a5f"), marginRight: 4 }} title="Edit" onClick={() => { setDraft(null); setEdit({ ...r }); }}><Pencil size={14} /></button>
                        <button style={iconBtn("#dc2626")} title="Delete" onClick={() => del(r)}><Trash2 size={14} /></button>
                      </>}
                    </td>
                  </tr>
                ))}
              {draft && inputRow(draft, setDraft, () => save(draft), () => setDraft(null), "draft", shown.length + 1)}
              {!shown.length && !draft && (
                <tr><td colSpan={GRID_COLS.length} style={{ ...gtd, textAlign: "center", color: "var(--hz-muted)", padding: 24 }}>
                  {rows.length ? "No match." : "No OEMs yet — use + to add one."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
