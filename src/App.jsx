import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import html2pdf from "html2pdf.js";
import AccountSection from "./account/AccountSection";
import { FileText, Building2, FolderKanban, BarChart2, Home, Users, UserCog, Settings2, Bot, TrendingUp, Download, Clock, FileCheck, Database, Plus, LogOut, Bug } from "lucide-react";
import SalesPage from "./account/SalesPage";
import HRSection from "./hr/HRSection";
import BugTrackerPage from "./bugs/BugTrackerPage";

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

// ── OCR for statutory documents (GST / MSME / TAN / PAN) ───────────
async function ocrExtractStatutoryField(imageFile, fieldType) {
  const form = new FormData();
  form.append("file",       imageFile);
  form.append("apikey",     "K85821541288957");
  form.append("language",   "eng");
  form.append("OCREngine",  "2");
  form.append("scale",      "true");
  form.append("detectOrientation", "true");
  form.append("isOverlayRequired", "false");

  const res  = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  const json = await res.json();
  if (json?.IsErroredOnProcessing) throw new Error(json?.ErrorMessage?.[0] || "OCR error");
  const t = json?.ParsedResults?.[0]?.ParsedText || "";

  const PATTERNS = {
    gstNumber:  [/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i],
    msmeNumber: [/UDYAM[-\s]?[A-Z]{2}[-\s]?\d{2}[-\s]?\d{7}/i, /\bUDYAM[A-Z0-9\-]{5,14}\b/i],
    tanNumber:  [/\b[A-Z]{4}[0-9]{5}[A-Z]\b/],
    panNumber:  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/],
  };

  for (const re of (PATTERNS[fieldType] || [])) {
    const m = t.match(re);
    if (m?.[0]) return m[0].replace(/\s/g, "").toUpperCase();
  }
  return "";
}

// ─── API CONFIG ────────────────────────────────────────────────────
const BACKEND_BASE  = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const API_BASE      = `${BACKEND_BASE}/api/v1/pwj`;
const VENDOR_BASE   = `${BACKEND_BASE}/api/v1/vendors`;
const AUTH_BASE     = `${BACKEND_BASE}/api/v1/auth`;
const PROJECT_BASE  = `${BACKEND_BASE}/api/v1/projects`;
const REPORT_BASE   = `${BACKEND_BASE}/api/v1/report`;

const getSessionToken = () => {
  try { return JSON.parse(localStorage.getItem("pwj_user"))?.token || ""; } catch { return ""; }
};

// Identifies the logged-in user to the backend so test-account data can be
// kept separate from production data/views.
const userHeaders = () => {
  try {
    const u = JSON.parse(localStorage.getItem("pwj_user"));
    const name = u?.fullName || u?.username;
    return name ? { "X-User-Name": name } : {};
  } catch { return {}; }
};

const api = {
  login: (body) =>
    fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  logout: (token) =>
    fetch(`${AUTH_BASE}/logout`, {
      method: "POST",
      headers: { "X-Session-Token": token ?? getSessionToken() },
    }).then(r => r.json()).catch(() => {}),
  validateSession: () =>
    fetch(`${AUTH_BASE}/validate`, {
      headers: { "X-Session-Token": getSessionToken() },
    }).then(r => r.json()),
  getEntries: (params) => {
    const q = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/entries?${q}`, { headers: userHeaders() }).then(r => r.json());
  },
  getMyEntries: (raisedBy, params) => {
    const q = new URLSearchParams({ ...params, raisedBy }).toString();
    return fetch(`${API_BASE}/entries/my?${q}`, { headers: userHeaders() }).then(r => r.json());
  },
  getProjects: () => fetch(`${API_BASE}/projects`).then(r => r.json()),
  getPending: () => fetch(`${API_BASE}/pending-approvals`, { headers: userHeaders() }).then(r => r.json()),
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
  createEntry: (body, userName) =>
    fetch(`${API_BASE}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(userName ? { "X-User-Name": userName } : {}) },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  deleteEntry: (id) =>
    fetch(`${API_BASE}/entries/${id}`, { method: "DELETE" }).then(r => r.json()),
  getAllEntries: (params) => {
    const q = new URLSearchParams({ ...params, size: 9999, page: 0 }).toString();
    return fetch(`${API_BASE}/entries?${q}`, { headers: userHeaders() }).then(r => r.json());
  },
  uploadImage: (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BACKEND_BASE}/api/v1/upload/image`, { method: "POST", body: form }).then(r => r.json());
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
  deleteVendor: (id) => fetch(`${VENDOR_BASE}/${id}`, { method: "DELETE" }).then(r => r.json()),
  updateVendor: (id, body) =>
    fetch(`${VENDOR_BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  getUsers: () => fetch(`${AUTH_BASE.replace("/auth", "/users")}`).then(r => r.json()),
  createUser: (body) => fetch(`${AUTH_BASE.replace("/auth", "/users")}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(r => r.json()),
  deactivateUser: (id) => fetch(`${AUTH_BASE.replace("/auth", "/users")}/${id}`, { method: "DELETE" }).then(r => r.json()),
  updateUserPhone: (id, phone) => fetch(`${AUTH_BASE.replace("/auth", "/users")}/${id}/phone`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) }).then(r => r.json()),
  updateUserName:     (id, fullName) => fetch(`${AUTH_BASE.replace("/auth", "/users")}/${id}/name`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName }) }).then(r => r.json()),
  updateUsername:     (id, username) => fetch(`${AUTH_BASE.replace("/auth", "/users")}/${id}/username`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) }).then(r => r.json()),
  changeUserPassword: (id, newPassword) => fetch(`${AUTH_BASE.replace("/auth", "/users")}/${id}/password`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword }) }).then(r => r.json()),
  getVendorByName: (name) => fetch(`${VENDOR_BASE}/by-name?name=${encodeURIComponent(name)}`).then(r => r.json()),
  updateEntry: (id, body) => fetch(`${API_BASE}/entries/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
  submitDoc: (id) => fetch(`${API_BASE}/entries/${id}/submit-doc`, { method: "PATCH" }).then(r => r.json()),
  approveDoc: (id, comment) => fetch(`${API_BASE}/entries/${id}/doc-approve`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: comment || "" }) }).then(r => r.json()),
  revokeDoc:  (id, reason)  => fetch(`${API_BASE}/entries/${id}/doc-revoke`,  { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason || "" }) }).then(r => r.json()),
  rejectDoc: (id, comment) => fetch(`${API_BASE}/entries/${id}/doc-reject`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: comment || "" }) }).then(r => r.json()),
  getPendingDocApprovals: () => fetch(`${API_BASE}/pending-doc-approvals`, { headers: userHeaders() }).then(r => r.json()),
  sendVendorDoc: (id, htmlContent) => fetch(`${API_BASE}/entries/${id}/send-vendor-doc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ htmlContent }),
  }).then(r => r.json()),
  toggleVendorEmail: (id) => fetch(`${API_BASE}/entries/${id}/toggle-vendor-email`, { method: "PATCH" }).then(r => r.json()),
  triggerBackup: () => fetch(`${REPORT_BASE}/trigger-backup`, { method: "POST" }).then(r => r.json()),
  downloadBackup: () => fetch(`${REPORT_BASE}/download-backup`),
  restoreBackup: (file) => { const fd = new FormData(); fd.append("file", file); return fetch(`${REPORT_BASE}/restore`, { method: "POST", body: fd }).then(r => r.json()); },
  uploadDocument: (file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BACKEND_BASE}/api/v1/upload/document`, { method: "POST", body: form }).then(r => r.json());
  },
  processVendorImage: (imageUrl) => fetch(`${VENDOR_BASE}/process-image`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl }),
  }).then(r => r.json()),
  deliveryUpdate: (id, body) =>
    fetch(`${API_BASE}/entries/${id}/delivery`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  splitByVendor: (id, splits) =>
    fetch(`${API_BASE}/entries/${id}/split-by-vendor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(splits),
    }).then(r => r.json()),
  getManagedProjects: () => fetch(PROJECT_BASE).then(r => r.json()),
  getBudgetSummary: () => fetch(`${API_BASE}/pwj/budget-summary`, { headers: userHeaders() }).then(r => r.json()),
  getActiveProjects: () => fetch(`${PROJECT_BASE}/active`).then(r => r.json()),
  getProjectClients: () => fetch(`${PROJECT_BASE}/clients`).then(r => r.json()),
  createProject: (body) => fetch(PROJECT_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
  updateProject: (id, body) => fetch(`${PROJECT_BASE}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
  deleteProject: (id) => fetch(`${PROJECT_BASE}/${id}`, { method: "DELETE" }).then(r => r.json()),
  permanentDeleteProject: (id) => fetch(`${PROJECT_BASE}/${id}/permanent`, { method: "DELETE" }).then(r => r.json()),
};

// ─── HAPPIZO DOCUMENT CONSTANTS ────────────────────────────────────
const HAPPIZO_LOGO_URL = "/happizo-logo.png";

const PROCUREMENT_SIGNATURE_URL = "/procurement-signature.png";
const VP_SIGNATURE_URL = "/vp-signature.png";

const COMPANY_INFO = {
  name: "Happizo Infrastructure and Solutions",
  addr1: "No.11/ 20, Ground floor, 2nd cross street",
  addr2: "Indira nagar, Adyar, Chennai 600020.",
  gst:   "33EKIPS2810E1ZD",
};

const PO_TERMS = [
  "Proof of material delivery should be signed and approved by our site engineer along with DC copy for payment process",
  "Any material, if found unsuitable or bad quality or damaged during supply, shall be re-supplied at no extra cost",
  "Destination detail, PO reference and all details to be mentioned clearly on the invoice",
  "Billing will be as per actuals",
  "Billing qty change: Invoice value cannot exceed PO value. If exceeding, invoice will not be processed. Final value if found exceeding to PO received, invoice it only with another additional PO.",
  "Transport/ loading/unloading at vendor scope and not included in the above cost",
  "In case of any delay in supply / work thereby causing delay in work completion, the same will be outsourced and the amount incurred will be debited",
  "GST : The tax amount will be paid only after the vendor has filed on GST and reflected in our portal. Incase vendor fails to pay the same, payments shall be withheld for subsequent stages, next projects",
];

const WO_TERMS = [
  "Proof of work delivery should be signed and approved by our site engineer along with measurement sheet, for payment process",
  "Any work, if found unsuitable or bad quality or damaged during supply, shall be re-supplied /re-installed/ redone, at no extra cost",
  "Destination detail, PO reference and all details to be mentioned clearly on the invoice",
  "Billing will be as per actuals",
  "Billing qty change: Invoice value cannot exceed PO value. If exceeding, invoice will not be processed. Final value if found exceeding to PO received, invoice it only with another additional PO.",
  "Transport/ loading/unloading at vendor scope and not included in the above cost",
  "In case of any delay in supply / work thereby causing delay in work completion, the same will be outsourced and the amount incurred will be debited",
  "GST : The tax amount will be paid only after the vendor has filed on GST and reflected in our portal. Incase vendor fails to pay the same, payments shall be withheld for subsequent stages, next projects",
];

const JO_TERMS = [
  "Proof of work delivery should be signed and approved by our site engineer along with measurement sheet, for payment process",
  "Any work, if found unsuitable or bad quality or damaged during supply, shall be re-supplied /re-installed/ redone, at no extra cost",
  "Destination detail, JO reference and all details to be mentioned clearly on the invoice",
  "Billing will be as per actuals",
  "Billing qty change: Invoice value cannot exceed JO value. If exceeding, invoice will not be processed. Final value if found exceeding to JO received, invoice it only with another additional JO.",
  "Transport/ loading/unloading at vendor scope and not included in the above cost",
  "In case of any delay in supply / work thereby causing delay in work completion, the same will be outsourced and the amount incurred will be debited",
  "GST : The tax amount will be paid only after the vendor has filed on GST and reflected in our portal. Incase vendor fails to pay the same, payments shall be withheld for subsequent stages, next projects",
];

function parseImageRefs(ref) {
  if (!ref) return [];
  try { const p = JSON.parse(ref); return Array.isArray(p) ? p : [ref]; }
  catch { return [ref]; }
}

// Shows image thumbnail; falls back to a clickable "View Image" link if the image fails to load.
// This handles Railway's ephemeral storage (files wiped on redeploy) and any network issue.
function ImageOrLink({ src, label, thumbStyle = {} }) {
  const [failed, setFailed] = useState(false);
  const isPdf = src && src.toLowerCase().endsWith(".pdf");
  if (isPdf || failed) {
    return (
      <a href={src} target="_blank" rel="noreferrer"
        style={{ display:"inline-flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          gap:4, padding:"12px 16px", background:"#fef2f2", borderRadius:8, color:"#ef4444",
          fontSize:12, fontWeight:700, textDecoration:"none", border:"1.5px solid #fecaca",
          minWidth:72, cursor:"pointer", ...thumbStyle }}>
        <span style={{ fontSize:24 }}>📄</span>
        <span>PDF</span>
      </a>
    );
  }
  return (
    <img src={src} alt={label}
      style={{ maxHeight:180, maxWidth:"100%", borderRadius:8,
        border:"1px solid #e2eaf5", objectFit:"contain", cursor:"pointer", ...thumbStyle }}
      onClick={() => window.open(src, "_blank")}
      onError={() => setFailed(true)} />
  );
}

function fmtDate(val) {
  if (!val) return "—";
  const s = String(val).substring(0, 10); // take YYYY-MM-DD part
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return val;
  return `${d}/${m}/${y}`;
}

// Converts a YYYY-MM-DD value (e.g. from <input type="date">) to DD-MM-YYYY for display
function fmtDateDash(val) {
  if (!val) return "";
  const s = String(val).substring(0, 10);
  const [y, m, d] = s.split("-");
  return (!y || !m || !d) ? s : `${d}-${m}-${y}`;
}

// Small red notification badge — shows a pending-approval count on tabs/tiles
function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      position: "absolute", top: -6, right: -6, minWidth: 18, height: 18,
      background: "#ef4444", color: "#fff", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
      border: "2px solid #fff", lineHeight: 1, boxShadow: "0 1px 3px rgba(0,0,0,.25)",
    }}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

const UNITS = ["SqFt","SqM","RFt","RM","Ls","Nos","CuM","Set","Kg","Box","Roll","Bag","CFt","Litre","Ton","Bundle","Job","Load","EA"];

function parseDocData(entry) {
  const base = {
    items: [
      { item: "", unit: entry.unit || "", qty: entry.quantity != null ? String(entry.quantity) : "", rate: "" },
      { item: "", unit: "", qty: "", rate: "" },
      { item: "", unit: "", qty: "", rate: "" },
      { item: "", unit: "", qty: "", rate: "" },
    ],
    amountInWords: "", cgstPct: "9", sgstPct: "9", igstPct: "0",
    completionDate: entry.dateOfRequirement || "", supplyDate: "", installationDate: "",
    deliveryAddress: "", contactDetails: "", kindAttn: "", kindAttnSalutation: "", msme: "", panNumber: "", gstNumber: "",
    vendorAddress1: "", vendorAddress2: "",
    stage1: "", stage2: "", stage3: "", stageF: "",
    vendorInvoices: [], deliveryDocs: [],
    signatureEnabled: false, signatureUrl: "",
  };
  if (entry.docData) {
    try {
      const parsed = JSON.parse(entry.docData);
      // Keep only the saved items — don't pad with empty rows
      const mergedItems = (parsed.items || []).length > 0 ? parsed.items : base.items;
      return { ...base, ...parsed, items: mergedItems };
    } catch (_) {}
  }
  return base;
}

function autoDocNumber(entry) {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const fyStart = m >= 4 ? y : y - 1;
  const fy = String(fyStart % 100).padStart(2, "0") + String((fyStart + 1) % 100).padStart(2, "0");
  const seq = String(entry.id).padStart(4, "0");
  return `${entry.pwjType}-${fy}-${seq}`;
}

function amountToWords(amount) {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
                 "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
                 "Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const twoDigits = n => n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n%10 ? " "+ones[n%10] : "");
  const threeDigits = n => n >= 100
    ? ones[Math.floor(n/100)]+" Hundred"+(n%100 ? " and "+twoDigits(n%100) : "")
    : twoDigits(n);
  const convert = n => {
    if (n === 0) return "Zero";
    let r = "", rem = n;
    const cr  = Math.floor(rem/10000000); rem %= 10000000;
    const lk  = Math.floor(rem/100000);   rem %= 100000;
    const th  = Math.floor(rem/1000);     rem %= 1000;
    if (cr)  r += twoDigits(cr)  + " Crore ";
    if (lk)  r += twoDigits(lk)  + " Lakh ";
    if (th)  r += twoDigits(th)  + " Thousand ";
    if (rem) r += threeDigits(rem);
    return r.trim();
  };
  const total   = Math.round(amount * 100) / 100;
  const rupees  = Math.floor(total);
  const paise   = Math.round((total - rupees) * 100);
  const rWords  = convert(rupees);
  return paise
    ? `Indian Rupees ${rWords} and Paise ${twoDigits(paise)} Only`
    : `Indian Rupees ${rWords} Only`;
}

function calcTotals(items, cgstPct, sgstPct, igstPct) {
  const subTotal = items.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0), 0);
  const cgst = subTotal * (parseFloat(cgstPct) || 0) / 100;
  const sgst = subTotal * (parseFloat(sgstPct) || 0) / 100;
  const igst = subTotal * (parseFloat(igstPct) || 0) / 100;
  const rawTotal = subTotal + cgst + sgst + igst;
  const total = Math.round(rawTotal);
  return { subTotal, cgst, sgst, igst, total };
}

// ─── ROLE HELPERS ──────────────────────────────────────────────────
const ROLE_META = {
  ADMIN:           { label: "Admin",           color: "#7c3aed", bg: "#ede9fe" },
  ENGINEER:        { label: "Engineer",        color: "#0369a1", bg: "#e0f2fe" },
  PROCUREMENT:     { label: "Procurement",     color: "#065f46", bg: "#d1fae5" },
  VP:              { label: "VP",              color: "#b45309", bg: "#fef3c7" },
  OH:              { label: "OH",              color: "#be185d", bg: "#fce7f3" },
  CEO:             { label: "CEO",             color: "#dc2626", bg: "#fee2e2" },
  PROJECT_MANAGER: { label: "Project Manager", color: "#0f766e", bg: "#ccfbf1" },
};

