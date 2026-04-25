import { useState } from 'react';
import api from '../api';

const STATUS_MAP = {
  'New':               { label: 'חדש',     bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  'Contacted':         { label: 'ממתין',   bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
  'Meeting Scheduled': { label: 'בטיפול',  bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
  'Closed':            { label: 'סגור',    bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
};

function parseBudget(msg = '') {
  const m =
    msg.match(/(\d[\d,]+)M/i) ? Number(msg.match(/(\d[\d,\.]+)M/i)[1].replace(/,/g, '')) * 1_000_000 :
    msg.match(/(\d[\d,\.]+)\s*מיל/i) ? Number(msg.match(/(\d[\d,\.]+)\s*מיל/i)[1].replace(/,/g, '')) * 1_000_000 :
    msg.match(/(\d[\d,]{4,})/) ? Number(msg.match(/(\d[\d,]{4,})/)[1].replace(/,/g, '')) :
    null;
  return m;
}

function parseSearch(msg = '') {
  const rooms = msg.match(/(\d+)\s*(?:חדרים?|חד'|rooms?|غرف)/i)?.[1];
  const area =
    msg.match(/(?:ב|in\s+|في\s*)([^\s,،]{2,12})/i)?.[1] ||
    msg.match(/(?:תל אביב|חיפה|ירושלים|גבעתיים|פתח תקווה|רמת גן|הרצליה|נתניה)/)?.[0];
  if (rooms && area) return `${rooms} חד' — ${area}`;
  if (area) return area;
  if (rooms) return `${rooms} חד'`;
  return '—';
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 120) return 'עכשיו';
  if (diff < 3600) return `${Math.floor(diff / 60)} דק'`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} שע'`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'אתמול';
  if (days < 7) return `${days} ימים`;
  return 'שבוע+';
}

function RankBadge({ budget }) {
  const hot = budget !== null && budget > 2_000_000;
  return hot ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: 'rgba(239,68,68,0.18)', color: '#ef4444' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
      חם
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ background: 'rgba(234,179,8,0.18)', color: '#eab308' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
      פושר
    </span>
  );
}

function AddLeadModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', phone: '', source: 'Facebook', message: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setErr('שם וטלפון הם שדות חובה'); return; }
    setSaving(true);
    setErr('');
    try {
      await api.createLead(form);
      onSaved();
      onClose();
    } catch (e) {
      setErr('שגיאה בשמירה — נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="card rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4"
        style={{ background: '#131929' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">הוסף ליד חדש</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {[
          { label: 'שם מלא *', key: 'name', type: 'text', placeholder: 'ישראל ישראלי' },
          { label: 'טלפון *',  key: 'phone', type: 'tel',  placeholder: '050-0000000' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>{label}</label>
            <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
              placeholder={placeholder} className="dark-input w-full px-3 py-2.5 text-sm rounded-xl" />
          </div>
        ))}

        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>מקור</label>
          <select value={form.source} onChange={e => set('source', e.target.value)}
            className="dark-input w-full px-3 py-2.5 text-sm rounded-xl">
            {['Facebook', 'WhatsApp', 'Yad2', 'אורגני', 'הפניה'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>הודעה / פרטים</label>
          <textarea value={form.message} onChange={e => set('message', e.target.value)}
            placeholder="מחפש דירה 4 חדרים, תקציב 2.5M..." rows={3}
            className="dark-input w-full px-3 py-2.5 text-sm rounded-xl resize-none" />
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
            ביטול
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 btn-gradient py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? 'שומר...' : 'שמור ליד'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CRMPage({ leads, agents, loading, onAssignAgent, onChangeStatus, onSimulate, simulating, onShowSimulate, onRefresh }) {
  const [showModal, setShowModal] = useState(false);

  const rows = leads.map(l => ({
    ...l,
    budget: parseBudget(l.message),
    search: parseSearch(l.message),
    time: timeAgo(l.created_at),
    statusInfo: STATUS_MAP[l.status] || STATUS_MAP['New'],
  }));

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
          {onShowSimulate && (
            <button onClick={onSimulate} disabled={simulating}
              className="text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60 transition-all"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
              {simulating ? '⏳' : '🔧'} Simulate
            </button>
          )}
          <button onClick={() => setShowModal(true)}
            className="btn-gradient flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold">
            <span className="text-base leading-none">+</span>
            הוסף ליד
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 md:px-6 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: 'סה"כ לידים',    value: leads.length,                                                      color: '#60a5fa' },
          { label: 'חדשים',          value: leads.filter(l => l.status === 'New').length,                     color: '#93c5fd' },
          { label: 'פגישות',         value: leads.filter(l => l.status === 'Meeting Scheduled').length,       color: '#c4b5fd' },
          { label: 'סגורים',         value: leads.filter(l => l.status === 'Closed').length,                  color: '#6ee7b7' },
        ].map(s => (
          <div key={s.label} className="card rounded-xl px-4 py-3">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 px-4 md:px-6 pb-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48" style={{ color: '#334155' }}>טוען...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm font-medium text-white mb-1">אין לידים עדיין</div>
            <div className="text-xs" style={{ color: '#475569' }}>לחץ "הוסף ליד" להתחיל</div>
          </div>
        ) : (
          <div className="card rounded-2xl overflow-hidden mt-2">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['שם', 'חיפוש', 'תקציב', 'דירוג AI', 'סטטוס', 'זמן'].map(h => (
                    <th key={h} className="text-right px-4 py-3 text-xs font-semibold"
                      style={{ color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((lead, idx) => (
                  <tr key={lead.id}
                    style={{ borderBottom: idx < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    className="transition-colors hover:bg-white/[0.02]">
                    {/* שם */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                          {(lead.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-white text-xs">{lead.name}</div>
                          <div className="text-[10px] font-mono" style={{ color: '#475569' }}>{lead.phone}</div>
                        </div>
                      </div>
                    </td>
                    {/* חיפוש */}
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: '#94a3b8' }}>{lead.search}</span>
                    </td>
                    {/* תקציב */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>
                        {lead.budget ? `₪${(lead.budget / 1_000_000).toFixed(1)}M` : '—'}
                      </span>
                    </td>
                    {/* דירוג AI */}
                    <td className="px-4 py-3">
                      <RankBadge budget={lead.budget} />
                    </td>
                    {/* סטטוס */}
                    <td className="px-4 py-3">
                      <select
                        value={lead.status}
                        onChange={e => onChangeStatus(lead.id, e.target.value)}
                        className="text-[11px] font-semibold px-2 py-1 rounded-full cursor-pointer border-0 outline-none"
                        style={{ background: lead.statusInfo.bg, color: lead.statusInfo.color }}>
                        {Object.entries(STATUS_MAP).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </td>
                    {/* זמן */}
                    <td className="px-4 py-3">
                      <span className="text-[11px]" style={{ color: '#475569' }}>{lead.time}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <AddLeadModal
          onClose={() => setShowModal(false)}
          onSaved={() => { onRefresh?.(); }}
        />
      )}
    </div>
  );
}
