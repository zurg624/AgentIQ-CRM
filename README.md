# AgentIQ — Real Estate CRM

A full-stack, AI-powered CRM for Israeli real estate agents.  
**Stack:** React + Vite + Tailwind v4 · Node.js + Express · SQLite · Claude AI (Anthropic)

---

## 🚀 Deploy in 5 Minutes

### Step 1 — Backend → Render (free tier)

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo.
3. Set **Root Directory** = `backend`.
4. Render auto-detects `render.yaml` — click **Apply**.
5. In the service's **Environment** tab, add:
   | Key | Value |
   |-----|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
   | `FRONTEND_URL` | _(fill in after Step 2)_ |
6. Under **Disks**, confirm `/data` (1 GB) is attached — this persists the SQLite DB.
7. Click **Deploy**. Copy the URL: `https://agentiq-backend.onrender.com`

---

### Step 2 — Frontend → Vercel (free tier)

1. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo.
2. Set **Root Directory** = `frontend`.
3. Add Environment Variable:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://agentiq-backend.onrender.com` |
4. Click **Deploy**. Copy your Vercel URL.
5. Go back to Render → update `FRONTEND_URL` with the Vercel URL → **Save + Redeploy**.

Done! Your CRM is live. ✅

---

## 💻 Local Development

```bash
# 1. Clone
git clone https://github.com/yourname/agentiq.git
cd agentiq

# 2. Backend
cd backend
cp .env.example .env          # Fill in ANTHROPIC_API_KEY
npm install
npm run dev                   # Runs on http://localhost:3001

# 3. Frontend (new terminal)
cd ../frontend
cp .env.example .env          # Leave VITE_API_URL empty for dev
npm install
npm run dev                   # Opens http://localhost:5173
```

The Vite dev proxy auto-routes `/api/*` → `localhost:3001`, so no CORS issues locally.

---

## 🔧 Admin Mode

The **Simulate Lead** button is hidden from regular users.  
To enable it (for testing), open the browser console and run:

```js
localStorage.setItem('iq_admin', '1'); location.reload();
```

To disable: `localStorage.removeItem('iq_admin'); location.reload();`

---

## 🗄️ Database

| Environment | Location | Notes |
|-------------|----------|-------|
| Development | `backend/crm.db` | Auto-created on first run |
| Production (Render) | `/data/crm.db` | Persistent disk — survives redeploys |

### Migrating to PostgreSQL (optional)
If you outgrow SQLite (>10k leads, multiple servers), swap `better-sqlite3` for `pg` + [Neon](https://neon.tech) (free serverless Postgres). All queries use standard SQL — minimal changes needed.

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API key from [console.anthropic.com](https://console.anthropic.com) |
| `PORT` | ❌ | Default: `3001` |
| `NODE_ENV` | ❌ | `development` or `production` |
| `FRONTEND_URL` | ✅ prod | Vercel URL for CORS whitelist |

### Frontend (`frontend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ prod | Render backend URL (empty in dev) |

---

## 📋 Features

| Tab | Feature |
|-----|---------|
| 🤖 צ'אטבוט | Claude-powered real estate Q&A |
| 📊 CRM | Leads table, agent assignment, status tracking |
| 🔄 Follow-Up | Auto-list of leads untouched for 24h |
| 🏡 שכן חכם | Recent area sales (mock → connect to Gov API) |
| 💰 מחשבון עסקה | Purchase tax, mortgage, investment yield |
| 🎯 צייד נכסים | Simulated FB/Yad2 lead feed with 1-click import |
| 📣 שיווק AI | AI-generated Facebook property posts |
| 🪙 חבילות | Pricing tiers |

### Integrations (production wiring)
- **WhatsApp leads**: POST to `/api/webhook/whatsapp` from Twilio or Make.com
- **Facebook Lead Ads**: Connect via Make.com → POST to `/api/new-lead`
- **AI Analysis**: Auto-runs on every new lead (requires `ANTHROPIC_API_KEY`)
- **SSE notifications**: Frontend subscribes to `GET /api/events` for real-time toasts

---

## 🏗️ Project Structure

```
agentiq/
├── backend/
│   ├── index.js          # Express server + all API routes
│   ├── db.js             # SQLite schema + seed data
│   ├── .env.example      # Environment variable template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Root + routing
│   │   ├── components/       # Sidebar, LeadsTable, LeadDetailPanel, Toast…
│   │   ├── pages/            # ChatbotPage, FollowUpPage, ShachenPage…
│   │   └── i18n/             # Hebrew, English, Spanish, Arabic
│   ├── vercel.json
│   └── package.json
├── render.yaml           # Render IaC config
├── .gitignore
└── README.md
```
