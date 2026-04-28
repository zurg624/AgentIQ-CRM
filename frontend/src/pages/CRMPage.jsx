import { useState, useMemo } from 'react';
import api from '../api';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  'New':               { label: 'חדש',    bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  'Contacted':         { label: 'ממתין',  bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
  'Meeting Scheduled': { label: 'בטיפול', bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
  'Closed':            { label: 'סגור',   bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
};

const STATUS_KEYS = Object.keys(STATUS_MAP);

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseBudget(msg = '') {
  if (!msg) return null;
  const mM = msg.match(/(\d[\d.,]*)M/i);
  if (mM) return parseFloat(mM[1].replace(/,/g, '')) * 1_000_000;
  const mMil = msg.match(/(\d[\d.,]*)\s*מיל/i);
  if (mMil) return parseFloat(mMil[1].replace(/,/g, '')) * 1_000_000;
  const mNum = msg.match(/(\d[\d,]{4,})/);
  if (mNum) return Number(mNum[1].replace(/,/g, ''));
  return null;
}

function parseSearch(msg = '') {
  const rooms = msg.match(/(\d+)\s*(?:חדרים?|חד'|rooms?|غرف)/i)?.[1];
  const area = msg.match(/(?:תל אביב|חיפה|ירושלים|גבעתיים|פתח תקווה|רמת גן|הרצליה|נתניה|באר שבע|ראשון)/)?.[0]
    || msg.match(/(?:ב|in\s+)([א-ת]{2,12})/)?.[1];
  if (rooms && area) return `${rooms} חד' — ${area}`;
  if (area) return area;
  if (rooms) return `${rooms} חד'`;
  return '—';
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 120)    return 'עכשיו';
  if (diff < 3600)   return `${Math.floor(diff / 60)} דק'`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} שע'`;
  const days = Math.floor(diff / 86400);
  if (days === 1)    return 'אתמול';
  if (days < 7)      return `${days} ימים`;
  return 'שבוע+';
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function exportToCSV(leads) {
  const headers = ['שם', 'טלפון', 'מקור', 'חיפוש', 'תקציב', 'דירוג AI', 'סטטוס', 'נוצר', 'פגישה אחרונה', 'הערות'];
  const rows = leads.map(l => {
    const budget = parseBudget(l.message);
    return [
      l.name, l.phone || '', l.source, parseSearch(l.message),
      budget ? `₪${(budget / 1_000_000).toFixed(1)}M` : '',
      budget !== null && budget > 2_000_000 ? 'חם' : 'פושר',
      STATUS_MAP[l.status]?.label || l.status,
      l.created_at ? new Date(l.created_at).toLocaleDateString('he-IL') : '',
      l.last_contacted ? new Date(l.last_contacted).toLocaleDateString('he-IL') : '',
      (l.notes || '').replace(/\n/g, ' '),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const bom = '\uFEFF'; // UTF-8 BOM for Excel Hebrew support
  const csv = bom + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'leads-agentiq.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 150);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RankBadge({ budget }) {
  const hot = budget !== null && budget > 2_000_000;
  return hot ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: 'rgba(239,68,68,0.18)', color: '#ef4444' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />חם
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: 'rgba(234,179,8,0.18)', color: '#eab308' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />פושר
    </span>
  );
}

function IconBtn({ onClick, title, children, danger }) {
  return (
    <button onClick={onClick} title={title}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
      style={{ background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)', color: danger ? '#f87171' : '#94a3b8' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = danger ? '#ef4444' : '#e2e8f0'; }}
      onMouseLeave={e => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = danger ? '#f87171' : '#94a3b8'; }}>
      {children}
    </button>
  );
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

function LeadFormModal({ lead, onClose, onSaved }) {
  const editing = !!lead;
  const [form, setForm] = useState({
    name: lead?.name || '',
    phone: lead?.phone || '',
    source: lead?.source || 'Facebook',
    message: lead?.message || '',
    notes: lead?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setErr('שם וטלפון הם שדות חובה'); return; }
    setSaving(true); setErr('');
    try {
      if (editing) { await api.updateLead(lead.id, form); }
      else         { await api.createLead(form); }
      onSaved(); onClose();
    } catch { setErr('שגיאה בשמירה — נסה שוב'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4" style={{ background: '#131929' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{editing ? 'עריכת ליד' : 'הוסף ליד חדש'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        {[
          { label: 'שם מלא *',  key: 'name',  type: 'text', placeholder: 'ישראל ישראלי' },
          { label: 'טלפון *',   key: 'phone', type: 'tel',  placeholder: '050-0000000' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>{label}</label>
            <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
              placeholder={placeholder} className="dark-input w-full px-3 py-2.5 text-sm rounded-xl" />
          </div>
        ))}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>מקור</label>
          <select value={form.source} onChange={e => set('source', e.target.value)} className="dark-input w-full px-3 py-2.5 text-sm rounded-xl">
            {['Facebook', 'WhatsApp', 'Yad2', 'אורגני', 'הפניה'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>הודעה / פרטים</label>
          <textarea value={form.message} onChange={e => set('message', e.target.value)}
            placeholder="מחפש דירה 4 חדרים, תקציב 2.5M..." rows={2}
            className="dark-input w-full px-3 py-2.5 text-sm rounded-xl resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>הערות פנימיות</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="הערות לשימוש פנימי..." rows={2}
            className="dark-input w-full px-3 py-2.5 text-sm rounded-xl resize-none" />
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>ביטול</button>
          <button onClick={save} disabled={saving} className="flex-1 btn-gradient py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? 'שומר...' : editing ? 'עדכן' : 'שמור ליד'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Notes Popup ───────────────────────────────────────────────────────────────

function NotesPopup({ lead, onClose, onSave }) {
  const [notes, setNotes] = useState(lead.notes || '');
  const [lastContacted, setLastContacted] = useState(
    lead.last_contacted ? lead.last_contacted.slice(0, 10) : ''
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateLead(lead.id, { notes, last_contacted: lastContacted || null });
      onSave({ ...lead, notes, last_contacted: lastContacted || null });
      onClose();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="card rounded-2xl p-5 w-full max-w-sm mx-4 space-y-4" style={{ background: '#131929' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">📝 הערות — {lead.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        {lead.message && (
          <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: '#0d1220', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#475569' }}>הודעה מקורית: </span>{lead.message}
          </div>
        )}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>הערות פנימיות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            placeholder="רשום הערות על הליד, תוצאות שיחות, דרישות מיוחדות..."
            className="dark-input w-full px-3 py-2.5 text-sm rounded-xl resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>תאריך פגישה אחרונה</label>
          <input type="date" value={lastContacted} onChange={e => setLastContacted(e.target.value)}
            className="dark-input w-full px-3 py-2.5 text-sm rounded-xl" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>ביטול</button>
          <button onClick={save} disabled={saving} className="flex-1 btn-gradient py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ count, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onCancel}>
      <div className="card rounded-2xl p-5 w-full max-w-xs mx-4 text-center space-y-4" style={{ background: '#131929' }} onClick={e => e.stopPropagation()}>
        <div className="text-3xl">🗑️</div>
        <p className="text-sm font-semibold text-white">
          {count > 1 ? `מחיקת ${count} לידים?` : 'מחיקת הליד?'}
        </p>
        <p className="text-xs" style={{ color: '#64748b' }}>פעולה זו אינה ניתנת לביטול</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>ביטול</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>מחק</button>
        </div>
      </div>
    </div>
  );
}

// ── Mobile Lead Card ──────────────────────────────────────────────────────────

function LeadCard({ lead, onChangeStatus, onEdit, onNotes, onDelete }) {
  const statusInfo = STATUS_MAP[lead.status] || STATUS_MAP['New'];
  const phone = lead.phone?.replace(/\D/g, '') || '';
  const waPhone = phone.startsWith('0') ? '972' + phone.slice(1) : phone;

  return (
    <div className="lead-card p-4 space-y-3">
      {/* Row 1: avatar + name + rank */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 12px rgba(99,102,241,0.3)' }}>
          {(lead.name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm truncate">{lead.name}</div>
          <div className="text-xs font-mono mt-0.5" style={{ color: '#64748b' }}>{lead.phone}</div>
        </div>
        <RankBadge budget={lead.budget} />
      </div>

      {/* Row 2: search + budget + time */}
      <div className="flex items-center gap-2 flex-wrap">
        {lead.search && lead.search !== '—' && (
          <span className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
            🔍 {lead.search}
          </span>
        )}
        {lead.budget && (
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>
            ₪{(lead.budget / 1_000_000).toFixed(1)}M
          </span>
        )}
        <span className="text-[11px] mr-auto" style={{ color: '#334155' }}>{timeAgo(lead.created_at)}</span>
      </div>

      {/* Row 3: status selector */}
      <select value={lead.status} onChange={e => onChangeStatus(lead.id, e.target.value)}
        className="w-full text-sm font-semibold px-3 py-2.5 rounded-xl cursor-pointer border-0 outline-none"
        style={{ background: statusInfo.bg, color: statusInfo.color }}>
        {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS_MAP[k].label}</option>)}
      </select>

      {/* Row 4: quick-action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <a href={`tel:${lead.phone}`}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold tap-sm"
          style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)', textDecoration: 'none' }}>
          📞 התקשר
        </a>
        <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold tap-sm"
          style={{ background: 'rgba(37,211,102,0.12)', color: '#22c55e', border: '1px solid rgba(37,211,102,0.2)', textDecoration: 'none' }}>
          💬 WhatsApp
        </a>
        <a href={`https://maps.google.com/?q=${encodeURIComponent(lead.search !== '—' ? lead.search : lead.name)}`}
          target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold tap-sm"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', textDecoration: 'none' }}>
          🗺️ מפה
        </a>
      </div>

      {/* Row 5: secondary actions */}
      <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={() => onNotes(lead)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium tap-sm"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8' }}>
          📝 הערות
        </button>
        <button onClick={() => onEdit(lead)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium tap-sm"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#94a3b8' }}>
          ✏️ עריכה
        </button>
        <button onClick={() => onDelete(lead.id)}
          className="flex items-center justify-center py-2 px-3 rounded-xl text-xs font-medium tap-sm"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
          🗑️
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CRMPage({ leads, loading, onChangeStatus, onSimulate, simulating, onShowSimulate, onRefresh }) {
  const [search,     setSearch]     = useState('');
  const [rankFilter, setRankFilter] = useState('הכל');
  const [statFilter, setStatFilter] = useState('הכל');
  const [budgetMin,  setBudgetMin]  = useState(''); // in M (millions ₪)
  const [budgetMax,  setBudgetMax]  = useState('');
  const [meetFrom,   setMeetFrom]   = useState(''); // YYYY-MM-DD
  const [meetTo,     setMeetTo]     = useState('');
  const [showAdv,    setShowAdv]    = useState(false);
  const [selected,   setSelected]   = useState(new Set());
  const [modal,      setModal]      = useState(null); // null | 'add' | { type:'edit', lead } | { type:'notes', lead }
  const [deleteTarget, setDeleteTarget] = useState(null); // null | 'bulk' | leadId

  // ── Derived data ────────────────────────────────────────────────────────────
  const rows = useMemo(() => leads.map(l => ({
    ...l,
    budget: parseBudget(l.message),
    search: parseSearch(l.message),
  })), [leads]);

  const filtered = useMemo(() => rows.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) &&
        !(l.phone || '').includes(search)) return false;
    if (rankFilter !== 'הכל') {
      const hot = l.budget !== null && l.budget > 2_000_000;
      if (rankFilter === 'חם' && !hot) return false;
      if (rankFilter === 'פושר' && hot) return false;
    }
    if (statFilter !== 'הכל' && l.status !== statFilter) return false;

    // Budget range — values entered in millions; budget on lead is in ₪
    if (budgetMin) {
      const min = parseFloat(budgetMin) * 1_000_000;
      if (!l.budget || l.budget < min) return false;
    }
    if (budgetMax) {
      const max = parseFloat(budgetMax) * 1_000_000;
      if (!l.budget || l.budget > max) return false;
    }

    // Meeting date range (last_contacted)
    if (meetFrom || meetTo) {
      if (!l.last_contacted) return false;
      const d = l.last_contacted.slice(0, 10); // YYYY-MM-DD
      if (meetFrom && d < meetFrom) return false;
      if (meetTo   && d > meetTo)   return false;
    }

    return true;
  }), [rows, search, rankFilter, statFilter, budgetMin, budgetMax, meetFrom, meetTo]);

  const advActive = !!(budgetMin || budgetMax || meetFrom || meetTo);

  const allChecked = filtered.length > 0 && filtered.every(l => selected.has(l.id));
  const someChecked = filtered.some(l => selected.has(l.id));

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const toggleOne = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (allChecked) setSelected(prev => { const n = new Set(prev); filtered.forEach(l => n.delete(l.id)); return n; });
    else setSelected(prev => { const n = new Set(prev); filtered.forEach(l => n.add(l.id)); return n; });
  };

  const confirmDelete = async () => {
    try {
      if (deleteTarget === 'bulk') {
        await api.bulkDelete([...selected]);
        setSelected(new Set());
      } else {
        await api.deleteLead(deleteTarget);
        setSelected(prev => { const n = new Set(prev); n.delete(deleteTarget); return n; });
      }
      onRefresh?.();
    } catch (e) { console.error('[AgentIQ] delete error:', e); }
    finally { setDeleteTarget(null); }
  };

  const handleNotesSaved = (updatedLead) => {
    onRefresh?.();
  };

  const stats = {
    total:    leads.length,
    new:      leads.filter(l => l.status === 'New').length,
    meetings: leads.filter(l => l.status === 'Meeting Scheduled').length,
    closed:   leads.filter(l => l.status === 'Closed').length,
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3 flex-wrap flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <h1 className="text-xl font-bold text-white">לידים פעילים 📊</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            <span className="text-xs" style={{ color: '#34d399' }}>מתעדכן אוטומטית</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {someChecked && (
            <>
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                {selected.size} נבחרו
              </span>
              <button onClick={() => setDeleteTarget('bulk')}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                🗑 מחק נבחרים
              </button>
              <button
                onClick={async () => {
                  const statusVal = prompt('סטטוס חדש: New / Contacted / Meeting Scheduled / Closed');
                  if (!statusVal || !STATUS_KEYS.includes(statusVal)) return;
                  await Promise.all([...selected].map(id => api.changeStatus(id, statusVal)));
                  onRefresh?.(); setSelected(new Set());
                }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.25)' }}>
                ✏️ עדכן סטטוס
              </button>
            </>
          )}
          <button onClick={() => exportToCSV(filtered)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
            📊 יצוא Excel
          </button>
          {onShowSimulate && (
            <button onClick={onSimulate} disabled={simulating}
              className="text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-60"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
              {simulating ? '⏳' : '🔧'} Simulate
            </button>
          )}
          <button onClick={() => setModal('add')} className="btn-gradient flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold">
            <span className="text-base leading-none">+</span> הוסף ליד
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 md:px-6 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: 'סה"כ לידים', value: stats.total,    color: '#60a5fa' },
          { label: 'חדשים',       value: stats.new,      color: '#93c5fd' },
          { label: 'פגישות',      value: stats.meetings, color: '#c4b5fd' },
          { label: 'סגורים',      value: stats.closed,   color: '#6ee7b7' },
        ].map(s => (
          <div key={s.label} className="card rounded-xl px-4 py-3">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="px-4 md:px-6 pb-3 flex items-center gap-2 md:gap-3 flex-wrap flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 md:flex-none">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="dark-input pr-8 pl-4 py-2.5 text-sm rounded-xl w-full md:w-48" dir="rtl" />
          <svg className="absolute right-2.5 top-3 w-3.5 h-3.5" style={{ color: '#475569' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {/* Rank filter */}
        <div className="flex gap-1.5">
          {['הכל', 'חם', 'פושר'].map(f => (
            <button key={f} onClick={() => setRankFilter(f)}
              className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
              style={rankFilter === f
                ? { background: 'rgba(234,179,8,0.2)', color: '#eab308', border: '1px solid rgba(234,179,8,0.4)' }
                : { background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.07)' }}>
              {f === 'חם' ? '🔥' : f === 'פושר' ? '❄️' : ''} {f}
            </button>
          ))}
        </div>
        {/* Status filter */}
        <select value={statFilter} onChange={e => setStatFilter(e.target.value)}
          className="dark-input text-xs px-3 py-1.5 rounded-xl" dir="rtl">
          <option value="הכל">כל הסטטוסים</option>
          {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS_MAP[k].label}</option>)}
        </select>
        {/* Advanced filters toggle */}
        <button onClick={() => setShowAdv(v => !v)}
          className="text-xs px-3 py-1.5 rounded-xl font-medium transition-colors"
          style={advActive || showAdv
            ? { background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)' }
            : { background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.07)' }}>
          ⚙️ סינון מתקדם {advActive && <span className="mr-1">●</span>}
        </button>
        {(search || rankFilter !== 'הכל' || statFilter !== 'הכל' || advActive) && (
          <button onClick={() => {
            setSearch(''); setRankFilter('הכל'); setStatFilter('הכל');
            setBudgetMin(''); setBudgetMax(''); setMeetFrom(''); setMeetTo('');
          }}
            className="text-xs px-2.5 py-1 rounded-full" style={{ color: '#ef4444' }}>✕ נקה</button>
        )}
        {filtered.length !== leads.length && (
          <span className="text-xs" style={{ color: '#475569' }}>מציג {filtered.length} מתוך {leads.length}</span>
        )}
      </div>

      {/* Advanced filter panel — collapsible */}
      {showAdv && (
        <div className="px-4 md:px-6 pb-3 flex-shrink-0">
          <div className="rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3"
            style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>
                תקציב מינ' (₪M)
              </label>
              <input type="number" value={budgetMin} onChange={e => setBudgetMin(e.target.value)}
                placeholder="1.5" min="0" step="0.1"
                className="dark-input w-full px-3 py-2 text-sm rounded-xl" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>
                תקציב מקס' (₪M)
              </label>
              <input type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)}
                placeholder="3.5" min="0" step="0.1"
                className="dark-input w-full px-3 py-2 text-sm rounded-xl" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>
                פגישה מ-
              </label>
              <input type="date" value={meetFrom} onChange={e => setMeetFrom(e.target.value)}
                className="dark-input w-full px-3 py-2 text-sm rounded-xl" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>
                פגישה עד-
              </label>
              <input type="date" value={meetTo} onChange={e => setMeetTo(e.target.value)}
                className="dark-input w-full px-3 py-2 text-sm rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* Leads — table on desktop, cards on mobile */}
      <div className="flex-1 px-4 md:px-6 pb-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48" style={{ color: '#334155' }}>טוען...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3">{leads.length === 0 ? '📭' : '🔍'}</div>
            <div className="text-sm font-medium text-white mb-1">{leads.length === 0 ? 'אין לידים עדיין' : 'לא נמצאו תוצאות'}</div>
            <div className="text-xs" style={{ color: '#475569' }}>{leads.length === 0 ? 'לחץ "הוסף ליד" להתחיל' : 'נסה לשנות את הפילטרים'}</div>
          </div>
        ) : (
          <>
            {/* ── Desktop table (hidden on mobile) ── */}
            <div className="hidden md:block">
              <div className="card rounded-2xl overflow-hidden mt-1">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox" checked={allChecked} onChange={toggleAll}
                          className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer" />
                      </th>
                      {['שם', 'חיפוש', 'תקציב', 'דירוג AI', 'סטטוס', 'פגישה אחרונה', 'זמן', 'פעולות'].map(h => (
                        <th key={h} className="text-right px-3 py-3 text-xs font-semibold"
                          style={{ color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((lead, idx) => {
                      const isSelected = selected.has(lead.id);
                      const statusInfo = STATUS_MAP[lead.status] || STATUS_MAP['New'];
                      return (
                        <tr key={lead.id}
                          style={{
                            borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                            background: isSelected ? 'rgba(99,102,241,0.06)' : undefined,
                          }}
                          className="crm-table-row transition-colors hover:bg-white/[0.02]">
                          <td className="px-3 py-3">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOne(lead.id)}
                              className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer" />
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                {(lead.name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-white text-xs whitespace-nowrap">{lead.name}</div>
                                <div className="text-[10px] font-mono" style={{ color: '#475569' }}>{lead.phone}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3"><span className="text-xs" style={{ color: '#94a3b8' }}>{lead.search}</span></td>
                          <td className="px-3 py-3">
                            <span className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>
                              {lead.budget ? `₪${(lead.budget / 1_000_000).toFixed(1)}M` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3"><RankBadge budget={lead.budget} /></td>
                          <td className="px-3 py-3">
                            <select value={lead.status} onChange={e => onChangeStatus(lead.id, e.target.value)}
                              className="text-[11px] font-semibold px-2 py-1 rounded-full cursor-pointer border-0 outline-none"
                              style={{ background: statusInfo.bg, color: statusInfo.color }}>
                              {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS_MAP[k].label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-[11px]" style={{ color: lead.last_contacted ? '#94a3b8' : '#334155' }}>
                              {fmtDate(lead.last_contacted) || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-[11px]" style={{ color: '#475569' }}>{timeAgo(lead.created_at)}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <IconBtn title="הערות" onClick={() => setModal({ type: 'notes', lead })}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </IconBtn>
                              <IconBtn title="עריכה" onClick={() => setModal({ type: 'edit', lead })}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </IconBtn>
                              <IconBtn title="מחיקה" danger onClick={() => setDeleteTarget(lead.id)}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Mobile cards (hidden on desktop) ── */}
            <div className="md:hidden mt-2 space-y-3">
              {filtered.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onChangeStatus={onChangeStatus}
                  onEdit={(l) => setModal({ type: 'edit', lead: l })}
                  onNotes={(l) => setModal({ type: 'notes', lead: l })}
                  onDelete={(id) => setDeleteTarget(id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {modal === 'add' && (
        <LeadFormModal onClose={() => setModal(null)} onSaved={() => onRefresh?.()} />
      )}
      {modal?.type === 'edit' && (
        <LeadFormModal lead={modal.lead} onClose={() => setModal(null)} onSaved={() => onRefresh?.()} />
      )}
      {modal?.type === 'notes' && (
        <NotesPopup lead={modal.lead} onClose={() => setModal(null)} onSave={handleNotesSaved} />
      )}
      {deleteTarget !== null && (
        <DeleteConfirm
          count={deleteTarget === 'bulk' ? selected.size : 1}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
