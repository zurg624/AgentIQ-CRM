export default function StatsBar({ leads }) {
  const total = leads.length;
  const hot   = leads.filter(l => l.status === 'New').length;
  const closed = leads.filter(l => l.status === 'Closed').length;
  const conv  = total ? ((closed / total) * 100).toFixed(1) : '0.0';

  const stats = [
    {
      label: "סה\"כ לידים",
      value: total,
      sub: 'במערכת',
      icon: '👥',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.1)',
    },
    {
      label: '🔥 לידים חמים',
      value: hot,
      sub: 'ממתינים לטיפול',
      icon: null,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.1)',
    },
    {
      label: '📈 המרה',
      value: `${conv}%`,
      sub: 'עסקאות סגורות',
      icon: null,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
    },
    {
      label: '⚡ זמן תגובה',
      value: '1.8h',
      sub: 'ממוצע',
      icon: null,
      color: '#8b5cf6',
      bg: 'rgba(139,92,246,0.1)',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-6 py-4">
      {stats.map(({ label, value, sub, color, bg }) => (
        <div key={label} className="card stat-card rounded-2xl px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: bg }}>
            <span style={{ filter: 'saturate(1.5)' }}>{label.match(/[\p{Emoji}]/u)?.[0] ?? '📊'}</span>
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
            <div className="text-xs font-medium" style={{ color: '#94a3b8' }}>{label.replace(/^[\p{Emoji}\s]+/u, '')}</div>
            <div className="text-[10px]" style={{ color: '#475569' }}>{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
