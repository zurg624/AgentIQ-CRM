import { useLang } from '../i18n';

const STATUS_STYLES = {
  'New':               'badge-new',
  'Contacted':         'badge-contact',
  'Meeting Scheduled': 'badge-meeting',
  'Closed':            'badge-closed',
};

const SOURCE_ICONS = { Yad2: '🏠', Facebook: '📘', WhatsApp: '💬', Manual: '✍️' };

export default function LeadsTable({ leads, agents, onAssignAgent, onChangeStatus, onSelectLead }) {
  const { t } = useLang();

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <h2 className="text-base font-semibold text-white">{t('all_leads')}</h2>
        <button className="btn-gradient text-sm font-medium px-4 py-2 rounded-lg">
          {t('add_lead')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {[t('col_name'), t('col_phone'), t('col_source'), t('col_agent'), t('col_status'), ''].map((h, i) => (
                <th key={i} className="text-right px-6 py-3 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: '#475569' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id} className="tr-hover cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                onClick={() => onSelectLead(lead)}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
                      {lead.name?.charAt(0)}
                    </div>
                    <span className="font-medium text-white">{lead.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-mono text-xs" style={{ color: '#64748b' }}>{lead.phone}</td>
                <td className="px-6 py-4">
                  <span className="text-sm">{SOURCE_ICONS[lead.source] ?? '📩'} <span style={{ color: '#94a3b8' }}>{lead.source}</span></span>
                </td>
                <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                  <select value={lead.agent_id ?? ''} onChange={e => onAssignAgent(lead.id, parseInt(e.target.value))}
                    className="text-xs px-3 py-1.5 rounded-lg cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <option value="">{t('unassigned')}</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </td>
                <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                  <select value={lead.status} onChange={e => onChangeStatus(lead.id, e.target.value)}
                    className={`text-xs font-medium border-0 rounded-full px-3 py-1 cursor-pointer focus:outline-none ${STATUS_STYLES[lead.status] ?? 'badge-new'}`}>
                    {['New','Contacted','Meeting Scheduled','Closed'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-6 py-4 text-right" style={{ color: '#334155' }}>›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#334155' }}>
        {t('showing_leads', { n: leads.length })}
      </div>
    </div>
  );
}