// ─── ENGINEER UPLOAD SECTION (top-level to keep stable reference) ──
function EngUploadSection({ title, icon, type, files, setFiles, uploading, stored, onUpload, canUpload }) {
  return (
    <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
        {icon} {title}
      </div>
      {stored.length > 0 && (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {stored.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", borderRadius: 8, padding: "6px 12px" }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <a href={`${BACKEND_BASE}${f.url}`} target="_blank" rel="noreferrer"
                style={{ flex: 1, fontSize: 12, color: "#0369a1", fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name || `File ${i + 1}`}
              </a>
              <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{f.uploadedAt || ""}</span>
            </div>
          ))}
        </div>
      )}
      {canUpload && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ flex: 1, minWidth: 200, border: "1.5px dashed #94a3b8", borderRadius: 10, padding: "9px 14px", cursor: "pointer", background: "#fff", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: files.length ? "#0f172a" : "#94a3b8" }}>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx" style={{ display: "none" }}
              onChange={ev => setFiles(Array.from(ev.target.files))} />
            {files.length ? `${files.length} file(s) selected` : "Choose files (image, PDF, Word)…"}
          </label>
          <button onClick={() => onUpload(type, files)} disabled={!files.length || uploading}
            style={{ background: files.length ? "linear-gradient(135deg,#0369a1,#0ea5e9)" : "#e2e8f0", border: "none", borderRadius: 10, padding: "9px 18px", color: files.length ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 13, cursor: files.length ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {uploading ? "Uploading…" : "📤 Upload"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── LOGIN PAGE ────────────────────────────────────────────────────
function LoginPage({ onLogin, logoutMessage }) {
  const [form, setForm]               = useState({ username: "", password: "" });
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [showPw, setShowPw]           = useState(false);
  const [focused, setFocused]         = useState(null);
  // browserConflict = different user already logged in this browser (localStorage)
  const [browserConflict, setBrowserConflict] = useState(null); // {username, fullName}
  // deviceConflict = same user already logged in on another device (backend ALREADY_LOGGED_IN)
  const [deviceConflict,  setDeviceConflict]  = useState(false);

  const getLocalSession = () => { try { return JSON.parse(localStorage.getItem("pwj_user")); } catch { return null; } };

  // Core login call — force=true overrides backend active-session block (same user, different device)
  const doLogin = async (force) => {
    setLoading(true); setError(null); setBrowserConflict(null); setDeviceConflict(false);
    try {
      const res = await api.login({ ...form, force });
      if (res.success) { onLogin(res.data); }
      else if (res.message === "ALREADY_LOGGED_IN") { setDeviceConflict(true); }
      else { setError(res.message || "Invalid credentials"); }
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  // Normal submit — checks browser conflict first
  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!form.username || !form.password) { setError("Please enter username and password"); return; }
    const local = getLocalSession();
    if (local && local.username !== form.username) {
      setBrowserConflict({ username: local.username, fullName: local.fullName || local.username });
      return;
    }
    await doLogin(false);
  };

  // Force-replace another browser user: cleanly log them out first, then log this user in
  const forceBrowserLogin = async () => {
    const local = getLocalSession();
    if (local?.token) await api.logout(local.token); // cleanly end their backend session
    localStorage.removeItem("pwj_user");             // clear before new login (storage event → other tabs ignore !newValue)
    await doLogin(false);
  };

  // Force-kick same user from another device
  const forceDeviceLogin = async () => { await doLogin(true); };

  return (
    <>
      <style>{`
        @keyframes bgMove { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes cardIn { from{opacity:0;transform:translateY(32px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes orb1 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(30px,-20px)} 66%{transform:translate(-20px,15px)} }
        @keyframes orb2 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(-25px,20px)} 66%{transform:translate(20px,-15px)} }
        .lg-input {
          width:100%; background:rgba(255,255,255,.08); border:1.5px solid rgba(255,255,255,.15);
          border-radius:14px; padding:14px 18px 14px 48px; font-size:14.5px; outline:none;
          font-family:inherit; box-sizing:border-box; color:#fff; transition:all .25s;
          -webkit-text-fill-color: #fff;
        }
        .lg-input::placeholder { color:rgba(255,255,255,.35); }
        .lg-input:focus { background:rgba(255,255,255,.13); border-color:rgba(99,179,237,.7); box-shadow:0 0 0 4px rgba(99,179,237,.15); }
        .lg-input:-webkit-autofill,
        .lg-input:-webkit-autofill:hover,
        .lg-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px rgba(15,60,110,.9) inset !important;
          -webkit-text-fill-color: #fff !important;
          border-color: rgba(255,255,255,.15) !important;
        }
        .lg-btn {
          width:100%; border:none; border-radius:14px; padding:15px; font-weight:700;
          font-size:15px; cursor:pointer; font-family:inherit; letter-spacing:.4px;
          background:linear-gradient(135deg,#38bdf8,#1a6ab1,#0f4c81);
          background-size:200% 200%; animation:bgMove 4s ease infinite;
          color:#fff; transition:transform .18s,box-shadow .18s; margin-top:8px;
          box-shadow:0 4px 20px rgba(56,189,248,.3);
        }
        .lg-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 32px rgba(56,189,248,.45); }
        .lg-btn:active:not(:disabled) { transform:translateY(0); }
        .lg-btn:disabled { opacity:.6; cursor:not-allowed; animation:none; background:#1a6ab1; }
        .lg-label { font-size:11px; font-weight:700; color:rgba(255,255,255,.5); letter-spacing:1.2px; text-transform:uppercase; display:block; margin-bottom:8px; }
        @media(max-width:600px){
          .lg-card { padding:36px 24px !important; margin:16px !important; }
          .lg-logo-row { gap:10px !important; }
        }
      `}</style>

      {/* ── Background ── */}
      <div style={{
        minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'DM Sans',sans-serif", position:"relative", overflow:"hidden",
        background:"linear-gradient(145deg,#050d1a 0%,#071428 30%,#091e3a 60%,#0a2444 100%)"
      }}>
        {/* Animated orbs */}
        <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle,rgba(14,165,233,.18) 0%,transparent 70%)", top:"-10%", left:"-10%", animation:"orb1 12s ease-in-out infinite", pointerEvents:"none" }} />
        <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(99,102,241,.14) 0%,transparent 70%)", bottom:"-10%", right:"-5%", animation:"orb2 15s ease-in-out infinite", pointerEvents:"none" }} />
        <div style={{ position:"absolute", width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(56,189,248,.1) 0%,transparent 70%)", top:"50%", right:"20%", animation:"orb1 10s ease-in-out infinite 2s", pointerEvents:"none" }} />

        {/* Grid pattern */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)", backgroundSize:"48px 48px", pointerEvents:"none" }} />

        {/* ── Card ── */}
        <div className="lg-card" style={{
          width:"100%", maxWidth:440, padding:"48px 44px",
          background:"rgba(255,255,255,.04)", backdropFilter:"blur(24px)",
          borderRadius:28, border:"1px solid rgba(255,255,255,.1)",
          boxShadow:"0 32px 80px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)",
          animation:"cardIn .5s cubic-bezier(.22,1,.36,1) both", position:"relative", zIndex:1
        }}>

          {/* Logo + Brand */}
          <div className="lg-logo-row" style={{ display:"flex", alignItems:"center", gap:14, marginBottom:36 }}>
            <div style={{ width:54, height:54, borderRadius:16, background:"linear-gradient(135deg,rgba(14,165,233,.3),rgba(15,76,129,.4))", border:"1.5px solid rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", padding:8, flexShrink:0 }}>
              <img src="https://happizo.com/assets/myimages/logo.png" alt="Happizo" style={{ width:"100%", objectFit:"contain", filter:"brightness(0) invert(1)" }} />
            </div>
            <div>
              <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:18, color:"#fff", letterSpacing:.2 }}>HAPPIZO</div>
              <div style={{ fontSize:10.5, color:"rgba(255,255,255,.4)", letterSpacing:1.4, textTransform:"uppercase", marginTop:1 }}>Infrastructure & Solutions</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6, background:"rgba(34,197,94,.1)", border:"1px solid rgba(34,197,94,.25)", borderRadius:20, padding:"4px 10px" }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", display:"inline-block", animation:"pulse 2s ease infinite" }} />
              <span style={{ fontSize:10.5, color:"#4ade80", fontWeight:600 }}>Live</span>
            </div>
          </div>

          {/* Heading */}
          <div style={{ marginBottom:32 }}>
            <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:30, fontWeight:800, color:"#fff", letterSpacing:"-0.8px", lineHeight:1.15 }}>
              Sign in to<br/>
              <span style={{ background:"linear-gradient(90deg,#38bdf8,#818cf8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Happizo CloudDesk</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5", borderRadius:12, padding:"11px 16px", fontSize:13, marginBottom:20, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:15, flexShrink:0 }}>⚠</span> {error}
            </div>
          )}

          {/* Signed out by session conflict — shown instead of alert() */}
          {logoutMessage && (
            <div style={{ background:"rgba(59,130,246,.12)", border:"1px solid rgba(59,130,246,.35)", borderRadius:12, padding:"11px 16px", fontSize:13, marginBottom:20, display:"flex", alignItems:"center", gap:8, color:"#93c5fd" }}>
              <span style={{ fontSize:15, flexShrink:0 }}>ℹ</span> {logoutMessage}
            </div>
          )}

          {/* Different user already logged in this browser (same localStorage) */}
          {browserConflict && (
            <div style={{ background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.35)", borderRadius:12, padding:"14px 16px", marginBottom:20 }}>
              <div style={{ color:"#fca5a5", fontWeight:700, fontSize:13, marginBottom:6 }}>Another User is Active on this Browser</div>
              <div style={{ color:"rgba(255,255,255,.7)", fontSize:12, marginBottom:12 }}>
                <b>{browserConflict.fullName}</b> is currently logged in on this browser. Only one user can be active at a time. Sign in to take over and end their session.
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button type="button" onClick={forceBrowserLogin} disabled={loading}
                  style={{ flex:1, background:"linear-gradient(135deg,#dc2626,#ef4444)", border:"none", borderRadius:8, padding:"9px", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity: loading ? 0.6 : 1 }}>
                  {loading ? "Signing in…" : "Sign In & End Their Session"}
                </button>
                <button type="button" onClick={() => setBrowserConflict(null)} disabled={loading}
                  style={{ flex:1, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.15)", borderRadius:8, padding:"9px", color:"rgba(255,255,255,.7)", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Same user already logged in on another device (backend ALREADY_LOGGED_IN) */}
          {deviceConflict && (
            <div style={{ background:"rgba(251,191,36,.12)", border:"1px solid rgba(251,191,36,.4)", borderRadius:12, padding:"14px 16px", marginBottom:20 }}>
              <div style={{ color:"#fde68a", fontWeight:700, fontSize:13, marginBottom:6 }}>Already Signed In on Another Device</div>
              <div style={{ color:"rgba(255,255,255,.7)", fontSize:12, marginBottom:12 }}>
                Your account is currently active on another device or browser tab. Signing in here will end that session immediately.
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button type="button" onClick={forceDeviceLogin} disabled={loading}
                  style={{ flex:1, background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:8, padding:"9px", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity: loading ? 0.6 : 1 }}>
                  {loading ? "Signing in…" : "Sign In & End Other Session"}
                </button>
                <button type="button" onClick={() => setDeviceConflict(false)} disabled={loading}
                  style={{ flex:1, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.15)", borderRadius:8, padding:"9px", color:"rgba(255,255,255,.7)", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={submit}>
            <div style={{ marginBottom:18 }}>
              <label className="lg-label">Username</label>
              <div style={{ position:"relative" }}>
                <svg style={{ position:"absolute", left:15, top:"50%", transform:"translateY(-50%)", width:18, height:18, opacity:.45 }} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input className="lg-input" type="text" placeholder="Enter your username"
                  value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  onFocus={() => setFocused("u")} onBlur={() => setFocused(null)} autoComplete="username" />
              </div>
            </div>

            <div style={{ marginBottom:28 }}>
              <label className="lg-label">Password</label>
              <div style={{ position:"relative" }}>
                <svg style={{ position:"absolute", left:15, top:"50%", transform:"translateY(-50%)", width:18, height:18, opacity:.45 }} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input className="lg-input" type={showPw ? "text" : "password"} placeholder="Enter your password"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  onFocus={() => setFocused("p")} onBlur={() => setFocused(null)}
                  autoComplete="current-password" style={{ paddingRight:48 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", padding:4, color:"rgba(255,255,255,.4)", display:"flex", alignItems:"center", lineHeight:1 }}>
                  {showPw
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <button className="lg-btn" type="submit" disabled={loading}>
              {loading
                ? <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" style={{ animation:"spin .8s linear infinite" }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    Signing in…
                  </span>
                : <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    Sign In
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </span>
              }
            </button>
          </form>

          {/* Footer */}
          <div style={{ marginTop:28, paddingTop:20, borderTop:"1px solid rgba(255,255,255,.07)", textAlign:"center", color:"rgba(255,255,255,.25)", fontSize:12 }}>
            © {new Date().getFullYear()} Happizo Infrastructure & Solutions · Internal Tool
          </div>
        </div>
      </div>
    </>
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

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');`;

// ─── LAUNCH DATE — change this to your actual launch date/time ─────
const LAUNCH_DATE = new Date("2026-04-14T17:15:00");

// ─── COUNTDOWN PAGE ────────────────────────────────────────────────
function CountdownPage({ onLaunched }) {
  const calc = () => {
    const diff = LAUNCH_DATE - Date.now();
    if (diff <= 0) return null;
    return {
      days:    Math.floor(diff / 86400000),
      hours:   Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000)  / 60000),
      seconds: Math.floor((diff % 60000)    / 1000),
    };
  };

  const [time, setTime] = useState(calc);

  useEffect(() => {
    // Pre-unlock AudioContext on first user interaction so music auto-plays at launch
    const unlock = () => getAudioCtx();
    window.addEventListener("click",      unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("keydown",    unlock, { once: true });
    window.addEventListener("mousemove",  unlock, { once: true });

    if (!time) { onLaunched(); return; }
    const id = setInterval(() => {
      const t = calc();
      if (!t) { clearInterval(id); onLaunched(); }
      else setTime(t);
    }, 1000);
    return () => {
      clearInterval(id);
      window.removeEventListener("click",      unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown",    unlock);
      window.removeEventListener("mousemove",  unlock);
    };
  }, []);

  const pad = (n) => String(n).padStart(2, "0");

  const unit = (value, label) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 90 }}>
      <div style={{
        fontSize: 64, fontWeight: 800, lineHeight: 1,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        background: "linear-gradient(135deg, #fff 30%, #bae6fd)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        textShadow: "none", letterSpacing: -2,
      }}>
        {pad(value)}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 3, color: "#94a3b8", textTransform: "uppercase", marginTop: 6 }}>
        {label}
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        ${FONT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #020818; }
        @keyframes floatOrb {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-40px) scale(1.08); }
        }
        @keyframes pulseRing {
          0% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.7; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cd-card { animation: fadeUp 0.8s ease both; }
        .cd-sep { width: 4px; height: 64px; background: rgba(255,255,255,0.12); border-radius: 4px; align-self: flex-start; margin-top: 6px; }
      `}</style>

      {/* background */}
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #020818 0%, #0a1628 50%, #050d1a 100%)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", fontFamily: "'Inter', sans-serif" }}>

        {/* animated orbs */}
        <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)", top: "-10%", left: "-10%", animation: "floatOrb 8s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)", bottom: "-5%", right: "-5%", animation: "floatOrb 10s ease-in-out infinite reverse" }} />
        <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.1) 0%, transparent 70%)", bottom: "20%", left: "10%", animation: "floatOrb 12s ease-in-out infinite 2s" }} />

        {/* card */}
        <div className="cd-card" style={{ position: "relative", zIndex: 10, textAlign: "center", padding: "52px 56px", borderRadius: 28, background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)", maxWidth: 600, width: "90vw" }}>

          {/* partner logos */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32, marginBottom: 36, flexWrap: "wrap" }}>
            {/* Happizo logo */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: 0.9 }}>
              <svg width="52" height="52" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="18" y="8" width="22" height="84" rx="4" fill="#29b6e8" opacity="0.55"/>
                <rect x="60" y="8" width="22" height="84" rx="4" fill="#29b6e8" opacity="0.55"/>
                <polygon points="18,38 82,56 82,66 18,48" fill="#29b6e8"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: "#29b6e8", textTransform: "uppercase", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>HAPPIZO<sup style={{fontSize:8}}>®</sup></span>
            </div>

            <div style={{ width: 1, height: 40, background: "rgba(255,255,255,0.1)" }} />

            {/* Techtiny logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.9 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#3ab4e8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="30" height="30" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Left hemisphere */}
                  <path d="M50 18 C47 18 44 19 41 21 C37 23 34 27 33 31 C29 28 24 29 21 33 C17 37 17 44 20 49 C16 51 14 56 15 61 C16 66 20 70 25 70 C26 73 28 77 32 79 L50 79 L50 18 Z" fill="white"/>
                  {/* Right hemisphere */}
                  <path d="M50 18 C53 18 56 19 59 21 C63 23 66 27 67 31 C71 28 76 29 79 33 C83 37 83 44 80 49 C84 51 86 56 85 61 C84 66 80 70 75 70 C74 73 72 77 68 79 L50 79 L50 18 Z" fill="white"/>
                  {/* Center divider */}
                  <line x1="50" y1="22" x2="50" y2="77" stroke="#3ab4e8" strokeWidth="3"/>
                  {/* Left fold lines */}
                  <path d="M34 41 Q41 37 46 42" stroke="#3ab4e8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                  <path d="M32 57 Q40 53 45 58" stroke="#3ab4e8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                  {/* Right fold lines */}
                  <path d="M66 41 Q59 37 54 42" stroke="#3ab4e8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                  <path d="M68 57 Q60 53 55 58" stroke="#3ab4e8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: "#3ab4e8", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Tech</span><span style={{ fontSize: 20, fontWeight: 800, color: "#cbd5e1", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>tiny</span>
              </div>
            </div>
          </div>

          {/* badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(14,165,233,0.15)", border: "1px solid rgba(14,165,233,0.3)", borderRadius: 100, padding: "6px 18px", marginBottom: 28 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#38bdf8", animation: "pulseRing 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#7dd3fc", textTransform: "uppercase" }}>Launching Soon</span>
          </div>

          {/* logo / title */}
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 4, color: "#64748b", textTransform: "uppercase", marginBottom: 10 }}>Happizo CloudDesk</div>
          <h1 style={{
            fontSize: 38, fontWeight: 800, lineHeight: 1.15,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            background: "linear-gradient(135deg, #f8fafc 0%, #7dd3fc 50%, #818cf8 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "shimmer 4s linear infinite",
            marginBottom: 12,
          }}>
            Happizo CloudDesk
          </h1>
          <p style={{ fontSize: 15, color: "#64748b", marginBottom: 44, lineHeight: 1.6 }}>
            A smarter way to track, approve &amp; manage procurement workflows.
          </p>

          {/* countdown */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 20, marginBottom: 44, flexWrap: "wrap" }}>
            {unit(time?.days    ?? 0, "Days")}
            <div className="cd-sep" />
            {unit(time?.hours   ?? 0, "Hours")}
            <div className="cd-sep" />
            {unit(time?.minutes ?? 0, "Minutes")}
            <div className="cd-sep" />
            {unit(time?.seconds ?? 0, "Seconds")}
          </div>

          {/* launch date line */}
          <div style={{ fontSize: 13, color: "#475569", letterSpacing: 1 }}>
            🚀 &nbsp;Going live on&nbsp;
            <span style={{ color: "#7dd3fc", fontWeight: 600 }}>
              {LAUNCH_DATE.toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── CELEBRATION PAGE ──────────────────────────────────────────────
const CONFETTI_COLORS = ["#38bdf8","#818cf8","#f472b6","#34d399","#fbbf24","#f87171","#a78bfa","#fff"];
const CONFETTI_COUNT  = 60;

// Module-level AudioContext unlocked by any user interaction on CountdownPage
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

function playCelebrationMusic() {
  const ctx = getAudioCtx();
  const t   = ctx.currentTime;

  const playNote = (freq, start, dur, vol = 0.28, type = "sine") => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t + start);
    gain.gain.setValueAtTime(0, t + start);
    gain.gain.linearRampToValueAtTime(vol, t + start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
    osc.start(t + start);
    osc.stop(t + start + dur + 0.05);
  };

  // ── Melody (sine) ────────────────────────────────────────────────
  const melody = [
    // Fanfare opener — ascending C major
    [523.25, 0.00, 0.14], [659.25, 0.14, 0.14], [783.99, 0.28, 0.14],
    [1046.5, 0.42, 0.38],
    // Quick flourish
    [880.00, 0.85, 0.10], [783.99, 0.95, 0.10], [659.25, 1.05, 0.10],
    // Second rise
    [783.99, 1.20, 0.12], [880.00, 1.32, 0.12], [1046.5, 1.44, 0.12],
    [1174.7, 1.56, 0.12], [1318.5, 1.68, 0.45],   // E6 climax
    // Resolution back down
    [1174.7, 2.18, 0.14], [1046.5, 2.32, 0.14],
    [880.00, 2.46, 0.14], [783.99, 2.60, 0.14],
    [659.25, 2.74, 0.14], [523.25, 2.88, 0.55],   // C5 final hold
    // Celebratory repeat tag
    [523.25, 3.50, 0.10], [659.25, 3.60, 0.10],
    [783.99, 3.70, 0.10], [1046.5, 3.80, 0.80],
  ];
  melody.forEach(([f, s, d]) => playNote(f, s, d, 0.30, "sine"));

  // ── Harmony a third below (triangle — warmer) ────────────────────
  const harmony = [
    [392.00, 0.00, 0.14], [523.25, 0.14, 0.14], [659.25, 0.28, 0.14],
    [783.99, 0.42, 0.38],
    [659.25, 1.20, 0.12], [783.99, 1.32, 0.12], [880.00, 1.44, 0.12],
    [1046.5, 1.68, 0.45],
    [783.99, 2.88, 0.55],
    [783.99, 3.80, 0.80],
  ];
  harmony.forEach(([f, s, d]) => playNote(f, s, d, 0.14, "triangle"));

  // ── Bass kick (low sine burst) ───────────────────────────────────
  [[65.41, 0.0], [65.41, 0.42], [65.41, 1.20], [65.41, 1.68], [65.41, 3.50]].forEach(([f, s]) => {
    playNote(f, s, 0.18, 0.4, "sine");
  });
}

function CelebrationPage({ onDone }) {
  useEffect(() => {
    playCelebrationMusic();
    const id = setTimeout(onDone, 10000);
    return () => clearTimeout(id);
  }, []);

  const pieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id:    i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left:  `${Math.random() * 100}%`,
    delay: `${(Math.random() * 2).toFixed(2)}s`,
    dur:   `${(2.5 + Math.random() * 2).toFixed(2)}s`,
    size:  `${6 + Math.floor(Math.random() * 8)}px`,
    rot:   `${Math.floor(Math.random() * 360)}deg`,
    shape: Math.random() > 0.5 ? "50%" : "2px",
  }));

  return (
    <>
      <style>{`
        ${FONT}
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes popIn {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 20px rgba(56,189,248,0.6), 0 0 60px rgba(129,140,248,0.4); }
          50%       { text-shadow: 0 0 40px rgba(56,189,248,0.9), 0 0 100px rgba(129,140,248,0.7); }
        }
        @keyframes fadeOut {
          0%   { opacity: 1; }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .cel-wrap  { animation: fadeOut 10s ease forwards; }
        .cel-card  { animation: popIn 0.7s cubic-bezier(.34,1.56,.64,1) both; }
        .cel-title { animation: glow 2s ease-in-out infinite; }
      `}</style>

      <div className="cel-wrap" style={{ minHeight: "100vh", background: "linear-gradient(135deg,#020818 0%,#0a1628 50%,#050d1a 100%)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", fontFamily: "'Inter',sans-serif" }}>

        {/* confetti */}
        {pieces.map(p => (
          <div key={p.id} style={{
            position: "absolute", top: "-10px", left: p.left,
            width: p.size, height: p.size, borderRadius: p.shape,
            background: p.color, transform: `rotate(${p.rot})`,
            animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
            pointerEvents: "none",
          }} />
        ))}

        {/* card */}
        <div className="cel-card" style={{ position: "relative", zIndex: 10, textAlign: "center", padding: "56px 64px", borderRadius: 28, background: "rgba(255,255,255,0.05)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 32px 80px rgba(0,0,0,0.5)", maxWidth: 540, width: "90vw" }}>

          <div style={{ fontSize: 72, marginBottom: 16, lineHeight: 1 }}>🎉</div>

          <div className="cel-title" style={{ fontSize: 42, fontWeight: 800, fontFamily: "'Plus Jakarta Sans',sans-serif", background: "linear-gradient(135deg,#f8fafc,#7dd3fc,#818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 12 }}>
            We're Live!
          </div>

          <div style={{ fontSize: 16, color: "#94a3b8", marginBottom: 32, lineHeight: 1.7 }}>
            Happizo CloudDesk is officially launched.<br/>
            <span style={{ color: "#38bdf8", fontWeight: 600 }}>Happizo × Techtiny</span> — smarter workflows, every day.
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: "#475569" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 8px #34d399" }} />
            Taking you to the dashboard…
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────
export default function PWJTracker() {
  const [user, setUser] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem("pwj_user"));
      if (u) document.title = "Happizo CloudDesk";
      return u;
    } catch { return null; }
  });
  const [logoutMessage, setLogoutMessage] = useState(null);

  // userRef — always has the latest user value, usable inside stable callbacks
  const userRef       = useRef(user);
  const loggingOutRef = useRef(false); // idempotency: prevents duplicate logout calls
  const lastCheckRef  = useRef(0);     // throttle: timestamp of last validate call

  useEffect(() => { userRef.current = user; }, [user]);

  // ── doLogout: stable callback (no deps), reads user via ref ──────
  const doLogout = useCallback(async (msg) => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    const token = userRef.current?.token; // read token from ref BEFORE clearing localStorage
    await api.logout(token);             // explicit token — localStorage may already be overwritten
    localStorage.removeItem("pwj_user");
    document.title = "Happizo CloudDesk — Login";
    if (msg) setLogoutMessage(msg);
    setUser(null);
  }, []); // intentionally empty deps — stable for life of component

  // ── handleLogin ──────────────────────────────────────────────────
  const handleLogin = (userData) => {
    loggingOutRef.current = false;
    lastCheckRef.current  = 0;
    setLogoutMessage(null);
    localStorage.setItem("pwj_user", JSON.stringify(userData));
    document.title = "Happizo CloudDesk";
    setUser(userData);
  };

  // ── Cross-tab detection: different user logs in on same browser ──
  // Registered once. Uses userRef so it's always reading the latest user
  // without needing the effect to re-run (which would cause listener churn).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "pwj_user") return;
      if (!e.newValue) return;       // other tab logged OUT — ignore; do NOT cascade logouts
      if (!userRef.current) return;  // this tab is already on login page
      try {
        const newSession = JSON.parse(e.newValue);
        if (newSession?.username && newSession.username !== userRef.current.username) {
          // A different user took over this browser — silently kick current user.
          // forceBrowserLogin in LoginPage already called api.logout with the current token,
          // so we don't need to call it again here.
          loggingOutRef.current = true;
          document.title = "Happizo CloudDesk — Login";
          setLogoutMessage("Another user signed in on this browser. You have been signed out.");
          setUser(null);
          // Do NOT remove localStorage — it belongs to the new user who just logged in.
        }
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []); // runs once — stable via userRef

  // ── Backend session validation ────────────────────────────────────
  // Kicks this tab if the same account signs in elsewhere (different device/browser).
  useEffect(() => {
    if (!user) return; // stop polling when logged out
    const check = async () => {
      if (loggingOutRef.current) return;
      const now = Date.now();
      if (now - lastCheckRef.current < 10_000) return; // throttle: once per 10s max
      lastCheckRef.current = now;
      try {
        const res = await api.validateSession();
        if (!res.success) {
          doLogout("This account was signed in from another device. You have been signed out.");
        }
      } catch {} // network errors don't log out
    };
    const interval  = setInterval(check, 30_000);
    const onFocus   = () => check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, doLogout]); // restarts when user changes (login/logout)

  const [launched,    setLaunched]    = useState(() => Date.now() >= LAUNCH_DATE.getTime());
  const [celebrating, setCelebrating] = useState(false);

  if (!user) {
    if (!launched)    return <CountdownPage   onLaunched={() => { setLaunched(true); setCelebrating(true); }} />;
    if (celebrating)  return <CelebrationPage onDone={() => setCelebrating(false)} />;
    return <LoginPage onLogin={handleLogin} logoutMessage={logoutMessage} />;
  }

  return <Dashboard user={user} onLogout={() => doLogout(null)} />;
}

// ─── HOME DASHBOARD ───
function HomeDashboard({ isAdmin, isProcurement, isEngineer, isVP, isOH, isCeo, isProjectManager, onNavigate, onManageUsers }) {
  const modules = [
    {
      key: "entries",
      label: "Procurement Entries",
      desc: "Track purchase requests, work orders & job orders",
      icon: FileText,
      gradient: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
      shadow: "rgba(37,99,235,0.35)",
      visible: true,
    },
    {
      key: "vendors",
      label: "Vendors",
      desc: "Manage vendor profiles, bank details & approvals",
      icon: Building2,
      gradient: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
      shadow: "rgba(16,185,129,0.35)",
      visible: isAdmin || isProcurement || isVP || isOH || isCeo || isProjectManager,
    },
    {
      key: "projects",
      label: "Projects",
      desc: "Monitor active projects, BOQ & payment milestones",
      icon: FolderKanban,
      gradient: "linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)",
      shadow: "rgba(139,92,246,0.35)",
      visible: isAdmin || isVP || isOH || isCeo || isProjectManager,
    },
    {
      key: "account",
      label: "Account",
      desc: "Financial dashboard, expenses & fund transfers",
      icon: BarChart2,
      gradient: "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)",
      shadow: "rgba(245,158,11,0.35)",
      visible: isAdmin || isVP || isOH || isCeo || isProjectManager,
    },
    {
      key: "sales",
      label: "Sales",
      desc: "Pipeline, leads, deal tracking & conversion analytics",
      icon: TrendingUp,
      gradient: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
      shadow: "rgba(16,185,129,0.35)",
      visible: isAdmin || isVP || isOH || isCeo || isProjectManager || isProcurement,
    },
    {
      key: "hr",
      label: "HR",
      desc: "Human resources, attendance, payroll & team management",
      icon: UserCog,
      gradient: "linear-gradient(135deg, #be185d 0%, #ec4899 100%)",
      shadow: "rgba(236,72,153,0.35)",
      visible: true,
    },
    {
      key: "operations",
      label: "Operations",
      desc: "Operational workflows, scheduling & process management",
      icon: Settings2,
      gradient: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
      shadow: "rgba(20,184,166,0.35)",
      visible: true,
    },
    {
      key: "bugs",
      label: "Bug Tracker",
      desc: "Report issues and track their resolution",
      icon: Bug,
      gradient: "linear-gradient(135deg, #991b1b 0%, #ef4444 100%)",
      shadow: "rgba(239,68,68,0.35)",
      visible: isAdmin || isVP || isOH || isCeo,
    },
    {
      key: "chatbot",
      label: "Happizo Chat Bot",
      desc: "AI-powered assistant for instant answers & support",
      icon: Bot,
      gradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
      shadow: "rgba(124,58,237,0.35)",
      visible: true,
    },
    {
      key: "users",
      label: "Manage Users",
      desc: "Create users, assign roles & manage access",
      icon: Users,
      gradient: "linear-gradient(135deg, #0f4c81 0%, #0ea5e9 100%)",
      shadow: "rgba(14,165,233,0.35)",
      visible: isAdmin || isVP || isOH,
      action: onManageUsers,
    },
  ].filter(m => m.visible);

  return (
    <div style={{ minHeight: "calc(100vh - 108px)", background: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ marginBottom: 32, textAlign: "center", padding: "0 8px" }}>
        <div className="home-welcome" style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: -0.5 }}>Welcome to Happizo CloudDesk</div>
        <div style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>Select a module to get started</div>
      </div>

      <div className="home-module-grid" style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(modules.length, 4)}, 1fr)`,
        gap: 20,
        width: "100%",
        maxWidth: 960,
      }}>
        {modules.map(({ key, label, desc, icon: Icon, gradient, shadow, action }) => (
          <button key={key} onClick={() => action ? action() : onNavigate(key)}
            style={{
              position: "relative",
              background: "#fff",
              border: "1.5px solid #e2e8f0",
              borderRadius: 20,
              padding: "32px 24px",
              cursor: "pointer",
              textAlign: "center",
              fontFamily: "inherit",
              transition: "transform .18s, box-shadow .18s",
              boxShadow: "0 2px 12px rgba(15,23,42,.07)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.boxShadow = `0 16px 40px ${shadow}`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px rgba(15,23,42,.07)"; }}
          >
            <div style={{ width: 72, height: 72, borderRadius: 20, background: gradient, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 24px ${shadow}` }}>
              <Icon size={32} color="#fff" strokeWidth={1.8} />
            </div>
            <div>
              <div className="mod-label" style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{label}</div>
              <div className="mod-desc" style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{desc}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6366f1", marginTop: 2 }}>Open →</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── DASHBOARD (always mounted when user is set — no conditional hooks) ───
function Dashboard({ user, onLogout: handleLogout }) {
  const isAdmin          = user?.role === "ADMIN";
  const isProcurement    = user?.role === "PROCUREMENT";
  const isEngineer       = user?.role === "ENGINEER";
  const isVP             = user?.role === "VP";
  const isOH             = user?.role === "OH";
  const isCeo            = user?.role === "CEO";
  const isProjectManager = user?.role === "PROJECT_MANAGER";

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
  const [raisedByF, setRaisedByF]     = useState("");
  const [datePreset, setDatePreset]   = useState("");   // today | week | month | custom | ""
  const [dateFrom,   setDateFrom]     = useState("");
  const [dateTo,     setDateTo]       = useState("");
  const [page, setPage]               = useState(0);
  const [sortBy, setSortBy]           = useState("updatedAt");
  const [sortDir, setSortDir]         = useState("desc");
  const PAGE_SIZE = 15;

  const [mainTab, setMainTab] = useState("home");

  // Modals
  const [detailRow, setDetailRow]         = useState(null);
  const [approvalModal, setApprovalModal] = useState(null); // { entry }
  const [createModal, setCreateModal]     = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [editingEntry, setEditingEntry]   = useState(null); // holds entry being edited by engineer
  const [pendingModal, setPendingModal]     = useState(false);
  const [pendingList, setPendingList]       = useState([]);
  const [pendingSearch, setPendingSearch]   = useState("");
  const [pendingOHActionMap, setPendingOHActionMap] = useState({}); // { [id]: { status, comment, saving } }

  // Notification badge counts — pending-approval counters shown on tabs/tiles
  const [pendingOHCount, setPendingOHCount]         = useState(0);
  const [pendingDocCount, setPendingDocCount]       = useState(0);
  const [pendingVendorCount, setPendingVendorCount] = useState(0);
  const [toast, setToast]                 = useState(null);

  // Approval form
  const [approvalForm, setApprovalForm] = useState({ approvalStatus: "PROCEED", comment: "", approvedBy: "OH" });
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({ raisedBy: "", projectName: "", boqNo: "", materialRequired: "", specification: "", brand: "", unit: "", quantity: "", vendor: "", pwjType: "", approvalStatus: "PROCEED", status: "OPEN" });

  // VP vendor approvals
  const [vpPendingModal, setVpPendingModal] = useState(false);
  const [allVendorsStatus, setAllVendorsStatus] = useState([]);
  const [viewVendor, setViewVendor]             = useState(null);
  const [vpLoading, setVpLoading]               = useState(false);
  const [vendorStatusTab, setVendorStatusTab]   = useState("ALL");
  const [vendorSearch, setVendorSearch]         = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState("");

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
  const [assignForm, setAssignForm]       = useState({ vendors: [""], pwjType: "" });
  const [assignVendorSearches, setAssignVendorSearches] = useState([""]);
  const [showAssignVendorDrops, setShowAssignVendorDrops] = useState([false]);
  const [approvedVendors, setApprovedVendors] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [userMgmtModal, setUserMgmtModal] = useState(false);
  const [allUsers, setAllUsers]           = useState([]);
  const [userMgmtLoading, setUserMgmtLoading] = useState(false);
  const [newUserForm, setNewUserForm]     = useState({ username: "", password: "", fullName: "", email: "", phone: "", role: "ENGINEER" });
  const [docModal, setDocModal]           = useState(null);   // { entry, vendor }
  const [docLoading, setDocLoading]       = useState(false);
  const [docEditMode, setDocEditMode]     = useState(false);
  const [docViewIndex, setDocViewIndex]   = useState(0);     // active PO index in multi-vendor
  const [docEditForm, setDocEditForm]     = useState({});
  const [docSaving, setDocSaving]         = useState(false);
  const [selectedIds, setSelectedIds]       = useState(new Set());
  const [genDocModal, setGenDocModal]         = useState(false);
  const [genDocPwjType, setGenDocPwjType]     = useState("PO");
  const [genDocItemVendors, setGenDocItemVendors] = useState({}); // { [entryId]: vendorName }
  const [genDocApplyAll, setGenDocApplyAll]   = useState("");     // quick "same vendor for all"
  const [genDocSaving, setGenDocSaving]       = useState(false);
  const [pendingDocs, setPendingDocs]         = useState([]);
  const [pendingDocsModal, setPendingDocsModal] = useState(false);
  const [pendingDocsLoading, setPendingDocsLoading] = useState(false);
  const [docApprovalSearch, setDocApprovalSearch] = useState("");
  const [vpCommentMap, setVpCommentMap]         = useState({});  // docId → comment text
  const [managedProjects, setManagedProjects] = useState([]);
  const [budgetSummary, setBudgetSummary] = useState({});
  const [projectMgmtModal, setProjectMgmtModal] = useState(false);
  const BLANK_PROJECT_FORM = { name: "", location: "", description: "", clientSalutation: "Mr.", clientName: "", clientGstNo: "", clientAddress: "", billingAddress: "", billingSameAsClient: true, projectValue: "", quoteValue: "", quoteGstPct: "18", quoteDocUrl: "", additionalWoValue: "", additionalWoGstPct: "18", additionalWoDocUrl: "", additionalQuoteValue: "", additionalQuoteGstPct: "18", additionalQuoteDocUrl: "", gstPct: "18", poWoStatus: "Pending", poWoDocUrl: "", amendedPoWoStatus: "N/A", amendedPoWoDocUrl: "" };
  const [projectMgmtForm, setProjectMgmtForm] = useState(BLANK_PROJECT_FORM);
  const [editingProject, setEditingProject] = useState(null);
  const [projectMgmtLoading, setProjectMgmtLoading] = useState(false);
  const [projectClients, setProjectClients] = useState([]);
  const [poWoUploading, setPoWoUploading] = useState(false);
  const [amendedPoWoUploading, setAmendedPoWoUploading] = useState(false);
  const [quoteDocUploading, setQuoteDocUploading] = useState(false);
  const [addWoDocUploading, setAddWoDocUploading] = useState(false);
  const [addQuoteDocUploading, setAddQuoteDocUploading] = useState(false);

  // ── Add Vendor Page ──
  const [addVendorPage, setAddVendorPage] = useState(false);
  const [addVendorLoading, setAddVendorLoading] = useState(false);
  const [editVendorId, setEditVendorId] = useState(null);
  const BLANK_VENDOR_FORM = {
    name: "", companyType: "", ratings: 0,
    productServices: [{ category: "", items: [""] }],
    salutation: "Mr.", contactPerson: "", email: "", phoneNumber: "",
    spocSameAsCustomer: false, spocName: "", spocEmail: "", spocPhone: "",
    contacts: [],
    street: "", city: "", state: "", zipCode: "", country: "India", branch: "",
    vendorCode: "", empanelDate: "", vendorType: [],
    portfolioDocUrl: "", portfolioDocUploading: false,
    website: "", socialMedia: [""], catalogues: [],
    paymentDetails: "", deliveryTerms: "",
    gstNumber: "", tanNumber: "", panNumber: "",
    gstDocUrl: "", msmeDocUrl: "", tanDocUrl: "", panDocUrl: "",
    gstDocUploading: false, msmeDocUploading: false, tanDocUploading: false, panDocUploading: false,
    msmeRegistered: null,
    bankName: "", accountNumber: "", ifscCode: "", bankDetails: "",
    bankDocUrl: "", bankDocUploading: false, bankOcrLoading: false,
  };
  const [addVendorForm, setAddVendorForm] = useState(BLANK_VENDOR_FORM);

  const openEditVendor = (v) => {
    const safeJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
    setAddVendorForm({
      ...BLANK_VENDOR_FORM,
      name: v.name || "",
      companyType: v.companyType || "",
      ratings: v.ratings || 0,
      contactPerson: v.contactPerson || "",
      salutation: "",
      email: v.email || "",
      phoneNumber: v.phoneNumber || "",
      spocName: v.spocName || "",
      spocEmail: v.spocEmail || "",
      spocPhone: v.spocPhone || "",
      spocSameAsCustomer: false,
      contacts: safeJson(v.contacts, []),
      street: v.street || "",
      city: v.city || "",
      state: v.state || "",
      zipCode: v.zipCode || "",
      country: v.country || "India",
      branch: v.branch || "",
      vendorCode: v.vendorCode || "",
      empanelDate: v.empanelDate || "",
      vendorType: v.vendorType ? v.vendorType.split(",").map(s => s.trim()).filter(Boolean) : [],
      portfolioDocUrl: v.vendorDocUrl || "",
      website: v.website || "",
      socialMedia: safeJson(v.socialMedia, [""]),
      productServices: safeJson(v.productServices, [{ category: "", items: [""] }]),
      paymentDetails: v.paymentDetails || "",
      deliveryTerms: v.deliveryTerms || "",
      gstNumber: v.gstNumber || "",
      tanNumber: v.tanNumber || "",
      panNumber: v.panNumber || "",
      gstDocUrl: v.gstDocUrl || "",
      msmeDocUrl: v.msmeDocUrl || "",
      tanDocUrl: v.tanDocUrl || "",
      panDocUrl: v.panDocUrl || "",
      msmeRegistered: v.msmeNumber ? "Yes" : null,
      bankName: v.bankName || "",
      accountNumber: v.accountNumber || "",
      ifscCode: v.ifscCode || "",
      bankDetails: v.bankDetails || "",
      bankDocUrl: v.bankDocUrl || "",
    });
    setEditVendorId(v.id);
    setAddVendorPage(true);
  };

  const [engDocFile, setEngDocFile]       = useState(null);
  const [engDocUploading, setEngDocUploading] = useState(false);
  const [engInvoiceFiles, setEngInvoiceFiles]     = useState([]);
  const [engDeliveryFiles, setEngDeliveryFiles]   = useState([]);
  const [engInvoiceUploading, setEngInvoiceUploading] = useState(false);
  const [engDeliveryUploading, setEngDeliveryUploading] = useState(false);
  const [engDeliveredDate, setEngDeliveredDate]         = useState("");
  const [engDateSaving, setEngDateSaving]               = useState(false);
  const [engRemarks, setEngRemarks]                     = useState("");
  const [engRemarksSaving, setEngRemarksSaving]         = useState(false);
  const [siteRemarks, setSiteRemarks]                   = useState("");
  const [siteRemarksSaving, setSiteRemarksSaving]       = useState(false);

  // ── Fetch data ──
  const fetchSeqRef = useRef(0);
  const fetchEntries = useCallback(async (silent = false) => {
    const seq = ++fetchSeqRef.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = { page, size: PAGE_SIZE, sortBy, sortDir };
      if (search)              params.search      = search;
      if (statusF !== "ALL")   params.status      = statusF;
      if (approvalF !== "ALL") params.approval    = approvalF;
      if (projectF)            params.projectName = projectF;
      if (!isEngineer && raisedByF) params.raisedBy = raisedByF;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo)   params.dateTo   = dateTo;

      const res = isEngineer
        ? await api.getMyEntries(user.fullName || user.username, params)
        : await api.getEntries(params);

      if (fetchSeqRef.current !== seq) return; // stale response — a newer fetch is in flight
      if (res.success) {
        const d = res.data;
        setEntries(d.content);
        setTotal(d.totalElements);
        setTotalPages(d.totalPages);
        setStats({ total: d.totalElements, closed: d.totalClosed, open: d.totalOpen, proceed: d.totalProceed, hold: d.totalHold, notApproved: d.totalNotApproved });
      } else { setError(res.message); }
    } catch { if (fetchSeqRef.current === seq) setError("Cannot connect to backend. Make sure Spring Boot is running on port 8080."); }
    finally { if (fetchSeqRef.current === seq) setLoading(false); }
  }, [page, search, statusF, approvalF, projectF, raisedByF, dateFrom, dateTo, sortBy, sortDir, isEngineer, user]);

  const fetchProjects = useCallback(async () => {
    try { const r = await api.getProjects(); if (r.success) setProjects(r.data); } catch {}
  }, []);

  const fetchManagedProjects = useCallback(async () => {
    try {
      const [r, bs] = await Promise.all([api.getManagedProjects(), api.getBudgetSummary()]);
      if (r.success) setManagedProjects(r.data);
      if (bs.success) setBudgetSummary(bs.data || {});
    } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try { const r = await api.getUsers(); if (r.success) setAllUsers(r.data); } catch {}
  }, []);

  // ── Notification badges: pending-approval counts for the current role ──
  const fetchPendingCounts = useCallback(async () => {
    try {
      if (isAdmin || isOH || isVP || isCeo) {
        const r = await api.getPending();
        if (r.success) setPendingOHCount(r.data.length);
      }
      if (isVP) {
        const [docs, vendors] = await Promise.all([api.getPendingDocApprovals(), api.getPendingVendors()]);
        if (docs.success)    setPendingDocCount(docs.data.length);
        if (vendors.success) setPendingVendorCount(vendors.data.length);
      }
    } catch {}
  }, [isAdmin, isOH, isVP, isCeo]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { fetchPendingCounts(); }, [fetchPendingCounts]);
  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  // Sync engineer's delivered-date and remarks when the document modal opens on a new entry
  useEffect(() => {
    if (docModal?.entry) {
      setEngDeliveredDate(docModal.entry.deliveredDate || "");
      setEngRemarks(docModal.entry.remarks || "");
      setSiteRemarks("");
    }
  }, [docModal?.entry?.id]);
  useEffect(() => { fetchManagedProjects(); }, [fetchManagedProjects]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Auto-refresh entries when user returns to this tab (catches VP approval from another session)
  useEffect(() => {
    const onFocus = () => { fetchEntries(); fetchPendingCounts(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchEntries, fetchPendingCounts]);

  // Track whether user is actively editing — skip silent refresh during edits
  const editingRef = useRef(false);
  useEffect(() => {
    editingRef.current = !!(
      createModal || editingEntry || approvalModal || assignModal ||
      userMgmtModal || projectMgmtModal || addVendorPage || docEditMode
    );
  }, [createModal, editingEntry, approvalModal, assignModal, userMgmtModal, projectMgmtModal, addVendorPage, docEditMode]);

  // SSE — server pushes an event whenever any entry changes; client silently re-fetches
  useEffect(() => {
    if (!BACKEND_BASE) return;
    let es;
    let retryDelay = 3000;
    let retryTimer;
    const connect = () => {
      es = new EventSource(`${BACKEND_BASE}/api/v1/pwj/events`);
      es.addEventListener("update", () => {
        retryDelay = 3000; // reset backoff on successful message
        if (!document.hidden && !editingRef.current) { fetchEntries(true); fetchPendingCounts(); }
      });
      es.addEventListener("ping", () => { retryDelay = 3000; }); // heartbeat resets backoff
      es.onerror = () => {
        es.close();
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000); // cap at 30 s
          connect();
        }, retryDelay);
      };
    };
    connect();
    return () => { es && es.close(); clearTimeout(retryTimer); };
  }, [fetchEntries, fetchPendingCounts]);

  // Fallback poll every 60 s — catches missed SSE events (tab backgrounded, network blip)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden && !editingRef.current) { fetchEntries(true); fetchPendingCounts(); }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchEntries, fetchPendingCounts]);

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
    if (isOH && approvalForm.approvalStatus !== "PROCEED" && !approvalForm.comment.trim()) {
      showToast("Remarks are mandatory when not approving", "error"); return;
    }
    setApprovalLoading(true);
    try {
      const res = await api.updateApproval(approvalModal.entry.id, approvalForm);
      if (res.success) {
        showToast(`Entry #${approvalModal.entry.id} updated to ${res.data.approvalStatus}`);
        setApprovalModal(null);
        fetchEntries();
        // Refresh pending list so approved entry disappears immediately
        api.getPending().then(r => { if (r.success) { setPendingList(r.data); setPendingOHCount(r.data.length); } });
      } else { showToast(res.message, "error"); }
    } catch { showToast("Failed to update approval", "error"); }
    finally { setApprovalLoading(false); }
  };

  // ── Create / Edit submit ──
  const submitCreate = async () => {
    if (!createForm.projectName || !createForm.materialRequired || !createForm.specification) {
      showToast("Project, Material and Specification are required", "error"); return;
    }
    if (isEngineer && (!createForm.unit || !createForm.quantity || !createForm.dateOfRequirement)) {
      showToast("Please fill all required fields", "error"); return;
    }
    setCreateLoading(true);
    try {
      const userName = user.fullName || user.username;
      const body = { ...createForm, raisedBy: userName, quantity: createForm.quantity ? parseFloat(createForm.quantity) : null };
      if (editingEntry) {
        // Update existing entry
        const res = await api.updateEntry(editingEntry.id, { ...body, approvalStatus: editingEntry.approvalStatus, status: editingEntry.status, pwjIssued: editingEntry.pwjIssued });
        if (res.success) {
          showToast("Entry updated!");
          setCreateModal(false);
          setEditingEntry(null);
          setEntries(prev => prev.map(e => e.id === editingEntry.id ? res.data : e));
        } else showToast(res.message, "error");
      } else {
        // Create new entry
        const res = await api.createEntry(body, userName);
        if (res.success) {
          showToast("Entry created!");
          setCreateModal(false);
          setEntries(prev => [{ ...res.data, dependency: res.data.dependency || "OH Approval" }, ...prev]);
          setTotal(t => t + 1);
        } else showToast(res.message, "error");
      }
    } catch { showToast(editingEntry ? "Update failed" : "Create failed", "error"); }
    finally { setCreateLoading(false); }
  };

  // ── Open edit form for engineer ──
  const openEditEntry = (row) => {
    setCreateForm({
      raisedBy: row.raisedBy || "",
      projectName: row.projectName || "",
      boqNo: row.boqNo || "",
      materialRequired: row.materialRequired || "",
      specification: row.specification || "",
      brand: row.brand || "",
      unit: row.unit || "",
      quantity: row.quantity != null ? String(row.quantity) : "",
      dateOfRequirement: row.dateOfRequirement || "",
      imageReference: row.imageReference || "",
      dependency: row.dependency || "",
      remarks: row.remarks || "",
      vendor: row.vendor || "",
      pwjType: row.pwjType || "",
      approvalStatus: row.approvalStatus || "NOT_APPROVED",
      status: row.status || "OPEN",
    });
    setEditingEntry(row);
    setCreateModal(true);
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
          r.id, fmtDate(r.timestamp), r.raisedBy, r.projectName,
          r.boqNo, r.materialRequired, r.specification, r.brand, r.unit,
          r.quantity, fmtDate(r.dateOfRequirement), r.vendor,
          r.pwjIssued ? "Yes" : "No", r.approvalStatus, r.status,
          fmtDate(r.deliveredDate), r.remarks, r.approvedBy,
          fmtDate(r.approvedAt), r.approvalComment,
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
    setVpLoading(true);
    try {
      const r = await api.getAllVendorsWithStatus();
      if (r.success) setAllVendorsStatus(r.data);
    } catch {}
    finally { setVpLoading(false); }
  };

  // ── VP vendor approvals ──

  // ── Assign Vendor / PWJ Type ──
  const openAssign = async (row) => {
    const vendorList = row.vendor ? [row.vendor] : [""];
    setAssignForm({ vendors: vendorList, pwjType: row.pwjType || "" });
    setAssignVendorSearches([...vendorList]);
    setShowAssignVendorDrops(vendorList.map(() => false));
    setAssignModal(row);
    try {
      const r = await api.getApprovedVendors();
      if (r.success) setApprovedVendors(r.data);
    } catch {}
  };

  const submitAssign = async () => {
    if (!assignModal) return;
    setAssignLoading(true);
    try {
      const vendors = assignForm.vendors.filter(v => v.trim());
      const uniqueVendors = [...new Set(vendors.map(v => v.toLowerCase()))];
      if (uniqueVendors.length < vendors.length) {
        showToast("Each vendor must be unique — duplicate vendors are not allowed.", "error");
        setAssignLoading(false);
        return;
      }
      const firstVendor = vendors[0] || null;
      let docData = null;
      if (vendors.length > 1) {
        docData = JSON.stringify({
          multiVendor: true,
          docs: vendors.map(v => ({ vendor: v, items: [{ item: "", unit: "", qty: "", rate: "" }] }))
        });
      }
      const r = await api.procurementUpdate(assignModal.id, {
        vendor:  firstVendor,
        pwjType: assignForm.pwjType || null,
        ...(docData ? { docData } : {}),
      });
      if (r.success) {
        const updatedEntry = { ...assignModal, vendor: firstVendor, pwjType: assignForm.pwjType, ...(docData ? { docData } : {}) };
        showToast("Vendor & PWJ Type assigned ✅");
        setAssignModal(null);
        fetchEntries();
        if (assignForm.pwjType) openDocModal(updatedEntry);
      } else showToast(r.message || "Update failed", "error");
    } catch { showToast("Network error", "error"); }
    finally { setAssignLoading(false); }
  };

  // ── Document generation ──
  const openDocModal = async (row) => {
    setDocModal({ entry: row, vendor: null });
    setDocViewIndex(0);
    if (!allUsers.length) {
      try { const ur = await api.getUsers(); if (ur.success) setAllUsers(ur.data); } catch {}
    }
    try { const r = await api.getApprovedVendors(); if (r.success) setApprovedVendors(r.data); } catch {}
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
      const e = docModal.entry;
      let parsed = null;
      try { parsed = JSON.parse(e.docData || "{}"); } catch {}
      const isMulti = parsed?.multiVendor && Array.isArray(parsed.docs);

      if (isMulti) {
        // Update only the current sub-doc's status in docData
        const docs = parsed.docs.map((d, i) =>
          i === docViewIndex ? { ...d, docStatus: "PENDING_VP_APPROVAL" } : d
        );
        const updatedDocData = JSON.stringify({ ...parsed, docs });
        // Save docData + set entry-level to PENDING_VP_APPROVAL (so it appears in VP queue)
        const saveR = await api.updateEntry(e.id, {
          raisedBy: e.raisedBy, projectName: e.projectName,
          approvalStatus: e.approvalStatus, status: e.status,
          boqNo: e.boqNo, materialRequired: e.materialRequired,
          vendor: e.vendor, pwjType: e.pwjType, pwjIssued: e.pwjIssued,
          docData: updatedDocData, docNumber: e.docNumber || null,
        });
        if (!saveR.success) { showToast(saveR.message || "Failed", "error"); return; }
        // Also update entry-level docStatus via submitDoc (idempotent — safe to call multiple times)
        await api.submitDoc(e.id);
        const updated = { ...e, docData: updatedDocData, docStatus: "PENDING_VP_APPROVAL", dependency: "VP Approval" };
        setDocModal(m => ({ ...m, entry: updated }));
        setEntries(es => es.map(en => en.id === e.id ? updated : en));
        showToast(`PO ${docViewIndex + 1} (${docs[docViewIndex].vendor}) sent for VP approval ✅`);
      } else {
        const r = await api.submitDoc(e.id);
        if (r.success) {
          // Also submit any clubbed secondary entries so they all show PENDING_VP_APPROVAL
          const clubbedIds = parsed?.clubbedEntryIds || [];
          for (const linkedId of clubbedIds) {
            await api.submitDoc(linkedId);
          }
          if (clubbedIds.length > 0) await fetchEntries();
          else setEntries(es => es.map(en => en.id === e.id ? { ...en, docStatus: r.data.docStatus, docNumber: r.data.docNumber, dependency: r.data.dependency } : en));
          showToast(`${r.data.docNumber} sent for VP approval ✅${clubbedIds.length > 0 ? ` (+ ${clubbedIds.length} clubbed entr${clubbedIds.length > 1 ? "ies" : "y"})` : ""}`);
          setDocModal(null);
        } else showToast(r.message || "Failed", "error");
      }
    } catch { showToast("Network error", "error"); }
    finally { setDocLoading(false); }
  };

  const startDocEdit = async () => {
    try { const r = await api.getApprovedVendors(); if (r.success) setApprovedVendors(r.data); } catch {}
    const e = docModal.entry;
    const v = docModal.vendor;
    const ru = allUsers.find(u => u.fullName === e.raisedBy || u.username === e.raisedBy) || null;
    const proj = managedProjects.find(p => p.name === e.projectName) || null;
    // For multi-vendor: load the active sub-doc's data so each vendor's items are independent
    let parsedFull = null;
    try { parsedFull = JSON.parse(e.docData || "{}"); } catch {}
    const isMultiEdit = parsedFull?.multiVendor && Array.isArray(parsedFull.docs);
    const sourceEntry = isMultiEdit
      ? { ...e, vendor: parsedFull.docs[docViewIndex]?.vendor, docData: JSON.stringify(parsedFull.docs[docViewIndex] || {}) }
      : e;
    const data = parseDocData(sourceEntry);
    const autoDocNum = autoDocNumber(e);
    const msmeVal = v?.msmeNumber === "MSME-REGISTERED" ? "Registered" : v?.msmeNumber || "";
    const raisedByContact = [ru?.fullName || e.raisedBy, ru?.phone].filter(Boolean).join("\n");
    const autoAddr1 = v?.street || "";
    const autoAddr2 = [v?.city, v?.state, v?.zipCode].filter(Boolean).join(", ");
    setDocEditForm({
      ...JSON.parse(JSON.stringify(data)),
      docNumber:       e.docNumber || autoDocNum,
      gstNumber:       data.gstNumber       || v?.gstNumber || "",
      panNumber:       data.panNumber       || v?.panNumber || "",
      msme:            data.msme            || msmeVal,
      kindAttn:        data.kindAttn        || [v?.contactPerson, v?.phoneNumber].filter(Boolean).join(" · ") || "",
      contactDetails:  data.contactDetails  || raisedByContact,
      vendorAddress1:  data.vendorAddress1  || autoAddr1,
      vendorAddress2:  data.vendorAddress2  || autoAddr2,
      deliveryAddress: data.deliveryAddress || proj?.clientAddress || "",
    });
    setDocEditMode(true);
  };

  const splitAndCreatePOs = async () => {
    if (!docModal) return;
    setDocSaving(true);
    try {
      const e = docModal.entry;
      // Group items by vendor
      const groups = {};
      for (const item of (docEditForm.items || [])) {
        const v = (item.vendor || "").trim() || "__unassigned__";
        if (!groups[v]) groups[v] = [];
        groups[v].push(item);
      }
      const vendorKeys = Object.keys(groups).filter(v => v !== "__unassigned__");
      if (vendorKeys.length < 2) { showToast("Need at least 2 vendors to split", "error"); return; }

      // Build multi-vendor docs structure — stored in the SAME entry
      const docs = vendorKeys.map(vendor => ({
        vendor,
        items: groups[vendor],
        cgstPct: docEditForm.cgstPct || "0",
        sgstPct: docEditForm.sgstPct || "0",
        igstPct: docEditForm.igstPct || "0",
        completionDate:  docEditForm.completionDate  || "",
        deliveryAddress: docEditForm.deliveryAddress || "",
        contactDetails:  docEditForm.contactDetails  || "",
        vendorAddress1:  docEditForm.vendorAddress1  || "",
        vendorAddress2:  docEditForm.vendorAddress2  || "",
        gstNumber:       docEditForm.gstNumber       || "",
        docStatus: "DRAFT",
      }));

      const multiDocData = JSON.stringify({ multiVendor: true, docs });
      const body = {
        raisedBy: e.raisedBy, projectName: e.projectName,
        approvalStatus: e.approvalStatus, status: e.status,
        boqNo: e.boqNo, materialRequired: e.materialRequired,
        specification: e.specification, brand: e.brand,
        unit: e.unit, quantity: e.quantity, remarks: e.remarks,
        vendor: vendorKeys[0],
        pwjType: e.pwjType, pwjIssued: e.pwjIssued,
        docData: multiDocData, docNumber: e.docNumber || null,
      };
      const r = await api.updateEntry(e.id, body);
      if (r.success) {
        const updated = { ...e, ...r.data, docData: multiDocData };
        setDocEditMode(false);
        setDocViewIndex(0);
        setDocModal({ entry: updated, vendor: docModal.vendor });
        await fetchEntries(true);
        showToast(`${vendorKeys.length} vendor POs saved in this entry ✅`);
      } else showToast(r.message || "Failed", "error");
    } catch { showToast("Network error", "error"); }
    finally { setDocSaving(false); }
  };

  const saveDocEdits = async (forceCombined = false) => {
    if (!docModal) return;

    // Detect multiple vendors in items
    if (!forceCombined) {
      const vendors = [...new Set((docEditForm.items || []).map(r => (r.vendor || "").trim()).filter(Boolean))];
      if (vendors.length > 1) {
        const confirmed = window.confirm(
          `Items are assigned to ${vendors.length} different vendors:\n${vendors.join(", ")}\n\nClick OK to create ${vendors.length} separate POs (one per vendor).\nClick Cancel to save as one combined document.`
        );
        if (confirmed) {
          await splitAndCreatePOs();
          return;
        }
      }
    }

    const allItems = docEditForm.items || [];
    const itemNames = allItems.map(r => (r.item || "").trim().toLowerCase()).filter(Boolean);
    const dupeItems = itemNames.filter((n, i) => itemNames.indexOf(n) !== i);
    if (dupeItems.length > 0) {
      const dupeStr = [...new Set(dupeItems)].map(d => `"${d}"`).join(", ");
      if (!window.confirm(`Duplicate items found: ${dupeStr}.\n\nEach PO item must be unique. Continue anyway?`)) return;
    }

    setDocSaving(true);
    try {
      const e = docModal.entry;
      const savedTotals = calcTotals(docEditForm.items, docEditForm.cgstPct, docEditForm.sgstPct, docEditForm.igstPct);
      // For multi-vendor: merge edited sub-doc back into its slot, preserving other vendors' data
      let parsedTop = null;
      try { parsedTop = JSON.parse(e.docData || "{}"); } catch {}
      const isMultiSave = parsedTop?.multiVendor && Array.isArray(parsedTop.docs);
      const subDocData = { ...docEditForm, amountInWords: amountToWords(savedTotals.total) };
      const docDataStr = isMultiSave
        ? JSON.stringify({ ...parsedTop, docs: parsedTop.docs.map((d, i) => i === docViewIndex ? { ...d, ...subDocData } : d) })
        : JSON.stringify(subDocData);
      const body = {
        raisedBy:         e.raisedBy,
        projectName:      e.projectName,
        approvalStatus:   e.approvalStatus,
        status:           e.status,
        boqNo:            docEditForm.boqNo             || e.boqNo            || null,
        materialRequired: docEditForm.items?.[0]?.item  || e.materialRequired,
        specification:    e.specification               || null,
        brand:            e.brand                       || null,
        unit:             docEditForm.items?.[0]?.unit  || e.unit             || null,
        quantity:         docEditForm.items?.[0]?.qty   ? Number(docEditForm.items[0].qty) : null,
        remarks:          e.remarks                     || null,
        dateOfRequirement: docEditForm.completionDate   || e.dateOfRequirement || null,
        vendor:           e.vendor                      || null,
        pwjType:          e.pwjType                     || null,
        pwjIssued:        e.pwjIssued,
        docData:          docDataStr,
        docNumber:        docEditForm.docNumber          || null,
      };
      const r = await api.updateEntry(e.id, body);
      if (r.success) {
        let updated = { ...e, ...r.data };
        // Auto-resubmit for VP approval if saving after a revision request
        if (e.docStatus === "REVISION_REQUESTED") {
          const sr = await api.submitDoc(e.id);
          if (sr.success) {
            updated = { ...updated, docStatus: "PENDING_VP_APPROVAL", dependency: sr.data.dependency };
            showToast("Document revised & resubmitted for VP approval ✅");
          } else {
            showToast("Document updated ✅");
          }
        } else {
          showToast("Document updated ✅");
        }
        setDocModal(m => ({ ...m, entry: updated }));
        setDocEditMode(false);
        fetchEntries();
      } else showToast(r.message || "Failed to save", "error");
    } catch { showToast("Network error", "error"); }
    finally { setDocSaving(false); }
  };

  const openPendingDocs = async () => {
    setPendingDocsModal(true);
    setPendingDocsLoading(true);
    setDocApprovalSearch("");
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
      // Also approve any clubbed secondary entries
      const entry = pendingDocs.find(d => d.id === id) || entries.find(x => x.id === id);
      try {
        const clubbedIds = JSON.parse(entry?.docData || "{}").clubbedEntryIds || [];
        for (const linkedId of clubbedIds) await api.approveDoc(linkedId, comment);
      } catch {}
      setPendingDocs(d => d.filter(x => x.id !== id));
      setPendingDocCount(c => Math.max(0, c - 1));
      setVpCommentMap(m => { const c = { ...m }; delete c[id]; return c; });
      fetchEntries();
      showToast("Document approved ✅");
    } else showToast(r.message || "Failed", "error");
  };

  const handleDocReject = async (id) => {
    const comment = vpCommentMap[id] || "";
    const r = await api.rejectDoc(id, comment);
    if (r.success) {
      // Also reject any clubbed secondary entries
      const entry = pendingDocs.find(d => d.id === id) || entries.find(x => x.id === id);
      try {
        const clubbedIds = JSON.parse(entry?.docData || "{}").clubbedEntryIds || [];
        for (const linkedId of clubbedIds) await api.rejectDoc(linkedId, comment);
      } catch {}
      setPendingDocs(d => d.filter(x => x.id !== id));
      setPendingDocCount(c => Math.max(0, c - 1));
      setVpCommentMap(m => { const c = { ...m }; delete c[id]; return c; });
      fetchEntries();
      showToast(comment ? "Revision requested — Procurement notified" : "Document rejected");
    } else showToast(r.message || "Failed", "error");
  };

  const handleSubDocApprove = async (entryId, subIdx) => {
    const commentKey = `${entryId}_${subIdx}`;
    const comment = vpCommentMap[commentKey] || "";
    const entry = pendingDocs.find(d => d.id === entryId) || entries.find(x => x.id === entryId);
    if (!entry) return;
    let parsed;
    try { parsed = JSON.parse(entry.docData || "{}"); } catch { return; }
    if (!parsed.multiVendor || !Array.isArray(parsed.docs)) return;

    const newDocs = parsed.docs.map((d, i) => i === subIdx ? { ...d, docStatus: "VP_APPROVED", vpApprovedAt: new Date().toISOString() } : d);
    const newDocData = JSON.stringify({ ...parsed, docs: newDocs });

    try {
      const saveR = await api.updateEntry(entryId, {
        raisedBy: entry.raisedBy, projectName: entry.projectName,
        approvalStatus: entry.approvalStatus, status: entry.status,
        boqNo: entry.boqNo, materialRequired: entry.materialRequired,
        vendor: entry.vendor, pwjType: entry.pwjType, pwjIssued: !!entry.pwjIssued,
        docData: newDocData, docNumber: entry.docNumber || null,
      });
      if (!saveR.success) { showToast(saveR.message || "Failed to save", "error"); return; }

      const allApproved = newDocs.every(d => d.docStatus === "VP_APPROVED");
      if (allApproved) {
        const r = await api.approveDoc(entryId, comment);
        if (r.success) { setPendingDocs(d => d.filter(x => x.id !== entryId)); setPendingDocCount(c => Math.max(0, c - 1)); showToast("All vendor POs approved ✅"); }
        else showToast(r.message || "Failed", "error");
      } else {
        setPendingDocs(d => d.map(x => x.id === entryId ? { ...x, docData: newDocData } : x));
        showToast(`PO for ${parsed.docs[subIdx].vendor} approved ✅`);
      }
      fetchEntries();
    } catch { showToast("Network error", "error"); }
  };

  const handleSubDocReject = async (entryId, subIdx) => {
    const commentKey = `${entryId}_${subIdx}`;
    const comment = vpCommentMap[commentKey] || "";
    const entry = pendingDocs.find(d => d.id === entryId) || entries.find(x => x.id === entryId);
    if (!entry) return;
    let parsed;
    try { parsed = JSON.parse(entry.docData || "{}"); } catch { return; }
    if (!parsed.multiVendor || !Array.isArray(parsed.docs)) return;

    const newDocs = parsed.docs.map((d, i) => i === subIdx ? { ...d, docStatus: "VP_REJECTED" } : d);
    const newDocData = JSON.stringify({ ...parsed, docs: newDocs });

    try {
      await api.updateEntry(entryId, {
        raisedBy: entry.raisedBy, projectName: entry.projectName,
        approvalStatus: entry.approvalStatus, status: entry.status,
        boqNo: entry.boqNo, materialRequired: entry.materialRequired,
        vendor: entry.vendor, pwjType: entry.pwjType, pwjIssued: !!entry.pwjIssued,
        docData: newDocData, docNumber: entry.docNumber || null,
      });
      const r = await api.rejectDoc(entryId, comment);
      if (r.success) {
        const stillPending = newDocs.some(d => d.docStatus === "PENDING_VP_APPROVAL");
        if (stillPending) setPendingDocs(d => d.map(x => x.id === entryId ? { ...x, docData: newDocData } : x));
        else { setPendingDocs(d => d.filter(x => x.id !== entryId)); setPendingDocCount(c => Math.max(0, c - 1)); }
        showToast(`PO for ${parsed.docs[subIdx].vendor} rejected`);
      } else showToast(r.message || "Failed", "error");
      fetchEntries();
    } catch { showToast("Network error", "error"); }
  };

  // ── Generate Doc from multiple selected entries ───────────────────
  const canSelectEntry = (row) =>
    row.approvalStatus === "PROCEED" &&
    !row.pwjIssued &&
    row.docStatus !== "VP_APPROVED" &&
    row.docStatus !== "PENDING_VP_APPROVAL" &&
    !((() => { try { const p = JSON.parse(row.docData || "{}"); return p.multiVendor && Array.isArray(p.docs) && p.docs.some(d => d.docStatus === "VP_APPROVED" || d.docStatus === "PENDING_VP_APPROVAL"); } catch { return false; } })());

  const toggleSelect = (id) => {
    const row = entries.find(e => e.id === id);
    if (!row) return;
    if (!canSelectEntry(row)) {
      showToast("Only OH-approved entries ready for vendor assignment can be selected", "error"); return;
    }
    setSelectedIds(prev => {
      if (prev.has(id)) {
        const next = new Set(prev); next.delete(id); return next;
      }
      if (prev.size > 0) {
        const firstId = [...prev][0];
        const firstRow = entries.find(e => e.id === firstId);
        if (firstRow && firstRow.projectName !== row.projectName) {
          showToast(`All selected entries must be from the same project (${firstRow.projectName})`, "error");
          return prev;
        }
      }
      const next = new Set(prev); next.add(id); return next;
    });
  };

  const submitGenDoc = async () => {
    const selected = entries.filter(e => selectedIds.has(e.id));
    // Validate every item has a vendor assigned
    const missing = selected.filter(e => !(genDocItemVendors[e.id] || "").trim());
    if (missing.length) { showToast(`Assign a vendor to all ${missing.length} unassigned item(s)`, "error"); return; }
    setGenDocSaving(true);
    try {
      // Group entries by vendor
      const groups = {};
      for (const e of selected) {
        const v = genDocItemVendors[e.id].trim();
        if (!groups[v]) groups[v] = [];
        groups[v].push(e);
      }
      const vendorList = Object.keys(groups);
      const results = [];
      for (const vendor of vendorList) {
        const groupEntries = groups[vendor];
        const items = groupEntries.map(e => ({
          item: e.materialRequired || "",
          unit: e.unit || "",
          qty: e.quantity != null ? String(e.quantity) : "",
          rate: "",
          spec: e.specification || "",
        }));
        while (items.length < 4) items.push({ item: "", unit: "", qty: "", rate: "", spec: "" });
        const primary = groupEntries[0];
        const secondaryIds = groupEntries.slice(1).map(e => e.id);
        const existing = parseDocData(primary);
        const newDocData = JSON.stringify({ ...existing, items, ...(secondaryIds.length > 0 ? { clubbedEntryIds: secondaryIds } : {}) });
        const r = await api.updateEntry(primary.id, {
          raisedBy: primary.raisedBy,
          projectName: primary.projectName,
          approvalStatus: primary.approvalStatus,
          status: primary.status,
          boqNo: primary.boqNo || null,
          materialRequired: primary.materialRequired || items.find(i => i.item)?.item || "—",
          vendor, pwjType: genDocPwjType, docData: newDocData,
        });
        if (r.success) {
          results.push({ ...primary, vendor, pwjType: genDocPwjType, docData: newDocData });
          // Tag each secondary entry with clubbedWithId so UI can show which entry it belongs to
          for (const sec of groupEntries.slice(1)) {
            const secExisting = parseDocData(sec);
            await api.updateEntry(sec.id, {
              raisedBy: sec.raisedBy, projectName: sec.projectName,
              approvalStatus: sec.approvalStatus, status: sec.status,
              boqNo: sec.boqNo || null, materialRequired: sec.materialRequired,
              vendor: sec.vendor || null, pwjType: sec.pwjType || null,
              pwjIssued: !!sec.pwjIssued, docNumber: sec.docNumber || null,
              docData: JSON.stringify({ ...secExisting, clubbedWithId: primary.id }),
            });
          }
        } else showToast(`Failed for vendor ${vendor}: ${r.message}`, "error");
      }
      setGenDocModal(false);
      setSelectedIds(new Set());
      await fetchEntries();
      if (results.length === 1) openDocModal(results[0]);
      else if (results.length > 1) showToast(`${results.length} documents created — open each entry to view`, "success");
    } finally { setGenDocSaving(false); }
  };

  const buildDocHtml = (e, v) => {
    const ru = allUsers.find(u => u.fullName === e.raisedBy || u.username === e.raisedBy) || null;
    const raisedByContact = [ru?.fullName || e.raisedBy, ru?.phone].filter(Boolean).join("\n");
    const proj = managedProjects.find(p => p.name === e.projectName) || null;
    const docData = parseDocData(e);
    if (!docData.deliveryAddress && proj?.clientAddress) docData.deliveryAddress = proj.clientAddress;
    const totals  = calcTotals(docData.items, docData.cgstPct, docData.sgstPct, docData.igstPct);
    const typeColor = e.pwjType === "PO" ? "#1d4ed8" : e.pwjType === "WO" ? "#166534" : "#7c3aed";
    const typeName  = e.pwjType === "PO" ? "PURCHASE ORDER" : e.pwjType === "WO" ? "WORK ORDER" : "JOB ORDER";
    const docNum    = e.docNumber || autoDocNumber(e);
    const vendorName = v?.name || e.vendor || "";
    const subDocVpDate = (() => { try { const d = JSON.parse(e.docData || "{}"); return d.vpApprovedAt || null; } catch { return null; } })();
    const docDate   = (() => {
      const raw = subDocVpDate || e.approvedAt || new Date().toISOString();
      const s = String(raw).substring(0, 10);
      const [y, m, d] = s.split("-");
      return (!y || !m || !d) ? s : `${d}-${m}-${y}`;
    })();
    const terms     = e.pwjType === "PO" ? PO_TERMS : e.pwjType === "WO" ? WO_TERMS : JO_TERMS;
    const fmtCcy    = (n) => `&#8377; ${Number(n || 0).toFixed(2)}`;
    const fmtTotal  = (n) => `&#8377; ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const itemRows = docData.items
      .filter(row => row.item?.trim() || (parseFloat(row.rate) || 0) !== 0)
      .map((row, i) => {
        const amt = (parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0);
        return `<tr>
          <td style="text-align:center;padding:7px 8px;border-bottom:1px solid #ddd;">${i+1}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #ddd;">${row.item || ""}</td>
          <td style="text-align:center;padding:7px 8px;border-bottom:1px solid #ddd;">${row.unit || ""}</td>
          <td style="text-align:center;padding:7px 8px;border-bottom:1px solid #ddd;">${row.qty || ""}</td>
          <td style="text-align:right;padding:7px 8px;border-bottom:1px solid #ddd;">${fmtCcy(row.rate)}</td>
          <td style="text-align:right;padding:7px 8px;border-bottom:1px solid #ddd;">${fmtCcy(amt)}</td>
        </tr>`;
      }).join("");

    const ANCHOR = 4; // min rows kept with header to avoid orphan
    const termRowsAnchor = terms.slice(0, ANCHOR).map((t, i) => `<tr><td style="padding:4px 8px;width:22px;font-weight:600;vertical-align:top;">${i+1}</td><td style="padding:4px 8px;font-size:11px;color:#333;">${t}</td></tr>`).join("");
    const termRowsRest   = terms.slice(ANCHOR).map((t, i) => `<tr><td style="padding:4px 8px;width:22px;font-weight:600;vertical-align:top;">${i+1+ANCHOR}</td><td style="padding:4px 8px;font-size:11px;color:#333;">${t}</td></tr>`).join("");
    const stageRows = [["Stage 1",docData.stage1],["Stage 2",docData.stage2],["Stage 3",docData.stage3],["Final stage",docData.stageF]]
      .map(([l,v2]) => `<div style="font-size:11px;margin-bottom:3px;"><strong>${l} -</strong> ${v2||""}</div>`).join("");

    const thBase = `background:#ededeb;color:#111;font-weight:700;font-size:11px;padding:7px 10px;`;
    const tdBase = `padding:7px 10px;border-bottom:1px solid #ddd;`;
    const SEC   = `margin-bottom:12px;`;
    const STITLE = `font-weight:700;border-bottom:1px solid #111;padding-bottom:4px;margin:12px 0 6px;`;
    const logoAbsUrl = window.location.origin + HAPPIZO_LOGO_URL;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${typeName} - ${docNum}${vendorName ? " - " + vendorName : ""}</title>
    <style>
      @page { size: A4; margin: 12mm 14mm 12mm 14mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11.5px; color: #111; margin: 0; padding: 0; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; }
      tr { page-break-inside: avoid; }
      .sec { margin-bottom: 12px; }
      .stitle { font-weight:700; border-bottom:1px solid #111; padding-bottom:4px; margin:12px 0 6px; page-break-after: avoid; }
      .sec-block { page-break-inside: avoid; orphans: 3; widows: 3; }
      @media print { button { display: none; } }
    </style></head><body>

    <!-- HEADER -->
    <table class="sec" style="border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px;">
      <tr>
        <td style="vertical-align:middle;width:40%;">
          <img src="${logoAbsUrl}" alt="Happizo" style="width:110px;height:auto;display:block;" />
        </td>
        <td style="vertical-align:top;text-align:right;width:60%;">
          <div style="font-size:17px;font-weight:900;color:#111;margin-bottom:6px;">${typeName}</div>
          <table style="font-size:11px;line-height:1.7;border-collapse:collapse;margin-left:auto;">
            <tr><td style="white-space:nowrap;padding-right:6px;color:#555;">${e.pwjType} Number</td><td style="padding:0 6px;">:</td><td style="text-align:left;"><strong>${docNum}</strong></td></tr>
            <tr><td style="white-space:nowrap;padding-right:6px;color:#555;">${e.pwjType} Date</td><td style="padding:0 6px;">:</td><td style="text-align:left;"><strong>${docDate}</strong></td></tr>
            <tr><td style="white-space:nowrap;padding-right:6px;color:#555;">Project Name</td><td style="padding:0 6px;">:</td><td style="text-align:left;"><strong>${e.projectName}</strong></td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- VENDOR / BILLING -->
    <table class="sec">
      <tr>
        <td style="vertical-align:top;width:50%;padding-right:16px;">
          <div style="font-weight:700;margin-bottom:4px;">TO:</div>
          <div style="font-weight:700;">${v?.name || e.vendor || ""}</div>
          ${(docData.vendorAddress1||v?.street) ? `<div>${docData.vendorAddress1||v.street}</div>` : ""}
          ${(docData.vendorAddress2||(v?.city||v?.state)) ? `<div>${docData.vendorAddress2||[v?.city,v?.state,v?.zipCode].filter(Boolean).join(", ")}</div>` : ""}
          ${(()=>{ const g=docData.gstNumber||v?.gstNumber||""; const p=docData.panNumber||v?.panNumber||""; return (g||p)?`<div>${g?"GST: "+g:""}${g&&p?"&nbsp;&nbsp;&nbsp;":""}${p?"PAN: "+p:""}</div>`:""; })()}
          ${(()=>{ const m=docData.msme||(v?.msmeNumber==="MSME-REGISTERED"?"Registered":v?.msmeNumber||""); return m?`<div>MSME: ${m}</div>`:""; })()}
          <div>Kind Attn.: ${[docData.kindAttnSalutation, docData.kindAttn||[v?.contactPerson,v?.phoneNumber].filter(Boolean).join(" · ")].filter(Boolean).join(" ")}</div>
        </td>
        <td style="vertical-align:top;width:50%;padding-left:16px;border-left:1px solid #ddd;">
          <div style="font-weight:700;margin-bottom:4px;">BILL TO:</div>
          <div style="font-weight:700;">${COMPANY_INFO.name}</div>
          <div>${COMPANY_INFO.addr1}</div>
          <div>${COMPANY_INFO.addr2}</div>
          <div>GST: ${COMPANY_INFO.gst}</div>
        </td>
      </tr>
    </table>

    <div class="sec">
      <div>Dear Team,</div>
      <div>We are pleased to issue the below ${e.pwjType === "PO" ? "purchase order" : e.pwjType === "WO" ? "work order" : "job order"} to you with all details below and annexed.</div>
    </div>

    <!-- ITEMS TABLE -->
    <table class="sec">
      <thead><tr>
        <th style="${thBase}text-align:center;width:36px;">S.No</th>
        <th style="${thBase}text-align:left;width:38%;">Item</th>
        <th style="${thBase}text-align:center;width:52px;">Unit</th>
        <th style="${thBase}text-align:center;width:52px;">Qty</th>
        <th style="${thBase}text-align:right;width:80px;">Rate</th>
        <th style="${thBase}text-align:right;width:88px;">Amount</th>
      </tr></thead>
      <tbody>
        ${itemRows}
        <tr>
          <td colspan="4" rowspan="5" style="${tdBase}border-right:1px solid #ddd;vertical-align:top;">
            <div style="font-weight:700;font-size:11px;">Amount in words</div>
            <div style="font-size:11px;margin-top:4px;font-style:italic;">${amountToWords(totals.total)}</div>
          </td>
          <td style="${tdBase}text-align:right;font-weight:600;">Sub Total</td>
          <td style="${tdBase}text-align:right;">${fmtCcy(totals.subTotal)}</td>
        </tr>
        <tr>
          <td style="${tdBase}text-align:right;">CGST (${docData.cgstPct}%)</td>
          <td style="${tdBase}text-align:right;">${fmtCcy(totals.cgst)}</td>
        </tr>
        <tr>
          <td style="${tdBase}text-align:right;">SGST (${docData.sgstPct}%)</td>
          <td style="${tdBase}text-align:right;">${fmtCcy(totals.sgst)}</td>
        </tr>
        <tr>
          <td style="${tdBase}text-align:right;">IGST (${docData.igstPct || 0}%)</td>
          <td style="${tdBase}text-align:right;">${fmtCcy(totals.igst)}</td>
        </tr>
        <tr>
          <td style="text-align:right;padding:7px 10px;border-bottom:2px solid #111;font-weight:700;">Total <span style="font-weight:400;font-style:italic;font-size:9px;">(Rounded off)</span></td>
          <td style="text-align:right;padding:7px 10px;border-bottom:2px solid #111;font-weight:700;">${fmtTotal(totals.total)}</td>
        </tr>
      </tbody>
    </table>

    <!-- INFO GRID -->
    <table class="sec" style="border:1px solid #ddd;">
      <tr>
        <td style="width:33.33%;padding:10px 12px;vertical-align:top;">
          <div style="font-weight:700;margin-bottom:4px;">Date</div>
          <div>${fmtDateDash(docData.completionDate)}</div>
        </td>
        <td style="width:33.33%;padding:10px 12px;vertical-align:top;border-left:1px solid #ddd;">
          <div style="font-weight:700;margin-bottom:4px;">${e.pwjType === "WO" || e.pwjType === "JO" ? "Site address" : "Delivery address"}</div>
          <div style="white-space:pre-line;">${docData.deliveryAddress||""}</div>
        </td>
        <td style="width:33.33%;padding:10px 12px;vertical-align:top;border-left:1px solid #ddd;">
          <div style="font-weight:700;margin-bottom:4px;">Contact Details</div>
          <div style="white-space:pre-line;">${docData.contactDetails||raisedByContact}</div>
        </td>
      </tr>
    </table>

    <div style="page-break-inside:avoid;">
      <div class="stitle">General Terms</div>
      <table style="width:100%;border-collapse:collapse;"><tbody>${termRowsAnchor}</tbody></table>
    </div>
    ${termRowsRest ? `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;"><tbody>${termRowsRest}</tbody></table>` : ""}

    <div class="sec-block" style="margin-top:8px;">
      <div class="stitle">Payment Terms</div>
      <div class="sec">${stageRows}</div>
    </div>

    <div class="sec-block" style="font-size:11px;padding-left:8px;margin-bottom:12px;">
      <div><u>Note:</u> For smooth payment process, original invoice to be submitted at office along with</div>
      <div style="padding-left:12px;">- Site engineer signed copy along with measurement sheet and DC copy</div>
      <div style="padding-left:12px;">- Test / warranty / guarantee certificate, etc</div>
    </div>

    <!-- SIGNATURE -->
    <div class="sec-block" style="margin-top:16px;">
      <div>For <strong>${COMPANY_INFO.name}</strong></div>
      <table style="margin-top:16px;width:60%;">
        <tr>
          <td style="width:50%;padding:0;vertical-align:top;">
            ${e.docStatus === "VP_APPROVED" ? `<img src="${window.location.origin}${VP_SIGNATURE_URL}" alt="VP Signature" style="height:48px;max-width:160px;object-fit:contain;display:block;margin-bottom:4px;" />` : `<div style="height:48px;"></div>`}
            <div style="border-top:1px solid #888;padding-top:4px;font-size:11px;color:#555;">Authorised Signatory &amp; Date</div>
          </td>
          <td style="width:50%;padding:0 0 0 32px;vertical-align:top;">
            ${e.docStatus === "VP_APPROVED" ? `<img src="${window.location.origin}${PROCUREMENT_SIGNATURE_URL}" alt="Procurement Signature" style="height:48px;max-width:160px;object-fit:contain;display:block;margin-bottom:4px;" />` : `<div style="height:48px;"></div>`}
            <div style="border-top:1px solid #888;padding-top:4px;font-size:11px;color:#555;">Procurement Executive &amp; Date</div>
          </td>
        </tr>
      </table>
    </div>
    </body></html>`;
  };

  const downloadDoc = () => {
    if (!docModal) return;
    const e = docModal.entry;
    let entryToRender = e;
    let vendorToRender = docModal.vendor;
    try {
      const parsed = JSON.parse(e.docData || "{}");
      if (parsed?.multiVendor && Array.isArray(parsed.docs)) {
        const subDoc = parsed.docs[Math.min(docViewIndex, parsed.docs.length - 1)];
        entryToRender = { ...e, vendor: subDoc.vendor, docData: JSON.stringify(subDoc) };
        vendorToRender = approvedVendors.find(av => av.name === subDoc.vendor) || docModal.vendor;
      }
    } catch {}
    const html = buildDocHtml(entryToRender, vendorToRender);
    const win = window.open("about:blank", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html + `<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>`);
    win.document.close();
  };

  const sendDocToVendor = async () => {
    if (!docModal) return;
    const e = docModal.entry; const v = docModal.vendor;
    showToast("Sending document to vendor…", "info");
    try {
      const html = buildDocHtml(e, v);
      const r = await api.sendVendorDoc(e.id, html);
      if (r.success) { showToast("Document sent to vendor ✅"); setDocModal(null); }
      else showToast(r.message || "Failed to send", "error");
    } catch (err) {
      showToast("Failed to send document", "error");
    }
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

  // ── Engineer: multi-file upload (vendor invoices / delivery docs) ──
  const uploadEngFiles = async (type, files) => {
    if (!files.length || !docModal) return;
    const setLoading = type === "invoice" ? setEngInvoiceUploading : setEngDeliveryUploading;
    setLoading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const res = await api.uploadDocument(file);
        if (res.success) uploaded.push({ url: res.data, name: file.name, uploadedAt: new Date().toISOString().substring(0, 10) });
        else showToast(`Failed to upload ${file.name}`, "error");
      }
      if (uploaded.length) {
        const e = docModal.entry;
        const existing = parseDocData(e);
        const key = type === "invoice" ? "vendorInvoices" : "deliveryDocs";
        const newDocData = JSON.stringify({ ...existing, [key]: [...(existing[key] || []), ...uploaded] });
        const r = await api.procurementUpdate(e.id, { docData: newDocData });
        if (r.success) {
          const updated = { ...e, docData: newDocData };
          setDocModal(m => ({ ...m, entry: updated }));
          setEntries(es => es.map(x => x.id === e.id ? updated : x));
          type === "invoice" ? setEngInvoiceFiles([]) : setEngDeliveryFiles([]);
          showToast(`${uploaded.length} file(s) uploaded ✅`);
        } else showToast(r.message || "Save failed", "error");
      }
    } catch { showToast("Network error", "error"); }
    finally { setLoading(false); }
  };

  // ── Engineer: save delivered date ──
  const saveEngDeliveredDate = async () => {
    if (!docModal || !engDeliveredDate) return;
    if ((isEngineer || isProjectManager) && engDeliveredDate > new Date().toISOString().split("T")[0]) {
      showToast("Delivered date cannot be a future date", "error");
      return;
    }
    setEngDateSaving(true);
    try {
      const r = await api.deliveryUpdate(docModal.entry.id, {
        deliveredDate: engDeliveredDate,
        updatedBy: user.fullName || user.username,
      });
      if (r.success) {
        const updated = { ...docModal.entry, deliveredDate: engDeliveredDate };
        setDocModal(m => ({ ...m, entry: updated }));
        setEntries(es => es.map(x => x.id === docModal.entry.id ? { ...x, deliveredDate: engDeliveredDate } : x));
        showToast("Delivered date saved ✅");
      } else showToast(r.message || "Failed to save", "error");
    } catch { showToast("Network error", "error"); }
    finally { setEngDateSaving(false); }
  };

  const saveEngRemarks = async () => {
    if (!docModal) return;
    setEngRemarksSaving(true);
    try {
      const r = await api.procurementUpdate(docModal.entry.id, { remarks: engRemarks.trim() || null });
      if (r.success) {
        setDocModal(m => ({ ...m, entry: { ...m.entry, remarks: engRemarks.trim() } }));
        setEntries(es => es.map(x => x.id === docModal.entry.id ? { ...x, remarks: engRemarks.trim() } : x));
        showToast("Remarks saved ✅");
      } else showToast(r.message || "Failed to save", "error");
    } catch { showToast("Network error", "error"); }
    finally { setEngRemarksSaving(false); }
  };

  const saveSiteRemarks = async () => {
    if (!docModal || !siteRemarks.trim()) return;
    const name = user.fullName || user.username || "Procurement";
    const now = new Date();
    const fmtNow = now.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    const newEntry = `[${fmtNow} · ${name}] ${siteRemarks.trim()}`;
    const existing = docModal.entry.siteRemarks;
    const combined = existing ? `${existing}\n${newEntry}` : newEntry;
    setSiteRemarksSaving(true);
    try {
      const r = await api.procurementUpdate(docModal.entry.id, { siteRemarks: combined });
      if (r.success) {
        setDocModal(m => ({ ...m, entry: { ...m.entry, siteRemarks: combined } }));
        setEntries(es => es.map(x => x.id === docModal.entry.id ? { ...x, siteRemarks: combined } : x));
        setSiteRemarks("");
        showToast("Remark added ✅");
      } else showToast(r.message || "Failed to save", "error");
    } catch { showToast("Network error", "error"); }
    finally { setSiteRemarksSaving(false); }
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
      setNewUserForm({ username: "", password: "", fullName: "", email: "", phone: "", role: "ENGINEER" });
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

  const [pwdModal, setPwdModal]   = useState(null); // { id, username }
  const [newPwd,   setNewPwd]     = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  const submitChangePassword = async () => {
    if (!newPwd.trim()) { showToast("Enter a new password", "error"); return; }
    setPwdLoading(true);
    try {
      const r = await api.changeUserPassword(pwdModal.id, newPwd);
      if (r.success) {
        showToast(`Password updated for ${pwdModal.username} ✅`);
        setPwdModal(null); setNewPwd("");
      } else showToast(r.message || "Failed to update password", "error");
    } catch { showToast("Error updating password", "error"); }
    finally { setPwdLoading(false); }
  };

  // ── Pending approvals ──
  const openPending = async () => {
    setPendingSearch("");
    setPendingOHActionMap({});
    try {
      const r = await api.getPending();
      if (r.success) { setPendingList(r.data); setPendingModal(true); }
    } catch { showToast("Failed to load pending", "error"); }
  };

  const submitInlineOH = async (row) => {
    const action = pendingOHActionMap[row.id] || { status: "PROCEED", comment: "" };
    if (action.status !== "PROCEED" && !(action.comment || "").trim()) {
      showToast("Remarks required when not approving", "error"); return;
    }
    setPendingOHActionMap(m => ({ ...m, [row.id]: { ...action, saving: true } }));
    try {
      const res = await api.updateApproval(row.id, { approvalStatus: action.status, comment: action.comment || "", approvedBy: "OH" });
      if (res.success) {
        setPendingList(d => d.filter(x => x.id !== row.id));
        setPendingOHCount(c => Math.max(0, c - 1));
        showToast(`#${row.id} — ${action.status === "PROCEED" ? "Approved ✅" : action.status === "HOLD" ? "On Hold ⏸" : "Not Approved ❌"}`);
        fetchEntries(true);
      } else showToast(res.message || "Failed", "error");
    } catch { showToast("Network error", "error"); }
    finally { setPendingOHActionMap(m => ({ ...m, [row.id]: { ...m[row.id], saving: false } })); }
  };

  // ── Sort ──
  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
    setPage(0);
  };

  // ── Styles ──
  const s = {
    // ── Layout ──
    root: { fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif", background: "#f1f5f9", minHeight: "100vh" },
    // ── Header — flat white, sticky ──
    header: { background: "#ffffff", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", height: 68, position: "sticky", top: 0, zIndex: 100 },
    hLeft: { display: "flex", alignItems: "center", gap: 12 },
    hTitle: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontSize: 19, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px", lineHeight: 1.15 },
    hSub: { fontSize: 12.5, color: "#94a3b8", marginTop: 2, letterSpacing: 0.1 },
    hRight: { display: "flex", gap: 6, alignItems: "center" },
    hBtn: (variant) => ({
      background: variant === "primary"
        ? "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)"
        : variant === "danger"
        ? "rgba(239,68,68,0.06)"
        : "rgba(15,23,42,0.04)",
      border: variant === "primary"
        ? "none"
        : variant === "danger"
        ? "1px solid rgba(239,68,68,0.18)"
        : "1px solid rgba(15,23,42,0.09)",
      borderRadius: 50,
      padding: variant === "primary" ? "8px 18px" : "7px 14px",
      color: variant === "primary" ? "#fff" : variant === "danger" ? "#ef4444" : "#475569",
      fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
      display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      transition: "all .16s ease", letterSpacing: 0.1,
    }),
    // ── Stats ──
    statsRow: { display: "flex", gap: 12, padding: "20px 32px 0", overflowX: "auto" },
    statCard: (accent) => ({ background: "#ffffff", borderRadius: 12, padding: "18px 22px", minWidth: 136, flex: 1, border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}` }),
    statLbl: { fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 },
    statVal: { fontSize: 32, fontWeight: 700, color: "#0f172a", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", lineHeight: 1.2, marginTop: 6 },
    // ── Filter bar ──
    filterBar: { display: "flex", gap: 10, padding: "16px 32px", alignItems: "center", flexWrap: "wrap" },
    searchWrap: { position: "relative", flex: 1, minWidth: 220, maxWidth: 360 },
    searchIcon: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#94a3b8" },
    searchInput: { width: "100%", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "10px 12px 10px 36px", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: "#0f172a" },
    sel: { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "10px 30px 10px 12px", fontSize: 14, outline: "none", cursor: "pointer", fontFamily: "inherit", color: "#374151", appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%2394a3b8' d='M5 7L0 2h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" },
    resultCount: { marginLeft: "auto", background: "#f8fafc", color: "#475569", borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 600, border: "1px solid #e2e8f0" },
    // ── Table ──
    tableWrap: { margin: "0 32px 24px", background: "#ffffff", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 16 },
    th: { background: "#f8fafc", padding: "12px 14px", textAlign: "left", fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" },
    td: { padding: "12px 14px", color: "#0f172a", verticalAlign: "middle", borderBottom: "1px solid #f1f5f9", fontSize: 16, fontWeight: 500 },
    badge: (m) => ({ display: "inline-flex", alignItems: "center", gap: 5, background: m?.bg || "#f1f5f9", color: m?.color || "#64748b", borderRadius: 5, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }),
    dot: (c) => ({ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0 }),
    approveBtn: { background: "#1e3a5f", border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
    // ── Pagination ──
    paginationRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 32px 24px" },
    pageInfo: { fontSize: 14, color: "#64748b" },
    pageBtns: { display: "flex", gap: 4 },
    pageBtn: (active) => ({ width: 34, height: 34, borderRadius: 7, border: active ? "none" : "1.5px solid #e2e8f0", background: active ? "#1e3a5f" : "#fff", color: active ? "#fff" : "#374151", cursor: "pointer", fontSize: 13.5, fontWeight: active ? 700 : 400, fontFamily: "inherit" }),
    // ── Modals ──
    overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
    modalBox: (w) => ({ background: "#fff", borderRadius: 14, width: "95%", maxWidth: w || 580, maxHeight: "88vh", overflow: "auto", boxShadow: "0 20px 56px rgba(0,0,0,.16)", animation: "slideUp .22s ease" }),
    mHeader: { background: "#0f172a", padding: "20px 26px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    mTitle: { fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", color: "#fff", fontWeight: 700, fontSize: 17, letterSpacing: "-0.2px" },
    mSub: { color: "rgba(255,255,255,.5)", fontSize: 13, marginTop: 4 },
    closeBtn: { background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 16 },
    mBody: { padding: "24px 26px" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" },
    dLabel: { fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 },
    dVal: { fontSize: 14.5, color: "#0f172a", fontWeight: 500 },
    divider: { gridColumn: "1/-1", borderTop: "1px solid #f1f5f9", paddingTop: 12, fontSize: 11.5, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 6 },
    formGroup: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 },
    label: { fontSize: 13, fontWeight: 600, color: "#475569" },
    input: { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 13px", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", color: "#0f172a" },
    textarea: { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 13px", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", minHeight: 78, resize: "vertical", color: "#0f172a" },
    select2: { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 13px", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#fff", color: "#0f172a" },
    submitBtn: (col) => ({ background: col || "#1e3a5f", border: "none", borderRadius: 9, padding: "12px 28px", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", width: "100%" }),
    toast: (type) => ({ position: "fixed", bottom: 28, right: 28, zIndex: 999, background: type === "error" ? "#dc2626" : "#0f172a", color: "#fff", borderRadius: 10, padding: "14px 22px", fontWeight: 600, fontSize: 14, boxShadow: "0 8px 32px rgba(0,0,0,.2)", animation: "slideUp .22s ease" }),
    emptyRow: { textAlign: "center", padding: "52px 20px", color: "#94a3b8", fontSize: 15 },
    errorBanner: { margin: "16px 32px", padding: "13px 18px", background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca", color: "#b91c1c", fontSize: 14 },
    pendingItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #f1f5f9" },
  };

  const SortArrow = ({ field }) => (
    <span style={{ marginLeft: 3, opacity: sortBy === field ? 1 : 0.3, fontSize: 9 }}>
      {sortBy === field ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const canApprove = (row) =>
    row.approvalStatus === "HOLD";

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
        body { margin: 0; font-family: 'Inter', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-size: 15px; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#f8fafc; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:8px; }
        tr:hover td { background:#f8fafc !important; transition: background .1s; }
        input:focus, select:focus, textarea:focus { border-color:#1e3a5f !important; box-shadow: 0 0 0 3px rgba(30,58,95,.08) !important; }
        .hbtn-hover:hover { background:rgba(15,23,42,0.09) !important; border-color:rgba(15,23,42,0.18) !important; color:#0f172a !important; }
        .hbtn-danger-hover:hover { background:rgba(239,68,68,0.11) !important; border-color:rgba(239,68,68,0.32) !important; }
        .hbtn-primary-hover:hover { opacity:0.88; box-shadow:0 4px 16px rgba(37,99,235,0.38) !important; }
        @media (max-width: 768px) {
          .app-header { padding: 0 12px !important; height: auto !important; min-height: 56px; flex-wrap: wrap; gap: 8px; padding-top: 8px !important; padding-bottom: 8px !important; }
          .app-hright { flex-wrap: wrap !important; gap: 5px !important; justify-content: flex-start; }
          .app-hright button { padding: 6px 10px !important; font-size: 11px !important; }
          .app-hbadge { display: flex !important; padding: 4px 10px 4px 4px !important; gap: 6px !important; }
          .app-hbadge > div:first-child { width: 22px !important; height: 22px !important; font-size: 10px !important; }
          .app-hbadge > div:last-child > div:first-child { font-size: 11px !important; }
          .app-hbadge > div:last-child > div:last-child { font-size: 9px !important; }
          .app-tabs { padding: 0 8px !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .app-tabs button { padding: 10px 12px !important; font-size: 12px !important; white-space: nowrap; }
          .app-statsrow { padding: 10px 10px 0 !important; gap: 10px !important; flex-direction: column !important; }
          .app-statsrow > div { min-width: unset !important; width: 100% !important; }
          .app-statsrow .stat-val { font-size: 22px !important; }
          .app-filterbar { padding: 10px 12px !important; gap: 8px !important; }
          .app-tablewrap { margin: 0 8px 14px !important; }
          .app-pagination { padding: 10px 12px 18px !important; flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .app-errbanner { margin: 10px 10px !important; }
        }
        @media (max-width: 480px) {
          .app-hright button { padding: 5px 8px !important; font-size: 10px !important; }
          .app-statsrow > div { min-width: 88px !important; }
        }
        .doc-modal-footer {
          max-height: 42vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
        @media (max-width: 768px) {
          .doc-modal-overlay { align-items: flex-start !important; }
          .doc-modal-box {
            width: 100% !important;
            max-width: 100% !important;
            height: 100vh !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          .doc-modal-footer {
            max-height: 50vh !important;
          }
        }
      `}</style>

      <div style={s.root}>
        {/* ─── HEADER ─── */}
        <div style={s.header} className="app-header">
          <div style={s.hLeft}>
            <img src="https://happizo.com/assets/myimages/logo.png" alt="Happizo" style={{ height: 36, objectFit: "contain" }} />
            <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: 12 }}>
              <div style={s.hTitle}>{mainTab === "home" ? "Happizo CloudDesk" : mainTab === "vendors" ? "Happizo Vendor Management Dashboard" : mainTab === "projects" ? "Happizo Project Management Dashboard" : mainTab === "account" ? "Happizo Account Management Dashboard" : mainTab === "hr" ? "Happizo HR Dashboard" : mainTab === "operations" ? "Happizo Operations Dashboard" : mainTab === "chatbot" ? "Happizo Chat Bot" : mainTab === "bugs" ? "Happizo Bug Tracker" : "Procurement Tracker"}</div>
            </div>
          </div>
          <div style={s.hRight} className="app-hright">
            {user?.isTestAccount && (
              <div title="You are logged into a test account. All data you see/create is isolated from production." style={{ display: "flex", alignItems: "center", gap: 6, background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: 50, padding: "5px 14px", fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase" }}>
                🧪 Test Mode
              </div>
            )}
            {/* Avatar + name + role */}
            <div className="app-hbadge" style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(15,23,42,0.04)", borderRadius: 50, padding: "5px 14px 5px 6px", border: "1px solid rgba(15,23,42,0.08)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: roleMeta.bg, color: roleMeta.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0, letterSpacing: 0 }}>
                {(user.fullName || user.username || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ lineHeight: 1.25 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>{user.fullName || user.username}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: roleMeta.color, letterSpacing: 0.4, textTransform: "uppercase" }}>{roleMeta.label}</div>
              </div>
            </div>

            {/* Action buttons */}
            {mainTab !== "hr" && (isAdmin || isProcurement) && (
              <button className="hbtn-hover" style={s.hBtn("ghost")} onClick={exportCSV} title="Export CSV">
                <Download size={13} strokeWidth={2.2} /> Export
              </button>
            )}
            {mainTab !== "hr" && (isAdmin || isVP) && (<>
              <button className="hbtn-hover" style={s.hBtn("ghost")} title="Download full backup ZIP (DB + uploads + Excel)" onClick={async () => {
                showToast("Preparing backup…", "info");
                try {
                  const res = await api.downloadBackup();
                  if (!res.ok) { showToast("Backup download failed", "error"); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `PWJ-FullBackup-${new Date().toISOString().substring(0,10)}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                  showToast("Backup downloaded ✅");
                } catch { showToast("Backup download failed", "error"); }
              }}>
                <Download size={13} strokeWidth={2.2} /> Backup
              </button>
              <button className="hbtn-hover" style={s.hBtn("ghost")} title="Email backup to admin" onClick={async () => {
                showToast("Sending backup email…", "info");
                try {
                  const r = await api.triggerBackup();
                  if (r.success) showToast("Backup emailed to admin ✅");
                  else showToast(r.message || "Backup failed", "error");
                } catch { showToast("Backup email failed", "error"); }
              }}>
                <Database size={13} strokeWidth={2.2} /> Email Backup
              </button>
              <button className="hbtn-hover" style={s.hBtn("ghost")} title="Restore system from a backup ZIP" onClick={() => {
                const input = document.createElement("input");
                input.type = "file"; input.accept = ".zip";
                input.onchange = async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (!window.confirm(`Restore from "${file.name}"?\n\nThis will OVERWRITE the current database and uploaded files. Make sure you have a recent backup before proceeding.`)) return;
                  showToast("Restoring…", "info");
                  try {
                    const r = await api.restoreBackup(file);
                    if (r.success) {
                      showToast(`Restore complete — DB restored, ${r.data?.filesRestored || 0} file(s) recovered ✅`);
                      setTimeout(() => window.location.reload(), 2000);
                    } else showToast(r.message || "Restore failed", "error");
                  } catch { showToast("Restore failed", "error"); }
                };
                input.click();
              }}>
                <Database size={13} strokeWidth={2.2} /> Restore
              </button>
            </>)}
            {mainTab === "entries" && !isCeo && (
              <button className="hbtn-primary-hover" style={s.hBtn("primary")} onClick={() => {
                setEditingEntry(null);
                setCreateForm({ raisedBy: user.fullName || user.username, projectName: "", boqNo: "", materialRequired: "", specification: "", brand: "", unit: "", quantity: "", vendor: "", pwjType: "", approvalStatus: "PROCEED", status: "OPEN" });
                setCreateModal(true);
              }}>
                <Plus size={14} strokeWidth={2.5} /> New Entry
              </button>
            )}
            <button className="hbtn-hover hbtn-danger-hover" style={s.hBtn("danger")} onClick={handleLogout} title="Sign out">
              <LogOut size={13} strokeWidth={2.2} /> Logout
            </button>
          </div>
        </div>

        {/* ─── MAIN TABS ─── */}
        <div className="app-tabs" style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 32px", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
          {/* Home always visible */}
          {(() => {
            const active = mainTab === "home";
            return (
              <button onClick={() => setMainTab("home")} title="Home"
                style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                  padding: "14px 22px", fontSize: 13.5,
                  color: active ? "#0f172a" : "#94a3b8",
                  borderBottom: active ? "2.5px solid #1e3a5f" : "2.5px solid transparent",
                  marginBottom: -1, display: "flex", alignItems: "center", gap: 6 }}>
                <Home size={17} strokeWidth={active ? 2.2 : 1.8} />
              </button>
            );
          })()}

          {/* Contextual tab — only show the current module's tab */}
          {mainTab !== "home" && (() => {
            const labels = { entries: "Procurement", hr: "HR", operations: "Operations", chatbot: "Chat Bot", vendors: "Vendors", projects: "Projects", account: "Account", sales: "Sales", bugs: "Bug Tracker" };
            const label = labels[mainTab] || mainTab;
            return (
              <button style={{ border: "none", background: "none", cursor: "default", fontFamily: "inherit",
                padding: "14px 22px", fontSize: 13.5, fontWeight: 600,
                color: "#0f172a",
                borderBottom: "2.5px solid #1e3a5f",
                marginBottom: -1, letterSpacing: 0.1,
                display: "flex", alignItems: "center", gap: 6 }}>
                {label}
              </button>
            );
          })()}

          {/* Approval action buttons — only when on Procurement tab */}
          {mainTab === "entries" && (isAdmin || isOH || isVP || isCeo) && (
            <button onClick={openPending}
              style={{ position: "relative", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#475569", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", marginLeft: 8 }}>
              <Clock size={13} strokeWidth={2.2} /> Pending OH
              <CountBadge count={pendingOHCount} />
            </button>
          )}
          {mainTab === "entries" && isVP && (
            <button onClick={openPendingDocs}
              style={{ position: "relative", border: "none", background: "linear-gradient(135deg,#1e3a5f,#2563eb)", borderRadius: 7, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#fff", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", marginLeft: 6 }}>
              <FileCheck size={13} strokeWidth={2.2} /> Doc Approvals
              <CountBadge count={pendingDocCount} />
            </button>
          )}
        </div>

        {mainTab === "home" && (
          <HomeDashboard
            isAdmin={isAdmin} isProcurement={isProcurement}
            isEngineer={isEngineer} isVP={isVP} isOH={isOH} isCeo={isCeo} isProjectManager={isProjectManager}
            onNavigate={key => {
              setMainTab(key);
              if (key === "vendors") loadVendorsTab();
              if (key === "projects") fetchManagedProjects();
            }}
            onManageUsers={openUserMgmt}
          />
        )}

        {mainTab === "chatbot" && (
          <div style={{ minHeight: "calc(100vh - 108px)", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(124,58,237,0.35)" }}>
              <Bot size={32} color="#fff" strokeWidth={1.8} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Happizo Chat Bot</div>
              <div style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>Coming soon — AI-powered assistant for instant answers & support</div>
            </div>
          </div>
        )}

        {mainTab === "operations" && (
          <div style={{ minHeight: "calc(100vh - 108px)", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(135deg,#0d9488,#14b8a6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(20,184,166,0.35)" }}>
              <Settings2 size={32} color="#fff" strokeWidth={1.8} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Operations Module</div>
              <div style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>Coming soon — Operational workflows & process management</div>
            </div>
          </div>
        )}

        {mainTab === "hr" && <HRSection user={user} />}

        {mainTab === "bugs" && <BugTrackerPage user={user} />}

        {mainTab === "entries" && <>
        {/* ─── STATS ─── */}
        <div className="app-statsrow" style={{ display: "flex", gap: 14, padding: "20px 32px 0", flexWrap: "wrap" }}>
          {/* ── Group 1: PR Status ── */}
          {[
            [
              { label: "Total PRs", value: stats.total,  accent: "#3b82f6", dot: "#3b82f6", statusV: null,     approvalV: null },
              { label: "Closed",    value: stats.closed, accent: "#22c55e", dot: "#22c55e", statusV: "CLOSED", approvalV: null },
              { label: "Open",      value: stats.open,   accent: "#f59e0b", dot: "#f59e0b", statusV: "OPEN",   approvalV: null },
            ],
            [
              { label: "Proceed",      value: stats.proceed,     accent: "#0ea5e9", dot: "#0ea5e9", statusV: null, approvalV: "PROCEED" },
              { label: "On Hold",      value: stats.hold,        accent: "#f97316", dot: "#f97316", statusV: null, approvalV: "HOLD" },
              { label: "Not Approved", value: stats.notApproved, accent: "#ef4444", dot: "#ef4444", statusV: null, approvalV: "NOT_APPROVED" },
            ],
          ].map((group, gi) => (
            <div key={gi} style={{ flex: 1, minWidth: 280, background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(15,23,42,.06)", overflow: "hidden" }}>
              <div style={{ padding: "8px 16px 6px", background: gi === 0 ? "linear-gradient(90deg,#eff6ff,#f8fafc)" : "linear-gradient(90deg,#fff7ed,#f8fafc)", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: gi === 0 ? "#3b82f6" : "#f97316", display: "inline-block" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
                  {gi === 0 ? "PR Status" : "Approval Status"}
                </span>
              </div>
              <div style={{ display: "flex" }}>
                {group.map((c, ci) => {
                  const isActive = c.statusV ? statusF === c.statusV : c.approvalV ? approvalF === c.approvalV : statusF === "ALL" && approvalF === "ALL";
                  return (
                    <div key={c.label}
                      onClick={() => { setStatusF(c.statusV || "ALL"); setApprovalF(c.approvalV || "ALL"); setPage(0); }}
                      style={{
                        flex: 1, padding: "14px 16px", cursor: "pointer", textAlign: "center",
                        borderRight: ci < group.length - 1 ? "1px solid #f1f5f9" : "none",
                        background: isActive ? `${c.accent}0e` : "transparent",
                        transition: "background .15s, transform .1s",
                        position: "relative",
                      }}>
                      {isActive && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: c.accent, borderRadius: "0 0 3px 3px" }} />}
                      <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? c.accent : "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, whiteSpace: "nowrap" }}>{c.label}</div>
                      <div className="stat-val" style={{ fontSize: 28, fontWeight: 800, color: isActive ? c.accent : "#0f172a", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", lineHeight: 1 }}>
                        {loading ? "—" : (c.value ?? "—")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ─── DATE FILTER ─── */}
        {(() => {
          const today = new Date();
          const fmt = d => d.toISOString().split("T")[0];
          const presets = [
            { key: "today", label: "Today" },
            { key: "week",  label: "This Week" },
            { key: "month", label: "This Month" },
            { key: "custom",label: "Custom" },
          ];
          const applyPreset = key => {
            setDatePreset(key);
            setPage(0);
            if (key === "today") {
              setDateFrom(fmt(today)); setDateTo(fmt(today));
            } else if (key === "week") {
              const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
              setDateFrom(fmt(mon)); setDateTo(fmt(today));
            } else if (key === "month") {
              setDateFrom(fmt(new Date(today.getFullYear(), today.getMonth(), 1)));
              setDateTo(fmt(today));
            } else if (key === "custom") {
              setDateFrom(""); setDateTo("");
            } else {
              setDateFrom(""); setDateTo("");
            }
          };
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 32px 0", flexWrap: "wrap" }}>
              {presets.map(p => (
                <button key={p.key} onClick={() => applyPreset(datePreset === p.key ? "" : p.key)}
                  style={{ border: `1.5px solid ${datePreset === p.key ? "#1e3a5f" : "#e2e8f0"}`,
                    background: datePreset === p.key ? "#1e3a5f" : "#fff",
                    color: datePreset === p.key ? "#fff" : "#64748b",
                    borderRadius: 20, padding: "5px 14px", fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                  {p.label}
                </button>
              ))}
              {datePreset === "custom" && (
                <>
                  <input type="date" value={dateFrom} max={dateTo || fmt(today)}
                    onChange={e => { setDateFrom(e.target.value); setPage(0); }}
                    style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, fontFamily: "inherit", outline: "none", color: "#0f172a" }} />
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>to</span>
                  <input type="date" value={dateTo} min={dateFrom} max={fmt(today)}
                    onChange={e => { setDateTo(e.target.value); setPage(0); }}
                    style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, fontFamily: "inherit", outline: "none", color: "#0f172a" }} />
                </>
              )}
              {datePreset && (
                <button onClick={() => { setDatePreset(""); setDateFrom(""); setDateTo(""); setPage(0); }}
                  style={{ border: "none", background: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", padding: "4px 6px" }}>
                  ✕ Clear
                </button>
              )}
            </div>
          );
        })()}

        {/* ─── ERROR ─── */}
        {error && <div style={s.errorBanner} className="app-errbanner">⚠️ {error}</div>}

        {/* ─── FILTER BAR ─── */}
        <div style={s.filterBar} className="app-filterbar">
          <div style={s.searchWrap}>
            <span style={s.searchIcon}>🔍</span>
            <input style={s.searchInput} placeholder="Search doc number, material, project, vendor…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <select style={s.sel} value={projectF} onChange={e => { setProjectF(e.target.value); setPage(0); }}>
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
          {(isAdmin || isVP || isOH || isProjectManager || isCeo) && (
            <select style={s.sel} value={raisedByF} onChange={e => { setRaisedByF(e.target.value); setPage(0); }}>
              <option value="">All Users</option>
              {[...new Map(allUsers.filter(u => u.active !== false).map(u => [u.fullName || u.username, u])).values()]
                .sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username))
                .map(u => (
                  <option key={u.id} value={u.fullName || u.username}>{u.fullName || u.username}</option>
                ))}
            </select>
          )}
          <button onClick={fetchEntries} title="Refresh entries"
            style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "8px 13px", fontSize: 14, cursor: "pointer", color: "#64748b", lineHeight: 1 }}>
            ↺
          </button>
          <button
            onClick={() => { setSearch(""); setProjectF(""); setStatusF("ALL"); setApprovalF("ALL"); setRaisedByF(""); setDateFrom(""); setDateTo(""); setDatePreset(""); setPage(0); }}
            style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: "#64748b", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            ✕ Clear Filters
          </button>
          <div style={s.resultCount}>{totalElements} results</div>
        </div>

        {/* ─── TABLE ─── */}
        <div style={s.tableWrap} className="app-tablewrap">
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 36, textAlign: "center" }}>
                    {(() => {
                      const firstSel = selectedIds.size > 0 ? entries.find(e => selectedIds.has(e.id)) : null;
                      const eligible = entries.filter(e => canSelectEntry(e) && (!firstSel || e.projectName === firstSel.projectName));
                      return (
                        <input type="checkbox"
                          checked={eligible.length > 0 && eligible.every(e => selectedIds.has(e.id))}
                          onChange={ev => setSelectedIds(ev.target.checked ? new Set(eligible.map(e => e.id)) : new Set())}
                          style={{ cursor: "pointer" }} />
                      );
                    })()}
                  </th>
                  {[
                    ["#","id"],["Last Activity","updatedAt"],["Raised By","raisedBy"],
                    ["Project","projectName"],["Material","materialRequired"],
                    ["Req Date","dateOfRequirement"],
                    ["OH Approval","approvalStatus"],
                    ...(!isEngineer ? [["Vendor","vendor"]] : []),
                    ...((isAdmin || isProcurement || isVP || isOH || isCeo || isProjectManager) ? [["PWJ","pwjIssued"]] : []),
                    ["Delivered","deliveredDate"],["Status","status"],["Dependency","dependency"],
                    ["Action","—"],
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
                  <tr><td colSpan={20} style={s.emptyRow}>Loading entries…</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={20} style={s.emptyRow}>No entries match your filters.</td></tr>
                ) : entries.map((row, idx) => {
                    const firstSel = selectedIds.size > 0 ? entries.find(e => selectedIds.has(e.id)) : null;
                    const isEligible = canSelectEntry(row) && (!firstSel || row.projectName === firstSel.projectName || selectedIds.has(row.id));
                    return (
                  <tr key={row.id} style={{ background: selectedIds.has(row.id) ? "#f0f4ff" : idx % 2 === 0 ? "#fff" : "#fafafa", cursor: "pointer", opacity: (!isEligible && selectedIds.size > 0) ? 0.45 : 1 }}>
                    <td style={{ ...s.td, textAlign: "center" }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(row.id)}
                        disabled={!isEligible}
                        onChange={() => toggleSelect(row.id)} style={{ cursor: isEligible ? "pointer" : "not-allowed" }} />
                    </td>
                    <td style={{ ...s.td, color: "#334155", fontSize: 12 }} onClick={() => setDetailRow(row)}>{row.id}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }} onClick={() => setDetailRow(row)}>
                      {fmtDate(row.updatedAt || row.timestamp)}
                    </td>
                    <td style={{ ...s.td, fontWeight: 500 }} onClick={() => setDetailRow(row)}>{row.raisedBy}</td>
                    <td style={{ ...s.td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.projectName} onClick={() => setDetailRow(row)}>{row.projectName}</td>
                    <td style={{ ...s.td, fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.materialRequired} onClick={() => setDetailRow(row)}>
                      {row.materialRequired}
                      {parseImageRefs(row.imageReference).length > 0 && (
                        <span title={`${parseImageRefs(row.imageReference).length} reference image(s) — click row to view`} style={{ marginLeft: 5, fontSize: 13, cursor: "pointer" }}>🖼️</span>
                      )}
                    </td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }} onClick={() => setDetailRow(row)}>{fmtDate(row.dateOfRequirement)}</td>
                    {/* Approval — visible for all roles */}
                    <td style={s.td} onClick={() => setDetailRow(row)}>
                      <span
                        style={s.badge(APPROVAL_META[row.approvalStatus])}
                        title={row.approvalComment ? `OH Remark: ${row.approvalComment}` : undefined}
                      >
                        <span style={s.dot(APPROVAL_META[row.approvalStatus]?.dot || "#94a3b8")} />
                        {APPROVAL_META[row.approvalStatus]?.label || row.approvalStatus}
                        {row.approvalComment ? " 💬" : ""}
                      </span>
                    </td>
                    {/* Vendor — hidden for Engineer */}
                    {!isEngineer && (
                      <td style={{ ...s.td, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.vendor} onClick={() => setDetailRow(row)}>{row.vendor || "—"}</td>
                    )}
                    {/* PWJ — visible to Admin, Procurement, VP, OH, CEO, Project Manager; editable only by Admin/Procurement */}
                    {(isAdmin || isProcurement || isVP || isOH || isCeo || isProjectManager) && (
                      <td style={{ ...s.td, textAlign: "center" }} onClick={e => e.stopPropagation()}>
                        {(isAdmin || isProcurement) ? (
                          <button
                            title={row.pwjIssued ? "PWJ Issued — click to unset" : "Not issued — click to mark issued"}
                            onClick={async () => {
                              const r = await api.procurementUpdate(row.id, { pwjIssued: !row.pwjIssued });
                              if (r.success) fetchEntries();
                              else showToast(r.message || "Update failed", "error");
                            }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}>
                            {row.pwjIssued ? <span style={{ color: "#16a34a" }}>✓</span> : <span style={{ color: "#ef4444" }}>✗</span>}
                          </button>
                        ) : (
                          <span style={{ fontSize: 16, color: row.pwjIssued ? "#16a34a" : "#ef4444" }}>{row.pwjIssued ? "✓" : "✗"}</span>
                        )}
                      </td>
                    )}
                    {/* Delivered Date */}
                    <td style={{ ...s.td, whiteSpace: "nowrap", color: "#334155" }} onClick={() => setDetailRow(row)}>
                      {fmtDate(row.deliveredDate)}
                    </td>
                    {/* Status */}
                    <td style={s.td} onClick={() => setDetailRow(row)}>
                      <span style={s.badge(STATUS_META[row.status])}>
                        <span style={s.dot(STATUS_META[row.status]?.dot || "#94a3b8")} />
                        {row.status}
                      </span>
                    </td>
                    {/* Dependency */}
                    <td style={{ ...s.td }} onClick={e => e.stopPropagation()}>
                      {row.status === "CLOSED" ? (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      ) : isProcurement ? (
                        <select value={row.dependency || ""}
                          onChange={async e => {
                            const val = e.target.value;
                            try {
                              const r = await api.procurementUpdate(row.id, { dependency: val || null });
                              if (r.success) fetchEntries();
                              else showToast(r.message || "Update failed", "error");
                            } catch {
                              showToast("Network error — could not update dependency", "error");
                            }
                          }}
                          style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 16, background: "#fff", cursor: "pointer", fontFamily: "inherit", maxWidth: 140 }}>
                          <option value="">— None —</option>
                          <option value="OH Approval">OH Approval</option>
                          <option value="Procurement">Procurement</option>
                          <option value="Site team">Site team</option>
                          <option value="DH Approval">DH Approval</option>
                          <option value="Vendor">Vendor</option>
                          <option value="DIP">DIP</option>
                          {row.dependency === "VP Approval" && <option value="VP Approval">VP Approval</option>}
                        </select>
                      ) : (
                        <span style={{ color: row.dependency ? "#0f172a" : "#94a3b8" }}>
                          {row.dependency || "—"}
                        </span>
                      )}
                    </td>
                    {/* ★ ACTION COLUMN */}
                    <td style={s.td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {/* Engineer edit button — own entries only, locked once OH approves (PROCEED) */}
                        {isEngineer && row.raisedBy === (user?.fullName || user?.username) && (
                          row.approvalStatus === "PROCEED" ? (
                            <button
                              disabled
                              title="Editing locked — entry has been OH approved"
                              style={{ background: "#e2e8f0", border: "none", borderRadius: 7, padding: "5px 10px", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                              🔒 Locked
                            </button>
                          ) : (
                            <button
                              style={{ background: "linear-gradient(135deg,#0369a1,#0ea5e9)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                              onClick={() => openEditEntry(row)}>
                              ✏️ Edit
                            </button>
                          )
                        )}
                        {isOH && (
                          row.approvalStatus === "PROCEED"
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: "#166534", background: "#dcfce7", borderRadius: 7, padding: "5px 10px", whiteSpace: "nowrap" }}>✅ Approved</span>
                            : canApprove(row) && (
                              <button style={s.approveBtn}
                                onClick={() => {
                                  setApprovalForm({ approvalStatus: "PROCEED", comment: "", approvedBy: "OH" });
                                  setApprovalModal({ entry: row });
                                }}>
                                ✅ Approve
                              </button>
                            )
                        )}
                        {(isAdmin || isProcurement) && (
                          (isProcurement && row.pwjIssued) || (isProcurement && row.docStatus === "VP_APPROVED") ? (
                            <button
                              disabled
                              title={row.docStatus === "VP_APPROVED" ? "VP approved — vendor cannot be changed" : "PWJ issued — editing locked. Contact VP/Admin to make changes."}
                              style={{ background: "#e2e8f0", border: "none", borderRadius: 7, padding: "5px 10px", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                              🔒 Locked
                            </button>
                          ) : isProcurement && row.approvalStatus !== "PROCEED" ? (
                            <button
                              disabled
                              title="OH approval pending — vendor can be assigned only after OH approves"
                              style={{ background: "#e2e8f0", border: "none", borderRadius: 7, padding: "5px 10px", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                              ⏳ Pending OH
                            </button>
                          ) : (
                            <button
                              style={{ background: "linear-gradient(135deg,#0369a1,#0ea5e9)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                              onClick={() => openAssign(row)}>
                              ✏️ Assign
                            </button>
                          )
                        )}
                        {(isAdmin || isProcurement) && row.vendor && row.pwjType && (() => {
                          const clubbedWithId = (() => { try { return JSON.parse(row.docData||"{}").clubbedWithId || null; } catch { return null; } })();
                          if (clubbedWithId) {
                            const primary = entries.find(e => e.id === clubbedWithId);
                            return <button style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                              onClick={() => primary ? openDocModal(primary) : showToast(`Open entry #${clubbedWithId} to view the doc`, "info")}>
                              📎 Clubs #{clubbedWithId}
                            </button>;
                          }
                          const rowPartial = (() => { try { const p = JSON.parse(row.docData||"{}"); return p.multiVendor && Array.isArray(p.docs) && row.docStatus === "VP_APPROVED" && p.docs.some(d => !d.docStatus || d.docStatus === "DRAFT"); } catch { return false; } })();
                          const lbl = rowPartial ? "Partially Issued ⚠" : row.docStatus === "VP_APPROVED" ? "Doc Issued" : row.docStatus === "PENDING_VP_APPROVAL" ? "Pending VP" : row.docStatus === "VP_REJECTED" ? "Not Approved" : row.docStatus === "REVISION_REQUESTED" ? "Revision ⚠" : row.docStatus === "REVOKED" ? "↩ Revoked" : "View Doc";
                          const bg  = rowPartial ? "linear-gradient(135deg,#92400e,#f59e0b)" : row.docStatus === "VP_APPROVED" ? "linear-gradient(135deg,#166534,#16a34a)" : row.docStatus === "PENDING_VP_APPROVAL" ? "linear-gradient(135deg,#92400e,#d97706)" : row.docStatus === "VP_REJECTED" ? "linear-gradient(135deg,#991b1b,#ef4444)" : row.docStatus === "REVISION_REQUESTED" ? "linear-gradient(135deg,#c2410c,#f97316)" : row.docStatus === "REVOKED" ? "linear-gradient(135deg,#6b21a8,#9333ea)" : "linear-gradient(135deg,#5b21b6,#7c3aed)";
                          return (
                            <button style={{ background: bg, border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                              onClick={() => openDocModal(row)}>
                              📄 {lbl}
                            </button>
                          );
                        })()}
                        {(isEngineer || isVP || isOH || isCeo || isProjectManager) && row.docStatus && (() => {
                          const clubbedWithId = (() => { try { return JSON.parse(row.docData||"{}").clubbedWithId || null; } catch { return null; } })();
                          if (clubbedWithId) {
                            const primary = entries.find(e => e.id === clubbedWithId);
                            return <button style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                              onClick={() => { setEngDocFile(null); primary ? openDocModal(primary) : showToast(`Open entry #${clubbedWithId} to view the doc`, "info"); }}>
                              📎 Clubs #{clubbedWithId}
                            </button>;
                          }
                          const rowPartial = (() => { try { const p = JSON.parse(row.docData||"{}"); return p.multiVendor && Array.isArray(p.docs) && row.docStatus === "VP_APPROVED" && p.docs.some(d => !d.docStatus || d.docStatus === "DRAFT"); } catch { return false; } })();
                          const lbl = rowPartial ? "Partially Issued" : row.docStatus === "VP_APPROVED" ? "Doc Issued" : row.docStatus === "PENDING_VP_APPROVAL" ? "Doc Pending" : "View Doc";
                          const bg  = rowPartial ? "linear-gradient(135deg,#92400e,#f59e0b)" : row.docStatus === "VP_APPROVED" ? "linear-gradient(135deg,#166534,#16a34a)" : row.docStatus === "PENDING_VP_APPROVAL" ? "linear-gradient(135deg,#92400e,#d97706)" : "linear-gradient(135deg,#0369a1,#0ea5e9)";
                          return (
                            <button style={{ background: bg, border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                              onClick={() => { setEngDocFile(null); openDocModal(row); }}>
                              📄 {lbl}
                            </button>
                          );
                        })()}
                        {isAdmin && (
                          <button
                            style={{ background: "linear-gradient(135deg,#991b1b,#ef4444)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                            onClick={async () => {
                              if (!window.confirm(`Delete entry #${row.id} (${row.materialRequired || "this entry"})? This cannot be undone.`)) return;
                              const r = await api.deleteEntry(row.id);
                              if (r.success) {
                                setEntries(es => es.filter(x => x.id !== row.id));
                                showToast("Entry deleted ✅");
                              } else {
                                showToast(r.message || "Delete failed", "error");
                              }
                            }}>
                            🗑️ Delete
                          </button>
                        )}
                        {(() => {
                          try {
                            const dd = JSON.parse(row.docData || "{}");
                            if (Array.isArray(dd.clubbedEntryIds) && dd.clubbedEntryIds.length > 0) return (
                              <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, background: "#f5f3ff", borderRadius: 5, padding: "3px 7px", border: "1px solid #ddd6fe", whiteSpace: "nowrap" }}>
                                📎 Clubs #{dd.clubbedEntryIds.join(", #")}
                              </div>
                            );
                          } catch {}
                          return null;
                        })()}
                      </div>
                    </td>
                  </tr>
                    );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── PAGINATION ─── */}
        <div style={s.paginationRow} className="app-pagination">
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
          // Derive unique categories for filter dropdown
          const categories = [...new Set(allVendorsStatus.map(v => v.category).filter(Boolean))].sort();
          // Apply status tab + search + category filter, sorted latest updated first
          const q = vendorSearch.toLowerCase().trim();
          const displayed = [...allVendorsStatus]
            .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
            .filter(v => vendorStatusTab === "ALL" || v.status === vendorStatusTab)
            .filter(v => !vendorCategoryFilter || v.category === vendorCategoryFilter)
            .filter(v => !q || [v.name, v.category, v.contactPerson, v.phoneNumber, v.email, v.gstNumber, v.vendorCode]
              .some(f => f && f.toLowerCase().includes(q)));
          return (
            <div style={{ padding: "24px 36px" }}>
              {/* Top bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.2px" }}>
                  Vendor Management
                  <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 500, color: "#94a3b8" }}>{displayed.length} of {allVendorsStatus.length}</span>
                </div>
                {isAdmin && (
                  <button style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
                    onClick={() => { setAddVendorForm(BLANK_VENDOR_FORM); setAddVendorPage(true); }}>
                    ➕ Add Vendor
                  </button>
                )}
              </div>

              {/* Status tabs */}
              <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2eaf5", marginBottom: 16 }}>
                {vtabs.map(t => {
                  const count = t.key === "ALL" ? allVendorsStatus.length : allVendorsStatus.filter(v => v.status === t.key).length;
                  const active = vendorStatusTab === t.key;
                  return (
                    <button key={t.key} onClick={() => setVendorStatusTab(t.key)}
                      style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                        padding: "10px 18px", fontSize: 13, fontWeight: active ? 700 : 500,
                        color: active ? "#1a6ab1" : "#64748b",
                        borderBottom: active ? "2px solid #1a6ab1" : "2px solid transparent", marginBottom: -2 }}>
                      {t.label}
                      <span style={{ marginLeft: 6, fontSize: 11, background: active ? "#dbeafe" : "#f1f5f9",
                        color: active ? "#1d4ed8" : "#64748b", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search + filter bar */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15, pointerEvents: "none" }}>🔍</span>
                  <input
                    type="text" placeholder="Search name, category, contact, GST, email…"
                    value={vendorSearch} onChange={e => setVendorSearch(e.target.value)}
                    style={{ width: "100%", border: "1.5px solid #e2eaf5", borderRadius: 10, padding: "9px 12px 9px 36px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: "#0f172a", boxSizing: "border-box" }} />
                </div>
                <select value={vendorCategoryFilter} onChange={e => setVendorCategoryFilter(e.target.value)}
                  style={{ border: "1.5px solid #e2eaf5", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: vendorCategoryFilter ? "#0f172a" : "#94a3b8", outline: "none", cursor: "pointer", minWidth: 160 }}>
                  <option value="">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {(vendorSearch || vendorCategoryFilter) && (
                  <button onClick={() => { setVendorSearch(""); setVendorCategoryFilter(""); }}
                    style={{ border: "1.5px solid #e2eaf5", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontFamily: "inherit", background: "#fff", color: "#64748b", cursor: "pointer", fontWeight: 600 }}>
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Vendor list table */}
              {vpLoading ? (
                <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>Loading vendors…</div>
              ) : displayed.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 14 }}>No vendors found</div>
              ) : (
                <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e2eaf5", overflow: "hidden" }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.4fr 1.2fr 1fr 120px", gap: 0, background: "#f8fafc", borderBottom: "1.5px solid #e2eaf5", padding: "10px 20px" }}>
                    {["Vendor", "Category", "Contact", "GST / Code", "Status", "Actions"].map(h => (
                      <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</div>
                    ))}
                  </div>
                  {/* Rows */}
                  {displayed.map((v, idx) => {
                    const cfg = STATUS_CFG[v.status] || STATUS_CFG.PENDING_APPROVAL;
                    const isPending = v.status === "PENDING_APPROVAL";
                    return (
                      <div key={v.id}
                        style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.4fr 1.2fr 1fr 120px", gap: 0, padding: "13px 20px", borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#fff" : "#fafbfe", alignItems: "center", transition: "background .1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f0f7ff"}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafbfe"}>
                        {/* Name */}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{v.name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                            Added {fmtDate(v.createdAt)}
                          </div>
                        </div>
                        {/* Category */}
                        <div style={{ fontSize: 12, color: "#475569" }}>{v.category || "—"}</div>
                        {/* Contact */}
                        <div>
                          {v.contactPerson && <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{v.contactPerson}</div>}
                          {v.phoneNumber && <div style={{ fontSize: 11, color: "#64748b" }}>📞 {v.phoneNumber}</div>}
                          {v.email && <div style={{ fontSize: 11, color: "#64748b" }}>✉️ {v.email}</div>}
                        </div>
                        {/* GST / Code */}
                        <div>
                          {v.gstNumber && <div style={{ fontSize: 12, color: "#475569" }}>{v.gstNumber}</div>}
                          {v.vendorCode && <div style={{ fontSize: 11, color: "#94a3b8" }}>#{v.vendorCode}</div>}
                          {!v.gstNumber && !v.vendorCode && <span style={{ color: "#94a3b8" }}>—</span>}
                        </div>
                        {/* Status badge */}
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
                            background: cfg.bg, color: cfg.color, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />
                            {cfg.label}
                          </span>
                        </div>
                        {/* Actions */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => setViewVendor(v)}
                            style={{ background: "#f1f5f9", border: "1px solid #e2eaf5", borderRadius: 7, padding: "5px 10px", color: "#1a6ab1", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                            👁 View
                          </button>
                          {isVP && isPending && (<>
                            <button style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                              onClick={async () => { const r = await api.approveVendor(v.id); if (r.success) { setAllVendorsStatus(a => a.map(x => x.id === v.id ? { ...x, status: "APPROVED" } : x)); setApprovedVendors(a => a.some(x => x.id === v.id) ? a.map(x => x.id === v.id ? { ...x, status: "APPROVED" } : x) : [...a, { ...v, status: "APPROVED" }]); setPendingVendorCount(c => Math.max(0, c - 1)); showToast(`${v.name} approved ✅`); } else showToast(r.message || "Failed", "error"); }}>✅</button>
                            <button style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                              onClick={async () => { const r = await api.rejectVendor(v.id); if (r.success) { setAllVendorsStatus(a => a.map(x => x.id === v.id ? { ...x, status: "REJECTED", active: false } : x)); setApprovedVendors(a => a.filter(x => x.id !== v.id)); setPendingVendorCount(c => Math.max(0, c - 1)); showToast(`${v.name} rejected`, "error"); } else showToast(r.message || "Failed", "error"); }}>❌</button>
                          </>)}
                          {(isAdmin || isVP) && (
                            <button onClick={() => openEditVendor(v)}
                              style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "5px 10px", color: "#1d4ed8", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                              ✏️ Edit
                            </button>
                          )}
                          {(isAdmin || isVP) && (
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Permanently delete vendor "${v.name}"? This cannot be undone.`)) return;
                                const r = await api.deleteVendor(v.id);
                                if (r.success) { setAllVendorsStatus(a => a.filter(x => x.id !== v.id)); showToast("Vendor deleted ✅"); }
                                else showToast(r.message || "Delete failed", "error");
                              }}
                              style={{ background: "#7f1d1d", border: "none", borderRadius: 7, padding: "5px 10px", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── PROJECTS TAB ─── */}
        {mainTab === "projects" && (() => {
          const activeProjects   = managedProjects.filter(p => p.active);
          const inactiveProjects = managedProjects.filter(p => !p.active);
          const fmtINR = v => v != null ? `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—";
          const statusBadge = (status, type) => {
            const col = status === "Received" ? "#166534" : status === "Pending" ? "#92400e" : "#475569";
            const bg  = status === "Received" ? "#dcfce7"  : status === "Pending" ? "#fef3c7"  : "#f1f5f9";
            return <span style={{ background: bg, color: col, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{status || "—"}</span>;
          };

          const openCreateProject = async () => {
            setEditingProject(null);
            setProjectMgmtForm(BLANK_PROJECT_FORM);
            const r = await api.getProjectClients();
            if (r.success) setProjectClients(r.data);
            setProjectMgmtModal(true);
          };
          const openEditProject = async (p) => {
            setEditingProject(p);
            const CLIENT_SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
            const rawClient = (p.clientName || "").trim();
            const matchedSal = CLIENT_SALUTATIONS.find(s => rawClient.startsWith(s + " "));
            const clientSalutation = matchedSal || "";
            const clientNameOnly   = matchedSal ? rawClient.slice(matchedSal.length + 1) : rawClient;
            setProjectMgmtForm({
              name: p.name, location: p.location || "", description: p.description || "",
              clientSalutation, clientName: clientNameOnly, clientGstNo: p.clientGstNo || "",
              clientAddress: p.clientAddress || "", billingAddress: p.billingAddress || "",
              billingSameAsClient: (p.billingAddress || "") === (p.clientAddress || ""),
              projectValue: p.projectValue != null ? String(p.projectValue) : "",
              quoteValue: p.quoteValue != null ? String(p.quoteValue) : "",
              quoteGstPct: p.quoteGstPct != null ? String(p.quoteGstPct) : "18",
              quoteDocUrl: p.quoteDocUrl || "",
              additionalWoValue: p.additionalWoValue != null ? String(p.additionalWoValue) : "",
              additionalWoGstPct: p.additionalWoGstPct != null ? String(p.additionalWoGstPct) : "18",
              additionalWoDocUrl: p.additionalWoDocUrl || "",
              additionalQuoteValue: p.additionalQuoteValue != null ? String(p.additionalQuoteValue) : "",
              additionalQuoteGstPct: p.additionalQuoteGstPct != null ? String(p.additionalQuoteGstPct) : "18",
              additionalQuoteDocUrl: p.additionalQuoteDocUrl || "",
              gstPct: p.gstPct != null ? String(p.gstPct) : "18",
              poWoStatus: p.poWoStatus || "Pending", poWoDocUrl: p.poWoDocUrl || "",
              amendedPoWoStatus: p.amendedPoWoStatus || "N/A", amendedPoWoDocUrl: p.amendedPoWoDocUrl || "",
            });
            const r = await api.getProjectClients();
            if (r.success) setProjectClients(r.data);
            setProjectMgmtModal(true);
          };

          const setF = (k, v) => setProjectMgmtForm(f => ({ ...f, [k]: v }));

          const saveProject = async () => {
            if (!projectMgmtForm.name.trim()) { showToast("Project name is required", "error"); return; }
            setProjectMgmtLoading(true);
            try {
              const body = {
                ...projectMgmtForm,
                clientName: [projectMgmtForm.clientSalutation, projectMgmtForm.clientName].filter(Boolean).join(" ") || null,
                projectValue: projectMgmtForm.projectValue ? parseFloat(projectMgmtForm.projectValue) : null,
                quoteValue: projectMgmtForm.quoteValue ? parseFloat(projectMgmtForm.quoteValue) : null,
                quoteGstPct: projectMgmtForm.quoteGstPct ? parseInt(projectMgmtForm.quoteGstPct) : null,
                additionalWoValue: projectMgmtForm.additionalWoValue ? parseFloat(projectMgmtForm.additionalWoValue) : null,
                additionalWoGstPct: projectMgmtForm.additionalWoGstPct ? parseInt(projectMgmtForm.additionalWoGstPct) : null,
                additionalWoDocUrl: projectMgmtForm.additionalWoDocUrl || null,
                additionalQuoteValue: projectMgmtForm.additionalQuoteValue ? parseFloat(projectMgmtForm.additionalQuoteValue) : null,
                additionalQuoteGstPct: projectMgmtForm.additionalQuoteGstPct ? parseInt(projectMgmtForm.additionalQuoteGstPct) : null,
                additionalQuoteDocUrl: projectMgmtForm.additionalQuoteDocUrl || null,
                gstPct: projectMgmtForm.gstPct ? parseInt(projectMgmtForm.gstPct) : null,
                billingAddress: projectMgmtForm.billingSameAsClient ? projectMgmtForm.clientAddress : projectMgmtForm.billingAddress,
              };
              delete body.billingSameAsClient;
              delete body.clientSalutation;
              const r = editingProject
                ? await api.updateProject(editingProject.id, body)
                : await api.createProject(body);
              if (r.success) {
                await fetchManagedProjects();
                showToast(editingProject ? "Project updated ✅" : "Project created ✅");
                setProjectMgmtModal(false);
              } else showToast(r.message || "Failed", "error");
            } catch { showToast("Error saving project", "error"); }
            finally { setProjectMgmtLoading(false); }
          };

          const deactivateProject = async (p) => {
            if (!window.confirm(`Deactivate "${p.name}"?`)) return;
            const r = await api.deleteProject(p.id);
            if (r.success) { await fetchManagedProjects(); showToast("Project deactivated"); }
          };
          const reactivateProject = async (p) => {
            const r = await api.updateProject(p.id, { active: true });
            if (r.success) { await fetchManagedProjects(); showToast("Project reactivated ✅"); }
          };

          const uploadProjectDoc = async (field, file, setUploading) => {
            setUploading(true);
            try {
              const fd = new FormData(); fd.append("file", file);
              const r = await fetch(`${BACKEND_BASE}/api/v1/upload/document`, { method: "POST", body: fd }).then(x => x.json());
              if (r.success) setF(field, r.data);
              else showToast("Upload failed", "error");
            } catch { showToast("Upload error", "error"); }
            finally { setUploading(false); }
          };

          const inpSt = { width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" };
          const selSt = { ...inpSt, cursor: "pointer" };
          const lbl   = (txt) => <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>{txt}</label>;
          const sec   = (txt) => <div style={{ fontSize: 11, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: 1, borderBottom: "2px solid #e2e8f0", paddingBottom: 6, marginBottom: 14, marginTop: 6 }}>{txt}</div>;

          // auto-fill client fields when client is selected from datalist
          const onClientSelect = (name) => {
            setF("clientName", name);
            const found = projectClients.find(c => c.clientName === name);
            if (found) {
              setF("clientGstNo",   found.clientGstNo);
              setF("clientAddress", found.clientAddress);
              if (projectMgmtForm.billingSameAsClient) setF("billingAddress", found.clientAddress);
            }
          };

          const grossVal     = parseFloat(projectMgmtForm.projectValue) || 0;
          const gstAmt       = grossVal * (parseInt(projectMgmtForm.gstPct) || 0) / 100;
          const totalVal     = grossVal + gstAmt;
          const quoteVal      = parseFloat(projectMgmtForm.quoteValue) || 0;
          const quoteGstAmt   = quoteVal * (parseInt(projectMgmtForm.quoteGstPct) || 0) / 100;
          const quoteTotalVal  = quoteVal + quoteGstAmt;
          const addWoVal       = parseFloat(projectMgmtForm.additionalWoValue) || 0;
          const addWoGstAmt    = addWoVal * (parseInt(projectMgmtForm.additionalWoGstPct) || 0) / 100;
          const addWoTotal     = addWoVal + addWoGstAmt;
          const addQuoteVal    = parseFloat(projectMgmtForm.additionalQuoteValue) || 0;
          const addQuoteGstAmt = addQuoteVal * (parseInt(projectMgmtForm.additionalQuoteGstPct) || 0) / 100;
          const addQuoteTotal  = addQuoteVal + addQuoteGstAmt;

          return (
            <div style={{ padding: "28px 36px" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <div>
                  <div style={{ fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.2px" }}>Project Management</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                    {activeProjects.length} active project{activeProjects.length !== 1 ? "s" : ""} · Engineers select from this list when creating entries
                  </div>
                </div>
                {!isCeo && (
                  <button onClick={openCreateProject}
                    style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    + Add Project
                  </button>
                )}
              </div>

              {activeProjects.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8", fontSize: 15 }}>
                  No active projects yet. Click <strong>+ Add Project</strong> to get started.
                </div>
              )}

              {/* Active project cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16, marginBottom: 28 }}>
                {activeProjects.map(p => (
                  <div key={p.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
                    {/* Card header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>{p.name}</div>
                        {p.location && <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>📍 {p.location}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {!isCeo && <button onClick={() => openEditProject(p)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#374151", fontFamily: "inherit" }}>✏️ Edit</button>}
                        {!isCeo && <button onClick={() => deactivateProject(p)} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#dc2626", fontFamily: "inherit" }}>Deactivate</button>}
                        {(isAdmin || isVP) && (
                          <button onClick={async () => {
                            if (!window.confirm(`Permanently delete "${p.name}"? This cannot be undone.`)) return;
                            const r = await api.permanentDeleteProject(p.id);
                            if (r.success) { await fetchManagedProjects(); showToast("Project deleted ✅"); }
                            else showToast(r.message || "Delete failed", "error");
                          }} style={{ background: "#7f1d1d", border: "none", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#fff", fontFamily: "inherit" }}>🗑️ Delete</button>
                        )}
                      </div>
                    </div>

                    {/* Client row */}
                    {p.clientName && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f1f5f9" }}>
                        <div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Client</div><div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{p.clientName}</div></div>
                        {p.clientGstNo && <div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>GST</div><div style={{ fontSize: 12, color: "#374151" }}>{p.clientGstNo}</div></div>}
                      </div>
                    )}

                    {/* Financial row */}
                    {p.projectValue != null && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 10px", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f1f5f9" }}>
                        <div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Gross Value</div><div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{fmtINR(p.projectValue)}</div></div>
                        <div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>GST</div><div style={{ fontSize: 12, color: "#374151" }}>{p.gstPct != null ? `${p.gstPct}%` : "—"}</div></div>
                        <div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Total Value</div><div style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>{fmtINR(p.totalValue)}</div></div>
                      </div>
                    )}

                    {/* PO/WO row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>PO / WO</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {statusBadge(p.poWoStatus)}
                          {p.poWoDocUrl && <a href={`${BACKEND_BASE}${p.poWoDocUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#0369a1", fontWeight: 600, textDecoration: "none" }}>📎 View</a>}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Amended PO / WO</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {statusBadge(p.amendedPoWoStatus)}
                          {p.amendedPoWoDocUrl && <a href={`${BACKEND_BASE}${p.amendedPoWoDocUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#0369a1", fontWeight: 600, textDecoration: "none" }}>📎 View</a>}
                        </div>
                      </div>
                    </div>
                    {/* Budget Utilisation */}
                    {(() => {
                      const budget = p.quoteValue != null ? p.quoteValue * 0.80 : null;
                      const summary = budgetSummary[p.name] || {};
                      const cats = [
                        { key: "material",      label: "Material",       color: "#10b981" },
                        { key: "subcontract",   label: "Sub-Contract",   color: "#8b5cf6" },
                        { key: "labour",        label: "Labour",         color: "#3b82f6" },
                        { key: "consultants",   label: "Consultants",    color: "#f59e0b" },
                        { key: "miscellaneous", label: "Miscellaneous",  color: "#64748b" },
                      ];
                      const totalExp = cats.reduce((s, c) => s + (summary[c.key] || 0), 0);
                      const activeCats = cats.filter(c => (summary[c.key] || 0) > 0);
                      if (activeCats.length === 0 && budget == null) return null;
                      const pct = budget > 0 ? Math.min((totalExp / budget) * 100, 100) : 0;
                      const barColor = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "#10b981";
                      return (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Budget Utilisation</span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: barColor }}>{pct.toFixed(1)}%</span>
                          </div>
                          <div style={{ background: "#f1f5f9", borderRadius: 100, height: 7, marginBottom: 10 }}>
                            <div style={{ width: `${pct}%`, background: barColor, borderRadius: 100, height: "100%", transition: "width 0.4s ease" }} />
                          </div>
                          {activeCats.map(({ key, label, color }) => {
                            const val = summary[key] || 0;
                            const expPct = budget > 0 ? Math.min((val / budget) * 100, 100) : 0;
                            return (
                              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: "#64748b", width: 78, flexShrink: 0 }}>{label}</span>
                                <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 100, height: 4 }}>
                                  <div style={{ width: `${expPct}%`, background: color, borderRadius: 100, height: "100%" }} />
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", width: 85, textAlign: "right", flexShrink: 0 }}>
                                  ₹{Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            );
                          })}
                          {activeCats.length === 0 && (
                            <div style={{ fontSize: 11, color: "#cbd5e1", textAlign: "center", padding: "4px 0" }}>No PWJ documents raised yet</div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                            <div>
                              <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Expenses</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444" }}>₹{Number(totalExp).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                            </div>
                            {budget != null && (
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>Budget (80%)</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "#6366f1" }}>₹{Number(budget).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                              </div>
                            )}
                            {budget != null && (
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>Est. Profit</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: (p.quoteValue - totalExp) >= p.quoteValue * 0.2 ? "#10b981" : "#f59e0b" }}>
                                  ₹{Number(p.quoteValue - totalExp).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 10 }}>Added {fmtDate(p.createdAt)}</div>
                  </div>
                ))}
              </div>

              {/* Inactive projects */}
              {inactiveProjects.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 10 }}>INACTIVE PROJECTS ({inactiveProjects.length})</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10 }}>
                    {inactiveProjects.map(p => (
                      <div key={p.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", opacity: 0.6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#64748b", textDecoration: "line-through" }}>{p.name}</div>
                          {p.location && <div style={{ fontSize: 11, color: "#94a3b8" }}>📍 {p.location}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {!isCeo && <button onClick={() => reactivateProject(p)} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#16a34a", fontFamily: "inherit" }}>Reactivate</button>}
                          {(isAdmin || isVP) && (
                            <button onClick={async () => {
                              if (!window.confirm(`Permanently delete "${p.name}"? This cannot be undone.`)) return;
                              const r = await api.permanentDeleteProject(p.id);
                              if (r.success) { await fetchManagedProjects(); showToast("Project deleted ✅"); }
                              else showToast(r.message || "Delete failed", "error");
                            }} style={{ background: "#7f1d1d", border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff", fontFamily: "inherit" }}>🗑️ Delete</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Create / Edit Modal ── */}
              {projectMgmtModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}
                  onClick={() => setProjectMgmtModal(false)}>
                  <div style={{ background: "#fff", borderRadius: 18, width: "96%", maxWidth: 1000, maxHeight: "92vh", overflowY: "auto", padding: "28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,.22)" }}
                    onClick={e => e.stopPropagation()}>

                    <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", marginBottom: 22 }}>
                      {editingProject ? "✏️ Edit Project" : "🏗️ New Project"}
                    </div>

                    {/* ── Basic Info ── */}
                    {sec("Project Info")}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
                      <div>
                        {lbl("Project Name *")}
                        <input style={inpSt} placeholder="e.g. Adyar Residential Block A"
                          value={projectMgmtForm.name} onChange={e => setF("name", e.target.value)} />
                      </div>
                      <div>
                        {lbl("Location")}
                        <input style={inpSt} placeholder="e.g. Chennai, Tamil Nadu"
                          value={projectMgmtForm.location} onChange={e => setF("location", e.target.value)} />
                      </div>
                      <div>
                        {lbl("Description")}
                        <input style={inpSt} placeholder="Optional"
                          value={projectMgmtForm.description} onChange={e => setF("description", e.target.value)} />
                      </div>
                    </div>

                    {/* ── Client Info ── */}
                    {sec("Client Details")}
                    <datalist id="client-names-list">
                      {projectClients.map(c => <option key={c.clientName} value={c.clientName} />)}
                    </datalist>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
                      <div>
                        {lbl("Client Name")}
                        <div style={{ display: "flex", gap: 8 }}>
                          <select value={projectMgmtForm.clientSalutation}
                            onChange={e => setF("clientSalutation", e.target.value)}
                            style={{ ...selSt, width: 80, flexShrink: 0 }}>
                            <option value="">—</option>
                            <option value="Mr.">Mr.</option>
                            <option value="Mrs.">Mrs.</option>
                            <option value="Ms.">Ms.</option>
                            <option value="Dr.">Dr.</option>
                          </select>
                          <input style={inpSt} placeholder="Type or select existing client" list="client-names-list"
                            value={projectMgmtForm.clientName}
                            onChange={e => onClientSelect(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        {lbl("Client GST No.")}
                        <input style={inpSt} placeholder="e.g. 33AAAAA0000A1Z5"
                          value={projectMgmtForm.clientGstNo} onChange={e => setF("clientGstNo", e.target.value)} />
                      </div>
                      <div>
                        {lbl("Site Address")}
                        <textarea rows={3} style={{ ...inpSt, resize: "none" }} placeholder="Full address…"
                          value={projectMgmtForm.clientAddress}
                          onChange={e => {
                            setF("clientAddress", e.target.value);
                            if (projectMgmtForm.billingSameAsClient) setF("billingAddress", e.target.value);
                          }} />
                      </div>
                      <div>
                        {lbl("Billing Address")}
                        <textarea rows={3} style={{ ...inpSt, resize: "none", opacity: projectMgmtForm.billingSameAsClient ? 0.5 : 1 }}
                          placeholder="Billing address…" disabled={projectMgmtForm.billingSameAsClient}
                          value={projectMgmtForm.billingSameAsClient ? projectMgmtForm.clientAddress : projectMgmtForm.billingAddress}
                          onChange={e => setF("billingAddress", e.target.value)} />
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569", marginTop: 5, cursor: "pointer" }}>
                          <input type="checkbox" checked={projectMgmtForm.billingSameAsClient}
                            onChange={e => {
                              setF("billingSameAsClient", e.target.checked);
                              if (e.target.checked) setF("billingAddress", projectMgmtForm.clientAddress);
                            }} />
                          Same as Site Address
                        </label>
                      </div>
                    </div>

                    {/* ── Financial ── */}
                    {sec("Financial")}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px 16px", marginBottom: 10 }}>
                      <div>
                        {lbl("Quote Value (₹)")}
                        <input style={inpSt} type="number" placeholder="0.00"
                          value={projectMgmtForm.quoteValue} onChange={e => setF("quoteValue", e.target.value)} />
                      </div>
                      <div>
                        {lbl("Quote GST %")}
                        <select style={selSt} value={projectMgmtForm.quoteGstPct} onChange={e => setF("quoteGstPct", e.target.value)}>
                          <option value="">— %</option>
                          <option value="9">9%</option>
                          <option value="18">18%</option>
                        </select>
                      </div>
                      <div>
                        {lbl("Quote Total (₹)")}
                        <input style={{ ...inpSt, background: "#f8fafc", color: "#166534", fontWeight: 700 }} readOnly
                          value={quoteVal > 0 ? `₹ ${quoteTotalVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : ""} />
                      </div>
                      <div>
                        {lbl("Quote Document")}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <label style={{ flex: 1, border: "1.5px dashed #94a3b8", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "#fafafa", fontSize: 12, color: "#64748b" }}>
                            <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: "none" }}
                              onChange={e => e.target.files[0] && uploadProjectDoc("quoteDocUrl", e.target.files[0], setQuoteDocUploading)} />
                            {quoteDocUploading ? "Uploading…" : projectMgmtForm.quoteDocUrl ? "📎 Replace" : "📎 Attach"}
                          </label>
                          {projectMgmtForm.quoteDocUrl && (
                            <a href={`${BACKEND_BASE}${projectMgmtForm.quoteDocUrl}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: "#0369a1", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>👁 View</a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px 16px", marginBottom: 20 }}>
                      <div>
                        {lbl("Work Order Value (₹)")}
                        <input style={inpSt} type="number" placeholder="0.00"
                          value={projectMgmtForm.projectValue} onChange={e => setF("projectValue", e.target.value)} />
                      </div>
                      <div>
                        {lbl("GST %")}
                        <select style={selSt} value={projectMgmtForm.gstPct} onChange={e => setF("gstPct", e.target.value)}>
                          <option value="">— %</option>
                          <option value="9">9%</option>
                          <option value="18">18%</option>
                          <option value="28">28%</option>
                        </select>
                      </div>
                      <div>
                        {lbl("Total Value (₹)")}
                        <input style={{ ...inpSt, background: "#f8fafc", color: "#166534", fontWeight: 700 }} readOnly
                          value={grossVal > 0 ? `₹ ${totalVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : ""} />
                      </div>
                      <div>
                        {lbl("Work Order Document")}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <label style={{ flex: 1, border: "1.5px dashed #94a3b8", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "#fafafa", fontSize: 12, color: "#64748b" }}>
                            <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: "none" }}
                              onChange={e => e.target.files[0] && uploadProjectDoc("poWoDocUrl", e.target.files[0], setPoWoUploading)} />
                            {poWoUploading ? "Uploading…" : projectMgmtForm.poWoDocUrl ? "📎 Replace" : "📎 Attach"}
                          </label>
                          {projectMgmtForm.poWoDocUrl && (
                            <a href={`${BACKEND_BASE}${projectMgmtForm.poWoDocUrl}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: "#0369a1", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>👁 View</a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Additional Quote row (row 3) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px 16px", marginBottom: 10 }}>
                      <div>
                        {lbl("Additional Quote Value (₹)")}
                        <input style={inpSt} type="number" placeholder="0.00"
                          value={projectMgmtForm.additionalQuoteValue} onChange={e => setF("additionalQuoteValue", e.target.value)} />
                      </div>
                      <div>
                        {lbl("GST %")}
                        <select style={selSt} value={projectMgmtForm.additionalQuoteGstPct} onChange={e => setF("additionalQuoteGstPct", e.target.value)}>
                          <option value="">— %</option>
                          <option value="9">9%</option>
                          <option value="18">18%</option>
                        </select>
                      </div>
                      <div>
                        {lbl("Total (₹)")}
                        <input style={{ ...inpSt, background: "#f8fafc", color: "#166534", fontWeight: 700 }} readOnly
                          value={addQuoteVal > 0 ? `₹ ${addQuoteTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : ""} />
                      </div>
                      <div>
                        {lbl("Document")}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <label style={{ flex: 1, border: "1.5px dashed #94a3b8", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "#fafafa", fontSize: 12, color: "#64748b" }}>
                            <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: "none" }}
                              onChange={e => e.target.files[0] && uploadProjectDoc("additionalQuoteDocUrl", e.target.files[0], setAddQuoteDocUploading)} />
                            {addQuoteDocUploading ? "Uploading…" : projectMgmtForm.additionalQuoteDocUrl ? "📎 Replace" : "📎 Attach"}
                          </label>
                          {projectMgmtForm.additionalQuoteDocUrl && (
                            <a href={`${BACKEND_BASE}${projectMgmtForm.additionalQuoteDocUrl}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: "#0369a1", fontWeight: 600, textDecoration: "none" }}>👁 View</a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Additional Work Order row (row 4) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px 16px", marginBottom: 20 }}>
                      <div>
                        {lbl("Additional Work Order Value (₹)")}
                        <input style={inpSt} type="number" placeholder="0.00"
                          value={projectMgmtForm.additionalWoValue} onChange={e => setF("additionalWoValue", e.target.value)} />
                      </div>
                      <div>
                        {lbl("GST %")}
                        <select style={selSt} value={projectMgmtForm.additionalWoGstPct} onChange={e => setF("additionalWoGstPct", e.target.value)}>
                          <option value="">— %</option>
                          <option value="9">9%</option>
                          <option value="18">18%</option>
                          <option value="28">28%</option>
                        </select>
                      </div>
                      <div>
                        {lbl("Total (₹)")}
                        <input style={{ ...inpSt, background: "#f8fafc", color: "#166534", fontWeight: 700 }} readOnly
                          value={addWoVal > 0 ? `₹ ${addWoTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : ""} />
                      </div>
                      <div>
                        {lbl("Document")}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <label style={{ flex: 1, border: "1.5px dashed #94a3b8", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "#fafafa", fontSize: 12, color: "#64748b" }}>
                            <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: "none" }}
                              onChange={e => e.target.files[0] && uploadProjectDoc("additionalWoDocUrl", e.target.files[0], setAddWoDocUploading)} />
                            {addWoDocUploading ? "Uploading…" : projectMgmtForm.additionalWoDocUrl ? "📎 Replace" : "📎 Attach"}
                          </label>
                          {projectMgmtForm.additionalWoDocUrl && (
                            <a href={`${BACKEND_BASE}${projectMgmtForm.additionalWoDocUrl}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: "#0369a1", fontWeight: 600, textDecoration: "none" }}>👁 View</a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── PO / WO ── */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 20 }}>
                      <div>
                        {lbl("Status")}
                        <select style={selSt} value={projectMgmtForm.poWoStatus} onChange={e => setF("poWoStatus", e.target.value)}>
                          <option value="Received">Received</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>
                      <div>
                        {lbl("Document")}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <label style={{ flex: 1, border: "1.5px dashed #94a3b8", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "#fafafa", fontSize: 12, color: "#64748b" }}>
                            <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: "none" }}
                              onChange={e => e.target.files[0] && uploadProjectDoc("poWoDocUrl", e.target.files[0], setPoWoUploading)} />
                            {poWoUploading ? "Uploading…" : projectMgmtForm.poWoDocUrl ? "📎 Replace doc" : "📎 Attach doc"}
                          </label>
                          {projectMgmtForm.poWoDocUrl && (
                            <a href={`${BACKEND_BASE}${projectMgmtForm.poWoDocUrl}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: "#0369a1", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>👁 View</a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Amended PO / WO ── */}
                    {sec("Amended PO / WO")}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 24 }}>
                      <div>
                        {lbl("Status")}
                        <select style={selSt} value={projectMgmtForm.amendedPoWoStatus} onChange={e => setF("amendedPoWoStatus", e.target.value)}>
                          <option value="N/A">N/A</option>
                          <option value="Received">Received</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>
                      <div>
                        {lbl("Document")}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <label style={{ flex: 1, border: "1.5px dashed #94a3b8", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "#fafafa", fontSize: 12, color: "#64748b" }}>
                            <input type="file" accept=".pdf,.doc,.docx,image/*" style={{ display: "none" }}
                              onChange={e => e.target.files[0] && uploadProjectDoc("amendedPoWoDocUrl", e.target.files[0], setAmendedPoWoUploading)} />
                            {amendedPoWoUploading ? "Uploading…" : projectMgmtForm.amendedPoWoDocUrl ? "📎 Replace doc" : "📎 Attach doc"}
                          </label>
                          {projectMgmtForm.amendedPoWoDocUrl && (
                            <a href={`${BACKEND_BASE}${projectMgmtForm.amendedPoWoDocUrl}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: "#0369a1", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>👁 View</a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={saveProject} disabled={projectMgmtLoading}
                        style={{ flex: 1, background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", border: "none", borderRadius: 10, padding: "12px 0", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                        {projectMgmtLoading ? "Saving…" : editingProject ? "💾 Save Changes" : "✅ Create Project"}
                      </button>
                      <button onClick={() => setProjectMgmtModal(false)}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#64748b", fontFamily: "inherit" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── ACCOUNT MODULE ─── */}
        {mainTab === "account" && <AccountSection isCeo={isCeo} />}
        {mainTab === "sales"   && <SalesPage />}

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
                  ["Timestamp", fmtDate(detailRow.timestamp)],
                  ["Raised By", detailRow.raisedBy],
                  ["Project", detailRow.projectName],
                  ["BOQ No.", detailRow.boqNo],
                  ["Material", detailRow.materialRequired],
                  ["Specification", detailRow.specification],
                  ["Brand", detailRow.brand],
                  ["Unit", detailRow.unit],
                  ["Quantity", detailRow.quantity],
                  ["Date of Requirement", fmtDate(detailRow.dateOfRequirement)],
                  ["Dependency", detailRow.dependency],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={s.dLabel}>{l}</div>
                    <div style={s.dVal}>{v || "—"}</div>
                  </div>
                ))}
                {parseImageRefs(detailRow.imageReference).length > 0 && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={s.dLabel}>Image Reference ({parseImageRefs(detailRow.imageReference).length})</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      {parseImageRefs(detailRow.imageReference).map((url, i) => (
                        <ImageOrLink key={i} src={BACKEND_BASE + url} label={`Image ${i + 1}`} />
                      ))}
                    </div>
                  </div>
                )}
                <div style={s.divider}>🏭 Procurement & Status</div>
                {[
                  ["Vendor", detailRow.vendor],
                  ["PWJ Issued", detailRow.pwjIssued ? "Yes" : "No"],
                  ["Delivered Date", fmtDate(detailRow.deliveredDate)],
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
                  <div><div style={s.dLabel}>Approved At</div><div style={s.dVal}>{fmtDate(detailRow.approvedAt)}</div></div>
                  <div style={{ gridColumn: "1/-1" }}><div style={s.dLabel}>Approval Comment</div><div style={s.dVal}>{detailRow.approvalComment || "—"}</div></div>
                </>}
                {detailRow.remarks && <>
                  <div style={s.divider}>💬 Remarks</div>
                  <div style={{ gridColumn: "1/-1" }}><div style={s.dVal}>{detailRow.remarks}</div></div>
                </>}
                {detailRow.siteRemarks && (() => {
                  const logEntries = detailRow.siteRemarks.split("\n").filter(Boolean);
                  return (
                    <>
                      <div style={s.divider}>🏗️ Remarks for Site Team</div>
                      <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 8 }}>
                        {logEntries.map((line, i) => {
                          const m = line.match(/^\[(.+?)\]\s*(.*)/);
                          return m ? (
                            <div key={i} style={{ borderLeft: "3px solid #d8b4fe", paddingLeft: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 2 }}>{m[1]}</div>
                              <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{m[2]}</div>
                            </div>
                          ) : (
                            <div key={i} style={{ fontSize: 13, color: "#0f172a" }}>{line}</div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
              {/* Edit button inside detail modal for engineer (locked when PROCEED) */}
              {isEngineer && detailRow.raisedBy === (user?.fullName || user?.username) && (
                detailRow.approvalStatus === "PROCEED" ? (
                  <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef9c3", borderRadius: 8, border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
                    🔒 This entry has been OH approved and can no longer be edited.
                  </div>
                ) : (
                  <button style={{ ...s.submitBtn("linear-gradient(135deg,#0369a1,#0ea5e9)"), marginTop: 16 }}
                    onClick={() => { setDetailRow(null); openEditEntry(detailRow); }}>
                    ✏️ Edit Entry
                  </button>
                )
              )}
              {/* Approve button inside detail modal */}
              {isOH && (
                detailRow.approvalStatus === "PROCEED"
                  ? <div style={{ marginTop: 16, padding: "10px 14px", background: "#dcfce7", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 13, color: "#166534", fontWeight: 600 }}>✅ This entry has been approved. No further action required.</div>
                  : canApprove(detailRow) && (
                    <button style={{ ...s.submitBtn(), marginTop: 20 }}
                      onClick={() => {
                        setDetailRow(null);
                        setApprovalForm({ approvalStatus: "PROCEED", comment: "", approvedBy: "OH" });
                        setApprovalModal({ entry: detailRow });
                      }}>
                      ✅ Take Approval Action
                    </button>
                  )
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
              {approvalModal.entry.approvalStatus === "PROCEED" ? (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#166534" }}>Already Approved</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>This entry has been approved and cannot be changed.</div>
                  <button style={{ marginTop: 20, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 24px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", color: "#475569" }} onClick={() => setApprovalModal(null)}>Close</button>
                </div>
              ) : (<>
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
                  {(!isOH || approvalModal?.entry?.approvalStatus === "HOLD") && (
                    <option value="NOT_APPROVED">❌ Not Approved</option>
                  )}
                </select>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Approved By</label>
                <div style={{ ...s.input, background: "#f8fafc", color: "#64748b", cursor: "default", display: "flex", alignItems: "center" }}>OH</div>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>
                  Remarks / Reason
                  {isOH && approvalForm.approvalStatus !== "PROCEED" && <span style={{ color: "#ef4444" }}> *</span>}
                </label>
                <textarea style={{ ...s.textarea, borderColor: isOH && approvalForm.approvalStatus !== "PROCEED" && !approvalForm.comment.trim() ? "#fca5a5" : undefined }}
                  placeholder={isOH && approvalForm.approvalStatus !== "PROCEED" ? "Remarks required when not approving…" : "Add a comment or reason…"}
                  value={approvalForm.comment}
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
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ─── PENDING OH APPROVAL MODAL ─── */}
      {pendingModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,.55)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={() => setPendingModal(false)}>
          <div style={{ background: "#fff", borderRadius: 24, width: "96%", maxWidth: 780, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 40px 100px rgba(0,0,0,.28)", overflow: "hidden", animation: "slideUp .2s ease" }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: "22px 28px 16px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", fontWeight: 700, fontSize: 17, color: "#0f172a", letterSpacing: "-0.2px" }}>Pending OH Approval</div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{pendingList.length} entr{pendingList.length !== 1 ? "ies" : "y"} awaiting action · sorted by latest</div>
                </div>
                <button onClick={() => setPendingModal(false)} style={{ background: "#f1f5f9", border: "none", color: "#64748b", width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
              {/* Search */}
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#94a3b8", pointerEvents: "none" }}>🔍</span>
                <input
                  autoFocus
                  placeholder="Search by material, project, raised by…"
                  value={pendingSearch}
                  onChange={e => setPendingSearch(e.target.value)}
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 12px 9px 34px", fontSize: 13.5, fontFamily: "inherit", outline: "none", color: "#0f172a", boxSizing: "border-box" }}
                />
                {pendingSearch && (
                  <button onClick={() => setPendingSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                )}
              </div>
            </div>

            {/* List */}
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 28px" }}>
              {(() => {
                const q = pendingSearch.trim().toLowerCase();
                const sorted = [...pendingList].sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));
                const filtered = q ? sorted.filter(r =>
                  (r.materialRequired || "").toLowerCase().includes(q) ||
                  (r.projectName || "").toLowerCase().includes(q) ||
                  (r.raisedBy || "").toLowerCase().includes(q) ||
                  (r.boqNo || "").toLowerCase().includes(q)
                ) : sorted;

                if (filtered.length === 0) return (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8", fontSize: 15 }}>
                    {q ? `No results for "${pendingSearch}"` : "🎉 No pending approvals!"}
                  </div>
                );

                return filtered.map((row, idx) => {
                  const action = pendingOHActionMap[row.id] || { status: "PROCEED", comment: "" };
                  const setAction = (patch) => setPendingOHActionMap(m => ({ ...m, [row.id]: { ...action, ...patch } }));
                  const reqDate = row.updatedAt || row.timestamp;
                  const relTime = reqDate ? (() => {
                    const diff = Date.now() - new Date(reqDate).getTime();
                    const m = Math.floor(diff / 60000);
                    if (m < 1) return "just now";
                    if (m < 60) return `${m}m ago`;
                    const h = Math.floor(m / 60);
                    if (h < 24) return `${h}h ago`;
                    return `${Math.floor(h / 24)}d ago`;
                  })() : "";

                  return (
                    <div key={row.id} style={{ background: "#fafbfe", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px", marginBottom: 12 }}>
                      {/* Top row */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                        <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#1e3a5f", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>#{idx + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14.5, color: "#0f172a", marginBottom: 3 }}>{row.materialRequired}</div>
                          <div style={{ fontSize: 12.5, color: "#64748b" }}>
                            {row.projectName}
                            {row.boqNo && <span> · BOQ: {row.boqNo}</span>}
                            {row.vendor && <span> · {row.vendor}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                            Raised by <strong style={{ color: "#475569" }}>{row.raisedBy}</strong> · #{row.id}
                            {relTime && <span> · {relTime}</span>}
                          </div>
                        </div>
                        <span style={s.badge(APPROVAL_META[row.approvalStatus])}>
                          <span style={s.dot(APPROVAL_META[row.approvalStatus]?.dot)} />
                          {APPROVAL_META[row.approvalStatus]?.label}
                        </span>
                      </div>

                      {/* Action selector */}
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        {[
                          { val: "PROCEED",      label: "✅ Proceed",      bg: action.status === "PROCEED"      ? "linear-gradient(135deg,#166534,#16a34a)" : "#f0fdf4", color: action.status === "PROCEED"      ? "#fff" : "#166534", border: action.status === "PROCEED"      ? "none" : "1.5px solid #bbf7d0" },
                          { val: "HOLD",         label: "⏸ Hold",          bg: action.status === "HOLD"         ? "linear-gradient(135deg,#92400e,#d97706)" : "#fffbeb", color: action.status === "HOLD"         ? "#fff" : "#92400e", border: action.status === "HOLD"         ? "none" : "1.5px solid #fde68a" },
                          { val: "NOT_APPROVED", label: "❌ Not Approved",  bg: action.status === "NOT_APPROVED" ? "linear-gradient(135deg,#991b1b,#ef4444)" : "#fff1f2", color: action.status === "NOT_APPROVED" ? "#fff" : "#991b1b", border: action.status === "NOT_APPROVED" ? "none" : "1.5px solid #fecdd3" },
                        ].map(opt => (
                          <button key={opt.val} onClick={() => setAction({ status: opt.val })}
                            style={{ flex: 1, padding: "8px 6px", border: opt.border, borderRadius: 9, background: opt.bg, color: opt.color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Remarks — required for non-Proceed */}
                      {action.status !== "PROCEED" && (
                        <textarea
                          rows={2}
                          placeholder="Remarks required — state reason for Hold / Not Approved…"
                          value={action.comment || ""}
                          onChange={e => setAction({ comment: e.target.value })}
                          style={{ width: "100%", border: `1.5px solid ${!action.comment?.trim() ? "#fca5a5" : "#e2e8f0"}`, borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontFamily: "inherit", resize: "vertical", outline: "none", background: "#fff", color: "#0f172a", boxSizing: "border-box", marginBottom: 10 }}
                        />
                      )}

                      {/* Submit */}
                      <button
                        onClick={() => submitInlineOH(row)}
                        disabled={action.saving}
                        style={{ width: "100%", padding: "10px 16px", border: "none", borderRadius: 9, cursor: action.saving ? "default" : "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13,
                          background: action.status === "PROCEED" ? "linear-gradient(135deg,#166534,#16a34a)" : action.status === "HOLD" ? "linear-gradient(135deg,#92400e,#d97706)" : "linear-gradient(135deg,#991b1b,#ef4444)",
                          color: "#fff", opacity: action.saving ? 0.7 : 1 }}>
                        {action.saving ? "Saving…" : `Confirm — ${action.status === "PROCEED" ? "Proceed" : action.status === "HOLD" ? "Hold" : "Not Approved"}`}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE ENTRY MODAL ─── */}
      {createModal && (
        <div style={s.overlay} onClick={() => { setCreateModal(false); setEditingEntry(null); }}>
          <div style={s.modalBox(620)} onClick={e => e.stopPropagation()}>
            <div style={s.mHeader}>
              <div>
                <div style={s.mTitle}>{editingEntry ? "Edit PWJ Entry" : "New PWJ Entry"}</div>
                <div style={s.mSub}>{editingEntry ? `Editing entry #${editingEntry.id} · ${editingEntry.materialRequired}` : "Add a new purchase / work journal request"}</div>
              </div>
              <button style={s.closeBtn} onClick={() => { setCreateModal(false); setEditingEntry(null); }}>✕</button>
            </div>
            <div style={s.mBody}>
              <div style={s.grid2}>
                {/* 1. Project Name */}
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>Project Name <span style={{color:"#ef4444"}}>*</span></label>
                  {managedProjects.filter(p => p.active).length > 0 ? (
                    <select style={s.select2} value={createForm.projectName}
                      onChange={e => setCreateForm(f => ({ ...f, projectName: e.target.value }))}>
                      <option value="">-- Select Project --</option>
                      {managedProjects.filter(p => p.active).map(p => (
                        <option key={p.id} value={p.name}>{p.name}{p.location ? ` · ${p.location}` : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <input style={s.input} placeholder="Project Name"
                      value={createForm.projectName || ""}
                      onChange={e => setCreateForm(f => ({ ...f, projectName: e.target.value }))} />
                  )}
                  {managedProjects.filter(p => p.active).length === 0 && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>No projects configured — contact Administrator to add projects.</div>
                  )}
                </div>
                {/* 2. BOQ No. */}
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>BOQ No.</label>
                  <input style={s.input} type="text" placeholder="BOQ No."
                    value={createForm.boqNo || ""}
                    onChange={e => setCreateForm(f => ({ ...f, boqNo: e.target.value }))} />
                </div>
                {/* 3. Material Required */}
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>Material Required <span style={{color:"#ef4444"}}>*</span></label>
                  <input style={s.input} placeholder="Material Required"
                    value={createForm.materialRequired}
                    onChange={e => setCreateForm(f => ({ ...f, materialRequired: e.target.value }))} />
                </div>
                {/* 4. Image Reference */}
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>Image Reference</label>
                  <input style={s.input} type="file" accept="image/*,application/pdf,.pdf" multiple
                    onChange={async e => {
                      const files = Array.from(e.target.files);
                      if (!files.length) return;
                      showToast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
                      const existing = parseImageRefs(createForm.imageReference);
                      const urls = [...existing];
                      for (const file of files) {
                        const res = await api.uploadImage(file);
                        if (res.success) urls.push(res.data);
                        else showToast(`Failed: ${file.name}`, "error");
                      }
                      setCreateForm(f => ({ ...f, imageReference: JSON.stringify(urls) }));
                      showToast(`${urls.length} file${urls.length > 1 ? "s" : ""} uploaded ✅`);
                      e.target.value = "";
                    }} />
                  {parseImageRefs(createForm.imageReference).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {parseImageRefs(createForm.imageReference).map((url, i) => {
                        const isPdf = url.toLowerCase().endsWith(".pdf");
                        return (
                          <div key={i} style={{ position: "relative" }}>
                            {isPdf ? (
                              <a href={BACKEND_BASE + url} target="_blank" rel="noreferrer"
                                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 90, width: 90, borderRadius: 8, border: "1.5px solid #e2eaf5", background: "#fef2f2", gap: 4, textDecoration: "none" }}>
                                <span style={{ fontSize: 28 }}>📄</span>
                                <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 700 }}>PDF</span>
                              </a>
                            ) : (
                              <img src={BACKEND_BASE + url} alt={`preview-${i + 1}`}
                                style={{ height: 90, width: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #e2eaf5" }} />
                            )}
                            <button type="button"
                              onClick={() => {
                                const updated = parseImageRefs(createForm.imageReference).filter((_, idx) => idx !== i);
                                setCreateForm(f => ({ ...f, imageReference: updated.length ? JSON.stringify(updated) : "" }));
                              }}
                              style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* 5. Specification */}
                <div style={{ gridColumn: "1/-1", ...s.formGroup }}>
                  <label style={s.label}>Specification <span style={{color:"#ef4444"}}>*</span></label>
                  <textarea style={s.textarea} placeholder="Specification details…"
                    value={createForm.specification || ""}
                    onChange={e => setCreateForm(f => ({ ...f, specification: e.target.value }))} />
                </div>
                {/* 6. Brand */}
                <div style={s.formGroup}>
                  <label style={s.label}>Brand</label>
                  <input style={s.input} type="text" placeholder="Brand"
                    value={createForm.brand || ""}
                    onChange={e => setCreateForm(f => ({ ...f, brand: e.target.value }))} />
                </div>
                {/* 7. Unit */}
                <div style={s.formGroup}>
                  <label style={s.label}>Unit{isEngineer && <span style={{color:"#ef4444"}}> *</span>}</label>
                  <input style={s.select2} list="unit-list" value={createForm.unit || ""}
                    onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="Type or select unit…" autoComplete="off" />
                </div>
                {/* 7. Quantity */}
                <div style={s.formGroup}>
                  <label style={s.label}>Quantity{isEngineer && <span style={{color:"#ef4444"}}> *</span>}</label>
                  <input style={{ ...s.input, MozAppearance: "textfield" }} type="number" placeholder="Quantity"
                    value={createForm.quantity || ""}
                    onChange={e => setCreateForm(f => ({ ...f, quantity: e.target.value }))}
                    onWheel={e => e.target.blur()} />
                </div>
                {/* 8. Date of Requirement */}
                <div style={s.formGroup}>
                  <label style={s.label}>Date of Requirement{isEngineer && <span style={{color:"#ef4444"}}> *</span>}</label>
                  <input style={s.input} type="date" placeholder="Date of Requirement"
                    value={createForm.dateOfRequirement || ""}
                    onChange={e => setCreateForm(f => ({ ...f, dateOfRequirement: e.target.value }))} />
                </div>
              </div>
              <button style={{ ...s.submitBtn(), marginTop: 8, opacity: createLoading ? 0.7 : 1, cursor: createLoading ? "not-allowed" : "pointer" }} onClick={submitCreate} disabled={createLoading}>
                {createLoading ? "⏳ Saving…" : editingEntry ? "💾 Save Changes" : "✅ Create Entry"}
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
                  <div style={s.mTitle}>Add Vendor</div>
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
                      <div style={grid("1fr 1fr")}>
                        <div style={fld}><label style={lbl}>Maximum Return Days</label><input style={inp} type="number" placeholder="Enter in Days" value={vf.maximumReturnDays} onChange={e => setF("maximumReturnDays", e.target.value)} /></div>
                        <div style={fld}><label style={lbl}>Return Fees</label><input style={inp} placeholder="Enter in Rupees" value={vf.returnFees} onChange={e => setF("returnFees", e.target.value)} /></div>
                      </div>
                      <div style={fld}>
                        <label style={lbl}>Vendor Policies</label>
                        <textarea
                          rows={5}
                          placeholder="Enter vendor policies, terms, conditions, notes…"
                          value={vf.listVendorPolicies}
                          onChange={e => setF("listVendorPolicies", e.target.value)}
                          style={{ ...inp, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                        />
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
                  <div style={s.mTitle}>Vendor Approvals</div>
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
                                  setApprovedVendors(a => a.some(x => x.id === v.id) ? a.map(x => x.id === v.id ? { ...x, status: "APPROVED", active: true } : x) : [...a, { ...v, status: "APPROVED", active: true }]);
                                  setPendingVendorCount(c => Math.max(0, c - 1));
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
                                  setApprovedVendors(a => a.filter(x => x.id !== v.id));
                                  setPendingVendorCount(c => Math.max(0, c - 1));
                                  showToast(`${v.name} rejected`, "error");
                                } else showToast(r.message || "Failed", "error");
                              }}>
                              ❌ Not Approved
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
                <div style={s.mTitle}>Assign Vendor & PWJ Type</div>
                <div style={s.mSub}>PWJ #{assignModal.id} · {assignModal.projectName}</div>
              </div>
              <button style={s.closeBtn} onClick={() => setAssignModal(null)}>✕</button>
            </div>
            <div style={s.mBody}>
              {/* Engineer's reference info for procurement */}
              {assignModal.materialRequired && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Material</div>
                  <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 700 }}>{assignModal.materialRequired}</div>
                </div>
              )}
              <div style={s.formGroup}>
                <label style={s.label}>PWJ Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["PO","Purchase Order","#1d4ed8"],["WO","Work Order","#92400e"],["JO","Job Order","#166534"]].map(([val, desc, col]) => (
                    <button key={val} type="button"
                      onClick={() => setAssignForm(f => ({ ...f, pwjType: f.pwjType === val ? "" : val }))}
                      style={{ flex: 1, border: `2px solid ${assignForm.pwjType === val ? col : "#e2e8f0"}`, borderRadius: 10, padding: "10px 6px", cursor: "pointer", background: assignForm.pwjType === val ? col : "#fff", transition: "all .15s", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: assignForm.pwjType === val ? "#fff" : "#1e293b" }}>{val}</div>
                      <div style={{ fontSize: 10, color: assignForm.pwjType === val ? "rgba(255,255,255,0.85)" : "#475569", marginTop: 2 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Vendor</label>
                {assignForm.vendors.map((vendor, vi) => (
                  <div key={vi} style={{ position: "relative", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="text"
                        style={{ ...s.select2, cursor: "text", flex: 1 }}
                        placeholder={assignForm.vendors.length > 1 ? `Vendor ${vi + 1} — search…` : "Search vendor…"}
                        value={assignVendorSearches[vi] || ""}
                        autoComplete="off"
                        onChange={e => {
                          const ns = [...assignVendorSearches]; ns[vi] = e.target.value; setAssignVendorSearches(ns);
                          setAssignForm(f => { const v = [...f.vendors]; v[vi] = ""; return { ...f, vendors: v }; });
                          const nd = [...showAssignVendorDrops]; nd[vi] = true; setShowAssignVendorDrops(nd);
                        }}
                        onFocus={() => { const nd = [...showAssignVendorDrops]; nd[vi] = true; setShowAssignVendorDrops(nd); }}
                        onBlur={() => setTimeout(() => { const nd = [...showAssignVendorDrops]; nd[vi] = false; setShowAssignVendorDrops(nd); }, 150)}
                      />
                      {assignForm.vendors.length > 1 && (
                        <button type="button" onClick={() => {
                          setAssignForm(f => ({ ...f, vendors: f.vendors.filter((_, i) => i !== vi) }));
                          setAssignVendorSearches(s => s.filter((_, i) => i !== vi));
                          setShowAssignVendorDrops(d => d.filter((_, i) => i !== vi));
                        }} style={{ background: "#fee2e2", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 16, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                    {showAssignVendorDrops[vi] && (() => {
                      const q = (assignVendorSearches[vi] || "").trim().toLowerCase();
                      const filtered = approvedVendors.filter(v => !q || v.name.toLowerCase().includes(q) || (v.category || "").toLowerCase().includes(q));
                      return (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: assignForm.vendors.length > 1 ? 46 : 0, background: "#fff", border: "1.5px solid #bae6fd", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", zIndex: 999, maxHeight: 200, overflowY: "auto", marginTop: 2 }}>
                          {filtered.length === 0 ? (
                            <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                              {approvedVendors.length === 0 ? "No approved vendors. Approve vendors from the Vendors tab first." : "No vendors match your search."}
                            </div>
                          ) : filtered.map(v => (
                            <div key={v.id}
                              onMouseDown={() => {
                                const alreadyUsed = assignForm.vendors.some((existing, idx) => idx !== vi && existing.toLowerCase() === v.name.toLowerCase());
                                if (alreadyUsed) { showToast(`${v.name} is already added as a vendor`, "error"); return; }
                                const nv = [...assignForm.vendors]; nv[vi] = v.name; setAssignForm(f => ({ ...f, vendors: nv }));
                                const ns = [...assignVendorSearches]; ns[vi] = v.name; setAssignVendorSearches(ns);
                                const nd = [...showAssignVendorDrops]; nd[vi] = false; setShowAssignVendorDrops(nd);
                              }}
                              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}
                              onMouseEnter={e => e.currentTarget.style.background = "#f0f9ff"}
                              onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                            >
                              <span style={{ fontWeight: 600, color: "#0f172a" }}>{v.name}</span>
                              {v.category && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{v.category}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {vendor && <div style={{ marginTop: 4, fontSize: 12, color: "#166534", fontWeight: 600 }}>✓ {vendor}</div>}
                  </div>
                ))}
                <button type="button" onClick={() => {
                  setAssignForm(f => ({ ...f, vendors: [...f.vendors, ""] }));
                  setAssignVendorSearches(s => [...s, ""]);
                  setShowAssignVendorDrops(d => [...d, false]);
                }} style={{ marginTop: 2, background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "6px 16px", cursor: "pointer", color: "#1d4ed8", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
                  + Add Vendor
                </button>
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
        <div className="doc-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }} onClick={() => setDocModal(null)}>
          <div className="doc-modal-box" style={{ background: "#fff", borderRadius: 20, width: "96%", maxWidth: 760, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 40px 100px rgba(0,0,0,.32)", overflow: "hidden", animation: "slideUp .2s ease" }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            {(() => {
              const e = docModal.entry;
              // For multi-vendor: resolve vendor object for the currently viewed sub-doc
              let multiDocs = null;
              try { const pd = JSON.parse(e.docData || "{}"); if (pd.multiVendor && Array.isArray(pd.docs)) multiDocs = pd.docs; } catch {}
              const isMulti    = !!multiDocs;
              const multiCount = multiDocs ? multiDocs.length : 1;
              const safeIdx    = isMulti ? Math.min(docViewIndex, multiCount - 1) : 0;
              const currentVendorName = isMulti ? multiDocs[safeIdx]?.vendor : e.vendor;
              const v = isMulti
                ? (approvedVendors.find(av => av.name === currentVendorName) || docModal.vendor)
                : docModal.vendor;

              const ru = allUsers.find(u => u.fullName === e.raisedBy || u.username === e.raisedBy) || null;
              const raisedByContact = [ru?.fullName || e.raisedBy, ru?.phone].filter(Boolean).join("\n");
              const typeColor = "#fff";
              const typeBg    = e.pwjType === "PO" ? "#1d4ed8" : e.pwjType === "WO" ? "#92400e" : "#166534";
              const typeName  = e.pwjType === "PO" ? "PURCHASE ORDER" : e.pwjType === "WO" ? "WORK ORDER" : "JOB ORDER";
              const docNum = e.docNumber || autoDocNumber(e);
              // For multi-vendor: derive per-sub-doc status and overall partial status
              const activeDocStatus = isMulti ? (() => {
                const sub = multiDocs[safeIdx]?.docStatus || "DRAFT";
                if (sub === "DRAFT") return "DRAFT";
                if (sub === "PENDING_VP_APPROVAL" && e.docStatus === "VP_APPROVED") return "VP_APPROVED";
                return sub;
              })() : e.docStatus;
              // "Partially Issued" — some sub-docs approved, some still draft/pending
              const isPartiallyIssued = isMulti && e.docStatus === "VP_APPROVED" &&
                multiDocs.some(d => (d.docStatus || "DRAFT") === "DRAFT");
              const statusColor = activeDocStatus === "VP_APPROVED" ? "#166534" : activeDocStatus === "PENDING_VP_APPROVAL" ? "#92400e" : activeDocStatus === "VP_REJECTED" ? "#991b1b" : activeDocStatus === "REVOKED" ? "#6b21a8" : "#475569";
              const statusBg    = activeDocStatus === "VP_APPROVED" ? "#dcfce7" : activeDocStatus === "PENDING_VP_APPROVAL" ? "#fef3c7" : activeDocStatus === "VP_REJECTED" ? "#fee2e2" : activeDocStatus === "REVOKED" ? "#f3e8ff" : "#f1f5f9";
              const statusLabel = activeDocStatus === "VP_APPROVED" ? "✅ Doc Issued" : activeDocStatus === "PENDING_VP_APPROVAL" ? "⏳ Pending VP Approval" : activeDocStatus === "VP_REJECTED" ? "❌ Not Approved" : activeDocStatus === "REVOKED" ? "↩ Revoked" : "Draft";
              return (
                <>
                  {/* Top bar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ background: typeBg, color: typeColor, borderRadius: 8, padding: "4px 14px", fontWeight: 800, fontSize: 13 }}>{e.pwjType}</span>
                      <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: "#0f172a" }}>{typeName}</span>
                      <span style={{ background: statusBg, color: statusColor, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>{statusLabel}</span>
                      {isPartiallyIssued && (
                        <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, border: "1px solid #fde68a" }}>
                          ⚠️ Partially Issued
                        </span>
                      )}
                      {isMulti && (
                        <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 700, border: "1px solid #bfdbfe" }}>
                          📄 {multiCount} Vendors
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {/* Multi-vendor navigation */}
                      {isMulti && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 10, padding: "4px 10px", border: "1px solid #e2e8f0" }}>
                          <button onClick={() => setDocViewIndex(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
                            style={{ background: "none", border: "none", cursor: safeIdx === 0 ? "default" : "pointer", color: safeIdx === 0 ? "#cbd5e1" : "#1d4ed8", fontSize: 16, fontWeight: 700, padding: "0 4px", lineHeight: 1 }}>‹</button>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 70, textAlign: "center" }}>
                            {multiDocs[safeIdx].vendor || `PO ${safeIdx + 1}`}<br/>
                            <span style={{ fontWeight: 500, color: "#94a3b8" }}>{safeIdx + 1} / {multiCount}</span><br/>
                            {multiDocs.map((doc, di) => {
                              const sub = doc.docStatus || "DRAFT";
                              const st = sub === "DRAFT" ? "DRAFT"
                                : sub === "PENDING_VP_APPROVAL" && e.docStatus === "VP_APPROVED" ? "VP_APPROVED"
                                : sub;
                              const c = st === "VP_APPROVED" ? "#16a34a" : st === "PENDING_VP_APPROVAL" ? "#d97706" : "#94a3b8";
                              const lbl = st === "VP_APPROVED" ? "✅" : st === "PENDING_VP_APPROVAL" ? "⏳" : "—";
                              return di === safeIdx
                                ? <span key={di} style={{ fontSize: 11, color: c, fontWeight: 700 }}>{lbl} {st === "VP_APPROVED" ? "Issued" : st === "PENDING_VP_APPROVAL" ? "Pending" : "Draft"}</span>
                                : null;
                            })}
                          </span>
                          <button onClick={() => setDocViewIndex(i => Math.min(multiCount - 1, i + 1))} disabled={safeIdx === multiCount - 1}
                            style={{ background: "none", border: "none", cursor: safeIdx === multiCount - 1 ? "default" : "pointer", color: safeIdx === multiCount - 1 ? "#cbd5e1" : "#1d4ed8", fontSize: 16, fontWeight: 700, padding: "0 4px", lineHeight: 1 }}>›</button>
                        </div>
                      )}
                      <button onClick={() => { setDocModal(null); setDocEditMode(false); setDocViewIndex(0); }} style={{ background: "#e2e8f0", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "#64748b" }}>✕</button>
                    </div>
                  </div>

                  {/* Document body — Happizo format */}
                  {(() => {
                    const proj_   = managedProjects.find(p => p.name === e.projectName) || null;
                    // For multi-vendor, use the active sub-doc's data
                    const activeSubDoc = isMulti && multiDocs ? multiDocs[safeIdx] : null;
                    const effectiveEntry = activeSubDoc
                      ? { ...e, vendor: activeSubDoc.vendor, docData: JSON.stringify(activeSubDoc) }
                      : e;
                    const subDocVpDate = (() => { try { const d = JSON.parse(effectiveEntry.docData || "{}"); return d.vpApprovedAt || null; } catch { return null; } })();
                    const docDate = (() => {
                      const raw = subDocVpDate || e.approvedAt || new Date().toISOString();
                      const s = String(raw).substring(0, 10);
                      const [y, m, d] = s.split("-");
                      return (!y || !m || !d) ? s : `${d}-${m}-${y}`;
                    })();
                    const docData = docEditMode ? docEditForm : (() => { const d = parseDocData(effectiveEntry); if (!d.deliveryAddress && proj_?.clientAddress) d.deliveryAddress = proj_.clientAddress; return d; })();
                    const totals  = calcTotals(docData.items, docData.cgstPct, docData.sgstPct, docData.igstPct);
                    const terms   = e.pwjType === "PO" ? PO_TERMS : e.pwjType === "WO" ? WO_TERMS : JO_TERMS;
                    const inpSt   = { border: "1.5px solid #bae6fd", borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit", outline: "none", background: "#f0f9ff", width: "100%", boxSizing: "border-box" };
                    const tdSt    = { padding: "7px 10px", borderBottom: "1px solid #ddd", fontSize: 12 };
                    const thSt    = { padding: "8px 10px", color: "#111", fontWeight: 700, fontSize: 11, textAlign: "left" };
                    const fmtCcy  = (n) => `₹ ${Number(n || 0).toFixed(2)}`;
                    const fmtTotal = (n) => `₹ ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    const setItem = (i, field, val) => {
                      const items = docData.items.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
                      setDocEditForm(f => ({ ...f, items }));
                    };
                    const setField = (field, val) => setDocEditForm(f => ({ ...f, [field]: val }));
                    return (
                      <div style={{ overflowY: "auto", flex: 1 }}>
                        <div style={{ padding: "24px 28px", fontFamily: "Arial, sans-serif", fontSize: 12, color: "#111" }}>

                          {/* --- HEADER --- */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 14, marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <img src={HAPPIZO_LOGO_URL} alt="Happizo" style={{ width: 120, height: "auto", display: "block" }} />
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900, fontSize: 17, color: "#111", marginBottom: 6 }}>{typeName}</div>
                              <div style={{ display: "grid", gridTemplateColumns: "auto 8px 1fr", gap: "3px 0", fontSize: 12, alignItems: "center" }}>
                                <span style={{ color: "#555" }}>{e.pwjType} Number</span><span style={{ textAlign: "center" }}>:</span><span style={{ textAlign: "left" }}><strong>{docEditMode ? <input type="text" value={docEditForm.docNumber || ""} onChange={ev => setDocEditForm(f => ({ ...f, docNumber: ev.target.value }))} style={{ border: "1.5px solid #bae6fd", borderRadius: 4, padding: "3px 6px", fontSize: 12, fontFamily: "inherit", outline: "none", background: "#f0f9ff", display: "inline", width: 140 }} placeholder={docNum} /> : docNum}</strong></span>
                                <span style={{ color: "#555" }}>{e.pwjType} Date</span><span style={{ textAlign: "center" }}>:</span><span style={{ textAlign: "left" }}><strong>{docDate}</strong></span>
                                <span style={{ color: "#555" }}>Project Name</span><span style={{ textAlign: "center" }}>:</span><span style={{ textAlign: "left" }}><strong>{e.projectName}</strong></span>
                              </div>
                            </div>
                          </div>

                          {/* --- TO + BILLING DETAILS --- */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 }}>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: 5 }}>TO:</div>
                              <div style={{ fontWeight: 700 }}>{v?.name || e.vendor}</div>
                              {docEditMode
                                ? <input value={docData.vendorAddress1 || ""} onChange={ev => setField("vendorAddress1", ev.target.value)} style={{ ...inpSt, width: "100%", marginBottom: 3 }} placeholder="Address line 1 (street)" />
                                : (docData.vendorAddress1 || v?.street) ? <div>{docData.vendorAddress1 || v.street}</div> : null}
                              {docEditMode
                                ? <input value={docData.vendorAddress2 || ""} onChange={ev => setField("vendorAddress2", ev.target.value)} style={{ ...inpSt, width: "100%", marginBottom: 3 }} placeholder="Address line 2 (city, state, zip)" />
                                : (docData.vendorAddress2 || (v?.city || v?.state)) ? <div>{docData.vendorAddress2 || [v?.city, v?.state, v?.zipCode].filter(Boolean).join(", ")}</div> : null}
                              <div style={{ marginTop: 4 }}>
                                {(() => {
                                  const gst = docData.gstNumber || v?.gstNumber || "";
                                  const pan = docData.panNumber || v?.panNumber || "";
                                  return docEditMode ? (
                                    <>
                                      GST: <input value={gst} onChange={ev => setField("gstNumber", ev.target.value)} style={{ ...inpSt, width: 140, display: "inline" }} placeholder="GST Number" />
                                      <span style={{ marginLeft: 12 }}>PAN: <input value={pan} onChange={ev => setField("panNumber", ev.target.value)} style={{ ...inpSt, width: 100, display: "inline" }} placeholder="PAN" /></span>
                                    </>
                                  ) : (
                                    <>
                                      {gst && <span>GST: {gst}</span>}
                                      {gst && pan && <span style={{ marginLeft: 12 }} />}
                                      {pan && <span>PAN: {pan}</span>}
                                    </>
                                  );
                                })()}
                              </div>
                              <div>{(() => {
                                const msme = docData.msme || (v?.msmeNumber === "MSME-REGISTERED" ? "Registered" : v?.msmeNumber || "");
                                return docEditMode
                                  ? <>MSME: <input value={msme} onChange={ev => setField("msme", ev.target.value)} style={{ ...inpSt, width: 120, display: "inline" }} placeholder="MSME" /></>
                                  : (msme ? `MSME: ${msme}` : "");
                              })()}</div>
                              <div>Kind Attn.: {docEditMode ? (
                                <span style={{ display: "inline-flex", gap: 4, alignItems: "center", verticalAlign: "middle" }}>
                                  <select value={docData.kindAttnSalutation || ""} onChange={ev => setField("kindAttnSalutation", ev.target.value)}
                                    style={{ ...inpSt, width: 70, display: "inline", padding: "4px 6px" }}>
                                    <option value="">—</option>
                                    <option value="Mr.">Mr.</option>
                                    <option value="Mrs.">Mrs.</option>
                                    <option value="Ms.">Ms.</option>
                                    <option value="Dr.">Dr.</option>
                                  </select>
                                  <input value={docData.kindAttn || ""} onChange={ev => setField("kindAttn", ev.target.value)} style={{ ...inpSt, width: 180, display: "inline" }} placeholder="Contact person · number" />
                                </span>
                              ) : [docData.kindAttnSalutation, docData.kindAttn || [v?.contactPerson, v?.phoneNumber].filter(Boolean).join(" · ")].filter(Boolean).join(" ")}</div>
                            </div>
                            <div style={{ borderLeft: "1px solid #ddd", paddingLeft: 20 }}>
                              <div style={{ fontWeight: 700, marginBottom: 5 }}>BILL TO:</div>
                              <div style={{ fontWeight: 700 }}>{COMPANY_INFO.name}</div>
                              <div>{COMPANY_INFO.addr1}</div>
                              <div>{COMPANY_INFO.addr2}</div>
                              <div style={{ marginTop: 4 }}>GST: {COMPANY_INFO.gst}</div>
                            </div>
                          </div>

                          <div style={{ marginBottom: 12 }}>
                            <div>Dear Team,</div>
                            <div>We are pleased to issue the below {e.pwjType === "PO" ? "purchase order" : e.pwjType === "WO" ? "work order" : "job order"} to you with all details below and annexed.</div>
                          </div>

                          {/* --- ITEM TABLE --- */}
                          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 0, fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#ededeb" }}>
                                <th style={{ ...thSt, width: 36, textAlign: "center" }}>S.No</th>
                                <th style={{ ...thSt, width: "30%" }}>Item</th>
                                <th style={{ ...thSt, textAlign: "center", width: 50 }}>Unit</th>
                                <th style={{ ...thSt, textAlign: "center", width: 65 }}>Qty</th>
                                <th style={{ ...thSt, textAlign: "right", width: 80 }}>Rate</th>
                                <th style={{ ...thSt, textAlign: "right", width: 90 }}>Amount</th>
                                {docEditMode && <th style={{ ...thSt, width: 28 }}></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {(docEditMode ? docData.items : docData.items.filter(row => row.item?.trim() || (parseFloat(row.rate) || 0) !== 0)).map((row, i) => {
                                const amt = (parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0);
                                return (
                                  <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                                    <td style={{ ...tdSt, textAlign: "center", fontWeight: 600 }}>{i + 1}</td>
                                    <td style={tdSt}>
                                      {docEditMode ? <input value={row.item} onChange={ev => setItem(i, "item", ev.target.value)} style={inpSt} placeholder="Item description" /> : row.item || ""}
                                    </td>
                                    <td style={{ ...tdSt, textAlign: "center" }}>
                                      {docEditMode ? <input list="unit-list" value={row.unit || ""} onChange={ev => setItem(i, "unit", ev.target.value)} style={{ ...inpSt, textAlign: "center", width: 70 }} placeholder="—" autoComplete="off" /> : row.unit || ""}
                                    </td>
                                    <td style={{ ...tdSt, textAlign: "center" }}>
                                      {docEditMode ? <input type="number" value={row.qty} onChange={ev => setItem(i, "qty", ev.target.value)} style={{ ...inpSt, textAlign: "right", width: 60 }} placeholder="0" /> : (row.qty || "")}
                                    </td>
                                    <td style={{ ...tdSt, textAlign: "right" }}>
                                      {docEditMode ? <input type="number" value={row.rate} onChange={ev => setItem(i, "rate", ev.target.value)} style={{ ...inpSt, textAlign: "right" }} placeholder="0.00" /> : fmtCcy(row.rate)}
                                    </td>
                                    <td style={{ ...tdSt, textAlign: "right" }}>{fmtCcy(amt)}</td>
                                    {docEditMode && (
                                      <td style={{ ...tdSt, textAlign: "center", padding: "4px 2px" }}>
                                        <button
                                          onClick={() => setDocEditForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}
                                          title="Remove row"
                                          style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 14, fontWeight: 700, lineHeight: 1, padding: "2px 4px", borderRadius: 4 }}>
                                          ×
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                              {/* Add Row button in edit mode */}
                              {docEditMode && (
                                <tr>
                                  <td colSpan={7} style={{ padding: "4px 10px" }}>
                                    <button onClick={() => setDocEditForm(f => ({ ...f, items: [...f.items, { item: "", unit: "", qty: "", rate: "", vendor: "" }] }))}
                                      style={{ fontSize: 11, color: "#0369a1", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ Add Row</button>
                                  </td>
                                </tr>
                              )}
                              {/* Totals */}
                              <tr>
                                <td colSpan={4} rowSpan={6} style={{ borderBottom: "1px solid #ddd", borderRight: "1px solid #ddd", padding: "8px 10px", verticalAlign: "top" }}>
                                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>Amount in words</div>
                                  <div style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>{amountToWords(totals.total)}</div>
                                </td>
                                <td style={{ ...tdSt, textAlign: "right", fontWeight: 600 }}>Sub Total</td>
                                <td style={{ ...tdSt, textAlign: "right" }}>{fmtCcy(totals.subTotal)}</td>
                              </tr>
                              {[["CGST","cgstPct",totals.cgst],["SGST","sgstPct",totals.sgst],["IGST","igstPct",totals.igst]].map(([label, field, val]) => (
                                <tr key={label}>
                                  <td style={{ ...tdSt }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                      <span>{label}</span>
                                      {docEditMode
                                        ? <select value={docData[field] || "0"} onChange={ev => {
                                            setField(field, ev.target.value);
                                            if (field === "cgstPct") setField("sgstPct", ev.target.value);
                                          }} style={{ border: "1px solid #bae6fd", borderRadius: 3, fontSize: 11, padding: "1px 4px" }}>
                                            {["0","2.5","5","9","14","18"].map(v => <option key={v} value={v}>{v}%</option>)}
                                          </select>
                                        : <span style={{ color: "#555" }}>({docData[field] || 0}%)</span>}
                                    </div>
                                  </td>
                                  <td style={{ ...tdSt, textAlign: "right" }}>{fmtCcy(val)}</td>
                                </tr>
                              ))}
                              <tr>
                                <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, borderBottom: "2px solid #111" }}>Total <span style={{ fontWeight: 400, fontStyle: "italic", fontSize: 9 }}>(Rounded off)</span></td>
                                <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, borderBottom: "2px solid #111" }}>{fmtTotal(totals.total)}</td>
                              </tr>
                            </tbody>
                          </table>

                          {/* --- COMPLETION / DELIVERY / CONTACT --- */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, border: "1px solid #ddd", marginBottom: 16, marginTop: 0 }}>
                            <div style={{ padding: "10px 12px" }}>
                              <div style={{ fontWeight: 700, textDecoration: "underline", marginBottom: 4 }}>Date</div>
                              {docEditMode
                                ? <input type="date" value={docData.completionDate || ""} onChange={ev => setField("completionDate", ev.target.value)} style={{ ...inpSt, marginBottom: 6 }} />
                                : <div style={{ marginBottom: 6 }}>{fmtDateDash(docData.completionDate)}</div>}
                            </div>
                            <div style={{ padding: "10px 12px", borderLeft: "1px solid #ddd", borderRight: "1px solid #ddd" }}>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>{e.pwjType === "WO" || e.pwjType === "JO" ? "Site address" : "Delivery address"}</div>
                              {docEditMode
                                ? <textarea rows={4} value={docData.deliveryAddress || ""} onChange={ev => setField("deliveryAddress", ev.target.value)} style={{ ...inpSt, resize: "none" }} placeholder="Delivery / site address…" />
                                : <div style={{ whiteSpace: "pre-line" }}>{docData.deliveryAddress || ""}</div>}
                            </div>
                            <div style={{ padding: "10px 12px" }}>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>Contact Details</div>
                              {docEditMode
                                ? <textarea rows={4} value={docData.contactDetails || ""} onChange={ev => setField("contactDetails", ev.target.value)} style={{ ...inpSt, resize: "none" }} placeholder="Contact name, phone, email…" />
                                : <div style={{ whiteSpace: "pre-line" }}>{docData.contactDetails || raisedByContact}</div>}
                            </div>
                          </div>

                          {/* --- GENERAL TERMS --- */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, borderBottom: "1px solid #111", paddingBottom: 4, marginBottom: 8 }}>General Terms</div>
                            {terms.map((t, i) => (
                              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 5, fontSize: 11 }}>
                                <span style={{ minWidth: 16, fontWeight: 600 }}>{i + 1}</span>
                                <span style={{ color: "#333" }}>{t}</span>
                              </div>
                            ))}
                          </div>

                          {/* --- PAYMENT TERMS --- */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, borderBottom: "1px solid #111", paddingBottom: 4, marginBottom: 8 }}>Payment Terms</div>
                            {[["stage1","Stage 1"],["stage2","Stage 2"],["stage3","Stage 3"],["stageF","Final stage"]].map(([key, lbl]) => (
                              <div key={key} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 11 }}>
                                <span style={{ fontWeight: 600, minWidth: 70 }}>{lbl} -</span>
                                {docEditMode
                                  ? <input value={docData[key] || ""} onChange={ev => setField(key, ev.target.value)} style={{ ...inpSt, flex: 1 }} placeholder={lbl} />
                                  : <span>{docData[key] || ""}</span>}
                              </div>
                            ))}
                            <div style={{ marginTop: 10, fontSize: 11, paddingLeft: 4 }}>
                              <div><u>Note:</u> For smooth payment process, original invoice to be submitted at office along with</div>
                              <div style={{ paddingLeft: 12 }}>- site engineer signed copy along with measurement sheet and DC copy</div>
                              <div style={{ paddingLeft: 12 }}>- test / warranty / guarantee certificate, etc</div>
                            </div>
                          </div>

                          {/* VP Comments banner */}
                          {e.docComments && (isEngineer || e.docStatus === "VP_APPROVED" || (!isEngineer && e.docStatus === "REVISION_REQUESTED")) && (
                            <div style={{ background: e.docStatus === "REVISION_REQUESTED" ? "#fff7ed" : e.docStatus === "VP_REJECTED" ? "#fff1f2" : "#f0fdf4", borderRadius: 8, padding: "12px 14px", border: `1.5px solid ${e.docStatus === "REVISION_REQUESTED" ? "#fed7aa" : e.docStatus === "VP_REJECTED" ? "#fecdd3" : "#bbf7d0"}`, marginBottom: 16, fontSize: 11 }}>
                              <div style={{ fontWeight: 700, color: e.docStatus === "REVISION_REQUESTED" ? "#c2410c" : e.docStatus === "VP_REJECTED" ? "#be123c" : "#166534", marginBottom: 4 }}>
                                {e.docStatus === "REVISION_REQUESTED" ? "⚠️ VP Revision Request" : e.docStatus === "VP_REJECTED" ? "❌ VP Comments" : "✅ VP Comments"}
                              </div>
                              <div>{e.docComments}</div>
                            </div>
                          )}

                          {/* --- FOOTER / SIGNATURE --- */}
                          <div style={{ marginTop: 8, display: "inline-block" }}>
                            <div style={{ fontWeight: 600, marginBottom: 24, whiteSpace: "nowrap" }}>For <strong>{COMPANY_INFO.name}</strong></div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", paddingTop: 8, borderTop: "1px solid #ddd" }}>
                              <div>
                                <div style={{ color: "#555", fontSize: 11, marginBottom: 4 }}>Approved By</div>
                                {e.docStatus === "VP_APPROVED"
                                  ? <img src={VP_SIGNATURE_URL} alt="VP Signature" style={{ height: 48, maxWidth: "100%", objectFit: "contain", objectPosition: "left", display: "block", marginBottom: 4 }} onError={ev => ev.target.style.display = "none"} />
                                  : <div style={{ height: 48 }} />}
                                <div style={{ borderTop: "1px solid #888", paddingTop: 4, fontSize: 11 }}>Signature & Date</div>
                              </div>
                              <div>
                                <div style={{ color: "#555", fontSize: 11, marginBottom: 4 }}>Procurement Executive</div>
                                {e.docStatus === "VP_APPROVED"
                                  ? <img src={PROCUREMENT_SIGNATURE_URL} alt="Procurement Signature" style={{ height: 48, maxWidth: "100%", objectFit: "contain", objectPosition: "left", display: "block", marginBottom: 4 }} onError={ev => ev.target.style.display = "none"} />
                                  : <div style={{ height: 48 }} />}
                                <div style={{ borderTop: "1px solid #888", paddingTop: 4, fontSize: 11 }}>Signature & Date</div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })()}

                  {/* Footer actions */}
                  <div className="doc-modal-footer" style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>

                    {/* Upload section — shown when VP_APPROVED; engineers upload, others view only */}
                    {e.docStatus === "VP_APPROVED" && (() => {
                      const dd = parseDocData(e);
                      return (
                        <>
                          {/* Delivered Date + Remarks — editable for Engineer/PM, read-only for all others */}
                          {(() => {
                            const canEdit = isEngineer || isProjectManager;
                            return (
                              <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 24, flexWrap: "wrap" }}>
                                {/* Delivered Date */}
                                <div style={{ flex: "0 0 auto" }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                    📅 Delivered Date
                                  </div>
                                  {canEdit ? (
                                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                      <input type="date" value={engDeliveredDate}
                                        max={new Date().toISOString().split("T")[0]}
                                        onChange={ev => {
                                          const today = new Date().toISOString().split("T")[0];
                                          setEngDeliveredDate(ev.target.value > today ? today : ev.target.value);
                                        }}
                                        style={{ border: "1.5px solid #86efac", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#f0fdf4" }} />
                                      <button onClick={saveEngDeliveredDate} disabled={!engDeliveredDate || engDateSaving}
                                        style={{ background: engDeliveredDate ? "linear-gradient(135deg,#166534,#16a34a)" : "#e2e8f0", border: "none", borderRadius: 8, padding: "9px 18px", color: engDeliveredDate ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 13, cursor: engDeliveredDate ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                        {engDateSaving ? "Saving…" : "💾 Save"}
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 14, fontWeight: 600, color: e.deliveredDate ? "#166534" : "#94a3b8" }}>
                                      {e.deliveredDate ? fmtDate(e.deliveredDate) : "Not yet delivered"}
                                    </div>
                                  )}
                                </div>
                                {/* Remarks */}
                                <div style={{ flex: 1, minWidth: 220 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                    📝 Remarks
                                  </div>
                                  {canEdit ? (
                                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                      <textarea value={engRemarks} onChange={ev => setEngRemarks(ev.target.value)}
                                        placeholder="Add remarks…" rows={2}
                                        style={{ flex: 1, border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#eff6ff", resize: "vertical" }} />
                                      <button onClick={saveEngRemarks} disabled={engRemarksSaving}
                                        style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                        {engRemarksSaving ? "Saving…" : "💾 Save"}
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 14, color: e.remarks ? "#0f172a" : "#94a3b8", lineHeight: 1.6 }}>
                                      {e.remarks || "No remarks"}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                          {/* Uploaded docs — always visible to all; only engineers can upload */}
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <EngUploadSection title="Vendor Invoices" icon="🧾" type="invoice"
                              files={engInvoiceFiles} setFiles={setEngInvoiceFiles}
                              uploading={engInvoiceUploading} stored={dd.vendorInvoices || []}
                              canUpload={isEngineer} onUpload={uploadEngFiles} />
                            <EngUploadSection title="Delivery Documents" icon="🚚" type="delivery"
                              files={engDeliveryFiles} setFiles={setEngDeliveryFiles}
                              uploading={engDeliveryUploading} stored={dd.deliveryDocs || []}
                              canUpload={isEngineer} onUpload={uploadEngFiles} />
                          </div>
                        </>
                      );
                    })()}

                    {/* Remarks for site team — rolling log, procurement adds, all can view */}
                    {(() => {
                      const logEntries = (e.siteRemarks || "").split("\n").filter(Boolean);
                      return (
                        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                            🏗️ Remarks for Site Team
                          </div>
                          {logEntries.length > 0 && (
                            <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                              {logEntries.map((line, i) => {
                                const m = line.match(/^\[(.+?)\]\s*(.*)/);
                                return m ? (
                                  <div key={i} style={{ borderLeft: "3px solid #d8b4fe", paddingLeft: 10 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 2 }}>{m[1]}</div>
                                    <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{m[2]}</div>
                                  </div>
                                ) : (
                                  <div key={i} style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>{line}</div>
                                );
                              })}
                            </div>
                          )}
                          {(isAdmin || isProcurement) ? (
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <textarea value={siteRemarks} onChange={ev => setSiteRemarks(ev.target.value)}
                                placeholder="Add a new remark for the site team…" rows={2}
                                style={{ flex: 1, border: "1.5px solid #d8b4fe", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#faf5ff", resize: "vertical" }} />
                              <button onClick={saveSiteRemarks} disabled={siteRemarksSaving || !siteRemarks.trim()}
                                style={{ background: siteRemarks.trim() ? "linear-gradient(135deg,#7e22ce,#a855f7)" : "#e2e8f0", border: "none", borderRadius: 8, padding: "9px 18px", color: siteRemarks.trim() ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 13, cursor: siteRemarks.trim() ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                {siteRemarksSaving ? "Saving…" : "💾 Add"}
                              </button>
                            </div>
                          ) : (
                            !logEntries.length && (
                              <div style={{ fontSize: 14, color: "#94a3b8" }}>No remarks for site team yet.</div>
                            )
                          )}
                        </div>
                      );
                    })()}

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

                    {/* VP approve / not-approved — directly from the preview */}
                    {isVP && activeDocStatus === "PENDING_VP_APPROVAL" && (() => {
                      const commentKey = isMulti ? `${e.id}_${safeIdx}` : e.id;
                      return (
                        <div style={{ padding: "0 24px 14px" }}>
                          <textarea
                            rows={2}
                            placeholder="Comments (optional) — pricing concerns, revision needed…"
                            value={vpCommentMap[commentKey] || ""}
                            onChange={ev => setVpCommentMap(m => ({ ...m, [commentKey]: ev.target.value }))}
                            style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", background: "#fff", color: "#0f172a", boxSizing: "border-box", marginBottom: 10 }}
                          />
                          <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => { (isMulti ? handleSubDocApprove(e.id, safeIdx) : handleDocApprove(e.id)); setDocModal(null); }}
                              style={{ flex: 1, background: "linear-gradient(135deg,#166534,#16a34a)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                              ✅ Approve
                            </button>
                            <button onClick={() => { (isMulti ? handleSubDocReject(e.id, safeIdx) : handleDocReject(e.id)); setDocModal(null); }}
                              style={{ flex: 1, background: "linear-gradient(135deg,#991b1b,#ef4444)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                              ❌ Not Approved
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ padding: "14px 24px", display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {/* Edit → Save → Send for VP Approval in order */}
                      {(isAdmin || isProcurement) && activeDocStatus !== "VP_APPROVED" && !docEditMode && (
                        isProcurement && e.pwjIssued ? (
                          <button disabled title="PWJ issued — editing locked"
                            style={{ background: "#e2e8f0", border: "none", borderRadius: 10, padding: "11px 20px", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "not-allowed", fontFamily: "inherit" }}>
                            🔒 Locked
                          </button>
                        ) : (
                          <button onClick={startDocEdit}
                            style={{ background: "linear-gradient(135deg,#0369a1,#0ea5e9)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                            ✏️ Edit
                          </button>
                        )
                      )}
                      {docEditMode && (<>
                        <button onClick={() => saveDocEdits()} disabled={docSaving}
                          style={{ background: "linear-gradient(135deg,#166534,#16a34a)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                          {docSaving ? "Saving…" : "💾 Save"}
                        </button>
                        <button onClick={() => setDocEditMode(false)}
                          style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "11px 20px", color: "#64748b", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                          Cancel
                        </button>
                      </>)}
                      {(isAdmin || isProcurement) && !docEditMode &&
                        activeDocStatus !== "PENDING_VP_APPROVAL" &&
                        activeDocStatus !== "VP_APPROVED" && (
                          <button onClick={sendDocForApproval} disabled={docLoading}
                            style={{ background: activeDocStatus === "REVISION_REQUESTED" ? "linear-gradient(135deg,#c2410c,#f97316)" : "linear-gradient(135deg,#5b21b6,#7c3aed)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                            {docLoading ? "Sending…" : isMulti ? `🚀 Send PO ${safeIdx + 1} for VP Approval` : activeDocStatus === "REVISION_REQUESTED" ? "🚀 Resubmit for VP Approval" : "🚀 Send for VP Approval"}
                          </button>
                        )}
                      {activeDocStatus === "VP_APPROVED" && !isEngineer && (
                        <button onClick={downloadDoc}
                          style={{ flex: 1, background: "linear-gradient(135deg,#166534,#16a34a)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          ⬇ {isMulti ? `Download PO ${safeIdx + 1} PDF` : "Download PDF"}
                        </button>
                      )}
                      {activeDocStatus === "VP_APPROVED" && (isVP || isAdmin) && (
                        <button onClick={async () => {
                          try {
                            const r = await api.toggleVendorEmail(e.id);
                            if (r.success) {
                              setEntries(es => es.map(x => x.id === e.id ? { ...x, vendorEmailEnabled: r.data.vendorEmailEnabled } : x));
                              setDocModal(m => ({ ...m, entry: { ...m.entry, vendorEmailEnabled: r.data.vendorEmailEnabled } }));
                              showToast(r.data.vendorEmailEnabled ? "Vendor email enabled ✅" : "Vendor email disabled");
                            } else {
                              showToast(r.message || "Failed to toggle email", "error");
                            }
                          } catch { showToast("Network error", "error"); }
                        }}
                          style={{ flex: 1, background: e.vendorEmailEnabled ? "linear-gradient(135deg,#166534,#16a34a)" : "linear-gradient(135deg,#64748b,#94a3b8)", border: "none", borderRadius: 10, padding: "11px 20px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          {e.vendorEmailEnabled ? "📧 Email ON" : "📧 Email OFF"}
                        </button>
                      )}
                      {activeDocStatus === "VP_APPROVED" && isVP && (
                        <button
                          title="Revoke VP approval — document returns to Draft for procurement to re-edit and resubmit"
                          onClick={async () => {
                            const reason = window.prompt("Reason for revoking approval (optional):");
                            if (reason === null) return; // cancelled
                            const r = await api.revokeDoc(e.id, reason);
                            if (r.success) {
                              setEntries(es => es.map(x => x.id === e.id ? { ...x, docStatus: "REVOKED", approvedAt: null } : x));
                              setDocModal(null);
                              showToast("Approval revoked — document reset to Draft");
                            } else {
                              showToast(r.message || "Revoke failed", "error");
                            }
                          }}
                          style={{ background: "linear-gradient(135deg,#92400e,#d97706)", border: "none", borderRadius: 10, padding: "11px 18px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7 }}>
                          ↩ Revoke Approval
                        </button>
                      )}
                      {activeDocStatus === "VP_APPROVED" && isProcurement && (
                        <button onClick={sendDocToVendor} disabled={!e.vendorEmailEnabled}
                          title={!e.vendorEmailEnabled ? "Email not enabled by VP/Admin" : "Send document to vendor"}
                          style={{ flex: 1, background: e.vendorEmailEnabled ? "linear-gradient(135deg,#0369a1,#0ea5e9)" : "linear-gradient(135deg,#cbd5e1,#e2e8f0)", border: "none", borderRadius: 10, padding: "11px 20px", color: e.vendorEmailEnabled ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 14, cursor: e.vendorEmailEnabled ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          📧 Send to Vendor
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
            {/* Header */}
            <div style={{ padding: "22px 28px 16px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", fontWeight: 700, fontSize: 17, color: "#0f172a", letterSpacing: "-0.2px" }}>Document Approvals</div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{pendingDocs.length} document{pendingDocs.length !== 1 ? "s" : ""} pending · sorted by latest request</div>
                </div>
                <button onClick={() => setPendingDocsModal(false)} style={{ background: "#f1f5f9", border: "none", color: "#64748b", width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
              {/* Search */}
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#94a3b8", pointerEvents: "none" }}>🔍</span>
                <input
                  autoFocus
                  placeholder="Search by project, doc number, vendor, material…"
                  value={docApprovalSearch}
                  onChange={e => setDocApprovalSearch(e.target.value)}
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 12px 9px 34px", fontSize: 13.5, fontFamily: "inherit", outline: "none", color: "#0f172a", boxSizing: "border-box" }}
                />
                {docApprovalSearch && (
                  <button onClick={() => setDocApprovalSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                )}
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 28px" }}>
              {pendingDocsLoading ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>
              ) : (() => {
                const q = docApprovalSearch.trim().toLowerCase();
                const sorted = [...pendingDocs].sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));
                const filtered = q ? sorted.filter(d =>
                  (d.docNumber || "").toLowerCase().includes(q) ||
                  (d.projectName || "").toLowerCase().includes(q) ||
                  (d.vendor || "").toLowerCase().includes(q) ||
                  (d.materialRequired || "").toLowerCase().includes(q) ||
                  (d.raisedBy || "").toLowerCase().includes(q)
                ) : sorted;
                if (filtered.length === 0) return (
                  <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 15 }}>
                    {q ? `No results for "${docApprovalSearch}"` : "No documents pending approval"}
                  </div>
                );
                return filtered.map((doc, docIdx) => {
                const typeBg   = doc.pwjType === "PO" ? "#1d4ed8" : doc.pwjType === "WO" ? "#92400e" : "#166534";
                const typeName = doc.pwjType === "PO" ? "Purchase Order" : doc.pwjType === "WO" ? "Work Order" : "Job Order";
                const reqDate  = doc.updatedAt || doc.timestamp;
                const relTime  = reqDate ? (() => {
                  const diff = Date.now() - new Date(reqDate).getTime();
                  const m = Math.floor(diff / 60000);
                  if (m < 1)  return "just now";
                  if (m < 60) return `${m}m ago`;
                  const h = Math.floor(m / 60);
                  if (h < 24) return `${h}h ago`;
                  return `${Math.floor(h / 24)}d ago`;
                })() : "";

                // Detect multi-vendor entry
                let multiDocs = null;
                try { const pd = JSON.parse(doc.docData || "{}"); if (pd.multiVendor && Array.isArray(pd.docs)) multiDocs = pd.docs; } catch {}

                if (multiDocs) {
                  const pendingSubDocs = multiDocs.map((sd, i) => ({ ...sd, idx: i })).filter(sd => sd.docStatus === "PENDING_VP_APPROVAL");
                  return (
                    <div key={doc.id} style={{ background: "#fafbfe", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
                      <div style={{ background: "#f8fafc", padding: "14px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1e3a5f", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>#{docIdx + 1}</span>
                        <span style={{ background: typeBg, color: "#fff", borderRadius: 6, padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>{doc.pwjType}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{doc.docNumber}</span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>· {doc.projectName}</span>
                        {relTime && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 2 }}>· {relTime}</span>}
                        <span style={{ marginLeft: "auto", background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                          {pendingSubDocs.length}/{multiDocs.length} vendor POs pending
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#475569", padding: "8px 22px", borderBottom: "1px solid #f1f5f9" }}>{doc.materialRequired}</div>
                      {pendingSubDocs.map(subDoc => {
                        const commentKey = `${doc.id}_${subDoc.idx}`;
                        return (
                          <div key={subDoc.idx} style={{ padding: "14px 22px", borderBottom: "1px solid #f8fafc" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <div>
                                <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>Vendor {subDoc.idx + 1}: {subDoc.vendor}</span>
                                <span style={{ fontSize: 11, color: "#f59e0b", marginLeft: 8, fontWeight: 600 }}>⏳ Awaiting Approval</span>
                              </div>
                              <button onClick={() => { openDocModal(doc); setDocViewIndex(subDoc.idx); }}
                                style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569", fontFamily: "inherit" }}>
                                👁 Preview
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              placeholder="Comments (optional) — pricing concerns, revision needed…"
                              value={vpCommentMap[commentKey] || ""}
                              onChange={ev => setVpCommentMap(m => ({ ...m, [commentKey]: ev.target.value }))}
                              style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", background: "#fff", color: "#0f172a", boxSizing: "border-box", marginBottom: 8 }}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => handleSubDocApprove(doc.id, subDoc.idx)} style={{ flex: 1, background: "linear-gradient(135deg,#166534,#16a34a)", border: "none", borderRadius: 8, padding: "9px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✅ Approve</button>
                              <button onClick={() => handleSubDocReject(doc.id, subDoc.idx)} style={{ flex: 1, background: "linear-gradient(135deg,#991b1b,#ef4444)", border: "none", borderRadius: 8, padding: "9px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>❌ Not Approved</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                return (
                  <div key={doc.id} style={{ background: "#fafbfe", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 22px", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1e3a5f", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>#{docIdx + 1}</span>
                          <span style={{ background: typeBg, color: "#fff", borderRadius: 6, padding: "3px 10px", fontWeight: 800, fontSize: 12 }}>{doc.pwjType}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{doc.docNumber}</span>
                          <span style={{ fontSize: 12, color: "#64748b" }}>· {typeName}</span>
                          {relTime && <span style={{ fontSize: 11, color: "#94a3b8" }}>· {relTime}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600, marginBottom: 2 }}>{doc.materialRequired}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{doc.projectName} · Vendor: <strong>{doc.vendor}</strong></div>
                        {doc.quantity && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Qty: {doc.quantity} {doc.unit} · Raised by: {doc.raisedBy}</div>}
                      </div>
                      <button onClick={() => openDocModal(doc)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569", fontFamily: "inherit", marginLeft: 16, flexShrink: 0 }}>
                        👁 Preview
                      </button>
                    </div>
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
                        ❌ Not Approved
                      </button>
                    </div>
                  </div>
                );
              });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── MANAGE USERS MODAL ─── */}
      {userMgmtModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,8,23,.6)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setUserMgmtModal(false)}>
          <div style={{ background: "#fff", borderRadius: 20, width: "96%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,.25)", overflow: "hidden", animation: "slideUp .2s ease" }} onClick={e => e.stopPropagation()}>

            {/* ── Header ── */}
            <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", padding: "24px 32px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>Manage Users</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>{allUsers.length} team member{allUsers.length !== 1 ? "s" : ""} · Happizo CloudDesk</div>
              </div>
              <button onClick={() => setUserMgmtModal(false)}
                style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
            </div>

            {/* ── Add user form ── */}
            <div style={{ padding: "20px 32px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Add New Member</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
                {[["Full Name","fullName","text"],["Username","username","text"],["Password","password","password"],["Email","email","email"],["Phone","phone","tel"]].map(([label, key, type]) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>{label}</div>
                    <input type={type} placeholder={label} value={newUserForm[key]}
                      onChange={e => setNewUserForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "#0f172a" }} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>Role</div>
                  <select value={newUserForm.role} onChange={e => setNewUserForm(f => ({ ...f, role: e.target.value }))}
                    style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: "#0f172a", cursor: "pointer" }}>
                    <option value="ENGINEER">Engineer</option>
                    <option value="PROCUREMENT">Procurement</option>
                    <option value="ADMIN">Admin</option>
                    <option value="VP">VP</option>
                    <option value="OH">OH</option>
                    <option value="CEO">CEO</option>
                    <option value="PROJECT_MANAGER">Project Manager</option>
                  </select>
                </div>
                <div style={{ paddingTop: 16 }}>
                  <button onClick={submitNewUser}
                    style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", border: "none", borderRadius: 8, padding: "8px 20px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", height: 36 }}>
                    + Add
                  </button>
                </div>
              </div>
            </div>

            {/* ── Table header ── */}
            <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr 1.2fr 100px 120px", gap: 0, padding: "10px 32px", background: "#f8fafc", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0 }}>
              {["", "Member", "Role", "Contact", "Joined", "Actions"].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</div>
              ))}
            </div>

            {/* ── Users list ── */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {userMgmtLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: "#94a3b8", gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #e2e8f0", borderTopColor: "#6366f1", animation: "acct-spin 0.7s linear infinite" }} />
                  Loading members…
                </div>
              ) : allUsers.map((u) => {
                const AVATAR_GRAD = {
                  VP:          "linear-gradient(135deg,#f59e0b,#d97706)",
                  ADMIN:       "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                  PROCUREMENT: "linear-gradient(135deg,#10b981,#059669)",
                  ENGINEER:    "linear-gradient(135deg,#3b82f6,#2563eb)",
                  CEO:         "linear-gradient(135deg,#ef4444,#dc2626)",
                  OH:          "linear-gradient(135deg,#ec4899,#be185d)",
                };
                const rm = ROLE_META[u.role] || { label: u.role, color: "#475569", bg: "#f1f5f9" };
                const isSelf = u.id === user.id;
                const canRemove = !isSelf && (isVP || u.role !== "VP");
                const initials = (u.fullName || u.username).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                const inp = { border: "1px solid transparent", borderRadius: 6, padding: "3px 7px", background: "transparent", outline: "none", fontFamily: "inherit", cursor: "text" };
                return (
                  <div key={u.id}
                    style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr 1.2fr 100px 120px", gap: 0, alignItems: "center", padding: "14px 32px", borderBottom: "1px solid #f1f5f9", transition: "background .12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8faff"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>

                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: AVATAR_GRAD[u.role] || "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
                      {initials}
                    </div>

                    {/* Name + username */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="text" defaultValue={u.fullName || ""} placeholder="Full name"
                          onBlur={async e => {
                            const val = e.target.value.trim();
                            if (!val || val === (u.fullName || "")) return;
                            const r = await api.updateUserName(u.id, val);
                            if (r.success) { setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, fullName: val } : x)); showToast("Name updated ✅"); }
                            else showToast(r.message || "Failed", "error");
                          }}
                          style={{ ...inp, fontWeight: 600, fontSize: 14, color: "#0f172a", width: "auto", maxWidth: 180 }}
                          onFocus={e => { e.currentTarget.style.border = "1px solid #bfdbfe"; e.currentTarget.style.background = "#eff6ff"; }}
                          onBlurCapture={e => { e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.background = "transparent"; }} />
                        {isSelf && <span style={{ fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" }}>You</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 2 }}>
                        <span style={{ fontSize: 12, color: "#cbd5e1" }}>@</span>
                        <input type="text" defaultValue={u.username || ""} placeholder="username"
                          onBlur={async e => {
                            const val = e.target.value.trim();
                            if (!val || val === (u.username || "")) return;
                            const r = await api.updateUsername(u.id, val);
                            if (r.success) { setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, username: val } : x)); showToast("Username updated ✅"); }
                            else { showToast(r.message || "Failed", "error"); e.target.value = u.username || ""; }
                          }}
                          style={{ ...inp, fontSize: 12, color: "#94a3b8", width: 120 }}
                          onFocus={e => { e.currentTarget.style.border = "1px solid #bfdbfe"; e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#0f172a"; }}
                          onBlurCapture={e => { e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }} />
                      </div>
                    </div>

                    {/* Role */}
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, borderRadius: 20, padding: "4px 12px", background: rm.bg, color: rm.color, whiteSpace: "nowrap" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: rm.color }} />
                        {rm.label}
                      </span>
                    </div>

                    {/* Contact */}
                    <div style={{ minWidth: 0 }}>
                      {u.email && <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>}
                      <input type="tel" defaultValue={u.phone || ""} placeholder="Add phone"
                        onBlur={async e => {
                          const val = e.target.value.trim();
                          if (val === (u.phone || "")) return;
                          const r = await api.updateUserPhone(u.id, val || null);
                          if (r.success) { setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, phone: val || null } : x)); showToast("Phone updated ✅"); }
                          else showToast(r.message || "Failed", "error");
                        }}
                        style={{ ...inp, fontSize: 12, color: u.phone ? "#475569" : "#cbd5e1", marginTop: 2, width: "100%", maxWidth: 140 }}
                        onFocus={e => { e.currentTarget.style.border = "1px solid #bfdbfe"; e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#0f172a"; }}
                        onBlurCapture={e => { e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = u.phone ? "#475569" : "#cbd5e1"; }} />
                    </div>

                    {/* Joined */}
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{fmtDate(u.createdAt)}</div>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      {isAdmin && (
                        <button onClick={() => { setPwdModal({ id: u.id, username: u.username }); setNewPwd(""); }}
                          style={{ background: "#f5f3ff", border: "none", color: "#7c3aed", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, fontFamily: "inherit", whiteSpace: "nowrap", transition: "background .12s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#ede9fe"}
                          onMouseLeave={e => e.currentTarget.style.background = "#f5f3ff"}>
                          🔑 Pwd
                        </button>
                      )}
                      {canRemove && (
                        <button onClick={() => deactivateUser(u.id, u.username)}
                          style={{ background: "#fff1f2", border: "none", color: "#f43f5e", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, fontFamily: "inherit", whiteSpace: "nowrap", transition: "background .12s" }}
                          title={`Remove ${u.fullName}`}
                          onMouseEnter={e => e.currentTarget.style.background = "#ffe4e6"}
                          onMouseLeave={e => e.currentTarget.style.background = "#fff1f2"}>
                          Remove
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

      {/* ─── CHANGE PASSWORD MODAL (Admin only) ─── */}
      {pwdModal && (
        <div style={s.overlay} onClick={() => { setPwdModal(null); setNewPwd(""); }}>
          <div style={s.modalBox(400)} onClick={e => e.stopPropagation()}>
            <div style={s.mHeader}>
              <div>
                <div style={s.mTitle}>Change Password</div>
                <div style={s.mSub}>User: <strong>{pwdModal.username}</strong></div>
              </div>
              <button style={s.closeBtn} onClick={() => { setPwdModal(null); setNewPwd(""); }}>✕</button>
            </div>
            <div style={s.mBody}>
              <div style={s.formGroup}>
                <label style={s.label}>New Password</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitChangePassword()}
                  placeholder="Enter new password"
                  style={s.input}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setPwdModal(null); setNewPwd(""); }}
                style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 22px", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={submitChangePassword} disabled={pwdLoading}
                style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)", border: "none", borderRadius: 10, padding: "9px 24px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: pwdLoading ? .7 : 1 }}>
                {pwdLoading ? "Saving…" : "🔑 Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW VENDOR MODAL ─── */}
      {/* ─── MULTI-ENTRY FLOATING BAR ─── */}
      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderRadius: 14, padding: "12px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 8px 32px rgba(0,0,0,.35)" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{selectedIds.size} {selectedIds.size === 1 ? "entry" : "entries"} selected</span>
          {(isAdmin || isProcurement) && (
            <button onClick={async () => {
                setGenDocItemVendors({}); setGenDocApplyAll(""); setGenDocPwjType("PO");
                try { const r = await api.getApprovedVendors(); if (r.success) setApprovedVendors(r.data); } catch {}
                setGenDocModal(true);
              }}
              style={{ background: "linear-gradient(135deg,#2563eb,#0ea5e9)", border: "none", borderRadius: 9, padding: "8px 18px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              📄 Generate PO / WO / JO
            </button>
          )}
          <button onClick={() => setSelectedIds(new Set())}
            style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 8, padding: "7px 12px", color: "#cbd5e1", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Clear
          </button>
        </div>
      )}

      {/* ─── GEN DOC MODAL (per-item vendor assignment) ─── */}
      {genDocModal && (() => {
        const selected = entries.filter(e => selectedIds.has(e.id));
        // Count unique vendor groups for the summary
        const vendorGroups = {};
        for (const e of selected) {
          const v = (genDocItemVendors[e.id] || "").trim();
          if (v) { if (!vendorGroups[v]) vendorGroups[v] = 0; vendorGroups[v]++; }
        }
        const docCount = Object.keys(vendorGroups).length;
        const allAssigned = selected.every(e => (genDocItemVendors[e.id] || "").trim());
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={() => setGenDocModal(false)}>
            <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 620, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.22)", overflow: "hidden" }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ background: "linear-gradient(135deg,#1a6ab1,#2563eb)", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>📄 Generate Document(s)</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 2 }}>{selected.length} {selected.length === 1 ? "item" : "items"} selected</div>
                </div>
                <button onClick={() => setGenDocModal(false)} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, width: 32, height: 32, color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
                {/* Doc Type */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 8 }}>Doc Type</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {["PO","WO","JO"].map(t => (
                      <button key={t} onClick={() => setGenDocPwjType(t)}
                        style={{ flex: 1, padding: "10px 0", border: `2px solid ${genDocPwjType === t ? "#2563eb" : "#e2e8f0"}`, borderRadius: 10, background: genDocPwjType === t ? "#eff6ff" : "#f8fafc", color: genDocPwjType === t ? "#1d4ed8" : "#64748b", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Apply same vendor to all */}
                <div style={{ marginBottom: 18, background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 8 }}>
                    Same Vendor for All Items
                  </label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <select value={genDocApplyAll} onChange={e => setGenDocApplyAll(e.target.value)}
                      style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff" }}>
                      <option value="">— Select vendor —</option>
                      {approvedVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                    </select>
                    <button onClick={() => {
                        if (!genDocApplyAll) return;
                        const map = {};
                        selected.forEach(e => { map[e.id] = genDocApplyAll; });
                        setGenDocItemVendors(map);
                      }}
                      disabled={!genDocApplyAll}
                      style={{ background: genDocApplyAll ? "linear-gradient(135deg,#1e3a5f,#2563eb)" : "#e2e8f0", border: "none", borderRadius: 8, padding: "8px 16px", color: genDocApplyAll ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 12, cursor: genDocApplyAll ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      Apply to All
                    </button>
                  </div>
                </div>

                {/* Per-item vendor assignment */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 8 }}>
                    Assign Vendor per Item
                  </label>
                  <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                    {/* Table header */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f1f5f9", padding: "8px 12px", borderBottom: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Material / Entry</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Vendor</div>
                    </div>
                    {selected.map((e, i) => {
                      const assigned = (genDocItemVendors[e.id] || "").trim();
                      return (
                        <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "10px 12px", borderBottom: i < selected.length - 1 ? "1px solid #f1f5f9" : "none", background: assigned ? "#fff" : "#fffbeb", alignItems: "center", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.materialRequired}>
                              {e.materialRequired}
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>#{e.id} · {e.projectName}</div>
                          </div>
                          <select value={genDocItemVendors[e.id] || ""}
                            onChange={ev => setGenDocItemVendors(prev => ({ ...prev, [e.id]: ev.target.value }))}
                            style={{ width: "100%", border: `1.5px solid ${assigned ? "#86efac" : "#fbbf24"}`, borderRadius: 7, padding: "6px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", background: assigned ? "#f0fdf4" : "#fffbeb" }}>
                            <option value="">— Select vendor —</option>
                            {approvedVendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Summary */}
                {allAssigned && docCount > 0 && (
                  <div style={{ background: docCount === 1 ? "#f0fdf4" : "#eff6ff", border: `1.5px solid ${docCount === 1 ? "#86efac" : "#bfdbfe"}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: docCount === 1 ? "#166534" : "#1d4ed8", fontWeight: 600 }}>
                    {docCount === 1
                      ? `✅ 1 document will be created for ${Object.keys(vendorGroups)[0]} with ${selected.length} line item(s)`
                      : `📄 ${docCount} separate documents will be created — one per vendor`}
                    {docCount > 1 && (
                      <ul style={{ margin: "6px 0 0 16px", padding: 0, fontSize: 12, fontWeight: 500 }}>
                        {Object.entries(vendorGroups).map(([v, count]) => (
                          <li key={v}>{v}: {count} item(s)</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
                <button onClick={() => setGenDocModal(false)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={submitGenDoc} disabled={genDocSaving || !allAssigned}
                  style={{ background: allAssigned ? "linear-gradient(135deg,#1a6ab1,#2563eb)" : "#e2e8f0", border: "none", borderRadius: 8, padding: "9px 20px", color: allAssigned ? "#fff" : "#94a3b8", fontWeight: 700, fontSize: 13, cursor: allAssigned ? "pointer" : "default", fontFamily: "inherit" }}>
                  {genDocSaving ? "Creating…" : docCount > 1 ? `Create ${docCount} Documents` : "Create & Open Doc"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
        const DocLink = ({ label, url }) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
            {url
              ? <a href={`${BACKEND_BASE}${url}`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#f0f7ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "5px 12px", color: "#1a6ab1", fontSize: 12, fontWeight: 600, textDecoration: "none", width: "fit-content" }}>
                  📎 View Document
                </a>
              : <span style={{ fontSize: 12, color: "#cbd5e1" }}>Not uploaded</span>
            }
          </div>
        );
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
                  <Row label="Company Type"   value={vv.companyType} />
                  <Row label="Vendor Type"    value={vv.vendorType} />
                  <Row label="Category"       value={vv.category} />
                  <Row label="Tags"           value={vv.tags} />
                  <Row label="Ratings"        value={vv.ratings ? `${"★".repeat(Math.round(vv.ratings))} (${vv.ratings})` : null} />
                  <Row label="Empanel Date"   value={vv.empanelDate} />
                  <Row label="Joining Date"   value={vv.joiningDate} />
                  <DocLink label="Vendor Portfolio Doc" url={vv.vendorDocUrl} />
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
                {/* Statutory Details — always shown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginTop: 8 }}>
                  <SectionHead icon="📄" title="Statutory Details" />
                  <Row label="GST Number"  value={vv.gstNumber} />
                  <DocLink label="GST Certificate" url={vv.gstDocUrl} />
                  <Row label="TAN Number"  value={vv.tanNumber} />
                  <DocLink label="TAN Document" url={vv.tanDocUrl} />
                  <Row label="PAN Number"  value={vv.panNumber} />
                  <DocLink label="PAN Document" url={vv.panDocUrl} />
                  <Row label="MSME Registered" value={vv.msmeNumber === "MSME-REGISTERED" ? "Yes" : vv.msmeNumber ? "Yes" : "No"} />
                  <DocLink label="MSME Certificate" url={vv.msmeDocUrl} />
                </div>
                {/* Bank Details — always shown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginTop: 8 }}>
                  <SectionHead icon="🏦" title="Bank Details" />
                  <Row label="Bank Name"       value={vv.bankName} />
                  <Row label="Account Number"  value={vv.accountNumber} />
                  <Row label="IFSC Code"       value={vv.ifscCode} />
                  {vv.bankDetails && <div style={{ gridColumn: "1/-1" }}><Row label="Bank Details" value={vv.bankDetails} /></div>}
                  <Row label="Payment Terms"   value={vv.paymentDetails} />
                  <Row label="Delivery Terms"  value={vv.deliveryTerms} />
                  <DocLink label="Bank Passbook" url={vv.bankDocUrl} />
                </div>
                {/* Policies */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginTop: 8 }}>
                  <SectionHead icon="📋" title="Vendor Policies" />
                  <Row label="Max Return Days"            value={vv.maximumReturnDays != null ? String(vv.maximumReturnDays) : null} />
                  <Row label="Return Fees"                value={vv.returnFees} />
                  <Row label="Vendor Pays Return Shipping" value={vv.vendorPaysReturnShipping ? "Yes" : null} />
                  <div style={{ gridColumn: "1/-1" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Vendor Policies</div>
                    {vv.listVendorPolicies
                      ? <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, color: "#1e293b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontFamily: "inherit", lineHeight: 1.7 }}>{vv.listVendorPolicies}</pre>
                      : <span style={{ fontSize: 13, color: "#cbd5e1" }}>Not specified</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ─── ADD VENDOR FULL PAGE ─── */}
      {addVendorPage && isAdmin && (() => {
        const avf = addVendorForm;
        const setF = (key, val) => setAddVendorForm(f => ({ ...f, [key]: val }));
        const inp = { border: "1.5px solid #dbe6f3", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", width: "100%", boxSizing: "border-box" };
        const sel = { ...inp };
        const lbl = { fontSize: 11.5, fontWeight: 600, color: "#475569", marginBottom: 4, display: "block" };
        const fld = { display: "flex", flexDirection: "column" };
        const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
        const grid3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };
        const sectionHead = (letter, title, color = "#1a6ab1") => (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, marginTop: 6 }}>
            <div style={{ width: 4, height: 22, borderRadius: 2, background: color, flexShrink: 0 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{title}</div>
          </div>
        );
        const subHead = (title) => <div style={{ fontSize: 12.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 18, paddingBottom: 6, borderBottom: "1px solid #e2eaf5" }}>{title}</div>;

        const autoVendorCode = () => "VND-" + Date.now().toString(36).toUpperCase();

        const submitDraft = async () => {
          if (!avf.name.trim()) { showToast("Company name is required", "error"); return; }
          setAddVendorLoading(true);
          try {
            const body = {
              name: avf.name, companyType: avf.companyType, ratings: avf.ratings || 0,
              contactPerson: avf.contactPerson ? `${avf.salutation || ""} ${avf.contactPerson}`.trim() : "",
              email: avf.email, phoneNumber: avf.phoneNumber,
              spocName: avf.spocSameAsCustomer ? (avf.contactPerson ? `${avf.salutation || ""} ${avf.contactPerson}`.trim() : "") : avf.spocName,
              spocEmail: avf.spocSameAsCustomer ? avf.email : avf.spocEmail,
              spocPhone: avf.spocSameAsCustomer ? avf.phoneNumber : avf.spocPhone,
              contacts: avf.contacts,
              street: avf.street, city: avf.city, state: avf.state, zipCode: avf.zipCode, country: avf.country, branch: avf.branch,
              vendorCode: avf.vendorCode || autoVendorCode(), empanelDate: avf.empanelDate, vendorType: (avf.vendorType || []).join(","),
              vendorDocUrl: avf.portfolioDocUrl || null,
              website: avf.website,
              socialMedia: JSON.stringify(avf.socialMedia.filter(u => u.trim())),
              productServices: JSON.stringify(avf.productServices),
              paymentDetails: avf.paymentDetails, deliveryTerms: avf.deliveryTerms,
              gstNumber: avf.gstNumber, tanNumber: avf.tanNumber, panNumber: avf.panNumber,
              msmeNumber: avf.msmeRegistered === "Yes" ? "MSME-REGISTERED" : null,
              gstDocUrl: avf.gstDocUrl || null, msmeDocUrl: avf.msmeDocUrl || null, tanDocUrl: avf.tanDocUrl || null, panDocUrl: avf.panDocUrl || null,
              bankName: avf.bankName, accountNumber: avf.accountNumber, ifscCode: avf.ifscCode,
              bankDocUrl: avf.bankDocUrl || null,
              bankDetails: avf.bankName || avf.accountNumber || avf.ifscCode
                ? `${avf.bankName || ""}${avf.accountNumber ? " | A/C No: " + avf.accountNumber : ""}${avf.ifscCode ? " | IFSC: " + avf.ifscCode : ""}`
                : avf.bankDetails,
              ...(editVendorId ? {} : { status: "PENDING_APPROVAL" }),
            };
            if (editVendorId) {
              const r = await api.updateVendor(editVendorId, body);
              if (r.success) {
                showToast("Vendor updated successfully ✅", "success");
                setAllVendorsStatus(a => a.map(x => x.id === editVendorId ? { ...x, ...r.data } : x));
                setAddVendorPage(false);
                setEditVendorId(null);
              } else showToast(r.message || "Failed to update vendor", "error");
            } else {
              const r = await api.createVendor(body);
              if (r.success) {
                showToast("Vendor saved as draft — pending approval", "success");
                setAddVendorPage(false);
                loadVendorsTab();
              } else showToast(r.message || "Failed to save vendor", "error");
            }
          } catch { showToast("Network error", "error"); }
          finally { setAddVendorLoading(false); }
        };

        const NAV = [
          { id: "company",   icon: "🏢", label: "Company Details" },
          { id: "profile",   icon: "🏭", label: "Vendor Profile" },
          { id: "statutory", icon: "📋", label: "Statutory Details" },
          { id: "bank",      icon: "🏦", label: "Bank Details" },
        ];
        const scrollTo = (id) => document.getElementById("avs-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" });

        const uploadDoc = async (file, loadingKey, urlKey) => {
          setF(loadingKey, true);
          const fd = new FormData(); fd.append("file", file);
          const r = await fetch(`${BACKEND_BASE}/api/v1/upload/document`, { method: "POST", body: fd }).then(x => x.json());
          if (r.success) setF(urlKey, r.data);
          setF(loadingKey, false);
        };

        const handleBankPassbook = async (file) => {
          // Step 1: upload image for display
          setF("bankDocUploading", true);
          try {
            const fd = new FormData(); fd.append("file", file);
            const up = await fetch(`${BACKEND_BASE}/api/v1/upload/image`, { method: "POST", body: fd }).then(x => x.json());
            if (up.success) setF("bankDocUrl", up.data);
          } catch { /* ignore — still proceed with OCR */ }
          setF("bankDocUploading", false);

          // Step 2: run OCR directly on the file
          setF("bankOcrLoading", true);
          try {
            const extracted = await ocrExtractBankFields(file, () => {});
            setAddVendorForm(f => ({
              ...f,
              bankOcrLoading: false,
              bankName:      extracted.bankName      || f.bankName,
              accountNumber: extracted.accountNumber || f.accountNumber,
              ifscCode:      extracted.ifscCode      || f.ifscCode,
              bankDetails:   extracted.bankDetails   || f.bankDetails,
            }));
            if (extracted.bankName || extracted.accountNumber || extracted.ifscCode) {
              showToast("Bank details extracted successfully", "success");
            } else {
              showToast("Could not extract data — please fill manually", "info");
            }
          } catch (err) {
            setF("bankOcrLoading", false);
            showToast("OCR failed: " + err.message, "error");
          }
        };

        const F = { fontFamily: "'Inter','Plus Jakarta Sans',sans-serif" };
        const inp2 = { border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none", ...F, background: "#fff", width: "100%", boxSizing: "border-box", color: "#0f172a", transition: "border-color .15s" };
        const lbl2 = { fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: .8, textTransform: "uppercase", marginBottom: 5, display: "block", ...F };
        const fld2 = { display: "flex", flexDirection: "column" };
        const card = { background: "#fff", borderRadius: 16, padding: "28px 32px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)" };
        const secTitle = (icon, title, color) => (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", ...F }}>{title}</div>
          </div>
        );
        const divider = (label) => <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase", marginTop: 22, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}><span>{label}</span><div style={{ flex: 1, height: 1, background: "#f1f5f9" }} /></div>;
        const attachBtn = (uploading, label = "📎 Attach") => ({
          display: "inline-flex", alignItems: "center", gap: 6, background: uploading ? "#f1f5f9" : "#eff6ff",
          border: "1.5px dashed #93c5fd", borderRadius: 8, padding: "7px 14px", cursor: uploading ? "default" : "pointer",
          fontSize: 12, color: "#2563eb", fontWeight: 700, whiteSpace: "nowrap", ...F,
        });

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", flexDirection: "column", background: "#f8fafc", ...F }}>

            {/* ── Top header ── */}
            <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: editVendorId ? "#3b82f6" : "#f59e0b" }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", ...F }}>{editVendorId ? "Edit Vendor" : "New Vendor Registration"}</span>
                {!editVendorId && <span style={{ background: "#fef3c7", color: "#b45309", fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "3px 10px", letterSpacing: .5, ...F }}>DRAFT</span>}
              </div>
              <button onClick={() => { setAddVendorPage(false); setEditVendorId(null); }} style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 16px", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer", ...F }}>✕ {editVendorId ? "Cancel" : "Discard"}</button>
            </div>

            {/* ── Body: sidebar + content ── */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

              {/* Left nav */}
              <div style={{ width: 220, background: "#fff", borderRight: "1px solid #e2e8f0", flexShrink: 0, padding: "24px 16px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#cbd5e1", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8, paddingLeft: 12, ...F }}>Sections</div>
                {NAV.map(n => (
                  <button key={n.id} onClick={() => scrollTo(n.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: "none", borderRadius: 10, padding: "10px 14px", cursor: "pointer", textAlign: "left", width: "100%", ...F, fontSize: 13, fontWeight: 600, color: "#475569", transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <span style={{ fontSize: 16 }}>{n.icon}</span> {n.label}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <div style={{ padding: "16px 14px", background: "#f8fafc", borderRadius: 10, marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", ...F, lineHeight: 1.6 }}>
                    {editVendorId ? "Changes will update the vendor record immediately." : <>Saved as <strong>Draft</strong>. Pending VP approval before vendor is activated.</>}
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div style={{ flex: 1, overflowY: "auto", padding: "28px 36px 120px" }}>

              {/* ═══ SECTION A: COMPANY DETAILS ═══ */}
              <div id="avs-company" style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", marginBottom: 20, boxShadow: "0 1px 6px rgba(0,0,0,.07)" }}>
                {sectionHead("A", "Company Details", "#1a6ab1")}

                {/* Company Name + Type + Rating */}
                <div style={{ ...grid2, gridTemplateColumns: "2fr 1fr", marginBottom: 14 }}>
                  <div style={fld}>
                    <label style={lbl}>Company Name *</label>
                    <input style={inp} placeholder="Enter company name" value={avf.name} onChange={e => setF("name", e.target.value)} />
                  </div>
                  <div style={fld}>
                    <label style={lbl}>Company Type</label>
                    <select style={sel} value={avf.companyType} onChange={e => setF("companyType", e.target.value)}>
                      <option value="">— Select —</option>
                      {["Proprietorship","Partnership","LLC","Pvt Ltd","Public Ltd","Individual"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Star Rating */}
                <div style={{ ...fld, marginBottom: 18 }}>
                  <label style={lbl}>Rating</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} onClick={() => setF("ratings", n)} style={{ fontSize: 26, cursor: "pointer", color: n <= avf.ratings ? "#f59e0b" : "#d1d5db", transition: "color .15s" }}>★</span>
                    ))}
                  </div>
                </div>

                {/* Product/Service Details */}
                {subHead("Product / Service Details")}
                {avf.productServices.map((ps, pi) => (
                  <div key={pi} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: "1px solid #e2eaf5", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                    {/* Category + Add Item */}
                    <div style={{ ...fld, width: 200, flexShrink: 0 }}>
                      <label style={lbl}>Category</label>
                      <select style={sel} value={ps.category}
                        onChange={e => setF("productServices", avf.productServices.map((x, i) => i === pi ? { ...x, category: e.target.value } : x))}>
                        <option value="">— Select —</option>
                        {["Civil","Electrical","Plumbing","HVAC","Finishing","Steel & Structural","Painting","Landscaping","Flooring","Roofing","IT/AV","Safety & Security","Furniture","Glass & Glazing","Other"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {/* Items */}
                    <div style={{ ...fld, flex: 1 }}>
                      <label style={lbl}>Items / Products / Services</label>
                      {ps.items.map((item, ii) => (
                        <div key={ii} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <input style={{ ...inp, flex: 1 }} placeholder={`Item ${ii + 1}`} value={item}
                            onChange={e => setF("productServices", avf.productServices.map((x, i) => i === pi ? { ...x, items: x.items.map((it, j) => j === ii ? e.target.value : it) } : x))} />
                          {ps.items.length > 1 && (
                            <button type="button" onClick={() => setF("productServices", avf.productServices.map((x, i) => i === pi ? { ...x, items: x.items.filter((_, j) => j !== ii) } : x))}
                              style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "6px 10px", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Remove row */}
                    {avf.productServices.length > 1 && (
                      <button type="button" onClick={() => setF("productServices", avf.productServices.filter((_, i) => i !== pi))}
                        style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "6px 10px", color: "#dc2626", cursor: "pointer", fontSize: 12, marginTop: 18, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setF("productServices", [...avf.productServices, { category: "", items: [""] }])}
                  style={{ background: "#f0fdf4", border: "1px dashed #86efac", borderRadius: 8, padding: "8px 16px", color: "#15803d", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", width: "100%" }}>+ Add Category</button>

                {/* Contact Details */}
                {subHead("Owner Details")}
                <div style={{ ...grid3, marginBottom: 14 }}>
                  <div style={fld}>
                    <label style={lbl}>Name</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={avf.salutation} onChange={e => setF("salutation", e.target.value)}
                        style={{ ...inp, width: 80, flexShrink: 0 }}>
                        {["Mr.", "Mrs.", "Ms."].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input style={inp} value={avf.contactPerson} onChange={e => setF("contactPerson", e.target.value)} placeholder="Contact person name" />
                    </div>
                  </div>
                  <div style={fld}><label style={lbl}>Email</label><input style={inp} type="email" value={avf.email} onChange={e => setF("email", e.target.value)} placeholder="email@company.com" /></div>
                  <div style={fld}><label style={lbl}>Phone Number</label><input style={inp} value={avf.phoneNumber} onChange={e => setF("phoneNumber", e.target.value)} placeholder="+91 00000 00000" /></div>
                </div>

                {subHead("b) SPOC Details")}
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569", marginBottom: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={avf.spocSameAsCustomer}
                    onChange={e => {
                      const checked = e.target.checked;
                      setAddVendorForm(f => ({
                        ...f,
                        spocSameAsCustomer: checked,
                        spocName:  checked ? f.contactPerson : f.spocName,
                        spocEmail: checked ? f.email         : f.spocEmail,
                        spocPhone: checked ? f.phoneNumber   : f.spocPhone,
                      }));
                    }} />
                  Same as Owner Details
                </label>
                <div style={{ ...grid3, marginBottom: 14 }}>
                  <div style={fld}><label style={lbl}>SPOC Name</label><input style={{ ...inp, background: avf.spocSameAsCustomer ? "#f8fafc" : "#fff" }} value={avf.spocSameAsCustomer ? avf.contactPerson : avf.spocName} onChange={e => !avf.spocSameAsCustomer && setF("spocName", e.target.value)} readOnly={avf.spocSameAsCustomer} placeholder="SPOC name" /></div>
                  <div style={fld}><label style={lbl}>SPOC Email</label><input style={{ ...inp, background: avf.spocSameAsCustomer ? "#f8fafc" : "#fff" }} type="email" value={avf.spocSameAsCustomer ? avf.email : avf.spocEmail} onChange={e => !avf.spocSameAsCustomer && setF("spocEmail", e.target.value)} readOnly={avf.spocSameAsCustomer} placeholder="spoc@company.com" /></div>
                  <div style={fld}><label style={lbl}>SPOC Phone</label><input style={{ ...inp, background: avf.spocSameAsCustomer ? "#f8fafc" : "#fff" }} value={avf.spocSameAsCustomer ? avf.phoneNumber : avf.spocPhone} onChange={e => !avf.spocSameAsCustomer && setF("spocPhone", e.target.value)} readOnly={avf.spocSameAsCustomer} placeholder="+91 00000 00000" /></div>
                </div>

                {subHead("c) Additional Contacts")}
                {avf.contacts.map((c, ci) => (
                  <div key={ci} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                    <div style={fld}><label style={lbl}>Name</label><input style={inp} value={c.personName || ""} onChange={e => setF("contacts", avf.contacts.map((x, i) => i === ci ? { ...x, personName: e.target.value } : x))} placeholder="Name" /></div>
                    <div style={fld}><label style={lbl}>Email</label><input style={inp} value={c.email || ""} onChange={e => setF("contacts", avf.contacts.map((x, i) => i === ci ? { ...x, email: e.target.value } : x))} placeholder="Email" /></div>
                    <div style={fld}><label style={lbl}>Phone</label><input style={inp} value={c.contactNumber || ""} onChange={e => setF("contacts", avf.contacts.map((x, i) => i === ci ? { ...x, contactNumber: e.target.value } : x))} placeholder="Phone" /></div>
                    <button type="button" onClick={() => setF("contacts", avf.contacts.filter((_, i) => i !== ci))}
                      style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "8px 10px", color: "#dc2626", cursor: "pointer", marginBottom: 0 }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setF("contacts", [...avf.contacts, { personName: "", email: "", contactNumber: "" }])}
                  style={{ background: "#eff6ff", border: "1px dashed #93c5fd", borderRadius: 8, padding: "7px 14px", color: "#1d4ed8", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>+ Add Contact</button>

                {subHead("Registered Address")}
                <div style={{ ...grid2, marginBottom: 10 }}>
                  <div style={{ ...fld, gridColumn: "1/-1" }}><label style={lbl}>Street / Address</label><input style={inp} value={avf.street} onChange={e => setF("street", e.target.value)} placeholder="Street address" /></div>
                  <div style={fld}><label style={lbl}>City</label><input style={inp} value={avf.city} onChange={e => setF("city", e.target.value)} /></div>
                  <div style={fld}><label style={lbl}>State</label><input style={inp} value={avf.state} onChange={e => setF("state", e.target.value)} /></div>
                  <div style={fld}><label style={lbl}>ZIP Code</label><input style={inp} value={avf.zipCode} onChange={e => setF("zipCode", e.target.value)} /></div>
                  <div style={fld}><label style={lbl}>Country</label><input style={inp} value={avf.country} onChange={e => setF("country", e.target.value)} /></div>
                </div>
                <div style={fld}>
                  <label style={lbl}>Branch (if any)</label>
                  <input style={inp} value={avf.branch} onChange={e => setF("branch", e.target.value)} placeholder="Branch name or location" />
                </div>
              </div>

              {/* ═══ SECTION B: VENDOR PROFILE ═══ */}
              <div id="avs-profile" style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", marginBottom: 20, boxShadow: "0 1px 6px rgba(0,0,0,.07)" }}>
                {sectionHead("B", "Vendor Profile", "#7c3aed")}

                <div style={{ ...grid3, marginBottom: 14 }}>
                  <div style={fld}>
                    <label style={lbl}>Vendor Code (Auto)</label>
                    <input style={{ ...inp, background: "#f8fafc" }} value={avf.vendorCode} onChange={e => setF("vendorCode", e.target.value)} placeholder="Auto-generated on save" />
                  </div>
                  <div style={fld}>
                    <label style={lbl}>Empanel Date</label>
                    <input style={inp} type="date" value={avf.empanelDate} onChange={e => setF("empanelDate", e.target.value)} />
                  </div>
                  <div style={fld}>
                    <label style={lbl}>Vendor Type</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
                      {[
                        { code: "MS", label: "MS" },
                        { code: "SC", label: "SC" },
                        { code: "LC", label: "LC" },
                      ].map(({ code, label }) => {
                        const selected = (avf.vendorType || []).includes(code);
                        return (
                          <button key={code} type="button"
                            onClick={() => setF("vendorType", selected
                              ? avf.vendorType.filter(t => t !== code)
                              : [...(avf.vendorType || []), code])}
                            style={{ border: `2px solid ${selected ? "#7c3aed" : "#dbe6f3"}`, borderRadius: 8, padding: "7px 14px", background: selected ? "#f5f3ff" : "#fff", color: selected ? "#7c3aed" : "#64748b", fontWeight: selected ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                            {selected ? "✓ " : ""}{label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {subHead("Vendor Portfolio")}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ ...lbl, marginBottom: 0 }}>Portfolio Document</span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f5f3ff", border: "1px dashed #a78bfa", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, color: "#7c3aed", fontWeight: 600 }}>
                    {avf.portfolioDocUploading ? "⏳ Uploading…" : "📁 Attach"}
                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: "none" }}
                      disabled={avf.portfolioDocUploading}
                      onChange={async e => {
                        const file = e.target.files[0]; if (!file) return;
                        setF("portfolioDocUploading", true);
                        const fd = new FormData(); fd.append("file", file);
                        const r = await fetch(`${BACKEND_BASE}/api/v1/upload/document`, { method: "POST", body: fd }).then(x => x.json());
                        if (r.success) setF("portfolioDocUrl", r.data);
                        setF("portfolioDocUploading", false);
                        e.target.value = "";
                      }} />
                  </label>
                  {avf.portfolioDocUrl && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>
                      <a href={BACKEND_BASE + avf.portfolioDocUrl} target="_blank" rel="noreferrer"
                        style={{ color: "#7c3aed", fontWeight: 600, textDecoration: "none" }}>
                        📄 {avf.portfolioDocUrl.split("/").pop()}
                      </a>
                      <button type="button" onClick={() => setF("portfolioDocUrl", "")}
                        style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                    </div>
                  )}
                </div>

                <div style={{ ...fld, marginBottom: 12 }}>
                  <label style={lbl}>Website</label>
                  <input style={inp} value={avf.website} onChange={e => setF("website", e.target.value)} placeholder="https://www.company.com" />
                </div>

                <label style={lbl}>Social Media Pages</label>
                {avf.socialMedia.map((url, si) => (
                  <div key={si} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input style={{ ...inp, flex: 1 }} value={url} onChange={e => setF("socialMedia", avf.socialMedia.map((u, i) => i === si ? e.target.value : u))} placeholder="https://linkedin.com/company/..." />
                    {avf.socialMedia.length > 1 && (
                      <button type="button" onClick={() => setF("socialMedia", avf.socialMedia.filter((_, i) => i !== si))}
                        style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "6px 10px", color: "#dc2626", cursor: "pointer" }}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setF("socialMedia", [...avf.socialMedia, ""])}
                  style={{ background: "#eff6ff", border: "1px dashed #93c5fd", borderRadius: 8, padding: "7px 14px", color: "#1d4ed8", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", marginBottom: 16 }}>+ Add Social Media</button>

                <div style={{ ...fld, marginBottom: 6 }}>
                  <label style={lbl}>Catalogues / Documents</label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px dashed #86efac", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: "#15803d", fontWeight: 600, alignSelf: "flex-start" }}>
                    📎 Attach Catalogue
                    <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: "none" }}
                      onChange={async e => {
                        const files = Array.from(e.target.files);
                        for (const file of files) {
                          const fd = new FormData(); fd.append("file", file);
                          const r = await fetch(`${BACKEND_BASE}/api/v1/upload/document`, { method: "POST", body: fd }).then(x => x.json());
                          if (r.success) setF("catalogues", [...avf.catalogues, r.data]);
                        }
                        e.target.value = "";
                      }} />
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {avf.catalogues.map((url, ci) => (
                      <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 6, padding: "4px 10px", fontSize: 12 }}>
                        <span>📄 {url.split("/").pop()}</span>
                        <button type="button" onClick={() => setF("catalogues", avf.catalogues.filter((_, i) => i !== ci))}
                          style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>

                {subHead("Payment & Delivery Terms")}
                <div style={{ ...grid2, marginBottom: 0 }}>
                  <div style={fld}>
                    <label style={lbl}>Payment Terms</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={avf.paymentDetails} onChange={e => setF("paymentDetails", e.target.value)} placeholder="e.g. 30% advance, 70% on delivery" />
                  </div>
                  <div style={fld}>
                    <label style={lbl}>Delivery Terms</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={avf.deliveryTerms} onChange={e => setF("deliveryTerms", e.target.value)} placeholder="e.g. Within 7 working days from PO date" />
                  </div>
                </div>
              </div>

              {/* ═══ SECTION C: STATUTORY DETAILS ═══ */}
              <div id="avs-statutory" style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", marginBottom: 20, boxShadow: "0 1px 6px rgba(0,0,0,.07)" }}>
                {sectionHead("C", "Statutory Details", "#0d9488")}
                {[
                  { label: "GST Number", key: "gstNumber", docKey: "gstDocUrl", uploadKey: "gstDocUploading", placeholder: "22AAAAA0000A1Z5", maxLen: 15 },
                  { label: "TAN Number", key: "tanNumber", docKey: "tanDocUrl", uploadKey: "tanDocUploading", placeholder: "AAAA99999A", maxLen: 10 },
                  { label: "PAN Number", key: "panNumber", docKey: "panDocUrl", uploadKey: "panDocUploading", placeholder: "AAAAA9999A", maxLen: 10 },
                ].map(({ label, key, docKey, uploadKey, placeholder, maxLen }) => (
                  <div key={key} style={{ border: "1px solid #e2eaf5", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ ...fld, flex: 1, minWidth: 180 }}>
                        <label style={lbl}>{label}</label>
                        <input style={inp} value={avf[key]} onChange={e => setF(key, e.target.value.toUpperCase())} placeholder={placeholder} maxLength={maxLen} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 1 }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f0fdfa", border: "1px dashed #5eead4", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#0d9488", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {avf[uploadKey] ? "🔍 Reading…" : "📎 Attach & Scan"}
                          <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: "none" }}
                            disabled={avf[uploadKey]}
                            onChange={async e => {
                              const file = e.target.files[0]; if (!file) return;
                              setF(uploadKey, true);
                              try {
                                // Upload file for storage
                                const fd = new FormData(); fd.append("file", file);
                                const r = await fetch(`${BACKEND_BASE}/api/v1/upload/document`, { method: "POST", body: fd }).then(x => x.json());
                                if (r.success) setF(docKey, r.data);
                                // Run OCR to extract number from image
                                if (file.type.startsWith("image/") || file.type === "application/pdf") {
                                  const extracted = await ocrExtractStatutoryField(file, key);
                                  if (extracted) {
                                    setF(key, extracted);
                                    showToast(`${label} extracted: ${extracted}`, "success");
                                  } else {
                                    showToast(`Could not read ${label} — enter manually`, "info");
                                  }
                                }
                              } catch { showToast("Scan failed — enter manually", "error"); }
                              finally { setF(uploadKey, false); e.target.value = ""; }
                            }} />
                        </label>
                        {avf[docKey] && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
                            <a href={BACKEND_BASE + avf[docKey]} target="_blank" rel="noreferrer"
                              style={{ color: "#0d9488", fontWeight: 600, textDecoration: "none" }}>📄 {avf[docKey].split("/").pop()}</a>
                            <button type="button" onClick={() => setF(docKey, "")}
                              style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* MSME — Yes/No + attachment */}
                <div style={{ border: "1px solid #e2eaf5", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ ...fld, flex: 1, minWidth: 180 }}>
                      <label style={lbl}>MSME Registered?</label>
                      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                        {["Yes", "No"].map(opt => (
                          <button key={opt} type="button"
                            onClick={() => setF("msmeRegistered", opt)}
                            style={{ border: `2px solid ${avf.msmeRegistered === opt ? "#0d9488" : "#e2eaf5"}`, borderRadius: 8, padding: "7px 22px", background: avf.msmeRegistered === opt ? "#f0fdfa" : "#fff", color: avf.msmeRegistered === opt ? "#0d9488" : "#64748b", fontWeight: avf.msmeRegistered === opt ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                            {avf.msmeRegistered === opt ? "✓ " : ""}{opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    {avf.msmeRegistered === "Yes" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f0fdfa", border: "1px dashed #5eead4", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#0d9488", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {avf.msmeDocUploading ? "⏳ Uploading…" : "📎 Attach Certificate"}
                          <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: "none" }}
                            disabled={avf.msmeDocUploading}
                            onChange={async e => {
                              const file = e.target.files[0]; if (!file) return;
                              setF("msmeDocUploading", true);
                              try {
                                const fd = new FormData(); fd.append("file", file);
                                const r = await fetch(`${BACKEND_BASE}/api/v1/upload/document`, { method: "POST", body: fd }).then(x => x.json());
                                if (r.success) setF("msmeDocUrl", r.data);
                              } catch { showToast("Upload failed", "error"); }
                              finally { setF("msmeDocUploading", false); e.target.value = ""; }
                            }} />
                        </label>
                        {avf.msmeDocUrl && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
                            <a href={BACKEND_BASE + avf.msmeDocUrl} target="_blank" rel="noreferrer"
                              style={{ color: "#0d9488", fontWeight: 600, textDecoration: "none" }}>📄 {avf.msmeDocUrl.split("/").pop()}</a>
                            <button type="button" onClick={() => setF("msmeDocUrl", "")}
                              style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ═══ SECTION D: BANK DETAILS ═══ */}
              <div id="avs-bank" style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", marginBottom: 20, boxShadow: "0 1px 6px rgba(0,0,0,.07)" }}>
                {sectionHead("D", "Bank Details", "#0d9488")}

                {/* Passbook upload + OCR */}
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 20 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>DOCUMENT REFERENCE</div>
                    <label style={{ display: "block", width: 130, height: 100, border: "2px dashed #93c5fd", borderRadius: 10, cursor: "pointer", overflow: "hidden", background: "#f8fafc", position: "relative" }}>
                      {avf.bankDocUrl
                        ? <img src={BACKEND_BASE + avf.bankDocUrl} alt="passbook" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 4 }}>
                            <span style={{ fontSize: 24 }}>🏦</span>
                            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textAlign: "center" }}>Upload Passbook</span>
                          </div>
                      }
                      {(avf.bankDocUploading || avf.bankOcrLoading) && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#1a6ab1", fontWeight: 700 }}>
                          {avf.bankDocUploading ? "⏳ Uploading…" : "🔍 Reading…"}
                        </div>
                      )}
                      <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                        onChange={async e => { const f = e.target.files[0]; if (f) { await handleBankPassbook(f); e.target.value = ""; } }} />
                    </label>
                    {avf.bankDocUrl && !avf.bankDocUploading && (
                      <button type="button" onClick={() => setF("bankDocUrl", "")}
                        style={{ marginTop: 6, background: "none", border: "none", color: "#dc2626", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕ Remove</button>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div style={fld}>
                        <label style={lbl}>Bank Name</label>
                        <input style={inp} value={avf.bankName} onChange={e => setF("bankName", e.target.value)} placeholder="Bank Name & Branch" />
                      </div>
                      <div style={fld}>
                        <label style={lbl}>Account Number</label>
                        <input style={inp} value={avf.accountNumber} onChange={e => setF("accountNumber", e.target.value)} placeholder="Account Number" />
                      </div>
                      <div style={fld}>
                        <label style={lbl}>IFSC Code</label>
                        <input style={inp} value={avf.ifscCode} onChange={e => setF("ifscCode", e.target.value.toUpperCase())} placeholder="IFSC Code" maxLength={11} />
                      </div>
                    </div>
                    <div style={fld}>
                      <label style={lbl}>Combined Bank Details (auto-filled)</label>
                      <textarea style={{ ...inp, minHeight: 70, resize: "vertical", background: "#f8fafc", color: "#64748b" }}
                        value={avf.bankName || avf.accountNumber || avf.ifscCode
                          ? `${avf.bankName || ""}${avf.accountNumber ? " | A/C No: " + avf.accountNumber : ""}${avf.ifscCode ? " | IFSC: " + avf.ifscCode : ""}`
                          : avf.bankDetails}
                        readOnly placeholder="Bank Name | A/C No: … | IFSC: …" />
                    </div>
                  </div>
                </div>
              </div>

              </div>{/* end content area */}
            </div>{/* end body flex */}

            {/* ── Fixed bottom action bar ── */}
            <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              <button onClick={() => { setAddVendorPage(false); setEditVendorId(null); }}
                style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 24px", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", ...F }}>
                {editVendorId ? "Cancel" : "Discard"}
              </button>
              <button onClick={submitDraft} disabled={addVendorLoading}
                style={{ background: "linear-gradient(135deg,#7c3aed,#8b5cf6)", border: "none", borderRadius: 10, padding: "10px 28px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", ...F, opacity: addVendorLoading ? .7 : 1 }}>
                {addVendorLoading ? "Saving…" : editVendorId ? "💾 Save Changes" : "💾 Save as Draft"}
              </button>
            </div>

          </div>
        );
      })()}

      {/* ─── SHARED UNIT DATALIST ─── */}
      <datalist id="unit-list">
        {UNITS.map(u => <option key={u} value={u} />)}
      </datalist>

      {/* ─── TOAST ─── */}
      {toast && <div style={s.toast(toast.type)}>{toast.msg}</div>}
    </>
  );
}
