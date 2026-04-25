const PLANS = [
  {
    key: 'basic',
    name: '⚡ בסיסי',
    price: 149,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
    features: [
      '✓ עד 50 לידים בחודש',
      '✓ CRM בסיסי',
      '✓ מחשבון עסקה',
      '✓ תמיכה במייל',
      '✗ AI Chatbot',
      '✗ שיווק AI',
      '✗ שכן חכם',
      '✗ צייד נכסים',
    ],
  },
  {
    key: 'pro',
    name: '🚀 מקצועי',
    price: 349,
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.1)',
    border: '#8b5cf6',
    popular: true,
    features: [
      '✓ לידים ללא הגבלה',
      '✓ CRM מלא + Analytics',
      '✓ AI Chatbot (Claude)',
      '✓ שיווק AI — פוסטים',
      '✓ שכן חכם',
      '✓ Follow-Up אוטומטי',
      '✗ צייד נכסים',
      '✓ תמיכה בוואטסאפ',
    ],
  },
  {
    key: 'elite',
    name: '💎 Elite',
    price: 699,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.3)',
    features: [
      '✓ הכל בחבילה מקצועי',
      '✓ צייד נכסים (FB + Yad2)',
      '✓ WhatsApp Automation',
      '✓ API Webhook מלא',
      '✓ White-label',
      '✓ מנהל חשבון אישי',
      '✓ הדרכה מקצועית',
      '✓ תמיכה 24/7',
    ],
  },
];

export default function PackagesPage() {
  return (
    <div className="flex-1 px-4 md:px-6 py-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">🪙 חבילות AgentIQ</h1>
        <p className="text-sm" style={{ color: '#64748b' }}>בחר את החבילה המתאימה לך — ניתן לשדרג בכל עת</p>
      </div>

      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {PLANS.map(plan => (
          <div key={plan.key} className="rounded-2xl p-6 flex flex-col relative"
            style={{
              background: plan.bg,
              border: `1px solid ${plan.border}`,
              boxShadow: plan.popular ? `0 0 30px ${plan.color}30` : '0 4px 24px rgba(0,0,0,0.3)',
            }}>

            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full"
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: 'white' }}>
                ⭐ הפופולרי ביותר
              </div>
            )}

            <div className="text-xl font-bold text-white mb-1">{plan.name}</div>
            <div className="flex items-end gap-1 mb-6">
              <span className="text-4xl font-black" style={{ color: plan.color }}>₪{plan.price}</span>
              <span className="text-sm mb-1.5" style={{ color: '#64748b' }}>/ חודש</span>
            </div>

            <ul className="space-y-2.5 flex-1 mb-6">
              {plan.features.map((f, i) => (
                <li key={i} className="text-sm flex items-center gap-2"
                  style={{ color: f.startsWith('✓') ? '#e2e8f0' : '#334155' }}>
                  {f}
                </li>
              ))}
            </ul>

            <button className="w-full py-3 rounded-xl text-sm font-bold transition-all"
              style={plan.popular
                ? { background: `linear-gradient(135deg,#8b5cf6,#6366f1)`, color: 'white' }
                : { background: `${plan.color}20`, color: plan.color, border: `1px solid ${plan.color}40` }
              }>
              {plan.key === 'pro' ? 'החבילה הנוכחית' : 'התחל עכשיו'}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-10 card rounded-2xl p-6 max-w-2xl mx-auto text-center">
        <div className="text-lg font-bold text-white mb-2">צריך משהו מותאם אישית? 🤝</div>
        <p className="text-sm mb-4" style={{ color: '#64748b' }}>
          לסוכנויות גדולות עם 10+ סוכנים — נציע הצעת מחיר מיוחדת כולל הטמעה ואינטגרציות
        </p>
        <a href="https://wa.me/972500000000?text=שלום, אני מעוניין בחבילה מותאמת לסוכנות שלי"
          target="_blank" rel="noreferrer"
          className="inline-block btn-gradient px-8 py-3 rounded-xl text-sm font-bold">
          💬 דבר עם צוות המכירות
        </a>
      </div>
    </div>
  );
}
