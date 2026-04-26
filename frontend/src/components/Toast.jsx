const SOURCE_ICONS = { WhatsApp: '💬', Facebook: '📘', Yad2: '🏠', Manual: '✍️' };

// Wrapper: sits above mobile bottom nav on phones, bottom-6 on desktop
function ToastWrap({ children }) {
  return (
    <div className="toast-container fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[calc(100vw-32px)] md:w-auto"
      dir="rtl" style={{ animation: 'fadeSlideUp 0.35s ease both' }}>
      {children}
    </div>
  );
}

export default function Toast({ lead, onClose }) {
  if (lead?._isMatch) {
    return (
      <ToastWrap>
        <div className="rounded-2xl px-4 py-4 flex items-center gap-3 w-full md:min-w-[300px] md:max-w-[420px]"
          style={{ background: 'rgba(10,13,28,0.98)', border: '1px solid rgba(245,158,11,0.45)', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 24px rgba(245,158,11,0.25)', backdropFilter: 'blur(20px)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.25),rgba(245,158,11,0.12))', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)' }}>
            {lead.score}%
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold mb-0.5" style={{ color: '#fbbf24' }}>🏠 התאמה חדשה נמצאה!</div>
            <div className="text-sm font-semibold text-white truncate">{lead.message?.replace('🏠 ', '')}</div>
          </div>
          <button onClick={onClose} className="tap-sm flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: '#475569', background: 'rgba(255,255,255,0.05)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </ToastWrap>
    );
  }

  return (
    <ToastWrap>
      <div className="rounded-2xl shadow-2xl px-4 py-4 flex items-start gap-3 w-full md:min-w-[320px] md:max-w-[420px]"
        style={{ background: 'rgba(10,13,28,0.98)', border: '1px solid rgba(52,211,153,0.35)', boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 24px rgba(52,211,153,0.18)', backdropFilter: 'blur(20px)' }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 0 12px rgba(16,185,129,0.4)' }}>
          {lead.name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#34d399' }}>ליד חדש</span>
            <span className="text-[10px]" style={{ color: '#475569' }}>{SOURCE_ICONS[lead.source] ?? '📩'} {lead.source}</span>
          </div>
          <div className="font-semibold text-sm text-white truncate">{lead.name}</div>
          {lead.message && <div className="text-xs truncate mt-0.5" style={{ color: '#64748b' }}>{lead.message}</div>}
          {lead.ai_summary && <div className="text-xs mt-1 line-clamp-2" style={{ color: '#34d399' }}>✨ {lead.ai_summary.split('\n')[0]}</div>}
        </div>
        <button onClick={onClose} className="tap-sm flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ color: '#475569', background: 'rgba(255,255,255,0.05)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </ToastWrap>
  );
}
