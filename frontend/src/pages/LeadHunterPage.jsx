import { useState, useEffect, useCallback } from 'react';
import api from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtPrice(n) {
  if (!n) return '—';
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

function truncate(s, n = 120) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// Type label map (Hebrew → English-ish for filter values).
// We display Hebrew everywhere; values in the dropdown match what the scraper stores.
const TYPE_OPTIONS = [
  { value: 'all',     label: 'הכל' },
  { value: 'מכירה',   label: 'מכירה' },
  { value: 'השכרה',   label: 'השכרה' },
];

const STATUS_PILLS = {
  'New':               { label: 'חדש',     bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  'Contacted':         { label: 'בטיפול',  bg: 'rgba(245,158,11,0.18)', color: '#fbbf24' },
  'Meeting Scheduled': { label: 'פגישה',   bg: 'rgba(139,92,246,0.18)', color: '#c4b5fd' },
  'Closed':            { label: 'סגור',    bg: 'rgba(34,197,94,0.18)',  color: '#4ade80' },
};

// Try to extract a phone number from the description if it's not a top-level field.
function extractPhone(p) {
  if (p.contact_phone) return p.contact_phone;
  const m = (p.description || '').match(/(0\d[-\s]?\d{3}[-\s]?\d{4}|0\d{9})/);
  return m ? m[0].replace(/[\s-]/g, '') : null;
}

// Display name: explicit contact_name → first 40 chars of title → fallback id
function displayName(p) {
  if (p.contact_name) return p.contact_name;
  if (p.title)        return p.title.split(/[—|·,\n]/)[0].trim().slice(0, 40);
  return `ליד #${p.id}`;
}

// ── Manual Lead Modal ────────────────────────────────────────────────────────
function ManualLeadModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', phone: '', city: '', type: 'מכירה', rooms: '', price: '', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr('שם הוא שדה חובה'); return; }
    setSaving(true); setErr('');
    try {
      const created = await api.createManualLead({
        title:         form.name.trim(),
        contact_name:  form.name.trim(),
        contact_phone: form.phone.trim() || null,
        city:          form.city.trim() || null,
        type:          form.type,
        rooms:         form.rooms ? Number(form.rooms) : null,
        price:         form.price ? Number(form.price) : null,
        description:   form.description.trim() || null,
        status:        'New',
      });
      onSaved(created); onClose();
    } catch (e) { setErr(e.message || 'שגיאה'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-3"
        style={{ background: '#0f1629', border: '1px solid rgba(139,92,246,0.3)' }}>
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>✕</button>
          <h3 className="text-base font-bold text-white">+ הוספת ליד ידני</h3>
        </div>

        {[
          { k: 'name',    l: 'שם הליד *', ph: 'יוסי כהן' },
          { k: 'phone',   l: 'טלפון',     ph: '052-1234567' },
          { k: 'city',    l: 'עיר',       ph: 'תל אביב' },
        ].map(({ k, l, ph }) => (
          <div key={k}>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>{l}</label>
            <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph}
              className="dark-input w-full px-3 py-2 text-sm rounded-xl text-right" />
          </div>
        ))}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>סוג</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="dark-input w-full px-2 py-2 text-sm rounded-xl">
              <option>מכירה</option>
              <option>השכרה</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>חדרים</label>
            <input type="number" value={form.rooms} onChange={e => set('rooms', e.target.value)} placeholder="4"
              className="dark-input w-full px-2 py-2 text-sm rounded-xl text-right" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>מחיר ₪</label>
            <input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="2200000"
              className="dark-input w-full px-2 py-2 text-sm rounded-xl text-right" />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>תיאור</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={3} placeholder="דירת 4 חד' למכירה, קומה 3, מרפסת שמש..."
            className="dark-input w-full px-3 py-2 text-sm rounded-xl text-right resize-none" />
        </div>

        {err && <div className="text-xs text-red-400 text-right">⚠️ {err}</div>}

        <button onClick={save} disabled={saving}
          className="w-full text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: 'white' }}>
          {saving ? 'שומר...' : '💾 שמור ליד'}
        </button>
      </div>
    </div>
  );
}

// ── Lead Card (matches screenshot) ──────────────────────────────────────────
function LeadCard({ lead, onChangeStatus, onEdit, onDelete, onConvertCRM }) {
  const status = lead.status || 'New';
  const pill = STATUS_PILLS[status] || STATUS_PILLS.New;
  const phone = extractPhone(lead);
  const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
  const waPhone = phoneDigits.startsWith('0') ? '972' + phoneDigits.slice(1) : phoneDigits;

  // Build the meta line: "📍 city · type · rooms חד' · ₪price"
  const metaParts = [];
  if (lead.city)            metaParts.push(`📍 ${lead.city}`);
  if (lead.type)            metaParts.push(lead.type);
  if (lead.rooms)           metaParts.push(`${lead.rooms} חד'`);
  if (lead.price > 0)       metaParts.push(fmtPrice(lead.price));

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: '#131c33', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Top row: status pill (left) ↔ name + meta (right) */}
      <div className="flex items-start justify-between gap-3">
        <select value={status} onChange={e => onChangeStatus(lead.id, e.target.value)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer border-0 outline-none flex-shrink-0"
          style={{ background: pill.bg, color: pill.color }}>
          {Object.entries(STATUS_PILLS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <div className="flex-1 text-right min-w-0">
          <h3 className="text-base font-bold text-white truncate">{displayName(lead)}</h3>
          {metaParts.length > 0 && (
            <div className="text-xs mt-1" style={{ color: '#94a3b8' }}>
              {metaParts.join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {lead.description && (
        <p className="text-xs text-right leading-relaxed" style={{ color: '#cbd5e1' }}>
          {truncate(lead.description, 140)}
        </p>
      )}

      {/* Action row — RTL means first item appears rightmost */}
      <div className="flex items-center gap-2 flex-wrap">
        {phone && (
          <a href={`tel:${phone}`}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(34,197,94,0.18)', color: '#4ade80', textDecoration: 'none' }}>
            <span>📞</span><span dir="ltr">{phone}</span>
          </a>
        )}
        {phone && (
          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399', textDecoration: 'none' }}>
            💬 WA
          </a>
        )}
        <button onClick={() => onConvertCRM(lead)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'rgba(139,92,246,0.22)', color: '#c4b5fd' }}>
          📊 CRM
        </button>
        <button onClick={() => onEdit(lead)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'rgba(59,130,246,0.18)', color: '#60a5fa' }}>
          ✏️ עריכה
        </button>
        <button onClick={() => onDelete(lead.id)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
          🗑 מחק
        </button>
      </div>
    </div>
  );
}

// ── Edit Modal (slim) ────────────────────────────────────────────────────────
function EditModal({ property, onSave, onClose }) {
  const [form, setForm] = useState({
    title: property.title || '', price: property.price || '',
    city: property.city || '', type: property.type || '',
    rooms: property.rooms || '', description: property.description || '',
    status: property.status || 'New',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(property.id, { ...form, price: Number(form.price) || 0 });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-3"
        style={{ background: '#0f1629', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>✕</button>
          <h3 className="text-base font-bold text-white">עריכת ליד</h3>
        </div>

        {[
          ['title', 'כותרת / שם'],
          ['city',  'עיר'],
          ['type',  'סוג'],
        ].map(([k, l]) => (
          <div key={k}>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>{l}</label>
            <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
              className="dark-input w-full px-3 py-2 text-sm rounded-xl text-right" />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>חדרים</label>
            <input type="number" value={form.rooms} onChange={e => setForm(p => ({ ...p, rooms: e.target.value }))}
              className="dark-input w-full px-3 py-2 text-sm rounded-xl text-right" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>מחיר ₪</label>
            <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              className="dark-input w-full px-3 py-2 text-sm rounded-xl text-right" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>תיאור</label>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3} className="dark-input w-full px-3 py-2 text-sm rounded-xl text-right resize-none" />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }}>
          {saving ? 'שומר...' : '💾 שמור'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function LeadHunterPage({ user = null }) {
  // Data state
  const [myLeads,    setMyLeads]    = useState([]);
  const [loadingMy,  setLoadingMy]  = useState(true);
  const [facets,     setFacets]     = useState({ cities: [], types: [] });
  const [quota,      setQuota]      = useState(null);

  // Filter state
  const [filterCity, setFilterCity] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // UI state
  const [hunting,    setHunting]    = useState(false);
  const [flash,      setFlash]      = useState(''); // ✅ banner — "ליד חדש: ..."
  const [error,      setError]      = useState('');
  const [showManual, setShowManual] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [toast,      setToast]      = useState('');

  const showToast = (msg, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadMy = useCallback(async () => {
    setLoadingMy(true);
    try { setMyLeads(await api.getMyClaimed()); }
    catch (e) { console.error('[hunter] my-claimed:', e); }
    finally { setLoadingMy(false); }
  }, []);

  const loadFacets = useCallback(async () => {
    try { setFacets(await api.getClaimFacets()); } catch {}
  }, []);

  const loadQuota = useCallback(async () => {
    try { setQuota(await api.getClaimQuota()); } catch {}
  }, []);

  useEffect(() => {
    loadMy(); loadFacets(); loadQuota();
  }, [loadMy, loadFacets, loadQuota]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const stats = {
    total:  myLeads.length,
    active: myLeads.filter(l => l.status === 'Contacted' || l.status === 'Meeting Scheduled').length,
    closed: myLeads.filter(l => l.status === 'Closed').length,
  };

  const quotaExceeded = quota && !quota.unlimited && quota.remaining === 0;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleHunt = async () => {
    setError(''); setHunting(true);
    try {
      const filters = {
        city: filterCity === 'all' ? undefined : filterCity,
        type: filterType === 'all' ? undefined : filterType,
      };
      const r = await api.claimNextLead(filters);
      const lead = r.property;
      setMyLeads(prev => [lead, ...prev.filter(p => p.id !== lead.id)]);
      if (r.quota) setQuota(r.quota);
      const where = lead.city ? ` מ${lead.city}` : '';
      setFlash(`ליד חדש: ${displayName(lead)}${where}`);
      setTimeout(() => setFlash(''), 5000);
      loadFacets();
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('quota') || msg.includes('מכסה')) {
        setError('ניצלת את המכסה החודשית, שדרג כדי להמשיך לצוד');
        loadQuota();
      } else if (msg.includes('no fresh') || msg.includes('404')) {
        setError('אין לידים מתאימים במאגר — נסה סינון אחר או רענן מאוחר יותר');
      } else if (msg.includes('claimed') || msg.includes('409')) {
        setError('הליד נחטף ע"י סוכן אחר — נסה שוב');
      } else if (msg.includes('Schema migration')) {
        setError('צריך להריץ SUPABASE_SCHEMA.sql ב-Supabase');
      } else {
        setError(msg);
      }
    } finally {
      setHunting(false);
    }
  };

  const handleChangeStatus = async (id, status) => {
    setMyLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    try { await api.updateProperty(id, { status }); }
    catch { /* property table may not have status column — that's fine, UI keeps it */ }
  };

  const handleEditSave = async (id, updates) => {
    const updated = await api.updateProperty(id, updates);
    setMyLeads(prev => prev.map(l => l.id === id ? { ...l, ...updated, ...updates } : l));
    showToast('✅ הליד עודכן');
  };

  const handleDelete = async (id) => {
    if (!confirm('למחוק את הליד?')) return;
    try {
      await api.deleteProperty(id);
      setMyLeads(prev => prev.filter(l => l.id !== id));
      loadQuota();
      showToast('🗑️ נמחק');
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const handleConvertCRM = async (lead) => {
    try {
      const phone = extractPhone(lead);
      const message = [
        lead.city && `📍 ${lead.city}`,
        lead.type && `(${lead.type})`,
        lead.rooms && `${lead.rooms} חד'`,
        lead.price && fmtPrice(lead.price),
        lead.description && `\n${lead.description}`,
      ].filter(Boolean).join(' ');
      await api.createLead({
        name:    displayName(lead),
        phone:   phone || null,
        source:  `Hunter · ${lead.source || 'Pool'}`,
        message,
        owner_username: user?.username || null,
      });
      showToast('✅ הועבר ל-CRM');
    } catch (e) { showToast('❌ ' + e.message); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto" dir="rtl">

      {/* ── HERO: claim from pool ───────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 mb-5"
        style={{ background: '#1a2342', border: '1px solid rgba(99,102,241,0.25)' }}>

        {/* Title + status dot */}
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          <h2 className="text-base font-bold text-white">מצא ליד ממאגר המערכת</h2>
        </div>

        {/* Filters: city + type */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>עיר</label>
            <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
              className="dark-input w-full px-3 py-2.5 text-sm rounded-xl">
              <option value="all">כל הערים</option>
              {facets.cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>סוג</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="dark-input w-full px-3 py-2.5 text-sm rounded-xl">
              {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              {/* Also include any types that exist in the pool but aren't in the static list */}
              {facets.types.filter(t => !TYPE_OPTIONS.some(o => o.value === t)).map(t =>
                <option key={t} value={t}>{t}</option>
              )}
            </select>
          </div>
        </div>

        {/* Big yellow claim button + small purple manual */}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <button onClick={handleHunt} disabled={hunting || quotaExceeded}
            className="flex items-center justify-center gap-2 text-base font-black py-3.5 rounded-xl transition-all disabled:cursor-not-allowed"
            style={{
              background: quotaExceeded
                ? 'rgba(255,255,255,0.06)'
                : (hunting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#fbbf24,#d97706)'),
              color: quotaExceeded ? '#64748b' : '#1a1410',
              boxShadow: (hunting || quotaExceeded) ? 'none' : '0 0 22px rgba(251,191,36,0.35)',
            }}>
            {hunting ? (
              <><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> צד...</>
            ) : quotaExceeded ? (
              <>🔒 נגמרה המכסה החודשית</>
            ) : (
              <><span className="text-lg">⚡</span> הוצא ליד עכשיו</>
            )}
          </button>

          <button onClick={() => setShowManual(true)}
            className="flex items-center justify-center gap-1.5 text-sm font-bold px-5 py-3.5 rounded-xl transition-all"
            style={{
              background: 'rgba(139,92,246,0.18)',
              color: '#c4b5fd',
              border: '1px solid rgba(139,92,246,0.35)',
            }}>
            + ידנית
          </button>
        </div>

        {/* Quota indicator (only when limited) */}
        {quota && !quota.unlimited && (
          <div className="mt-3 text-[11px] text-right" style={{ color: quotaExceeded ? '#fca5a5' : '#64748b' }}>
            מכסת חבילה: {quota.used}/{quota.limit} החודש
            {quotaExceeded && ' — שדרג לחבילה Pro או Elite'}
          </div>
        )}

        {/* Success flash banner */}
        {flash && (
          <div className="mt-3 px-4 py-2.5 rounded-xl text-sm font-bold text-right"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
            ✅ {flash}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mt-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-right"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* ── STATS strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: '🎯', value: stats.total,  label: 'סה"כ',    bg: 'rgba(139,92,246,0.18)', color: '#c4b5fd' },
          { icon: '🔥', value: stats.active, label: 'בטיפול',  bg: 'rgba(245,158,11,0.18)', color: '#fbbf24' },
          { icon: '✅', value: stats.closed, label: 'סגורים',  bg: 'rgba(34,197,94,0.18)',  color: '#4ade80' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-5 text-center"
            style={{ background: '#131c33', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-xl mb-2"
              style={{ background: s.bg }}>
              {s.icon}
            </div>
            <div className="text-3xl font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-1" style={{ color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── LEAD CARDS ──────────────────────────────────────────────────────── */}
      {loadingMy ? (
        <div className="rounded-2xl p-10 flex flex-col items-center gap-3"
          style={{ background: '#131c33', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
          <p className="text-xs" style={{ color: '#475569' }}>טוען לידים...</p>
        </div>
      ) : myLeads.length === 0 ? (
        <div className="rounded-2xl p-12 flex flex-col items-center gap-3 text-center"
          style={{ background: '#131c33', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-4xl">🎯</div>
          <p className="text-sm font-semibold text-white">עדיין אין לידים שלי</p>
          <p className="text-xs" style={{ color: '#475569' }}>לחץ על "הוצא ליד עכשיו" כדי למשוך את הראשון</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myLeads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onChangeStatus={handleChangeStatus}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onConvertCRM={handleConvertCRM}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {editTarget && (
        <EditModal property={editTarget} onSave={handleEditSave} onClose={() => setEditTarget(null)} />
      )}
      {showManual && (
        <ManualLeadModal
          onClose={() => setShowManual(false)}
          onSaved={(created) => {
            if (created) setMyLeads(prev => [created, ...prev]);
            showToast('✅ הליד נוסף');
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl"
          style={{ background: 'rgba(15,22,41,0.95)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
