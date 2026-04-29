# 🚀 Initial Scrape Guide — Fill the Pool

This guide walks you through the first scrape that populates the Lead Hunter pool with fresh leads from Israeli Facebook groups.

---

## Prerequisites

1. **Apify Account** — [Sign up at apify.com](https://apify.com)
2. **Apify Actor** — Use [facebook-groups-scraper](https://apify.com/apify/facebook-groups-scraper) or similar
3. **Apify Token** — Personal access token from your Apify account
4. **Apify Actor ID** — e.g., `apify/facebook-groups-scraper` or your own actor ID

---

## Configuration

Set these environment variables on your Render backend:

```bash
# .env or Render dashboard → Environment variables

APIFY_TOKEN=apify_...your_personal_token...
APIFY_ACTOR_ID=apify/facebook-groups-scraper
APIFY_START_URLS=https://www.facebook.com/groups/buyrent.israel,https://www.facebook.com/groups/tlv.buy.sell
```

Or, use the convenience endpoint which auto-loads all ~30 groups from `FACEBOOK_GROUPS.js`.

---

## Option 1: Trigger All Groups at Once (Recommended)

### Via cURL

```bash
export ADMIN_TOKEN="your_bearer_token"
export BACKEND_URL="https://agentiq-crm.onrender.com"

curl -X POST \
  "$BACKEND_URL/api/apify/run/all-groups" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Response

```json
{
  "ok": true,
  "runId": "xyz123",
  "status": "READY",
  "actorId": "apify/facebook-groups-scraper"
}
```

Visit Apify → Runs → `xyz123` to watch the scrape in real-time.

---

## Option 2: Trigger Specific Groups

```bash
curl -X POST \
  "$BACKEND_URL/api/apify/run" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startUrls": [
      {"url": "https://www.facebook.com/groups/buyrent.israel"},
      {"url": "https://www.facebook.com/groups/tlv.buy.sell"}
    ]
  }'
```

---

## What Happens During Scrape

1. **Apify scraper** crawls the FB groups and extracts posts
2. **Webhook** fires on completion → `POST /api/ingest/apify`
3. **Ingestion pipeline**:
   - Parses post text (title, price, city, contact info)
   - **Anti-broker gate** — filters out posts mentioning:
     - `בבלעדיות`, `משרד תיווך`, `ללא עמלת קונה`
     - `RE/MAX`, `Anglo Saxon`, `Century 21`, etc.
   - Upserts to Supabase `properties` table
   - Marks `is_claimed = false` (ready for agents to claim)
4. **Pool is live** — agents can immediately hit "הוצא ליד עכשיו"

---

## Monitor Progress

### In Apify Dashboard

1. Go to [apify.com/dashboard](https://apify.com/dashboard)
2. Click your run
3. Watch the scraper harvest posts in real-time

### In Supabase

```sql
-- Count fresh leads in pool (24h window)
SELECT COUNT(*) FROM properties 
WHERE is_claimed = false 
  AND ingested_at > NOW() - INTERVAL '24 hours';

-- See which groups are contributing
SELECT source, COUNT(*) as count 
FROM properties 
WHERE is_claimed = false 
GROUP BY source 
ORDER BY count DESC;
```

---

## Troubleshooting

### Webhook didn't fire

- Check Apify integration — does the actor have a webhook configured?
- Verify `APIFY_TOKEN` is valid
- Check backend logs: `heroku logs --tail` (or Render equivalent)

### Few leads ingested

- Anti-broker filter may be aggressive — check logs for `[ingest/apify] anti-broker filter`
- FB groups may be private or have few posts
- Apify scraper may need proxy settings

### Leads not appearing in UI

1. Run `SUPABASE_SCHEMA.sql` in Supabase SQL Editor to migrate columns
2. Check quota — agents may have 0 remaining claims for the month
3. Verify 24h window — older leads are auto-deleted

---

## After First Scrape

✅ Pool is populated  
✅ Agents can claim leads  
✅ Periodic scrapes keep it fresh  

**Schedule recurring scrapes** (every 30 min) for continuous lead flow:
- Use Apify Scheduler
- Or hit `/api/apify/run/all-groups` from a cron job (e.g., GitHub Actions)

---

## Example: Recurring Scrapes via GitHub Actions

Create `.github/workflows/scrape-schedule.yml`:

```yaml
name: Schedule Lead Scrape
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger full scrape
        run: |
          curl -X POST \
            https://agentiq-crm.onrender.com/api/apify/run/all-groups \
            -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

---

**That's it! Your Lead Hunter pool is now alive.** 🎯
