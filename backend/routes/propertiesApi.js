'use strict';

const express = require('express');
const { supabase } = require('../pgClient');

// All columns we allow updating.  assigned_to is optional — if the Supabase
// table was created without it, the PATCH /assign endpoint degrades gracefully.
const UPDATABLE      = ['title','price','city','area','type','rooms','sqm','url','source','description','assigned_to'];
// Columns guaranteed to exist in every schema variant (no assigned_to)
const UPDATABLE_SAFE = ['title','price','city','area','type','rooms','sqm','url','source','description'];

module.exports = function createPropertiesRouter() {
  const router = express.Router();

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
