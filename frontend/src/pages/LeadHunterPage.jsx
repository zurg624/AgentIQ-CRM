import { useState } from 'react';
import api from '../api';

const MOCK_LEADS = [
  { id: 'fb1', source: 'Facebook', name: 'נועם שפירא', phone: '052-3344556', message: 'מחפש דירת 4 חדרים בגבעתיים, תקציב 3.5M', time: '8 דקות', avatar: 'נ' },
  { id: 'fb2', source: 'Facebook', name: 'Liora Ben David', phone: '054-7788990', message: 'Looking for investment apartment, budget 2.5M, prefer Tel Aviv south', time: '23 דקות', avatar: 'L' },
  { id: 'y1',  source: 'Yad2',    name: 'רחל מזרחי', phone: '058-1122334', message: 'מעוניינת בנכס 3 חדרים בפתח תקווה, עד 2M', time: '41 דקות', avatar: 'ר' },
  { id: 'fb3', source: 'Facebook', name: 'Ahmed Khalil', phone: '050-9988776', message: 'أبحث عن شقة في حيفا 3 غرف، ميزانية 1.8M', time: '1.2 שעות', avatar: 'A' },
  { id: 'y2',  source: 'Yad2',    name: 'דני אברהם', phone: '052-5566778', message: 'קונה להשקעה 2-3 חדרים ברדיוס 20 ק"מ מת"א, עד 1.6M', time: '2.5 שעות', avatar: 'ד' },
  { id: 'fb4', source: 'Facebook', name: 'מיכל גולן', phone: '054-3322110', message: 'פנטהאוז בתל אביב, יש לי 12M, רוצה נוף לים', time: '3.8 שעות', avatar: 'מ' },
  { id: 'y3',  source: 'Yad2',    name: 'יוסי כץ', phone: '058-4455667', message: 'מחפש קרקע לבנייה פרטית בפרברי השרון', time: '5 שעות', avatar: 'י' },
];

const SOURCE_STYLE = {
  Facebook: { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc', icon: '📘' },
  Yad2:     { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', icon: '🏠' },
};

export default function LeadHunterPage({ onImport }) {
  const [imported, setImported] = useState(new Set());
  const [importing, setImporting] = useState(null);

  const handleImport = async (lead) => {
    if (imported.has(lead.id) || importing) return;
    setImporting(lead.id);
    try {
      await api.createLead({ name: lead.name, phone: lead.phone, source: lead.source, message: lead.message });
      setImported(prev => new Set([...prev, lead.id]));
      onImport?.();
    } catch (err) {
      console.error('[AgentIQ] import lead error:', err);
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="flex-1 px-4 md:px-6 py-6">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">🎯 צייד נכסים</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>לידים נכנסים מ-Facebook ו-Yad2 — ייבא ל-CRM בלחיצה</p>
        </div>
        <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          Live Feed
        </div>
      </div>

      {/* Source filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {['הכל', 'Facebook', 'Yad2'].map(f => (
          <button key={f} className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {MOCK_LEADS.map(lead => {
          const style = SOURCE_STYLE[lead.source] ?? SOURCE_STYLE.Facebook;
          const done = imported.has(lead.id);
          return (
            <div key={lead.id} className="card rounded-2xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                {lead.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-semibold text-white">{lead.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: style.bg, color: style.color }}>
                    {style.icon} {lead.source}
                  </span>
                  <span className="text-[10px]" style={{ color: '#475569' }}>לפני {lead.time}</span>
                </div>
                <div className="text-xs truncate" style={{ color: '#94a3b8' }}>{lead.message}</div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: '#475569' }}>{lead.phone}</div>
              </div>
              <button onClick={() => handleImport(lead)} disabled={done || importing === lead.id}
                className="flex-shrink-0 text-xs px-4 py-2 rounded-xl font-semibold transition-all disabled:opacity-60"
                style={done
                  ? { background: 'rgba(16,185,129,0.15)', color: '#34d399' }
                  : { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }
                }>
                {done ? '✓ יובא' : importing === lead.id ? '...' : 'ייבא ל-CRM'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs mt-6 text-center" style={{ color: '#334155' }}>
        * נתוני הדגמה — בסביבת ייצור מתחבר ל-Facebook Lead Ads API ו-Yad2 Webhook
      </p>
    </div>
  );
}
