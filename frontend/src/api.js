// Central API client — single source of truth for the backend URL.
const BASE = import.meta.env.VITE_API_URL || 'https://agentiq-crm.onrender.com';

const getToken = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('iq_token') : '') || '';

async function request(path, options = {}) {
  const url = `${BASE}/api${path}`;
  const token = getToken();
  console.log(`[AgentIQ] → ${options.method || 'GET'} ${url}`, options.body ?? '');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[AgentIQ] ✗ ${res.status} ${url}:`, text);
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // Leads
  getLeads:     ()             => request('/leads'),
  getAgents:    ()             => request('/agents'),
  createLead:   (body)         => request('/new-lead',              { method: 'POST',   body: JSON.stringify(body) }),
  updateLead:   (id, body)     => request(`/leads/${id}`,           { method: 'PUT',    body: JSON.stringify(body) }),
  deleteLead:   (id)           => request(`/leads/${id}`,           { method: 'DELETE' }),
  bulkDelete:   (ids)          => request('/leads/bulk-delete',     { method: 'POST',   body: JSON.stringify({ ids }) }),
  assignAgent:  (id, agentId)  => request(`/leads/${id}/agent`,     { method: 'PATCH',  body: JSON.stringify({ agent_id: agentId }) }),
  changeStatus: (id, status)   => request(`/leads/${id}/status`,    { method: 'PATCH',  body: JSON.stringify({ status }) }),
  getMatches:   ()             => request('/matches'),
  chat:         (message)      => request('/ai-chat',               { method: 'POST',   body: JSON.stringify({ message }) }),

  // Smart Neighbor
  smartNeighbor: (address) => request('/smart-neighbor', { method: 'POST', body: JSON.stringify({ address }) }),

  // Lead Ingestion Engine
  ingestProperty:       (body)  => request('/ingest/property',   { method: 'POST', body: JSON.stringify(body) }),
  ingestApify:          (body)  => request('/ingest/apify',       { method: 'POST', body: JSON.stringify(body) }),
  ingestTest:           ()      => request('/ingest/test',        { method: 'POST' }),
  getIngestedProperties:()      => request('/ingest/properties'),
  getNotifications:     ()      => request('/notifications'),
  markNotifRead:        (id)    => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotifsRead:    ()      => request('/notifications/read-all',   { method: 'POST' }),

  // Auth
  login:        (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getMe:        ()             => request('/auth/me'),

  // Settings
  getSettings:  ()             => request('/settings'),
  updateSettings: (body)       => request('/settings',              { method: 'PUT',    body: JSON.stringify(body) }),

  // Reports
  getReports:   ()             => request('/reports'),

  // Reset
  resetSystem:  ()             => request('/reset',                 { method: 'POST' }),
};

export default api;
