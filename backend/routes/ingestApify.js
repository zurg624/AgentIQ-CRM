'use strict';

const express = require('express');
const { supabase } = require('../pgClient');

// ── Apify Dataset API ─────────────────────────────────────────────────────────

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

// ── Smart text extraction (price + city from free Hebrew text) ────────────────

const HEBREW_CITIES = [
  'תל אביב','יפו','ירושלים','חיפה','ראשון לציון','פתח תקווה','אשדוד','נתניה',
  'באר שבע','בני ברק','חולון','רמת גן','אשקלון','רחובות','בת ים','הרצליה',
  'כפר סבא','מודיעין','נס ציונה','לוד','רמלה','הוד השרון','גבעתיים',
  'קריית גת','עכו','אלעד','רעננה','קריית אתא','חדרה','בית שמש','נהריה',
  'יבנה','ראש העין','כפר יונה','טירת כרמל','עפולה','נצרת','צפת','טבריה',
  'דימונה','קריית מוצקין','קריית ביאליק','קריית ים','גבעת שמואל','אור יהודה',
  'אבן יהודה','מזכרת בתיה','גדרה','שוהם','מעלה אדומים','אריאל','מבשרת ציון',
  'זכרון יעקב','כרמיאל','מגדל העמק','טירה','סח׳נין','שפרעם','נשר','יקנעם',
  'קריית שמונה','בית שאן','אום אל-פחם','ג׳לג׳וליה','כלנסווה','פרדס חנה',
  'זיכרון יעקב','נוף הגליל','מגדל','גבעת השלושה','אלפי מנשה','כוכב יאיר',
  'אפרת','מעלות תרשיחא','ערד','מצפה רמון','יהוד','סגולה','גן יבנה',
];

/**
 * Extract price in ILS from free-text Hebrew post.
 * Handles: "1.9 מיליון" | "₪1,900,000" | "850 אלף" | "2.5M"
 * Aggressive fallback: any standalone 6-9 digit number in the realistic
 * Israeli real-estate range (100K – 100M ILS) is treated as a price.
 */
