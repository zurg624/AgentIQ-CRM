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

// Supabase — active when SUPABASE_URL + SUPABASE_SERVICE_KEY are set
const { ensurePgSchema, pgInsertProperty, checkSupabaseHealth } = require('./pgClient');
ensurePgSchema(); // verify / create table on startup

// Auth middleware — admin-only routes use requireAdmin
const { requireAdmin } = require('./middleware/auth');

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

// Parse the custom_fields JSON column into an object for the API consumer.
// Run every lead row through this before returning it.
function hydrateLead(row) {
  if (!row) return row;
  try {
    row.custom_fields = row.custom_fields ? JSON.parse(row.custom_fields) : {};
  } catch {
    row.custom_fields = {};
  }
  return row;
}

app.get('/api/leads', (req, res) => {
  res.json(db.prepare(LEAD_SELECT).all().map(hydrateLead));
});

app.get('/api/leads/:id', (req, res) => {
  const lead = db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(hydrateLead(lead));
});

// Create lead — analyze with Claude, broadcast SSE toast
app.post('/api/new-lead', async (req, res) => {
  const { name, phone, source = 'Manual', message = '', agent_id = null, custom_fields = null } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { owner_username = null } = req.body;
  const customJson = custom_fields ? (typeof custom_fields === 'string' ? custom_fields : JSON.stringify(custom_fields)) : '{}';
  const result = db.prepare(
    'INSERT INTO leads (name, phone, source, message, agent_id, owner_username, custom_fields) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, phone ?? null, source, message, agent_id, owner_username, customJson);

  const leadId = result.lastInsertRowid;

  // Respond immediately so the UI isn't blocked
  let lead = hydrateLead(db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(leadId));
  res.status(201).json(lead);

  // Analyze in background, then update DB + broadcast
  const analysis = await analyzeLeadWithClaude(name, message, source);
  if (analysis) {
    const summary = `${analysis.ai_summary}${analysis.next_step ? '\n\n⚡ ' + analysis.next_step : ''}`;
    db.prepare('UPDATE leads SET ai_summary = ? WHERE id = ?').run(summary, leadId);
    lead = hydrateLead(db.prepare(
      'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
    ).get(leadId));
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
  let lead = hydrateLead(db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(leadId));

  res.status(201).json(lead);

  const analysis = await analyzeLeadWithClaude(name, Body ?? '', 'WhatsApp');
  if (analysis) {
    const summary = `${analysis.ai_summary}${analysis.next_step ? '\n\n⚡ ' + analysis.next_step : ''}`;
    db.prepare('UPDATE leads SET ai_summary = ? WHERE id = ?').run(summary, leadId);
    lead = hydrateLead(db.prepare(
      'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
    ).get(leadId));
  }

  broadcast('new-lead', lead);
});

app.patch('/api/leads/:id/agent', (req, res) => {
  const { agent_id } = req.body;
  db.prepare('UPDATE leads SET agent_id = ? WHERE id = ?').run(agent_id, req.params.id);
  const lead = hydrateLead(db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(req.params.id));
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
  const { name, phone, source, message, notes, last_contacted, custom_fields } = req.body;
  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });

  // Accept custom_fields as either an object or a JSON string
  const customJson = custom_fields !== undefined && custom_fields !== null
    ? (typeof custom_fields === 'string' ? custom_fields : JSON.stringify(custom_fields))
    : null;

  db.prepare(`
    UPDATE leads SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      source = COALESCE(?, source),
      message = COALESCE(?, message),
      notes = COALESCE(?, notes),
      last_contacted = COALESCE(?, last_contacted),
      custom_fields = COALESCE(?, custom_fields)
    WHERE id = ?
  `).run(
    name ?? null, phone ?? null, source ?? null, message ?? null,
    notes ?? null, last_contacted ?? null, customJson,
    req.params.id
  );

  const updated = hydrateLead(db.prepare(
    'SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.id = ?'
  ).get(req.params.id));
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

// POST /api/ingest/apify — Apify webhook: fetches dataset from Apify API, upserts to Supabase
app.use('/api/ingest/apify',
  require('./routes/ingestApify')({ db, broadcast, ingestOneProperty })
);

// /api/properties — Supabase-backed CRUD (list, update, delete, assign)
app.use('/api/properties', require('./routes/propertiesApi')());

// ── Shared Apify runner ───────────────────────────────────────────────────────
// Both /api/apify/run and /api/apify/run/all-groups call this.
// Validates env vars, resolves startUrls, fires the Apify API call.
// Returns a resolved promise so callers can await + wrap in try/catch.
async function runApifyActor(body, res) {
  const token   = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token)   return res.status(503).json({ error: 'APIFY_TOKEN not configured on server' });
  if (!actorId) return res.status(503).json({ error: 'APIFY_ACTOR_ID not configured on server' });

  // ── Build startUrls ────────────────────────────────────────────────────────
  let startUrls = body?.startUrls; // may be [{url:…}, …] or null

  // If the caller sent a plain string URL, normalise it
  if (typeof startUrls === 'string' && startUrls.trim()) {
    startUrls = [{ url: startUrls.trim() }];
  }

  // Fall back to APIFY_START_URLS env var
  if (!Array.isArray(startUrls) || startUrls.length === 0) {
    const envUrls = process.env.APIFY_START_URLS;
    if (envUrls) {
      startUrls = envUrls
        .split(',')
        .map(u => u.trim())
        .filter(Boolean)
        .map(u => ({ url: u }));
    }
  }

  if (!Array.isArray(startUrls) || startUrls.length === 0) {
    return res.status(400).json({
      error: 'No Facebook group URLs configured.',
      fix:   'Set APIFY_START_URLS on Render (comma-separated FB group URLs), or pass startUrls in the request body.',
    });
  }

  // Strip internal diagnostic fields (prefixed with `_`) before sending to Apify
  const cleanBody = Object.fromEntries(
    Object.entries(body || {}).filter(([k]) => !k.startsWith('_'))
  );
  const actorInput = { ...cleanBody, startUrls };

  console.log(`[apify/run] actor=${actorId} startUrls=${startUrls.length} maxItems=${actorInput.maxItems ?? 'unbounded'} perGroup=${actorInput.resultsPerStartUrl ?? 'unbounded'}`);

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(actorInput),
    }
  );
  const runData = await runRes.json();
  if (!runRes.ok) {
    return res.status(runRes.status).json({
      error:  runData?.error?.message || 'Apify API error',
      detail: runData,
    });
  }
  console.log(`[apify/run] started — runId=${runData.data?.id}`);
  res.json({ ok: true, runId: runData.data?.id, status: runData.data?.status, actorId });
}

