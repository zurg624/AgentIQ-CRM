const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

// Surface DB startup errors immediately rather than silently dying
let db;
try {
  db = require('./db');
} catch (err) {
  console.error('FATAL: DB failed to initialise:', err.message);
  process.exit(1);
}

const app = express();

// CORS — accept any origin listed in FRONTEND_URL (comma-separated),
// plus localhost for development. Falls back to allow all if not set.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:4173',
  ...( process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(',').map(u => u.trim()).filter(Boolean)
        : [] ),
]);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.size === 0 || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    // Also allow any *.vercel.app subdomain automatically
    if (/^https:\/\/[^.]+\.vercel\.app$/.test(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── SSE broadcast for toast notifications ────────────────────────────────────
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) client.write(msg);
}

// ── Claude: analyze lead ─────────────────────────────────────────────────────
async function analyzeLeadWithClaude(name, message, source) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      thinking: { type: 'adaptive' },
      system: `You are an expert Israeli real estate CRM assistant. Analyze incoming lead messages and return ONLY a valid JSON object (no markdown, no extra text) with these exact fields:
{
  "budget": "extracted budget range in ILS or null",
  "area": "city/neighborhood or null",
  "property_type": "apartment/house/penthouse/investment/etc or null",
  "rooms": "number of rooms or null",
  "urgency": "high/medium/low",
  "ai_summary": "2-3 sentence professional Hebrew summary of the lead",
  "next_step": "specific recommended next action in Hebrew"
}`,
      messages: [{
        role: 'user',
        content: `Lead name: ${name}\nSource: ${source}\nMessage: ${message || 'No message provided'}`
      }]
    });
    const response = await stream.finalMessage();
    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    return JSON.parse(text.trim());
  } catch (err) {
    console.error('Claude analysis error:', err.message);
    return null;
  }
}

// ── Claude: AI chat ──────────────────────────────────────────────────────────
async function chatWithClaude(message) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const stream = await anthropic.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 400,
    thinking: { type: 'adaptive' },
    system: `You are an expert Israeli real estate advisor embedded in a CRM system.
Answer questions in the same language the user writes in (Hebrew, English, Arabic, or Spanish).
Focus on: purchase tax (מס רכישה), mortgages, investment yields, Israeli market trends, legal checks.
Keep answers concise and practical. Use emojis sparingly. Format with bullet points when listing.`,
    messages: [{ role: 'user', content: message }]
  });
  const response = await stream.finalMessage();
  return response.content.find(b => b.type === 'text')?.text ?? '';
}

// ── Agents ───────────────────────────────────────────────────────────────────
app.get('/api/agents', (req, res) => {
  res.json(db.prepare('SELECT * FROM agents').all());
});

// ── Leads ────────────────────────────────────────────────────────────────────
const LEAD_SELECT = `
  SELECT l.*, a.name as agent_name
  FROM leads l
  LEFT JOIN agents a ON l.agent_id = a.id
  ORDER BY l.created_at DESC
`;

app.get('/api/leads', (req, res) => {
  res.json(db.prepare(LEAD_SELECT).all());
});

app.get('/api/leads/:id', (req, res) => {
  const lead = db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(lead);
});

