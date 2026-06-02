import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/hr`
  : '/api/v1/hr';

const UPLOAD_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/upload`
  : '/api/v1/upload';

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
  checkIn:    (data) => api.post('/attendance/checkin', data),
  checkOut:   (data) => api.post('/attendance/checkout', data),
  getToday:   (username) => api.get(`/attendance/today/${username}`),
  getHistory: (username) => api.get(`/attendance/history/${username}`),
  getTodayAll: ()       => api.get('/attendance/today-all'),
  getAll:        ()     => api.get('/attendance/all'),
  getFieldStaff: ()     => api.get('/attendance/field-staff'),
  getSummary: (username) => api.get(`/attendance/summary/${username}`),
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
  approve:    (id, data)       => api.put(`/petty-cash/${id}/approve`, data),
  reject:     (id, data)       => api.put(`/petty-cash/${id}/reject`, data),
  delete:     (id, username)   => api.delete(`/petty-cash/${id}?username=${username}`),
  getSummary: (username)       => api.get(`/petty-cash/summary/${username}`),
};

export function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtHours(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
