/**
 * Supabase / PostgreSQL client — with forced IPv4 resolution.
 *
 * Render's network blocks outbound IPv6. The pg library picks the AAAA record
 * → ENETUNREACH. Fix: resolve the hostname to an IPv4 address manually with
 * dns.resolve4() and pass the raw IP to the Pool instead of the hostname.
 */

const { Pool }   = require('pg');
const dns        = require('dns').promises;

let pool         = null;
let _poolPromise = null; // resolves when the pool is ready (or failed)

async function _init() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.log('[pg] DATABASE_URL not set — SQLite-only mode (local dev)');
    return;
  }

  try {
    const parsed   = new URL(connStr);
    const hostname = parsed.hostname;
    const port     = parseInt(parsed.port) || 5432;
    const database = parsed.pathname.replace(/^\//, '');
    const user     = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);

    // ── Force IPv4 ─────────────────────────────────────────────────────────
    // pg uses net.connect() which honours getaddrinfo() ordering.
    // On Render that ordering returns IPv6 first → ENETUNREACH.
    // dns.resolve4() bypasses getaddrinfo entirely and returns only A records.
    let host = hostname;
    try {
      const [ipv4] = await dns.resolve4(hostname);
      host = ipv4;
      console.log(`[pg] ${hostname} → ${ipv4} (IPv4 forced)`);
    } catch (dnsErr) {
      console.warn(`[pg] IPv4 DNS lookup failed for ${hostname}: ${dnsErr.message} — falling back to hostname`);
    }

    pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl:                 { rejectUnauthorized: false },
      max:                 5,
      idleTimeoutMillis:   30_000,
      connectionTimeoutMillis: 8_000,
    });

    pool.on('error', err => console.error('[pg] pool error:', err.message));

    // Verify the connection works
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[pg] Connected to Supabase ✓');

  } catch (err) {
    console.error('[pg] Connection FAILED:', err.message);
    pool = null;
  }
}

// Start connecting immediately when the module loads
_poolPromise = _init();

/**
 * Returns the Pool once initialisation is complete.
 * Awaiting this is safe even if called before _init() resolves.
 */
async function getPool() {
  await _poolPromise;
  return pool;
}

/**
 * Ensures the `properties` table exists in Supabase.
 */
async function ensurePgSchema() {
  const p = await getPool();
  if (!p) return;
  try {
    await p.query(`
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
    `);
    console.log('[pg] Schema verified ✓');
  } catch (err) {
    console.error('[pg] Schema check failed:', err.message);
  }
}

/**
 * Insert a single property into Supabase.
 * Returns the inserted row, or null on error / no connection.
 */
async function pgInsertProperty({ title, price, city, area, type, rooms, sqm, url, source, description }) {
  const p = await getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query(
      `INSERT INTO properties (title, price, city, area, type, rooms, sqm, url, source, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, Number(price), city||null, area||null, type||null,
       rooms||null, sqm||null, url||null, source||'API', description||null]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[pg] INSERT properties failed:', err.message);
    return null;
  }
}

module.exports = { getPool, ensurePgSchema, pgInsertProperty };
