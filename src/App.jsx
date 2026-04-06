import { useState, useEffect, useCallback, useMemo } from "react";

// ── OCR via ocr.space free API (no worker, no installation) ────────
async function ocrExtractBankFields(imageFile, onProgress) {
  if (onProgress) onProgress(20);

  const form = new FormData();
  form.append("file",       imageFile);
  form.append("apikey",     "K85821541288957");   // free demo key
  form.append("language",   "eng");
  form.append("OCREngine",  "2");                 // engine 2 = better for printed text
  form.append("scale",      "true");
  form.append("detectOrientation", "true");
  form.append("isOverlayRequired", "false");

  const res  = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  if (onProgress) onProgress(80);
  const json = await res.json();
  if (onProgress) onProgress(100);

  console.log("[OCR] full response:", JSON.stringify(json));

  // Check for API-level errors (rate limit, invalid key, etc.)
  if (json?.IsErroredOnProcessing) {
    const errMsg = json?.ErrorMessage?.[0] || json?.ErrorDetails || "OCR processing error";
    throw new Error(errMsg);
  }
  if (!json?.ParsedResults || json.ParsedResults.length === 0) {
    throw new Error("No results from OCR service — image may be too small or unclear");
  }

  const text = json.ParsedResults[0]?.ParsedText || "";
  console.log("[OCR] raw text:\n", text);

  const t = text;

  // ── Bank Name ──────────────────────────────────────────────────────
  const knownBanks = [
    "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank",
    "Canara Bank", "Bank of Baroda", "Punjab National Bank",
    "Union Bank of India", "Kotak Mahindra Bank", "Indian Bank",
    "Bank of India", "Central Bank of India", "Indian Overseas Bank",
    "UCO Bank", "Yes Bank", "Bandhan Bank", "Federal Bank",
    "South Indian Bank", "Karur Vysya Bank", "City Union Bank",
  ];
  let bankName = "";
  for (const b of knownBanks) {
    if (new RegExp(b.replace(/\s+/g, "\\s*"), "i").test(t)) { bankName = b; break; }
  }
  if (!bankName && /\bSBI\b/i.test(t))  bankName = "State Bank of India";
  if (!bankName && /\bPNB\b/i.test(t))  bankName = "Punjab National Bank";
  if (!bankName) {
    const line = t.split("\n").map(l => l.trim())
      .find(l => /bank|savings|cooperative/i.test(l) && l.length > 4 && l.length < 80);
    if (line) bankName = line.replace(/[^A-Za-z0-9\s\-&.,]/g, "").trim();
  }
  const branchM = t.match(/([A-Za-z][A-Za-z\s]{2,25}?)\s+[Bb]ranch/);
  if (branchM) {
    const br = branchM[1].trim();
    if (bankName && br.length > 2 && !bankName.toLowerCase().includes(br.toLowerCase()))
      bankName += ` - ${br} Branch`;
    else if (!bankName) bankName = `${br} Branch`;
  }

  // ── Account Number ────────────────────────────────────────────────
  let accountNumber = "";
  for (const re of [
    /[Aa]ccount\s*(?:[Nn]o|[Nn]umber|[Nn]o\.?)[.:\s)\-#]*(\d{9,18})/,
    /[Aa]\/[Cc]\.?\s*[Nn]o\.?[.:\s)\-#]*(\d{9,18})/,
    /[Aa]cct\.?\s*[Nn]o\.?[.:\s)\-#]*(\d{9,18})/,
    /[Ss]avings\s*[Aa]ccount[^0-9]*(\d{9,18})/,
    /\b(\d{11,18})\b/,
  ]) {
    const m = t.match(re);
    if (m?.[1]) { accountNumber = m[1]; break; }
  }

  // ── IFSC Code ────────────────────────────────────────────────────
  let ifscCode = "";
  for (const re of [
    /IFSC\s*[:\s]\s*([A-Za-z]{4}0[A-Za-z0-9]{6})/i,
    /IFSC\s*[:\s]\s*([A-Za-z0-9]{8,11})/i,
    /\b([A-Z]{4}0[A-Z0-9]{6})\b/,
    /\b([A-Z]{4}0[A-Z0-9]{3,6})\b/,
  ]) {
    const m = t.match(re);
    if (m?.[1]) { ifscCode = m[1].toUpperCase().trim(); break; }
  }

  const bankDetails = [
    bankName,
    accountNumber && `A/c No: ${accountNumber}`,
    ifscCode      && `IFSC: ${ifscCode}`,
  ].filter(Boolean).join(" | ");

  return { bankName, accountNumber, ifscCode, bankDetails };
}

// ─── API CONFIG ────────────────────────────────────────────────────
const API_BASE     = "http://192.168.1.16:8080/api/v1/pwj";
const VENDOR_BASE  = "http://192.168.1.16:8080/api/v1/vendors";
const AUTH_BASE    = "http://192.168.1.16:8080/api/v1/auth";

const api = {
  login: (body) =>
    fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  getEntries: (params) => {
    const q = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/entries?${q}`).then(r => r.json());
  },
  getMyEntries: (raisedBy, params) => {
    const q = new URLSearchParams({ ...params, raisedBy }).toString();
    return fetch(`${API_BASE}/entries/my?${q}`).then(r => r.json());
  },
  getProjects: () => fetch(`${API_BASE}/projects`).then(r => r.json()),
  getPending: () => fetch(`${API_BASE}/pending-approvals`).then(r => r.json()),
  updateApproval: (id, body) =>
    fetch(`${API_BASE}/entries/${id}/approval`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  procurementUpdate: (id, body) =>
    fetch(`${API_BASE}/entries/${id}/procurement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  getApprovedVendors: () => fetch(`${VENDOR_BASE}`).then(r => r.json()),
  createEntry: (body) =>
    fetch(`${API_BASE}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  deleteEntry: (id) =>
    fetch(`${API_BASE}/entries/${id}`, { method: "DELETE" }).then(r => r.json()),
  getAllEntries: (params) => {
    const q = new URLSearchParams({ ...params, size: 9999, page: 0 }).toString();
    return fetch(`${API_BASE}/entries?${q}`).then(r => r.json());
  },
  uploadImage: (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("http://192.168.1.16:8080/api/v1/upload/image", { method: "POST", body: form }).then(r => r.json());
  },
  createVendor: (body) =>
    fetch(VENDOR_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  getPendingVendors: () => fetch(`${VENDOR_BASE}/pending`).then(r => r.json()),
  getAllVendorsWithStatus: () => fetch(`${VENDOR_BASE}/all`).then(r => r.json()),
  approveVendor: (id) => fetch(`${VENDOR_BASE}/${id}/approve`, { method: "PUT" }).then(r => r.json()),
  rejectVendor: (id) => fetch(`${VENDOR_BASE}/${id}/reject`, { method: "PUT" }).then(r => r.json()),
  getUsers: () => fetch(`${AUTH_BASE.replace("/auth", "/users")}`).then(r => r.json()),
  createUser: (body) => fetch(`${AUTH_BASE.replace("/auth", "/users")}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(r => r.json()),
  deactivateUser: (id) => fetch(`${AUTH_BASE.replace("/auth", "/users")}/${id}`, { method: "DELETE" }).then(r => r.json()),
  getVendorByName: (name) => fetch(`${VENDOR_BASE}/by-name?name=${encodeURIComponent(name)}`).then(r => r.json()),
  submitDoc: (id) => fetch(`${API_BASE}/entries/${id}/submit-doc`, { method: "PATCH" }).then(r => r.json()),
  approveDoc: (id, comment) => fetch(`${API_BASE}/entries/${id}/doc-approve`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: comment || "" }) }).then(r => r.json()),
  rejectDoc: (id, comment) => fetch(`${API_BASE}/entries/${id}/doc-reject`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: comment || "" }) }).then(r => r.json()),
  getPendingDocApprovals: () => fetch(`${API_BASE}/pending-doc-approvals`).then(r => r.json()),
  uploadDocument: (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("http://192.168.1.16:8080/api/v1/upload/document", { method: "POST", body: form }).then(r => r.json());
  },
  deliveryUpdate: (id, body) =>
    fetch(`${API_BASE}/entries/${id}/delivery`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
};

// ─── ROLE HELPERS ──────────────────────────────────────────────────
const ROLE_META = {
  ADMIN:       { label: "Admin",       color: "#7c3aed", bg: "#ede9fe" },
  ENGINEER:    { label: "Engineer",    color: "#0369a1", bg: "#e0f2fe" },
  PROCUREMENT: { label: "Procurement", color: "#065f46", bg: "#d1fae5" },
  VP:          { label: "VP",          color: "#b45309", bg: "#fef3c7" },
};

