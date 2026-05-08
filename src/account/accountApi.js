import axios from 'axios';

const ACCOUNT_BASE = import.meta.env.VITE_ACCOUNT_API_BASE_URL
  ? `${import.meta.env.VITE_ACCOUNT_API_BASE_URL}/api`
  : '/account-api';

const api = axios.create({
  baseURL: ACCOUNT_BASE,
  headers: { 'Content-Type': 'application/json' },
});

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
};

export const projectsApi = {
  getAll: () => api.get('/projects'),
  getById: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
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
