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

// Supabase / PostgreSQL — active when DATABASE_URL is set
const { ensurePgSchema, pgInsertProperty } = require('./pgClient');
ensurePgSchema(); // verify / create table on startup

const app = express();

// ── Request logger (shows every hit in Render logs) ──────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms) origin=${req.headers.origin || 'none'}`);
  });
  next();
});

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

// ── Lead Ingestion Engine ─────────────────────────────────────────────────────

/**
 * Normalize the body sent by various callers into a flat array of property objects.
 *
 * Supported shapes:
 *   • Single object        { title, price, … }
 *   • Array                [{ title, price, … }, …]          ← Apify default
 *   • Wrapped array        { items: […] }  |  { data: […] }  ← some integrations
 *   • Apify webhook event  { resource: { … }, eventType: … } ← ignored (no dataset)
 */
function normalizeIngestBody(body) {
  if (Array.isArray(body))              return body;
  if (Array.isArray(body?.items))       return body.items;
  if (Array.isArray(body?.data))        return body.data;
  if (Array.isArray(body?.results))     return body.results;
  // Single plain object with at least a title or price field
  if (body && (body.title || body.price)) return [body];
  return [];
}

// Resolve the ingest API key.
// Checks (in order): INGEST_API_KEY env → API_KEY env → DB-stored key.
// This matches whatever variable name is already set on Render.
function getExpectedKey() {
  if (process.env.INGEST_API_KEY) return process.env.INGEST_API_KEY;
  if (process.env.API_KEY)        return process.env.API_KEY;
  try {
    return db.prepare("SELECT value FROM settings WHERE key = 'ingest_api_key'").get()?.value || null;
  } catch { return null; }
}

// Matching score for ingested properties against leads
function calcIngestScore(lead, prop) {
  const budget = _parseBudget(lead.message);
  const rooms  = _parseRooms(lead.message);
  const area   = _parseArea(lead.message);
  let score = 0;

  // Budget (40 pts)
  if (budget && prop.price) {
    const ratio = prop.price / budget;
    if (ratio <= 0.90)      score += 40;
    else if (ratio <= 1.05) score += 35;
    else if (ratio <= 1.20) score += 20;
    else if (ratio <= 1.35) score += 10;
    else return 0;
  } else { score += 12; }

  // City / area (30 pts)
  const propLoc = `${prop.city || ''} ${prop.area || ''}`.trim().toLowerCase();
  const leadMsg = (lead.message || '').toLowerCase();
  if (propLoc) {
    const locWords = propLoc.split(/\s+/);
    if (locWords.some(w => w.length > 1 && leadMsg.includes(w))) score += 30;
    else if (area && propLoc.includes(area.toLowerCase()))        score += 20;
  }

  // Rooms (20 pts)
  if (rooms && prop.rooms) {
    if (rooms === prop.rooms)                    score += 20;
    else if (Math.abs(rooms - prop.rooms) === 1) score += 10;
  } else { score += 7; }

  // Type bonus (10 pts)
  const typeKeywords = { 'דירה':['דירה','apartment'], 'בית':['בית','house','וילה'], 'פנטהאוז':['פנטהאוז','penthouse'] };
  const pt = (prop.type || '').toLowerCase();
  for (const [k, kws] of Object.entries(typeKeywords)) {
    if (pt.includes(k) && kws.some(w => leadMsg.includes(w))) { score += 10; break; }
  }

  return Math.min(score, 99);
}

/**
 * Core ingest logic — shared by /api/ingest/property and /api/ingest/apify.
 * Writes to SQLite (matching engine) AND Supabase (persistence).
 * Returns { property, matches }.
 */
