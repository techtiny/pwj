import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/hr`
  : '/api/v1/hr';

const PROJECTS_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/projects`
  : '/api/v1/projects';

const UPLOAD_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/upload`
  : '/api/v1/upload';

const USERS_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/users`
  : '/api/v1/users';

const COMPANY_DOCS_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/company-docs`
  : '/api/v1/company-docs';

const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

export async function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post(`${UPLOAD_BASE}/document`, form);
  return res.data?.data; // e.g. "/api/v1/upload/document/{uuid}.pdf"
}

export async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post(`${UPLOAD_BASE}/image`, form);
  return res.data?.data; // e.g. "/api/v1/upload/image/{uuid}.jpg"
}

export function attachmentFullUrl(path) {
  if (!path) return null;
  return (import.meta.env.VITE_API_BASE_URL || '') + path;
}

// ── Payslip — built entirely client-side, on demand, from the existing Salary
// Sheet row (see SalaryService.compute) — nothing is generated or stored until
// the user actually clicks Download. Layout follows the company's payslip
// template; fields not tracked by the app (ESI, employee PF/ESI numbers) are
// left out rather than faked.
const PAYSLIP_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const HAPPIZO_LOGO_URL = "/happizo-logo.png";
const PAYSLIP_COMPANY_ADDR = "No.11/ 20, Ground floor, 2nd cross street, Indira nagar, Adyar, Chennai 600020.";

function fmtDDMMYY(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}
const inrP = (v) => "Rs. " + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildPayslipHtml(row, year, month) {
  const monthLabel = `${PAYSLIP_MONTHS[month - 1]} ${year}`.toUpperCase();
  const payPeriod = `${fmtDDMMYY(row.cycleStart)}- ${fmtDDMMYY(row.cycleEnd)}`;
  // Loss-of-pay money value = what attendance-based proration already took off the fixed
  // gross; PF/PT below are the prorated (actual) amounts SalaryService computed — their sum
  // nets out to exactly row.takeHome, so Net Pay here always matches the Salary Sheet.
  const lossOfPay = Math.max(0, Number(row.fixedGross || 0) - Number(row.gross || 0));
  const advance = Number(row.advanceDeduction || 0);
  const totalDeductions = lossOfPay + Number(row.pf || 0) + Number(row.pt || 0) + advance;
  const netPay = row.takeHome;

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Payslip - ${row.name} - ${monthLabel}</title>
<style>
  @page { margin: 28px; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; }
  .center { text-align: center; }
  .logo { width: 140px; display: block; margin: 0 auto 6px; }
  .addr { font-size: 11px; color: #334155; margin-bottom: 10px; }
  .title { font-size: 15px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 10px; }
  td, th { border: 1px solid #94a3b8; padding: 6px 10px; }
  .label { background: #f1f5f9; font-weight: 700; width: 22%; }
  .section-head { background: #1e3a5f; color: #fff; font-weight: 700; }
  .right { text-align: right; }
  .net { background: #f1f5f9; font-weight: 800; font-size: 13.5px; }
</style></head><body>
  <div class="center">
    <img class="logo" src="${window.location.origin}${HAPPIZO_LOGO_URL}" alt="Happizo"/>
    <div class="addr">${PAYSLIP_COMPANY_ADDR}</div>
    <div class="title">PAYSLIP FOR ${monthLabel}</div>
  </div>
  <table>
    ${(() => {
      // Info grid: two label/value pairs per row; a field with no value (e.g. no designation or person code) is left out.
      const pairs = [
        ["Name", row.name], ["Pay Period", payPeriod],
        ["Designation", row.designation], ["Present Days", row.workingDays],
        ["Person Code", row.employeeNumber], ["Absent / LOP Days", row.lopDays],
        ["PF Applicable", Number(row.fixedPf) > 0 ? "Yes" : "No"], ["Total Working Days", row.daysInMonth],
      ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "" && v !== "—");
      let html = "";
      for (let i = 0; i < pairs.length; i += 2) {
        const [l1, v1] = pairs[i], second = pairs[i + 1];
        html += second
          ? `<tr><td class="label">${l1}</td><td>${v1}</td><td class="label">${second[0]}</td><td>${second[1]}</td></tr>`
          : `<tr><td class="label">${l1}</td><td colspan="3">${v1}</td></tr>`;
      }
      return html;
    })()}
  </table>
  <table>
    <tr class="section-head"><td>Earnings</td><td class="right">Amount (INR)</td><td>Deductions</td><td class="right">Amount (INR)</td></tr>
    <tr><td>Basic</td><td class="right">${inrP(row.fixedBasic)}</td><td>Loss of Pay</td><td class="right">${inrP(lossOfPay)}</td></tr>
    <tr><td>HRA</td><td class="right">${inrP(row.fixedHra)}</td><td>Provident Fund (PF)</td><td class="right">${inrP(row.pf)}</td></tr>
    <tr><td>Other Allowance</td><td class="right">${inrP(row.fixedOther)}</td><td>Professional Tax (PT)</td><td class="right">${inrP(row.pt)}</td></tr>
    ${advance > 0 ? `<tr><td></td><td></td><td>Salary Advance Recovery</td><td class="right">${inrP(advance)}</td></tr>` : ""}
    <tr style="font-weight:700;background:#f8fafc"><td>Total Gross</td><td class="right">${inrP(row.fixedGross)}</td><td>Total Deductions</td><td class="right">${inrP(totalDeductions)}</td></tr>
  </table>
  <table>
    <tr class="net"><td>Net Pay for ${PAYSLIP_MONTHS[month - 1].slice(0, 3)}'${String(year).slice(-2)}</td><td class="right">${inrP(netPay)}</td></tr>
  </table>
  ${row.remarks ? `<div style="font-size:11px;color:#64748b;margin-top:10px;">Remarks: ${row.remarks}</div>` : ""}
  <div style="font-size:10px;color:#94a3b8;margin-top:24px;">This is a system-generated payslip and does not require a signature.</div>
</body></html>`;
}

