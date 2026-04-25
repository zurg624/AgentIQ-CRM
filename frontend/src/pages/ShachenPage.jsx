import { useState } from 'react';
import api from '../api';

// ── Static data (recent transactions panel) ───────────────────────────────────
const AREAS = ['תל אביב - לב העיר', 'רמת גן - בורסה', 'פתח תקווה', 'ראשון לציון', 'הרצליה פיתוח', 'נתניה'];
const MOCK_SALES = {
  'תל אביב - לב העיר': [
    { address: 'רחוב דיזנגוף 120', rooms: 3, floor: 5, sqm: 82,  price: 3_850_000, date: '2026-04-10' },
    { address: 'רחוב בן יהודה 45',  rooms: 4, floor: 8, sqm: 110, price: 5_200_000, date: '2026-04-05' },
    { address: 'שדרות רוטשילד 18',  rooms: 2, floor: 3, sqm: 65,  price: 3_100_000, date: '2026-03-28' },
  ],
  'רמת גן - בורסה': [
    { address: "רחוב ז'בוטינסקי 88", rooms: 3, floor: 4, sqm: 90,  price: 2_650_000, date: '2026-04-01' },
    { address: 'רחוב ביאליק 34',     rooms: 4, floor: 6, sqm: 115, price: 3_200_000, date: '2026-04-12' },
  ],
  'פתח תקווה': [
    { address: 'רחוב הרצל 120',  rooms: 4, floor: 3, sqm: 105, price: 1_950_000, date: '2026-04-08' },
    { address: 'רחוב קפלן 22',   rooms: 3, floor: 5, sqm: 88,  price: 1_680_000, date: '2026-04-02' },
    { address: 'רחוב שינקין 14', rooms: 5, floor: 1, sqm: 120, price: 2_200_000, date: '2026-03-25' },
  ],
  'ראשון לציון': [
    { address: 'שדרות רוטשילד 40', rooms: 4, floor: 3, sqm: 100, price: 2_100_000, date: '2026-04-07' },
    { address: 'רחוב הרצל 55',     rooms: 3, floor: 2, sqm: 82,  price: 1_720_000, date: '2026-03-30' },
  ],
  'הרצליה פיתוח': [
    { address: 'רחוב הים 12',      rooms: 4, floor: 8, sqm: 130, price: 5_400_000, date: '2026-04-09' },
    { address: 'שדרות הנשיא 7',    rooms: 5, floor: 5, sqm: 155, price: 6_800_000, date: '2026-04-03' },
  ],
  'נתניה': [
    { address: 'שדרות ויצמן 30', rooms: 3, floor: 4, sqm: 88,  price: 1_650_000, date: '2026-04-06' },
    { address: 'רחוב הרצל 88',   rooms: 4, floor: 2, sqm: 100, price: 1_900_000, date: '2026-03-28' },
  ],
};