// Create lead — analyze with Claude, broadcast SSE toast
app.post('/api/new-lead', async (req, res) => {
  const { name, phone, source = 'Manual', message = '', agent_id = null } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { owner_username = null } = req.body;
  const result = db.prepare(
    'INSERT INTO leads (name, phone, source, message, agent_id, owner_username) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, phone ?? null, source, message, agent_id, owner_username);

  const leadId = result.lastInsertRowid;

  // Respond immediately so the UI isn't blocked
  let lead = db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(leadId);
  res.status(201).json(lead);

  // Analyze in background, then update DB + broadcast
  const analysis = await analyzeLeadWithClaude(name, message, source);
  if (analysis) {
    const summary = `${analysis.ai_summary}${analysis.next_step ? '\n\n⚡ ' + analysis.next_step : ''}`;
    db.prepare('UPDATE leads SET ai_summary = ? WHERE id = ?').run(summary, leadId);
    lead = db.prepare(
      'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
    ).get(leadId);
  }

  broadcast('new-lead', lead);
});

// WhatsApp webhook (Make.com / Twilio)
app.post('/api/webhook/whatsapp', async (req, res) => {
  const { From, Body, ProfileName } = req.body;
  const name = ProfileName || From || 'WhatsApp Lead';
  const phone = From?.replace('whatsapp:', '') ?? null;

  if (!name && !phone) return res.status(400).json({ error: 'Invalid payload' });

  const result = db.prepare(
    'INSERT INTO leads (name, phone, source, message) VALUES (?, ?, ?, ?)'
  ).run(name, phone, 'WhatsApp', Body ?? '');

  const leadId = result.lastInsertRowid;
  let lead = db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(leadId);

  res.status(201).json(lead);

  const analysis = await analyzeLeadWithClaude(name, Body ?? '', 'WhatsApp');
  if (analysis) {
    const summary = `${analysis.ai_summary}${analysis.next_step ? '\n\n⚡ ' + analysis.next_step : ''}`;
    db.prepare('UPDATE leads SET ai_summary = ? WHERE id = ?').run(summary, leadId);
    lead = db.prepare(
      'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
    ).get(leadId);
  }

  broadcast('new-lead', lead);
});

app.patch('/api/leads/:id/agent', (req, res) => {
  const { agent_id } = req.body;
  db.prepare('UPDATE leads SET agent_id = ? WHERE id = ?').run(agent_id, req.params.id);
  const lead = db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(lead);
});

app.patch('/api/leads/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ id: parseInt(req.params.id), status });
});

app.patch('/api/leads/:id/ai-summary', (req, res) => {
  const { ai_summary } = req.body;
  db.prepare('UPDATE leads SET ai_summary = ? WHERE id = ?').run(ai_summary, req.params.id);
  res.json({ id: parseInt(req.params.id), ai_summary });
});

