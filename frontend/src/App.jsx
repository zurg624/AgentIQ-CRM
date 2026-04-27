import { useState, useEffect, useRef } from 'react';
import { LangProvider, useLang } from './i18n';
import Sidebar from './components/Sidebar';
import StatsBar from './components/StatsBar';
import LeadDetailPanel from './components/LeadDetailPanel';
import Toast from './components/Toast';
import LoginPage from './pages/LoginPage';
import NotificationBell from './components/NotificationBell';
import CRMPage from './pages/CRMPage';
import ChatbotPage from './pages/ChatbotPage';
import FollowUpPage from './pages/FollowUpPage';
import ShachenPage from './pages/ShachenPage';
import LeadHunterPage from './pages/LeadHunterPage';
import MarketingAIPage from './pages/MarketingAIPage';
import PackagesPage from './pages/PackagesPage';
import ToolsPage from './pages/ToolsPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import api from './api';

const SIMULATE_LEADS = [
  { name: 'יעל מזרחי',    phone: '052-1112233', source: 'Facebook', message: 'ראיתי את המודעה שלכם — מחפשת דירה 3 חדרים קרוב לרכבת, תקציב 1.8M' },
  { name: 'אמיר חסן',     phone: '054-9988776', source: 'WhatsApp', message: 'שלום, מעוניין בנכס להשקעה באזור חיפה, תקציב 2M' },
  { name: 'Dana Friedman', phone: '050-3344556', source: 'Facebook', message: 'Looking for a luxury penthouse in Tel Aviv, budget 8M+, need sea view' },
  { name: 'מרים אבו-עבד', phone: '058-6677889', source: 'WhatsApp', message: 'أبحث عن شقة في حيفا، 4 غرف، قريبة من المدارس' },
];

// ── UI: blocked-page notice for non-admins who hit an admin-only route ───────
function AdminOnlyNotice({ onBack }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center rounded-2xl p-8 space-y-4"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div className="text-5xl">🔒</div>
        <h2 className="text-lg font-bold text-white">אזור למנהלי מערכת בלבד</h2>
        <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
          העמוד הזה מכיל הגדרות גלובליות של המערכת — עמלות, סטטוסים, חיבורי API ועוד.<br/>
          רק משתמש בתפקיד "מנהל" יכול לגשת אליו. אם אתה צריך גישה, פנה למנהל החשבון.
        </p>
        <button onClick={onBack}
          className="text-sm font-bold px-5 py-2 rounded-xl transition-all"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }}>
          ← חזרה ל-CRM
        </button>
      </div>
    </div>
  );
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function loadStoredAuth() {
  try {
    const user  = JSON.parse(localStorage.getItem('iq_user')  || 'null');
    const token = localStorage.getItem('iq_token') || '';
    return { user, token };
  } catch { return { user: null, token: '' }; }
}

function saveAuth(user, token) {
  localStorage.setItem('iq_user',  JSON.stringify(user));
  localStorage.setItem('iq_token', token);
}

function clearAuth() {
  localStorage.removeItem('iq_user');
  localStorage.removeItem('iq_token');
}

// ── App inner ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { dir } = useLang();
  const [page,     setPage]     = useState('crm');
  const [leads,    setLeads]    = useState([]);
  const [agents,   setAgents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [toast,    setToast]    = useState(null);
  const [settings,       setSettings]       = useState(null);
  const [notifications,  setNotifications]  = useState([]);

  // Auth state
  const [user,  setUser]  = useState(() => loadStoredAuth().user);
  const [token, setToken] = useState(() => loadStoredAuth().token);

  const toastTimer = useRef(null);

  const showToast = (lead) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(lead);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const handleLogin = (u, t) => {
    saveAuth(u, t);
    setUser(u); setToken(t);
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null); setToken('');
    setLeads([]); setSelectedLead(null);
  };

  // Load data after login
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Load leads+agents together; settings is optional (new endpoint, may 404 on old deploy)
    Promise.all([api.getLeads(), api.getAgents()])
      .then(([l, a]) => { setLeads(l); setAgents(a); })
      .catch(err => console.error('[AgentIQ] initial load failed:', err))
      .finally(() => setLoading(false));
    api.getSettings().then(setSettings).catch(() => {});
    api.getNotifications().then(setNotifications).catch(() => {});
  }, [user]);

  // SSE for new leads
  useEffect(() => {
    if (!user) return;
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
    es.addEventListener('new-match', (e) => {
      const notif = JSON.parse(e.data);
      setNotifications(prev => [notif, ...prev]);
      // Show as toast too
      showToast({ _isMatch: true, message: notif.message, score: notif.score });
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
  }, [dir]);

  // Filter leads by ownership (admin sees all, agents see only their own)
  const visibleLeads = user?.role === 'admin'
    ? leads
    : leads.filter(l => !l.owner_username || l.owner_username === user?.username);

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
      await api.createLead({ ...sample, owner_username: user?.username });
    } catch (err) {
      console.error('[AgentIQ] simulate failed:', err);
    } finally {
      setSimulating(false);
    }
  };

  const refreshLeads = () => { api.getLeads().then(setLeads).catch(console.error); };

  const handleMarkNotifRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
    api.markNotifRead(id).catch(console.error);
  };
  const handleMarkAllNotifsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    api.markAllNotifsRead().catch(console.error);
  };

  const systemName = settings?.system_name || 'AgentIQ';

  // ── Show login if not authenticated ──────────────────────────────────────────
  if (!user || !token) {
    return <LoginPage onLogin={handleLogin} systemName={systemName} />;
  }

  const sharedCRMProps = {
    leads: visibleLeads, agents, loading,
    onAssignAgent: handleAssignAgent,
    onChangeStatus: handleChangeStatus,
    onSelectLead: setSelectedLead,
    onSimulate: handleSimulate,
    simulating,
    onRefresh: refreshLeads,
    onShowSimulate: user.role === 'admin',
  };

  return (
    <div className="flex min-h-screen dot-grid" dir={dir}>
      <Sidebar
        page={page} setPage={setPage}
        user={user} onLogout={handleLogout}
        systemName={systemName}
        notifications={notifications}
        onMarkNotifRead={handleMarkNotifRead}
        onMarkAllNotifsRead={handleMarkAllNotifsRead}
      />

      <div className="md:hidden h-14 w-full fixed top-0 z-30" style={{ background: '#0b0f1e' }} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 md:hidden flex-shrink-0" />
        {!loading && <StatsBar leads={visibleLeads} />}

        <div className="flex-1 flex flex-col overflow-hidden">
          {page === 'crm'       && <CRMPage {...sharedCRMProps} />}
          {page === 'chatbot'   && <ChatbotPage />}
          {page === 'followup'  && (
            <FollowUpPage leads={visibleLeads} agents={agents}
              onAssignAgent={handleAssignAgent} onChangeStatus={handleChangeStatus}
              onSelectLead={setSelectedLead} />
          )}
          {page === 'shachen'   && <ShachenPage />}
          {page === 'dealcalc'  && <ToolsPage settings={settings} />}
          {page === 'hunter'    && <LeadHunterPage agents={agents} user={user} />}
          {page === 'marketing' && <MarketingAIPage />}
          {page === 'packages'  && <PackagesPage />}
          {page === 'reports'   && <ReportsPage systemName={systemName} />}
          {page === 'settings' && (
            user.role === 'admin'
              ? <SettingsPage settings={settings} onSettingsChange={setSettings} user={user} />
              : <AdminOnlyNotice onBack={() => setPage('crm')} />
          )}
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