/** Opens a print-ready payslip in a new tab (same pattern as PWJ PO/WO/JO document
 *  PDFs elsewhere in the app) — built fresh on every call, never stored. */
export function downloadPayslip(row, year, month) {
  const html = buildPayslipHtml(row, year, month);
  const win = window.open("about:blank", "_blank", "width=720,height=820");
  if (!win) return;
  win.document.write(html + `<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>`);
  win.document.close();
}

export const attendanceApi = {
  checkIn:       (data)      => api.post('/attendance/checkin', data),
  checkOut:      (data)      => api.post('/attendance/checkout', data),
  getToday:      (username)  => api.get(`/attendance/today/${username}`),
  getHistory:    (username)  => api.get(`/attendance/history/${username}`),
  getTodayAll:   ()          => api.get('/attendance/today-all'),
  getAll:        ()          => api.get('/attendance/all'),
  getFieldStaff: ()          => api.get('/attendance/field-staff'),
  getSummary:    (username)  => api.get(`/attendance/summary/${username}`),
  getIncomplete: ()          => api.get('/attendance/incomplete'),
  update:        (id, data)  => api.patch(`/attendance/${id}`, data),
};

export const leaveApi = {
  apply:    (data)      => api.post('/leave', data),
  approve:  (id, data)  => api.put(`/leave/${id}/approve`, data),
  reject:   (id, data)  => api.put(`/leave/${id}/reject`, data),
  cancel:   (id, data)  => api.put(`/leave/${id}/cancel`, data),
  myLeaves: (username)  => api.get(`/leave/my/${username}`),
  pending:  ()          => api.get('/leave/pending'),
  all:      ()          => api.get('/leave/all'),
  summary:  (username)  => api.get(`/leave/summary/${username}`),
};

export const pettyCashApi = {
  create:     (data)                      => api.post('/petty-cash', data),
  getMyEntries: (username, requestType = 'PETTY_CASH') => api.get(`/petty-cash/my/${username}`, { params: { requestType } }),
  getPending: (requestType = 'PETTY_CASH') => api.get('/petty-cash/pending', { params: { requestType } }),
  getAll:     (requestType = 'PETTY_CASH') => api.get('/petty-cash/all', { params: { requestType } }),
  approve:         (id, data)  => api.put(`/petty-cash/${id}/approve`, data),
  reject:          (id, data)  => api.put(`/petty-cash/${id}/reject`, data),
  markTransferred:    (id)        => api.put(`/petty-cash/${id}/mark-transferred`),
  submitProof:        (id, data)  => api.put(`/petty-cash/${id}/submit-proof`, data),  // data: { username, proofUrls: [] }
  getProofReview:     (requestType = 'PETTY_CASH') => api.get('/petty-cash/proof-review', { params: { requestType } }),
  verifyProof:        (id, data)  => api.put(`/petty-cash/${id}/verify-proof`, data),  // data: { verifiedBy, tallyComment }
  delete:             (id, u)     => api.delete(`/petty-cash/${id}?username=${u}`),
  getSummary:         (username, requestType = 'PETTY_CASH') => api.get(`/petty-cash/summary/${username}`, { params: { requestType } }),
};

