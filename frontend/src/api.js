// Central API client — single source of truth for the backend URL.
const BASE = 'https://agentiq-crm.onrender.com';

async function request(path, options = {}) {
  const url = `${BASE}/api${path}`;
  console.log(`[AgentIQ] → ${options.method || 'GET'} ${url}`, options.body ?? '');
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[AgentIQ] ✗ ${res.status} ${url}:`, text);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  getLeads:     ()             => request('/leads'),
  getAgents:    ()             => request('/agents'),
  createLead:   (body)         => request('/new-lead',          { method: 'POST',  body: JSON.stringify(body) }),
  assignAgent:  (id, agentId)  => request(`/leads/${id}/agent`, { method: 'PATCH', body: JSON.stringify({ agent_id: agentId }) }),
  changeStatus: (id, status)   => request(`/leads/${id}/status`,{ method: 'PATCH', body: JSON.stringify({ status }) }),
  chat:         (message)      => request('/ai-chat',           { method: 'POST',  body: JSON.stringify({ message }) }),
};

export default api;