app.put('/api/leads/:id', (req, res) => {
  const { name, phone, source, message, notes, last_contacted } = req.body;
  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE leads SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      source = COALESCE(?, source),
      message = COALESCE(?, message),
      notes = COALESCE(?, notes),
      last_contacted = COALESCE(?, last_contacted)
    WHERE id = ?
  `).run(name ?? null, phone ?? null, source ?? null, message ?? null, notes ?? null, last_contacted ?? null, req.params.id);
  const updated = db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(req.params.id);
  res.json(updated);
});

app.delete('/api/leads/:id', (req, res) => {
  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ deleted: parseInt(req.params.id) });
});

app.post('/api/leads/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...ids);
  res.json({ deleted: result.changes });
});

// ── AI Chat (real Claude) ────────────────────────────────────────────────────
const AI_FALLBACK = {
  'מס רכישה': '🏠 מס רכישה בישראל (2025):\n• דירה ראשונה עד ₪1,978,745 — פטור\n• ₪1,978,745–₪2,347,040 — 3.5%\n• מעל ₪6,055,695 — 8%–10%',
  'mortgage':  '📊 Mortgage in Israel: max 75% LTV, avg rate ~4.5%–5.5%, up to 30 years.',
  'תשואה':    '💰 תשואה טובה: 4%–6%. תל אביב: 2.5%–3.5%. פריפריה: 5%–7%.',
};

app.post('/api/ai-chat', async (req, res) => {
  const message = req.body.message || '';
  try {
    const reply = await chatWithClaude(message);
    if (reply) return res.json({ reply });
  } catch (err) {
    console.error('AI chat error:', err.message);
  }
  // Fallback if no API key or error
  const msg = message.toLowerCase();
  const key = Object.keys(AI_FALLBACK).find(k => msg.includes(k.toLowerCase()));
  const reply = key ? AI_FALLBACK[key] : '🤔 אני יכול לעזור בנושאי נדל"ן: מס רכישה, משכנתאות, תשואות, ושוק הנדל"ן בישראל.';
  setTimeout(() => res.json({ reply }), 400);
});

// ── Property Hunter / Matching Engine ────────────────────────────────────────

const MOCK_PROPERTIES = [
  { id: 'p1',  title: "קרקע 2 דונם — כפר יונה",      area: 'כפר יונה',   type: 'קרקע',    rooms: null, price: 2_850_000, source: 'יד2',    mins: 18   },
  { id: 'p2',  title: "דירה 4 חד' — רמת גן",          area: 'רמת גן',     type: 'דירה',    rooms: 4,    price: 2_150_000, source: 'מדלן',   mins: 58   },
  { id: 'p3',  title: "דירה 3 חד' — ת\"א צפון",       area: 'תל אביב',    type: 'דירה',    rooms: 3,    price: 1_750_000, source: 'winwin', mins: 182  },
  { id: 'p4',  title: "פנטהאוז 5 חד' — הרצליה",       area: 'הרצליה',     type: 'פנטהאוז', rooms: 5,    price: 8_500_000, source: 'יד2',    mins: 5    },
  { id: 'p5',  title: "דירת גן 4 חד' — פ\"ת",         area: 'פתח תקווה',  type: 'דירה',    rooms: 4,    price: 1_900_000, source: 'מדלן',   mins: 240  },
  { id: 'p6',  title: "דירה 3 חד' — חיפה הדר",        area: 'חיפה',       type: 'דירה',    rooms: 3,    price: 1_200_000, source: 'יד2',    mins: 720  },
  { id: 'p7',  title: "בית פרטי 6 חד' — נתניה",       area: 'נתניה',      type: 'בית',     rooms: 6,    price: 3_800_000, source: 'winwin', mins: 1440 },
  { id: 'p8',  title: "דירה 2 חד' — ירושלים קטמון",  area: 'ירושלים',    type: 'דירה',    rooms: 2,    price: 1_650_000, source: 'מדלן',   mins: 30   },
  { id: 'p9',  title: "דירה 5 חד' — גבעתיים",         area: 'גבעתיים',    type: 'דירה',    rooms: 5,    price: 3_200_000, source: 'יד2',    mins: 120  },
  { id: 'p10', title: "נכס מסחרי 200מ\"ר — אשדוד",   area: 'אשדוד',      type: 'מסחרי',   rooms: null, price: 2_100_000, source: 'מדלן',   mins: 360  },
  { id: 'p11', title: "דירה 4 חד' — גבעת שמואל",     area: 'גבעת שמואל', type: 'דירה',    rooms: 4,    price: 2_600_000, source: 'יד2',    mins: 90   },
  { id: 'p12', title: "קוטג' 5 חד' — כפר סבא",       area: 'כפר סבא',    type: 'קוטג',    rooms: 5,    price: 3_100_000, source: 'winwin', mins: 210  },
];

function _parseBudget(msg) {
  if (!msg) return null;
  const mM = msg.match(/(\d[\d.,]*)M/i);
  if (mM) return parseFloat(mM[1].replace(/,/g, '')) * 1_000_000;
  const mMil = msg.match(/(\d[\d.,]*)\s*מיל/i);
  if (mMil) return parseFloat(mMil[1].replace(/,/g, '')) * 1_000_000;
  const mNum = msg.match(/(\d[\d,]{4,})/);
  if (mNum) return Number(mNum[1].replace(/,/g, ''));
  return null;
}

function _parseRooms(msg) {
  const m = msg?.match(/(\d+)\s*(?:חדרים?|חד'|rooms?|غرف)/i);
  return m ? parseInt(m[1]) : null;
}

function _parseArea(msg) {
  const AREAS = ['תל אביב','חיפה','ירושלים','גבעתיים','פתח תקווה','רמת גן','הרצליה','נתניה','באר שבע','אשדוד','ראשון לציון','כפר יונה','גבעת שמואל','כפר סבא'];
  for (const a of AREAS) { if ((msg || '').includes(a)) return a; }
  const m = msg?.match(/(?:באזור\s+|ב)([א-ת"]{2,14})/);
  return m?.[1] || null;
}

function calcScore(lead, prop) {
  const budget = _parseBudget(lead.message);
  const rooms  = _parseRooms(lead.message);
  const area   = _parseArea(lead.message);
  let score = 50;

  if (budget) {
    const ratio = prop.price / budget;
    if (ratio <= 0.95)       score += 30;
    else if (ratio <= 1.05)  score += 25;
    else if (ratio <= 1.20)  score += 15;
    else if (ratio <= 1.35)  score += 5;
    else return 0;
  } else { score += 8; }

  if (area && prop.area) {
    if (prop.area === area || prop.area.includes(area) || area.includes(prop.area)) score += 20;
  }

  if (rooms && prop.rooms) {
    if (prop.rooms === rooms) score += 15;
    else if (Math.abs(prop.rooms - rooms) === 1) score += 7;
  }

  return Math.min(score, 99);
}

app.get('/api/matches', (req, res) => {
  const leads = db.prepare("SELECT * FROM leads WHERE status != 'Closed'").all();
  const allMatches = [];

  for (const lead of leads) {
    for (const prop of MOCK_PROPERTIES) {
      const score = calcScore(lead, prop);
      if (score >= 65) allMatches.push({ id: `${lead.id}-${prop.id}`, lead, property: prop, score });
    }
  }

  allMatches.sort((a, b) => b.score - a.score);

  // Build per-lead profile summaries
  const profileMap = {};
  for (const m of allMatches) {
    const lid = m.lead.id;
    if (!profileMap[lid]) profileMap[lid] = { lead: m.lead, matches: [], best: m };
    profileMap[lid].matches.push(m);
    if (m.score > profileMap[lid].best.score) profileMap[lid].best = m;
  }

  const profiles = Object.values(profileMap)
    .sort((a, b) => b.matches.length - a.matches.length)
    .slice(0, 8)
    .map(p => ({ lead: p.lead, match_count: p.matches.length, best_property: p.best.property, best_score: p.best.score }));

  res.json({
    matches: allMatches.slice(0, 15),
    profiles,
    stats: { sources: ['יד2', 'מדלן', 'winwin'], scan_interval: 'כל שעה', today_matches: allMatches.length, active_profiles: profiles.length },
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'נדרש שם משתמש וסיסמה' });
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (!user) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  const token = Buffer.from(`${user.username}:${user.role}:${Date.now()}`).toString('base64');
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name } });
});

app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const [username] = Buffer.from(auth, 'base64').toString().split(':');
    const user = db.prepare('SELECT id, username, role, display_name FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    res.json(user);
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});

// ── Settings ──────────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.put('/api/settings', (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(updates => {
    for (const [k, v] of Object.entries(updates)) upsert.run(k, String(v));
  });
  tx(req.body);
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

// ── System reset ──────────────────────────────────────────────────────────────
app.post('/api/reset', (req, res) => {
  db.prepare('DELETE FROM leads').run();
  res.json({ ok: true });
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.get('/api/reports', (req, res) => {
  const leads = db.prepare('SELECT * FROM leads').all();

  const byStatus = {};
  const bySource = {};
  for (const l of leads) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    bySource[l.source] = (bySource[l.source] || 0) + 1;
  }

  const closedCount = byStatus['Closed'] || 0;
  const AVG_DEAL = 2_200_000;
  const COMMISSION = 0.02;
  const estimatedRevenue = closedCount * AVG_DEAL * COMMISSION;

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM leads GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse();

  const agentLeaderboard = db.prepare(`
    SELECT a.name, COUNT(l.id) as leads,
           SUM(CASE WHEN l.status = 'Closed' THEN 1 ELSE 0 END) as closed
    FROM agents a LEFT JOIN leads l ON l.agent_id = a.id
    GROUP BY a.id ORDER BY closed DESC, leads DESC
  `).all();

  res.json({ total: leads.length, byStatus, bySource, closedCount, estimatedRevenue, monthly, agentLeaderboard });
});

// ── Health check (Render pings this to verify the service is up) ─────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'AgentIQ CRM API' }));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`AgentIQ API on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
);