// POST /api/apify/run — trigger an Apify Actor run on demand (ADMIN-ONLY: cost control)
//
// Input resolution (first truthy source wins):
//   1. req.body.startUrls  — passed explicitly from the frontend
//   2. APIFY_START_URLS env — comma-separated list of FB group URLs set on Render
//   3. Error 400           — user must configure at least one source
//
// Required Render env vars:
//   APIFY_TOKEN      – Apify personal access token
//   APIFY_ACTOR_ID   – Actor ID, e.g. "apify/facebook-groups-scraper"
//   APIFY_START_URLS – comma-separated FB group URLs (default when none supplied)
app.post('/api/apify/run', requireAdmin, async (req, res) => {
  try {
    await runApifyActor(req.body, res);
  } catch (err) {
    console.error('[apify/run] unhandled error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// POST /api/apify/run/all-groups — cost-optimised mass scrape (ADMIN-ONLY)
//
// Cost knobs (all overridable via request body):
//   • maxItems              7   — total items returned across all groups
//   • resultsPerStartUrl    3   — only fetch the 3 newest posts per group
//   • saturationThreshold  10   — skip categories whose cities are already full
//   • respectTimeWindow  true   — only run between 08:30-20:30 Israel time
//   • force              false  — bypass time window AND saturation skip
//
// Why this matters: Apify charges per CU. 30 groups × 3 posts = ~90 page loads/run.
// 7 runs/day = ~630 page loads/day — well within free-tier limits.
app.post('/api/apify/run/all-groups', requireAdmin, async (req, res) => {
  try {
    const fbGroups   = require('./FACEBOOK_GROUPS');
    const propsRoute = require('./routes/propertiesApi');

    const body = req.body || {};
    const force               = !!body.force;
    const respectTimeWindow   = body.respectTimeWindow !== false;  // default true
    const maxItems            = parseInt(body.maxItems, 10)           || 7;
    const resultsPerStartUrl  = parseInt(body.resultsPerStartUrl, 10) || 3;
    const saturationThreshold = parseInt(body.saturationThreshold, 10) || propsRoute.SATURATION_THRESHOLD;

    // ── Time window guard (Israel time, 08:30-20:30) ──────────────────────
    if (respectTimeWindow && !force) {
      const ilNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
      const minutesOfDay = ilNow.getHours() * 60 + ilNow.getMinutes();
      const WINDOW_START = 8 * 60 + 30;   // 08:30
      const WINDOW_END   = 20 * 60 + 30;  // 20:30
      if (minutesOfDay < WINDOW_START || minutesOfDay > WINDOW_END) {
        console.log(`[apify/all-groups] skipped — outside scrape window (IL time: ${ilNow.getHours()}:${String(ilNow.getMinutes()).padStart(2,'0')})`);
        return res.json({
          ok: false,
          skipped: 'outside_time_window',
          window: '08:30-20:30 Asia/Jerusalem',
          current_il_time: ilNow.toISOString(),
        });
      }
    }

    // ── Saturation check — skip categories whose cities are already full ───
    let skipCategories = new Set();
    let saturationDetails = {};
    if (!force) {
      try {
        const counts = await propsRoute.getCityFreshCounts();
        for (const [cat, cities] of Object.entries(fbGroups.CATEGORY_CITIES)) {
          if (cities.length === 0) continue;  // 'national' / 'investor' — never skip
          const totals = cities.map(c => counts.get(c) || 0);
          const saturated = totals.every(n => n >= saturationThreshold);
          if (saturated) {
            skipCategories.add(cat);
            saturationDetails[cat] = Object.fromEntries(cities.map((c, i) => [c, totals[i]]));
          }
        }
      } catch (e) {
        console.warn('[apify/all-groups] saturation check failed (continuing):', e.message);
      }
    }

    const startUrls = skipCategories.size > 0
      ? fbGroups.urlsExcludingCategories(skipCategories)
      : fbGroups.allGroupUrls();

    if (!startUrls || startUrls.length === 0) {
      return res.json({
        ok: false,
        skipped: 'all_categories_saturated',
        threshold: saturationThreshold,
        saturation_details: saturationDetails,
      });
    }

    console.log(`[apify/all-groups] groups=${startUrls.length} maxItems=${maxItems} perGroup=${resultsPerStartUrl} skipped=[${[...skipCategories].join(',') || 'none'}]`);

    await runApifyActor({
      ...body,
      startUrls,
      maxItems,
      resultsPerStartUrl,
      _saturation_skipped: [...skipCategories],
    }, res);

  } catch (err) {
    console.error('[apify/all-groups] unhandled error:', err.message, err.stack);
    if (!res.headersSent) res.status(500).json({ error: err.message, stack: err.stack });
  }
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
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name, plan: user.plan || 'base' } });
});

app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const [username] = Buffer.from(auth, 'base64').toString().split(':');
    const user = db.prepare('SELECT id, username, role, display_name, plan FROM users WHERE username = ?').get(username);
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

app.put('/api/settings', requireAdmin, (req, res) => {
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
// ADMIN-ONLY: wipes all leads — destructive, irreversible
app.post('/api/reset', requireAdmin, (req, res) => {
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

// ── Custom Fields ────────────────────────────────────────────────────────────
//
// Two-table model:
//   custom_field_definitions  — admin-managed list of "what fields exist"
//   leads.custom_fields       — JSON column with per-lead values
//
// Read endpoints are open to all authenticated users (agents need to render
// the form). Write endpoints (create / update / delete) are admin-only.
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'phone', 'url', 'textarea'];

// Hydrate a definition row for the API consumer (parse options JSON)
function hydrateFieldDef(row) {
  if (!row) return row;
  let opts = [];
  if (row.options) {
    try { opts = JSON.parse(row.options); } catch { opts = []; }
  }
  return { ...row, options: opts, required: !!row.required };
}

app.get('/api/custom-fields', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM custom_field_definitions ORDER BY position ASC, id ASC'
  ).all();
  res.json(rows.map(hydrateFieldDef));
});

app.post('/api/custom-fields', requireAdmin, (req, res) => {
  const { field_key, label, field_type, options, required, position } = req.body;

  if (!field_key || !label || !field_type) {
    return res.status(400).json({ error: 'field_key, label, and field_type are required' });
  }
  if (!FIELD_TYPES.includes(field_type)) {
    return res.status(400).json({ error: `field_type must be one of: ${FIELD_TYPES.join(', ')}` });
  }
  // field_key is used as a JSON object key in leads.custom_fields — keep it
  // safe for cross-language interop and URL paths.
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(field_key)) {
    return res.status(400).json({
      error: 'field_key must start with a lowercase letter and contain only a-z, 0-9, and _',
    });
  }
  if (field_type === 'select' && (!Array.isArray(options) || options.length === 0)) {
    return res.status(400).json({ error: 'select fields require a non-empty options array' });
  }

  try {
    const r = db.prepare(`
      INSERT INTO custom_field_definitions (field_key, label, field_type, options, required, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      field_key,
      label,
      field_type,
      Array.isArray(options) && options.length ? JSON.stringify(options) : null,
      required ? 1 : 0,
      Number.isInteger(position) ? position : 0,
    );
    const row = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(hydrateFieldDef(row));
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: `field_key "${field_key}" already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/custom-fields/:id', requireAdmin, (req, res) => {
  const { label, field_type, options, required, position } = req.body;
  const existing = db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (field_type !== undefined && !FIELD_TYPES.includes(field_type)) {
    return res.status(400).json({ error: `field_type must be one of: ${FIELD_TYPES.join(', ')}` });
  }

  db.prepare(`
    UPDATE custom_field_definitions SET
      label      = COALESCE(?, label),
      field_type = COALESCE(?, field_type),
      options    = COALESCE(?, options),
      required   = COALESCE(?, required),
      position   = COALESCE(?, position)
    WHERE id = ?
  `).run(
    label ?? null,
    field_type ?? null,
    Array.isArray(options) ? JSON.stringify(options) : null,
    required === undefined ? null : (required ? 1 : 0),
    Number.isInteger(position) ? position : null,
    req.params.id,
  );

  const row = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(req.params.id);
  res.json(hydrateFieldDef(row));
});

app.delete('/api/custom-fields/:id', requireAdmin, (req, res) => {
  // Note: leads keep their stored values in custom_fields JSON even after the
  // definition is removed. They're harmless extra keys — just won't render.
  // If you want a hard purge, add a vacuum job that strips orphaned keys.
  const r = db.prepare('DELETE FROM custom_field_definitions WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, deleted: parseInt(req.params.id) });
});

// ── Marketing AI — generate 3 platform-tuned variations in one Claude call ──
//
// POST /api/marketing/generate
// Body:    { type, rooms, area, price, feature?, sqm?, floor? }
// Returns: { story, group, marketplace }
app.post('/api/marketing/generate', async (req, res) => {
  const { type = 'דירה', rooms, area, price, feature, sqm, floor } = req.body;

  if (!area || !price) {
    return res.status(400).json({ error: 'area and price are required' });
  }

  const priceFmt = `₪${Number(price).toLocaleString('he-IL')}`;
  const meta = [
    type,
    rooms ? `${rooms} חדרים` : null,
    sqm   ? `${sqm} מ"ר`     : null,
    floor ? `קומה ${floor}` : null,
    feature || null,
  ].filter(Boolean).join(' · ');

  // Mock fallback when no Claude key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({
      story:       `🔥🏠 ${type} ${rooms || ''} חד' ב${area}!\n💰 ${priceFmt}\n→ DM עכשיו`,
      group:       `שלום חברים 🙋\nהזדמנות חמה ב${area} — ${type} ${rooms || ''} חדרים, ${priceFmt}.\n${feature ? '✨ ' + feature : ''}\nמי שמתעניין — שלחו לי פרטית!`,
      marketplace: `${type} ב${area}\n💵 ${priceFmt}\n${rooms ? `🚪 ${rooms} חדרים` : ''}\n${sqm ? `📐 ${sqm} מ"ר` : ''}\n${feature ? `✅ ${feature}` : ''}\n📞 לתיאום צפייה: השאירו תגובה`,
    });
  }

  const userBrief = `נכס: ${type} ב${area}
מחיר: ${priceFmt}
${rooms ? `חדרים: ${rooms}\n` : ''}${sqm ? `שטח: ${sqm} מ"ר\n` : ''}${floor ? `קומה: ${floor}\n` : ''}${feature ? `תכונה מיוחדת: ${feature}\n` : ''}
אנא צור 3 וריאציות שיווקיות. החזר JSON בלבד.`;

  const SYSTEM = `אתה כותב פוסטים שיווקיים לסוכני נדל"ן בישראל ב-3 פורמטים שונים. תמיד החזר JSON תקין ובלבד — בלי markdown, בלי טקסט מסביב.

הפורמט המדויק להחזרה:
{"story": "<טקסט>", "group": "<טקסט>", "marketplace": "<טקסט>"}

כללים מחייבים לכל וריאציה:

1. story — לסטורי באינסטגרם / סטטוס בוואטסאפ:
   • 1-3 שורות בלבד, מהיר ומיידי
   • פותח עם 3-5 אימוג'י חזקים
   • כותרת hook קצרה + CTA חד ("שלחו DM" / "הקישור בביו")
   • מקסימום 90 תווים סה"כ

2. group — לקבוצות פייסבוק (כמו "נדל"ן בתל אביב"):
   • 100-150 מילים, טון אישי וחברותי
   • פותח עם hook רגשי או שאלה ("מי מחפש כבר חודשים בית בקיסריה?")
   • 3-4 אימוג'י נקודתיים בלבד, לא מוגזם
   • מציג את הנכס + יתרון מיוחד 1-2
   • סוגר בשאלה שמעודדת תגובות + הצעה לפנייה אישית
   • סגנון: "חבר שמספר על הזדמנות" — לא דוכן מכירות

3. marketplace — ל-Marketplace של פייסבוק / יד2:
   • מובנה ויבש, ✅ נקודות בולטות
   • מינימום אימוג'י (רק לפני נקודה מרכזית כמו 💵 או 📞)
   • שורת מחיר ברורה ובולטת בהתחלה
   • 4-6 בולטים: חניה / מרפסת / נוף / מצב / חידוש / קרוב למה
   • סוגר ב-CTA לתיאום צפייה
   • מקסימום 80 מילים

חוקים חוצי-וריאציות:
- עברית מקצועית. אסור עברית-אנגלית מעורבת
- אסור להמציא נתונים שלא נתונים (אם לא נאמר "נוף לים" — אל תכתוב נוף לים)
- אם תכונה מיוחדת ניתנה — היא חייבת להיות מודגשת בכל שלוש הוריאציות
- אל תזכיר מספרי טלפון או שמות סוכנים — הסוכן יוסיף אותם בעצמו`;

  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages: [{ role: 'user', content: userBrief }],
    });
    const msg = await stream.finalMessage();
    const text = msg.content.find(b => b.type === 'text')?.text ?? '';

    // Strip ```json fences if present, just in case
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.story || !parsed.group || !parsed.marketplace) {
      throw new Error('Claude response missing one of: story, group, marketplace');
    }

    res.json({
      story:       parsed.story,
      group:       parsed.group,
      marketplace: parsed.marketplace,
    });
  } catch (err) {
    console.error('[marketing/generate] error:', err.message);
    res.status(500).json({ error: 'Failed to generate marketing variations', detail: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'AgentIQ CRM API' }));
app.get('/health', async (req, res) => {
  const health = await checkSupabaseHealth();
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    sqlite: 'ok',
    supabase: health.ok ? 'connected' : (health.reason || 'not configured'),
    ingest_key_set: !!(process.env.INGEST_API_KEY || process.env.API_KEY ||
      db.prepare("SELECT value FROM settings WHERE key='ingest_api_key'").get()?.value),
    endpoints: {
      ingest_single: 'POST /api/ingest/property',
      ingest_apify:  'POST /api/ingest/apify',
      ingest_test:   'POST /api/ingest/test',
    },
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`AgentIQ API on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
);
