# Deployment Guide

Step-by-step instructions for deploying the backend to **Render** and the frontend to **Vercel**.

---

## 1 — Deploy the Backend on Render

### Service type
**Web Service** (not a static site)

### Settings

| Setting | Value |
|---|---|
| **Repository** | your GitHub repo |
| **Branch** | `main` |
| **Root Directory** | `clinical-trial-agent` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn api_server:app --host 0.0.0.0 --port $PORT` |
| **Health Check Path** | `/health` |
| **Instance Type** | Standard (1 GB RAM minimum — sentence-transformers needs it) |

### Environment Variables (set in Render dashboard → Environment)

| Key | Value |
|---|---|
| `GOOGLE_API_KEY` | your Google Gemini API key |
| `LLM__PROVIDER` | `google` |
| `LLM__MODEL` | `gemini-2.0-flash` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` (add after Vercel deploy) |

> If using xAI instead: set `XAI_API_KEY`, `LLM__PROVIDER=xai`, `LLM__MODEL=grok-3-mini`.

### Step-by-step

1. Push the repo to GitHub (make sure `.env` is in `.gitignore`).
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect your GitHub repo.
4. Set **Root Directory** to `clinical-trial-agent`.
5. Fill in the build and start commands from the table above.
6. Under **Environment**, add `GOOGLE_API_KEY` and the other variables.
7. Click **Create Web Service**.
8. Wait for the first build to complete (3–5 min — sentence-transformers is large).
9. Once deployed, note your service URL: `https://clinical-trial-api.onrender.com`.
10. Come back and add `ALLOWED_ORIGINS=https://your-app.vercel.app` after step 2 below.

### Notes
- Render free-tier instances spin down after 15 min of inactivity — use **Standard** tier to avoid cold starts during demos.
- The FAISS vector index is built at import time from the bundled dataset. No separate index build step is needed on Render.
- Report files are written to `artifacts/reports/` on the instance's ephemeral filesystem. They persist across requests within a session but are cleared on redeploy. This is acceptable for a demo; use a persistent disk or object storage for production.

---

## 2 — Deploy the Frontend on Vercel

### Settings

| Setting | Value |
|---|---|
| **Framework Preset** | Vite |
| **Root Directory** | `clinical-trial-ui` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### Environment Variables (set in Vercel dashboard → Settings → Environment Variables)

| Key | Value | Environment |
|---|---|---|
| `VITE_API_URL` | `https://clinical-trial-api.onrender.com` | Production, Preview |

> Replace the URL with your actual Render service URL.

### Step-by-step

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**.
2. Import your GitHub repo.
3. Set **Root Directory** to `clinical-trial-ui`.
4. Vercel auto-detects Vite — confirm the build settings match the table above.
5. Under **Environment Variables**, add `VITE_API_URL` = your Render URL.
6. Click **Deploy**.
7. Once deployed, note your Vercel URL: `https://your-app.vercel.app`.
8. Go back to your Render service → **Environment** and set:
   ```
   ALLOWED_ORIGINS=https://your-app.vercel.app
   ```
   Then **Manual Deploy → Deploy latest commit** to restart with the new CORS setting.

### Notes
- `vercel.json` at the frontend root already includes the SPA rewrite rule (`/* → /index.html`) and security headers.
- Every push to `main` triggers an automatic Vercel redeploy.
- Vercel Preview deployments (from pull requests) are automatically permitted by the backend's `allow_origin_regex` rule for `*.vercel.app`.

---

## 3 — Verify End-to-End

After both services are live:

```bash
# 1. Backend health check
curl https://clinical-trial-api.onrender.com/health
# Expected: {"status":"ok"}

# 2. Patients list
curl https://clinical-trial-api.onrender.com/patients | python3 -m json.tool | head -20

# 3. Run a screening (takes ~30–60 s on first cold start)
curl -X POST https://clinical-trial-api.onrender.com/screen \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"P-1842"}' | python3 -m json.tool | head -30

# 4. Open the frontend
open https://your-app.vercel.app
```

---

## Local Development Recap

```bash
# Terminal 1 — backend
cd clinical-trial-agent
source .venv/bin/activate
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — frontend
cd clinical-trial-ui
npm run dev
# Open http://localhost:5173
```

No `VITE_API_URL` is needed locally — the Vite dev-server proxy handles `/api/*` automatically.
