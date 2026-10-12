import { useCallback, useEffect, useRef, useState } from "react";
import { companyDocApi, uploadDocument, attachmentFullUrl } from "./hrApi";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const th = { padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" };
const td = { padding: "12px 14px", fontSize: 14, borderBottom: "1px solid #eef2f7", color: "#0f172a" };
const btn = (bg, fg = "#fff") => ({ border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, color: fg, background: bg, cursor: "pointer", fontFamily: "inherit" });
const inputS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Each Happizo Info document tab is pinned to one fixed category — the upload
// form sets it automatically, so a document always lands under the tab it
// was uploaded from (no free-text category field for the uploader to miss).
export default function CompanyDocumentsPage({ user, category, title, icon, description }) {
  const canManage = ["ADMIN", "VP"].includes(user?.role);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ title: "" });
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await companyDocApi.list();
      setDocs(r.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = docs.filter((d) => (d.category || "").trim().toLowerCase() === category.toLowerCase());

  async function submitAdd(e) {
    e.preventDefault();
    if (!form.title.trim() || !file) return;
    setBusy("add");
    try {
      const fileUrl = await uploadDocument(file);
      await companyDocApi.add({
        title: form.title.trim(),
        category,
        fileUrl, fileName: file.name,
        uploadedBy: user?.fullName || user?.username,
      });
      setForm({ title: "" });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      alert(err.response?.data?.message || "Could not upload document");
    } finally { setBusy(null); }
  }

  async function remove(d) {
    if (!window.confirm(`Remove "${d.title}"?`)) return;
    setBusy(d.id);
    try {
      await companyDocApi.delete(d.id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || "Could not remove document");
    } finally { setBusy(null); }
  }

  return (
    <div className="hr-page" style={{ padding: "24px 32px" }}>
      {/* Hero */}
      <div className="hr-hero" style={{ ...card, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, borderLeft: "4px solid #0369a1" }}>
        <div className="hr-hero-icon" style={{ width: 46, height: 46, borderRadius: 12, background: "#e0f2fe", color: "#0369a1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{title}</div>
          <div style={{ fontSize: 13.5, color: "#64748b", marginTop: 2 }}>{description}</div>
        </div>
      </div>

      {canManage && (
        <form onSubmit={submitAdd} className="hr-form-grid" style={{ ...card, padding: "16px 18px", marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 5 }}>Title</label>
            <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={`e.g. ${title} document`} style={{ ...inputS, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 5 }}>File</label>
            <input ref={fileInputRef} required type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ ...inputS, width: "100%" }} />
          </div>
          <button type="submit" disabled={busy === "add"} style={btn("#1e3a5f")}>{busy === "add" ? "Uploading…" : "Upload"}</button>
        </form>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", fontSize: 15, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #eef2f7" }}>
          {title} <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {filtered.length}</span>
        </div>
        <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>S.No</th>
                <th style={th}>Title</th>
                <th style={th}>Uploaded</th>
                <th style={th}></th>
                {canManage && <th style={{ ...th, textAlign: "right" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={canManage ? 5 : 4}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td style={{ ...td, color: "#94a3b8" }} colSpan={canManage ? 5 : 4}>No documents uploaded yet.</td></tr>
              ) : filtered.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ ...td, color: "#475569" }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{d.title}</td>
                  <td style={td}>{fmtDate(d.uploadedAt)}</td>
                  <td style={td}>
                    <a href={attachmentFullUrl(d.fileUrl)} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontWeight: 700, textDecoration: "none" }}>
                      📄 View
                    </a>
                  </td>
                  {canManage && (
                    <td style={{ ...td, textAlign: "right" }}>
                      <button disabled={busy === d.id} onClick={() => remove(d)} style={btn("#fee2e2", "#b91c1c")}>
                        {busy === d.id ? "Removing…" : "Remove"}
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
