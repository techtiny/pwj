import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Project categories shown as columns in Operations → Projects, in display
// order. Stored on the project as plain text, so renaming one here (e.g. the
// "X" placeholder) needs existing projects re-tagged (see ProjectTypeMigration).
export const PROJECT_TYPES = ["Commercial Interior", "Residential Interior", "Construction", "Renovation"];

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
export async function getRecentEntries(size = 200, projectName) {
  const res = await axios.get(ENTRIES_BASE, {
    params: { page: 0, size, sortBy: 'createdAt', sortDir: 'desc', ...(projectName ? { projectName } : {}) },
    headers: userHeaders(),
  });
  return res.data?.data || { content: [] };
}

// Sets (or clears, with "") a project's Operations category.
export async function saveProjectType(projectId, projectType) {
  const res = await axios.put(`${PROJECTS_BASE}/${projectId}`, { projectType: projectType || "" });
  return res.data?.data;
}

// ── Project Planning schedule ────────────────────────────────────────────────
// { woNumber, startDate, completionDate, spocClient, spocContact,
//   happizoRepresentative, activities: [...] } — saved whole: activity rows
// with an id are updated, rows without one are created, missing rows deleted.
export async function getProjectSchedule(projectId) {
  const res = await axios.get(`${PROJECTS_BASE}/${projectId}/schedule`);
  return res.data?.data;
}

export async function saveProjectSchedule(projectId, schedule) {
  const res = await axios.put(`${PROJECTS_BASE}/${projectId}/schedule`, schedule);
  return res.data?.data;
}

// Schedule revisions (Rev 0, Rev 1, …): frozen copies of the saved schedule.
export async function getScheduleRevisions(projectId) {
  const res = await axios.get(`${PROJECTS_BASE}/${projectId}/schedule/revisions`);
  return res.data?.data || [];
}

export async function getScheduleRevision(projectId, revisionNo) {
  const res = await axios.get(`${PROJECTS_BASE}/${projectId}/schedule/revisions/${revisionNo}`);
  return res.data?.data;
}

export async function issueScheduleRevision(projectId, body) {
  const res = await axios.post(`${PROJECTS_BASE}/${projectId}/schedule/revisions`, body);
  return res.data?.data;
}

// Go back to a revision: the working schedule becomes a copy of it (issued revisions are untouched).
export async function restoreScheduleRevision(projectId, revisionNo, restoredBy) {
  const res = await axios.post(`${PROJECTS_BASE}/${projectId}/schedule/revisions/${revisionNo}/restore`, { restoredBy });
  return res.data?.data;
}
