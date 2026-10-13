import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const PROJECTS_BASE = `${API_BASE}/api/v1/projects`;
const ENTRIES_BASE  = `${API_BASE}/api/v1/pwj/entries`;
const UPLOAD_BASE   = `${API_BASE}/api/v1/upload`;

// Mirrors App.jsx's userHeaders() — identifies the logged-in user so
// test-account entries are filtered out the same way the main dashboard does.
function userHeaders() {
  try {
    const u = JSON.parse(localStorage.getItem('pwj_user'));
    const name = u?.fullName || u?.username;
    return name ? { 'X-User-Name': name } : {};
  } catch { return {}; }
}

export async function getEligibleForAccountsProjects() {
  const res = await axios.get(`${PROJECTS_BASE}/eligible-for-accounts`);
  return res.data?.data || [];
}

// Uploads a file to the app's existing generic document store (same endpoint
// used for PR image references / delivery docs). Returns a path like
// "/api/v1/upload/document/{uuid}.xlsx".
export async function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post(`${UPLOAD_BASE}/document`, form);
  return res.data?.data;
}

// Persists the BOQ file reference on the project so it doesn't need to be
// re-uploaded on a later visit. Partial update — only these two fields change.
export async function saveProjectBoq(projectId, boqDocUrl, boqFileName) {
  const res = await axios.put(`${PROJECTS_BASE}/${projectId}`, { boqDocUrl, boqFileName });
  return res.data?.data;
}

// Persists which BOQ line items (by qualified label, per sheet) have already
// been turned into a PR, so they can't be selected again on a later visit —
// `usedLabelsMap` is { "<sheet name>": ["<label>", ...] }.
export async function saveUsedLabels(projectId, usedLabelsMap) {
  const res = await axios.put(`${PROJECTS_BASE}/${projectId}`, { boqUsedLabels: JSON.stringify(usedLabelsMap) });
  return res.data?.data;
}

// Persists the manually-entered "Additional / NT Items" list for a project —
// items[] = [{ id, sno, description, qty, unit }], independent of any BOQ
// sheet (there may be no uploaded BOQ at all).
export async function saveAdditionalItems(projectId, items) {
  const res = await axios.put(`${PROJECTS_BASE}/${projectId}`, { boqAdditionalItems: JSON.stringify(items) });
  return res.data?.data;
}

// Re-downloads a previously-uploaded BOQ file (by its stored URL) as raw bytes
// so it can be parsed client-side again, the same way a fresh upload is.
export async function fetchStoredFile(boqDocUrl) {
  const res = await axios.get(`${API_BASE}${boqDocUrl}`, { responseType: 'arraybuffer' });
  return res.data;
}

// Fetch recent entries for the trending dashboard — reuses the same list endpoint
// the main Entries dashboard uses, just asking for a large recent page sorted by
// creation date (the app-wide default sort, confirmed already set in App.jsx).
// Returns the full PagedResponse (content + totalClosed/totalOpen/... summary
// counts) so the dashboard can reuse the backend's own tallies.
export async function getRecentEntries(size = 200) {
  const res = await axios.get(ENTRIES_BASE, {
    params: { page: 0, size, sortBy: 'createdAt', sortDir: 'desc' },
    headers: userHeaders(),
  });
  return res.data?.data || { content: [] };
}