export const projectsApi = {
  getActive: () => axios.get(`${PROJECTS_BASE}/active`),
};

/** The payroll month being worked on today. Salary for month M covers the 26th of M-1 to the 25th of M and is still
 *  being finalised until about the 7th of the next month — so on the 1st–7th it is still LAST month's payroll
 *  (on 5 Nov the salary in hand is October's), from the 8th it is this month's. Same rule the advance start month uses. */
export function currentPayrollMonth(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth() - (d.getDate() <= 7 ? 1 : 0), 1);
  return { year: m.getFullYear(), month: m.getMonth() + 1 };
}

export const salaryApi = {
  getStructures: ()                     => api.get('/salary/structures'),
  saveStructure: (data)                 => api.post('/salary/structure', data),
  getHistory:    (userId)               => api.get(`/salary/structure/${userId}/history`),
  getSheet:      (year, month)          => api.get('/salary/sheet', { params: { year, month } }),
  regularize:    (userId, year, month, data) =>
    api.post(`/salary/sheet/${userId}/regularize`, data, { params: { year, month } }),
  getApproval:   (year, month)          => api.get('/salary/approval', { params: { year, month } }),
  approve:       (year, month, username) => api.post('/salary/approval/approve', { username }, { params: { year, month } }),
  revise:        (year, month, username, remark) => api.post('/salary/approval/revise', { username, remark }, { params: { year, month } }),
  reject:        (year, month, username, remark) => api.post('/salary/approval/reject', { username, remark }, { params: { year, month } }),
  adjust:        (userId, year, month, data) =>
    api.patch(`/salary/sheet/${userId}`, data, { params: { year, month } }),
};

export const advanceApi = {
  raise:   (data)       => api.post('/advance', data),
  mine:    (username)   => api.get(`/advance/my/${encodeURIComponent(username)}`),
  pending: ()           => api.get('/advance/pending'),
  all:     ()           => api.get('/advance/all'),
  approve: (id, data)   => api.put(`/advance/${id}/approve`, data),
  reject:  (id, data)   => api.put(`/advance/${id}/reject`, data),
  paid:    (id, data)   => api.put(`/advance/${id}/paid`, data),
  cancel:  (id, data)   => api.put(`/advance/${id}/cancel`, data),
  startOptions: (advanceId) => api.get('/advance/start-options', { params: advanceId ? { advanceId } : {} }),
  changeStart: (id, data) => api.put(`/advance/${id}/start`, data),
};

/** Outstanding salary-advance money for one person: what's been paid out and not yet recovered through salary. */
export const advanceSummary = (rows = []) => {
  const open = rows.filter((a) => a.status === "PAID" && Number(a.balance) > 0);
  return { pending: open.reduce((t, a) => t + Number(a.balance || 0), 0), open };
};

export const holidayApi = {
  list:   ()       => api.get('/holidays'),
  add:    (data)    => api.post('/holidays', data),
  delete: (id)      => api.delete(`/holidays/${id}`),
};

export const companyDocApi = {
  list:   ()       => axios.get(COMPANY_DOCS_BASE),
  add:    (data)    => axios.post(COMPANY_DOCS_BASE, data),
  delete: (id)      => axios.delete(`${COMPANY_DOCS_BASE}/${id}`),
};

export const employeeApi = {
  list:        ()               => api.get('/employees'),
  get:         (id)             => api.get(`/employees/${id}`),
  create:      (data)           => api.post('/employees', data),
  update:      (id, data)       => api.patch(`/employees/${id}`, data),
  bankDetails: (id, username)   => api.get(`/employees/${id}/bank-details`, { params: { username } }),
  fromLogin:   (username)       => api.post(`/employees/from-login/${encodeURIComponent(username)}`),
  updatePhoto: (id, photoUrl)   => api.patch(`/employees/${id}/photo`, { photoUrl }),
  link:        (id, username)   => api.patch(`/employees/${id}/link`, { username }),
  markExit:    (id, data)       => api.post(`/employees/${id}/exit`, data),
  reinstate:   (id)             => api.post(`/employees/${id}/reinstate`),
  stats:       (id, range)      => api.get(`/employees/${id}/stats`, { params: { range } }),
};

