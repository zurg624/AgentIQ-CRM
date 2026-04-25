import { useState } from 'react';

const AREAS = ['תל אביב - לב העיר', 'רמת גן - בורסה', 'פתח תקווה', 'ראשון לציון', 'הרצליה פיתוח', 'נתניה', 'חדרה', 'ירושלים - רחביה'];

const MOCK_SALES = {
  'תל אביב - לב העיר': [
    { address: 'רחוב דיזנגוף 120', rooms: 3, floor: 5, sqm: 82, price: 3_850_000, date: '2026-04-10' },
    { address: 'רחוב בן יהודה 45', rooms: 4, floor: 8, sqm: 110, price: 5_200_000, date: '2026-04-05' },
    { address: 'שדרות רוטשילד 18', rooms: 2, floor: 3, sqm: 65, price: 3_100_000, date: '2026-03-28' },
    { address: 'רחוב אלנבי 72', rooms: 3, floor: 2, sqm: 78, price: 3_400_000, date: '2026-03-20' },
    { address: 'רחוב ינאי 9', rooms: 5, floor: 12, sqm: 145, price: 7_800_000, date: '2026-03-15' },
  ],
  'רמת גן - בורסה': [
    { address: 'רחוב ביאליק 34', rooms: 4, floor: 6, sqm: 115, price: 3_200_000, date: '2026-04-12' },
    { address: 'רחוב ז\'בוטינסקי 88', rooms: 3, floor: 4, sqm: 90, price: 2_650_000, date: '2026-04-01' },
    { address: 'שדרות ירושלים 55', rooms: 5, floor: 9, sqm: 130, price: 4_100_000, date: '2026-03-22' },
  ],
  'פתח תקווה': [
    { address: 'רחוב הרצל 120', rooms: 4, floor: 3, sqm: 105, price: 1_950_000, date: '2026-04-08' },
    { address: 'רחוב קפלן 22', rooms: 3, floor: 5, sqm: 88, price: 1_680_000, date: '2026-04-02' },
    { address: 'רחוב שינקין 14', rooms: 5, floor: 1, sqm: 120, price: 2_200_000, date: '2026-03-25' },
    { address: 'שדרות מוהליבר 7', rooms: 4, floor: 7, sqm: 100, price: 1_850_000, date: '2026-03-18' },
  ],
};

const DEFAULT = Object.values(MOCK_SALES)[0];

function daysAgo(dateStr) {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return d === 0 ? 'היום' : `לפני ${d} ימים`;
}

export default function ShachenPage() {
  const [area, setArea] = useState(AREAS[0]);
  const sales = MOCK_SALES[area] ?? DEFAULT;

  const avgPricePerSqm = Math.round(
    sales.reduce((s, x) => s + x.price / x.sqm, 0) / sales.length
  );
  const avgPrice = Math.round(sales.reduce((s, x) => s + x.price, 0) / sales.length);

  return (
    <div className="flex-1 px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">🏡 שכן חכם</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>עסקאות אחרונות באזור — נתוני שוק עדכניים</p>
      </div>

      {/* Area selector */}
      <div className="mb-5">
        <select value={area} onChange={e => setArea(e.target.value)}
          className="dark-input px-4 py-2.5 text-sm w-full md:w-auto">
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'עסקאות אחרונות', value: sales.length, sub: '30 יום אחרונים', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
          { label: 'מחיר ממוצע', value: `₪${(avgPrice / 1_000_000).toFixed(2)}M`, sub: 'לנכס', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
          { label: '₪ למ"ר ממוצע', value: `₪${avgPricePerSqm.toLocaleString()}`, sub: 'ממוצע אזורי', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
        ].map(({ label, value, sub, color, bg }) => (
          <div key={label} className="card rounded-2xl px-4 py-4">
            <div className="text-xl font-bold mb-0.5" style={{ color }}>{value}</div>
            <div className="text-xs font-medium text-white">{label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: '#475569' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Sales list */}
      <div className="card rounded-2xl overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-sm font-semibold text-white">עסקאות אחרונות — {area}</h2>
        </div>
        <div className="divide-y" style={{ '--tw-divide-opacity': 1 }}>
          {sales.map((s, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 tr-hover">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 700 }}>
                {s.rooms}ח
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{s.address}</div>
                <div className="text-xs mt-0.5 flex gap-3 flex-wrap" style={{ color: '#64748b' }}>
                  <span>קומה {s.floor}</span>
                  <span>{s.sqm} מ"ר</span>
                  <span>₪{Math.round(s.price / s.sqm).toLocaleString()}/מ"ר</span>
                </div>
              </div>
              <div className="text-left flex-shrink-0">
                <div className="text-sm font-bold" style={{ color: '#10b981' }}>
                  ₪{(s.price / 1_000_000).toFixed(2)}M
                </div>
                <div className="text-[10px]" style={{ color: '#475569' }}>{daysAgo(s.date)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs mt-4 text-center" style={{ color: '#334155' }}>
        * נתוני הדגמה בלבד — מבוסס על ממוצעי שוק ריאליסטיים
      </p>
    </div>
  );
}