function extractPriceFromText(text) {
  if (!text) return null;
  const s = String(text);

  // X.X מיליון / million / M
  const milMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(?:מיליון|מיל[.'"]?|million|M)\b/i);
  if (milMatch) return Math.round(parseFloat(milMatch[1].replace(',', '.')) * 1_000_000);

  // X אלף / k
  const kMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(?:אלף|k)\b/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1_000);

  // ₪ followed by digits
  const shekelMatch = s.match(/₪\s*([\d,. ]+)/);
  if (shekelMatch) {
    const digits = shekelMatch[1].replace(/[^\d]/g, '');
    if (digits.length >= 4) return parseInt(digits, 10);
  }

  // Large comma-separated number like 1,900,000
  const commaNumbers = s.match(/\b\d{1,3}(?:,\d{3})+\b/g);
  if (commaNumbers) {
    const largest = commaNumbers
      .map(m => parseInt(m.replace(/,/g, ''), 10))
      .filter(n => n >= 100_000)
      .sort((a, b) => b - a)[0];
    if (largest) return largest;
  }

  // ── AGGRESSIVE FALLBACK ─────────────────────────────────────────────────
  // Any standalone 6-9 digit number that falls in a realistic real-estate
  // price range (100,000 – 100,000,000 ILS).  Avoids 10-digit numbers
  // (likely phone numbers) and very small numbers (likely sqm/rooms).
  // Strip phone-like patterns first to reduce false positives.
  const cleaned = s
    .replace(/\b0\d[-\s]?\d{3,4}[-\s]?\d{3,4}\b/g, ' ')   // 050-1234567, 02 1234567
    .replace(/\b\+972[-\s]?\d[-\s]?\d{3,4}[-\s]?\d{3,4}\b/g, ' '); // +972-50-1234567

  const standalone = cleaned.match(/\b\d{6,9}\b/g);
  if (standalone) {
    const candidates = standalone
      .map(n => parseInt(n, 10))
      .filter(n => n >= 100_000 && n <= 100_000_000)
      .sort((a, b) => b - a);
    if (candidates.length) return candidates[0];
  }

  return null;
}

/**
 * Extract Israeli city name from free-text.
 * Tries each city with optional Hebrew preposition prefix (ב,מ,ל,א).
 */
function extractCityFromText(text) {
  if (!text) return null;
  const s = String(text);
  for (const city of HEBREW_CITIES) {
    // word boundary with optional preposition
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|[\\s,.(])[במלא]?${escaped}(?:[\\s,.(]|$)`, 'i').test(s)) {
      return city;
    }
  }
  return null;
}

// ── Field mapping ─────────────────────────────────────────────────────────────

function parsePrice(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Math.round(raw);
  const s = String(raw).trim();
  const mMil = s.match(/(\d+(?:[.,]\d+)?)\s*(?:M|מיל)/i);
  if (mMil) return Math.round(parseFloat(mMil[1].replace(',', '.')) * 1_000_000);
  const digits = s.replace(/[^\d]/g, '');
  return digits.length >= 4 ? parseInt(digits, 10) : null;
}

function mapItem(raw) {
  // Pull out the post body — different Apify Facebook actors use different
  // field names, so check every common one.
  const postText =
    raw.postText    ??
    raw.text        ??
    raw.message     ??
    raw.description ??
    raw.body        ??
    raw.content     ??
    raw.post        ??
    raw.caption     ??
    raw.full_text   ??
    raw.fullText    ??
    raw.html        ??   // last resort — HTML body, will be cleaned for the title
    null;

  // Strip HTML tags & collapse whitespace for the title preview
  const cleanText = postText
    ? String(postText).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : null;

  const title =
    raw.title         ??
    raw.name          ??
    raw.headline      ??
    raw.propertyTitle ??
    raw.header        ??
    (cleanText ? cleanText.slice(0, 140) : null) ??
    'נכס מ-Apify';

  // Price: structured fields → text extraction (aggressive) → default 0
  let price = parsePrice(
    raw.price ?? raw.priceValue ?? raw.priceILS ?? raw.askingPrice ?? raw.cost ?? raw.salePrice ?? null
  );
  if (!price || price === 0) {
    price = extractPriceFromText(cleanText) ?? extractPriceFromText(title) ?? 0;
  }

  // City: structured fields → text extraction (search both body and title)
  let city = raw.city ?? raw.cityName ?? raw.location ?? raw.region ?? null;
  if (!city) city = extractCityFromText(cleanText) ?? extractCityFromText(title);

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
    raw.rooms    ??
    raw.roomCount??
    raw.bedrooms ??
    raw.numRooms ??
    null;

  const sqm =
    raw.sqm          ??
    raw.squareMeters ??
    raw.area_sqm     ??
    raw.size         ??
    raw.floorArea    ??
    null;

  const url =
    raw.url        ??
    raw.link       ??
    raw.postUrl    ??
    raw.listingUrl ??
    raw.detailUrl  ??
    raw.href       ??
    null;

  const source =
    raw.source   ??
    raw.platform ??
    raw.site     ??
    'Apify';

  // Use the cleaned post body for description so it's UI-ready and human-readable
  const description = cleanText ?? raw.details ?? null;

  // ── original_post_date — when the Facebook post was actually published ──
  // Different Apify actors use different field names; we accept ISO strings,
  // unix seconds, or unix milliseconds and normalise to an ISO string.
  const dateRaw =
    raw.time          ??   // most fb-* actors
    raw.timestamp     ??
    raw.date          ??
    raw.publishedAt   ??
    raw.published_at  ??
    raw.posted_at     ??
    raw.createdTime   ??
    raw.created_time  ??
    raw.createdAt     ??
    raw.created_at    ??
    null;

  let original_post_date = null;
  if (dateRaw != null) {
    const d = typeof dateRaw === 'number'
      ? new Date(dateRaw < 1e12 ? dateRaw * 1000 : dateRaw)   // seconds vs ms
      : new Date(dateRaw);
    if (!isNaN(d.getTime())) original_post_date = d.toISOString();
  }

  return { title, price, city, area, type, rooms, sqm, url, source, description, original_post_date };
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

async function upsertToSupabase(rows) {
  if (!supabase) {
    console.warn('[ingest/apify] Supabase client not configured — skipping cloud save');
    return { saved: 0, skipped: rows.length, errors: [] };
  }

  const withUrl    = rows.filter(r => r.url);
  const withoutUrl = rows.filter(r => !r.url);

  let saved = 0;
  const errors = [];

  // Strip a column from every row (used to retry when Supabase rejects an
  // unknown column — happens when the user hasn't run SUPABASE_SCHEMA.sql yet).
  const stripCol = (arr, col) => arr.map(r => { const c = { ...r }; delete c[col]; return c; });

  // Try the upsert; if it complains about a column, drop that column and retry.
  // Caps retries so we don't loop forever.
  async function tryUpsert(payload, opts) {
    let body = payload;
    for (let attempt = 0; attempt < 5; attempt++) {
      const q = supabase.from('properties');
      const { data, error } = await (opts.upsert
        ? q.upsert(body, opts.upsert).select(opts.select)
        : q.insert(body).select(opts.select));

      if (!error) return { data, error: null };

      // Match: `Could not find the 'is_claimed' column of 'properties' in the schema cache`
      const colMatch = error.message?.match(/'([\w_]+)'\s+column/i)
                    || error.message?.match(/column\s+"([\w_]+)"/i);
      if (colMatch) {
        const missing = colMatch[1];
        console.warn(`[supabase] dropping unknown column "${missing}" and retrying — run SUPABASE_SCHEMA.sql to fix permanently`);
        body = stripCol(body, missing);
        continue;
      }
      return { data: null, error };
    }
    return { data: null, error: new Error('too many schema-mismatch retries') };
  }

  if (withUrl.length > 0) {
    const { data, error } = await tryUpsert(withUrl, {
      upsert: { onConflict: 'url', ignoreDuplicates: true },
      select: 'id, url',
    });
    if (error) { console.error('[supabase] upsert error:', error.message); errors.push(error.message); }
    else       { saved += data?.length ?? 0; }
  }

  if (withoutUrl.length > 0) {
    const { data, error } = await tryUpsert(withoutUrl, { select: 'id' });
    if (error) { console.error('[supabase] insert error:', error.message); errors.push(error.message); }
    else       { saved += data?.length ?? 0; }
  }

  const skipped = rows.length - saved - errors.length;
  return { saved, skipped: Math.max(skipped, 0), errors };
}

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function createApifyRouter({ db, broadcast, ingestOneProperty }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const body = req.body;
    console.log('[ingest/apify] webhook received — eventType:', body?.eventType ?? '(none)');

    let rawItems = [];

    if (body?.eventType) {
      const runStatus = body.resource?.status;
      const datasetId = body.resource?.defaultDatasetId;
      console.log(`[ingest/apify] run status=${runStatus} datasetId=${datasetId}`);

      if (runStatus !== 'SUCCEEDED' && runStatus !== 'READY') {
        return res.json({ received: true, processed: 0, note: `Run status "${runStatus}" — nothing to ingest yet.` });
      }
      if (!datasetId) {
        return res.status(400).json({ error: 'Webhook payload has no resource.defaultDatasetId' });
      }
      try {
        rawItems = await fetchApifyDataset(datasetId);
        console.log(`[ingest/apify] fetched ${rawItems.length} items from dataset ${datasetId}`);
      } catch (err) {
        console.error('[ingest/apify] failed to fetch dataset:', err.message);
        return res.status(502).json({ error: 'Could not fetch Apify dataset', detail: err.message });
      }
    } else {
      rawItems = normaliseBody(body);
      if (rawItems.length === 0) {
        return res.status(400).json({ error: 'No items found in request body.' });
      }
    }

    const mappedRows = rawItems.map(mapItem);
    const supabaseResult = await upsertToSupabase(mappedRows);

    const localResults = [];
    for (const item of mappedRows) {
      if (!item.title) continue;
      try {
        const r = await ingestOneProperty(item);
        localResults.push(r);
      } catch (err) {
        localResults.push({ error: err.message });
      }
    }

    const totalMatches = localResults
      .filter(r => r?.matches)
      .reduce((s, r) => s + r.matches.length, 0);

    console.log(`[ingest/apify] done — ${supabaseResult.saved} saved, ${supabaseResult.skipped} skipped, ${totalMatches} matches`);

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
