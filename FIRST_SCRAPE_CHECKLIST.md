# ✅ Lead Hunter — Initial Scrape Checklist

Follow this checklist to run the first scrape and populate your pool with today's fresh leads.

---

## Step 1: Apify Setup

- [ ] **Create Apify Account** → [apify.com/sign-up](https://apify.com)
- [ ] **Copy Personal Token** → Account → Settings → Personal API tokens → Copy
- [ ] **Choose Actor** → Use `apify/facebook-groups-scraper` or your preferred FB actor
- [ ] **Note Actor ID** → e.g., `apify/facebook-groups-scraper`

---

## Step 2: Set Environment Variables

On **Render.com** (or your hosting):

1. Go to Dashboard → Your App → Environment
2. Add these variables:

```
APIFY_TOKEN = apify_xxxxxxxxxxxxxxxxxxxxxxxx
APIFY_ACTOR_ID = apify/facebook-groups-scraper
APIFY_START_URLS = (leave empty — we'll use the endpoint)
```

3. Deploy your backend (Render will auto-redeploy on env change)

---

## Step 3: Verify Backend is Reachable

```bash
curl -s https://agentiq-crm.onrender.com/api/health | head -20
```

Should return HTTP 200 (or similar success). If 502/503, wait 5 min for Render to finish deploying.

---

## Step 4: Get Admin Token

Your admin token is a base64-encoded string: `base64("username:admin:timestamp")`

**For development/testing**, generate one:

```bash
# Simple Python command to generate a token
python3 -c "
import base64
token = base64.b64encode(b'admin:admin:1234567890').decode()
print('Bearer ' + token)
"
```

Or, extract from your logged-in admin's browser (DevTools → Application → localStorage → `iq_token`).

**Save it:**
```bash
export ADMIN_TOKEN="Bearer <your_token>"
```

---

## Step 5: Trigger the Scrape

### Option A: All Groups at Once (Recommended)

```bash
curl -X POST \
  https://agentiq-crm.onrender.com/api/apify/run/all-groups \
  -H "Authorization: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

**Expected response:**
```json
{
  "ok": true,
  "runId": "abc123xyz",
  "status": "READY",
  "actorId": "apify/facebook-groups-scraper"
}
```

- [ ] Got `"ok": true`? ✅ Scrape queued
- [ ] Note the `runId` — use it to monitor progress in Apify

### Option B: Specific Groups

```bash
curl -X POST \
  https://agentiq-crm.onrender.com/api/apify/run \
  -H "Authorization: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startUrls": [
      {"url": "https://www.facebook.com/groups/buyrent.israel"},
      {"url": "https://www.facebook.com/groups/tlv.buy.sell"}
    ]
  }' | jq .
```

---

## Step 6: Monitor Progress

### In Apify Dashboard

1. Go to [apify.com/dashboard](https://apify.com/dashboard)
2. Find your run by `runId` from Step 5
3. Watch the logs in real-time
4. Status should go: `READY` → `RUNNING` → `SUCCEEDED`

**Typical timing:**
- ~30 groups × 2-3 min per group = **60-90 minutes** total

### In Supabase

Once scraping completes, check what landed in the pool:

```sql
-- Count fresh leads
SELECT COUNT(*) as fresh_leads FROM properties 
WHERE is_claimed = false 
  AND ingested_at > NOW() - INTERVAL '24 hours';

-- See sample leads
SELECT title, price, city, original_post_date FROM properties 
WHERE is_claimed = false 
LIMIT 5;

-- Count by source (city/group)
SELECT source, COUNT(*) as count FROM properties 
WHERE is_claimed = false 
GROUP BY source 
ORDER BY count DESC;

-- Check anti-broker filtering
SELECT COUNT(*) as filtered_brokers FROM properties 
WHERE is_claimed = false 
  AND (title ILIKE '%exclusive%' OR title ILIKE '%broker%');
```

---

## Step 7: Test the UI

1. **Open LeadHunterPage** in your frontend
2. **See fresh count** → "כל הערים" dropdown should populate
3. **Press "⚡ הוצא ליד עכשיו"** → Should claim a fresh lead
4. **See success banner** → "✨ נמצא ליד טרי ב-{city} שפורסם לפני X דק׳"
5. **Check "My Claims"** → New lead appears at top with status "New"

---

## Step 8: Set Up Recurring Scrapes

So the pool stays fresh, set up **recurring scrapes every 30 minutes**.

### Option A: Apify Scheduler (Native)

1. Go to your Actor in Apify
2. Click **Schedules**
3. **New schedule** → Every 30 minutes → Save

### Option B: GitHub Actions (No extra cost)

Create `.github/workflows/scrape-every-30m.yml`:

```yaml
name: Refresh Lead Pool
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes, UTC

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Apify scrape
        run: |
          curl -X POST \
            https://agentiq-crm.onrender.com/api/apify/run/all-groups \
            -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

Then add `ADMIN_TOKEN` to GitHub Secrets.

---

## Step 9: Verify Anti-Broker Filter

The system **automatically rejects** posts mentioning:
- `בבלעדיות` (exclusive)
- `משרד תיווך` (real estate office)
- `ללא עמלת קונה` (no buyer commission)
- `RE/MAX`, `Anglo Saxon`, `Century 21`, etc.

To verify it's working, check backend logs:

```bash
heroku logs --tail  # or Render's log viewer
```

You should see:
```
[ingest/apify] anti-broker filter: rejected 23/150 broker posts
```

---

## ✅ Success Checklist

- [ ] Apify account created & token saved
- [ ] Environment variables set on Render
- [ ] Initial scrape triggered (`/api/apify/run/all-groups` returned `"ok": true`)
- [ ] Scrape completed in Apify (status = `SUCCEEDED`)
- [ ] Leads appear in Supabase (`SELECT COUNT(*) FROM properties WHERE is_claimed = false`)
- [ ] LeadHunterPage shows fresh count > 0
- [ ] Successfully claimed a test lead (flash banner appeared)
- [ ] Anti-broker filter logged filtering results
- [ ] Recurring scrape schedule configured (30-minute interval)

---

## 🎉 You're Live!

Your Lead Hunter pool is now populated and **continuously refreshed every 30 minutes**. Agents can start claiming fresh leads immediately.

---

## 📖 Full Documentation

- **Backend Setup** → `backend/INITIAL_SCRAPE.md`
- **User Guide** → `frontend/src/pages/LEAD_HUNTER_GUIDE.md`
- **Facebook Groups** → `backend/FACEBOOK_GROUPS.js`