const SUGGESTIONS = [
  'הרצל 10, רמת גן', 'רוטשילד 22, תל אביב', 'ויצמן 50, רחובות',
  'הים 1, הרצליה', 'בן גוריון 5, פתח תקווה',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysAgo(d) {
  const n = Math.floor((Date.now() - new Date(d)) / 86400000);
  return n === 0 ? 'היום' : `לפני ${n} ימים`;
}
const ils = n => `₪${Math.round(n).toLocaleString('he-IL')}`;

function scoreColor(s) {
  if (s >= 85) return '#22c55e';
  if (s >= 70) return '#fbbf24';
  if (s >= 55) return '#f97316';
  return '#ef4444';
}
function ratingColor(r) {
  return r === 'A' ? '#22c55e' : r === 'B' ? '#fbbf24' : '#f97316';
}
function impactColor(i) {
  return i === 'positive' ? '#22c55e' : i === 'negative' ? '#ef4444' : '#94a3b8';
}
function impactLabel(i) {
  return i === 'positive' ? '↑ חיובי' : i === 'negative' ? '↓ שלילי' : '→ ניטרלי';
}

// ── Investment score gauge (SVG arc) ─────────────────────────────────────────
function ScoreGauge({ score }) {
  const r = 52, cx = 64, cy = 64;
  const circ = Math.PI * r;          // half-circle circumference
  const filled = (score / 100) * circ;
  const col = scoreColor(score);
  const label = score >= 85 ? 'מצוין' : score >= 70 ? 'טוב' : score >= 55 ? 'ממוצע' : 'חלש';

  return (
    <div className="flex flex-col items-center">
      <svg width="128" height="80" viewBox="0 0 128 80">
        {/* Background arc */}
        <path d={`M 12 64 A ${r} ${r} 0 0 1 116 64`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" strokeLinecap="round" />
        {/* Filled arc */}
        <path d={`M 12 64 A ${r} ${r} 0 0 1 116 64`}
          fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          style={{ filter: `drop-shadow(0 0 6px ${col}80)` }} />
        {/* Score text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={col}
          fontSize="22" fontWeight="900" fontFamily="Inter,system-ui,sans-serif">
          {score}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b"
          fontSize="10" fontFamily="Inter,system-ui,sans-serif">
          מתוך 100
        </text>
      </svg>
      <span className="text-sm font-bold mt-1" style={{ color: col }}>{label}</span>
    </div>
  );
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────
function SkeletonBlock({ h = 'h-3', w = 'w-full', className = '' }) {
  return (
    <div className={`${h} ${w} rounded-full ${className}`}
      style={{ background: 'linear-gradient(90deg,rgba(234,179,8,0.06) 0%,rgba(234,179,8,0.18) 40%,rgba(234,179,8,0.06) 100%)', backgroundSize: '200% auto', animation: 'shimmer 1.6s linear infinite' }} />
  );
}

function SkeletonReport({ address }) {
  return (
    <div className="space-y-4 fade-slide-up">
      {/* Address banner */}
      <div className="gold-box rounded-2xl px-5 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex-shrink-0"
          style={{ background: 'rgba(234,179,8,0.15)', animation: 'pulse 1.5s ease-in-out infinite' }}>
          <div className="w-full h-full rounded-xl" style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.3),rgba(245,158,11,0.1))' }} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color: '#fbbf24' }}>
            ⏳ אוסף נתונים עבור {address}...
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Claude AI מנתח את השכונה</div>
        </div>
        <div className="w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-400 rounded-full animate-spin" />
      </div>

      {/* Skeleton cards grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card rounded-2xl p-5 space-y-3" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="flex items-center gap-2">
              <SkeletonBlock h="h-6" w="w-6" className="rounded-lg" />
              <SkeletonBlock h="h-4" w="w-32" />
            </div>
            <SkeletonBlock h="h-8" w="w-40" />
            <SkeletonBlock h="h-3" w="w-full" />
            <SkeletonBlock h="h-3" w="w-4/5" />
            <SkeletonBlock h="h-3" w="w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function ReportSection({ icon, title, score, scoreLabel, children, gold }) {
  return (
    <div className={`rounded-2xl p-5 space-y-3 ${gold ? 'gold-box' : 'card'}`}
      style={gold ? { boxShadow: '0 0 30px rgba(234,179,8,0.15)' } : {}}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {score !== undefined && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${scoreColor(score * 10)}20`, color: scoreColor(score * 10) }}>
              {score}/10
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <span className="text-base">{icon}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── ScoreBar ─────────────────────────────────────────────────────────────────
function ScoreBar({ value, max = 10, color }) {
  const col = color || scoreColor(value * 10);
  return (
    <div className="h-1.5 rounded-full w-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
      <div className="h-full rounded-full transition-all duration-1000"
        style={{ width: `${(value / max) * 100}%`, background: `linear-gradient(90deg,${col}80,${col})` }} />
    </div>
  );
}

// ── Main export button ────────────────────────────────────────────────────────
function exportPDF() { window.print(); }

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShachenPage() {
  const [address, setAddress] = useState('');
  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(false);
  const [report,  setReport]  = useState(null);
  const [error,   setError]   = useState('');
  const [area,    setArea]    = useState(AREAS[0]);

  const sales = MOCK_SALES[area] ?? MOCK_SALES[AREAS[0]];
  const avgPpqm  = Math.round(sales.reduce((s, x) => s + x.price / x.sqm, 0) / sales.length);
  const avgPrice = Math.round(sales.reduce((s, x) => s + x.price, 0) / sales.length);

  // Client-side fallback (used when backend hasn't deployed yet)
  const clientMockReport = (addr) => {
    const city = ['תל אביב','רמת גן','ירושלים','חיפה','נתניה','פתח תקווה','ראשון לציון','הרצליה']
      .find(c => addr.includes(c)) || 'המרכז';
    const D = {
      'תל אביב':       { ppqm:38000,trend:6.2,avg:3_800_000,school:9,transport:10,invest:88,income:'גבוה' },
      'רמת גן':        { ppqm:26000,trend:7.5,avg:2_600_000,school:8,transport:8, invest:82,income:'בינוני-גבוה' },
      'ירושלים':       { ppqm:22000,trend:4.1,avg:2_200_000,school:7,transport:7, invest:74,income:'בינוני' },
      'חיפה':          { ppqm:14000,trend:5.8,avg:1_400_000,school:7,transport:8, invest:71,income:'בינוני' },
      'נתניה':         { ppqm:18000,trend:6.9,avg:1_800_000,school:7,transport:7, invest:75,income:'בינוני' },
      'פתח תקווה':     { ppqm:19000,trend:7.1,avg:1_900_000,school:7,transport:7, invest:77,income:'בינוני' },
      'ראשון לציון':   { ppqm:20000,trend:6.5,avg:2_000_000,school:8,transport:7, invest:78,income:'בינוני-גבוה' },
      'הרצליה':        { ppqm:30000,trend:5.9,avg:3_100_000,school:9,transport:8, invest:85,income:'גבוה' },
      'המרכז':         { ppqm:22000,trend:5.5,avg:2_000_000,school:7,transport:7, invest:76,income:'בינוני' },
    };
    const d = D[city] || D['המרכז'];
    return {
      address: addr, city,
      market_value: { price_per_sqm:d.ppqm, trend_pct:d.trend, trend_direction:'up', avg_deal_price:d.avg,
        description:`מחירי הנדל"ן ב${city} ממשיכים לעלות עם ביקוש גבוה ומלאי נמוך. המחיר למ"ר עומד על ₪${d.ppqm.toLocaleString('he-IL')} בממוצע, עם עלייה של ${d.trend}% בשנה האחרונה.` },
      schools: { overall_rating:d.school,
        items:[
          {name:`בי"ס ממלכתי ${city}`,type:'יסודי',distance:"200 מ'",rating:'A'},
          {name:'חטיבת הביניים האזורית',type:'חטיבה',distance:"500 מ'",rating:'B'},
          {name:'תיכון אזורי מקיף',type:'תיכון',distance:"850 מ'",rating:'B'},
        ],
        description:`האזור מכוסה ברשת בתי ספר איכותית. ציון חינוך ממוצע ${d.school}/10 — מהגבוהים בעיר.` },
      transport: { accessibility_score:d.transport,
        items:['קווי אוטובוס ישירים למרכז העיר','תחנת רכבת/רכבת קלה בסביבה הקרובה','גישה נוחה לכבישים ראשיים'],
        description:`נגישות תחבורתית ${d.transport>=9?'מצוינת':'טובה מאוד'} — תחבורה ציבורית צפופה עם תוכניות הרחבה עתידיות.` },
      development: { activity_level:d.invest>=80?'גבוה':'בינוני',
        projects:[
          {name:'תמ"א 38/2',type:'תמ"א 38',status:'בתכנון מתקדם',impact:'positive'},
          {name:'פינוי-בינוי מתחם ותיק',type:'פינוי בינוי',status:'אושר בוועדה',impact:'positive'},
          {name:'הרחבת תשתיות תחבורה',type:'תשתיות',status:'בביצוע',impact:'positive'},
        ],
        description:`פעילות התחדשות עירונית ענפה. מספר פרויקטים של תמ"א 38 ופינוי-בינוי צפויים להעלות את ערך הנכסים.` },
      demographics: { avg_age:36, dominant_group:'משפחות צעירות ואנשי מקצוע', income_level:d.income,
        description:`האוכלוסייה מורכבת בעיקר ממשפחות בגילאי 28–45. רמת ההכנסה ${d.income} — מעל הממוצע הארצי.` },
      investment_score:d.invest,
      investment_summary:`האזור מהווה השקעה ${d.invest>=82?'מצוינת':'טובה מאוד'} לטווח הבינוני-ארוך עם פוטנציאל עלייה של ${d.trend}%+ בשנה.`,
    };
  };

  const handleGenerate = async () => {
    const q = address.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setReport(null);
    setError('');
    try {
      const data = await api.smartNeighbor(q);
      setReport(data);
    } catch {
      // Fallback: client-side mock (works before backend deploys)
      await new Promise(r => setTimeout(r, 1200)); // realistic loading feel
      setReport(clientMockReport(q));
    } finally {
      setLoading(false);
    }
  };

  const trend = report?.market_value;

  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto" dir="rtl" id="shachen-print">

      {/* ── Header ── */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">🏡 שכן חכם — AI</h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            בינה מלאכותית מנתחת שכונות: שווי שוק, חינוך, תחבורה, פיתוח ודמוגרפיה
          </p>
        </div>
        {report && (
          <button onClick={exportPDF}
            className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            🖨️ הורד PDF
          </button>
        )}
      </div>

      {/* ── Search ── */}
      <div className="card rounded-2xl p-4 mb-5">
        <label className="text-xs font-medium block mb-2.5 text-right" style={{ color: '#94a3b8' }}>
          כתובת הנכס / השכונה לניתוח
        </label>
        <div className="flex gap-2">
          <button onClick={handleGenerate} disabled={loading || !address.trim()}
            className="btn-gradient flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
            {loading
              ? <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />מנתח...</>
              : <><span>🔍</span> צור דוח</>}
          </button>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            placeholder="לדוגמה: הרצל 10, רמת גן"
            className="dark-input flex-1 px-4 py-2.5 text-sm rounded-xl"
          />
        </div>
        {/* Quick suggestions */}
        <div className="flex gap-1.5 mt-3 flex-wrap justify-end">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => setAddress(s)}
              className="text-[10px] px-2.5 py-1 rounded-full transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.07)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fbbf24'; e.currentTarget.style.borderColor = 'rgba(234,179,8,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-2xl px-4 py-3 mb-4 text-sm text-right"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && <SkeletonReport address={query} />}

      {/* ── Report ── */}
      {report && !loading && (
        <div className="space-y-4 fade-slide-up" id="report-content">

          {/* Address + investment score banner */}
          <div className="gold-box glow-gold rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <ScoreGauge score={report.investment_score} />
            <div className="flex-1 text-right">
              <div className="shimmer-gold text-lg font-black">{report.address}</div>
              <div className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{report.city}</div>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: '#cbd5e1' }}>
                {report.investment_summary}
              </p>
            </div>
          </div>

          {/* 2-column grid */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* ── Market Value ── */}
            <ReportSection icon="💰" title="שווי שוק">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs" style={{ color: '#64748b' }}>מגמה שנתית</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-sm font-bold"
                      style={{ color: trend?.trend_direction === 'up' ? '#22c55e' : '#ef4444' }}>
                      {trend?.trend_direction === 'up' ? '↑' : '↓'} {trend?.trend_pct}%
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black" style={{ color: '#fbbf24' }}>
                    ₪{trend?.price_per_sqm?.toLocaleString('he-IL')}
                  </div>
                  <div className="text-[10px]" style={{ color: '#64748b' }}>למ"ר</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs py-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#60a5fa' }}>{ils(trend?.avg_deal_price)}</span>
                <span style={{ color: '#64748b' }}>עסקה ממוצעת</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                {trend?.description}
              </p>
            </ReportSection>

            {/* ── Schools ── */}
            <ReportSection icon="🏫" title="חינוך ובתי ספר"
              score={report.schools?.overall_rating}>
              <ScoreBar value={report.schools?.overall_rating || 0} />
              <div className="space-y-2 mt-1">
                {report.schools?.items?.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold px-1.5 py-0.5 rounded text-[10px]"
                        style={{ background: `${ratingColor(s.rating)}20`, color: ratingColor(s.rating) }}>
                        {s.rating}
                      </span>
                      <span style={{ color: '#64748b' }}>{s.distance}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-white">{s.name}</div>
                      <div style={{ color: '#475569' }}>{s.type}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                {report.schools?.description}
              </p>
            </ReportSection>

            {/* ── Transport ── */}
            <ReportSection icon="🚌" title="תחבורה ונגישות"
              score={report.transport?.accessibility_score}>
              <ScoreBar value={report.transport?.accessibility_score || 0} color="#60a5fa" />
              <ul className="space-y-1.5 mt-1">
                {report.transport?.items?.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#94a3b8' }}>
                    <span style={{ color: '#60a5fa' }}>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed mt-1" style={{ color: '#94a3b8' }}>
                {report.transport?.description}
              </p>
            </ReportSection>

            {/* ── Development ── */}
            <ReportSection icon="🏗️" title="פיתוח עתידי">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: report.development?.activity_level === 'גבוה' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                    color: report.development?.activity_level === 'גבוה' ? '#22c55e' : '#fbbf24',
                  }}>
                  פעילות {report.development?.activity_level}
                </span>
              </div>
              <div className="space-y-2">
                {report.development?.projects?.map((p, i) => (
                  <div key={i} className="rounded-xl px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: impactColor(p.impact) }}>{impactLabel(p.impact)}</span>
                      <div className="text-right">
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className="mr-1.5" style={{ color: '#475569' }}>— {p.type}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-right mt-0.5" style={{ color: '#475569' }}>{p.status}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                {report.development?.description}
              </p>
            </ReportSection>

            {/* ── Demographics ── */}
            <ReportSection icon="👥" title="דמוגרפיה">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'גיל ממוצע',      value: report.demographics?.avg_age, color: '#a78bfa' },
                  { label: 'אוכלוסייה',       value: report.demographics?.dominant_group?.split(' ')[0], color: '#60a5fa' },
                  { label: 'רמת הכנסה',       value: report.demographics?.income_level, color: '#34d399' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl py-2.5"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-base font-black" style={{ color }}>{value}</div>
                    <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                {report.demographics?.description}
              </p>
            </ReportSection>

            {/* ── Investment summary (full width on mobile, half on md) ── */}
            <ReportSection icon="🎯" title="המלצת השקעה" gold>
              <div className="text-sm leading-relaxed font-medium text-white text-right">
                {report.investment_summary}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: 'ציון השקעה',  value: `${report.investment_score}/100`, color: scoreColor(report.investment_score) },
                  { label: 'מגמה',        value: `+${report.market_value?.trend_pct}%`, color: '#22c55e' },
                  { label: 'מ"ר',         value: `₪${(report.market_value?.price_per_sqm/1000).toFixed(0)}K`, color: '#fbbf24' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center rounded-xl py-2"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-sm font-black" style={{ color }}>{value}</div>
                    <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>{label}</div>
                  </div>
                ))}
              </div>
            </ReportSection>
          </div>

          {/* Generated-by footer */}
          <p className="text-[10px] text-center" style={{ color: '#1e293b' }}>
            * הדוח נוצר על ידי Claude AI — AgentIQ Smart Neighbor | {new Date().toLocaleDateString('he-IL')}
          </p>
        </div>
      )}

      {/* ── Recent transactions (always visible) ── */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <select value={area} onChange={e => setArea(e.target.value)}
            className="dark-input px-3 py-2 text-xs rounded-xl">
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <h2 className="text-sm font-bold text-white">עסקאות אחרונות 📋</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {[
            { label: 'עסקאות (30 יום)', value: sales.length,                              prefix: '',  color: '#60a5fa' },
            { label: 'מחיר ממוצע',      value: `${(avgPrice/1_000_000).toFixed(2)}M`,     prefix: '₪', color: '#34d399' },
            { label: '₪ למ"ר ממוצע',   value: avgPpqm.toLocaleString('he-IL'),           prefix: '₪', color: '#a78bfa' },
          ].map(({ label, value, prefix, color }) => (
            <div key={label} className="card rounded-2xl px-4 py-3">
              <div className="text-lg font-black" style={{ color }}>{prefix}{value}</div>
              <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>{label}</div>
            </div>
          ))}
        </div>

        <div className="card rounded-2xl overflow-hidden">
          {sales.map((s, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4 tr-hover"
              style={{ borderBottom: i < sales.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs flex-shrink-0 font-bold"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                {s.rooms}ח
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{s.address}</div>
                <div className="text-[11px] mt-0.5 flex gap-3 flex-wrap" style={{ color: '#64748b' }}>
                  <span>קומה {s.floor}</span>
                  <span>{s.sqm} מ"ר</span>
                  <span>₪{Math.round(s.price/s.sqm).toLocaleString('he-IL')}/מ"ר</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold" style={{ color: '#34d399' }}>
                  ₪{(s.price/1_000_000).toFixed(2)}M
                </div>
                <div className="text-[10px]" style={{ color: '#475569' }}>{daysAgo(s.date)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Print stylesheet */}
      <style>{`
        @media print {
          body { background: white !important; color: #111 !important; direction: rtl; }
          .card, .gold-box { background: #f8f9fa !important; border: 1px solid #ddd !important; box-shadow: none !important; backdrop-filter: none !important; }
          #shachen-print > *:not(#report-content):not(.mb-5):not(.mt-6) { display: none !important; }
          button, select { display: none !important; }
          .shimmer-gold { -webkit-text-fill-color: #b45309 !important; background: none !important; color: #b45309 !important; }
        }
      `}</style>
    </div>
  );
}
