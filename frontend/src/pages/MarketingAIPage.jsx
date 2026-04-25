import { useState, useRef } from 'react';
import api from '../api';

const PROP_TYPES = ['דירה', 'פנטהאוז', 'קוטג\'', 'דירת גן', 'בית פרטי', 'נכס מסחרי'];

export default function MarketingAIPage() {
  const [form, setForm] = useState({ type: 'דירה', rooms: '4', area: '', price: '', feature: '' });
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const generate = async () => {
    if (!form.area || !form.price) return;
    setLoading(true);
    setResult('');
    const prompt = `כתוב פוסט שיווקי לפייסבוק עבור נכס הנדל"ן הבא (עברית, מקצועי, עם אמוג'י, מושך, 150-200 מילים, כולל CTA):
סוג: ${form.type}
חדרים: ${form.rooms}
אזור: ${form.area}
מחיר: ₪${Number(form.price).toLocaleString()}
תכונה מיוחדת: ${form.feature || 'לא צוין'}

הפוסט צריך: כותרת נוצצת, תיאור הנכס, יתרונות המיקום, CTA ברור.`;

    try {
      const { reply } = await api.chat(prompt);
      setResult(reply);
    } catch (err) {
      console.error('[AgentIQ] marketing AI error:', err);
      setResult('שגיאה בחיבור — נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">📣 שיווק AI</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>צור תוכן שיווקי מקצועי לפייסבוק בשניות</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white mb-2">פרטי הנכס</h2>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>סוג נכס</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="dark-input w-full px-3 py-2.5 text-sm">
              {PROP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>חדרים</label>
              <input type="number" value={form.rooms} onChange={e => set('rooms', e.target.value)}
                placeholder="4" min="1" max="10"
                className="dark-input w-full px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>מחיר (₪)</label>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)}
                placeholder="2500000"
                className="dark-input w-full px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>אזור / שכונה</label>
            <input value={form.area} onChange={e => set('area', e.target.value)}
              placeholder="תל אביב — פלורנטין"
              className="dark-input w-full px-3 py-2.5 text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>תכונה מיוחדת (אופציונלי)</label>
            <input value={form.feature} onChange={e => set('feature', e.target.value)}
              placeholder="נוף לים, מרפסת גדולה, חניה כפולה..."
              className="dark-input w-full px-3 py-2.5 text-sm" />
          </div>

          <button onClick={generate} disabled={!form.area || !form.price || loading}
            className="btn-gradient w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                יוצר פוסט...
              </span>
            ) : '✨ צור פוסט AI'}
          </button>
        </div>

        {/* Result */}
        <div className="card rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">📱 פוסט מוכן לפרסום</h2>
            {result && (
              <button onClick={copy}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={{ background: copied ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)', color: copied ? '#34d399' : '#94a3b8' }}>
                {copied ? '✓ הועתק!' : '📋 העתק'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl mb-3 animate-bounce">✨</div>
                <div className="text-sm" style={{ color: '#64748b' }}>AI יוצר פוסט...</div>
              </div>
            </div>
          ) : result ? (
            <div className="flex-1 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto"
              style={{ background: '#0d1220', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.07)' }}>
              {result}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center rounded-xl"
              style={{ background: '#0d1220', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <div className="text-center px-6">
                <div className="text-4xl mb-3">📝</div>
                <div className="text-sm font-medium text-white mb-1">הפוסט יופיע כאן</div>
                <div className="text-xs" style={{ color: '#475569' }}>מלא את פרטי הנכס ולחץ "צור פוסט AI"</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
