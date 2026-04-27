import { useState, useEffect, useCallback } from 'react';
import api from '../api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1_000)     return `₪${(n / 1_000).toFixed(0)}K`;
  return `₪${n}`;
}

function fmtMins(mins) {
  if (!mins) return '—';
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

function truncate(str, n = 60) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
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

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ property, onSave, onClose }) {
  const [form, setForm] = useState({
    title:       property.title       || '',
    price:       property.price       || '',
    city:        property.city        || '',
    area:        property.area        || '',
    type:        property.type        || '',
    rooms:       property.rooms       || '',
    sqm:         property.sqm         || '',
    url:         property.url         || '',
    source:      property.source      || '',
    description: property.description || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(property.id, { ...form, price: Number(form.price) || 0 });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, type = 'text') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-right" style={{ color: '#94a3b8' }}>{label}</label>
      {key === 'description' ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          rows={3}
          className="w-full rounded-xl px-3 py-2 text-sm text-right"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', resize: 'vertical' }}
        />
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          className="w-full rounded-xl px-3 py-2 text-sm text-right"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>✕ סגור</button>
          <h3 className="text-sm font-bold text-white">עריכת נכס</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field('title',  'כותרת')}
          {field('price',  'מחיר (₪)', 'number')}
          {field('city',   'עיר')}
          {field('area',   'שכונה')}
          {field('type',   'סוג נכס')}
          {field('rooms',  'חדרים', 'number')}
          {field('sqm',    'מ"ר', 'number')}
          {field('url',    'קישור למקור')}
          {field('source', 'מקור')}
        </div>
        {field('description', 'תיאור מלא')}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 transition-all"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }}>
          {saving ? 'שומר...' : '💾 שמור שינויים'}
        </button>
      </div>
    </div>
  );
}

// ── Properties Table ──────────────────────────────────────────────────────────

