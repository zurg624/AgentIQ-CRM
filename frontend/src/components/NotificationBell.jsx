import { useState, useEffect, useRef } from 'react';
import api from '../api';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts + 'Z')) / 1000);
  if (s < 60)   return 'עכשיו';
  if (s < 3600) return `לפני ${Math.floor(s/60)} דק'`;
  if (s < 86400) return `לפני ${Math.floor(s/3600)} שע'`;
  return `לפני ${Math.floor(s/86400)} ימים`;
}

export default function NotificationBell({ notifications, onMarkRead, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const ref  = useRef(null);

  const unread = notifications.filter(n => !n.read).length;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative" dir="rtl">
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-xl transition-all"
        style={{
          background: open ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${open ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.08)'}`,
        }}
        title="התראות"
      >
        <span className="text-base" style={{ filter: unread > 0 ? 'drop-shadow(0 0 6px #f59e0b)' : 'none' }}>
          🔔
        </span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[9px] font-black flex items-center justify-center px-1"
            style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)', color: 'white', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-80 rounded-2xl z-50 overflow-hidden fade-slide-up"
          style={{
            background: 'rgba(10,13,28,0.97)',
            border: '1px solid rgba(234,179,8,0.2)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(234,179,8,0.08)',
            backdropFilter: 'blur(16px)',
          }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <button
              onClick={() => { onMarkAllRead(); }}
              className="text-[10px] font-semibold transition-colors"
              style={{ color: unread > 0 ? '#fbbf24' : '#334155' }}
              disabled={unread === 0}
            >
              נקה הכל ✓
            </button>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">התראות</h3>
              {unread > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24' }}>
                  {unread} חדשות
                </span>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2">
                <span className="text-2xl">🔕</span>
                <p className="text-xs" style={{ color: '#334155' }}>אין התראות</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.read) onMarkRead(n.id); }}
                  className="w-full text-right px-4 py-3 flex items-start gap-3 transition-all"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: n.read ? 'transparent' : 'rgba(234,179,8,0.04)',
                    cursor: n.read ? 'default' : 'pointer',
                  }}
                  onMouseEnter={e => { if (!n.read) e.currentTarget.style.background = 'rgba(234,179,8,0.08)'; }}
                  onMouseLeave={e => { if (!n.read) e.currentTarget.style.background = 'rgba(234,179,8,0.04)'; }}
                >
                  {/* Score badge */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black mt-0.5"
                    style={{
                      background: n.score >= 90 ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                      color: n.score >= 90 ? '#22c55e' : '#fbbf24',
                    }}>
                    {n.score}%
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-snug"
                      style={{ color: n.read ? '#475569' : '#e2e8f0' }}>
                      {n.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {n.prop_city && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
                          📍 {n.prop_city}
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color: '#334155' }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                      style={{ background: '#f59e0b', boxShadow: '0 0 6px #f59e0b' }} />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 text-center"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px]" style={{ color: '#1e293b' }}>
                {notifications.length} התראות סה"כ
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
