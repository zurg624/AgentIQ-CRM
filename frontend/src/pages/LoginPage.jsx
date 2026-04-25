import { useState } from 'react';
import api from '../api';

export default function LoginPage({ onLogin, systemName = 'AgentIQ' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [showPass, setShowPass] = useState(false);

  // Mock users — used as fallback when backend endpoint isn't live yet
  const MOCK_USERS = {
    admin:  { password: 'admin123', user: { id: 1, username: 'admin',  role: 'admin', display_name: 'מנהל ראשי' } },
    agent1: { password: 'agent123', user: { id: 2, username: 'agent1', role: 'agent', display_name: 'דוד לוי'   } },
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || !password) { setError('נדרשים שם משתמש וסיסמה'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.login(u, password);
      onLogin(data.user, data.token);
    } catch {
      // Fallback: mock auth (works before backend deploys)
      const mock = MOCK_USERS[u];
      if (mock && mock.password === password) {
        const token = btoa(`${u}:${mock.user.role}:${Date.now()}`);
        onLogin(mock.user, token);
      } else {
        setError('שם משתמש או סיסמה שגויים');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen dot-grid flex items-center justify-center p-4"
      style={{ background: '#060912' }} dir="rtl">

      {/* Background glow orbs */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="card glow-gold w-full rounded-3xl p-8 fade-slide-up"
        style={{ maxWidth: 400 }}>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center font-black text-2xl mb-3"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000', boxShadow: '0 0 32px rgba(245,158,11,0.5)' }}>
            A
          </div>
          <div className="shimmer-gold text-2xl font-black">{systemName}</div>
          <div className="text-xs mt-1" style={{ color: '#64748b' }}>פלטפורמת הנדל"ן המקצועית</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#94a3b8' }}>שם משתמש</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="הזן שם משתמש"
              className="dark-input w-full px-4 py-3 text-sm rounded-xl"
              autoComplete="username"
              autoFocus
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#94a3b8' }}>סיסמה</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="הזן סיסמה"
                className="dark-input w-full px-4 py-3 text-sm rounded-xl"
                style={{ paddingLeft: '2.75rem' }}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: '#475569' }}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs px-3 py-2 rounded-xl text-right"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="btn-gradient w-full py-3 rounded-xl text-sm font-bold mt-2 disabled:opacity-60">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  מתחבר...
                </span>
              : '🔐 התחבר'}
          </button>
        </form>

        {/* Demo credentials hint */}
        <div className="mt-6 rounded-xl p-3 text-xs space-y-1.5 text-right"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="font-semibold mb-1" style={{ color: '#475569' }}>משתמשי הדגמה:</div>
          <div className="flex items-center justify-between">
            <span className="font-mono" style={{ color: '#64748b' }}>admin / admin123</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>מנהל</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono" style={{ color: '#64748b' }}>agent1 / agent123</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>סוכן</span>
          </div>
        </div>
      </div>
    </div>
  );
}
