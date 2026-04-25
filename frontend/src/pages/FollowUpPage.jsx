const SOURCE_ICONS = { WhatsApp: '💬', Facebook: '📘', Yad2: '🏠', Manual: '✍️' };

export default function FollowUpPage({ leads, agents, onAssignAgent, onChangeStatus, onSelectLead }) {
  const now = Date.now();
  const stale = leads.filter(l => {
    if (l.status === 'Closed') return false;
    const created = new Date(l.created_at + (l.created_at?.endsWith('Z') ? '' : 'Z')).getTime();
    return (now - created) > 24 * 60 * 60 * 1000;
  }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const hoursAgo = (dateStr) => {
    const ms = now - new Date(dateStr + (dateStr?.endsWith('Z') ? '' : 'Z')).getTime();
    const h = Math.floor(ms / 3600000);
    return h >= 24 ? `${Math.floor(h / 24)}י'` : `${h}ש'`;
  };

  return (
    <div className="flex-1 px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">🔄 Follow-Up אוטומטי</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>לידים שלא נוצר עמם קשר ב-24 שעות האחרונות</p>
      </div>

      {stale.length === 0 ? (
        <div className="card rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <div className="text-lg font-semibold text-white mb-1">כל הלידים טופלו!</div>
          <div className="text-sm" style={{ color: '#64748b' }}>אין לידים ממתינים לטיפול</div>
        </div>
      ) : (
        <div className="space-y-3">
          {stale.map(lead => {
            const urgency = (() => {
              const h = Math.floor((now - new Date(lead.created_at + (lead.created_at?.endsWith('Z') ? '' : 'Z')).getTime()) / 3600000);
              if (h > 72) return { label: 'דחוף מאוד', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
              if (h > 48) return { label: 'דחוף', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
              return { label: 'ממתין', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' };
            })();

            return (
              <div key={lead.id} className="card rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-colors"
                style={{ '--hover-bg': 'rgba(255,255,255,0.03)' }}
                onClick={() => onSelectLead(lead)}>
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
                  {lead.name?.charAt(0)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">{lead.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: urgency.bg, color: urgency.color }}>{urgency.label}</span>
                  </div>
                  <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: '#64748b' }}>
                    <span>{SOURCE_ICONS[lead.source]} {lead.source}</span>
                    {lead.phone && <span>📞 {lead.phone}</span>}
                    <span>⏱ {hoursAgo(lead.created_at)} ללא מענה</span>
                  </div>
                  {lead.message && (
                    <div className="text-xs mt-1 truncate" style={{ color: '#475569' }}>{lead.message}</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <a href={`tel:${lead.phone}`}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium text-center block"
                    style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}>
                    📞 התקשר
                  </a>
                  <a href={`https://wa.me/${lead.phone?.replace(/\D/g, '')}?text=${encodeURIComponent('שלום ' + lead.name + ', אני מסוכנות נדל"ן ורציתי לחזור אליך.')}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg font-medium text-center block"
                    style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>
                    💬 WA
                  </a>
                  <button onClick={() => onChangeStatus(lead.id, 'Contacted')}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                    ✓ טופל
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stale.length > 0 && (
        <div className="mt-4 text-xs text-center" style={{ color: '#475569' }}>
          {stale.length} לידים ממתינים לטיפול
        </div>
      )}
    </div>
  );
}
