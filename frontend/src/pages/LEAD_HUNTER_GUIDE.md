# 🎯 Lead Hunter — User Guide

Welcome to the Lead Hunter, your exclusive real-time lead discovery system. Every lead here is fresh (posted in the last 24 hours), hand-picked from Israeli real-estate communities, and pre-filtered to ensure you're only contacting private sellers.

---

## 🔥 How It Works

### 1. The Pool
Your system continuously scans major Israeli real-estate Facebook groups and ingests fresh posts. Each post is:
- **Verified** — Only private sellers (no brokers or agencies)
- **Fresh** — Posted in the last 24 hours
- **Enriched** — Extracted city, price, property type, contact info

### 2. Claiming a Lead
Press **"⚡ הוצא ליד עכשיו"** to grab the next fresh lead matching your filters:

- **City Filter** — Find leads in your target city
- **Type Filter** — Narrow down to apartment, house, land, etc.
- **Live Feedback** — "✨ נמצא ליד טרי ב-תל אביב שפורסם לפני 7 דק׳"

Each claim:
- Atomically locks the lead (no race conditions)
- Counts against your monthly quota
- Adds the lead to **"My Claims"** at the top

### 3. Monthly Quota
Your plan determines how many leads you can claim per month:

| Plan  | Limit | Status |
|-------|-------|--------|
| Base  | 10    | 🔴 Reset 1st of month |
| Pro   | ∞     | 🟢 Unlimited |
| Elite | ∞     | 🟢 Unlimited |

**Your Progress**: See `מכסת חבילה: X/10` under the claim button.

---

## 👤 My Claims

Your claimed leads appear here in reverse chronological order. For each:

### Status Badge
- **New** — Fresh claim, not contacted yet
- **Contacted** — You've reached out
- **Meeting Scheduled** — Appointment set
- **Closed** — Deal done or lead abandoned

### Quick Actions
- **📝 Edit** — Update contact info, notes, or status
- **🔄 Convert to CRM** — Move to your main CRM for long-term tracking
- **🗑️ Delete** — Remove from your claims (frees up quota)

---

## 🚀 Pro Tips

### Maximize Your Claims
1. **Use Filters** — Narrow by city/type before claiming to avoid mismatches
2. **Monitor Fresh** — The "Live" banner shows exactly how old the post is (e.g., "7 דק׳")
3. **Act Fast** — Best leads move quickly; claim and contact same day

### Convert to CRM
When a lead shows promise:
1. Click **"🔄 Convert to CRM"** on the lead card
2. The system automatically:
   - Copies city, type, price, description
   - Extracts contact name & phone (if available)
   - Creates a full CRM lead for long-term pipeline tracking

### City Awareness
Can't find leads in your city right now? The system says:
> *"מחפשים עבורך לידים חדשים ב-תל אביב... אנא נסה שוב בעוד מספר דקות"*

This means the scraper is actively looking—check back in a few minutes.

---

## 📊 Dashboard Stats

At the top, see your overview:

- **🎯 Total** — All claims you've made this month
- **🔥 Active** — Leads in "Contacted" or "Meeting" status
- **✅ Closed** — Deals completed

---

## ⚙️ How We Stay Private

Your Lead Hunter system:
- ✅ Filters out all broker posts automatically (no middlemen)
- ✅ Only shows leads from Facebook communities (where real people post)
- ✅ Updates continuously—old leads auto-purge after 24 hours
- ✅ Keeps your claimed leads forever (they're yours)

---

## 🆘 Troubleshooting

### "המאגר מתעדכן כרגע..."
The system is between scrapes. **No action needed**—check back in a few minutes. New leads arrive continuously.

### "הליד נחטף ע"י סוכן אחר"
Two agents claimed the same lead simultaneously (rare race condition). Try again—more leads are coming in constantly.

### Button Disabled (Quota)
You've reached your monthly limit. Either:
- Wait for next month (quota resets on the 1st), **or**
- Upgrade to Pro/Elite for unlimited claims

---

## 📞 Contact Support

Questions or issues? Your system integrates with your main CRM—reach out through the support channel there.

---

**Happy Hunting! 🎯**
