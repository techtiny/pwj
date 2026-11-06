import axios from 'axios';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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

export const vendorsApi = {
  getApproved: () => api.get('/v1/vendors').then(r => r.data?.data ?? []),
};

// Salary payments for released months (HR salary module → Accounts → Send for Payment). Bank details come from the Employee Master.
export const salaryPayoutApi = {
  list:    (username) => api.get('/v1/hr/salary/payouts', { params: { username } }),
  approve: (year, month, username) => api.post(`/v1/hr/salary/payouts/${year}/${month}/approve`, { username }),
  reject:  (year, month, username, remark) => api.post(`/v1/hr/salary/payouts/${year}/${month}/reject`, { username, remark }),
  // VP reopens the month (before or after the CEO released it) — goes back to Admin, this batch is withdrawn from here.
  revise:  (year, month, username, remark) => api.post('/v1/hr/salary/approval/revise', { username, remark }, { params: { year, month } }),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getProjectExpenses: () => api.get('/dashboard/project-expenses'),
  getVendorGstByProject: () => api.get('/dashboard/vendor-gst-by-project'),
};

export const expenseItemsApi = {
  getByProjectAndCategory: (projectId, category) => api.get(`/expenses/${projectId}/${category}`),
  getSummary: (projectId, category) => api.get(`/expenses/${projectId}/${category}/summary`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  getTrackedRefs: (projectId) => api.get(`/expenses/${projectId}/tracked-refs`),
  moveCategory:   (id, category) => api.patch(`/expenses/${id}/move`, { category }),
  setEligibility: (id, eligible) => api.patch(`/expenses/${id}/eligibility`, { eligible }),
  sendForPayment: (items) => api.post('/expenses/send-for-payment', { items }),
  getSentForPayment: () => api.get('/expenses/sent-for-payment'),
  setOhApproval: (id, status, revisedAmount) => api.patch(`/expenses/${id}/oh-approval`, { status, revisedAmount }),
  setAdminApproval: (id, status) => api.patch(`/expenses/${id}/admin-approval`, { status }),
  setVpApproval: (id, status) => api.patch(`/expenses/${id}/vp-approval`, { status }),
  reviseAtVp: (id) => api.patch(`/expenses/${id}/vp-revise`),
  setDeductions: (id, tdsPercent, deductionAmount, gstDeducted) => api.patch(`/expenses/${id}/deductions`, { tdsPercent, deductionAmount, gstDeducted }),
  setTdsFiling: (id, invoiceNo, tdsPaidDate, tdsFiled, remarks) => api.patch(`/expenses/${id}/tds-filing`, { invoiceNo, tdsPaidDate, tdsFiled, remarks }),
  setGstFiling: (id, gstInvoiceNo, gstInputStatus, gstInputDate, gstPaidToVendorDate, gstPaidStatus, gstRemarks) =>
    api.patch(`/expenses/${id}/gst-filing`, { gstInvoiceNo, gstInputStatus, gstInputDate, gstPaidToVendorDate, gstPaidStatus, gstRemarks }),
};

export const gstImportApi = {
  upload: (file, userName) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/v1/gst-import', fd, {
      headers: { 'Content-Type': 'multipart/form-data', ...(userName ? { 'X-User-Name': userName } : {}) },
    });
  },
  history: () => api.get('/v1/gst-import/history'),
};

export const projectsApi = {
  getAll: () => pwjApi.get('/active').then(r => ({ ...r, data: r.data?.data ?? [] })),
  getEligible: () => pwjApi.get('/eligible-for-accounts').then(r => ({ ...r, data: r.data?.data ?? [] })),
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

// Sales CRM — People / Companies. list = "people" | "companies"
export const crmApi = {
  getAll: (list)         => api.get(`/crm/${list}`),
  create: (list, data)   => api.post(`/crm/${list}`, data),
  update: (list, id, data) => api.put(`/crm/${list}/${id}`, data),
  delete: (list, id)     => api.delete(`/crm/${list}/${id}`),
};

// Sales → Campaigns (OH / VP / CEO only — each role has its own contact list and campaigns). Every call carries the
// signed-in username; the backend reads the role from that account. CampaignsPage sets it via setCampaignUser().
let campaignUser = '';
export const setCampaignUser = (u) => { campaignUser = u || ''; };
const q = (extra = {}) => ({ params: { username: campaignUser, ...extra } });
export const campaignApi = {
  waStatus:      ()          => api.get('/campaign/whatsapp/status', q()),
  waLogout:      ()          => api.post('/campaign/whatsapp/logout', null, q()),
  contacts:      ()          => api.get('/campaign/contacts', q()),
  addContact:    (data)      => api.post('/campaign/contacts', data, q()),
  updateContact: (id, data)  => api.put(`/campaign/contacts/${id}`, data, q()),
  deleteContact: (id)        => api.delete(`/campaign/contacts/${id}`, q()),
  importContacts:(list, ids) => api.post('/campaign/contacts/import', { list, ids }, q()),
  list:          ()          => api.get('/campaign', q()),
  detail:        (id)        => api.get(`/campaign/${id}`, q()),
  create:        (data)      => api.post('/campaign', data, q()),
  start:         (id)        => api.post(`/campaign/${id}/start`, null, q()),
  stop:          (id)        => api.post(`/campaign/${id}/stop`, null, q()),
  retryFailed:   (id)        => api.post(`/campaign/${id}/retry-failed`, null, q()),
  remove:        (id)        => api.delete(`/campaign/${id}`, q()),
};

export const collectionsApi = {
  getByProject:       (projectId) => api.get(`/collections/project/${projectId}`),
  getTotalsByProject: ()          => api.get('/collections/totals-by-project').then(r => r.data || {}),
  create:             (data)      => api.post('/collections', data),
  update:             (id, data)  => api.put(`/collections/${id}`, data),
  delete:             (id)        => api.delete(`/collections/${id}`),
  triggerAlerts:      ()          => api.post('/collections/trigger-alerts'),
};

export const fundTransferApi = {
  getAll:     ()         => api.get('/fund-transfers'),
  getProjects:()         => api.get('/fund-transfers/b2b-projects'),
  getBalance: (id)       => api.get(`/fund-transfers/balance/${id}`),
  create:     (data)     => api.post('/fund-transfers', data),
  delete:     (id)       => api.delete(`/fund-transfers/${id}`),
};

export const fundManagementApi = {
  list:           (direction) => api.get('/fund-management', { params: direction ? { direction } : {} }),
  balances:       ()          => api.get('/fund-management/balances'),
  paymentFunding: ()          => api.get('/fund-management/payment-funding'),
  transfer:       (data)      => api.post('/fund-management/transfer', data),
  create:         (data)      => api.post('/fund-management', data),
  delete:         (id)        => api.delete(`/fund-management/${id}`),
};

// Planned Inflow / Planned Outflow — forecasted movements, separate from Actual Inflow/Outflow
// above. Payment Funding is computed only from fundManagementApi (Actual), never from these.
export const plannedFundApi = {
  list:   (direction) => api.get('/fund-management/planned', { params: direction ? { direction } : {} }),
  create: (data)       => api.post('/fund-management/planned', data),
  delete: (id)         => api.delete(`/fund-management/planned/${id}`),
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
