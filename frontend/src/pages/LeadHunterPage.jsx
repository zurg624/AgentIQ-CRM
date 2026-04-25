import { useState, useEffect } from 'react';
import api from '../api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n) {
  if (!n) return '—';
  return `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
}

function fmtMins(mins) {
  if (mins < 60)   return `לפני ${mins} דק'`;
  if (mins < 1440) return `לפני ${Math.round(mins / 60)} שע'`;
  return `לפני ${Math.round(mins / 1440)} ימים`;
}

function scoreColor(s) {
  if (s >= 90) return '#22c55e';
  if (s >= 80) return '#eab308';
  if (s >= 70) return '#f97316';
  return '#94a3b8';
}

function scoreBg(s) {
  if (s >= 90) return 'rgba(34,197,94,0.12)';
  if (s >= 80) return 'rgba(234,179,8,0.12)';
  if (s >= 70) return 'rgba(249,115,22,0.12)';
  return 'rgba(148,163,184,0.1)';
}

function Avatar({ name, size = 36 }) {
  const letter = (name || '?')[0].toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
      {letter}
    </div>
  );
}

// ── Match Card ────────────────────────────────────────────────────────────────

function MatchCard({ match, isSent, onSend, idx }) {
  const { lead, property, score } = match;
  const col = scoreColor(score);
  const bg  = scoreBg(score);

  return (
    <div className="card rounded-2xl p-4 space-y-3"
      style={{ animation: `fadeSlideIn 0.3s ease both`, animationDelay: `${idx * 0.07}s` }}>
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black" style={{ color: col }}>{score}%</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: bg, color: col }}>התאמה</span>
        </div>
        <span className="text-xs font-semibold text-white">{lead.name}</span>
      </div>

      {/* Property title */}
      <div className="text-sm font-bold text-white text-right leading-snug">
        {property.title}
      </div>

      {/* Score bar */}
      <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: `linear-gradient(90deg, ${col}80, ${col})` }} />
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onSend(match)}
          disabled={isSent}
          className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:cursor-default"
          style={isSent
            ? { background: 'rgba(255,255,255,0.06)', color: '#475569' }
            : { background: 'linear-gradient(135deg,#ef4444,#f97316)', color: 'white', boxShadow: '0 0 12px rgba(239,68,68,0.3)' }
          }>
          {isSent ? 'שלח ←' : '🔥 שלח עכשיו'}
        </button>
        <div className="text-right">
          <div className="text-xs font-bold" style={{ color: '#e2e8f0' }}>{fmtPrice(property.price)}</div>
          <div className="text-[10px]" style={{ color: '#475569' }}>{fmtMins(property.mins)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Profile Row ───────────────────────────────────────────────────────────────

function ProfileRow({ profile }) {
  const { lead, match_count, best_property, best_score } = profile;
  const budget = best_property?.price;
  const details = [
    best_property?.type,
    best_property?.area,
    budget ? fmtPrice(budget) : null,
  ].filter(Boolean).join(' | ');

  return (
    <div className="flex items-center gap-3 py-2.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Match count */}
      <div className="text-center flex-shrink-0 w-10">
        <div className="text-lg font-black" style={{ color: match_count >= 3 ? '#22c55e' : '#60a5fa' }}>
          {match_count}
        </div>
        <div className="text-[9px] leading-tight" style={{ color: '#475569' }}>התאמות</div>
      </div>

      {/* Avatar */}
      <Avatar name={lead.name} size={34} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white truncate">{lead.name}</div>
        <div className="text-[10px] truncate mt-0.5" style={{ color: '#94a3b8' }}>{details}</div>
        <div className="text-[10px] mt-0.5" style={{ color: '#334155' }}>
          בדיקה אחרונה: {fmtMins(best_property?.mins || 60)}
        </div>
      </div>

      {/* Score pill */}
      <div className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{ background: scoreBg(best_score), color: scoreColor(best_score) }}>
        {best_score}%
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeadHunterPage() {
  const [matches,  setMatches]  = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [stats,    setStats]    = useState(null);
  const [scanning, setScanning] = useState(false);
  const [sent,     setSent]     = useState(new Set());
  const [toast,    setToast]    = useState('');
  const [loaded,   setLoaded]   = useState(false);

  const scan = async (showAnim = false) => {
    setScanning(true);
    if (showAnim) { setMatches([]); setProfiles([]); }
    try {
      const data = await api.getMatches();
      setMatches(data.matches  || []);
      setProfiles(data.profiles || []);
      setStats(data.stats || null);
      setLoaded(true);
    } catch (err) {
      console.error('[AgentIQ] matches error:', err);
      setLoaded(true);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => { scan(); }, []);

  const handleSend = (match) => {
    setSent(prev => new Set([...prev, match.id]));
    const msg = `🏠 נכס מתאים עבורך!\n${match.property.title}\n${fmtPrice(match.property.price)}\nהתאמה: ${match.match || match.score}%`;
    setToast(`✅ נשלח ל-${match.lead.name} בוואטסאפ!`);
    setTimeout(() => setToast(''), 3000);
    // In production: open WhatsApp link
    const phone = (match.lead.phone || '').replace(/\D/g, '');
    if (phone.length >= 9) {
      window.open(`https://wa.me/972${phone.slice(1)}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto">

      {/* Page header */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">ציד נכסים 🎯</h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            מנוע התאמה חכם — מחפש נכסים מיד2, מדלן ו-winwin לפי פרופיל הלקוח
          </p>
        </div>
        <button
          onClick={() => scan(true)}
          disabled={scanning}
          className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-60 transition-all"
          style={{ background: scanning ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }}>
          {scanning ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> סורק...</>
          ) : (
            <><span className="text-base">🔍</span> הפעל סריקה</>
          )}
        </button>
      </div>

      {/* Main grid */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* ── Left: Matches ── */}
        <div className="space-y-4">
          {/* Panel header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
              <span className="text-xs font-semibold" style={{ color: '#34d399' }}>סריקה חיה</span>
            </div>
            <h2 className="text-sm font-bold text-white">
              התאמות שנמצאו 🔔
              {matches.length > 0 && (
                <span className="mr-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                  {matches.length}
                </span>
              )}
            </h2>
          </div>

          {/* Cards */}
          {scanning && matches.length === 0 ? (
            <div className="card rounded-2xl p-8 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
              <p className="text-xs" style={{ color: '#475569' }}>סורק מאגרי נכסים...</p>
            </div>
          ) : !loaded ? (
            <div className="card rounded-2xl p-8 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
              <p className="text-xs" style={{ color: '#475569' }}>טוען...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="card rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">🔍</div>
              <p className="text-sm font-semibold text-white">לא נמצאו התאמות</p>
              <p className="text-xs" style={{ color: '#475569' }}>
                הוסף לידים עם תקציב ואזור כדי למצוא התאמות
              </p>
            </div>
          ) : (
            matches.map((m, i) => (
              <MatchCard
                key={m.id}
                match={m}
                idx={i}
                isSent={sent.has(m.id)}
                onSend={handleSend}
              />
            ))
          )}
        </div>

        {/* ── Right: Profiles + Status ── */}
        <div className="space-y-4">

          {/* Active profiles panel */}
          <div className="card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <button className="text-xs font-bold px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                + הוסף
              </button>
              <h2 className="text-sm font-bold text-white">פרופילי לקוחות פעילים 🎯</h2>
            </div>

            {profiles.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs" style={{ color: '#334155' }}>אין פרופילים פעילים</p>
              </div>
            ) : (
              <div className="divide-y-0">
                {profiles.map(p => (
                  <ProfileRow key={p.lead.id} profile={p} />
                ))}
              </div>
            )}
          </div>

          {/* Hunt status panel */}
          <div className="card rounded-2xl p-4">
            <h2 className="text-sm font-bold text-white text-right mb-3">
              סטטוס הציד ⚡
            </h2>
            <div className="space-y-2.5">
              {[
                { label: 'מקורות שנסרקים',         value: stats?.sources?.join(', ') ?? 'יד2, מדלן, winwin', highlight: true },
                { label: 'תדירות בדיקה',             value: stats?.scan_interval ?? 'כל שעה',               highlight: false },
                { label: 'התאמות שנמצאו היום',       value: stats?.today_matches ?? '—',                    highlight: false },
                { label: 'לקוחות עם פרופיל פעיל',   value: stats?.active_profiles ?? '—',                  highlight: false },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-xs font-semibold"
                    style={{ color: row.highlight ? '#34d399' : '#e2e8f0' }}>
                    {row.value}
                  </span>
                  <span className="text-xs" style={{ color: '#475569' }}>{row.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Source badges */}
          <div className="flex gap-2 flex-wrap justify-end">
            {[
              { name: 'יד2',    color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
              { name: 'מדלן',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
              { name: 'winwin', color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
            ].map(s => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33` }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: s.color }} />
                {s.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl"
          style={{ background: 'rgba(16,185,129,0.9)', color: 'white', backdropFilter: 'blur(8px)' }}>
          {toast}
        </div>
      )}

      {/* CSS for card entrance animation */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
