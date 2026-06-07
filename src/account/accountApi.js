import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

const pwjApi = axios.create({
  baseURL: `${BASE_URL}/api/v1/projects`,
});

export const pwjDocsApi = {
  getDocs: (projectId) => api.get('/expenses/pwj-docs', { params: projectId ? { projectId } : {} }),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getProjectExpenses: () => api.get('/dashboard/project-expenses'),
};

export const expenseItemsApi = {
  getByProjectAndCategory: (projectId, category) => api.get(`/expenses/${projectId}/${category}`),
  getSummary: (projectId, category) => api.get(`/expenses/${projectId}/${category}/summary`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  getTrackedRefs: (projectId) => api.get(`/expenses/${projectId}/tracked-refs`),
  moveCategory:   (id, category) => api.patch(`/expenses/${id}/move`, { category }),
};

export const projectsApi = {
  getAll: () => pwjApi.get('/active').then(r => ({ ...r, data: r.data?.data ?? [] })),
  getById: (id) => pwjApi.get(`/${id}`).then(r => ({ ...r, data: r.data?.data ?? r.data })),
  getBudgetSummary: () => api.get('/v1/pwj/budget-summary').then(r => r.data?.data ?? {}),
};

export const salesApi = {
  getAll:    ()         => api.get('/sales'),
  getSummary:()         => api.get('/sales/summary'),
  create:    (data)     => api.post('/sales', data),
  update:    (id, data) => api.put(`/sales/${id}`, data),
  delete:    (id)       => api.delete(`/sales/${id}`),
};

export const collectionsApi = {
  getByProject: (projectId)       => api.get(`/collections/project/${projectId}`),
  create:       (data)            => api.post('/collections', data),
  update:       (id, data)        => api.put(`/collections/${id}`, data),
  delete:       (id)              => api.delete(`/collections/${id}`),
  triggerAlerts:()                => api.post('/collections/trigger-alerts'),
};

export const fundTransferApi = {
  getAll:     ()         => api.get('/fund-transfers'),
  getProjects:()         => api.get('/fund-transfers/b2b-projects'),
  getBalance: (id)       => api.get(`/fund-transfers/balance/${id}`),
  create:     (data)     => api.post('/fund-transfers', data),
  delete:     (id)       => api.delete(`/fund-transfers/${id}`),
};

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatLakh = (amount) => {
  if (!amount && amount !== 0) return '₹0';
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000)   return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

export default api;
