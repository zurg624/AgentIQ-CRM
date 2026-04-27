import { useState, useEffect } from 'react';
import api from '../api';
import CustomFieldsManager from '../components/CustomFieldsManager';

function Section({ title, children }) {
  return (
    <div className="card rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-bold text-white text-right">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1.5 text-right" style={{ color: '#94a3b8' }}>{label}</label>
      {children}
      {hint && <p className="text-[10px] mt-1 text-right" style={{ color: '#475569' }}>{hint}</p>}
    </div>
  );
}

export default function SettingsPage({ settings, onSettingsChange, user }) {
  const [form,    setForm]    = useState({ system_name: 'AgentIQ', vat_pct: '17', brokerage_pct: '2', lawyer_pct: '0.5' });
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');
  const [confirm, setConfirm] = useState('');
  const [ingestedProps, setIngestedProps] = useState([]);
  const [loadingProps,  setLoadingProps]  = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [keyCopied,     setKeyCopied]     = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(prev => ({ ...prev, ...settings }));
    }
  }, [settings]);

  const loadIngestedProps = () => {
    setLoadingProps(true);
    api.getIngestedProperties()
      .then(setIngestedProps)
      .catch(() => setIngestedProps([]))
      .finally(() => setLoadingProps(false));
  };

  useEffect(() => {
    if (user?.role === 'admin') loadIngestedProps();
  }, [user]);

  const handleCopyKey = () => {
    const key = settings?.ingest_api_key || '';
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    });
  };

  const handleTestWebhook = async () => {
    setTesting(true);
    try {
      await api.ingestTest();
      showToast('✅ נכס בדיקה נשלח — בדוק את ה-Notifications');
      setTimeout(loadIngestedProps, 1500);
    } catch (err) {
      showToast('❌ שגיאה: ' + err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateSettings(form);
      onSettingsChange?.(updated);
      showToast('✅ ההגדרות נשמרו בהצלחה!');
    } catch (err) {
      showToast('❌ שגיאה בשמירה: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirm !== 'אני מאשר') return;
    try {
      await api.resetSystem();
      setConfirm('');
      showToast('🗑️ כל הלידים נמחקו');
    } catch (err) {
      showToast('❌ שגיאה: ' + err.message, 'error');
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto" dir="rtl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white">⚙️ הגדרות מערכת</h1>
        <p className="text-xs mt-1" style={{ color: '#64748b' }}>White-labeling, ברירות מחדל, וניהול מערכת</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5 max-w-4xl">

        {/* ── Branding ── */}
        <Section title="🏷️ מיתוג ו-White Label">
          <Field label="שם המערכת" hint="ישתקף בממשק ובדוחות">
            <input value={form.system_name} onChange={e => set('system_name', e.target.value)}
              className="dark-input w-full px-3 py-2.5 text-sm rounded-xl" placeholder="AgentIQ" />
          </Field>

          {/* Live preview */}
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000' }}>
              {(form.system_name || 'A')[0].toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: '#fbbf24' }}>{form.system_name || 'AgentIQ'}</div>
              <div className="text-[10px]" style={{ color: '#475569' }}>תצוגה מקדימה</div>
            </div>
          </div>
        </Section>

        {/* ── Calculator defaults ── */}
        <Section title="💰 ברירות מחדל למחשבון">
          <Field label='מע"מ (%)' hint="יחול על עמלות תיווך ועו&quot;ד">
            <input type="number" value={form.vat_pct} onChange={e => set('vat_pct', e.target.value)}
              className="dark-input w-full px-3 py-2.5 text-sm rounded-xl" min="0" max="30" step="0.5" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="עמלת תיווך (%)">
              <input type="number" value={form.brokerage_pct} onChange={e => set('brokerage_pct', e.target.value)}
                className="dark-input w-full px-3 py-2.5 text-sm rounded-xl" min="0" max="5" step="0.25" />
            </Field>
            <Field label='שכ"ט עו"ד (%)'>
              <input type="number" value={form.lawyer_pct} onChange={e => set('lawyer_pct', e.target.value)}
                className="dark-input w-full px-3 py-2.5 text-sm rounded-xl" min="0" max="3" step="0.1" />
            </Field>
          </div>

          {/* Summary */}
          <div className="gold-box rounded-xl p-3 text-xs space-y-1 text-right">
            {[
              ['מע"מ', `${form.vat_pct}%`],
              ['תיווך', `${form.brokerage_pct}%`],
              ['עו"ד', `${form.lawyer_pct}%`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span style={{ color: '#fbbf24' }}>{v}</span>
                <span style={{ color: '#64748b' }}>{k}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Account info ── */}
        <Section title="👤 פרטי חשבון">
          <div className="space-y-2.5 text-sm">
            {[
              ['שם תצוגה', user?.display_name || '—'],
              ['שם משתמש', user?.username || '—'],
              ['הרשאה', user?.role === 'admin' ? '🔑 מנהל' : '👤 סוכן'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: user?.role === 'admin' && k === 'הרשאה' ? '#fbbf24' : '#e2e8f0' }}>{v}</span>
                <span style={{ color: '#475569' }}>{k}</span>
              </div>
            ))}
          </div>
          {!isAdmin && (
            <p className="text-xs text-right" style={{ color: '#475569' }}>
              פנה למנהל לשינוי הגדרות מתקדמות
            </p>
          )}
        </Section>

        {/* ── Custom Fields (admin only) ── */}
        {isAdmin && (
          <Section title="🧩 שדות מותאמים אישית">
            <p className="text-xs text-right mb-2" style={{ color: '#94a3b8' }}>
              הגדר שדות נוספים שיופיעו בכרטיס כל ליד. למשל: "כיתת ילד", "תקציב משכנתא", "מצב משפחתי".
              סוכנים יראו את השדות בכרטיס הליד ויוכלו למלא אותם.
            </p>
            <CustomFieldsManager />
          </Section>
        )}

        {/* ── Danger zone (admin only) ── */}
        {isAdmin && (
          <Section title="⚠️ אזור מסוכן">
            <p className="text-xs text-right" style={{ color: '#94a3b8' }}>
              מחיקת כל הלידים היא בלתי הפיכה. לאישור הקלד <strong style={{ color: '#f87171' }}>אני מאשר</strong> בשדה למטה.
            </p>
            <input value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder='הקלד "אני מאשר" לאישור'
              className="dark-input w-full px-3 py-2.5 text-sm rounded-xl"
              style={{ borderColor: confirm === 'אני מאשר' ? '#ef4444' : undefined }} />
            <button onClick={handleReset}
              disabled={confirm !== 'אני מאשר'}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: confirm === 'אני מאשר' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                color: confirm === 'אני מאשר' ? '#f87171' : '#475569',
                border: `1px solid ${confirm === 'אני מאשר' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
              }}>
              🗑️ מחק את כל הלידים
            </button>
          </Section>
        )}
        {/* ── API Integrations (admin only, full width) ── */}
        {isAdmin && (
          <div className="md:col-span-2">
            <Section title="🔌 API Integrations — Lead Ingestion Engine">
              <p className="text-xs text-right" style={{ color: '#94a3b8' }}>
                שלח נכסים ממקורות חיצוניים (אתרים, scrapers, שותפים) ישירות למערכת.
                המערכת תבצע התאמה אוטומטית ותשלח התראה לסוכן הרלוונטי.
              </p>

              {/* Apify endpoint (highlighted) */}
              <Field label="🎯 Apify HTTP Integration URL" hint='הדבק URL זה ב-Apify → Actor → Integrations → HTTP → URL'>
                <div className="flex gap-2">
                  <input readOnly value="https://agentiq-crm.onrender.com/api/ingest/apify"
                    className="dark-input flex-1 px-3 py-2 text-xs rounded-xl font-mono"
                    style={{ color: '#34d399' }} />
                  <button
                    onClick={() => { navigator.clipboard.writeText('https://agentiq-crm.onrender.com/api/ingest/apify'); showToast('✅ Apify URL הועתק'); }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                    העתק
                  </button>
                </div>
              </Field>

              {/* Apify integration steps */}
              <div className="rounded-xl p-3 text-xs space-y-1.5 text-right"
                style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
                <p className="font-semibold" style={{ color: '#34d399' }}>⚙️ הגדרת Apify — 3 שלבים:</p>
                <p style={{ color: '#94a3b8' }}>1. Actor → Integrations → <strong style={{color:'#e2e8f0'}}>HTTP Integration</strong></p>
                <p style={{ color: '#94a3b8' }}>2. URL: העתק את ה-URL הירוק למעלה</p>
                <p style={{ color: '#94a3b8' }}>3. Payload format: <strong style={{color:'#e2e8f0'}}>Dataset: JSON</strong> (לא Webhook)</p>
                <p className="pt-1 text-[10px]" style={{ color: '#475569' }}>
                  ✓ לא נדרש API key עבור Apify · פורמט שדות גמיש (title/name, price/askingPrice, city/location…)
                </p>
              </div>

              {/* General endpoint */}
              <Field label="Webhook URL (כללי)" hint="לשותפים ו-scrapers — שלח x-api-key בהדר">
                <div className="flex gap-2">
                  <input readOnly value="https://agentiq-crm.onrender.com/api/ingest/property"
                    className="dark-input flex-1 px-3 py-2 text-xs rounded-xl font-mono"
                    style={{ color: '#a5b4fc' }} />
                  <button
                    onClick={() => { navigator.clipboard.writeText('https://agentiq-crm.onrender.com/api/ingest/property'); showToast('✅ URL הועתק'); }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                    העתק
                  </button>
                </div>
              </Field>

              {/* API Key */}
              <Field label="מפתח API" hint="אפשר גם להגדיר INGEST_API_KEY כ-env var ב-Render">
                <div className="flex gap-2">
                  <input readOnly
                    value={settings?.ingest_api_key ? '••••••••••••' + (settings.ingest_api_key.slice(-6)) : 'טוען...'}
                    className="dark-input flex-1 px-3 py-2 text-xs rounded-xl font-mono"
                    style={{ color: '#fbbf24', letterSpacing: '0.08em' }} />
                  <button onClick={handleCopyKey}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all min-w-[70px]"
                    style={keyCopied
                      ? { background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
                      : { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }
                    }>
                    {keyCopied ? '✓ הועתק' : '📋 העתק'}
                  </button>
                </div>
              </Field>

              {/* Payload example */}
              <Field label="פורמט ה-Payload (JSON) — single property">
                <pre className="text-[10px] p-3 rounded-xl overflow-x-auto text-left"
                  style={{ background: 'rgba(0,0,0,0.4)', color: '#7dd3fc', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace', direction: 'ltr' }}>
{`// Single object OR array — both accepted:
[
  {
    "title":   "דירה 4 חדרים, קרוב לים",
    "price":   2500000,
    "city":    "תל אביב",
    "area":    "פלורנטין",
    "type":    "דירה",
    "rooms":   4,
    "sqm":     110,
    "url":     "https://...",
    "source":  "Yad2"
  }
]`}
                </pre>
              </Field>

              {/* Test + Recent */}
              <div className="flex items-center gap-3">
                <button onClick={handleTestWebhook} disabled={testing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.1))', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
                  {testing
                    ? <><span className="w-4 h-4 border-2 border-yellow-600/30 border-t-yellow-400 rounded-full animate-spin" /> שולח...</>
                    : '🧪 שלח נכס בדיקה'}
                </button>
                <button onClick={loadIngestedProps} disabled={loadingProps}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.07)' }}>
                  🔄 רענן
                </button>
              </div>

              {/* Recent ingested properties */}
              {ingestedProps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2 text-right" style={{ color: '#64748b' }}>
                    נכסים שנקלטו לאחרונה ({ingestedProps.length})
                  </p>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                    <table className="w-full text-xs" dir="rtl">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          {['כותרת', 'עיר', 'מחיר', 'מקור', 'תאריך'].map(h => (
                            <th key={h} className="text-right px-3 py-2 font-semibold" style={{ color: '#64748b' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ingestedProps.slice(0, 10).map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td className="px-3 py-2 text-white max-w-[160px] truncate">{p.title}</td>
                            <td className="px-3 py-2" style={{ color: '#a5b4fc' }}>{p.city || '—'}</td>
                            <td className="px-3 py-2" style={{ color: '#fbbf24' }}>
                              {p.price ? `₪${(p.price/1_000_000).toFixed(1)}M` : '—'}
                            </td>
                            <td className="px-3 py-2" style={{ color: '#64748b' }}>{p.source}</td>
                            <td className="px-3 py-2" style={{ color: '#334155' }}>
                              {p.ingested_at ? new Date(p.ingested_at + 'Z').toLocaleDateString('he-IL') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {ingestedProps.length === 0 && !loadingProps && (
                <div className="py-6 text-center" style={{ color: '#334155' }}>
                  <div className="text-2xl mb-1">📭</div>
                  <p className="text-xs">אין נכסים שנקלטו עדיין. לחץ "שלח נכס בדיקה" כדי לבדוק.</p>
                </div>
              )}
            </Section>
          </div>
        )}

      </div>

      {/* Save button */}
      {isAdmin && (
        <div className="mt-5 max-w-4xl">
          <button onClick={handleSave} disabled={saving}
            className="btn-gradient px-8 py-3 rounded-xl text-sm font-bold disabled:opacity-60">
            {saving
              ? <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  שומר...
                </span>
              : '💾 שמור הגדרות'}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl"
          style={{
            background: toast.type === 'error' ? 'rgba(239,68,68,0.9)' : 'rgba(16,185,129,0.9)',
            color: 'white', backdropFilter: 'blur(8px)',
          }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
