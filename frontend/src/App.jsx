import { useState, useEffect, useRef } from 'react';
import { LangProvider, useLang } from './i18n';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import StatsCard from './components/StatsCard';
import LeadsTable from './components/LeadsTable';
import LeadDetailPanel from './components/LeadDetailPanel';
import Toast from './components/Toast';
import ChatbotPage from './pages/ChatbotPage';
import FollowUpPage from './pages/FollowUpPage';
import ShachenPage from './pages/ShachenPage';
import LeadHunterPage from './pages/LeadHunterPage';
import MarketingAIPage from './pages/MarketingAIPage';
import PackagesPage from './pages/PackagesPage';
import ToolsPage from './pages/ToolsPage';

// In dev, VITE_API_URL is empty → Vite proxy handles /api → localhost:3001
// In production, set VITE_API_URL=https://your-backend.onrender.com in Vercel
const API = (import.meta.env.VITE_API_URL ?? '') + '/api';

const SIMULATE_LEADS = [
  { name: 'יעל מזרחי',    phone: '052-1112233', source: 'Facebook', message: 'ראיתי את המודעה שלכם — מחפשת דירה 3 חדרים קרוב לרכבת, תקציב 1.8M' },
  { name: 'אמיר חסן',     phone: '054-9988776', source: 'WhatsApp', message: 'שלום, מעוניין בנכס להשקעה באזור חיפה, תקציב 2M' },
  { name: 'Dana Friedman', phone: '050-3344556', source: 'Facebook', message: 'Looking for a luxury penthouse in Tel Aviv, budget 8M+, need sea view' },
  { name: 'מרים אבו-עבד', phone: '058-6677889', source: 'WhatsApp', message: 'أبحث عن شقة في حيفا، 4 غرف، قريبة من المدارس' },
];

// ── CRM Tab (Dashboard) ───────────────────────────────────────────────────────
function CRMPage({ leads, agents, loading, onAssignAgent, onChangeStatus, onSelectLead, onSimulate, simulating, onShowSimulate }) {
  const { t } = useLang();
  const stats = {
    total:    leads.length,
    new:      leads.filter(l => l.status === 'New').length,
    meetings: leads.filter(l => l.status === 'Meeting Scheduled').length,
    closed:   leads.filter(l => l.status === 'Closed').length,
  };

  return (
    <>
      {/* Header */}
      <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3 flex-wrap flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <h1 className="text-xl font-bold text-white">{t('lead_management')}</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>{t('lead_management_sub')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <input placeholder={t('search_placeholder')}
              className="dark-input pl-8 pr-4 py-2 text-sm w-44" />
            <svg className="absolute left-2.5 top-2.5 w-4 h-4" style={{ color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {onShowSimulate && (
            <button onClick={onSimulate} disabled={simulating}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-all"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
              title="Admin only">
              <span>{simulating ? '⏳' : '🔧'}</span>
              Simulate
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 py-5 space-y-5 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64" style={{ color: '#334155' }}>טוען...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatsCard label={t('total_leads')}  value={stats.total}    delta={t('all_time')}          color="#60a5fa" />
              <StatsCard label={t('new_leads')}    value={stats.new}      delta={t('awaiting_contact')}  color="#93c5fd" />
              <StatsCard label={t('meetings')}     value={stats.meetings} delta={t('scheduled')}         color="#c4b5fd" />
              <StatsCard label={t('closed_deals')} value={stats.closed}   delta={t('this_month')}        color="#6ee7b7" />
            </div>
            <LeadsTable leads={leads} agents={agents}
              onAssignAgent={onAssignAgent} onChangeStatus={onChangeStatus} onSelectLead={onSelectLead} />
          </>
        )}
      </div>
    </>
  );
}

// ── App inner ─────────────────────────────────────────────────────────────────
// Admin mode: run `localStorage.setItem('iq_admin','1')` in browser console to unlock
const isAdmin = () => typeof localStorage !== 'undefined' && localStorage.getItem('iq_admin') === '1';

function AppInner() {
  const { dir } = useLang();
  const [page, setPage] = useState('crm');
  const [adminMode] = useState(isAdmin);
  const [leads, setLeads] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (lead) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(lead);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    Promise.all([
      fetch(`${API}/leads`).then(r => r.json()),
      fetch(`${API}/agents`).then(r => r.json()),
    ]).then(([l, a]) => { setLeads(l); setAgents(a); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const es = new EventSource(`${API}/events`);
    es.addEventListener('new-lead', (e) => {
      const lead = JSON.parse(e.data);
      setLeads(prev => {
        const exists = prev.some(l => l.id === lead.id);
        return exists ? prev.map(l => l.id === lead.id ? lead : l) : [lead, ...prev];
      });
      if (selectedLead?.id === lead.id) setSelectedLead(lead);
      showToast(lead);
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
  }, [dir]);

  const handleAssignAgent = (leadId, agentId) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, agent_id: agentId } : l));
    if (selectedLead?.id === leadId) setSelectedLead(p => ({ ...p, agent_id: agentId }));
    fetch(`${API}/leads/${leadId}/agent`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId }),
    });
  };

  const handleChangeStatus = (leadId, status) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    if (selectedLead?.id === leadId) setSelectedLead(p => ({ ...p, status }));
    fetch(`${API}/leads/${leadId}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  };

  const handleSimulate = async () => {
    setSimulating(true);
    const sample = SIMULATE_LEADS[Math.floor(Math.random() * SIMULATE_LEADS.length)];
    try {
      await fetch(`${API}/new-lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample),
      });
      // Don't add to state here — SSE broadcast handles it (avoids duplicate key)
    } finally {
      setSimulating(false);
    }
  };

  const sharedCRMProps = {
    leads, agents, loading,
    onAssignAgent: handleAssignAgent,
    onChangeStatus: handleChangeStatus,
    onSelectLead: setSelectedLead,
    onSimulate: handleSimulate,
    simulating,
  };

  return (
    <div className="flex min-h-screen dot-grid" dir={dir} style={{ paddingTop: '0' }}>
      <Sidebar page={page} setPage={setPage} />

      {/* Mobile top-bar spacer */}
      <div className="md:hidden h-14 w-full fixed top-0 z-30" style={{ background: '#0b0f1e' }} />

      <main className="flex-1 flex flex-col overflow-hidden" style={{ paddingTop: 0 }}>
        {/* Mobile spacer */}
        <div className="h-14 md:hidden flex-shrink-0" />

        {/* Top stats bar — always visible */}
        {!loading && <StatsBar leads={leads} />}

        {/* Page content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {page === 'crm'       && <CRMPage {...sharedCRMProps} onShowSimulate={adminMode} />}
          {page === 'chatbot'   && <ChatbotPage />}
          {page === 'followup'  && (
            <FollowUpPage leads={leads} agents={agents}
              onAssignAgent={handleAssignAgent} onChangeStatus={handleChangeStatus}
              onSelectLead={setSelectedLead} />
          )}
          {page === 'shachen'   && <ShachenPage />}
          {page === 'dealcalc'  && <ToolsPage />}
          {page === 'hunter'    && <LeadHunterPage onImport={() => {}} />}
          {page === 'marketing' && <MarketingAIPage />}
          {page === 'packages'  && <PackagesPage />}
        </div>
      </main>

      {selectedLead && (
        <LeadDetailPanel lead={selectedLead} agents={agents}
          onClose={() => setSelectedLead(null)}
          onAssignAgent={handleAssignAgent} onChangeStatus={handleChangeStatus} />
      )}

      {toast && <Toast lead={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AppInner />
    </LangProvider>
  );
}
