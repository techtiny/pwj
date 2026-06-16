import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/bugs`
  : '/api/v1/bugs';

const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

export const bugApi = {
  create:         (data)   => api.post('', data),
  getAll:         ()       => api.get(''),
  getFiltered:    (params) => api.get('', { params }),
  update:         (id, data) => api.put(`/${id}`, data),
  updateStatus:   (id, status, actorUsername)     => api.put(`/${id}/status`,   { status, actorUsername }),
  updateSeverity: (id, severity, actorUsername)   => api.put(`/${id}/severity`, { severity, actorUsername }),
  assign:         (id, assignedTo, actorUsername) => api.put(`/${id}/assign`,   { assignedTo, actorUsername }),
  getComments:    (id) => api.get(`/${id}/comments`),
  addComment:     (id, commentText, actorUsername) => api.post(`/${id}/comments`, { commentText, actorUsername }),
  delete:         (id)     => api.delete(`/${id}`),
};

export function fmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
