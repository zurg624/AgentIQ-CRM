import { useState } from 'react';
import api from '../api';

const PROP_TYPES = ['דירה', 'פנטהאוז', 'קוטג\'', 'דירת גן', 'בית פרטי', 'נכס מסחרי'];

const VARIANTS = [
  {
    key:   'story',
    label: 'סטורי',
    sub:   'אינסטגרם / וואטסאפ',
    icon:  '⚡',
    color: '#f59e0b',
    bg:    'rgba(245,158,11,0.12)',
    border:'rgba(245,158,11,0.3)',
  },
  {
    key:   'group',
    label: 'קבוצת פייסבוק',
    sub:   'טון אישי לקהילה',
    icon:  '👥',
    color: '#3b82f6',
    bg:    'rgba(59,130,246,0.12)',
    border:'rgba(59,130,246,0.3)',
  },
  {
    key:   'marketplace',
    label: 'Marketplace',
    sub:   'יד2 / Facebook Marketplace',
    icon:  '🏷️',
    color: '#22c55e',
    bg:    'rgba(34,197,94,0.12)',
    border:'rgba(34,197,94,0.3)',
  },
];

function VariationCard({ variant, content, loading }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (!content) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(content)}`, '_blank');
  };

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: variant.bg, border: `1px solid ${variant.border}`, minHeight: 240 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{variant.icon}</span>
          <div>
            <div className="text-sm font-bold" style={{ color: variant.color }}>{variant.label}</div>
            <div className="text-[10px]" style={{ color: '#64748b' }}>{variant.sub}</div>
          </div>
        </div>
        {content && (
          <div className="flex gap-1">
            <button onClick={handleCopy}
              className="text-[10px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)', color: copied ? '#34d399' : '#94a3b8' }}>
              {copied ? '✓ הועתק' : '📋 העתק'}
            </button>
            <button onClick={handleShare}
              className="text-[10px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.18)', color: '#4ade80' }}>
              💬 וואטסאפ
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto"
        style={{ background: '#0d1220', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.05)', minHeight: 140, maxHeight: 280 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-2xl mb-2 animate-pulse">✨</div>
              <div className="text-[11px]" style={{ color: '#475569' }}>יוצר וריאציה...</div>
            </div>
          </div>
        ) : content ? (
          content
        ) : (
          <div className="flex items-center justify-center h-full text-[11px]" style={{ color: '#334155' }}>
            הפוסט יופיע כאן
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketingAIPage() {
  const [form, setForm] = useState({ type: 'דירה', rooms: '4', area: '', price: '', sqm: '', floor: '', feature: '' });
  const [variations, setVariations] = useState({ story: '', group: '', marketplace: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const generate = async () => {
    if (!form.area || !form.price) return;
    setLoading(true);
    setError('');
    setVariations({ story: '', group: '', marketplace: '' });

    try {
      const result = await api.generateMarketing({
        type:    form.type,
        rooms:   form.rooms ? Number(form.rooms) : undefined,
        area:    form.area,
        price:   Number(form.price),
        sqm:     form.sqm ? Number(form.sqm) : undefined,
        floor:   form.floor || undefined,
        feature: form.feature || undefined,
      });
      setVariations(result);
    } catch (err) {
      setError(err.message || 'שגיאה ביצירת התוכן');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">📣 שיווק AI</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>
          הזן פרטי נכס וקבל 3 וריאציות מוכנות — לסטורי, לקבוצה, ול-Marketplace
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        {/* Form — takes 1/3 on lg, full on smaller */}
        <div className="card rounded-2xl p-5 space-y-3 lg:col-span-1">
          <h2 className="text-sm font-bold text-white text-right">פרטי הנכס</h2>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>סוג נכס</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="dark-input w-full px-3 py-2 text-sm">
              {PROP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>חדרים</label>
              <input type="number" value={form.rooms} onChange={e => set('rooms', e.target.value)}
                placeholder="4" min="1" max="10"
                className="dark-input w-full px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>מ"ר</label>
              <input type="number" value={form.sqm} onChange={e => set('sqm', e.target.value)}
                placeholder="120"
                className="dark-input w-full px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>מחיר (₪) *</label>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)}
                placeholder="2500000"
                className="dark-input w-full px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>קומה</label>
              <input value={form.floor} onChange={e => set('floor', e.target.value)}
                placeholder="3"
                className="dark-input w-full px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>אזור / שכונה *</label>
            <input value={form.area} onChange={e => set('area', e.target.value)}
              placeholder="תל אביב — פלורנטין"
              className="dark-input w-full px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right" style={{ color: '#64748b' }}>תכונה מיוחדת</label>
            <input value={form.feature} onChange={e => set('feature', e.target.value)}
              placeholder="נוף לים, מרפסת גדולה, חניה..."
              className="dark-input w-full px-3 py-2 text-sm" />
          </div>

          <button onClick={generate}
            disabled={!form.area || !form.price || loading}
            className="w-full text-sm font-bold py-3 rounded-xl disabled:opacity-40 transition-all"
            style={{
              background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#8b5cf6,#ec4899)',
              color: 'white',
              boxShadow: loading ? 'none' : '0 0 20px rgba(139,92,246,0.4)',
            }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                יוצר 3 וריאציות...
              </span>
            ) : '✨ צור 3 פוסטים שיווקיים'}
          </button>

          {error && (
            <div className="text-xs px-3 py-2 rounded-xl text-right"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Result — takes 2/3 on lg */}
        <div className="lg:col-span-2 grid md:grid-cols-3 gap-3">
          {VARIANTS.map(v => (
            <VariationCard
              key={v.key}
              variant={v}
              content={variations[v.key]}
              loading={loading}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
