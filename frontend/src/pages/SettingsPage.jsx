import { useState, useEffect } from 'react';
import api from '../api';

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

  useEffect(() => {
    if (settings) {
      setForm(prev => ({ ...prev, ...settings }));
    }
  }, [settings]);

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