async function ingestOneProperty(item) {
  const { title, price, city, area, type, rooms, sqm, url, source = 'API', description } = item;

  // ── 1. SQLite (local matching engine) ──────────────────────────
  const ins = db.prepare(`
    INSERT INTO properties (title, price, city, area, type, rooms, sqm, url, source, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, Number(price), city||null, area||null, type||null,
         rooms||null, sqm||null, url||null, source, description||null);

  const propId = ins.lastInsertRowid;
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propId);

  // ── 2. Supabase / PostgreSQL (persistent cloud storage) ────────
  const pgRow = await pgInsertProperty({ title, price, city, area, type, rooms, sqm, url, source, description });
  if (pgRow) {
    console.log(`[ingest] Supabase ✓ id=${pgRow.id} "${title}"`);
  } else {
    console.warn(`[ingest] Supabase write skipped/failed for "${title}"`);
  }

  // ── 3. Match against active leads ──────────────────────────────
  const leads = db.prepare("SELECT * FROM leads WHERE status != 'Closed'").all();
  const matches = [];

  for (const lead of leads) {
    const score = calcIngestScore(lead, property);
    if (score >= 80) {
      const msg = `🏠 התאמה חדשה: "${title}" — ${score}% עבור ${lead.name}`;
      const notifIns = db.prepare(`
        INSERT INTO notifications (lead_id, property_id, score, message, owner_username)
        VALUES (?, ?, ?, ?, ?)
      `).run(lead.id, propId, score, msg, lead.owner_username || 'admin');

      const notif = db.prepare(`
        SELECT n.*, l.name as lead_name, p.title as prop_title, p.city as prop_city
        FROM notifications n
        JOIN leads l ON n.lead_id = l.id
        JOIN properties p ON n.property_id = p.id
        WHERE n.id = ?
      `).get(notifIns.lastInsertRowid);

      matches.push(notif);
      broadcast('new-match', notif);
    }
  }

  return { property, matches };
}

// POST /api/ingest/property — single or array, any integration
app.post('/api/ingest/property', async (req, res) => {
  console.log('[ingest/property] body preview:', JSON.stringify(req.body).slice(0, 300));

  // API key check (env var beats DB-stored key; missing key = open access)
  const expectedKey = getExpectedKey();
  const sentKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (expectedKey && sentKey && sentKey !== expectedKey) {
    console.warn('[ingest/property] rejected — API key mismatch');
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const items = normalizeIngestBody(req.body);
  console.log(`[ingest/property] normalized to ${items.length} item(s)`);

  if (items.length === 0) {
    return res.status(400).json({
      error: 'No valid property data found.',
      hint: 'Send { title, price, ... } or an array of such objects.',
      received: JSON.stringify(req.body).slice(0, 200),
    });
  }

  const results = [];
  for (const item of items) {
    if (!item.title || !item.price) {
      console.warn('[ingest/property] skipping item — missing title or price:', JSON.stringify(item).slice(0, 100));
      results.push({ skipped: true, reason: 'missing title or price', item });
      continue;
    }
    try {
      const r = await ingestOneProperty(item);
      results.push(r);
      console.log(`[ingest/property] ✓ "${item.title}" — ${r.matches.length} match(es)`);
    } catch (err) {
      console.error('[ingest/property] error:', err.message);
      results.push({ error: err.message, item });
    }
  }

  const ok = results.filter(r => r.property);
  res.status(201).json({
    processed: ok.length,
    total_matches: ok.reduce((s, r) => s + (r.matches?.length || 0), 0),
    results,
  });
});

/**
 * POST /api/ingest/apify — dedicated endpoint for Apify HTTP Integration.
 *
 * Apify can send its dataset in several ways depending on how you configure
 * the HTTP Integration. All common shapes are handled:
 *
 *   1. Apify HTTP Integration "Send dataset as JSON body" → array at root
 *   2. Apify Webhook payload               → { resource, eventType, … }
 *      (we ignore these — no dataset in the webhook body itself)
 *   3. Custom actor output                 → any nested shape
 *
 * No API key required on this endpoint — secure it via Render's network if needed.
 */
app.post('/api/ingest/apify', async (req, res) => {
  console.log('[ingest/apify] received, keys:', Object.keys(req.body || {}).join(', '));
  console.log('[ingest/apify] body preview:', JSON.stringify(req.body).slice(0, 400));

  // Apify webhook event (no data payload, just a trigger)
  if (req.body?.eventType) {
    const status = req.body.resource?.status;
    console.log(`[ingest/apify] Apify webhook event: ${req.body.eventType}, run status: ${status}`);
    // Acknowledge immediately — we can't pull dataset from webhook body
    return res.json({
      received: true,
      note: 'Apify webhook event acknowledged. To send property data, use "Send dataset as JSON body" in the HTTP Integration settings.',
    });
  }

  const items = normalizeIngestBody(req.body);
  console.log(`[ingest/apify] ${items.length} item(s) after normalization`);

  if (items.length === 0) {
    return res.status(400).json({
      error: 'No property items found in payload.',
      hint: 'In Apify → HTTP Integration, set "Payload format" to "Dataset: JSON" so the full dataset array is sent in the request body.',
      received_keys: Object.keys(req.body || {}),
    });
  }

  const results = [];
  for (const item of items) {
    // Apify actors may use different field names — normalise common variants
    const normalised = {
      title:       item.title       || item.name        || item.headline   || item.propertyTitle || '',
      price:       item.price       || item.askingPrice  || item.cost       || item.priceILS      || 0,
      city:        item.city        || item.location     || item.cityName   || null,
      area:        item.area        || item.neighborhood || item.district   || null,
      type:        item.type        || item.propertyType || item.category   || null,
      rooms:       item.rooms       || item.roomCount    || item.bedrooms   || null,
      sqm:         item.sqm         || item.squareMeters || item.size       || null,
      url:         item.url         || item.link         || item.detailUrl  || null,
      source:      item.source      || item.platform     || 'Apify',
      description: item.description || item.details      || item.text       || null,
    };

    if (!normalised.title || !normalised.price) {
      console.warn('[ingest/apify] skipping — missing title/price after normalisation:', JSON.stringify(item).slice(0,150));
      results.push({ skipped: true, reason: 'missing title or price', raw_item: item });
      continue;
    }

    try {
      const r = await ingestOneProperty(normalised);
      results.push(r);
      console.log(`[ingest/apify] ✓ "${normalised.title}" price=${normalised.price} matches=${r.matches.length}`);
    } catch (err) {
      console.error('[ingest/apify] error:', err.message);
      results.push({ error: err.message, item: normalised });
    }
  }

  const ok = results.filter(r => r.property);
  console.log(`[ingest/apify] done — ${ok.length}/${items.length} saved, ${ok.reduce((s,r)=>s+(r.matches?.length||0),0)} match notifications`);

  res.status(201).json({
    processed: ok.length,
    skipped:   results.filter(r => r.skipped).length,
    total_matches: ok.reduce((s, r) => s + (r.matches?.length || 0), 0),
    results,
  });
});

// GET /api/ingest/properties — list of recently ingested properties
app.get('/api/ingest/properties', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(db.prepare('SELECT * FROM properties ORDER BY ingested_at DESC LIMIT ?').all(limit));
});

// GET /api/notifications
app.get('/api/notifications', (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, l.name as lead_name, p.title as prop_title, p.city as prop_city, p.price as prop_price
    FROM notifications n
    JOIN leads l ON n.lead_id = l.id
    JOIN properties p ON n.property_id = p.id
    ORDER BY n.created_at DESC LIMIT 50
  `).all();
  res.json(rows);
});

