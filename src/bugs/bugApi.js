import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1/bugs`
  : '/api/v1/bugs';

const api = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

export const bugApi = {
  create:         (data)   => api.post('', data),
  getAll:         ()       => api.get(''),
  getFiltered:    (params) => api.get('', { params }),
  updateStatus:   (id, status)     => api.put(`/${id}/status`, { status }),
  updateSeverity: (id, severity)   => api.put(`/${id}/severity`, { severity }),
  assign:         (id, assignedTo) => api.put(`/${id}/assign`, { assignedTo }),
  delete:         (id)     => api.delete(`/${id}`),
};

export function fmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
