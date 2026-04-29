'use strict';

const express = require('express');
const { supabase } = require('../pgClient');
const db = require('../db');

// Per-plan monthly claim quota.  Infinity = unlimited.
const PLAN_QUOTA = { base: 10, pro: Infinity, elite: Infinity };

// Rolling-inventory window — unclaimed leads vanish from the pool after this
// many hours so the Hunter UI never shows yesterday's news. Enforced both at
// query time (filter) and via a periodic DELETE (free DB space).
const POOL_TTL_HOURS = 24;
const poolTtlIso = () => new Date(Date.now() - POOL_TTL_HOURS * 3600_000).toISOString();

// Saturation threshold — if a city has more than this many unclaimed fresh
// leads, the scheduler skips scraping groups that primarily serve it. This
// is what keeps the Apify bill in check: don't scrape what we don't need.
const SATURATION_THRESHOLD = 10;

/**
 * Return a Map<city, count> of unclaimed fresh leads per city.
 * Used by the scheduler to skip already-saturated cities.
 *
 * Exported as a property of the module so the index.js scheduler can call it.
 */
async function getCityFreshCounts() {
  if (!supabase) return new Map();
  const { data, error } = await supabase
    .from('properties')
    .select('city')
    .eq('is_claimed', false)
    .gte('ingested_at', poolTtlIso())
    .not('city', 'is', null);
  if (error) {
    if (error.message?.includes('column')) return new Map();
    console.warn('[saturation] count error:', error.message);
    return new Map();
  }
  const counts = new Map();
  for (const row of data || []) {
    if (!row.city) continue;
    counts.set(row.city, (counts.get(row.city) || 0) + 1);
  }
  return counts;
}

// Start of the current calendar month (UTC) — anchor for monthly quota counting.
function startOfMonthIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

// Count how many properties this user has claimed since start-of-month.
async function getClaimedThisMonth(username) {
  if (!supabase || !username) return 0;
  const { count, error } = await supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('claimed_by', username)
    .gte('claimed_at', startOfMonthIso());
  if (error) {
    // Schema not migrated → treat as 0 so we don't block users
    if (error.message?.includes('column')) return 0;
    console.warn('[claim/quota] count error:', error.message);
    return 0;
  }
  return count || 0;
}

// All columns we allow updating.  assigned_to is optional — if the Supabase
// table was created without it, the PATCH /assign endpoint degrades gracefully.
const UPDATABLE      = ['title','price','city','area','type','rooms','sqm','url','source','description','assigned_to','status','contact_name','contact_phone'];
// Columns guaranteed to exist in every schema variant (no assigned_to)
const UPDATABLE_SAFE = ['title','price','city','area','type','rooms','sqm','url','source','description'];

// Decode the AgentIQ bearer token to extract the username.
// Token format (set by /api/auth/login): base64("username:role:timestamp")
function userFromAuth(req) {
  const auth = req.headers.authorization?.replace('Bearer ', '');
  if (!auth) return null;
  try {
    const [username, role] = Buffer.from(auth, 'base64').toString().split(':');
    return username ? { username, role } : null;
  } catch { return null; }
}

// ── Rolling-inventory cleanup ─────────────────────────────────────────────────
// Hard-delete unclaimed pool leads older than POOL_TTL_HOURS. Runs on backend
// boot and then every hour. Claimed leads are NEVER touched — they belong to
// the agent and stay in their pipeline forever.
async function cleanupStalePool() {
  if (!supabase) return;
  const cutoff = poolTtlIso();
  try {
    const { error, count } = await supabase
      .from('properties')
      .delete({ count: 'exact' })
      .eq('is_claimed', false)
      .lt('ingested_at', cutoff);
    if (error) {
      // is_claimed/ingested_at may not exist yet — schema not migrated.
      if (error.message?.includes('column')) return;
      console.warn('[pool-cleanup] error:', error.message);
      return;
    }
    if (count && count > 0) {
      console.log(`[pool-cleanup] purged ${count} stale unclaimed leads (>${POOL_TTL_HOURS}h)`);
    }
  } catch (e) {
    console.warn('[pool-cleanup] unexpected:', e.message);
  }
}