export const performanceApi = {
  history: (employeeId)                          => api.get(`/employees/${employeeId}/remarks`),
  byDate:  (date)                                => api.get('/employees/remarks/by-date', { params: date ? { date } : {} }),
  add:     (employeeId, data)                     => api.post(`/employees/${employeeId}/remarks`, data),
  rate:    (employeeId, remarkId, data)           => api.put(`/employees/${employeeId}/remarks/${remarkId}/rating`, data),
  appeal:  (employeeId, remarkId, data)           => api.post(`/employees/${employeeId}/remarks/${remarkId}/appeal`, data),
  acknowledge: (employeeId, remarkId, data)       => api.post(`/employees/${employeeId}/remarks/${remarkId}/acknowledge`, data),
  editAccess: (employeeId, remarkId, data)       => api.put(`/employees/${employeeId}/remarks/${remarkId}/edit-access`, data),
  remove:  (employeeId, remarkId, username)        => api.delete(`/employees/${employeeId}/remarks/${remarkId}`, { params: { username } }),
  decide:  (employeeId, remarkId, data)           => api.post(`/employees/${employeeId}/remarks/${remarkId}/decision`, data),
  pendingAppeals: ()                             => api.get('/employees/remarks/appeals/pending'),
};

export const usersApi = {
  getAll:     () => axios.get(USERS_BASE),
  getExited:  () => axios.get(`${USERS_BASE}/exited`),
  markExit:   (id, data) => axios.post(`${USERS_BASE}/${id}/exit`, data),
  reinstate:  (id) => axios.post(`${USERS_BASE}/${id}/reinstate`),
};

export const EXIT_TYPES = [
  { value: 'RESIGNED',   label: 'Resigned' },
  { value: 'TERMINATED', label: 'Terminated' },
  { value: 'ABSCONDED',  label: 'Absconded' },
  { value: 'RETIRED',    label: 'Retired' },
  { value: 'OTHER',      label: 'Other' },
];

export function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Server LocalDateTime values are UTC without a zone suffix — parse them as UTC.
export function serverDate(d) {
  return new Date(typeof d === 'string' && !d.endsWith('Z') && !d.includes('+') ? d + 'Z' : d);
}

export function fmtServerTime(d) {
  if (!d) return '—';
  return serverDate(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

/** Date only (e.g. "05 Nov 2026") of a server timestamp, in IST — so a request raised just after midnight IST isn't shown a day early. */
export function fmtServerDate(d) {
  if (!d) return '';
  return serverDate(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function fmtDateTime(d) {
  if (!d) return null;
  const iso = typeof d === 'string' && !d.endsWith('Z') && !d.includes('+') ? d + 'Z' : d;
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export function fmtHours(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

const LEAVE_TYPE_LABELS = {
  CASUAL:     'Casual Leave (CL)',
  SICK:       'Sick Leave (SL)',
  PERMISSION: 'Permission',
  HALF_DAY:   'Half Day Leave',
  OTHER:      'Other',
};

export function leaveTypeLabel(type) {
  return LEAVE_TYPE_LABELS[type] || type;
}

// An employee who left (dor) and later rejoined (doj2 after dor) is currently ACTIVE.
export const isExitedEmp = (e) => !!e?.dor && !(e.doj2 && e.doj2 > e.dor);

// Total months with Happizo across stints: first stint (doj → dor) plus, if rejoined, doj2 → dor/now.
export function tenureMonths(e) {
  if (!e?.doj) return null;
  const mo = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const d = (x) => new Date(x + "T00:00:00");
  const now = new Date();
  let total = 0;
  if (e.dor) {
    total += mo(d(e.doj), d(e.dor));
    if (e.doj2 && e.doj2 > e.dor) total += mo(d(e.doj2), now);
  } else {
    total += mo(d(e.doj), now);
  }
  return total < 0 ? null : total;
}
