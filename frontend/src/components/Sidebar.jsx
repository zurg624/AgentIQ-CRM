import { useState } from 'react';
import { useLang, LANG_META } from '../i18n';

const NAV = [
  { key: 'chatbot',   label: "🤖 צ'אטבוט" },
  { key: 'crm',       label: '📊 CRM' },
  { key: 'followup',  label: '🔄 Follow-Up' },
  { key: 'shachen',   label: '🏡 שכן חכם' },
  { key: 'dealcalc',  label: '💰 מחשבון עסקה' },
  { key: 'hunter',    label: '🎯 צייד נכסים' },
  { key: 'marketing', label: '📣 שיווק AI' },
  { key: 'packages',  label: '🪙 חבילות' },
  { key: 'reports',   label: '📈 מרכז דוחות' },
  { key: 'settings',  label: '⚙️ הגדרות' },
];

const MOBILE_NAV = ['crm', 'hunter', 'dealcalc', 'reports', 'settings'];

export default function Sidebar({ page, setPage, user, onLogout, systemName = 'AgentIQ' }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = () => {
    if (confirmLogout) { onLogout?.(); }
    else { setConfirmLogout(true); setTimeout(() => setConfirmLogout(false), 3000); }
  };

  const initial = (systemName || 'A')[0].toUpperCase();
  const roleLabel = user?.role === 'admin' ? 'מנהל' : 'סוכן';

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="desktop-sidebar w-60 flex-shrink-0 flex flex-col min-h-screen"
        style={{ background: '#0a0d1c', borderRight: '1px solid rgba(255,255,255,0.07)' }}>

        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-base"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000', boxShadow: '0 0 18px rgba(245,158,11,0.4)' }}>
            {initial}
          </div>
          <div>
            <div className="shimmer-gold font-black text-sm tracking-wide">{systemName}</div>
            <div className="text-xs" style={{ color: '#64748b' }}>Real Estate CRM</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ key, label }) => (
            <button key={key} onClick={() => setPage(key)}
              className={`w-full text-right px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${page === key ? 'nav-active' : ''}`}
              style={page === key
                ? { borderLeft: '3px solid #f59e0b' }
                : { color: '#64748b', borderLeft: '3px solid transparent' }
              }
              onMouseEnter={e => { if (page !== key) { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; } }}
              onMouseLeave={e => { if (page !== key) { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = ''; } }}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Language */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider px-1 mb-2" style={{ color: '#475569' }}>שפה</div>
          <div className="grid grid-cols-2 gap-1">
            {LANG_META.map(({ code, label, flag }) => (
              <button key={code} onClick={() => setLang(code)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={lang === code
                  ? { background: 'rgba(234,179,8,0.15)', color: '#fbbf24' }
                  : { color: '#475569' }
                }>
                <span>{flag}</span>{label}
              </button>
            ))}
          </div>
        </div>

        {/* User + Logout */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000', boxShadow: '0 0 12px rgba(245,158,11,0.35)' }}>
              {(user?.display_name || 'U')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.display_name || 'משתמש'}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={user?.role === 'admin'
                    ? { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
                    : { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }
                  }>
                  {roleLabel}
                </span>
                <span className="text-[10px]" style={{ color: '#334155' }}>{user?.username}</span>
              </div>
            </div>
          </div>

          {/* Logout button */}
          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all"
            style={confirmLogout
              ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid rgba(255,255,255,0.07)' }
            }>
            {confirmLogout ? '⚠️ לחץ שוב לאישור' : '🚪 התנתק'}
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 md:hidden"
        style={{ background: '#0a0d1c', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000', boxShadow: '0 0 12px rgba(245,158,11,0.4)' }}>
            {initial}
          </div>
          <span className="shimmer-gold font-bold text-sm">{systemName}</span>
        </div>
        <button onClick={() => setOpen(v => !v)} className="p-2 rounded-lg" style={{ color: '#94a3b8' }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
          <nav className="absolute top-0 right-0 h-full w-64 py-16 px-3 space-y-1 overflow-y-auto"
            style={{ background: '#0a0d1c', borderLeft: '1px solid rgba(255,255,255,0.07)' }}
            onClick={e => e.stopPropagation()}>
            {NAV.map(({ key, label }) => (
              <button key={key} onClick={() => { setPage(key); setOpen(false); }}
                className="w-full text-right px-4 py-3 rounded-xl text-sm font-medium"
                style={page === key
                  ? { background: 'rgba(234,179,8,0.15)', color: '#fbbf24' }
                  : { color: '#94a3b8' }}>
                {label}
              </button>
            ))}
            <div className="pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <button onClick={() => { onLogout?.(); setOpen(false); }}
                className="w-full text-right px-4 py-3 rounded-xl text-sm font-medium"
                style={{ color: '#f87171' }}>
                🚪 התנתק
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* ── Mobile bottom tabs ─────────────────────────────────────── */}
      <div className="mobile-nav">
        {NAV.filter(n => MOBILE_NAV.includes(n.key)).map(({ key, label }) => {
          const [emoji, ...rest] = label.split(' ');
          return (
            <button key={key} onClick={() => setPage(key)}
              className="flex-1 flex flex-col items-center py-2 text-center"
              style={{ color: page === key ? '#fbbf24' : '#475569' }}>
              <span className="text-lg">{emoji}</span>
              <span className="text-[9px] mt-0.5 truncate w-full px-0.5">{rest.join(' ')}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
