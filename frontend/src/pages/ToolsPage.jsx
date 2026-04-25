import { useState, useRef } from 'react';
import { useLang } from '../i18n';

const FIRST_HOME_BRACKETS = [
  { limit: 1_978_745, rate: 0 },
  { limit: 2_347_040, rate: 0.035 },
  { limit: 6_055_695, rate: 0.05 },
  { limit: 20_185_650, rate: 0.08 },
  { limit: Infinity,  rate: 0.10 },
];
const INVESTOR_BRACKETS = [
  { limit: 5_872_725, rate: 0.08 },
  { limit: Infinity,  rate: 0.10 },
];

function calcPurchaseTax(price, firstHome) {
  const brackets = firstHome ? FIRST_HOME_BRACKETS : INVESTOR_BRACKETS;
  let tax = 0, prev = 0;
  for (const { limit, rate } of brackets) {
    if (price <= prev) break;
    tax += (Math.min(price, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}

function PurchaseTaxCalc() {
  const { t } = useLang();
  const priceRef = useRef();
  const [firstHome, setFirstHome] = useState(true);
  const [result, setResult] = useState(null);

  const calc = () => {
    const p = parseFloat(priceRef.current.value.replace(/,/g, ''));
    if (!p || p <= 0) return;
    const tax = calcPurchaseTax(p, firstHome);
    setResult({ tax, rate: ((tax / p) * 100).toFixed(2) });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>{t('property_price')}</label>
        <input ref={priceRef} type="number" placeholder="2500000" className="dark-input w-full px-4 py-2.5 text-sm" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div onClick={() => setFirstHome(v => !v)}
          className="w-10 h-6 rounded-full relative transition-colors"
          style={{ background: firstHome ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${firstHome ? 'left-5' : 'left-1'}`} />
        </div>
        <span className="text-sm" style={{ color: '#94a3b8' }}>{t('first_home')}</span>
      </label>
      <button onClick={calc} className="btn-gradient w-full py-2.5 rounded-xl text-sm font-semibold">
        {t('calc_tax')}
      </button>
      {result && (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-xs font-semibold uppercase mb-1" style={{ color: '#f87171' }}>{t('tax_result')}</div>
            <div className="text-2xl font-bold" style={{ color: '#ef4444' }}>₪{Math.round(result.tax).toLocaleString()}</div>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="text-xs font-semibold uppercase mb-1" style={{ color: '#fbbf24' }}>{t('effective_rate')}</div>
            <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{result.rate}%</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MortgageCalc() {
  const { t } = useLang();
  const loanRef = useRef(), rateRef = useRef(), yearsRef = useRef();
  const [result, setResult] = useState(null);

  const calc = () => {
    const P = parseFloat(loanRef.current.value.replace(/,/g, ''));
    const r = parseFloat(rateRef.current.value) / 100 / 12;
    const n = parseInt(yearsRef.current.value) * 12;
    if (!P || !r || !n) return;
    const monthly = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const total = monthly * n;
    setResult({ monthly, total, interest: total - P });
  };

  const fields = [
    { label: t('loan_amount'), ref: loanRef,  placeholder: '1000000' },
    { label: t('annual_rate'), ref: rateRef,  placeholder: '4.5' },
    { label: t('loan_term'),   ref: yearsRef, placeholder: '25' },
  ];

  return (
    <div className="space-y-4">
      {fields.map(({ label, ref, placeholder }) => (
        <div key={label}>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>{label}</label>
          <input ref={ref} type="number" placeholder={placeholder} className="dark-input w-full px-4 py-2.5 text-sm" />
        </div>
      ))}
      <button onClick={calc} className="btn-gradient w-full py-2.5 rounded-xl text-sm font-semibold">{t('calc_mortgage')}</button>
      {result && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[
            { label: t('monthly_payment'), val: result.monthly,  color: '#60a5fa',  bg: 'rgba(59,130,246,0.1)'  },
            { label: t('total_paid'),      val: result.total,    color: '#c4b5fd',  bg: 'rgba(139,92,246,0.1)'  },
            { label: t('total_interest'),  val: result.interest, color: '#f87171',  bg: 'rgba(239,68,68,0.1)'   },
          ].map(({ label, val, color, bg }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: bg, border: `1px solid ${color}30` }}>
              <div className="text-[10px] font-semibold uppercase mb-1 leading-tight" style={{ color }}>{label}</div>
              <div className="text-sm font-bold" style={{ color }}>₪{Math.round(val).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvestmentYieldCalc() {
  const { t } = useLang();
  const priceRef = useRef(), rentRef = useRef();
  const [result, setResult] = useState(null);

  const calc = () => {
    const p = parseFloat(priceRef.current.value.replace(/,/g, ''));
    const r = parseFloat(rentRef.current.value.replace(/,/g, ''));
    if (!p || !r) return;
    setResult(((r / p) * 100).toFixed(2));
  };

  const yieldColor = result ? (result >= 5 ? '#34d399' : result >= 3 ? '#fbbf24' : '#f87171') : null;
  const yieldBg    = result ? (result >= 5 ? 'rgba(16,185,129,0.1)' : result >= 3 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)') : null;
  const yieldLabel = result ? (result >= 5 ? '✅ השקעה מצוינת' : result >= 3 ? '⚠️ תשואה ממוצעת' : '❌ מתחת לממוצע השוק') : null;

  return (
    <div className="space-y-4">
      {[
        { label: t('property_price'), ref: priceRef, placeholder: '2000000' },
        { label: t('annual_rent'),    ref: rentRef,  placeholder: '84000'   },
      ].map(({ label, ref, placeholder }) => (
        <div key={label}>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>{label}</label>
          <input ref={ref} type="number" placeholder={placeholder} className="dark-input w-full px-4 py-2.5 text-sm" />
        </div>
      ))}
      <button onClick={calc} className="btn-gradient w-full py-2.5 rounded-xl text-sm font-semibold">{t('calc_yield')}</button>
      {result && (
        <div className="rounded-xl p-6 text-center mt-2" style={{ background: yieldBg, border: `1px solid ${yieldColor}40` }}>
          <div className="text-xs font-semibold uppercase mb-1" style={{ color: yieldColor }}>{t('gross_yield')}</div>
          <div className="text-5xl font-black mb-2" style={{ color: yieldColor }}>{result}%</div>
          <div className="text-sm" style={{ color: yieldColor }}>{yieldLabel}</div>
        </div>
      )}
    </div>
  );
}

const TABS = ['tab_tax', 'tab_mortgage', 'tab_yield'];
const CALCS = [PurchaseTaxCalc, MortgageCalc, InvestmentYieldCalc];

export default function ToolsPage() {
  const { t } = useLang();
  const [tab, setTab] = useState(0);
  const Calc = CALCS[tab];

  return (
    <div className="flex-1 px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">{t('tools_title')}</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>{t('tools_sub')}</p>
      </div>
      <div className="max-w-lg">
        <div className="flex rounded-xl p-1 mb-6 gap-1"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {TABS.map((key, i) => (
            <button key={key} onClick={() => setTab(i)}
              className="flex-1 py-2 text-sm font-medium rounded-lg transition-all"
              style={tab === i
                ? { background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: 'white' }
                : { color: '#64748b' }}>
              {t(key)}
            </button>
          ))}
        </div>
        <div className="card rounded-2xl p-6">
          <Calc />
        </div>
      </div>
    </div>
  );
}
