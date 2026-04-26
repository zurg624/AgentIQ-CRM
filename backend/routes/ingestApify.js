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
  const postText =
    raw.postText ?? raw.text ?? raw.description ?? raw.body ?? raw.content ?? null;

  const title =
    raw.title         ??
    raw.name          ??
    raw.headline      ??
    raw.propertyTitle ??
    raw.header        ??
    (postText ? String(postText).slice(0, 200).replace(/\n/g, ' ') : null) ??
    'נכס מ-Apify';

  // Price: structured fields → text extraction → default 0
  let price = parsePrice(
    raw.price ?? raw.priceValue ?? raw.priceILS ?? raw.askingPrice ?? raw.cost ?? raw.salePrice ?? null
  );
  if (!price || price === 0) {
    price = extractPriceFromText(postText) ?? 0;
  }

  // City: structured fields → text extraction
  let city = raw.city ?? raw.cityName ?? raw.location ?? raw.region ?? null;
  if (!city) city = extractCityFromText(postText);

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

  const description = postText ?? raw.details ?? null;

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

async function upsertToSupabase(rows) {
  if (!supabase) {
    console.warn('[ingest/apify] Supabase client not configured — skipping cloud save');
    return { saved: 0, skipped: rows.length, errors: [] };
  }

  const withUrl    = rows.filter(r => r.url);
  const withoutUrl = rows.filter(r => !r.url);

  let saved = 0;
  const errors = [];

  if (withUrl.length > 0) {
    const { data, error } = await supabase
      .from('properties')
      .upsert(withUrl, { onConflict: 'url', ignoreDuplicates: true })
      .select('id, url');

    if (error) {
      console.error('[supabase] upsert error:', error.message);
      errors.push(error.message);
    } else {
      saved += data?.length ?? 0;
    }
  }

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
    }
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
