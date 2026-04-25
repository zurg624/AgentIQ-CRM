const express = require('express');
const cors = require('cors');
const db = require('./db');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

  const result = db.prepare(
    'INSERT INTO leads (name, phone, source, message, agent_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name, phone ?? null, source, message, agent_id);

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CRM API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`));
