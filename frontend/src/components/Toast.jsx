const SOURCE_ICONS = { WhatsApp: '💬', Facebook: '📘', Yad2: '🏠', Manual: '✍️' };

export default function Toast({ lead, onClose }) {
  // Match notification toast
  if (lead?._isMatch) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]" dir="rtl"
        style={{ animation: 'fadeSlideUp 0.35s ease both' }}>
        <div className="rounded-2xl px-5 py-4 flex items-center gap-3 min-w-[300px] max-w-[420px]"
          style={{ background: 'rgba(10,13,28,0.97)', border: '1px solid rgba(245,158,11,0.4)', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 20px rgba(245,158,11,0.2)', backdropFilter: 'blur(16px)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.1))', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
            {lead.score}%
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold mb-0.5" style={{ color: '#fbbf24' }}>🏠 התאמה חדשה נמצאה!</div>
            <div className="text-xs font-semibold text-white truncate">{lead.message?.replace('🏠 ', '')}</div>
          </div>
          <button onClick={onClose} style={{ color: '#475569' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]" dir="rtl"
      style={{ animation: 'fadeSlideUp 0.35s ease both' }}>
      <div className="rounded-2xl shadow-2xl px-5 py-4 flex items-start gap-4 min-w-[320px] max-w-[420px]"
        style={{ background: 'rgba(10,13,28,0.97)', border: '1px solid rgba(52,211,153,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 20px rgba(52,211,153,0.15)', backdropFilter: 'blur(16px)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
          {lead.name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#34d399' }}>ליד חדש</span>
            <span className="text-[10px]" style={{ color: '#475569' }}>{SOURCE_ICONS[lead.source] ?? '📩'} {lead.source}</span>
          </div>
          <div className="font-semibold text-sm text-white truncate">{lead.name}</div>
          {lead.message && <div className="text-xs truncate mt-0.5" style={{ color: '#64748b' }}>{lead.message}</div>}
          {lead.ai_summary && <div className="text-xs mt-1 line-clamp-2" style={{ color: '#34d399' }}>✨ {lead.ai_summary.split('\n')[0]}</div>}
        </div>
        <button onClick={onClose} style={{ color: '#475569' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
