/**
 * POST /api/ingest/apify
 *
 * Apify HTTP Integration webhook handler.
 *
 * Apify sends a small webhook payload when an Actor run finishes.
 * That payload contains `resource.defaultDatasetId` — the ID of the
 * dataset that the actor wrote its results to.  We fetch those results
 * ourselves via the Apify Dataset Items API, normalise the fields to
 * match our `properties` table, and upsert them into Supabase.
 *
 * Supported incoming shapes
 * ─────────────────────────
 * 1. Apify "send notification" webhook  → { eventType, resource: { defaultDatasetId, … } }
 *    The handler fetches the dataset automatically.
 *
 * 2. Legacy "send dataset as JSON body" → array [ {…}, … ] or { items: […] }
 *    Still accepted for backwards compat / manual testing.
 *
 * Required env vars
 * ─────────────────
 *   APIFY_TOKEN         – Apify personal access token (for dataset API calls)
 *   SUPABASE_URL        – already used by pgClient
 *   SUPABASE_SERVICE_KEY – already used by pgClient
 *
 * One-time SQL (run once in Supabase SQL editor)
 * ───────────────────────────────────────────────
 *   CREATE UNIQUE INDEX IF NOT EXISTS properties_url_unique
 *     ON properties (url)
 *    WHERE url IS NOT NULL;
 *
 * This partial unique index lets upsert deduplicate on `url` while
 * still allowing multiple rows with url = NULL (no listing URL found).
 *
 * Factory export
 * ──────────────
 * module.exports = ({ db, broadcast, ingestOneProperty })
 * index.js passes its own `db`, `broadcast`, and `ingestOneProperty`
 * so the route stays thin and all business logic lives in one place.
 */

'use strict';

const express = require('express');
const { supabase } = require('../pgClient');

// ── Apify Dataset API ─────────────────────────────────────────────────────────

/**
 * Fetch all items from an Apify dataset.
 * Returns an array (may be empty).  Throws on HTTP error.
 */
async function fetchApifyDataset(datasetId) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN env var is not set');

  const url =
    `https://api.apify.com/v2/datasets/${datasetId}/items` +
    `?token=${encodeURIComponent(token)}&format=json&clean=true`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify Dataset API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Field mapping ─────────────────────────────────────────────────────────────

/**
 * Parse a price value that may arrive as:
 *   – number  → 1900000
 *   – string  → "1,900,000 ₪"  |  "1.9M"  |  "₪1900000"
 * Returns an integer (ILS) or null.
 */
function parsePrice(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Math.round(raw);

  const s = String(raw).trim();

  // e.g. "1.9M" / "1.9 מיל'"
  const mMil = s.match(/(\d+(?:[.,]\d+)?)\s*(?:M|מיל)/i);
  if (mMil) return Math.round(parseFloat(mMil[1].replace(',', '.')) * 1_000_000);

  // e.g. "1,900,000" / "₪ 1 900 000"
  const digits = s.replace(/[^\d]/g, '');
  return digits.length >= 4 ? parseInt(digits, 10) : null;
}

/**
 * Map one raw Apify item to a `properties` row.
 *
 * Field aliases are listed most-specific first so the first truthy value wins.
 * Anything not matched stays null — the DB schema allows nulls on every
 * column except `title` and `price`.
 */
function mapItem(raw) {
  // title — fall back to the first 200 chars of the post text so we always
  // have *something* meaningful in the non-null title column.
  const title =
    raw.title         ??
    raw.name          ??
    raw.headline      ??
    raw.propertyTitle ??
    raw.header        ??
    (raw.text         ? String(raw.text).slice(0, 200).replace(/\n/g, ' ') : null) ??
    (raw.description  ? String(raw.description).slice(0, 200).replace(/\n/g, ' ') : null) ??
    'נכס מ-Apify';

  const price = parsePrice(
    raw.price        ??
    raw.priceValue   ??
    raw.priceILS     ??
    raw.askingPrice  ??
    raw.cost         ??
    raw.salePrice    ??
    null
  ) ?? 0; // price is NOT NULL in schema — default 0 when truly unknown

  const city =
    raw.city        ??
    raw.cityName    ??
    raw.location    ??
    raw.region      ??
    null;

  const area =
    raw.area         ??
    raw.neighborhood ??
    raw.district     ??
    raw.quarter      ??
    null;

  const type =
    raw.type         ??
    raw.propertyType ??
    raw.category     ??
    raw.assetType    ??
    null;

  const rooms =
    raw.rooms        ??
    raw.roomCount    ??
    raw.bedrooms     ??
    raw.numRooms     ??
    null;

  const sqm =
    raw.sqm          ??
    raw.squareMeters ??
    raw.area_sqm     ??
    raw.size         ??
    raw.floorArea    ??
    null;

  // url — the canonical listing URL; used as the upsert conflict key
  const url =
    raw.url         ??
    raw.link        ??
    raw.postUrl     ??
    raw.listingUrl  ??
    raw.detailUrl   ??
    raw.href        ??
    null;

  const source =
    raw.source      ??
    raw.platform    ??
    raw.site        ??
    'Apify';

  // description — prefer the full text over a summary
  const description =
    raw.description  ??
    raw.text         ??
    raw.details      ??
    raw.body         ??
    null;

  return { title, price, city, area, type, rooms, sqm, url, source, description };
}

// ── Normalise body for legacy / manual callers ────────────────────────────────

