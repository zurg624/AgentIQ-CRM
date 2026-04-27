import { useState, useEffect } from 'react';
import { useLang } from '../i18n';
import CustomFieldInput from './CustomFieldInput';

const STATUS_STYLES = {
  'New':               'badge-new',
  'Contacted':         'badge-contact',
  'Meeting Scheduled': 'badge-meeting',
  'Closed':            'badge-closed',
};

const NEXT_ACTION_KEYS = {
  'New': 'next_action_new',
  'Contacted': 'next_action_contacted',
  'Meeting Scheduled': 'next_action_meeting',
  'Closed': 'next_action_closed',
};

const NEXT_BG = {
  'New':               'rgba(59,130,246,0.2)',
  'Contacted':         'rgba(245,158,11,0.2)',
  'Meeting Scheduled': 'rgba(139,92,246,0.2)',
  'Closed':            'rgba(16,185,129,0.2)',
};
const NEXT_COLOR = {
  'New':               '#93c5fd',
  'Contacted':         '#fbbf24',
  'Meeting Scheduled': '#c4b5fd',
  'Closed':            '#6ee7b7',
};

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#475569' }}>{label}</dt>
      <dd className="text-sm" style={{ color: '#e2e8f0' }}>{children || '—'}</dd>
    </div>
  );
}

export default function LeadDetailPanel({ lead, agents, onClose, onAssignAgent, onChangeStatus, customFieldDefs = [], onSaveCustomFields }) {
  const { t, dir } = useLang();

  // Local edit buffer for custom fields — keeps the UI snappy and only
  // persists on "save" click (avoids one PUT per keystroke).
  const [cfDraft, setCfDraft] = useState({});
  const [cfDirty, setCfDirty] = useState(false);
  const [cfSaving, setCfSaving] = useState(false);

  useEffect(() => {
    setCfDraft(lead?.custom_fields || {});
    setCfDirty(false);
  }, [lead?.id, lead?.custom_fields]);

  if (!lead) return null;

  const setCf = (key, value) => {
    setCfDraft(prev => ({ ...prev, [key]: value }));
    setCfDirty(true);
  };

  const saveCustomFields = async () => {
    if (!onSaveCustomFields) return;
    setCfSaving(true);
    try {
      await onSaveCustomFields(lead.id, cfDraft);
      setCfDirty(false);
    } finally {
      setCfSaving(false);
    }
  };

  const formattedDate = lead.created_at
    ? new Date(lead.created_at + (lead.created_at.endsWith('Z') ? '' : 'Z'))
        .toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const nextKey = NEXT_ACTION_KEYS[lead.status] ?? 'next_action_new';
  const panelSide = dir === 'rtl' ? 'left-0' : 'right-0';

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose} />

      <aside className={`fixed ${panelSide} top-0 h-full w-[420px] z-50 flex flex-col overflow-hidden`}
        style={{ background: '#0f1425', borderLeft: '1px solid rgba(255,255,255,0.08)', boxShadow: '-8px 0 40px rgba(0,0,0,0.5)' }}
        dir={dir}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
              {lead.name?.charAt(0)}
            </div>
            <div>
              <h2 className="font-semibold text-white text-base">{lead.name}</h2>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[lead.status] ?? 'badge-new'}`}>
                {lead.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors"
            style={{ color: '#475569' }}
            onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.color = '#475569'}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Next action banner */}
        <div className="px-6 py-3 flex items-center gap-3"
          style={{ background: NEXT_BG[lead.status] ?? NEXT_BG.New, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-lg">⚡</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70"
              style={{ color: NEXT_COLOR[lead.status] ?? NEXT_COLOR.New }}>{t('next_action')}</div>
            <div className="text-sm font-medium"
              style={{ color: NEXT_COLOR[lead.status] ?? NEXT_COLOR.New }}>{t(nextKey)}</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#334155' }}>{t('contact_info')}</h3>
            <dl className="space-y-3">
              <Field label={t('phone')}><span className="font-mono">{lead.phone}</span></Field>
              <Field label={t('source')}>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>{lead.source}</span>
              </Field>
              <Field label={t('added')}>{formattedDate}</Field>
            </dl>
          </section>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#334155' }}>{t('message_request')}</h3>
            <p className="text-sm leading-relaxed rounded-xl p-3"
              style={{ background: '#0d1220', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.06)' }}>
              {lead.message || <span style={{ color: '#334155', fontStyle: 'italic' }}>{t('no_message')}</span>}
            </p>
          </section>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#334155' }}>{t('ai_summary')}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd' }}>✨ AI</span>
            </div>
            {lead.ai_summary ? (
              <p className="text-sm leading-relaxed rounded-xl p-3 whitespace-pre-wrap"
                style={{ background: 'rgba(139,92,246,0.08)', color: '#ddd6fe', border: '1px solid rgba(139,92,246,0.2)' }}>
                {lead.ai_summary}
              </p>
            ) : (
              <div className="text-sm italic rounded-xl p-3"
                style={{ background: '#0d1220', color: '#334155', border: '1px dashed rgba(255,255,255,0.08)' }}>
                {t('ai_summary_empty')}
              </div>
            )}
          </section>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#334155' }}>{t('assignment')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#64748b' }}>{t('assigned_agent')}</label>
                <select value={lead.agent_id ?? ''} onChange={e => onAssignAgent(lead.id, parseInt(e.target.value))}
                  className="dark-input w-full px-3 py-2 text-sm">
                  <option value="">{t('unassigned')}</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#64748b' }}>{t('status')}</label>
                <select value={lead.status} onChange={e => onChangeStatus(lead.id, e.target.value)}
                  className="dark-input w-full px-3 py-2 text-sm">
                  {['New','Contacted','Meeting Scheduled','Closed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ── Custom fields ── */}
          {customFieldDefs.length > 0 && (
            <>
              <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#334155' }}>
                    שדות מותאמים אישית
                  </h3>
                  {cfDirty && (
                    <button onClick={saveCustomFields} disabled={cfSaving}
                      className="text-[11px] font-bold px-3 py-1 rounded-lg disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }}>
                      {cfSaving ? 'שומר...' : '💾 שמור'}
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {customFieldDefs.map(def => (
                    <CustomFieldInput
                      key={def.id}
                      def={def}
                      value={cfDraft[def.field_key]}
                      onChange={v => setCf(def.field_key, v)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex gap-2">
            <a href={`tel:${lead.phone}`}
              className="flex-1 btn-gradient text-white text-sm font-medium py-2.5 rounded-xl text-center block">
              {t('call_lead')}
            </a>
            <a href={`https://wa.me/${lead.phone?.replace(/\D/g,'')}`}
              target="_blank" rel="noreferrer"
              className="flex-1 text-sm font-medium py-2.5 rounded-xl text-center block transition-colors"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
              {t('whatsapp')}
            </a>
          </div>
          {lead.agent_name && (
            <a href={`https://wa.me/?text=${encodeURIComponent(`📋 ${lead.name} | ${lead.phone} | ${lead.source}\n${lead.message ?? ''}`)}`}
              target="_blank" rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-xl transition-colors block"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>
              {t('share_agent_wa')}
            </a>
          )}
        </div>
      </aside>
    </>
  );
}
