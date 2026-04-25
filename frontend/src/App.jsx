import { useState, useEffect, useRef } from 'react';
import { LangProvider, useLang } from './i18n';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import LeadDetailPanel from './components/LeadDetailPanel';
import Toast from './components/Toast';
import CRMPage from './pages/CRMPage';
import ChatbotPage from './pages/ChatbotPage';
import FollowUpPage from './pages/FollowUpPage';
import ShachenPage from './pages/ShachenPage';
import LeadHunterPage from './pages/LeadHunterPage';
import MarketingAIPage from './pages/MarketingAIPage';
import PackagesPage from './pages/PackagesPage';
import ToolsPage from './pages/ToolsPage';
import api from './api';

const SIMULATE_LEADS = [
  { name: 'יעל מזרחי',    phone: '052-1112233', source: 'Facebook', message: 'ראיתי את המודעה שלכם — מחפשת דירה 3 חדרים קרוב לרכבת, תקציב 1.8M' },
  { name: 'אמיר חסן',     phone: '054-9988776', source: 'WhatsApp', message: 'שלום, מעוניין בנכס להשקעה באזור חיפה, תקציב 2M' },
  { name: 'Dana Friedman', phone: '050-3344556', source: 'Facebook', message: 'Looking for a luxury penthouse in Tel Aviv, budget 8M+, need sea view' },
  { name: 'מרים אבו-עבד', phone: '058-6677889', source: 'WhatsApp', message: 'أبحث عن شقة في حيفا، 4 غرف، قريبة من المدارس' },
];


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
    Promise.all([api.getLeads(), api.getAgents()])
      .then(([l, a]) => { setLeads(l); setAgents(a); })
      .catch(err => console.error('[AgentIQ] initial load failed:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const BASE = import.meta.env.VITE_API_URL || 'https://agentiq-crm.onrender.com';
    const es = new EventSource(`${BASE}/api/events`);
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
    api.assignAgent(leadId, agentId).catch(console.error);
  };

  const handleChangeStatus = (leadId, status) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    if (selectedLead?.id === leadId) setSelectedLead(p => ({ ...p, status }));
    api.changeStatus(leadId, status).catch(console.error);
  };

  const handleSimulate = async () => {
    setSimulating(true);
    const sample = SIMULATE_LEADS[Math.floor(Math.random() * SIMULATE_LEADS.length)];
    try {
      await api.createLead(sample);
      // Don't add to state here — SSE broadcast handles it (avoids duplicate key)
    } catch (err) {
      console.error('[AgentIQ] simulate failed:', err);
    } finally {
      setSimulating(false);
    }
  };

  const refreshLeads = () => {
    api.getLeads().then(setLeads).catch(console.error);
  };

  const sharedCRMProps = {
    leads, agents, loading,
    onAssignAgent: handleAssignAgent,
    onChangeStatus: handleChangeStatus,
    onSelectLead: setSelectedLead,
    onSimulate: handleSimulate,
    simulating,
    onRefresh: refreshLeads,
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
          {page === 'crm'       && <CRMPage {...sharedCRMProps} onShowSimulate={adminMode} onRefresh={refreshLeads} />}
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
