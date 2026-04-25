import { useState, useEffect } from 'react';
import api from '../api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const ils = n => `₪${Math.round(n).toLocaleString('he-IL')}`;

const STATUS_META = {
  'New':               { label: 'חדש',          color: '#60a5fa' },
  'Contacted':         { label: 'פנייה',         color: '#fbbf24' },
  'Meeting Scheduled': { label: 'פגישה',         color: '#a78bfa' },
  'Closed':            { label: 'סגור',          color: '#34d399' },
};

const HE_MONTHS = {
  '01': 'ינו', '02': 'פבר', '03': 'מרץ', '04': 'אפר',
  '05': 'מאי', '06': 'יונ', '07': 'יול', '08': 'אוג',
  '09': 'ספט', '10': 'אוק', '11': 'נוב', '12': 'דצמ',
};
const fmtMonth = m => { const [, mm] = (m || '').split('-'); return HE_MONTHS[mm] || m; };

// ── CSS Bar Chart ─────────────────────────────────────────────────────────────
function BarChart({ data, color = '#f59e0b', maxVal }) {
  const max = maxVal ?? Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-32 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-[10px] font-bold" style={{ color: d.color || color }}>{d.value}</span>
          <div className="w-full rounded-t-lg transition-all duration-700 relative overflow-hidden"
            style={{ height: `${Math.max((d.value / max) * 100, 4)}%`, background: d.color || color, opacity: 0.85 }}>
            <div className="absolute inset-0 opacity-30"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 100%)' }} />
          </div>
          <span className="text-[9px] truncate w-full text-center" style={{ color: '#475569' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Horizontal Bar ────────────────────────────────────────────────────────────
function HBar({ label, value, max, color = '#f59e0b' }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold" style={{ color }}>{value}</span>
        <span style={{ color: '#94a3b8' }}>{label}</span>
      </div>
      <div className="h-2 rounded-full w-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
      </div>
    </div>
  );
}

// ── Stat Widget ───────────────────────────────────────────────────────────────
function StatWidget({ value, label, icon, gold }) {
  return (
    <div className={`rounded-2xl p-4 text-center ${gold ? 'gold-box' : 'card'}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-xl font-black ${gold ? 'shimmer-gold' : 'text-white'}`}>{value}</div>
      <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>{label}</div>
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportCSV(data, systemName) {
  if (!data) return;
  const { total, byStatus, bySource, estimatedRevenue, monthly, agentLeaderboard } = data;
  const date = new Date().toLocaleDateString('he-IL');

  const rows = [
    ['דוח עסקי חודשי —', systemName, date],
    [],
    ['סה"כ לידים', total],
    ['עסקאות סגורות', byStatus?.Closed || 0],
    ['הכנסה משוערת', Math.round(estimatedRevenue)],
    [],
    ['--- לידים לפי סטטוס ---'],
    ...Object.entries(byStatus || {}).map(([k, v]) => [k, v]),
    [],
    ['--- לידים לפי מקור ---'],
    ...Object.entries(bySource || {}).map(([k, v]) => [k, v]),
    [],
    ['--- טרנד חודשי ---'],
    ['חודש', 'לידים'],
    ...(monthly || []).map(m => [m.month, m.count]),
    [],
    ['--- ביצועי סוכנים ---'],
    ['סוכן', 'לידים', 'סגורות'],
    ...(agentLeaderboard || []).map(a => [a.name, a.leads, a.closed]),
  ];

  const bom = '\uFEFF';
  const csv = bom + rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = `דוח-עסקי-${date}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 150);
}

function exportPDF() {
  window.print();
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage({ systemName = 'AgentIQ' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getReports()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-yellow-500/30 border-t-yellow-400 rounded-full animate-spin" />
        <p className="text-xs" style={{ color: '#475569' }}>טוען דוחות...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <p className="text-sm text-white">{error}</p>
      </div>
    </div>
  );

  const { total, byStatus, bySource, closedCount, estimatedRevenue, monthly, agentLeaderboard } = data || {};

  const statusBars = Object.entries(byStatus || {}).map(([k, v]) => ({
    label: STATUS_META[k]?.label || k,
    value: v,
    color: STATUS_META[k]?.color || '#94a3b8',
  }));

  const sourceBars = Object.entries(bySource || {});
  const maxSource = Math.max(...sourceBars.map(([, v]) => v), 1);

  const monthBars = (monthly || []).map(m => ({
    label: fmtMonth(m.month),
    value: m.count,
  }));

  const convRate = total > 0 ? ((closedCount / total) * 100).toFixed(1) : 0;

  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto" dir="rtl" id="reports-print">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">📊 מרכז דוחות</h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            ניתוח עסקי — {systemName} | {new Date().toLocaleDateString('he-IL')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportCSV(data, systemName)}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
            📥 Excel
          </button>
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            🖨️ PDF
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatWidget value={total}         label="סה״כ לידים"       icon="👥" />
        <StatWidget value={closedCount}   label="עסקאות סגורות"    icon="🏠" />
        <StatWidget value={`${convRate}%`} label="אחוז המרה"        icon="📈" />
        <StatWidget value={ils(estimatedRevenue)} label="הכנסה משוערת" icon="💰" gold />
      </div>

      <div className="grid md:grid-cols-2 gap-5">

        {/* Leads by status */}
        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white text-right mb-4">לידים לפי סטטוס 📋</h2>
          {statusBars.length > 0
            ? <BarChart data={statusBars} />
            : <p className="text-xs text-center py-8" style={{ color: '#334155' }}>אין נתונים</p>
          }
        </div>

        {/* Monthly trend */}
        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white text-right mb-4">טרנד חודשי 📅</h2>
          {monthBars.length > 0
            ? <BarChart data={monthBars} color="#f59e0b" />
            : <p className="text-xs text-center py-8" style={{ color: '#334155' }}>אין נתונים</p>
          }
        </div>

        {/* Lead sources */}
        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white text-right mb-4">מקורות לידים 🌐</h2>
          <div className="space-y-3">
            {sourceBars.length > 0
              ? sourceBars.map(([k, v]) => (
                  <HBar key={k} label={k} value={v} max={maxSource} color="#a78bfa" />
                ))
              : <p className="text-xs text-center py-8" style={{ color: '#334155' }}>אין נתונים</p>
            }
          </div>
        </div>

        {/* Agent leaderboard */}
        <div className="card rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white text-right mb-4">ביצועי סוכנים 🏆</h2>
          <div className="space-y-2">
            {(agentLeaderboard || []).length > 0
              ? agentLeaderboard.map((a, i) => (
                  <div key={a.name} className="flex items-center gap-3 py-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="text-base w-6 text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{a.name}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: '#475569' }}>
                        {a.leads} לידים · {a.closed} סגורות
                      </div>
                    </div>
                    <div className="text-sm font-black" style={{ color: a.closed > 0 ? '#34d399' : '#475569' }}>
                      {a.closed}
                    </div>
                  </div>
                ))
              : <p className="text-xs text-center py-8" style={{ color: '#334155' }}>אין נתונים</p>
            }
          </div>
        </div>

        {/* Revenue detail */}
        <div className="md:col-span-2 gold-box rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white text-right mb-4">💰 ניתוח הכנסות</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['עסקאות סגורות', closedCount, '#34d399'],
              ['עמלה ממוצעת', ils(2_200_000 * 0.02), '#fbbf24'],
              ['הכנסה לעסקה', ils(44_000), '#60a5fa'],
              ['סה"כ הכנסה', ils(estimatedRevenue), '#f59e0b'],
            ].map(([k, v, c]) => (
              <div key={k} className="text-center">
                <div className="text-xl font-black" style={{ color: c }}>{v}</div>
                <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>{k}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-3 text-right" style={{ color: '#334155' }}>
            * מחושב לפי עמלת תיווך 2% על עסקה ממוצעת של ₪2.2M
          </p>
        </div>
      </div>

      {/* Print stylesheet */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          #reports-print .card { background: #f8f9fa !important; border: 1px solid #dee2e6 !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
