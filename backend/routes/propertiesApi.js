'use strict';

const express = require('express');
const { supabase } = require('../pgClient');

// All columns we allow updating.  assigned_to is optional — if the Supabase
// table was created without it, the PATCH /assign endpoint degrades gracefully.
const UPDATABLE      = ['title','price','city','area','type','rooms','sqm','url','source','description','assigned_to'];
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

module.exports = function createPropertiesRouter() {
  const router = express.Router();

  // GET /api/properties/fresh-count — how many unclaimed leads are in the pool
  router.get('/fresh-count', async (req, res) => {
    if (!supabase) return res.json({ count: 0 });
    const { count, error } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('is_claimed', false);
    if (error) {
      // is_claimed column missing → schema not migrated yet
      if (error.message?.includes('is_claimed') || error.message?.includes('column')) {
        return res.json({ count: 0, schema_pending: true });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ count: count || 0 });
  });

  // POST /api/properties/claim — atomically grab the newest unclaimed lead
  // and assign it to the calling agent.
  //
  // Returns 200 + { property } on success
  // Returns 404                 if no fresh leads available
  // Returns 409                 if a race lost the row to another agent
  router.post('/claim', async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });

    const me = userFromAuth(req) || { username: req.body?.username || 'admin' };

    // 1. Find the freshest unclaimed lead.
    //    Prefer original_post_date (the FB post time), fall back to ingested_at.
    let { data: candidates, error: findErr } = await supabase
      .from('properties')
      .select('*')
      .eq('is_claimed', false)
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
      return res.status(404).json({ error: 'no fresh leads available' });
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
    res.json({ property: claimed });
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
