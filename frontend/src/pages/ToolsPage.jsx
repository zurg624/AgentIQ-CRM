import { useState, useMemo } from 'react';

// ── Tax Brackets 2026 ─────────────────────────────────────────────────────────
const FIRST_HOME = [
  { limit: 1_978_745,  rate: 0.000 },
  { limit: 2_347_040,  rate: 0.035 },
  { limit: 6_055_695,  rate: 0.050 },
  { limit: 20_185_650, rate: 0.080 },
  { limit: Infinity,   rate: 0.100 },
];
const SECOND_HOME = [
  { limit: 5_872_725, rate: 0.08 },
  { limit: Infinity,  rate: 0.10 },
];

const VAT = 0.17;

// ── Math ──────────────────────────────────────────────────────────────────────
function calcTax(price, firstHome) {
  const brackets = firstHome ? FIRST_HOME : SECOND_HOME;
  let tax = 0, prev = 0;
  for (const { limit, rate } of brackets) {
    if (price <= prev) break;
    tax += (Math.min(price, limit) - prev) * rate;
    prev = limit;
  }
  return Math.round(tax);
}

function calcMonthly(principal, annualRate, years) {
  if (!principal || !annualRate || !years) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ils = n => `₪${Math.round(n).toLocaleString('he-IL')}`;
const pp = n => `${parseFloat(n.toFixed(2))}%`;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('iq_calc_history') || '[]'); }
  catch { return []; }
}

function exportCSV(res, inp) {
  const rows = [
    ['שדה', 'ערך'],
    ['מחיר הנכס', res.price],
    ['סוג רכישה', inp.firstHome ? 'דירה ראשונה' : 'דירה נוספת'],
    ['מטרה', inp.forInvestment ? 'השקעה' : 'מגורים'],
    ['מס רכישה', res.tax],
    ['שיעור מס אפקטיבי', pp(res.taxRate)],
    ['תיווך', res.brokerage],
    ['עורך דין', res.lawyer],
    ['שיפוץ', res.renovation],
    ['עלות כוללת', res.totalCost],
    ['אחוז משכנתא', `${inp.mortgagePct}%`],
    ['סכום משכנתא', res.loan],
    ['הון עצמי דרוש', res.equity],
    ['החזר חודשי', Math.round(res.monthly)],
    ['סה"כ ריבית', Math.round(res.totalInterest)],
    ...(inp.forInvestment ? [
      ['שכירות חודשית', inp.monthlyRent],
      ['הוצאות חודשיות', inp.monthlyExpenses],
      ['תשואה גולמית', pp(res.grossYield)],
      ['תשואה נטו', pp(res.netYield)],
      ['החזר השקעה', `${res.roiYears?.toFixed(1)} שנים`],
    ] : []),
    ['תאריך', new Date().toLocaleDateString('he-IL')],
  ];
  const bom = '\uFEFF';
  const csv = bom + rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  Object.assign(document.createElement('a'), { href: url, download: 'חישוב-עסקה.csv' }).click();
  URL.revokeObjectURL(url);
}

