-- ╔════════════════════════════════════════════════════════════════════╗
-- ║  AgentIQ — Supabase schema migration for the Lead Hunter           ║
-- ║  Run this ONCE in the Supabase SQL Editor                          ║
-- ║  (https://app.supabase.com → your project → SQL Editor → New query)║
-- ╚════════════════════════════════════════════════════════════════════╝

-- 1. Make sure every column the backend expects exists.
--    "ADD COLUMN IF NOT EXISTS" is safe to run repeatedly.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS title              TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price              BIGINT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS city               TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS area               TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS type               TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rooms              NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sqm                INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS url                TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source             TEXT DEFAULT 'Apify';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS description        TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS assigned_to        TEXT;

-- 2. Lead Hunter — freshness + claim tracking
ALTER TABLE properties ADD COLUMN IF NOT EXISTS original_post_date TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_claimed         BOOLEAN     DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS claimed_by         TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS claimed_at         TIMESTAMPTZ;

-- Optional: status tracking on claimed leads + contact info extracted from posts
ALTER TABLE properties ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'New';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_name        TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_phone       TEXT;

-- Quota lookup index — counting a user's claims this month must be instant
CREATE INDEX IF NOT EXISTS properties_claimed_by_at
  ON properties (claimed_by, claimed_at DESC);

-- 3. Make sure created_at exists (Supabase tables created via the dashboard
--    sometimes use this name; the backend also writes ingested_at).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ingested_at        TIMESTAMPTZ DEFAULT NOW();

-- 4. URL deduplication (partial unique — allows multiple NULL urls)
CREATE UNIQUE INDEX IF NOT EXISTS properties_url_unique
  ON properties (url)
  WHERE url IS NOT NULL;

-- 5. Hot path: "give me the newest unclaimed lead" must be instant
CREATE INDEX IF NOT EXISTS properties_unclaimed_by_post_date
  ON properties (original_post_date DESC NULLS LAST)
  WHERE is_claimed = FALSE;

CREATE INDEX IF NOT EXISTS properties_unclaimed_by_ingested
  ON properties (ingested_at DESC)
  WHERE is_claimed = FALSE;

-- ✅ done — verify with:
--    SELECT column_name FROM information_schema.columns WHERE table_name = 'properties';