// ─── LOGIN PAGE ────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [form, setForm]     = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) { setError("Enter username and password"); return; }
    setLoading(true); setError(null);
    try {
      const res = await api.login(form);
      if (res.success) { onLogin(res.data); }
      else { setError(res.message || "Invalid credentials"); }
    } catch { setError("Cannot connect to server. Make sure backend is running."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f4c81,#1a6ab1,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: "44px 40px", width: "100%", maxWidth: 400, boxShadow: "0 32px 80px rgba(15,76,129,.3)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="https://happizo.com/assets/myimages/logo.png" alt="Happizo" style={{ height: 48, objectFit: "contain", marginBottom: 16 }} />
          <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>PWJ Tracker</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Purchase Work Journal · Sign in to continue</div>
        </div>
        <form onSubmit={submit}>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          {[["Username", "username", "text"], ["Password", "password", "password"]].map(([lbl, key, type]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>{lbl}</label>
              <input type={type} placeholder={lbl} value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}
          <button type="submit" disabled={loading}
            style={{ width: "100%", background: "linear-gradient(135deg,#0f4c81,#0ea5e9)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── CONSTANTS ────────────────────────────────────────────────────
const APPROVAL_META = {
  PROCEED:      { label: "Proceed",      bg: "#dbeafe", color: "#1d4ed8", dot: "#3b82f6" },
  HOLD:         { label: "Hold",         bg: "#fef3c7", color: "#d97706", dot: "#f59e0b" },
  NOT_APPROVED: { label: "Not Approved", bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
};
const STATUS_META = {
  CLOSED: { bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
  OPEN:   { bg: "#fef9c3", color: "#b45309", dot: "#f59e0b" },
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&display=swap');`;

// ─── MAIN COMPONENT ────────────────────────────────────────────────
export default function PWJTracker() {
  // ── Session ──
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pwj_user")); } catch { return null; }
  });

  const handleLogin = (userData) => {
    localStorage.setItem("pwj_user", JSON.stringify(userData));
    setUser(userData);
  };
  const handleLogout = () => {
    localStorage.removeItem("pwj_user");
    setUser(null);
  };

  const isAdmin       = user?.role === "ADMIN";
  const isProcurement = user?.role === "PROCUREMENT";
  const isEngineer    = user?.role === "ENGINEER";
  const isVP          = user?.role === "VP";

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const roleMeta = ROLE_META[user.role] || ROLE_META.ENGINEER;

  const [entries, setEntries]         = useState([]);
  const [stats, setStats]             = useState({});
  const [projects, setProjects]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [totalElements, setTotal]     = useState(0);
  const [totalPages, setTotalPages]   = useState(1);

  // Filters
  const [search, setSearch]           = useState("");
  const [statusF, setStatusF]         = useState("ALL");
  const [approvalF, setApprovalF]     = useState("ALL");
  const [projectF, setProjectF]       = useState("");
  const [page, setPage]               = useState(0);
  const [sortBy, setSortBy]           = useState("id");
  const [sortDir, setSortDir]         = useState("asc");
  const PAGE_SIZE = 15;

  const [mainTab, setMainTab] = useState("entries");

  // Modals
  const [detailRow, setDetailRow]         = useState(null);
  const [approvalModal, setApprovalModal] = useState(null); // { entry }
  const [createModal, setCreateModal]     = useState(false);
  const [pendingModal, setPendingModal]   = useState(false);
  const [pendingList, setPendingList]     = useState([]);
  const [toast, setToast]                 = useState(null);

  // Approval form
  const [approvalForm, setApprovalForm] = useState({ approvalStatus: "PROCEED", comment: "", approvedBy: "" });
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({ raisedBy: "", projectName: "", boqNo: "", materialRequired: "", specification: "", brand: "", unit: "", quantity: "", vendor: "", pwjType: "", approvalStatus: "PROCEED", status: "OPEN" });

  // VP vendor approvals
  const [vpPendingModal, setVpPendingModal] = useState(false);
  const [allVendorsStatus, setAllVendorsStatus] = useState([]);
  const [viewVendor, setViewVendor]             = useState(null);
  const [vpLoading, setVpLoading]               = useState(false);
  const [vendorStatusTab, setVendorStatusTab]   = useState("ALL");

  // Vendor modal
  const [vendorModal, setVendorModal]     = useState(false);
  const [vendorForm, setVendorForm]       = useState({
    name: "", gstNumber: "", ratings: 0, contactPerson: "", phoneNumber: "", email: "", category: "", tags: "",
    vendorCode: "", website: "", currency: "INR", language: "", country: "India", state: "", city: "", zipCode: "", street: "",
    bankName: "", accountNumber: "", ifscCode: "", bankDetails: "", paymentDetails: "", deliveryTerms: "", joiningDate: "",
    sameAddressForBillingShipping: false,
    contacts: [],
    maximumReturnDays: "", returnFees: "", listVendorPolicies: "", vendorPaysReturnShipping: false,
  });
  const [vendorSec, setVendorSec]         = useState({ details: true, profile: true, contacts: true, bank: true, policies: true });
  const [vendorDocFile, setVendorDocFile] = useState(null);
  const [vendorDocPreview, setVendorDocPreview] = useState(null);
  const [vendorOcrLoading, setVendorOcrLoading] = useState(false);
  const [vendorOcrProgress, setVendorOcrProgress] = useState(0);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [assignModal, setAssignModal]     = useState(null);  // holds the PWJ row being edited
  const [assignForm, setAssignForm]       = useState({ vendor: "", pwjType: "" });
  const [approvedVendors, setApprovedVendors] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [userMgmtModal, setUserMgmtModal] = useState(false);
  const [allUsers, setAllUsers]           = useState([]);
  const [userMgmtLoading, setUserMgmtLoading] = useState(false);
  const [newUserForm, setNewUserForm]     = useState({ username: "", password: "", fullName: "", email: "", role: "ENGINEER" });
  const [docModal, setDocModal]           = useState(null);   // { entry, vendor }
  const [docLoading, setDocLoading]       = useState(false);
  const [pendingDocs, setPendingDocs]     = useState([]);
  const [pendingDocsModal, setPendingDocsModal] = useState(false);
  const [pendingDocsLoading, setPendingDocsLoading] = useState(false);
  const [vpCommentMap, setVpCommentMap]         = useState({});  // docId → comment text
  const [engDocFile, setEngDocFile]       = useState(null);
  const [engDocUploading, setEngDocUploading] = useState(false);

  // ── Fetch data ──
  const fetchEntries = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = { page, size: PAGE_SIZE, sortBy, sortDir };
      if (search)              params.search      = search;
      if (statusF !== "ALL")   params.status      = statusF;
      if (approvalF !== "ALL") params.approval    = approvalF;
      if (projectF)            params.projectName = projectF;

      const res = isEngineer
        ? await api.getMyEntries(user.username, { page, size: PAGE_SIZE, sortBy, sortDir })
        : await api.getEntries(params);

      if (res.success) {
        const d = res.data;
        setEntries(d.content);
        setTotal(d.totalElements);
        setTotalPages(d.totalPages);
        setStats({ total: d.totalElements, closed: d.totalClosed, open: d.totalOpen, proceed: d.totalProceed, hold: d.totalHold, notApproved: d.totalNotApproved });
      } else { setError(res.message); }
    } catch { setError("Cannot connect to backend. Make sure Spring Boot is running on port 8080."); }
    finally { setLoading(false); }
  }, [page, search, statusF, approvalF, projectF, sortBy, sortDir, isEngineer, user]);

  const fetchProjects = useCallback(async () => {
    try { const r = await api.getProjects(); if (r.success) setProjects(r.data); } catch {}
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Auto-refresh entries when user returns to this tab (catches VP approval from another session)
  useEffect(() => {
    const onFocus = () => fetchEntries();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchEntries]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); fetchEntries(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  // ── Approval submit ──
  const submitApproval = async () => {
    if (!approvalForm.approvedBy.trim()) { showToast("Please enter approver name", "error"); return; }
    setApprovalLoading(true);
    try {
      const res = await api.updateApproval(approvalModal.entry.id, approvalForm);
      if (res.success) {
        showToast(`Entry #${approvalModal.entry.id} updated to ${res.data.approvalStatus}`);
        setApprovalModal(null);
        fetchEntries();
      } else { showToast(res.message, "error"); }
    } catch { showToast("Failed to update approval", "error"); }
    finally { setApprovalLoading(false); }
  };

  // ── Create submit ──
  const submitCreate = async () => {
    if (!createForm.raisedBy || !createForm.projectName || !createForm.materialRequired) {
      showToast("Fill required fields", "error"); return;
    }
    try {
      const res = await api.createEntry({ ...createForm, quantity: createForm.quantity ? parseFloat(createForm.quantity) : null });
      if (res.success) { showToast("Entry created!"); setCreateModal(false); fetchEntries(); }
      else showToast(res.message, "error");
    } catch { showToast("Create failed", "error"); }
  };

  // ── Export CSV ──
  const exportCSV = async () => {
    showToast("Preparing export…");
    try {
      const params = {};
      if (search)            params.search      = search;
      if (statusF !== "ALL") params.status      = statusF;
      if (approvalF !== "ALL") params.approval  = approvalF;
      if (projectF)          params.projectName = projectF;

      const res = await api.getAllEntries(params);
      if (!res.success) { showToast("Export failed", "error"); return; }

      const rows = res.data.content;
      const headers = ["ID","Date","Raised By","Project","BOQ No","Material","Specification","Brand","Unit","Quantity","Date of Requirement","Vendor","PWJ Issued","Approval Status","Status","Delivered Date","Remarks","Approved By","Approved At","Approval Comment"];
      const escape  = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        headers.join(","),
        ...rows.map(r => [
          r.id, r.timestamp?.substring(0,16), r.raisedBy, r.projectName,
          r.boqNo, r.materialRequired, r.specification, r.brand, r.unit,
          r.quantity, r.dateOfRequirement, r.vendor,
          r.pwjIssued ? "Yes" : "No", r.approvalStatus, r.status,
          r.deliveredDate, r.remarks, r.approvedBy,
          r.approvedAt?.substring(0,16), r.approvalComment,
        ].map(escape).join(","))
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `pwj-export-${new Date().toISOString().substring(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${rows.length} entries`);
    } catch { showToast("Export failed", "error"); }
  };

  // ── Auto-sync combined bankDetails whenever individual fields change ──
  useEffect(() => {
    if (!vendorModal) return;
    const { bankName, accountNumber, ifscCode } = vendorForm;
    if (!bankName && !accountNumber && !ifscCode) return;
    const combined = [
      bankName,
      accountNumber && `A/c No: ${accountNumber}`,
      ifscCode      && `IFSC: ${ifscCode}`,
    ].filter(Boolean).join(" | ");
    setVendorForm(f => ({ ...f, bankDetails: combined }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorForm.bankName, vendorForm.accountNumber, vendorForm.ifscCode, vendorModal]);

  // ── Run OCR on a file (shared by auto-trigger and re-process button) ──
  const runVendorOcr = async (file) => {
    if (!file) return;
    setVendorOcrLoading(true);
    setVendorOcrProgress(0);
    try {
      const extracted = await ocrExtractBankFields(file, (pct) => setVendorOcrProgress(pct));
      const hasData = extracted.bankName || extracted.accountNumber || extracted.ifscCode;
      console.log("[OCR] extracted fields:", extracted);
      setVendorForm(f => ({
        ...f,
        bankName:      extracted.bankName      || f.bankName,
        accountNumber: extracted.accountNumber || f.accountNumber,
        ifscCode:      extracted.ifscCode      || f.ifscCode,
        bankDetails:   extracted.bankDetails   || f.bankDetails,
      }));
      if (hasData) {
        showToast("Bank details extracted ✅");
      } else {
        showToast("OCR ran but no bank fields found — check console or fill manually", "error");
      }
    } catch (err) {
      console.error("[OCR error]", err);
      const msg = err?.message || "";
      if (/rate|limit|quota|exceed/i.test(msg)) {
        showToast("OCR rate limit reached — try again in a minute", "error");
      } else if (/too large|file size/i.test(msg)) {
        showToast("Image too large — resize below 1MB and re-process", "error");
      } else {
        showToast(`OCR failed: ${msg || "fill fields manually"}`, "error");
      }
    } finally {
      setVendorOcrLoading(false);
      setVendorOcrProgress(0);
    }
  };

  // ── File picked → store + auto-run OCR ──
  const handleVendorDoc = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVendorDocFile(file);
    setVendorDocPreview(URL.createObjectURL(file));
    runVendorOcr(file);
  };

  // ── Create vendor ──
  const VENDOR_FORM_RESET = {
    name: "", gstNumber: "", ratings: 0, contactPerson: "", phoneNumber: "", email: "", category: "", tags: "",
    vendorCode: "", website: "", currency: "INR", language: "", country: "India", state: "", city: "", zipCode: "", street: "",
    bankName: "", accountNumber: "", ifscCode: "", bankDetails: "", paymentDetails: "", deliveryTerms: "", joiningDate: "",
    sameAddressForBillingShipping: false, contacts: [],
    maximumReturnDays: "", returnFees: "", listVendorPolicies: "", vendorPaysReturnShipping: false,
  };

  const submitVendor = async () => {
    if (!vendorForm.name.trim()) { showToast("Vendor name is required", "error"); return; }
    setVendorLoading(true);
    try {
      const f = vendorForm;
      const payload = {
        name: f.name.trim(),
        ...(f.gstNumber       && { gstNumber:       f.gstNumber.trim() }),
        ...(f.ratings         && { ratings:          f.ratings }),
        ...(f.contactPerson   && { contactPerson:    f.contactPerson.trim() }),
        ...(f.phoneNumber     && { phoneNumber:      f.phoneNumber.trim() }),
        ...(f.email           && { email:            f.email.trim() }),
        ...(f.category        && { category:         f.category.trim() }),
        ...(f.tags            && { tags:             f.tags.trim() }),
        ...(f.vendorCode      && { vendorCode:       f.vendorCode.trim() }),
        ...(f.website         && { website:          f.website.trim() }),
        ...(f.currency        && { currency:         f.currency }),
        ...(f.language        && { language:         f.language.trim() }),
        ...(f.country         && { country:          f.country.trim() }),
        ...(f.state           && { state:            f.state.trim() }),
        ...(f.city            && { city:             f.city.trim() }),
        ...(f.zipCode         && { zipCode:          f.zipCode.trim() }),
        ...(f.street          && { street:           f.street.trim() }),
        ...(f.bankName        && { bankName:         f.bankName.trim() }),
        ...(f.accountNumber   && { accountNumber:    f.accountNumber.trim() }),
        ...(f.ifscCode        && { ifscCode:         f.ifscCode.trim() }),
        ...(f.bankDetails     && { bankDetails:      f.bankDetails.trim() }),
        ...(f.paymentDetails  && { paymentDetails:   f.paymentDetails.trim() }),
        ...(f.deliveryTerms   && { deliveryTerms:    f.deliveryTerms.trim() }),
        ...(f.joiningDate     && { joiningDate:      f.joiningDate }),
        sameAddressForBillingShipping: f.sameAddressForBillingShipping,
        ...(f.contacts.length && { contacts:         f.contacts.filter(c => c.personName || c.contactNumber) }),
        ...(f.maximumReturnDays && { maximumReturnDays: f.maximumReturnDays }),
        ...(f.returnFees      && { returnFees:       f.returnFees.trim() }),
        ...(f.listVendorPolicies && { listVendorPolicies: f.listVendorPolicies.trim() }),
        vendorPaysReturnShipping: f.vendorPaysReturnShipping,
      };
      const res = await api.createVendor(payload);
      if (res.success) {
        showToast(`Vendor "${res.data.name}" added — pending VP approval`);
        setVendorModal(false);
        setVendorForm(VENDOR_FORM_RESET);
        setVendorSec({ details: true, profile: true, contacts: true, bank: true, policies: true });
        setVendorDocFile(null);
        setVendorDocPreview(null);
        setAllVendorsStatus([]);
        if (mainTab === "vendors") { setVpLoading(true); api.getAllVendorsWithStatus().then(r => { if (r.success) setAllVendorsStatus(r.data); }).finally(() => setVpLoading(false)); }
      } else { showToast(res.message, "error"); }
    } catch { showToast("Failed to add vendor", "error"); }
    finally { setVendorLoading(false); }
  };

  // ── Load vendors for Vendors tab ──
  const loadVendorsTab = async () => {
    if (allVendorsStatus.length === 0 || mainTab !== "vendors") {
      setVpLoading(true);
      try {
        const r = await api.getAllVendorsWithStatus();
        if (r.success) setAllVendorsStatus(r.data);
      } catch {}
      finally { setVpLoading(false); }
    }
  };

  // ── VP vendor approvals ──

  // ── Assign Vendor / PWJ Type ──
  const openAssign = async (row) => {
    setAssignForm({ vendor: row.vendor || "", pwjType: row.pwjType || "" });
    setAssignModal(row);
    if (approvedVendors.length === 0) {
      try {
        const r = await api.getApprovedVendors();
        if (r.success) setApprovedVendors(r.data);
      } catch {}
    }
  };

  const submitAssign = async () => {
    if (!assignModal) return;
    setAssignLoading(true);
    try {
      const r = await api.procurementUpdate(assignModal.id, {
        vendor:  assignForm.vendor  || null,
        pwjType: assignForm.pwjType || null,
      });
      if (r.success) {
        const updatedEntry = { ...assignModal, vendor: assignForm.vendor, pwjType: assignForm.pwjType };
        setEntries(es => es.map(e => e.id === assignModal.id ? updatedEntry : e));
        showToast("Vendor & PWJ Type assigned ✅");
        setAssignModal(null);
        // Auto-open doc preview if PWJ type is set
        if (assignForm.pwjType) openDocModal(updatedEntry);
      } else showToast(r.message || "Update failed", "error");
    } catch { showToast("Network error", "error"); }
    finally { setAssignLoading(false); }
  };

  // ── Document generation ──
  const openDocModal = async (row) => {
    setDocModal({ entry: row, vendor: null });
    if (row.vendor) {
      try {
        const r = await api.getVendorByName(row.vendor);
        if (r.success) setDocModal({ entry: row, vendor: r.data });
      } catch {}
    }
  };

  const sendDocForApproval = async () => {
    if (!docModal) return;
    setDocLoading(true);
    try {
      const r = await api.submitDoc(docModal.entry.id);
      if (r.success) {
        setEntries(es => es.map(e => e.id === docModal.entry.id ? { ...e, docStatus: r.data.docStatus, docNumber: r.data.docNumber } : e));
        setDocModal(m => ({ ...m, entry: { ...m.entry, docStatus: r.data.docStatus, docNumber: r.data.docNumber } }));
        showToast(`${r.data.docNumber} sent for VP approval ✅`);
      } else showToast(r.message || "Failed", "error");
    } catch { showToast("Network error", "error"); }
    finally { setDocLoading(false); }
  };

  const openPendingDocs = async () => {
    setPendingDocsModal(true);
    setPendingDocsLoading(true);
    try {
      const r = await api.getPendingDocApprovals();
      if (r.success) setPendingDocs(r.data);
    } catch {}
    finally { setPendingDocsLoading(false); }
  };

  const handleDocApprove = async (id) => {
    const comment = vpCommentMap[id] || "";
    const r = await api.approveDoc(id, comment);
    if (r.success) {
      setPendingDocs(d => d.filter(x => x.id !== id));
      setVpCommentMap(m => { const c = { ...m }; delete c[id]; return c; });
      setEntries(es => es.map(e => e.id === id ? { ...e, docStatus: "VP_APPROVED", docComments: r.data?.docComments } : e));
      showToast("Document approved ✅");
    } else showToast(r.message || "Failed", "error");
  };

  const handleDocReject = async (id) => {
    const comment = vpCommentMap[id] || "";
    const r = await api.rejectDoc(id, comment);
    if (r.success) {
      setPendingDocs(d => d.filter(x => x.id !== id));
      setVpCommentMap(m => { const c = { ...m }; delete c[id]; return c; });
      const newStatus = r.data?.docStatus || (comment ? "REVISION_REQUESTED" : "VP_REJECTED");
      setEntries(es => es.map(e => e.id === id ? { ...e, docStatus: newStatus, docComments: r.data?.docComments } : e));
      showToast(comment ? "Revision requested — Procurement notified" : "Document rejected");
    } else showToast(r.message || "Failed", "error");
  };

  const downloadDoc = () => {
    if (!docModal) return;
    const e = docModal.entry; const v = docModal.vendor;
    const typeColor  = e.pwjType === "PO" ? "#1d4ed8" : e.pwjType === "WO" ? "#92400e" : "#166534";
    const typeName   = e.pwjType === "PO" ? "PURCHASE ORDER" : e.pwjType === "WO" ? "WORK ORDER" : "JOB ORDER";
    const vendorLabel = e.pwjType === "JO" ? "Service Provider" : "Vendor / Supplier";
    const itemLabel   = e.pwjType === "PO" ? "Item Details" : e.pwjType === "WO" ? "Scope of Work" : "Job Description";
    const today      = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const docNum     = e.docNumber || `${e.pwjType}-${new Date().getFullYear()}-${String(e.id).padStart(4,"0")}`;
    const addr       = v ? [v.street, v.city, v.state, v.zipCode].filter(Boolean).join(", ") : "";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${docNum}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; padding: 40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:20px; border-bottom:2px solid #e2e8f0; margin-bottom:24px; }
  .doc-type { font-size:28px; font-weight:900; color:${typeColor}; letter-spacing:-1px; }
  .doc-meta { font-size:13px; color:#64748b; margin-top:5px; line-height:1.7; }
  .company { text-align:right; font-size:15px; font-weight:800; }
  .company-sub { font-size:12px; color:#64748b; margin-top:3px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:22px; }
  .box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; }
  .box-title { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .box-name { font-size:14px; font-weight:700; color:#0f172a; }
  .box-detail { font-size:12px; color:#64748b; margin-top:3px; line-height:1.6; }
  .section-title { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; margin-bottom:22px; }
  th { background:${typeColor}; color:#fff; padding:9px 12px; text-align:left; font-size:11px; font-weight:700; }
  td { padding:10px 12px; font-size:13px; border-bottom:1px solid #e2e8f0; }
  tr:nth-child(even) td { background:#fafbfe; }
  .terms { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:22px; }
  .term-box { border-radius:8px; padding:14px 16px; }
  .term-box.pay { background:#fff8f0; border:1px solid #fed7aa; }
  .term-box.del { background:#f0fdf4; border:1px solid #bbf7d0; }
  .term-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .term-title.pay { color:#c2410c; } .term-title.del { color:#166534; }
  .term-text { font-size:12px; color:#475569; line-height:1.6; }
  .remarks { background:#fafbfe; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; font-size:12px; color:#475569; margin-bottom:22px; }
  .sig { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:32px; padding-top:20px; border-top:2px dashed #e2e8f0; }
  .sig-label { font-size:10px; color:#94a3b8; margin-bottom:30px; }
  .sig-line { border-top:1px solid #94a3b8; padding-top:4px; font-size:11px; color:#475569; }
  .approved-stamp { color:#166534; font-weight:700; }
  .watermark { text-align:center; margin-top:40px; font-size:10px; color:#cbd5e1; }
  @media print { body { padding:20px; } @page { margin:1cm; } }
</style></head><body>
<div class="header">
  <div>
    <div class="doc-type">${typeName}</div>
    <div class="doc-meta">Document No: <strong style="color:#0f172a">${docNum}</strong><br/>
    Date: <strong style="color:#0f172a">${today}</strong>${e.boqNo ? `<br/>BOQ Ref: <strong style="color:#0f172a">${e.boqNo}</strong>` : ""}</div>
  </div>
  <div class="company">PWJ Construction Pvt Ltd<div class="company-sub">Procurement Department</div></div>
</div>
<div class="grid2">
  <div class="box">
    <div class="box-title">${vendorLabel}</div>
    <div class="box-name">${v?.name || e.vendor}</div>
    ${v?.gstNumber ? `<div class="box-detail">GSTIN: ${v.gstNumber}</div>` : ""}
    ${v?.contactPerson ? `<div class="box-detail">Contact: ${v.contactPerson}</div>` : ""}
    ${v?.phoneNumber ? `<div class="box-detail">Phone: ${v.phoneNumber}</div>` : ""}
    ${v?.email ? `<div class="box-detail">Email: ${v.email}</div>` : ""}
    ${addr ? `<div class="box-detail">${addr}</div>` : ""}
  </div>
  <div class="box">
    <div class="box-title">Project Details</div>
    <div class="box-name">${e.projectName}</div>
    <div class="box-detail">Raised by: ${e.raisedBy}</div>
    ${e.dateOfRequirement ? `<div class="box-detail">Required by: ${e.dateOfRequirement}</div>` : ""}
  </div>
</div>
<div class="section-title">${itemLabel}</div>
<table>
  <thead><tr><th>#</th><th>Description</th><th>Specification</th><th>Brand</th><th>Unit</th><th>Qty</th></tr></thead>
  <tbody><tr>
    <td>1</td>
    <td><strong>${e.materialRequired}</strong></td>
    <td>${e.specification || "—"}</td>
    <td>${e.brand || "—"}</td>
    <td>${e.unit || "—"}</td>
    <td><strong>${e.quantity ?? "—"}</strong></td>
  </tr></tbody>
</table>
<div class="terms">
  <div class="term-box pay">
    <div class="term-title pay">Payment Terms</div>
    <div class="term-text">${v?.paymentDetails || "As per agreement"}${v?.bankDetails ? `<br/>Bank: ${v.bankDetails}` : ""}</div>
  </div>
  <div class="term-box del">
    <div class="term-title del">Delivery Terms</div>
    <div class="term-text">${v?.deliveryTerms || "As per standard terms"}</div>
  </div>
</div>
${e.remarks ? `<div class="remarks"><strong>Remarks:</strong> ${e.remarks}</div>` : ""}
<div class="sig">
  <div>
    <div class="sig-label">Prepared by Procurement</div>
    <div class="sig-line">Signature &amp; Date</div>
  </div>
  <div>
    <div class="sig-label">VP Approval</div>
    <div class="sig-line"><span class="approved-stamp">✓ Approved by VP</span></div>
  </div>
</div>
<div class="watermark">Generated by PWJ Tracker · ${docNum} · ${today}</div>
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  // ── Engineer: upload doc + notify procurement ──
  const uploadAndNotify = async () => {
    if (!engDocFile || !docModal) return;
    setEngDocUploading(true);
    try {
      const uploadRes = await api.uploadDocument(engDocFile);
      if (!uploadRes.success) { showToast(uploadRes.message || "Upload failed", "error"); return; }
      const deliveryRes = await api.deliveryUpdate(docModal.entry.id, {
        deliveryDocUrl: uploadRes.data,
        updatedBy: user.fullName || user.username,
      });
      if (deliveryRes.success) {
        setEntries(es => es.map(e => e.id === docModal.entry.id ? { ...e, deliveryDocUrl: uploadRes.data } : e));
        setDocModal(m => ({ ...m, entry: { ...m.entry, deliveryDocUrl: uploadRes.data } }));
        setEngDocFile(null);
        showToast("Document uploaded & procurement notified via email ✅");
      } else showToast(deliveryRes.message || "Failed to notify", "error");
    } catch { showToast("Network error", "error"); }
    finally { setEngDocUploading(false); }
  };

  // ── User Management ──
  const openUserMgmt = async () => {
    setUserMgmtModal(true);
    setUserMgmtLoading(true);
    try {
      const r = await api.getUsers();
      if (r.success) setAllUsers(r.data);
    } catch {}
    finally { setUserMgmtLoading(false); }
  };

  const submitNewUser = async () => {
    if (!newUserForm.username || !newUserForm.password || !newUserForm.fullName) {
      showToast("Username, password and full name are required", "error"); return;
    }
    const r = await api.createUser(newUserForm);
    if (r.success) {
      setAllUsers(u => [...u, r.data]);
      setNewUserForm({ username: "", password: "", fullName: "", email: "", role: "ENGINEER" });
      showToast(`User "${r.data.username}" created ✅`);
    } else {
      showToast(r.message || "Failed to create user", "error");
    }
  };

  const deactivateUser = async (id, username) => {
    const r = await api.deactivateUser(id);
    if (r.success) {
      setAllUsers(u => u.filter(x => x.id !== id));
      showToast(`${username} deactivated`);
    } else showToast(r.message || "Failed", "error");
  };

  // ── Pending approvals ──
  const openPending = async () => {
    try {
      const r = await api.getPending();
      if (r.success) { setPendingList(r.data); setPendingModal(true); }
    } catch { showToast("Failed to load pending", "error"); }
  };

  // ── Sort ──
  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
    setPage(0);
  };

  // ── Styles ──
  const s = {
    root: { fontFamily: "'DM Sans', sans-serif", background: "linear-gradient(135deg,#f0f7ff,#e8f4fd,#f5f9ff)", minHeight: "100vh" },
    header: { background: "linear-gradient(120deg,#0f4c81,#1a6ab1,#0ea5e9)", padding: "24px 36px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 4px 24px rgba(15,76,129,.2)" },
    hLeft: { display: "flex", alignItems: "center", gap: 14 },
    hLogo: { width: 46, height: 46, borderRadius: 12, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: "1.5px solid rgba(255,255,255,.3)" },
    hTitle: { fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1.1 },
    hSub: { fontSize: 11.5, color: "rgba(255,255,255,.7)", marginTop: 2 },
    hRight: { display: "flex", gap: 10, alignItems: "center" },
    hBtn: (col) => ({ background: col, border: "none", borderRadius: 10, padding: "9px 18px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }),
    statsRow: { display: "flex", gap: 14, padding: "20px 36px 0", overflowX: "auto" },
    statCard: (accent) => ({ background: "#fff", borderRadius: 14, padding: "16px 22px", minWidth: 140, flex: 1, boxShadow: "0 2px 12px rgba(15,76,129,.07)", borderTop: `3px solid ${accent}` }),
    statLbl: { fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .8 },
    statVal: { fontSize: 30, fontWeight: 800, color: "#1e293b", fontFamily: "'Plus Jakarta Sans',sans-serif", lineHeight: 1.2, marginTop: 2 },
    filterBar: { display: "flex", gap: 10, padding: "16px 36px", alignItems: "center", flexWrap: "wrap" },
    searchWrap: { position: "relative", flex: 1, minWidth: 220, maxWidth: 340 },
    searchIcon: { position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#93c5fd" },
    searchInput: { width: "100%", background: "#fff", border: "1.5px solid #e2eaf5", borderRadius: 10, padding: "9px 12px 9px 34px", fontSize: 13.5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
    sel: { background: "#fff", border: "1.5px solid #e2eaf5", borderRadius: 10, padding: "9px 28px 9px 12px", fontSize: 13, outline: "none", cursor: "pointer", fontFamily: "inherit", appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%2393c5fd' d='M5 7L0 2h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 9px center" },
    resultCount: { marginLeft: "auto", background: "linear-gradient(135deg,#0ea5e9,#1a6ab1)", color: "#fff", borderRadius: 20, padding: "5px 16px", fontSize: 12, fontWeight: 600 },
    tableWrap: { margin: "0 36px 20px", background: "#fff", borderRadius: 16, boxShadow: "0 2px 20px rgba(15,76,129,.08)", overflow: "hidden", border: "1px solid #e8f0f9" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { background: "linear-gradient(180deg,#f0f7ff,#e8f3fd)", padding: "11px 13px", textAlign: "left", fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 10.5, color: "#4a7aa8", textTransform: "uppercase", letterSpacing: .7, borderBottom: "2px solid #dbeafe", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" },
    td: { padding: "10px 13px", color: "#334155", verticalAlign: "middle", borderBottom: "1px solid #f1f5f9" },
    badge: (m) => ({ display: "inline-flex", alignItems: "center", gap: 5, background: m?.bg || "#f1f5f9", color: m?.color || "#64748b", borderRadius: 6, padding: "3px 10px", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }),
    dot: (c) => ({ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0 }),
    approveBtn: { background: "linear-gradient(135deg,#1a6ab1,#0ea5e9)", border: "none", borderRadius: 7, padding: "5px 12px", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
    paginationRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 36px 28px" },
    pageInfo: { fontSize: 13, color: "#64748b" },
    pageBtns: { display: "flex", gap: 5 },
    pageBtn: (active) => ({ width: 32, height: 32, borderRadius: 8, border: active ? "none" : "1.5px solid #e2eaf5", background: active ? "linear-gradient(135deg,#1a6ab1,#0ea5e9)" : "#fff", color: active ? "#fff" : "#334155", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 400, fontFamily: "inherit" }),
    // Modal
    overlay: { position: "fixed", inset: 0, background: "rgba(15,30,60,.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
    modalBox: (w) => ({ background: "#fff", borderRadius: 20, width: "95%", maxWidth: w || 560, maxHeight: "88vh", overflow: "auto", boxShadow: "0 24px 64px rgba(15,76,129,.25)", animation: "slideUp .22s ease" }),
    mHeader: { background: "linear-gradient(120deg,#0f4c81,#1a6ab1)", padding: "20px 26px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    mTitle: { fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#fff", fontWeight: 800, fontSize: 16 },
    mSub: { color: "rgba(255,255,255,.7)", fontSize: 11.5, marginTop: 3 },
    closeBtn: { background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: 7, cursor: "pointer", fontSize: 15 },
    mBody: { padding: "22px 26px" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 22px" },
    dLabel: { fontSize: 10, fontWeight: 700, color: "#93c5fd", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 },
    dVal: { fontSize: 13, color: "#1e293b", fontWeight: 500 },
    divider: { gridColumn: "1/-1", borderTop: "1.5px dashed #dbeafe", paddingTop: 10, fontSize: 10.5, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 },
    formGroup: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 },
    label: { fontSize: 11.5, fontWeight: 600, color: "#64748b" },
    input: { border: "1.5px solid #e2eaf5", borderRadius: 9, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    textarea: { border: "1.5px solid #e2eaf5", borderRadius: 9, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", minHeight: 72, resize: "vertical" },
    select2: { border: "1.5px solid #e2eaf5", borderRadius: 9, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#fff" },
    submitBtn: (col) => ({ background: col || "linear-gradient(135deg,#1a6ab1,#0ea5e9)", border: "none", borderRadius: 10, padding: "11px 28px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", width: "100%" }),
    toast: (type) => ({ position: "fixed", bottom: 28, right: 28, zIndex: 999, background: type === "error" ? "#ef4444" : "linear-gradient(135deg,#1a6ab1,#0ea5e9)", color: "#fff", borderRadius: 12, padding: "14px 22px", fontWeight: 600, fontSize: 14, boxShadow: "0 8px 32px rgba(0,0,0,.18)", animation: "slideUp .22s ease" }),
    emptyRow: { textAlign: "center", padding: "52px 20px", color: "#94a3b8", fontSize: 14 },
    errorBanner: { margin: "16px 36px", padding: "14px 18px", background: "#fef2f2", borderRadius: 12, border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 },
    pendingItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f1f5f9" },
  };

  const SortArrow = ({ field }) => (
    <span style={{ marginLeft: 3, opacity: sortBy === field ? 1 : 0.3, fontSize: 9 }}>
      {sortBy === field ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const canApprove = (row) =>
    row.approvalStatus === "HOLD" || row.approvalStatus === "NOT_APPROVED";

  const pageNumbers = useMemo(() => {
    const nums = [];
    for (let i = 0; i < totalPages; i++) nums.push(i);
    return nums.filter(p => p === 0 || p === totalPages - 1 || Math.abs(p - page) <= 1);
  }, [totalPages, page]);

  return (
    <>
      <style>{FONT}</style>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#bfdbfe; border-radius:8px; }
        tr:hover td { background:#eff6ff !important; }
        input:focus, select:focus, textarea:focus { border-color:#93c5fd !important; }
      `}</style>

      <div style={s.root}>
        {/* ─── HEADER ─── */}
        <div style={s.header}>
          <div style={s.hLeft}>
            <img src="https://happizo.com/assets/myimages/logo.png" alt="Happizo" style={{ height: 42, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            <div>
              <div style={s.hTitle}>PWJ Tracker</div>
              <div style={s.hSub}>Purchase Work Journal · Procurement Dashboard</div>
            </div>
          </div>
          <div style={s.hRight}>
            {/* Role badge + user */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.15)", borderRadius: 10, padding: "6px 14px", border: "1px solid rgba(255,255,255,.2)" }}>
              <span style={{ background: roleMeta.bg, color: roleMeta.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{roleMeta.label}</span>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{user.fullName || user.username}</span>
            </div>
            {(isAdmin || isProcurement) && (
              <button style={s.hBtn("rgba(16,185,129,.9)")} onClick={exportCSV}>⬇ Export</button>
            )}
            {(isAdmin || isProcurement) && (
              <button style={s.hBtn("rgba(251,191,36,.9)")} onClick={openPending}>⏳ Pending</button>
            )}
            {isVP && (
              <button style={s.hBtn("rgba(245,158,11,.9)")} onClick={openPendingDocs}>📄 Doc Approvals</button>
            )}
            {(isAdmin || isVP) && (
              <button style={s.hBtn("rgba(99,102,241,.9)")} onClick={openUserMgmt}>👥 Manage Users</button>
            )}
            <button style={s.hBtn("rgba(34,197,94,.85)")} onClick={() => {
              setCreateForm(f => ({ ...f, raisedBy: isEngineer ? user.fullName || user.username : "" }));
              setCreateModal(true);
            }}>+ New Entry</button>
            <button style={s.hBtn("rgba(255,255,255,.2)")} onClick={handleLogout}>↩ Logout</button>
          </div>
        </div>

        {/* ─── MAIN TABS ─── */}
        <div style={{ display: "flex", gap: 0, padding: "0 36px", background: "#fff", borderBottom: "2px solid #e2eaf5" }}>
          {[
            { key: "entries", label: "📋 PWJ Entries" },
            ...((isAdmin || isProcurement || isVP) ? [{ key: "vendors", label: "🏭 Vendors" }] : []),
          ].map(t => {
            const active = mainTab === t.key;
            return (
              <button key={t.key}
                onClick={() => {
                  setMainTab(t.key);
                  if (t.key === "vendors") loadVendorsTab();
                }}
                style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                  padding: "14px 24px", fontSize: 14, fontWeight: active ? 700 : 500,
                  color: active ? "#1a6ab1" : "#64748b",
                  borderBottom: active ? "3px solid #1a6ab1" : "3px solid transparent",
                  marginBottom: -2 }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {mainTab === "entries" && <>
        {/* ─── STATS ─── */}
        <div style={s.statsRow}>
          {[
            { label: "Total PRs",   value: stats.total,       accent: "#3b82f6" },
            { label: "Closed",      value: stats.closed,      accent: "#22c55e" },
            { label: "Open",        value: stats.open,        accent: "#f59e0b" },
            { label: "Proceed",     value: stats.proceed,     accent: "#0ea5e9" },
            { label: "On Hold",     value: stats.hold,        accent: "#f97316" },
            { label: "Not Approved",value: stats.notApproved, accent: "#ef4444" },
          ].map(c => (
            <div key={c.label} style={s.statCard(c.accent)}>
              <div style={s.statLbl}>{c.label}</div>
              <div style={s.statVal}>{loading ? "—" : (c.value ?? "—")}</div>
            </div>
          ))}
        </div>

        {/* ─── ERROR ─── */}
        {error && <div style={s.errorBanner}>⚠️ {error}</div>}

        {/* ─── FILTER BAR ─── */}
        <div style={s.filterBar}>
          <div style={s.searchWrap}>
            <span style={s.searchIcon}>🔍</span>
            <input style={s.searchInput} placeholder="Search material, project, vendor…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <select style={s.sel} value={projectF} onChange={e => { setProjectF(e.target.value); setPage(0); fetchEntries(); }}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select style={s.sel} value={statusF} onChange={e => { setStatusF(e.target.value); setPage(0); }}>
            <option value="ALL">All Status</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select style={s.sel} value={approvalF} onChange={e => { setApprovalF(e.target.value); setPage(0); }}>
            <option value="ALL">All Approval</option>
            <option value="PROCEED">Proceed</option>
            <option value="HOLD">Hold</option>
            <option value="NOT_APPROVED">Not Approved</option>
          </select>
          <button onClick={fetchEntries} title="Refresh entries"
            style={{ background: "#fff", border: "1.5px solid #e2eaf5", borderRadius: 10, padding: "8px 13px", fontSize: 15, cursor: "pointer", color: "#4a7aa8", lineHeight: 1 }}>
            🔄
          </button>
          <div style={s.resultCount}>{totalElements} results</div>
        </div>

        {/* ─── TABLE ─── */}
        <div style={s.tableWrap}>
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {[
                    ["#","id"],["Date","timestamp"],["Raised By","raisedBy"],
                    ["Project","projectName"],["BOQ","boqNo"],["Material","materialRequired"],
                    ["Brand","brand"],["Qty","quantity"],["Req Date","dateOfRequirement"],
                    ["Image","—"],["Vendor","vendor"],["PWJ","pwjIssued"],["Type","pwjType"],["Approval","approvalStatus"],
                    ["Status","status"],["Delivered","deliveredDate"],["Action","—"],
                  ].map(([lbl, field]) => (
                    <th key={lbl} style={s.th}
                      onClick={field !== "—" ? () => handleSort(field) : undefined}>
                      {lbl}{field !== "—" && <SortArrow field={field} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={17} style={s.emptyRow}>Loading entries…</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={17} style={s.emptyRow}>No entries match your filters.</td></tr>
                ) : entries.map((row, idx) => (
                  <tr key={row.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fbff", cursor: "pointer" }}>
                    <td style={{ ...s.td, color: "#94a3b8", fontSize: 12 }} onClick={() => setDetailRow(row)}>{row.id}</td>
                    <td style={{ ...s.td, fontSize: 12, whiteSpace: "nowrap" }} onClick={() => setDetailRow(row)}>
                      {row.timestamp ? row.timestamp.substring(0, 10) : "—"}
                    </td>
                    <td style={{ ...s.td, fontWeight: 500 }} onClick={() => setDetailRow(row)}>{row.raisedBy}</td>
                    <td style={{ ...s.td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.projectName} onClick={() => setDetailRow(row)}>{row.projectName}</td>
                    <td style={{ ...s.td, fontSize: 12, color: "#64748b" }} onClick={() => setDetailRow(row)}>{row.boqNo || "—"}</td>
                    <td style={{ ...s.td, fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.materialRequired} onClick={() => setDetailRow(row)}>{row.materialRequired}</td>
                    <td style={{ ...s.td, fontSize: 12, color: "#64748b" }} onClick={() => setDetailRow(row)}>{row.brand || "—"}</td>
                    <td style={{ ...s.td, fontWeight: 600 }} onClick={() => setDetailRow(row)}>{row.quantity ?? "—"}</td>
                    <td style={{ ...s.td, fontSize: 12, whiteSpace: "nowrap" }} onClick={() => setDetailRow(row)}>{row.dateOfRequirement || "—"}</td>
                    <td style={{ ...s.td }} onClick={() => setDetailRow(row)}>
                      {row.imageReference
                        ? <img src={"http://192.168.1.16:8080" + row.imageReference} alt="ref" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: "1px solid #e2eaf5", cursor: "zoom-in" }} onError={e => { e.target.style.display = "none"; }} />
                        : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ ...s.td, fontSize: 12, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.vendor} onClick={() => setDetailRow(row)}>{row.vendor || "—"}</td>
                    <td style={s.td} onClick={() => setDetailRow(row)}>
                      <span style={{ fontSize: 14, color: row.pwjIssued ? "#16a34a" : "#cbd5e1" }}>{row.pwjIssued ? "✓" : "—"}</span>
                    </td>
                    <td style={s.td} onClick={() => setDetailRow(row)}>
                      {row.pwjType
                        ? <span style={{ fontSize: 11, fontWeight: 700, background: row.pwjType === "PO" ? "#dbeafe" : row.pwjType === "WO" ? "#fef9c3" : "#dcfce7", color: row.pwjType === "PO" ? "#1d4ed8" : row.pwjType === "WO" ? "#92400e" : "#166534", borderRadius: 5, padding: "2px 7px" }}>{row.pwjType}</span>
                        : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={s.td} onClick={() => setDetailRow(row)}>
                      <span style={s.badge(APPROVAL_META[row.approvalStatus])}>
                        <span style={s.dot(APPROVAL_META[row.approvalStatus]?.dot || "#94a3b8")} />
                        {APPROVAL_META[row.approvalStatus]?.label || row.approvalStatus}
                      </span>
                    </td>
                    <td style={s.td} onClick={() => setDetailRow(row)}>
                      <span style={s.badge(STATUS_META[row.status])}>
                        <span style={s.dot(STATUS_META[row.status]?.dot || "#94a3b8")} />
                        {row.status}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontSize: 12, whiteSpace: "nowrap", color: "#64748b" }} onClick={() => setDetailRow(row)}>
                      {row.deliveredDate || "—"}
                    </td>
                    {/* ★ ACTION COLUMN */}
                    <td style={s.td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {isAdmin && canApprove(row) && (
                          <button style={s.approveBtn}
                            onClick={() => {
                              setApprovalForm({ approvalStatus: "PROCEED", comment: "", approvedBy: "" });
                              setApprovalModal({ entry: row });
                            }}>
                            ✅ Approve
                          </button>
                        )}
                        {(isAdmin || isProcurement) && (
                          <button
                            style={{ background: "linear-gradient(135deg,#0369a1,#0ea5e9)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                            onClick={() => openAssign(row)}>
                            ✏️ Assign
                          </button>
                        )}
                        {(isAdmin || isProcurement) && row.vendor && row.pwjType && (
                          <button
                            style={{ background: row.docStatus === "VP_APPROVED" ? "linear-gradient(135deg,#166534,#16a34a)" : row.docStatus === "PENDING_VP_APPROVAL" ? "linear-gradient(135deg,#92400e,#d97706)" : row.docStatus === "VP_REJECTED" ? "linear-gradient(135deg,#991b1b,#ef4444)" : row.docStatus === "REVISION_REQUESTED" ? "linear-gradient(135deg,#c2410c,#f97316)" : "linear-gradient(135deg,#5b21b6,#7c3aed)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                            onClick={() => openDocModal(row)}>
                            📄 {row.docStatus === "VP_APPROVED" ? "Approved" : row.docStatus === "PENDING_VP_APPROVAL" ? "Pending VP" : row.docStatus === "VP_REJECTED" ? "Rejected" : row.docStatus === "REVISION_REQUESTED" ? "Revision ⚠" : "View Doc"}
                          </button>
                        )}
                        {isEngineer && row.docStatus && (
                          <button
                            style={{ background: row.docStatus === "VP_APPROVED" ? "linear-gradient(135deg,#166534,#16a34a)" : row.docStatus === "PENDING_VP_APPROVAL" ? "linear-gradient(135deg,#92400e,#d97706)" : "linear-gradient(135deg,#0369a1,#0ea5e9)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                            onClick={() => { setEngDocFile(null); openDocModal(row); }}>
                            📄 {row.docStatus === "VP_APPROVED" ? "Doc Approved" : row.docStatus === "PENDING_VP_APPROVAL" ? "Doc Pending" : "View Doc"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── PAGINATION ─── */}
        <div style={s.paginationRow}>
          <div style={s.pageInfo}>
            {totalElements > 0
              ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalElements)} of ${totalElements}`
              : "No results"}
          </div>
          <div style={s.pageBtns}>
            <button style={s.pageBtn(false)} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
            {pageNumbers.map((p, i, arr) => (
              <>
                {i > 0 && arr[i] - arr[i-1] > 1 && <span key={`e${i}`} style={{ padding: "0 4px", color: "#94a3b8", lineHeight: "32px" }}>…</span>}
                <button key={p} style={s.pageBtn(p === page)} onClick={() => setPage(p)}>{p + 1}</button>
              </>
            ))}
            <button style={s.pageBtn(false)} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>›</button>
          </div>
        </div>
        </>}

        {/* ─── VENDORS TAB ─── */}
        {mainTab === "vendors" && (() => {
          const STATUS_CFG = {
            PENDING_APPROVAL: { label: "Pending",  bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
            APPROVED:         { label: "Approved", bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
            REJECTED:         { label: "Rejected", bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
          };
          const vtabs = [
            { key: "ALL",              label: "All" },
            { key: "PENDING_APPROVAL", label: "Pending" },
            { key: "APPROVED",         label: "Approved" },
            { key: "REJECTED",         label: "Rejected" },
          ];
          const displayed = vendorStatusTab === "ALL"
            ? allVendorsStatus
            : allVendorsStatus.filter(v => v.status === vendorStatusTab);
          return (
            <div style={{ padding: "24px 36px" }}>
              {/* Top bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                  Vendor Management
                </div>
                {(isAdmin || isProcurement) && (
                  <button
                    style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
                    onClick={() => setVendorModal(true)}>
                    ➕ Add Vendor
                  </button>
                )}
              </div>

              {/* Status tabs */}
              <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2eaf5", marginBottom: 20 }}>
                {vtabs.map(t => {
                  const count = t.key === "ALL" ? allVendorsStatus.length : allVendorsStatus.filter(v => v.status === t.key).length;
                  const active = vendorStatusTab === t.key;
                  return (
                    <button key={t.key} onClick={() => setVendorStatusTab(t.key)}
                      style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                        padding: "10px 18px", fontSize: 13, fontWeight: active ? 700 : 500,
                        color: active ? "#1a6ab1" : "#64748b",
                        borderBottom: active ? "2px solid #1a6ab1" : "2px solid transparent",
                        marginBottom: -2 }}>
                      {t.label}
                      <span style={{ marginLeft: 6, fontSize: 11, background: active ? "#dbeafe" : "#f1f5f9",
                        color: active ? "#1d4ed8" : "#64748b", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Vendor cards */}
              {vpLoading ? (
                <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>Loading vendors…</div>
              ) : displayed.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 14 }}>No vendors in this category</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
                  {displayed.map(v => {
                    const cfg = STATUS_CFG[v.status] || STATUS_CFG.PENDING_APPROVAL;
                    const isPending = v.status === "PENDING_APPROVAL";
                    return (
                      <div key={v.id} style={{ border: `1.5px solid ${isPending ? "#fde68a" : "#e2eaf5"}`, borderRadius: 14, padding: "16px 18px", background: isPending ? "#fffbeb" : "#f8fbff", display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", flex: 1, marginRight: 8 }}>{v.name}</div>
                          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap",
                            background: cfg.bg, color: cfg.color, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
                            {cfg.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                          {v.category && <span style={{ marginRight: 12 }}>📦 {v.category}</span>}
                          {v.email && <span style={{ marginRight: 12 }}>✉️ {v.email}</span>}
                          {v.phoneNumber && <span>📞 {v.phoneNumber}</span>}
                        </div>
                        {v.gstNumber && <div style={{ fontSize: 12, color: "#475569" }}>GST: {v.gstNumber}</div>}
                        {v.bankDetails && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>🏦 {v.bankDetails}</div>}
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, marginBottom: 10 }}>Added: {v.createdAt ? v.createdAt.substring(0, 10) : "—"}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                          <button onClick={() => setViewVendor(v)}
                            style={{ flex: 1, background: "#fff", border: "1.5px solid #e2eaf5", borderRadius: 8, padding: "7px", color: "#1a6ab1", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            👁 View
                          </button>
                          {isVP && isPending && (<>
                            <button style={{ flex: 1, background: "linear-gradient(135deg,#16a34a,#22c55e)", border: "none", borderRadius: 8, padding: "7px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                              onClick={async () => { const r = await api.approveVendor(v.id); if (r.success) { setAllVendorsStatus(a => a.map(x => x.id === v.id ? { ...x, status: "APPROVED" } : x)); showToast(`${v.name} approved ✅`); } else showToast(r.message || "Failed", "error"); }}>✅ Approve</button>
                            <button style={{ flex: 1, background: "linear-gradient(135deg,#dc2626,#ef4444)", border: "none", borderRadius: 8, padding: "7px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                              onClick={async () => { const r = await api.rejectVendor(v.id); if (r.success) { setAllVendorsStatus(a => a.map(x => x.id === v.id ? { ...x, status: "REJECTED", active: false } : x)); showToast(`${v.name} rejected`, "error"); } else showToast(r.message || "Failed", "error"); }}>❌ Reject</button>
                          </>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ─── DETAIL MODAL ─── */}
      {detailRow && (
        <div style={s.overlay} onClick={() => setDetailRow(null)}>
          <div style={s.modalBox(620)} onClick={e => e.stopPropagation()}>
            <div style={s.mHeader}>
              <div>
                <div style={s.mTitle}>{detailRow.materialRequired}</div>
                <div style={s.mSub}>{detailRow.projectName} · BOQ: {detailRow.boqNo || "—"} · Entry #{detailRow.id}</div>
              </div>
              <button style={s.closeBtn} onClick={() => setDetailRow(null)}>✕</button>
            </div>
            <div style={s.mBody}>
              <div style={s.grid2}>
                <div style={s.divider}>📋 Request Details</div>
                {[
                  ["Timestamp", detailRow.timestamp?.substring(0,16)],
                  ["Raised By", detailRow.raisedBy],
                  ["Project", detailRow.projectName],
                  ["BOQ No.", detailRow.boqNo],
                  ["Material", detailRow.materialRequired],
                  ["Specification", detailRow.specification],
                  ["Brand", detailRow.brand],
                  ["Unit", detailRow.unit],
                  ["Quantity", detailRow.quantity],
                  ["Date of Requirement", detailRow.dateOfRequirement],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={s.dLabel}>{l}</div>
                    <div style={s.dVal}>{v || "—"}</div>
                  </div>
                ))}
                {detailRow.imageReference && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={s.dLabel}>Image Reference</div>
                    <img src={"http://192.168.1.16:8080" + detailRow.imageReference} alt="reference"
                      style={{ marginTop: 6, maxWidth: "100%", maxHeight: 260, borderRadius: 10, border: "1px solid #e2eaf5", objectFit: "contain" }}
                      onError={e => { e.target.replaceWith(Object.assign(document.createElement("span"), { textContent: detailRow.imageReference, style: "font-size:12px;color:#64748b;word-break:break-all" })); }} />
                  </div>
                )}
                <div style={s.divider}>🏭 Procurement & Status</div>
                {[
                  ["Vendor", detailRow.vendor],
                  ["PWJ Issued", detailRow.pwjIssued ? "Yes" : "No"],
                  ["Delivered Date", detailRow.deliveredDate],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={s.dLabel}>{l}</div>
                    <div style={s.dVal}>{v || "—"}</div>
                  </div>
                ))}
                <div>
                  <div style={s.dLabel}>Approval Status</div>
                  <span style={s.badge(APPROVAL_META[detailRow.approvalStatus])}>
                    <span style={s.dot(APPROVAL_META[detailRow.approvalStatus]?.dot)} />
                    {APPROVAL_META[detailRow.approvalStatus]?.label}
                  </span>
                </div>
                <div>
                  <div style={s.dLabel}>Status</div>
                  <span style={s.badge(STATUS_META[detailRow.status])}>
                    <span style={s.dot(STATUS_META[detailRow.status]?.dot)} />
                    {detailRow.status}
                  </span>
                </div>
                {detailRow.approvedBy && <>
                  <div style={s.divider}>✅ Approval History</div>
                  <div><div style={s.dLabel}>Approved By</div><div style={s.dVal}>{detailRow.approvedBy}</div></div>
                  <div><div style={s.dLabel}>Approved At</div><div style={s.dVal}>{detailRow.approvedAt?.substring(0,16)}</div></div>
                  <div style={{ gridColumn: "1/-1" }}><div style={s.dLabel}>Approval Comment</div><div style={s.dVal}>{detailRow.approvalComment || "—"}</div></div>
                </>}
                {detailRow.remarks && <>
                  <div style={s.divider}>💬 Remarks</div>
                  <div style={{ gridColumn: "1/-1" }}><div style={s.dVal}>{detailRow.remarks}</div></div>
                </>}
              </div>
              {/* Approve button inside detail modal */}
              {isAdmin && canApprove(detailRow) && (
                <button style={{ ...s.submitBtn(), marginTop: 20 }}
                  onClick={() => {
                    setDetailRow(null);
                    setApprovalForm({ approvalStatus: "PROCEED", comment: "", approvedBy: "" });
                    setApprovalModal({ entry: detailRow });
                  }}>
                  ✅ Take Approval Action
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── APPROVAL MODAL ─── */}
      {approvalModal && (
        <div style={s.overlay} onClick={() => setApprovalModal(null)}>
          <div style={s.modalBox(480)} onClick={e => e.stopPropagation()}>
            <div style={s.mHeader}>
              <div>
                <div style={s.mTitle}>Approval Action</div>
                <div style={s.mSub}>Entry #{approvalModal.entry.id} · {approvalModal.entry.materialRequired}</div>
              </div>
              <button style={s.closeBtn} onClick={() => setApprovalModal(null)}>✕</button>
            </div>
            <div style={s.mBody}>
              {/* Current status */}
              <div style={{ background: "#f8fbff", borderRadius: 10, padding: "12px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Current:</span>
                <span style={s.badge(APPROVAL_META[approvalModal.entry.approvalStatus])}>
                  <span style={s.dot(APPROVAL_META[approvalModal.entry.approvalStatus]?.dot)} />
                  {APPROVAL_META[approvalModal.entry.approvalStatus]?.label}
                </span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>→ Change to:</span>
              </div>

              <div style={s.formGroup}>
                <label style={s.label}>New Approval Status *</label>
                <select style={s.select2} value={approvalForm.approvalStatus}
                  onChange={e => setApprovalForm(f => ({ ...f, approvalStatus: e.target.value }))}>
                  <option value="PROCEED">✅ Proceed (Approve)</option>
                  <option value="HOLD">⏳ Hold</option>
                  <option value="NOT_APPROVED">❌ Not Approved</option>
                </select>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Approved By *</label>
                <input style={s.input} placeholder="e.g. Bharat Sir" value={approvalForm.approvedBy}
                  onChange={e => setApprovalForm(f => ({ ...f, approvedBy: e.target.value }))} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Comment / Reason</label>
                <textarea style={s.textarea} placeholder="Add a comment or reason…" value={approvalForm.comment}
                  onChange={e => setApprovalForm(f => ({ ...f, comment: e.target.value }))} />
              </div>
              <button style={s.submitBtn(
                approvalForm.approvalStatus === "PROCEED"
                  ? "linear-gradient(135deg,#16a34a,#22c55e)"
                  : approvalForm.approvalStatus === "HOLD"
                  ? "linear-gradient(135deg,#d97706,#f59e0b)"
                  : "linear-gradient(135deg,#dc2626,#ef4444)"
              )}
                onClick={submitApproval} disabled={approvalLoading}>
                {approvalLoading ? "Saving…" : `Confirm ${APPROVAL_META[approvalForm.approvalStatus]?.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PENDING APPROVALS MODAL ─── */}
      {pendingModal && (
        <div style={s.overlay} onClick={() => setPendingModal(false)}>
          <div style={s.modalBox(660)} onClick={e => e.stopPropagation()}>
            <div style={s.mHeader}>
              <div>
                <div style={s.mTitle}>⏳ Pending Approvals</div>
                <div style={s.mSub}>{pendingList.length} entries awaiting action</div>
              </div>
              <button style={s.closeBtn} onClick={() => setPendingModal(false)}>✕</button>
            </div>
            <div style={s.mBody}>
              {pendingList.length === 0
                ? <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>🎉 No pending approvals!</div>
                : pendingList.map(row => (
                  <div key={row.id} style={s.pendingItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: "#1e293b" }}>{row.materialRequired}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{row.projectName} · {row.raisedBy} · #{row.id}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={s.badge(APPROVAL_META[row.approvalStatus])}>
                        <span style={s.dot(APPROVAL_META[row.approvalStatus]?.dot)} />
                        {APPROVAL_META[row.approvalStatus]?.label}
                      </span>
                      <button style={s.approveBtn}
                        onClick={() => {
                          setPendingModal(false);
                          setApprovalForm({ approvalStatus: "PROCEED", comment: "", approvedBy: "" });
                          setApprovalModal({ entry: row });
                        }}>
                        Approve
                      </button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE ENTRY MODAL ─── */}
      {createModal && (
        <div style={s.overlay} onClick={() => setCreateModal(false)}>
          <div style={s.modalBox(620)} onClick={e => e.stopPropagation()}>
            <div style={s.mHeader}>
              <div>
                <div style={s.mTitle}>➕ New PWJ Entry</div>
                <div style={s.mSub}>Add a new purchase / work journal request</div>
              </div>
              <button style={s.closeBtn} onClick={() => setCreateModal(false)}>✕</button>
            </div>
            <div style={s.mBody}>
              <div style={s.grid2}>
                {[
                  ["Raised By *", "raisedBy", "text"],
                  ["Project Name *", "projectName", "text"],
                  ["BOQ No.", "boqNo", "text"],
                  ["Brand", "brand", "text"],
                  ["Unit", "unit", "text"],
                  ["Quantity", "quantity", "number"],
                  ["Vendor", "vendor", "text"],
                  ["Date of Requirement", "dateOfRequirement", "date"],
                ].map(([lbl, key, type]) => (
                  <div key={key} style={s.formGroup}>
                    <label style={s.label}>{lbl}</label>
                    <input style={s.input} type={type} placeholder={lbl.replace(" *","")}
                      value={createForm[key] || ""}
                      onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>Image Reference</label>
                  <input style={s.input} type="file" accept="image/*"
                    onChange={async e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      showToast("Uploading image…");
                      const res = await api.uploadImage(file);
                      if (res.success) {
                        setCreateForm(f => ({ ...f, imageReference: res.data }));
                        showToast("Image uploaded");
                      } else {
                        showToast(res.message || "Upload failed", "error");
                      }
                    }} />
                  {createForm.imageReference && (
                    <img src={"http://192.168.1.16:8080" + createForm.imageReference}
                      alt="preview" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, objectFit: "contain", border: "1px solid #e2eaf5" }} />
                  )}
                </div>
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>Material Required *</label>
                  <input style={s.input} placeholder="Material Required"
                    value={createForm.materialRequired}
                    onChange={e => setCreateForm(f => ({ ...f, materialRequired: e.target.value }))} />
                </div>
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>Specification</label>
                  <textarea style={s.textarea} placeholder="Specification details…"
                    value={createForm.specification || ""}
                    onChange={e => setCreateForm(f => ({ ...f, specification: e.target.value }))} />
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Approval Status</label>
                  <select style={s.select2} value={createForm.approvalStatus}
                    onChange={e => setCreateForm(f => ({ ...f, approvalStatus: e.target.value }))}>
                    <option value="PROCEED">Proceed</option>
                    <option value="HOLD">Hold</option>
                    <option value="NOT_APPROVED">Not Approved</option>
                  </select>
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Status</label>
                  <select style={s.select2} value={createForm.status}
                    onChange={e => setCreateForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="OPEN">Open</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
              </div>
              <button style={{ ...s.submitBtn(), marginTop: 8 }} onClick={submitCreate}>
                ✅ Create Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD VENDOR MODAL ─── */}
      {vendorModal && (() => {
        const vf = vendorForm;
        const setF = (key, val) => setVendorForm(f => ({ ...f, [key]: val }));
        const sec = (key) => ({
          wrap: { border: "1px solid #dbe6f3", borderRadius: 12, marginBottom: 14, overflow: "hidden" },
          head: { background: "#eef5fb", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" },
          headL: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#1a6ab1" },
          body: vendorSec[key] ? { padding: "16px 18px" } : { display: "none" },
        });
        const grid = (cols) => ({ display: "grid", gridTemplateColumns: cols, gap: 10, marginBottom: 10 });
        const fld = { display: "flex", flexDirection: "column", gap: 4 };
        const lbl = { fontSize: 11.5, fontWeight: 600, color: "#64748b" };
        const inp = { border: "1.5px solid #dbe6f3", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", width: "100%", boxSizing: "border-box" };
        const toggle = (key) => setVendorSec(s => ({ ...s, [key]: !s[key] }));
        const minusBtn = (key) => (
          <button type="button" onClick={() => toggle(key)} style={{ background: "#1a6ab1", border: "none", color: "#fff", width: 22, height: 22, borderRadius: "50%", cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {vendorSec[key] ? "−" : "+"}
          </button>
        );
        return (
          <div style={s.overlay} onClick={() => setVendorModal(false)}>
            <div style={{ ...s.modalBox(880), maxHeight: "92vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
              <div style={s.mHeader}>
                <div>
                  <div style={s.mTitle}>🏭 Add Vendor</div>
                  <div style={s.mSub}>Add a new vendor — only Company name is required</div>
                </div>
                <button style={s.closeBtn} onClick={() => setVendorModal(false)}>✕</button>
              </div>
              <div style={{ overflowY: "auto", flex: 1, padding: "18px 22px" }}>

                {/* ── Vendor Details ── */}
                {(() => { const st = sec("details"); return (
                  <div style={st.wrap}>
                    <div style={st.head} onClick={() => toggle("details")}>
                      <span style={st.headL}>🏢 Vendor Details</span>{minusBtn("details")}
                    </div>
                    <div style={st.body}>
                      <div style={grid("2fr 1fr 1fr 1fr")}>
                        <div style={fld}>
                          <label style={lbl}>Company *</label>
                          <input style={inp} placeholder="Enter Company" value={vf.name} onChange={e => setF("name", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>GST Number</label>
                          <input style={inp} placeholder="Enter GST Number" value={vf.gstNumber} onChange={e => setF("gstNumber", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Ratings</label>
                          <div style={{ display: "flex", gap: 3, paddingTop: 8 }}>
                            {[1,2,3,4,5].map(n => (
                              <span key={n} onClick={() => setF("ratings", vf.ratings === n ? 0 : n)}
                                style={{ fontSize: 22, cursor: "pointer", color: n <= vf.ratings ? "#f59e0b" : "#d1d5db" }}>★</span>
                            ))}
                          </div>
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Contact Person</label>
                          <input style={inp} placeholder="Enter name" value={vf.contactPerson} onChange={e => setF("contactPerson", e.target.value)} />
                        </div>
                      </div>
                      <div style={grid("1fr 1fr 1fr 1fr")}>
                        <div style={fld}>
                          <label style={lbl}>Phone Number</label>
                          <input style={inp} placeholder="Enter Phone Number" value={vf.phoneNumber} onChange={e => setF("phoneNumber", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Email Address</label>
                          <input style={inp} type="email" placeholder="Enter Email Address" value={vf.email} onChange={e => setF("email", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Vendor Category</label>
                          <input style={inp} placeholder="e.g. Steel, Electrical…" value={vf.category} onChange={e => setF("category", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Tags</label>
                          <input style={inp} placeholder="e.g. preferred, local" value={vf.tags} onChange={e => setF("tags", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </div>
                ); })()}

                {/* ── Vendor Profile ── */}
                {(() => { const st = sec("profile"); return (
                  <div style={st.wrap}>
                    <div style={st.head} onClick={() => toggle("profile")}>
                      <span style={st.headL}>👤 Vendor Profile</span>{minusBtn("profile")}
                    </div>
                    <div style={st.body}>
                      <div style={grid("1fr 1fr 1fr 1fr")}>
                        <div style={fld}>
                          <label style={lbl}>Vendor Code</label>
                          <input style={inp} placeholder="VC-0001" value={vf.vendorCode} onChange={e => setF("vendorCode", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Website</label>
                          <input style={inp} placeholder="Enter Website" value={vf.website} onChange={e => setF("website", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Currency</label>
                          <select style={inp} value={vf.currency} onChange={e => setF("currency", e.target.value)}>
                            {["INR","USD","EUR","GBP","AED","SGD"].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Language</label>
                          <input style={inp} placeholder="Select language" value={vf.language} onChange={e => setF("language", e.target.value)} />
                        </div>
                      </div>
                      <div style={grid("1fr 1fr 1fr 1fr")}>
                        <div style={fld}>
                          <label style={lbl}>Country</label>
                          <input style={inp} placeholder="Country" value={vf.country} onChange={e => setF("country", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>State</label>
                          <input style={inp} placeholder="Choose State" value={vf.state} onChange={e => setF("state", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>City</label>
                          <input style={inp} placeholder="Enter city" value={vf.city} onChange={e => setF("city", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Zip Code</label>
                          <input style={inp} placeholder="Enter ZIP Code" value={vf.zipCode} onChange={e => setF("zipCode", e.target.value)} />
                        </div>
                      </div>
                      <div style={grid("1fr 1fr 1fr")}>
                        <div style={fld}>
                          <label style={lbl}>Street</label>
                          <input style={inp} placeholder="Enter Street" value={vf.street} onChange={e => setF("street", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Payment Details</label>
                          <input style={inp} placeholder="Enter Details" value={vf.paymentDetails} onChange={e => setF("paymentDetails", e.target.value)} />
                        </div>
                        <div style={fld}>
                          <label style={lbl}>Delivery Terms</label>
                          <input style={inp} placeholder="Enter Delivery Terms" value={vf.deliveryTerms} onChange={e => setF("deliveryTerms", e.target.value)} />
                        </div>
                      </div>
                      <div style={grid("1fr 1fr")}>
                        <div style={fld}>
                          <label style={lbl}>Joining Date</label>
                          <input style={inp} type="date" value={vf.joiningDate} onChange={e => setF("joiningDate", e.target.value)} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
                          <label style={{ position: "relative", display: "inline-block", width: 42, height: 24, flexShrink: 0 }}>
                            <input type="checkbox" checked={vf.sameAddressForBillingShipping} onChange={e => setF("sameAddressForBillingShipping", e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                            <span style={{ position: "absolute", inset: 0, borderRadius: 24, background: vf.sameAddressForBillingShipping ? "#1a6ab1" : "#cbd5e1", transition: ".2s", cursor: "pointer" }}>
                              <span style={{ position: "absolute", left: vf.sameAddressForBillingShipping ? 20 : 3, top: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: ".2s" }} />
                            </span>
                          </label>
                          <span style={{ fontSize: 13, color: "#475569" }}>Same Address For Billing &amp; Shipping</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ); })()}

                {/* ── Vendor Contacts ── */}
                {(() => { const st = sec("contacts"); return (
                  <div style={st.wrap}>
                    <div style={st.head} onClick={() => toggle("contacts")}>
                      <span style={st.headL}>📇 Vendor Contacts</span>{minusBtn("contacts")}
                    </div>
                    <div style={st.body}>
                      {vf.contacts.map((c, i) => (
                        <div key={i} style={{ ...grid("1fr 1fr 1fr 1fr auto"), alignItems: "flex-end", marginBottom: 8 }}>
                          <div style={fld}><label style={lbl}>Person Name</label><input style={inp} placeholder="Enter Person Name" value={c.personName || ""} onChange={e => setVendorForm(f => ({ ...f, contacts: f.contacts.map((x,j) => j===i ? {...x, personName: e.target.value} : x) }))} /></div>
                          <div style={fld}><label style={lbl}>Role</label><input style={inp} placeholder="Enter Role" value={c.role || ""} onChange={e => setVendorForm(f => ({ ...f, contacts: f.contacts.map((x,j) => j===i ? {...x, role: e.target.value} : x) }))} /></div>
                          <div style={fld}><label style={lbl}>Contact Number</label><input style={inp} placeholder="Enter Contact Number" value={c.contactNumber || ""} onChange={e => setVendorForm(f => ({ ...f, contacts: f.contacts.map((x,j) => j===i ? {...x, contactNumber: e.target.value} : x) }))} /></div>
                          <div style={fld}><label style={lbl}>Email Address</label><input style={inp} placeholder="Enter Email Address" value={c.email || ""} onChange={e => setVendorForm(f => ({ ...f, contacts: f.contacts.map((x,j) => j===i ? {...x, email: e.target.value} : x) }))} /></div>
                          <button type="button" onClick={() => setVendorForm(f => ({ ...f, contacts: f.contacts.filter((_,j) => j!==i) }))}
                            style={{ background: "#fee2e2", border: "none", borderRadius: 8, width: 34, height: 36, cursor: "pointer", color: "#ef4444", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setVendorForm(f => ({ ...f, contacts: [...f.contacts, { personName: "", role: "", contactNumber: "", email: "" }] }))}
                        style={{ background: "#1a6ab1", border: "none", borderRadius: 8, padding: "7px 18px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        + Add Contact
                      </button>
                    </div>
                  </div>
                ); })()}

                {/* ── Bank Details (untouched) ── */}
                {(() => { const st = sec("bank"); return (
                  <div style={st.wrap}>
                    <div style={st.head} onClick={() => toggle("bank")}>
                      <span style={st.headL}>🏦 Bank Details</span>{minusBtn("bank")}
                    </div>
                    <div style={st.body}>
                      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ flexShrink: 0, width: 120 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a6ab1", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>📄 Document Reference</div>
                          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 120, borderRadius: 10, cursor: "pointer", border: vendorDocPreview ? "2px solid #93c5fd" : "2px dashed #93c5fd", background: vendorDocPreview ? "#f0f7ff" : "#f8fbff", overflow: "hidden", position: "relative" }}>
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleVendorDoc} />
                            {vendorDocPreview ? <img src={vendorDocPreview} alt="doc" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 32, opacity: 0.35 }}>📎</span>}
                            {vendorOcrLoading && (
                              <div style={{ position: "absolute", inset: 0, background: "rgba(15,76,129,.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                <div style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>Reading…</div>
                                <div style={{ width: 72, height: 5, background: "rgba(255,255,255,.3)", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${vendorOcrProgress}%`, background: "#7dd3fc", borderRadius: 4, transition: "width .3s" }} />
                                </div>
                                <div style={{ fontSize: 10, color: "#bae6fd" }}>{vendorOcrProgress}%</div>
                              </div>
                            )}
                          </label>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, textAlign: "center", lineHeight: 1.4 }}>Click to upload<br/>passbook / doc</div>
                          {vendorDocFile && !vendorOcrLoading && (
                            <button style={{ marginTop: 6, width: "100%", background: "#e0f2fe", border: "1px solid #93c5fd", borderRadius: 6, padding: "4px 0", fontSize: 10, fontWeight: 700, color: "#0369a1", cursor: "pointer", fontFamily: "inherit" }} onClick={() => runVendorOcr(vendorDocFile)}>🔄 Re-process</button>
                          )}
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={grid("1fr 1fr 1fr")}>
                            <div style={fld}><label style={lbl}>Bank Name</label><input style={inp} placeholder="Bank Name & Branch" value={vf.bankName} onChange={e => setF("bankName", e.target.value)} /></div>
                            <div style={fld}><label style={lbl}>Account Number</label><input style={inp} placeholder="Account Number" value={vf.accountNumber} onChange={e => setF("accountNumber", e.target.value)} /></div>
                            <div style={fld}><label style={lbl}>IFSC Code</label><input style={inp} placeholder="IFSC Code" value={vf.ifscCode} onChange={e => setF("ifscCode", e.target.value)} /></div>
                          </div>
                          <div style={fld}>
                            <label style={lbl}>Combined Bank Details <span style={{ color: "#94a3b8", fontWeight: 400 }}>(auto-filled)</span></label>
                            <textarea style={{ ...inp, minHeight: 56, resize: "vertical" }} placeholder="Bank Name | A/C No: … | IFSC: …" value={vf.bankDetails} onChange={e => setF("bankDetails", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ); })()}

                {/* ── Vendor Policies ── */}
                {(() => { const st = sec("policies"); return (
                  <div style={st.wrap}>
                    <div style={st.head} onClick={() => toggle("policies")}>
                      <span style={st.headL}>📋 Vendor Policies</span>{minusBtn("policies")}
                    </div>
                    <div style={st.body}>
                      <div style={grid("1fr 1fr 1fr")}>
                        <div style={fld}><label style={lbl}>Maximum Return Days</label><input style={inp} type="number" placeholder="Enter in Days" value={vf.maximumReturnDays} onChange={e => setF("maximumReturnDays", e.target.value)} /></div>
                        <div style={fld}><label style={lbl}>Return Fees</label><input style={inp} placeholder="Enter in Rupees" value={vf.returnFees} onChange={e => setF("returnFees", e.target.value)} /></div>
                        <div style={fld}><label style={lbl}>List Vendor Policies</label><input style={inp} placeholder="Describe if any" value={vf.listVendorPolicies} onChange={e => setF("listVendorPolicies", e.target.value)} /></div>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569", cursor: "pointer", marginTop: 4 }}>
                        <input type="checkbox" checked={vf.vendorPaysReturnShipping} onChange={e => setF("vendorPaysReturnShipping", e.target.checked)} />
                        Yes, Vendor Pays For Return Shipping Charges
                      </label>
                    </div>
                  </div>
                ); })()}

                <button style={{ ...s.submitBtn("linear-gradient(135deg,#7c3aed,#8b5cf6)"), marginTop: 4 }}
                  onClick={submitVendor} disabled={vendorLoading}>
                  {vendorLoading ? "Saving…" : "➕ Add Vendor"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── VP VENDOR APPROVALS MODAL ─── */}
      {vpPendingModal && (() => {
        const STATUS_CFG = {
          PENDING_APPROVAL: { label: "Pending",  bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" },
          APPROVED:         { label: "Approved", bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
          REJECTED:         { label: "Rejected", bg: "#fee2e2", color: "#dc2626", dot: "#ef4444" },
        };
        const tabs = [
          { key: "ALL",              label: "All" },
          { key: "PENDING_APPROVAL", label: "Pending" },
          { key: "APPROVED",         label: "Approved" },
          { key: "REJECTED",         label: "Rejected" },
        ];
        const displayed = vendorStatusTab === "ALL"
          ? allVendorsStatus
          : allVendorsStatus.filter(v => v.status === vendorStatusTab);
        return (
          <div style={s.overlay} onClick={() => setVpPendingModal(false)}>
            <div style={{ ...s.modalBox(720), maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
              <div style={s.mHeader}>
                <div>
                  <div style={s.mTitle}>🏛️ Vendor Approvals</div>
                  <div style={s.mSub}>View and manage vendor approval status</div>
                </div>
                <button style={s.closeBtn} onClick={() => setVpPendingModal(false)}>✕</button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 6, padding: "12px 24px 0", borderBottom: "2px solid #e2eaf5", background: "#f8fbff" }}>
                {tabs.map(t => {
                  const count = t.key === "ALL" ? allVendorsStatus.length : allVendorsStatus.filter(v => v.status === t.key).length;
                  const active = vendorStatusTab === t.key;
                  return (
                    <button key={t.key} onClick={() => setVendorStatusTab(t.key)}
                      style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                        padding: "8px 16px", fontSize: 13, fontWeight: active ? 700 : 500,
                        color: active ? "#1a6ab1" : "#64748b",
                        borderBottom: active ? "2px solid #1a6ab1" : "2px solid transparent",
                        marginBottom: -2 }}>
                      {t.label}
                      <span style={{ marginLeft: 6, fontSize: 11, background: active ? "#dbeafe" : "#f1f5f9",
                        color: active ? "#1d4ed8" : "#64748b", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ ...s.mBody, overflowY: "auto", flex: 1 }}>
                {vpLoading ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Loading…</div>
                ) : displayed.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>No vendors in this category</div>
                ) : displayed.map(v => {
                  const cfg = STATUS_CFG[v.status] || STATUS_CFG.PENDING_APPROVAL;
                  const isPending = v.status === "PENDING_APPROVAL";
                  return (
                    <div key={v.id} style={{ border: `1px solid ${isPending ? "#fde68a" : "#e2eaf5"}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: isPending ? "#fffbeb" : "#f8fbff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{v.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px",
                              background: cfg.bg, color: cfg.color, display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
                              {cfg.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            {v.category && <span style={{ marginRight: 12 }}>📦 {v.category}</span>}
                            {v.email && <span style={{ marginRight: 12 }}>✉️ {v.email}</span>}
                            {v.phoneNumber && <span>📞 {v.phoneNumber}</span>}
                          </div>
                          {v.bankDetails && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>🏦 {v.bankDetails}</div>}
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Submitted: {v.createdAt ? v.createdAt.substring(0, 10) : "—"}</div>
                        </div>
                        {isVP && isPending && (
                          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 16 }}>
                            <button
                              style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                              onClick={async () => {
                                const r = await api.approveVendor(v.id);
                                if (r.success) {
                                  setAllVendorsStatus(a => a.map(x => x.id === v.id ? { ...x, status: "APPROVED", active: true } : x));
                                  showToast(`${v.name} approved ✅`);
                                } else showToast(r.message || "Failed", "error");
                              }}>
                              ✅ Approve
                            </button>
                            <button
                              style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                              onClick={async () => {
                                const r = await api.rejectVendor(v.id);
                                if (r.success) {
                                  setAllVendorsStatus(a => a.map(x => x.id === v.id ? { ...x, status: "REJECTED", active: false } : x));
                                  showToast(`${v.name} rejected`, "error");
                                } else showToast(r.message || "Failed", "error");
                              }}>
                              ❌ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── ASSIGN VENDOR / PWJ TYPE MODAL ─── */}
      {assignModal && (
        <div style={s.overlay} onClick={() => setAssignModal(null)}>
          <div style={{ ...s.modalBox(460) }} onClick={e => e.stopPropagation()}>
            <div style={s.mHeader}>
              <div>
                <div style={s.mTitle}>✏️ Assign Vendor & PWJ Type</div>
                <div style={s.mSub}>PWJ #{assignModal.id} · {assignModal.projectName}</div>
              </div>
              <button style={s.closeBtn} onClick={() => setAssignModal(null)}>✕</button>
            </div>
            <div style={s.mBody}>
              <div style={s.formGroup}>
                <label style={s.label}>Vendor</label>
                <select style={s.select2} value={assignForm.vendor}
                  onChange={e => setAssignForm(f => ({ ...f, vendor: e.target.value }))}>
                  <option value="">-- Select Vendor --</option>
                  {approvedVendors.map(v => (
                    <option key={v.id} value={v.name}>{v.name}{v.category ? ` · ${v.category}` : ""}</option>
                  ))}
                </select>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>PWJ Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["PO","Purchase Order","#dbeafe","#1d4ed8"],["WO","Work Order","#fef9c3","#92400e"],["JO","Job Order","#dcfce7","#166534"]].map(([val, desc, bg, col]) => (
                    <button key={val} type="button"
                      onClick={() => setAssignForm(f => ({ ...f, pwjType: f.pwjType === val ? "" : val }))}
                      style={{ flex: 1, border: assignForm.pwjType === val ? `2px solid ${col}` : "2px solid #e2e8f0", borderRadius: 10, padding: "10px 6px", cursor: "pointer", background: assignForm.pwjType === val ? bg : "#fff", transition: "all .15s", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: assignForm.pwjType === val ? col : "#64748b" }}>{val}</div>
                      <div style={{ fontSize: 10, color: assignForm.pwjType === val ? val === "PO" ? "#1d4ed8" : val === "WO" ? "#92400e" : "#166534" : "#94a3b8", marginTop: 2 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button style={{ ...s.submitBtn(), flex: 1 }} onClick={submitAssign} disabled={assignLoading}>
                  {assignLoading ? "Saving…" : "💾 Save"}
                </button>
                <button style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", color: "#475569" }}
                  onClick={() => setAssignModal(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── DOCUMENT PREVIEW MODAL ─── */}
      {docModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={() => setDocModal(null)}>
          <div style={{ background: "#fff", borderRadius: 20, width: "96%", maxWidth: 760, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 40px 100px rgba(0,0,0,.32)", overflow: "hidden", animation: "slideUp .2s ease" }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            {(() => {
              const e = docModal.entry; const v = docModal.vendor;
              const typeColor = e.pwjType === "PO" ? "#1d4ed8" : e.pwjType === "WO" ? "#92400e" : "#166534";
              const typeBg    = e.pwjType === "PO" ? "#dbeafe" : e.pwjType === "WO" ? "#fef3c7" : "#dcfce7";
              const typeName  = e.pwjType === "PO" ? "PURCHASE ORDER" : e.pwjType === "WO" ? "WORK ORDER" : "JOB ORDER";
              const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
              const docNum = e.docNumber || `${e.pwjType}-${new Date().getFullYear()}-${String(e.id).padStart(4,"0")}`;
              const statusColor = e.docStatus === "VP_APPROVED" ? "#166534" : e.docStatus === "PENDING_VP_APPROVAL" ? "#92400e" : e.docStatus === "VP_REJECTED" ? "#991b1b" : "#475569";
              const statusBg    = e.docStatus === "VP_APPROVED" ? "#dcfce7" : e.docStatus === "PENDING_VP_APPROVAL" ? "#fef3c7" : e.docStatus === "VP_REJECTED" ? "#fee2e2" : "#f1f5f9";
              const statusLabel = e.docStatus === "VP_APPROVED" ? "✅ VP Approved" : e.docStatus === "PENDING_VP_APPROVAL" ? "⏳ Pending VP Approval" : e.docStatus === "VP_REJECTED" ? "❌ VP Rejected" : "Draft";
              return (
                <>
                  {/* Top bar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ background: typeBg, color: typeColor, borderRadius: 8, padding: "4px 14px", fontWeight: 800, fontSize: 13 }}>{e.pwjType}</span>
                      <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: "#0f172a" }}>{typeName}</span>
                      <span style={{ background: statusBg, color: statusColor, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>{statusLabel}</span>
                    </div>
                    <button onClick={() => setDocModal(null)} style={{ background: "#e2e8f0", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "#64748b" }}>✕</button>
                  </div>

                  {/* Document body */}
                  <div style={{ overflowY: "auto", flex: 1, padding: "0" }}>
                    <div style={{ padding: "32px 40px", fontFamily: "'DM Sans', sans-serif" }}>

                      {/* Document header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #e2e8f0" }}>
                        <div>
                          <div style={{ fontSize: 26, fontWeight: 900, color: typeColor, fontFamily: "'Plus Jakarta Sans',sans-serif", letterSpacing: "-1px" }}>{typeName}</div>
                          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Document No: <strong style={{ color: "#0f172a" }}>{docNum}</strong></div>
                          <div style={{ fontSize: 13, color: "#64748b" }}>Date: <strong style={{ color: "#0f172a" }}>{today}</strong></div>
                          {e.boqNo && <div style={{ fontSize: 13, color: "#64748b" }}>BOQ Ref: <strong style={{ color: "#0f172a" }}>{e.boqNo}</strong></div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>PWJ Construction Pvt Ltd</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Procurement Department</div>
                        </div>
                      </div>

                      {/* Vendor / To section */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
                        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{e.pwjType === "JO" ? "Service Provider" : "Vendor / Supplier"}</div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{v?.name || e.vendor}</div>
                          {v?.gstNumber && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>GSTIN: {v.gstNumber}</div>}
                          {v?.contactPerson && <div style={{ fontSize: 12, color: "#64748b" }}>Contact: {v.contactPerson}</div>}
                          {v?.phoneNumber && <div style={{ fontSize: 12, color: "#64748b" }}>Phone: {v.phoneNumber}</div>}
                          {v?.email && <div style={{ fontSize: 12, color: "#64748b" }}>Email: {v.email}</div>}
                          {(v?.city || v?.state) && <div style={{ fontSize: 12, color: "#64748b" }}>{[v.street, v.city, v.state, v.zipCode].filter(Boolean).join(", ")}</div>}
                        </div>
                        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Project Details</div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{e.projectName}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Raised by: {e.raisedBy}</div>
                          {e.dateOfRequirement && <div style={{ fontSize: 12, color: "#64748b" }}>Required by: {e.dateOfRequirement}</div>}
                        </div>
                      </div>

                      {/* Item table */}
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                          {e.pwjType === "PO" ? "Item Details" : e.pwjType === "WO" ? "Scope of Work" : "Job Description"}
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: typeColor }}>
                              {["#","Description","Specification","Brand","Unit","Qty"].map(h => (
                                <th key={h} style={{ padding: "9px 12px", color: "#fff", fontWeight: 700, textAlign: "left", fontSize: 11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ background: "#fafbfe" }}>
                              <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>1</td>
                              <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>{e.materialRequired}</td>
                              <td style={{ padding: "10px 12px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{e.specification || "—"}</td>
                              <td style={{ padding: "10px 12px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{e.brand || "—"}</td>
                              <td style={{ padding: "10px 12px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>{e.unit || "—"}</td>
                              <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 700, borderBottom: "1px solid #e2e8f0" }}>{e.quantity ?? "—"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Terms */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                        {(v?.paymentDetails || v?.bankDetails) && (
                          <div style={{ background: "#fff8f0", borderRadius: 10, padding: "14px 16px", border: "1px solid #fed7aa" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#c2410c", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Payment Terms</div>
                            {v?.paymentDetails && <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>{v.paymentDetails}</div>}
                            {v?.bankDetails && <div style={{ fontSize: 12, color: "#475569" }}>Bank: {v.bankDetails}</div>}
                            {(!v?.paymentDetails && !v?.bankDetails) && <div style={{ fontSize: 12, color: "#94a3b8" }}>As per agreement</div>}
                          </div>
                        )}
                        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "14px 16px", border: "1px solid #bbf7d0" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Delivery Terms</div>
                          <div style={{ fontSize: 12, color: "#475569" }}>{v?.deliveryTerms || "As per standard terms"}</div>
                        </div>
                      </div>

                      {/* Remarks */}
                      {e.remarks && (
                        <div style={{ background: "#fafbfe", borderRadius: 10, padding: "12px 16px", border: "1px solid #e2e8f0", marginBottom: 12, fontSize: 12, color: "#475569" }}>
                          <strong>Remarks:</strong> {e.remarks}
                        </div>
                      )}

                      {/* VP Comments — shown inline in doc body for Engineer; Procurement gets the footer banner */}
                      {e.docComments && (isEngineer || e.docStatus === "VP_APPROVED") && (
                        <div style={{ background: e.docStatus === "REVISION_REQUESTED" ? "#fff7ed" : e.docStatus === "VP_REJECTED" ? "#fff1f2" : "#f0fdf4", borderRadius: 10, padding: "14px 16px", border: `1.5px solid ${e.docStatus === "REVISION_REQUESTED" ? "#fed7aa" : e.docStatus === "VP_REJECTED" ? "#fecdd3" : "#bbf7d0"}`, marginBottom: 20 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: e.docStatus === "REVISION_REQUESTED" ? "#c2410c" : e.docStatus === "VP_REJECTED" ? "#be123c" : "#166534", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                            {e.docStatus === "REVISION_REQUESTED" ? "⚠️ VP Revision Request" : e.docStatus === "VP_REJECTED" ? "❌ VP Comments" : "✅ VP Comments"}
                          </div>
                          <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.6 }}>{e.docComments}</div>
                        </div>
                      )}

                      {/* Signature */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 32, paddingTop: 20, borderTop: "2px dashed #e2e8f0" }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 30 }}>Prepared by Procurement</div>
                          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: 4, fontSize: 11, color: "#475569" }}>Signature & Date</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 30 }}>VP Approval</div>
                          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: 4, fontSize: 11, color: "#475569" }}>
                            {e.docStatus === "VP_APPROVED" ? <span style={{ color: "#166534", fontWeight: 700 }}>✅ Approved by VP</span> : e.docStatus === "VP_REJECTED" ? <span style={{ color: "#991b1b", fontWeight: 700 }}>❌ Rejected by VP</span> : "Signature & Date"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>

                    {/* Engineer upload section — shown when doc is VP_APPROVED */}
                    {isEngineer && e.docStatus === "VP_APPROVED" && (
                      <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                          📎 Upload Supporting Document
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ flex: 1, minWidth: 200, border: "1.5px dashed #94a3b8", borderRadius: 10, padding: "10px 14px", cursor: "pointer", background: "#fff", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: engDocFile ? "#0f172a" : "#94a3b8" }}>
                            <input type="file" accept="image/*,.pdf,.doc,.docx" style={{ display: "none" }}
                              onChange={e2 => setEngDocFile(e2.target.files[0] || null)} />
                            {engDocFile ? `📄 ${engDocFile.name}` : "Choose file (image, PDF, Word)…"}
                          </label>
                          <button onClick={uploadAndNotify} disabled={!engDocFile || engDocUploading}
                            style={{ background: engDocFile ? "linear-gradient(135deg,#0369a1,#0ea5e9)" : "#e2e8f0", border: "none", borderRadius: 10, padding: "10px 20px", color: engDocFile ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 13, cursor: engDocFile ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                            {engDocUploading ? "Uploading…" : "📤 Upload & Notify"}
                          </button>
                        </div>
                        {e.deliveryDocUrl && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a", display: "flex", alignItems: "center", gap: 6 }}>
                            ✅ Document already uploaded —
                            <a href={`http://192.168.1.16:8080${e.deliveryDocUrl}`} target="_blank" rel="noreferrer"
                              style={{ color: "#0369a1", fontWeight: 600 }}>View uploaded doc</a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Revision notice + actions for Procurement */}
                    {(isAdmin || isProcurement) && e.docStatus === "REVISION_REQUESTED" && e.docComments && (
                      <div style={{ margin: "0 24px 0", padding: "14px 18px", background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                          ⚠️ VP Revision Request
                        </div>
                        <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.6, marginBottom: 12 }}>{e.docComments}</div>
                        <div style={{ fontSize: 12, color: "#78350f" }}>
                          Edit the entry as needed, then resubmit for VP approval.
                        </div>
                        <button
                          onClick={() => { setDocModal(null); openAssign(e); }}
                          style={{ marginTop: 10, background: "linear-gradient(135deg,#c2410c,#f97316)", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          ✏️ Edit Vendor / PWJ Type
                        </button>
                      </div>
                    )}

                    <div style={{ padding: "14px 24px", display: "flex", gap: 10 }}>
                      {e.docStatus === "VP_APPROVED" && !isEngineer && (
                        <button onClick={downloadDoc}
                          style={{ flex: 1, background: "linear-gradient(135deg,#166534,#16a34a)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          ⬇ Download PDF
                        </button>
                      )}
                      {(isAdmin || isProcurement) && e.docStatus !== "PENDING_VP_APPROVAL" && e.docStatus !== "VP_APPROVED" && (
                        <button onClick={sendDocForApproval} disabled={docLoading}
                          style={{ flex: 1, background: e.docStatus === "REVISION_REQUESTED" ? "linear-gradient(135deg,#c2410c,#f97316)" : "linear-gradient(135deg,#5b21b6,#7c3aed)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                          {docLoading ? "Sending…" : e.docStatus === "REVISION_REQUESTED" ? "🚀 Resubmit for VP Approval" : "🚀 Send for VP Approval"}
                        </button>
                      )}
                      <button onClick={() => { setDocModal(null); setEngDocFile(null); }}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", color: "#475569" }}>
                        Close
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ─── VP PENDING DOC APPROVALS MODAL ─── */}
      {pendingDocsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setPendingDocsModal(false)}>
          <div style={{ background: "#fff", borderRadius: 24, width: "96%", maxWidth: 820, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 40px 100px rgba(0,0,0,.28)", overflow: "hidden", animation: "slideUp .2s ease" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 28px 18px", borderBottom: "1px solid #f1f5f9" }}>
              <div>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: "#0f172a" }}>📄 Document Approvals</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{pendingDocs.length} document{pendingDocs.length !== 1 ? "s" : ""} pending VP review</div>
              </div>
              <button onClick={() => setPendingDocsModal(false)} style={{ background: "#f1f5f9", border: "none", color: "#64748b", width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 28px" }}>
              {pendingDocsLoading ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>
              ) : pendingDocs.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 15 }}>No documents pending approval</div>
              ) : pendingDocs.map(doc => {
                const typeColor = doc.pwjType === "PO" ? "#1d4ed8" : doc.pwjType === "WO" ? "#92400e" : "#166534";
                const typeBg    = doc.pwjType === "PO" ? "#dbeafe" : doc.pwjType === "WO" ? "#fef3c7" : "#dcfce7";
                const typeName  = doc.pwjType === "PO" ? "Purchase Order" : doc.pwjType === "WO" ? "Work Order" : "Job Order";
                return (
                  <div key={doc.id} style={{ background: "#fafbfe", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 22px", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ background: typeBg, color: typeColor, borderRadius: 6, padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>{doc.pwjType}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{doc.docNumber}</span>
                          <span style={{ fontSize: 12, color: "#64748b" }}>· {typeName}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600, marginBottom: 2 }}>{doc.materialRequired}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{doc.projectName} · Vendor: <strong>{doc.vendor}</strong></div>
                        {doc.quantity && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Qty: {doc.quantity} {doc.unit} · Raised by: {doc.raisedBy}</div>}
                      </div>
                      <button onClick={() => openDocModal(doc)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569", fontFamily: "inherit", marginLeft: 16, flexShrink: 0 }}>
                        👁 Preview
                      </button>
                    </div>
                    {/* VP Comment box */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".04em" }}>Comments / Notes (optional)</div>
                      <textarea
                        rows={2}
                        placeholder="Add comments for Procurement — e.g. pricing concerns, revision needed, approved as-is…"
                        value={vpCommentMap[doc.id] || ""}
                        onChange={ev => setVpCommentMap(m => ({ ...m, [doc.id]: ev.target.value }))}
                        style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", background: "#fff", color: "#0f172a", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleDocApprove(doc.id)} style={{ flex: 1, background: "linear-gradient(135deg,#166534,#16a34a)", border: "none", borderRadius: 8, padding: "9px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        ✅ Approve
                      </button>
                      <button onClick={() => handleDocReject(doc.id)} style={{ flex: 1, background: "linear-gradient(135deg,#991b1b,#ef4444)", border: "none", borderRadius: 8, padding: "9px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── MANAGE USERS MODAL ─── */}
      {userMgmtModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setUserMgmtModal(false)}>
          <div style={{ background: "#fff", borderRadius: 28, width: "96%", maxWidth: 860, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 40px 100px rgba(0,0,0,.28)", overflow: "hidden", animation: "slideUp .2s ease" }} onClick={e => e.stopPropagation()}>

            {/* ── Top bar ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 28px 18px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 18, color: "#0f172a" }}>Manage Users</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{allUsers.length} team members</div>
              </div>
              <button onClick={() => setUserMgmtModal(false)}
                style={{ background: "#f1f5f9", border: "none", color: "#64748b", width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* ── Add user row ── */}
            <div style={{ padding: "16px 28px", borderBottom: "1px solid #f1f5f9", background: "#fafbfe", flexShrink: 0 }}>
              {/* Row 1: Full Name, Username, Password, Role */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end", marginBottom: 10 }}>
                {[["Full Name","fullName","text"],["Username","username","text"],["Password","password","password"]].map(([ph, key, type]) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>{ph}</div>
                    <input type={type} placeholder={ph} value={newUserForm[key]}
                      onChange={e => setNewUserForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: "100%", border: "1.5px solid #e8ecf2", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "#0f172a" }} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>Role</div>
                  <select value={newUserForm.role} onChange={e => setNewUserForm(f => ({ ...f, role: e.target.value }))}
                    style={{ border: "1.5px solid #e8ecf2", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: "#0f172a", cursor: "pointer" }}>
                    <option value="ENGINEER">Engineer</option>
                    <option value="PROCUREMENT">Procurement</option>
                    <option value="ADMIN">Admin</option>
                    <option value="VP">VP</option>
                  </select>
                </div>
              </div>
              {/* Row 2: Email (wide) + Add button */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>Email</div>
                  <input type="email" placeholder="Email address" value={newUserForm.email}
                    onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))}
                    style={{ width: "100%", border: "1.5px solid #e8ecf2", borderRadius: 10, padding: "9px 14px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "#0f172a" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>&nbsp;</div>
                  <button onClick={submitNewUser}
                    style={{ background: "#0f172a", border: "none", borderRadius: 10, padding: "9px 24px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    + Add Member
                  </button>
                </div>
              </div>
            </div>

            {/* ── Users table ── */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 160px 120px 90px", gap: 0, padding: "10px 28px", borderBottom: "1px solid #f1f5f9" }}>
                {["","Member","Role","Joined",""].map((h, i) => (
                  <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .8 }}>{h}</div>
                ))}
              </div>

              {userMgmtLoading ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>
              ) : allUsers.map((u, idx) => {
                const AVATAR_GRAD = {
                  VP:          "linear-gradient(135deg,#f59e0b,#d97706)",
                  ADMIN:       "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                  PROCUREMENT: "linear-gradient(135deg,#10b981,#059669)",
                  ENGINEER:    "linear-gradient(135deg,#3b82f6,#2563eb)",
                };
                const rm = ROLE_META[u.role] || { label: u.role, color: "#475569", bg: "#f1f5f9" };
                const isSelf = u.id === user.id;
                const canRemove = !isSelf && (isVP || u.role !== "VP");
                const initials = (u.fullName || u.username).split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
                return (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: "52px 1fr 160px 120px 90px", gap: 0, alignItems: "center", padding: "13px 28px", borderBottom: "1px solid #f8fafc", background: idx % 2 === 0 ? "#fff" : "#fafbfe", transition: "background .12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f0f7ff"}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafbfe"}>

                    {/* Avatar */}
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: AVATAR_GRAD[u.role] || "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif", flexShrink: 0 }}>
                      {initials}
                    </div>

                    {/* Name + username */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{u.fullName}</span>
                        {isSelf && <span style={{ fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", borderRadius: 20, padding: "1px 8px" }}>You</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>@{u.username}{u.email ? `  ·  ${u.email}` : ""}</div>
                    </div>

                    {/* Role badge */}
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, borderRadius: 20, padding: "4px 12px", background: rm.bg, color: rm.color }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: rm.color, opacity: .7 }} />
                        {rm.label}
                      </span>
                    </div>

                    {/* Joined */}
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "—"}
                    </div>

                    {/* Action */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      {canRemove && (
                        <button onClick={() => deactivateUser(u.id, u.username)}
                          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18, padding: "4px 8px", borderRadius: 8, fontFamily: "inherit", lineHeight: 1 }}
                          title={`Remove ${u.fullName}`}
                          onMouseEnter={e => { e.currentTarget.style.color="#dc2626"; e.currentTarget.style.background="#fee2e2"; }}
                          onMouseLeave={e => { e.currentTarget.style.color="#94a3b8"; e.currentTarget.style.background="none"; }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW VENDOR MODAL ─── */}
      {viewVendor && (() => {
        const vv = viewVendor;
        const statusColor = vv.status === "APPROVED" ? "#16a34a" : vv.status === "REJECTED" ? "#dc2626" : "#d97706";
        const statusBg    = vv.status === "APPROVED" ? "#dcfce7"  : vv.status === "REJECTED" ? "#fee2e2"  : "#fef9c3";
        const Row = ({ label, value }) => value ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
            <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500, wordBreak: "break-word" }}>{value}</div>
          </div>
        ) : null;
        const SectionHead = ({ icon, title }) => (
          <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 8, padding: "10px 0 6px", borderBottom: "1.5px solid #e2eaf5", marginTop: 8 }}>
            <span style={{ fontSize: 15 }}>{icon}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#334155" }}>{title}</span>
          </div>
        );
        let contacts = [];
        try { contacts = vv.contacts ? JSON.parse(vv.contacts) : []; } catch(_) {}
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={() => setViewVendor(null)}>
            <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ background: "linear-gradient(135deg,#1a6ab1,#2563eb)", padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{vv.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", marginTop: 3 }}>
                    {vv.category || "—"} {vv.vendorCode ? `· Code: ${vv.vendorCode}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, background: statusBg, color: statusColor, borderRadius: 20, padding: "4px 14px" }}>{vv.status || "PENDING"}</span>
                  <button onClick={() => setViewVendor(null)}
                    style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, width: 32, height: 32, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
              </div>
              {/* Body */}
              <div style={{ overflowY: "auto", padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: 4 }}>
                {/* Vendor Details */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                  <SectionHead icon="🏢" title="Vendor Details" />
                  <Row label="Vendor Name"    value={vv.name} />
                  <Row label="GST Number"     value={vv.gstNumber} />
                  <Row label="Category"       value={vv.category} />
                  <Row label="Tags"           value={vv.tags} />
                  <Row label="Ratings"        value={vv.ratings ? `${"★".repeat(Math.round(vv.ratings))} (${vv.ratings})` : null} />
                  <Row label="Joining Date"   value={vv.joiningDate} />
                  <Row label="Vendor Doc"     value={vv.vendorDocUrl ? "Uploaded ✓" : null} />
                </div>
                {/* Vendor Profile */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginTop: 8 }}>
                  <SectionHead icon="👤" title="Vendor Profile" />
                  <Row label="Contact Person" value={vv.contactPerson} />
                  <Row label="Phone"          value={vv.phoneNumber} />
                  <Row label="Email"          value={vv.email} />
                  <Row label="Website"        value={vv.website} />
                  <Row label="Vendor Code"    value={vv.vendorCode} />
                  <Row label="Currency"       value={vv.currency} />
                  <Row label="Language"       value={vv.language} />
                  <SectionHead icon="📍" title="Address" />
                  <Row label="Country"   value={vv.country} />
                  <Row label="State"     value={vv.state} />
                  <Row label="City"      value={vv.city} />
                  <Row label="Zip Code"  value={vv.zipCode} />
                  {vv.street && <div style={{ gridColumn: "1/-1" }}><Row label="Street" value={vv.street} /></div>}
                </div>
                {/* Contacts */}
                {contacts.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <SectionHead icon="📇" title="Additional Contacts" />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {contacts.map((c, i) => (
                        <div key={i} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 16px" }}>
                          <Row label="Name"  value={c.name} />
                          <Row label="Phone" value={c.phone} />
                          <Row label="Email" value={c.email} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Bank Details */}
                {(vv.bankName || vv.accountNumber || vv.ifscCode || vv.bankDetails) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginTop: 8 }}>
                    <SectionHead icon="🏦" title="Bank Details" />
                    <Row label="Bank Name"       value={vv.bankName} />
                    <Row label="Account Number"  value={vv.accountNumber} />
                    <Row label="IFSC Code"       value={vv.ifscCode} />
                    {vv.bankDetails && <div style={{ gridColumn: "1/-1" }}><Row label="Bank Details" value={vv.bankDetails} /></div>}
                    <Row label="Payment Terms"   value={vv.paymentDetails} />
                    <Row label="Delivery Terms"  value={vv.deliveryTerms} />
                  </div>
                )}
                {/* Policies */}
                {(vv.maximumReturnDays || vv.returnFees || vv.listVendorPolicies) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginTop: 8 }}>
                    <SectionHead icon="📋" title="Vendor Policies" />
                    <Row label="Max Return Days"            value={vv.maximumReturnDays != null ? String(vv.maximumReturnDays) : null} />
                    <Row label="Return Fees"                value={vv.returnFees} />
                    <Row label="Vendor Pays Return Shipping" value={vv.vendorPaysReturnShipping ? "Yes" : null} />
                    {vv.listVendorPolicies && <div style={{ gridColumn: "1/-1" }}><Row label="Policies" value={vv.listVendorPolicies} /></div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── TOAST ─── */}
      {toast && <div style={s.toast(toast.type)}>{toast.msg}</div>}
    </>
  );
}