// ── Tiny Components ───────────────────────────────────────────────────────────
function Toggle({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{label}</span>
      <div onClick={() => onChange(!value)} className="w-10 h-5 rounded-full relative cursor-pointer transition-colors flex-shrink-0"
        style={{ background: value ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
          style={{ left: value ? '1.375rem' : '0.125rem' }} />
      </div>
    </div>
  );
}

function Pills({ options, value, onChange }) {
  return (
    <div className="flex rounded-xl p-0.5 gap-0.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all"
          style={value === o.value
            ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }
            : { color: '#64748b' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step = 0.5, suffix = '%', color = '#3b82f6' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold" style={{ color: '#eab308' }}>{value}{suffix}</span>
        <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{label}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full cursor-pointer appearance-none"
        style={{ accentColor: color }} />
    </div>
  );
}

function NumInput({ label, value, onChange, placeholder, prefix }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94a3b8' }}>{label}</label>
      <div className="relative">
        {prefix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#475569' }}>{prefix}</span>}
        <input type="number" value={value || ''} placeholder={placeholder}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="dark-input w-full text-sm py-2.5 rounded-xl"
          style={{ paddingRight: prefix ? '2rem' : '0.75rem', paddingLeft: '0.75rem' }} />
      </div>
    </div>
  );
}

function Row({ label, value, color, sub, size = 'sm', dimLabel }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className={`text-${size} font-${size === 'base' ? 'bold' : 'semibold'}`} style={{ color: color || '#e2e8f0' }}>{value}</span>
      <div className="text-right">
        <div className="text-xs" style={{ color: dimLabel ? '#475569' : '#94a3b8' }}>{label}</div>
        {sub && <div className="text-[10px]" style={{ color: '#334155' }}>{sub}</div>}
      </div>
    </div>
  );
}

function YieldMeter({ pct: y, label }) {
  const color = y >= 5 ? '#22c55e' : y >= 3 ? '#eab308' : '#ef4444';
  const bg    = y >= 5 ? 'rgba(34,197,94,0.1)' : y >= 3 ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)';
  const tag   = y >= 5 ? '✅ מצוין' : y >= 3 ? '⚠️ ממוצע' : '❌ חלש';
  return (
    <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: bg, border: `1px solid ${color}30` }}>
      <div className="text-xs" style={{ color }}>{tag}</div>
      <div className="text-right">
        <div className="text-xl font-black" style={{ color }}>{pp(y)}</div>
        <div className="text-[10px]" style={{ color: '#64748b' }}>{label}</div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
const DEFAULT = {
  price: 2_200_000, firstHome: true, forInvestment: false,
  mortgagePct: 70, annualRate: 4.5, years: 25,
  brokeragePct: 2, lawyerPct: 0.5,
  includeVat: true, includeRenovation: false, renovationCost: 100_000,
  monthlyRent: 7_000, monthlyExpenses: 500,
};

export default function ToolsPage() {
  const [inp, setInp]       = useState(DEFAULT);
  const [history, setHistory] = useState(loadHistory);
  const [showHist, setShowHist] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveBox, setShowSaveBox] = useState(false);
  const [toast, setToast]   = useState('');

  const set = (k, v) => setInp(p => ({ ...p, [k]: v }));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // ── Results ─────────────────────────────────────────────────────────────────
  const R = useMemo(() => {
    const price = inp.price;
    if (!price || price <= 0) return null;

    const tax     = calcTax(price, inp.firstHome);
    const taxRate = (tax / price) * 100;
    const vatMult = inp.includeVat ? (1 + VAT) : 1;
    const brokerage  = Math.round(price * (inp.brokeragePct / 100) * vatMult);
    const lawyer     = Math.round(price * (inp.lawyerPct / 100) * vatMult);
    const renovation = inp.includeRenovation ? Math.round(inp.renovationCost) : 0;
    const totalCost  = price + tax + brokerage + lawyer + renovation;

    const loan     = Math.round(price * inp.mortgagePct / 100);
    const equity   = totalCost - loan;
    const monthly  = calcMonthly(loan, inp.annualRate, inp.years);
    const totalPaid     = monthly * inp.years * 12;
    const totalInterest = totalPaid - loan;

    const annualRent     = inp.monthlyRent * 12;
    const annualExpenses = inp.monthlyExpenses * 12;
    const netAnnual      = annualRent - annualExpenses;
    const grossYield = price > 0      ? (annualRent / price) * 100    : 0;
    const netYield   = totalCost > 0 && netAnnual > 0 ? (netAnnual / totalCost) * 100 : 0;
    const roiYears   = netAnnual > 0 ? totalCost / netAnnual : null;

    return { price, tax, taxRate, brokerage, lawyer, renovation, totalCost, loan, equity, monthly, totalPaid, totalInterest, grossYield, netYield, roiYears, annualRent, netAnnual };
  }, [inp]);

  // ── History actions ─────────────────────────────────────────────────────────
  const saveCalc = () => {
    if (!R) return;
    const entry = { id: Date.now(), label: saveLabel || `עסקה ${ils(inp.price)}`, date: new Date().toLocaleDateString('he-IL'), inp: { ...inp }, R: { ...R } };
    const next = [entry, ...history].slice(0, 20);
    setHistory(next); localStorage.setItem('iq_calc_history', JSON.stringify(next));
    setShowSaveBox(false); setSaveLabel('');
    showToast('✅ החישוב נשמר!');
  };

  const deleteCalc = (id) => {
    const next = history.filter(h => h.id !== id);
    setHistory(next); localStorage.setItem('iq_calc_history', JSON.stringify(next));
  };

  const loadCalc = (entry) => { setInp(entry.inp); showToast('📂 חישוב נטען'); };

  const exportAllCSV = () => {
    if (!history.length) return;
    const rows = [['תאריך', 'תיאור', 'מחיר', 'מס', 'עלות כוללת', 'הון עצמי', 'החזר חודשי', 'תשואה גולמית', 'תשואה נטו']];
    history.forEach(h => rows.push([
      h.date, h.label, h.R.price, h.R.tax, h.R.totalCost, h.R.equity, Math.round(h.R.monthly), pp(h.R.grossYield), pp(h.R.netYield),
    ]));
    const bom = '\uFEFF';
    const csv = bom + rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    Object.assign(document.createElement('a'), { href: url, download: 'היסטוריית-חישובים.csv' }).click();
    URL.revokeObjectURL(url);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 px-4 md:px-6 py-6 overflow-auto" dir="rtl">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">💰 מחשבון עסקת נדל"ן</h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>חישוב מלא — מס, עלויות, משכנתא, תשואה | מדרגות מס 2026</p>
        </div>
        <div className="flex gap-2">
          {R && (
            <>
              <button onClick={() => exportCSV(R, inp)}
                className="text-xs px-3 py-1.5 rounded-xl font-medium"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
                📊 יצוא Excel
              </button>
              <button onClick={() => setShowSaveBox(v => !v)}
                className="text-xs px-3 py-1.5 rounded-xl font-medium"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
                💾 שמור
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save box */}
      {showSaveBox && (
        <div className="card rounded-2xl p-4 mb-4 flex items-center gap-3 flex-wrap">
          <input value={saveLabel} onChange={e => setSaveLabel(e.target.value)}
            placeholder={`תיאור (ברירת מחדל: עסקה ${R ? ils(inp.price) : ''})`}
            className="dark-input flex-1 px-3 py-2 text-sm rounded-xl min-w-48" />
          <button onClick={saveCalc} className="btn-gradient px-4 py-2 rounded-xl text-xs font-bold">שמור</button>
          <button onClick={() => setShowSaveBox(false)} className="text-xs px-3 py-2 rounded-xl" style={{ color: '#64748b' }}>ביטול</button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* ── LEFT: Results ── */}
        <div className="space-y-4">
          {!R ? (
            <div className="card rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">🔢</div>
              <p className="text-sm font-semibold text-white">הזן מחיר נכס להתחיל</p>
            </div>
          ) : (
            <>
              {/* Total cost callout */}
              <div className="card rounded-2xl p-5">
                <div className="text-xs font-semibold mb-1 text-right" style={{ color: '#64748b' }}>תוצאות העסקה 📊</div>
                <div className="rounded-xl p-4 text-center mb-4"
                  style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: '#eab308' }}>עלות כוללת לעסקה</div>
                  <div className="text-3xl font-black" style={{ color: '#fbbf24' }}>
                    ₪ {Math.round(R.totalCost).toLocaleString('he-IL')}
                  </div>
                </div>

                <Row label="מחיר הנכס"  value={ils(R.price)}     color="#e2e8f0" />
                <Row label="מס רכישה"   value={ils(R.tax)}
                  color={R.tax > 0 ? '#f87171' : '#34d399'}
                  sub={`${pp(R.taxRate)} אפקטיבי | ${inp.firstHome ? 'דירה ראשונה' : 'דירה נוספת'}`} />
                <Row label={`תיווך (${inp.brokeragePct}%${inp.includeVat ? '+מע"מ' : ''})`}
                  value={ils(R.brokerage)} color="#fb923c" />
                <Row label={`עו"ד (${inp.lawyerPct}%${inp.includeVat ? '+מע"מ' : ''})`}
                  value={ils(R.lawyer)} color="#fb923c" />
                {R.renovation > 0 && (
                  <Row label="שיפוץ משוער" value={ils(R.renovation)} color="#a78bfa" />
                )}
                <Row label="סה&quot;כ עלות" value={ils(R.totalCost)} color="#fbbf24" size="base" />
              </div>

              {/* Mortgage */}
              <div className="card rounded-2xl p-5">
                <div className="text-xs font-semibold mb-3 text-right" style={{ color: '#64748b' }}>משכנתא 🏦</div>
                <Row label={`סכום משכנתא (${inp.mortgagePct}%)`} value={ils(R.loan)} color="#60a5fa" />
                <Row label="החזר חודשי" value={ils(R.monthly)}
                  color="#60a5fa" size="base"
                  sub={`${inp.years} שנים | ריבית ${inp.annualRate}%`} />
                <Row label='סה"כ ריבית' value={ils(R.totalInterest)} color="#f87171" />
              </div>

              {/* OWN CAPITAL — highlighted */}
              <div className="rounded-2xl p-4"
                style={{ background: 'rgba(234,179,8,0.07)', border: '2px solid rgba(234,179,8,0.35)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-black" style={{ color: '#fbbf24' }}>
                      {ils(R.equity)}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: '#92400e' }}>
                      = עלות כוללת − משכנתא
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">הון עצמי דרוש</div>
                    <div className="text-xs" style={{ color: '#64748b' }}>למעמד הרכישה</div>
                  </div>
                </div>
              </div>

              {/* Yield — only if investment */}
              {inp.forInvestment && inp.monthlyRent > 0 && (
                <div className="card rounded-2xl p-5">
                  <div className="text-xs font-semibold mb-3 text-right" style={{ color: '#64748b' }}>תשואה ורווחיות 📈</div>
                  <YieldMeter pct={R.grossYield} label="תשואה גולמית" />
                  <div className="mt-2">
                    <YieldMeter pct={R.netYield} label="תשואה נטו (אחרי עלויות)" />
                  </div>
                  {R.roiYears && (
                    <div className="mt-3 flex items-center justify-between px-1">
                      <span className="text-sm font-bold" style={{ color: '#c4b5fd' }}>
                        {R.roiYears.toFixed(1)} שנים
                      </span>
                      <span className="text-xs" style={{ color: '#64748b' }}>החזר השקעה</span>
                    </div>
                  )}
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Row label="הכנסה שנתית נטו" value={ils(R.netAnnual)} color="#34d399" dimLabel />
                    <Row label="שכירות שנתית"    value={ils(R.annualRent)} color="#94a3b8" dimLabel />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT: Inputs ── */}
        <div className="card rounded-2xl p-5 space-y-5">
          <div className="text-xs font-semibold text-right" style={{ color: '#64748b' }}>פרטי העסקה 💰</div>

          {/* Price */}
          <NumInput label="מחיר הנכס (₪)" value={inp.price} onChange={v => set('price', v)} placeholder="2200000" prefix="₪" />

          {/* Type */}
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: '#94a3b8' }}>סוג רכישה</label>
            <Pills
              options={[{ value: true, label: 'דירה ראשונה' }, { value: false, label: 'דירה נוספת' }]}
              value={inp.firstHome} onChange={v => set('firstHome', v)} />
          </div>

          {/* Purpose */}
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: '#94a3b8' }}>מטרת הרכישה</label>
            <Pills
              options={[{ value: false, label: 'מגורים' }, { value: true, label: 'השקעה' }]}
              value={inp.forInvestment} onChange={v => set('forInvestment', v)} />
          </div>

          {/* Mortgage % */}
          <Slider label="אחוז משכנתא" value={inp.mortgagePct} onChange={v => set('mortgagePct', v)}
            min={0} max={75} step={5} />

          {/* Rate + Term */}
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="ריבית שנתית %" value={inp.annualRate} onChange={v => set('annualRate', v)} placeholder="4.5" />
            <NumInput label="תקופה (שנים)" value={inp.years} onChange={v => set('years', v)} placeholder="25" />
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {/* Brokerage slider */}
          <Slider label={`עמלת תיווך${inp.includeVat ? ' (+ מע"מ)' : ''}`}
            value={inp.brokeragePct} onChange={v => set('brokeragePct', v)}
            min={0} max={3} step={0.25} color="#f97316" />

          {/* Lawyer */}
          <NumInput label={`שכ"ט עורך דין %${inp.includeVat ? ' (+ מע"מ)' : ''}`}
            value={inp.lawyerPct} onChange={v => set('lawyerPct', v)} placeholder="0.5" />

          {/* VAT toggle */}
          <Toggle label='כולל מע"מ 17% על שכ"ט?' value={inp.includeVat} onChange={v => set('includeVat', v)} />

          {/* Renovation toggle */}
          <Toggle label="כולל שיפוץ משוער?" value={inp.includeRenovation} onChange={v => set('includeRenovation', v)} />
          {inp.includeRenovation && (
            <NumInput label="עלות שיפוץ (₪)" value={inp.renovationCost} onChange={v => set('renovationCost', v)} placeholder="100000" prefix="₪" />
          )}

          {/* Investment fields */}
          {inp.forInvestment && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div className="text-xs font-semibold text-right" style={{ color: '#64748b' }}>נתוני השכרה 🏘</div>
              <div className="grid grid-cols-2 gap-3">
                <NumInput label="שכירות חודשית (₪)" value={inp.monthlyRent} onChange={v => set('monthlyRent', v)} placeholder="7000" prefix="₪" />
                <NumInput label="הוצאות חודשיות (₪)" value={inp.monthlyExpenses} onChange={v => set('monthlyExpenses', v)} placeholder="500" prefix="₪" />
              </div>
            </>
          )}

          {/* Tax bracket info */}
          {inp.price > 0 && R && (
            <div className="rounded-xl p-3 text-xs space-y-1"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="font-semibold mb-1.5 text-right" style={{ color: '#64748b' }}>
                מדרגות מס חלות — {inp.firstHome ? 'דירה ראשונה' : 'דירה נוספת'}
              </div>
              {(inp.firstHome ? FIRST_HOME : SECOND_HOME).map(({ limit, rate }, i, arr) => {
                const from = i === 0 ? 0 : arr[i - 1].limit;
                const active = inp.price > from;
                if (!active) return null;
                return (
                  <div key={i} className="flex justify-between"
                    style={{ color: active ? (rate > 0 ? '#f87171' : '#34d399') : '#334155' }}>
                    <span>{(rate * 100).toFixed(1)}%</span>
                    <span>{from === 0 ? 'עד' : 'מעל'} ₪{from === 0 ? limit.toLocaleString('he-IL') : from.toLocaleString('he-IL')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── History ── */}
      <div className="mt-5">
        <button onClick={() => setShowHist(v => !v)}
          className="flex items-center gap-2 text-sm font-semibold w-full text-right py-3"
          style={{ color: '#64748b' }}>
          <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: showHist ? 'rotate(90deg)' : 'none' }}>▶</span>
          היסטוריית חישובים {history.length > 0 && `(${history.length})`}
          {history.length > 0 && (
            <button onClick={e => { e.stopPropagation(); exportAllCSV(); }}
              className="mr-auto text-xs px-3 py-1 rounded-lg"
              style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
              📊 יצוא הכל
            </button>
          )}
        </button>

        {showHist && (
          <div className="space-y-2 mt-1">
            {history.length === 0 ? (
              <div className="card rounded-2xl p-6 text-center text-xs" style={{ color: '#334155' }}>
                אין חישובים שמורים
              </div>
            ) : history.map(h => (
              <div key={h.id} className="card rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold text-white">{h.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#475569' }}>{h.date}</span>
                  </div>
                  <div className="flex gap-4 flex-wrap text-xs" style={{ color: '#64748b' }}>
                    <span style={{ color: '#fbbf24' }}>עלות: {ils(h.R.totalCost)}</span>
                    <span style={{ color: '#34d399' }}>הון עצמי: {ils(h.R.equity)}</span>
                    <span style={{ color: '#60a5fa' }}>החזר: {ils(h.R.monthly)}/חודש</span>
                    {h.inp.forInvestment && <span style={{ color: '#a78bfa' }}>תשואה: {pp(h.R.netYield)}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => loadCalc(h)}
                    className="text-xs px-3 py-1.5 rounded-xl"
                    style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
                    טען
                  </button>
                  <button onClick={() => exportCSV(h.R, h.inp)}
                    className="text-xs px-3 py-1.5 rounded-xl"
                    style={{ background: 'rgba(16,185,129,0.08)', color: '#34d399' }}>
                    יצוא
                  </button>
                  <button onClick={() => deleteCalc(h.id)}
                    className="text-xs px-3 py-1.5 rounded-xl"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl"
          style={{ background: 'rgba(16,185,129,0.9)', color: 'white', backdropFilter: 'blur(8px)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