// PATCH /api/notifications/:id/read
app.patch('/api/notifications/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/notifications/read-all
app.post('/api/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1').run();
  res.json({ ok: true });
});

// POST /api/ingest/test — sends a test property through the full engine (SQLite + Supabase)
app.post('/api/ingest/test', async (req, res) => {
  const testItem = {
    title: `נכס בדיקה — דירה 4 חד' רמת גן ${new Date().toLocaleTimeString('he-IL')}`,
    price: 2_400_000, city: 'רמת גן', area: 'בורסה',
    type: 'דירה', rooms: 4, sqm: 105,
    source: 'Test', description: 'פינוי בינוי, חניה, מרפסת',
  };
  try {
    const r = await ingestOneProperty(testItem);
    res.json({ property: r.property, matches_found: r.matches.length, matches: r.matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Smart Neighbor — AI neighborhood report ───────────────────────────────────
function mockNeighborReport(address) {
  const city = ['תל אביב','רמת גן','ירושלים','חיפה','נתניה','פתח תקווה','ראשון לציון','הרצליה']
    .find(c => address.includes(c)) || 'המרכז';
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
    address, city,
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
      description:`נגישות תחבורתית ${d.transport>=9?'מצוינת':'טובה מאוד'} — תחבורה ציבורית צפופה ועתידות להרחבה.` },
    development: { activity_level: d.invest>=80?'גבוה':'בינוני',
      projects:[
        {name:'תמ"א 38/2',type:'תמ"א 38',status:'בתכנון מתקדם',impact:'positive'},
        {name:'פינוי-בינוי מתחם ותיק',type:'פינוי בינוי',status:'אושר בוועדה',impact:'positive'},
        {name:'הרחבת תשתיות תחבורה',type:'תשתיות',status:'בביצוע',impact:'positive'},
      ],
      description:`פעילות התחדשות עירונית ענפה. מספר פרויקטים של תמ"א 38 ופינוי-בינוי צפויים להעלות את ערך הנכסים.` },
    demographics: { avg_age:36, dominant_group:'משפחות צעירות ואנשי מקצוע', income_level:d.income,
      description:`האוכלוסייה מורכבת בעיקר ממשפחות בגילאי 28–45. רמת ההכנסה ${d.income} — מעל הממוצע הארצי.` },
    investment_score: d.invest,
    investment_summary:`האזור מהווה השקעה ${d.invest>=82?'מצוינת':'טובה מאוד'} לטווח הבינוני-ארוך עם פוטנציאל עלייה של ${d.trend}%+ בשנה.`,
  };
}

app.post('/api/smart-neighbor', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });

  if (!process.env.ANTHROPIC_API_KEY) return res.json(mockNeighborReport(address));

  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: `You are an expert Israeli real estate market analyst with deep knowledge of neighborhoods, schools, transport, urban development (TAMA 38, Pinui-Binui), and demographics across Israel.
Generate detailed, realistic neighborhood intelligence reports in JSON.
Return ONLY valid JSON — no markdown fences, no extra text.`,
      messages: [{ role: 'user', content: `Generate a neighborhood intelligence report for: "${address}"

Return this exact JSON structure (all text in Hebrew except field names):
{
  "address": "full address as given",
  "city": "city name",
  "market_value": {
    "price_per_sqm": <integer ILS>,
    "trend_pct": <float yearly % change>,
    "trend_direction": "up"|"down"|"stable",
    "avg_deal_price": <integer ILS>,
    "description": "<2 sentences Hebrew>"
  },
  "schools": {
    "overall_rating": <integer 1-10>,
    "items": [{"name":"<Hebrew>","type":"יסודי|חטיבה|תיכון","distance":"<X מ'>","rating":"A|B|C"}],
    "description": "<Hebrew>"
  },
  "transport": {
    "accessibility_score": <integer 1-10>,
    "items": ["<Hebrew line description>"],
    "description": "<Hebrew>"
  },
  "development": {
    "activity_level": "גבוה|בינוני|נמוך",
    "projects": [{"name":"<Hebrew>","type":"תמ\"א 38|פינוי בינוי|תשתיות|מסחרי","status":"<Hebrew>","impact":"positive|negative|neutral"}],
    "description": "<Hebrew>"
  },
  "demographics": {
    "avg_age": <integer>,
    "dominant_group": "<Hebrew>",
    "income_level": "גבוה|בינוני-גבוה|בינוני|נמוך",
    "description": "<Hebrew>"
  },
  "investment_score": <integer 1-100>,
  "investment_summary": "<2 sentences Hebrew investment recommendation>"
}` }]
    });
    const msg = await stream.finalMessage();
    const text = msg.content.find(b => b.type === 'text')?.text ?? '';
    const report = JSON.parse(text.trim());
    res.json(report);
  } catch (err) {
    console.error('[smart-neighbor] error:', err.message);
    // Fallback to mock on parse/API error
    res.json(mockNeighborReport(address));
  }
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

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'AgentIQ CRM API' }));
app.get('/health', async (req, res) => {
  const { pool } = require('./pgClient');
  let pgStatus = 'not configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      pgStatus = 'connected';
    } catch (e) {
      pgStatus = `error: ${e.message}`;
    }
  }
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    sqlite: 'ok',
    supabase: pgStatus,
    ingest_key_set: !!(process.env.INGEST_API_KEY || db.prepare("SELECT value FROM settings WHERE key='ingest_api_key'").get()?.value),
    endpoints: {
      ingest_single:  'POST /api/ingest/property',
      ingest_apify:   'POST /api/ingest/apify',
      ingest_test:    'POST /api/ingest/test',
    },
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`AgentIQ API on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
);
