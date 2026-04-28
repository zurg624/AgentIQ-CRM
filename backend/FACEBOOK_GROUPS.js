/**
 * Master list of Israeli real-estate & property rental Facebook groups
 * for the Lead Hunter scraper. Organized by region + category.
 *
 * Add URLs in the format:
 *   https://www.facebook.com/groups/[GROUP_ID]/
 *   https://www.facebook.com/groups/[GROUP_ALIAS]/
 *
 * The Apify actor (facebook-groups-scraper) will run on all these groups
 * and funnel posts into the properties table every 30 minutes.
 *
 * Usage:
 *   const groups = require('./FACEBOOK_GROUPS');
 *   for (const url of groups.allGroupUrls()) { await runApifyOnGroup(url); }
 */

const GROUPS = {
  // ─── NATIONAL (all of Israel) ──────────────────────────────────────────
  national: [
    'https://www.facebook.com/groups/buyrent.israel',          // Buy/Rent Israel — 200K+ members
    'https://www.facebook.com/groups/israelrealestate',        // Israel Real Estate
    'https://www.facebook.com/groups/natanim.lehaskira',       // תן/קח לשכירות
    'https://www.facebook.com/groups/natanim.lemikra',         // תן/קח למכירה
    'https://www.facebook.com/groups/buy.sell.rental.israel',  // Buy Sell Rental Israel
  ],

  // ─── TEL AVIV & CENTRAL (תל אביב, גוש דן) ──────────────────────────────
  telAviv: [
    'https://www.facebook.com/groups/tlv.buy.sell',            // Tel Aviv Buy & Sell
    'https://www.facebook.com/groups/tlv.rent',                // Tel Aviv Rental
    'https://www.facebook.com/groups/gush.dan.natanim',        // גוש דן נתנים
    'https://www.facebook.com/groups/telAviv.apartments',      // Tel Aviv Apartments
    'https://www.facebook.com/groups/tlv.property.market',     // TLV Property Market
  ],

  // ─── HAIFA & NORTH (חיפה, צפון) ───────────────────────────────────────
  haifa: [
    'https://www.facebook.com/groups/haifa.buy.sell',          // Haifa Buy & Sell
    'https://www.facebook.com/groups/haifa.natanim',           // חיפה נתנים
    'https://www.facebook.com/groups/north.israel.property',   // North Israel Property
    'https://www.facebook.com/groups/carmel.real.estate',      // Carmel Area Real Estate
  ],

  // ─── JERUSALEM & CENTER (ירושלים, אזור מרכז) ─────────────────────────
  jerusalem: [
    'https://www.facebook.com/groups/jerusalem.buy.sell',      // Jerusalem Buy & Sell
    'https://www.facebook.com/groups/jerusalem.natanim',       // ירושלים נתנים
    'https://www.facebook.com/groups/jerusalem.apartment',     // Jerusalem Apartments
    'https://www.facebook.com/groups/haredi.estate.israel',    // Haredi Real Estate Market
  ],

  // ─── SOUTH & BEERSHEBA (דרום, באר שבע) ────────────────────────────────
  south: [
    'https://www.facebook.com/groups/beersheba.buy.sell',      // Be'er Sheva Buy & Sell
    'https://www.facebook.com/groups/south.israel.natanim',    // דרום ישראל נתנים
    'https://www.facebook.com/groups/negev.property.market',   // Negev Property Market
  ],

  // ─── SUBURBAN & COMMUTER ZONES (פרברים וחזון שנות ה-2000) ──────────────
  suburban: [
    'https://www.facebook.com/groups/modiin.natanim',          // מודיעין נתנים
    'https://www.facebook.com/groups/raanana.buy.sell',        // רעננה לקניה ומכירה
    'https://www.facebook.com/groups/petah.tikva.property',    // פתח תקווה נדלן
    'https://www.facebook.com/groups/ashdod.natanim',          // אשדוד נתנים
    'https://www.facebook.com/groups/rishon.lezion.estate',    // ראשון לציון דלק״ן
  ],

  // ─── INVESTOR & VACATION RENTAL (השקעה וחדרים להשכרה) ─────────────────
  investor: [
    'https://www.facebook.com/groups/israel.vacation.rental',  // Israel Vacation Rental
    'https://www.facebook.com/groups/airbnb.israel.hosts',     // Airbnb Israel Hosts
    'https://www.facebook.com/groups/real.estate.investors.il',// Real Estate Investors IL
    'https://www.facebook.com/groups/property.flipping.israel', // Property Flipping Israel
  ],
};

/**
 * Flatten all groups into a single array
 */
function allGroupUrls() {
  return Object.values(GROUPS)
    .flat()
    .filter(url => typeof url === 'string' && url.startsWith('https'));
}

/**
 * Count of groups by category
 */
function getStats() {
  const stats = {};
  for (const [cat, urls] of Object.entries(GROUPS)) {
    if (Array.isArray(urls)) stats[cat] = urls.length;
  }
  return { total: allGroupUrls().length, byCategory: stats };
}

module.exports = {
  GROUPS,
  allGroupUrls,
  getStats,
};
