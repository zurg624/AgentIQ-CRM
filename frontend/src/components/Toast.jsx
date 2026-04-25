const SOURCE_ICONS = { WhatsApp: '💬', Facebook: '📘', Yad2: '🏠', Manual: '✍️' };

export default function Toast({ lead, onClose }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-start gap-4 min-w-[320px] max-w-[420px]">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {lead.name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">ליד חדש</span>
            <span className="text-xs text-slate-400">{SOURCE_ICONS[lead.source] ?? '📩'} {lead.source}</span>
          </div>
          <div className="font-semibold text-sm truncate">{lead.name}</div>
          {lead.message && (
            <div className="text-xs text-slate-400 truncate mt-0.5">{lead.message}</div>
          )}
          {lead.ai_summary && (
            <div className="text-xs text-emerald-300 mt-1 line-clamp-2">✨ {lead.ai_summary.split('\n')[0]}</div>
          )}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