// Kick off on require, then every hour. setInterval handle is unref'd so it
// doesn't keep the process alive during graceful shutdown.
let cleanupTimer = null;
function startCleanupSchedule() {
  if (cleanupTimer) return;
  cleanupStalePool();  // run once immediately
  cleanupTimer = setInterval(cleanupStalePool, 60 * 60 * 1000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
  console.log(`[pool-cleanup] scheduled — runs hourly, TTL=${POOL_TTL_HOURS}h`);
}

module.exports = function createPropertiesRouter() {
  // Start the rolling-inventory cleanup as soon as the router is mounted.
  startCleanupSchedule();
  const router = express.Router();

  // GET /api/properties/fresh-count — how many unclaimed leads are in the pool
  router.get('/fresh-count', async (req, res) => {
    if (!supabase) return res.json({ count: 0 });
    const { count, error } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('is_claimed', false)
      .gte('ingested_at', poolTtlIso());
    if (error) {
      // is_claimed column missing → schema not migrated yet
      if (error.message?.includes('is_claimed') || error.message?.includes('column')) {
        return res.json({ count: 0, schema_pending: true });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ count: count || 0 });
  });

  // GET /api/properties/quota — current user's monthly claim quota status
  router.get('/quota', async (req, res) => {
    const me = userFromAuth(req);
    if (!me) return res.status(401).json({ error: 'authentication required' });
    const userRow = db.prepare('SELECT plan FROM users WHERE username = ?').get(me.username);
    const plan = userRow?.plan || 'base';
    const limit = PLAN_QUOTA[plan] ?? PLAN_QUOTA.base;
    const used  = await getClaimedThisMonth(me.username);
    res.json({
      plan, used,
      limit:     limit === Infinity ? null : limit,
      unlimited: limit === Infinity,
      remaining: limit === Infinity ? null : Math.max(0, limit - used),
    });
  });

  // GET /api/properties/my-claimed — leads claimed by the current user
  // Renders the cards on the Lead Hunter page.
  router.get('/my-claimed', async (req, res) => {
    if (!supabase) return res.json([]);
    const me = userFromAuth(req);
    if (!me) return res.status(401).json({ error: 'authentication required' });

    let { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('claimed_by', me.username)
      .order('claimed_at', { ascending: false })
      .limit(100);

    // Schema not migrated yet
    if (error && error.message?.includes('column')) return res.json([]);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  // POST /api/properties/claim — atomically grab the newest unclaimed lead
  // matching optional { city, type } filters and assign it to the agent.
  //
  // Returns 200 + { property, quota } on success
  // Returns 402                       if monthly quota exceeded for plan
  // Returns 404                       if no fresh leads available
  // Returns 409                       if a race lost the row to another agent
  router.post('/claim', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    const me = userFromAuth(req) || { username: req.body?.username || 'admin' };

    // Enforce monthly quota by plan BEFORE touching the pool.
    const userRow = db.prepare('SELECT plan FROM users WHERE username = ?').get(me.username);
    const plan = userRow?.plan || 'base';
    const limit = PLAN_QUOTA[plan] ?? PLAN_QUOTA.base;
    if (limit !== Infinity) {
      const used = await getClaimedThisMonth(me.username);
      if (used >= limit) {
        return res.status(402).json({
          error: 'ניצלת את המכסה החודשית, שדרג כדי להמשיך לצוד',
          plan, used, limit,
        });
      }
    }

    // Optional filters from body
    const { city, type } = req.body || {};

    // Live freshness window — only claim leads that hit the system in the last
    // N minutes (default 60). This is what makes the "🔥 lead מהתנור" feel real.
    // Clamp 5..1440 so a misbehaving client can't widen it to forever.
    const freshnessMinutes = Math.min(
      Math.max(parseInt(req.body?.freshness_minutes, 10) || 60, 5),
      1440
    );
    const freshSince = new Date(Date.now() - freshnessMinutes * 60_000).toISOString();

    // 1. Find the freshest unclaimed lead matching filters AND inside the
    //    freshness window. Prefer original_post_date; if it's NULL we accept
    //    leads whose ingested_at is fresh enough (newly-scraped, undated posts).
    let q = supabase
      .from('properties')
      .select('*')
      .eq('is_claimed', false)
      .gte('ingested_at', poolTtlIso())  // 24h rolling window
      .or(`original_post_date.gte.${freshSince},and(original_post_date.is.null,ingested_at.gte.${freshSince})`);
    if (city && city !== 'all') q = q.eq('city', city);
    if (type && type !== 'all') q = q.eq('type', type);

    let { data: candidates, error: findErr } = await q
      .order('original_post_date', { ascending: false, nullsFirst: false })
      .order('ingested_at', { ascending: false })
      .limit(1);

    // is_claimed / original_post_date column missing → schema not migrated
    if (findErr) {
      if (findErr.message?.includes('column')) {
        return res.status(503).json({
          error: 'Schema migration pending — run backend/SUPABASE_SCHEMA.sql in Supabase SQL Editor',
        });
      }
      return res.status(500).json({ error: findErr.message });
    }

    if (!candidates || candidates.length === 0) {
      // City-aware 404 so the UI can show "מחפשים עבורך לידים ב-{city}..."
      return res.status(404).json({
        error: 'no fresh leads available',
        searched_city: city && city !== 'all' ? city : null,
        searched_type: type && type !== 'all' ? type : null,
        freshness_minutes: freshnessMinutes,
      });
    }
    const lead = candidates[0];

    // 2. Atomic claim: only update if it's still unclaimed.
    //    The .eq('is_claimed', false) makes this a compare-and-set.
    const { data: claimed, error: claimErr } = await supabase
      .from('properties')
      .update({
        is_claimed:  true,
        claimed_by:  me.username,
        claimed_at:  new Date().toISOString(),
        assigned_to: me.username,
      })
      .eq('id', lead.id)
      .eq('is_claimed', false)
      .select()
      .single();

    if (claimErr) {
      // PGRST116 = "no rows" — someone else claimed it between our read and update
      if (claimErr.code === 'PGRST116') {
        return res.status(409).json({ error: 'lead was claimed by another agent — try again' });
      }
      return res.status(500).json({ error: claimErr.message });
    }

    console.log(`[claim] ${me.username} claimed property ${claimed.id} — "${(claimed.title || '').slice(0, 60)}"`);

    // How fresh is this lead, in minutes? Drives the "נמשך לפני X דק׳" UI badge.
    const refDate = claimed.original_post_date || claimed.ingested_at;
    const minutesAgo = refDate
      ? Math.max(1, Math.round((Date.now() - new Date(refDate).getTime()) / 60_000))
      : null;

    // Recompute quota so the UI can update its remaining count
    const usedAfter = limit === Infinity ? null : await getClaimedThisMonth(me.username);
    res.json({
      property:    claimed,
      minutes_ago: minutesAgo,
      matched: {
        city: city && city !== 'all' ? city : null,
        type: type && type !== 'all' ? type : null,
      },
      freshness_minutes: freshnessMinutes,
      quota: {
        plan, used: usedAfter,
        limit:     limit === Infinity ? null : limit,
        unlimited: limit === Infinity,
        remaining: limit === Infinity ? null : Math.max(0, limit - (usedAfter || 0)),
      },
    });
  });

  // POST /api/properties/manual — agent adds a lead manually.
  // Creates a property already claimed by the current user (skips the pool).
  // Does NOT count toward monthly quota — manual entry is unlimited.
  router.post('/manual', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
    const me = userFromAuth(req);
    if (!me) return res.status(401).json({ error: 'authentication required' });

    const allowed = ['title','price','city','area','type','rooms','sqm','url','description','contact_name','contact_phone','status'];
    const row = { source: 'Manual', is_claimed: true, claimed_by: me.username,
                  claimed_at: new Date().toISOString(), assigned_to: me.username };
    for (const k of allowed) if (k in req.body) row[k] = req.body[k];
    if (!row.title) row.title = row.contact_name ? `ליד ידני — ${row.contact_name}` : 'ליד ידני';

    let { data, error } = await supabase.from('properties').insert(row).select().single();
    // Drop unknown columns and retry — some Supabase schemas are missing newer cols
    while (error && error.message?.includes('column')) {
      const m = error.message.match(/column "([^"]+)"/);
      if (!m || !(m[1] in row)) break;
      delete row[m[1]];
      ({ data, error } = await supabase.from('properties').insert(row).select().single());
    }
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // GET /api/properties/facets — distinct cities + types currently in the pool.
  // Used to populate the filter dropdowns on the Lead Hunter page.
  router.get('/facets', async (req, res) => {
    if (!supabase) return res.json({ cities: [], types: [] });
    const { data, error } = await supabase
      .from('properties')
      .select('city, type')
      .eq('is_claimed', false)
      .gte('ingested_at', poolTtlIso())  // only count leads still in the rolling window
      .limit(1000);
    if (error) {
      // Schema not migrated → return empty so dropdowns just show "all"
      if (error.message?.includes('column')) return res.json({ cities: [], types: [] });
      return res.status(500).json({ error: error.message });
    }
    const cities = [...new Set((data || []).map(r => r.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
    const types  = [...new Set((data || []).map(r => r.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
    res.json({ cities, types });
  });

  // GET /api/properties — list newest-first, default 200 rows
  // Tries 'ingested_at' first; falls back to 'created_at' for tables
  // created via the Supabase dashboard (which may use either column name).
  router.get('/', async (req, res) => {
    if (!supabase) return res.json([]);
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);

    let { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('ingested_at', { ascending: false })
      .limit(limit);

    // If the table uses 'created_at' instead of 'ingested_at', retry
    if (error && error.message?.includes('ingested_at')) {
      ({ data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit));
    }

    // Last resort: no ordering
    if (error && (error.message?.includes('created_at') || error.message?.includes('column'))) {
      ({ data, error } = await supabase.from('properties').select('*').limit(limit));
    }

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  // PUT /api/properties/:id — update allowed fields
  router.put('/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    const updates = {};
    for (const key of UPDATABLE) {
      if (key in req.body) updates[key] = req.body[key];
    }

    let { data, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    // If a column in UPDATABLE doesn't exist in this Supabase schema, retry
    // with only the guaranteed-safe columns.
    if (error && error.message?.includes('column')) {
      const safeUpdates = {};
      for (const key of UPDATABLE_SAFE) {
        if (key in req.body) safeUpdates[key] = req.body[key];
      }
      ({ data, error } = await supabase
        .from('properties')
        .update(safeUpdates)
        .eq('id', req.params.id)
        .select()
        .single());
    }

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // DELETE /api/properties/:id
  router.delete('/:id', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
    const { error } = await supabase.from('properties').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // PATCH /api/properties/:id/assign — assign agent by name
  router.patch('/:id/assign', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
    const { assigned_to } = req.body;

    let { data, error } = await supabase
      .from('properties')
      .update({ assigned_to: assigned_to || null })
      .eq('id', req.params.id)
      .select()
      .single();

    // Column 'assigned_to' may not exist in tables created from the Supabase
    // dashboard wizard.  Degrade gracefully — the UI will still update optimistically.
    if (error && error.message?.includes('column')) {
      console.warn('[properties/assign] assigned_to column missing in Supabase schema — returning 200 without DB write');
      console.warn('[properties/assign] Fix: run  ALTER TABLE properties ADD COLUMN IF NOT EXISTS assigned_to TEXT;  in Supabase SQL editor');
      return res.json({ id: req.params.id, assigned_to: assigned_to || null });
    }

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  return router;
};

// Side-channel exports for non-route consumers (e.g. the scheduler in index.js)
module.exports.getCityFreshCounts = getCityFreshCounts;
module.exports.SATURATION_THRESHOLD = SATURATION_THRESHOLD;
module.exports.cleanupStalePool = cleanupStalePool;
