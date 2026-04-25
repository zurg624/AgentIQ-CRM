import { useState, useRef, useEffect } from 'react';
import api from '../api';

const GREETING = 'שלום! אני AgentIQ 🤖 — העוזר החכם שלך לנדל"ן ישראלי.\n\nשאל אותי על:\n• מס רכישה ועלויות עסקה\n• משכנתאות וריביות\n• תשואה על השקעות\n• אזורים ומחירי שוק\n• אסטרטגיית מו"מ';

const SUGGESTIONS = [
  'מה מס הרכישה על דירה ב-3M?',
  'כמה משכנתא אוכל לקחת?',
  'מה תשואה טובה להשקעה?',
  'אזורים טובים להשקעה ב-2025?',
];

export default function ChatbotPage() {
  const [messages, setMessages] = useState([{ role: 'ai', text: GREETING }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const { reply } = await api.chat(msg);
      setMessages(prev => [...prev, { role: 'ai', text: reply }]);
    } catch (err) {
      console.error('[AgentIQ] chat error:', err);
      setMessages(prev => [...prev, { role: 'ai', text: 'שגיאת חיבור — נסה שוב.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>🤖</div>
          <div>
            <h1 className="text-lg font-bold text-white">AgentIQ Chat</h1>
            <p className="text-xs" style={{ color: '#10b981' }}>● מחובר ומוכן</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            {m.role === 'ai' && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ml-2 mt-1"
                style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>🤖</div>
            )}
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
              style={m.role === 'ai'
                ? { background: '#1a2035', color: '#e2e8f0', borderRadius: '4px 16px 16px 16px' }
                : { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white', borderRadius: '16px 4px 16px 16px' }
              }>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm ml-2"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>🤖</div>
            <div className="rounded-2xl px-4 py-3" style={{ background: '#1a2035', borderRadius: '4px 16px 16px 16px' }}>
              <div className="flex gap-1.5 items-center">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: '#3b82f6', animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 md:px-6 pb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 md:px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="שאל שאלה מקצועית בנדל&quot;ן..."
            className="flex-1 dark-input px-4 py-3 text-sm"
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="btn-gradient px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40">
            שלח
          </button>
        </div>
      </div>
    </div>
  );
}
