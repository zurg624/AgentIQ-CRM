export default function StatsCard({ label, value, delta, color }) {
  return (
    <div className="card stat-card rounded-2xl px-5 py-4">
      <div className="text-sm font-medium" style={{ color: '#64748b' }}>{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color: color?.replace('text-', '') ?? '#f1f5f9' }}>
        {value}
      </div>
      {delta && <div className="text-xs mt-1" style={{ color: '#475569' }}>{delta}</div>}
    </div>
  );
}
