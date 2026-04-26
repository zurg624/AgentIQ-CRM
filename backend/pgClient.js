/**
 * Supabase client — uses @supabase/supabase-js (REST/HTTP).
 *
 * This intentionally avoids raw pg/TCP connections because Render's network
 * blocks outbound IPv6, and Supabase's db hostname resolves to an IPv6 address.
 * The JS client talks over HTTPS (port 443) instead — zero socket issues.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  console.log('[supabase] Client initialised ✓');
} else {
  console.log('[supabase] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — Supabase disabled');
}

/**
 * Ensures the `properties` table exists in Supabase.
 * Uses raw SQL via the rpc helper if the table doesn't exist yet.
 * (The table can also be created manually in the Supabase dashboard — that's fine too.)
 */
async function ensurePgSchema() {
  if (!supabase) return;
  try {
    // Quick probe: if the table exists this returns 0 rows, not an error.
    const { error } = await supabase.from('properties').select('id').limit(1);
    if (!error) {
      console.log('[supabase] properties table found ✓');
      return;
    }

    // Table missing — create it via SQL RPC
    console.log('[supabase] Creating properties table…');
    const { error: rpcErr } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS properties (
          id          SERIAL PRIMARY KEY,
          title       TEXT    NOT NULL,
          price       BIGINT  NOT NULL,
          city        TEXT,
          area        TEXT,
          type        TEXT,
          rooms       NUMERIC,
          sqm         INTEGER,
          url         TEXT,
          source      TEXT    NOT NULL DEFAULT 'API',
          description TEXT,
          ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    });
    if (rpcErr) {
      console.warn('[supabase] Could not auto-create table via RPC:', rpcErr.message);
      console.warn('[supabase] Please create the table manually in the Supabase dashboard.');
    } else {
      console.log('[supabase] properties table created ✓');
    }
  } catch (err) {
    console.error('[supabase] ensurePgSchema error:', err.message);
  }
}

/**
 * Insert a single property into Supabase.
 * Returns the inserted row, or null on error / no connection.
 */
async function pgInsertProperty({ title, price, city, area, type, rooms, sqm, url, source, description }) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('properties')
      .insert([{
        title,
        price:       Number(price),
        city:        city        || null,
        area:        area        || null,
        type:        type        || null,
        rooms:       rooms       || null,
        sqm:         sqm         || null,
        url:         url         || null,
        source:      source      || 'API',
        description: description || null,
      }])
      .select()
      .single();

    if (error) {
      console.error('[supabase] INSERT properties failed:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[supabase] INSERT properties exception:', err.message);
    return null;
  }
}

/**
 * Returns true if the Supabase client is configured and reachable.
 * Used by GET /health.
 */
async function checkSupabaseHealth() {
  if (!supabase) return { ok: false, reason: 'not configured' };
  try {
    const { error } = await supabase.from('properties').select('id').limit(1);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { supabase, ensurePgSchema, pgInsertProperty, checkSupabaseHealth };