function PropertiesTable({ properties, agents, onEdit, onDelete, onAssign, onWhatsapp, onConvertCRM, isAdmin, loading, convertingId }) {
  if (loading) {
    return (
      <div className="card rounded-2xl p-10 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
        <p className="text-xs" style={{ color: '#475569' }}>טוען נכסים...</p>
      </div>
    );
  }
  if (properties.length === 0) {
    return (
      <div className="card rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
        <div className="text-4xl">🎯</div>
        <p className="text-sm font-semibold text-white">אין נכסים עדיין</p>
        <p className="text-xs" style={{ color: '#475569' }}>לחץ על "סרוק לידים חדשים" כדי להתחיל</p>
      </div>
    );
  }

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
              {['כותרת','תקציר','מחיר','עיר','חד\'','מקור', ...(isAdmin ? ['סוכן'] : []), 'פעולות'].map(h => (
                <th key={h} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap"
                  style={{ color: '#64748b' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {properties.map((p, i) => (
              <tr key={p.id}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.07)'}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}>

                {/* Title */}
                <td className="px-3 py-2.5 text-right max-w-[200px]">
                  <span className="font-medium text-white" title={p.title}>{truncate(p.title, 50)}</span>
                </td>

                {/* Description preview */}
                <td className="px-3 py-2.5 text-right max-w-[260px]">
                  <span style={{ color: '#64748b', fontSize: 11, lineHeight: 1.45 }} title={p.description}>
                    {truncate(p.description, 90)}
                  </span>
                </td>

                {/* Price */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className="font-bold" style={{ color: p.price > 0 ? '#34d399' : '#475569' }}>
                    {fmtPrice(p.price)}
                  </span>
                </td>

                {/* City */}
                <td className="px-3 py-2.5 text-right">
                  <span style={{ color: '#94a3b8' }}>{p.city || '—'}</span>
                </td>

                {/* Rooms */}
                <td className="px-3 py-2.5 text-right" style={{ color: '#94a3b8' }}>
                  {p.rooms || '—'}
                </td>

                {/* Source */}
                <td className="px-3 py-2.5 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                    {p.source || 'Apify'}
                  </span>
                </td>

                {/* Agent dropdown — admin only */}
                {isAdmin && (
                  <td className="px-3 py-2.5 text-right">
                    <select
                      value={p.assigned_to || ''}
                      onChange={e => onAssign(p.id, e.target.value || null)}
                      className="text-[11px] rounded-lg px-2 py-1 text-right"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: p.assigned_to ? '#a5b4fc' : '#475569',
                        minWidth: 80,
                      }}>
                      <option value="">— שייך —</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))}
                    </select>
                  </td>
                )}

                {/* Actions */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Convert to CRM lead */}
                    <button onClick={() => onConvertCRM(p)} title="המר לליד CRM"
                      disabled={convertingId === p.id}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all disabled:opacity-50"
                      style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}>
                      {convertingId === p.id ? <span className="w-3 h-3 border border-indigo-400/40 border-t-indigo-300 rounded-full animate-spin" /> : '➕'}
                    </button>
                    {/* WhatsApp */}
                    <button onClick={() => onWhatsapp(p)} title="שלח בוואטסאפ"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all"
                      style={{ background: 'rgba(34,197,94,0.18)', color: '#4ade80' }}>
                      💬
                    </button>
                    {/* Facebook / source link */}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        title="פתח פוסט מקורי"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all"
                        style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                        🔗
                      </a>
                    )}
                    {/* Edit */}
                    <button onClick={() => onEdit(p)} title="עריכה"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all"
                      style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24' }}>
                      ✏️
                    </button>
                    {/* Delete */}
                    <button onClick={() => onDelete(p.id)} title="מחיקה"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Match tab components ──────────────────────────────────────────────────────

function MatchCard({ match, isSent, onSend, idx }) {
  const { lead, property, score } = match;
  const col = scoreColor(score);
  const bg  = scoreBg(score);

  return (
    <div className="card rounded-2xl p-4 space-y-3"
      style={{ animation: `fadeSlideIn 0.3s ease both`, animationDelay: `${idx * 0.07}s` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black" style={{ color: col }}>{score}%</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color: col }}>התאמה</span>
        </div>
        <span className="text-xs font-semibold text-white">{lead.name}</span>
      </div>
      <div className="text-sm font-bold text-white text-right leading-snug">{property.title}</div>
      <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: `linear-gradient(90deg, ${col}80, ${col})` }} />
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => onSend(match)} disabled={isSent}
          className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:cursor-default"
          style={isSent
            ? { background: 'rgba(255,255,255,0.06)', color: '#475569' }
            : { background: 'linear-gradient(135deg,#ef4444,#f97316)', color: 'white', boxShadow: '0 0 12px rgba(239,68,68,0.3)' }
          }>
          {isSent ? '✓ נשלח' : '🔥 שלח עכשיו'}
        </button>
        <div className="text-right">
          <div className="text-xs font-bold" style={{ color: '#e2e8f0' }}>{fmtPrice(property.price)}</div>
          <div className="text-[10px]" style={{ color: '#475569' }}>{fmtMins(property.mins)}</div>
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ profile }) {
  const { lead, match_count, best_property, best_score } = profile;
  const details = [best_property?.type, best_property?.area, best_property?.price ? fmtPrice(best_property.price) : null]
    .filter(Boolean).join(' | ');
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="text-center flex-shrink-0 w-10">
        <div className="text-lg font-black" style={{ color: match_count >= 3 ? '#22c55e' : '#60a5fa' }}>{match_count}</div>
        <div className="text-[9px] leading-tight" style={{ color: '#475569' }}>התאמות</div>
      </div>
      <Avatar name={lead.name} size={34} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white truncate">{lead.name}</div>
        <div className="text-[10px] truncate mt-0.5" style={{ color: '#94a3b8' }}>{details}</div>
      </div>
      <div className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{ background: scoreBg(best_score), color: scoreColor(best_score) }}>{best_score}%</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeadHunterPage({ agents = [], user = null }) {
  const isAdmin = user?.role === 'admin';
  const [tab, setTab]             = useState('facebook');

  // Facebook tab state
  const [properties,  setProperties]  = useState([]);
  const [propLoading, setPropLoading] = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const [scanMsg,     setScanMsg]     = useState('');
  const [scanUrl,     setScanUrl]     = useState('');   // optional FB group URL
  const [editTarget,  setEditTarget]  = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [convertingId,  setConvertingId]  = useState(null);
  const [toast,       setToast]       = useState('');

  // Match tab state
  const [matches,   setMatches]   = useState([]);
  const [profiles,  setProfiles]  = useState([]);
  const [stats,     setStats]     = useState(null);
  const [matchScan, setMatchScan] = useState(false);
  const [sent,      setSent]      = useState(new Set());
  const [matchLoaded, setMatchLoaded] = useState(false);

  const showToast = (msg, ms = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  // Load properties (Facebook tab)
  const loadProperties = useCallback(async () => {
    setPropLoading(true);
    try {
      const data = await api.getProperties();
      setProperties(data);
    } catch (err) {
      showToast(`❌ שגיאה בטעינה: ${err.message}`, 4000);
    } finally {
      setPropLoading(false);
    }
  }, []);

  useEffect(() => { loadProperties(); }, [loadProperties]);

  // Load matches (Match tab)
  const loadMatches = async (anim = false) => {
    setMatchScan(true);
    if (anim) { setMatches([]); setProfiles([]); }
    try {
      const data = await api.getMatches();
      setMatches(data.matches  || []);
      setProfiles(data.profiles || []);
      setStats(data.stats || null);
      setMatchLoaded(true);
    } catch (err) {
      setMatchLoaded(true);
    } finally {
      setMatchScan(false);
    }
  };

  useEffect(() => { if (tab === 'matches') loadMatches(); }, [tab]);

  // Trigger Apify scan
  // If scanUrl is filled → send it as startUrls so the Actor knows which FB group to scrape.
  // If empty            → the backend reads APIFY_START_URLS env var as the default.
  const handleScan = async () => {
    setScanning(true);
    setScanMsg('');
    try {
      const body = scanUrl.trim()
        ? { startUrls: [{ url: scanUrl.trim() }] }
        : {};
      const result = await api.runApifyScan(body);
      setScanMsg(`✅ הסריקה הושקה (Run ID: ${result.runId?.slice(0,8)}…). הנתונים יופיעו בקרוב — לחץ "רענן".`);
    } catch (err) {
      setScanMsg(`❌ ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  // Edit save
  const handleEditSave = async (id, updates) => {
    const updated = await api.updateProperty(id, updates);
    setProperties(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    showToast('✅ הנכס עודכן בהצלחה');
  };

  // Delete
  const handleDelete = async (id) => {
    if (deleteConfirm !== id) { setDeleteConfirm(id); setTimeout(() => setDeleteConfirm(null), 3000); return; }
    setDeleteConfirm(null);
    await api.deleteProperty(id);
    setProperties(prev => prev.filter(p => p.id !== id));
    showToast('🗑️ הנכס נמחק');
  };

  // Assign agent
  const handleAssign = async (id, agentName) => {
    await api.assignPropertyAgent(id, agentName || null);
    setProperties(prev => prev.map(p => p.id === id ? { ...p, assigned_to: agentName || null } : p));
  };

  // Build a human-readable summary of a property (for WhatsApp + CRM message)
  const propertySummary = (p) => {
    const parts = [];
    if (p.title) parts.push(`🏠 ${p.title}`);
    if (p.price > 0) parts.push(`💰 ${fmtPrice(p.price)}`);
    if (p.city)  parts.push(`📍 ${p.city}${p.area ? ' / ' + p.area : ''}`);
    if (p.rooms) parts.push(`🚪 ${p.rooms} חדרים`);
    if (p.sqm)   parts.push(`📐 ${p.sqm} מ"ר`);
    if (p.description) parts.push(`\n${p.description.slice(0, 350)}`);
    if (p.url)   parts.push(`\n🔗 ${p.url}`);
    return parts.join('\n');
  };

  // WhatsApp share — picker (no number) so user picks the recipient inside WA
  const handleWhatsapp = (p) => {
    const text = encodeURIComponent(propertySummary(p));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // Convert a scraped property into a real CRM lead
  const handleConvertCRM = async (p) => {
    if (convertingId) return;
    setConvertingId(p.id);
    try {
      const lead = await api.createLead({
        name:    p.title?.slice(0, 80) || `נכס מ-Apify ${p.id}`,
        phone:   null,
        source:  `Facebook · ${p.source || 'Apify'}`,
        message: propertySummary(p),
        owner_username: user?.username || null,
      });
      showToast(`✅ הליד "${lead.name}" נוסף ל-CRM`);
    } catch (err) {
      showToast(`❌ שגיאה בהמרה: ${err.message}`, 4000);
    } finally {
      setConvertingId(null);
    }
  };

  // Send match via WhatsApp
  const handleSend = (match) => {
    setSent(prev => new Set([...prev, match.id]));
    const msg = `🏠 נכס מתאים עבורך!\n${match.property.title}\n${fmtPrice(match.property.price)}\nהתאמה: ${match.score}%`;
    showToast(`✅ נשלח ל-${match.lead.name} בוואטסאפ!`);
    const phone = (match.lead.phone || '').replace(/\D/g, '');
    if (phone.length >= 9) {
      window.open(`https://wa.me/972${phone.slice(1)}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const tabStyle = (t) => ({
    padding: '8px 20px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
    background: tab === t ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'rgba(255,255,255,0.04)',
    color:      tab === t ? 'white' : '#64748b',
    border:     tab === t ? 'none' : '1px solid rgba(255,255,255,0.07)',
  });

  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto">

      {/* Page header */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">צייד הלידים 🎯</h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            סורק פוסטים מפייסבוק דרך Apify · מנתח מחיר ועיר אוטומטית · מחלק לסוכנים
          </p>
        </div>
        {/* Tab selector */}
        <div className="flex items-center gap-2">
          <button style={tabStyle('facebook')} onClick={() => setTab('facebook')}>
            📡 לידים מפייסבוק
          </button>
          <button style={tabStyle('matches')} onClick={() => setTab('matches')}>
            🔍 מנוע התאמות
          </button>
        </div>
      </div>

      {/* ─────────── FACEBOOK TAB ─────────── */}
      {tab === 'facebook' && (
        <div className="space-y-4">

          {/* Scan control bar */}
          <div className="card rounded-2xl p-4 space-y-3">
            {/* Row 1 — refresh + count */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  onClick={loadProperties}
                  disabled={propLoading}
                  className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-60 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {propLoading ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : '🔄'}
                  רענן
                </button>
                <span className="text-xs" style={{ color: '#475569' }}>
                  {properties.length} נכסים במאגר
                </span>
              </div>
            </div>

            {/* Row 2 — URL input + scan button */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Facebook group URL (optional — leave empty to use server default) */}
              <div className="relative flex-1 min-w-[200px]">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🔗</span>
                <input
                  type="url"
                  value={scanUrl}
                  onChange={e => setScanUrl(e.target.value)}
                  placeholder="קישור לקבוצת פייסבוק (אופציונלי)"
                  dir="ltr"
                  className="w-full rounded-xl pl-3 pr-9 py-2 text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e2e8f0',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-60 transition-all whitespace-nowrap"
                style={{
                  background: scanning
                    ? 'rgba(255,255,255,0.06)'
                    : 'linear-gradient(135deg,#ef4444,#f97316)',
                  color: 'white',
                  boxShadow: scanning ? 'none' : '0 0 18px rgba(239,68,68,0.35)',
                }}>
                {scanning ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> סורק...</>
                ) : (
                  <><span className="text-base">📡</span> סרוק לידים חדשים מפייסבוק</>
                )}
              </button>
            </div>

            {/* Status message */}
            {scanMsg && (
              <div className="text-xs px-3 py-2 rounded-xl text-right"
                style={{
                  background: scanMsg.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color:      scanMsg.startsWith('✅') ? '#34d399' : '#f87171',
                  border:     `1px solid ${scanMsg.startsWith('✅') ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                {scanMsg}
              </div>
            )}
          </div>

          {/* Delete confirm hint */}
          {deleteConfirm && (
            <div className="text-xs px-4 py-2 rounded-xl text-right"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠️ לחץ שוב על כפתור המחיקה לאישור סופי
            </div>
          )}

          {/* Properties table */}
          <PropertiesTable
            properties={properties}
            agents={agents}
            loading={propLoading}
            isAdmin={isAdmin}
            convertingId={convertingId}
            onEdit={setEditTarget}
            onDelete={handleDelete}
            onAssign={handleAssign}
            onWhatsapp={handleWhatsapp}
            onConvertCRM={handleConvertCRM}
          />
        </div>
      )}

      {/* ─────────── MATCHES TAB ─────────── */}
      {tab === 'matches' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => loadMatches(true)}
              disabled={matchScan}
              className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-60 transition-all"
              style={{ background: matchScan ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }}>
              {matchScan ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> סורק...</>
              ) : (
                <><span className="text-base">🔍</span> הפעל סריקה</>
              )}
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Matches */}
            <div className="space-y-4">
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

              {matchScan && matches.length === 0 ? (
                <div className="card rounded-2xl p-8 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                  <p className="text-xs" style={{ color: '#475569' }}>סורק מאגרי נכסים...</p>
                </div>
              ) : !matchLoaded ? (
                <div className="card rounded-2xl p-8 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                  <p className="text-xs" style={{ color: '#475569' }}>טוען...</p>
                </div>
              ) : matches.length === 0 ? (
                <div className="card rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
                  <div className="text-4xl">🔍</div>
                  <p className="text-sm font-semibold text-white">לא נמצאו התאמות</p>
                  <p className="text-xs" style={{ color: '#475569' }}>הוסף לידים עם תקציב ואזור כדי למצוא התאמות</p>
                </div>
              ) : (
                matches.map((m, i) => (
                  <MatchCard key={m.id} match={m} idx={i} isSent={sent.has(m.id)} onSend={handleSend} />
                ))
              )}
            </div>

            {/* Profiles + status */}
            <div className="space-y-4">
              <div className="card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold px-3 py-1 rounded-xl"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                    {profiles.length} פרופילים
                  </span>
                  <h2 className="text-sm font-bold text-white">פרופילי לקוחות פעילים 🎯</h2>
                </div>
                {profiles.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: '#334155' }}>אין פרופילים פעילים</p>
                ) : (
                  profiles.map(p => <ProfileRow key={p.lead.id} profile={p} />)
                )}
              </div>

              <div className="card rounded-2xl p-4">
                <h2 className="text-sm font-bold text-white text-right mb-3">סטטוס הציד ⚡</h2>
                <div className="space-y-2.5">
                  {[
                    { label: 'מקורות שנסרקים',        value: stats?.sources?.join(', ') ?? 'יד2, מדלן, winwin', hi: true },
                    { label: 'תדירות בדיקה',            value: stats?.scan_interval ?? 'כל שעה',              hi: false },
                    { label: 'התאמות שנמצאו היום',      value: stats?.today_matches ?? '—',                   hi: false },
                    { label: 'לקוחות עם פרופיל פעיל',  value: stats?.active_profiles ?? '—',                 hi: false },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-1.5"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="text-xs font-semibold" style={{ color: row.hi ? '#34d399' : '#e2e8f0' }}>{row.value}</span>
                      <span className="text-xs" style={{ color: '#475569' }}>{row.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          property={editTarget}
          onSave={handleEditSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl"
          style={{ background: 'rgba(15,22,41,0.95)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
