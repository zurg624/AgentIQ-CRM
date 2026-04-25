// Central API client — single source of truth for the backend URL.
// Hardcoded to production backend; Vite proxy handles /api in local dev.
const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : 'https://agentiq-crm.onrender.com';

const URL = (path) => `${BASE}/api${path}`;

async function request(path, options = {}) {
  const full = URL(path);
  console.log(`[AgentIQ] → ${options.method || 'GET'} ${full}`, options.body ?? '');
  const res = await fetch(full, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[AgentIQ] ✗ ${res.status} ${full}:`, text);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

export const api = {
  getLeads:      ()               => request('/leads'),
  getAgents:     ()               => request('/agents'),
  createLead:    (body)           => request('/new-lead', { method: 'POST', body: JSON.stringify(body) }),
  assignAgent:   (id, agent_id)   => request(`/leads/${id}/agent`,  { method: 'PATCH', body: JSON.stringify({ agent_id }) }),
  changeStatus:  (id, status)     => request(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  chat:          (message)        => request('/ai-chat', { method: 'POST', body: JSON.stringify({ message }) }),
};

export default api;
