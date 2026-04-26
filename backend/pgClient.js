/**
 * Supabase / PostgreSQL client.
 * Active only when DATABASE_URL is set (Render production).
 * Falls back to null so the rest of the code can do `if (pool) { ... }`.
 */
const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // required for Supabase
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    console.error('[pg] unexpected pool error:', err.message);
  });

  // Test connection on startup
  pool.connect()
    .then(client => {
      console.log('[pg] Connected to Supabase ✓');
      client.release();
    })
    .catch(err => {
      console.error('[pg] Connection FAILED:', err.message);
      console.error('[pg] Check DATABASE_URL env var on Render');
    });
} else {
  console.log('[pg] DATABASE_URL not set — using SQLite only (local dev mode)');
}

/**
 * Ensures the `properties` table exists in Supabase.
 * Safe to call multiple times — uses CREATE TABLE IF NOT EXISTS.
 */
async function ensurePgSchema() {
  if (!pool) return;
  try {
    await pool.query(`
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
 * Insert a single property into Supabase properties table.
 * Returns the inserted row or null on error.
 */
async function pgInsertProperty({ title, price, city, area, type, rooms, sqm, url, source, description }) {
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO properties (title, price, city, area, type, rooms, sqm, url, source, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [title, Number(price), city || null, area || null, type || null,
       rooms || null, sqm || null, url || null, source || 'API', description || null]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[pg] INSERT properties failed:', err.message);
    return null;
  }
}

module.exports = { pool, ensurePgSchema, pgInsertProperty };
