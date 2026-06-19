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

const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

export async function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post(`${UPLOAD_BASE}/document`, form);
  return res.data?.data; // e.g. "/api/v1/upload/document/{uuid}.pdf"
}

export function attachmentFullUrl(path) {
  if (!path) return null;
  return (import.meta.env.VITE_API_BASE_URL || '') + path;
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
  create:     (data)           => api.post('/petty-cash', data),
  getMyEntries: (username)     => api.get(`/petty-cash/my/${username}`),
  getPending: ()               => api.get('/petty-cash/pending'),
  getAll:     ()               => api.get('/petty-cash/all'),
  approve:         (id, data)  => api.put(`/petty-cash/${id}/approve`, data),
  reject:          (id, data)  => api.put(`/petty-cash/${id}/reject`, data),
  markTransferred:    (id)        => api.put(`/petty-cash/${id}/mark-transferred`),
  submitProof:        (id, data)  => api.put(`/petty-cash/${id}/submit-proof`, data),  // data: { username, proofUrls: [] }
  getProofReview:     ()          => api.get('/petty-cash/proof-review'),
  verifyProof:        (id, data)  => api.put(`/petty-cash/${id}/verify-proof`, data),  // data: { verifiedBy, tallyComment }
  delete:             (id, u)     => api.delete(`/petty-cash/${id}?username=${u}`),
  getSummary:         (username)  => api.get(`/petty-cash/summary/${username}`),
};

export const projectsApi = {
  getActive: () => axios.get(`${PROJECTS_BASE}/active`),
};

export const usersApi = {
  getAll: () => axios.get(USERS_BASE),
};

export function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
  OTHER:      'Other',
};

export function leaveTypeLabel(type) {
  return LEAVE_TYPE_LABELS[type] || type;
}
