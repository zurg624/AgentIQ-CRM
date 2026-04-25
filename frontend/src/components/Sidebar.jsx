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
];

export default function Sidebar({ page, setPage }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Desktop sidebar ────────────────────────────────────── */}
      <aside className="desktop-sidebar w-60 flex-shrink-0 flex flex-col min-h-screen"
        style={{ background: '#0b0f1e', borderRight: '1px solid rgba(255,255,255,0.07)' }}>

        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-base"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>A</div>
          <div>
            <div className="font-bold text-white text-sm tracking-wide">AgentIQ</div>
            <div className="text-xs" style={{ color: '#64748b' }}>Real Estate CRM</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ key, label }) => (
            <button key={key} onClick={() => setPage(key)}
              className="w-full text-right px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
              style={page === key
                ? { background: 'linear-gradient(135deg,rgba(59,130,246,0.25),rgba(139,92,246,0.25))', color: '#93c5fd', borderLeft: '3px solid #3b82f6' }
                : { color: '#64748b', borderLeft: '3px solid transparent' }
              }
              onMouseEnter={e => { if (page !== key) e.currentTarget.style.color = '#cbd5e1'; }}
              onMouseLeave={e => { if (page !== key) e.currentTarget.style.color = '#64748b'; }}
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
                  ? { background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }
                  : { color: '#475569' }
                }>
                <span>{flag}</span>{label}
              </button>
            ))}
          </div>
        </div>

        {/* User */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>AM</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">Admin Manager</div>
              <div className="text-xs truncate" style={{ color: '#475569' }}>admin@agentiq.co.il</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ─────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 md:hidden"
        style={{ background: '#0b0f1e', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>A</div>
          <span className="text-white font-bold text-sm">AgentIQ</span>
        </div>
        <button onClick={() => setOpen(v => !v)} className="p-2 rounded-lg" style={{ color: '#94a3b8' }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
          <nav className="absolute top-0 right-0 h-full w-64 py-16 px-3 space-y-1 overflow-y-auto"
            style={{ background: '#0b0f1e', borderLeft: '1px solid rgba(255,255,255,0.07)' }}
            onClick={e => e.stopPropagation()}>
            {NAV.map(({ key, label }) => (
              <button key={key} onClick={() => { setPage(key); setOpen(false); }}
                className="w-full text-right px-4 py-3 rounded-xl text-sm font-medium"
                style={page === key
                  ? { background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }
                  : { color: '#94a3b8' }}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* ── Mobile bottom tabs ─────────────────────────────────── */}
      <div className="mobile-nav">
        {NAV.slice(0, 5).map(({ key, label }) => {
          const [emoji, ...rest] = label.split(' ');
          return (
            <button key={key} onClick={() => setPage(key)}
              className="flex-1 flex flex-col items-center py-2 text-center"
              style={{ color: page === key ? '#60a5fa' : '#475569' }}>
              <span className="text-lg">{emoji}</span>
              <span className="text-[9px] mt-0.5 truncate w-full px-0.5">{rest.join(' ')}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