function normaliseBody(body) {
  if (Array.isArray(body))              return body;
  if (Array.isArray(body?.items))       return body.items;
  if (Array.isArray(body?.data))        return body.data;
  if (Array.isArray(body?.results))     return body.results;
  if (body && (body.title || body.url)) return [body];
  return [];
}

// ── Supabase upsert ───────────────────────────────────────────────────────────

/**
 * Upsert an array of mapped rows into Supabase `properties`.
 *
 * For rows that have a `url` the partial unique index (properties_url_unique)
 * prevents duplicates — those rows are silently skipped if the URL already
 * exists.  Rows without a URL are always inserted.
 *
 * Returns { saved, skipped, errors }
 */
async function upsertToSupabase(rows) {
  if (!supabase) {
    console.warn('[ingest/apify] Supabase client not configured — skipping cloud save');
    return { saved: 0, skipped: rows.length, errors: [] };
  }

  // Separate rows with and without a URL
  const withUrl    = rows.filter(r => r.url);
  const withoutUrl = rows.filter(r => !r.url);

  let saved  = 0;
  const errors = [];

  // ── Rows with URL — upsert (deduplicate) ──────────────────────────
  if (withUrl.length > 0) {
    const { data, error } = await supabase
      .from('properties')
      .upsert(withUrl, {
        onConflict:      'url',   // requires the partial unique index
        ignoreDuplicates: true,   // silently skip instead of updating
      })
      .select('id, url');

    if (error) {
      console.error('[supabase] upsert error:', error.message);
      errors.push(error.message);
    } else {
      saved += data?.length ?? 0;
      console.log(`[supabase] upserted ${data?.length ?? 0}/${withUrl.length} rows (with URL)`);
    }
  }

  // ── Rows without URL — plain insert ───────────────────────────────
  if (withoutUrl.length > 0) {
    const { data, error } = await supabase
      .from('properties')
      .insert(withoutUrl)
      .select('id');

    if (error) {
      console.error('[supabase] insert (no-url) error:', error.message);
      errors.push(error.message);
    } else {
      saved += data?.length ?? 0;
      console.log(`[supabase] inserted ${data?.length ?? 0} rows (no URL)`);
    }
  }

  const skipped = rows.length - saved - errors.length;
  return { saved, skipped: Math.max(skipped, 0), errors };
}

// ── Route factory ─────────────────────────────────────────────────────────────

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db         – SQLite instance
 * @param {Function} deps.broadcast                           – SSE broadcast fn
 * @param {Function} deps.ingestOneProperty                   – core ingest fn from index.js
 */
module.exports = function createApifyRouter({ db, broadcast, ingestOneProperty }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const body = req.body;
    console.log('[ingest/apify] webhook received — eventType:', body?.eventType ?? '(none)');

    let rawItems = [];

    // ── Path A: proper Apify webhook ─────────────────────────────────
    if (body?.eventType) {
      const runStatus      = body.resource?.status;
      const datasetId      = body.resource?.defaultDatasetId;

      console.log(`[ingest/apify] run status=${runStatus} datasetId=${datasetId}`);

      // Only process runs that actually completed with data
      if (runStatus !== 'SUCCEEDED' && runStatus !== 'READY') {
        return res.json({
          received:  true,
          processed: 0,
          note: `Run status "${runStatus}" — nothing to ingest yet.`,
        });
      }

      if (!datasetId) {
        return res.status(400).json({
          error: 'Webhook payload has no resource.defaultDatasetId',
          tip:   'Make sure the Actor run completed and has a dataset.',
        });
      }

      try {
        rawItems = await fetchApifyDataset(datasetId);
        console.log(`[ingest/apify] fetched ${rawItems.length} items from dataset ${datasetId}`);
      } catch (err) {
        console.error('[ingest/apify] failed to fetch dataset:', err.message);
        return res.status(502).json({ error: 'Could not fetch Apify dataset', detail: err.message });
      }

    // ── Path B: legacy — raw items in request body ────────────────────
    } else {
      rawItems = normaliseBody(body);
      console.log(`[ingest/apify] legacy body — ${rawItems.length} item(s)`);

      if (rawItems.length === 0) {
        return res.status(400).json({
          error: 'No items found in request body.',
          hint:  'Send an Apify webhook (with eventType) or a JSON array of property objects.',
        });
      }
    }

    // ── Map raw items → DB rows ───────────────────────────────────────
    const mappedRows = rawItems.map(mapItem);

    // ── Supabase upsert (cloud persistence, dedup by URL) ─────────────
    const supabaseResult = await upsertToSupabase(mappedRows);
    console.log('[ingest/apify] Supabase result:', supabaseResult);

    // ── SQLite + matching engine (local, for real-time toast alerts) ───
    const localResults = [];
    for (const item of mappedRows) {
      if (!item.title) continue;
      try {
        const r = await ingestOneProperty(item);
        localResults.push(r);
      } catch (err) {
        console.warn('[ingest/apify] local ingest error:', err.message);
        localResults.push({ error: err.message });
      }
    }

    const totalMatches = localResults
      .filter(r => r?.matches)
      .reduce((s, r) => s + r.matches.length, 0);

    console.log(
      `[ingest/apify] done — ${supabaseResult.saved} saved to Supabase, ` +
      `${supabaseResult.skipped} skipped (duplicates), ` +
      `${totalMatches} lead match(es) found`
    );

    res.status(201).json({
      received:        rawItems.length,
      saved_supabase:  supabaseResult.saved,
      skipped_dupes:   supabaseResult.skipped,
      supabase_errors: supabaseResult.errors,
      lead_matches:    totalMatches,
    });
  });

  return router;
};
