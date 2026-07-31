# Clinical Trial Pre-Screening Agent

An agentic AI system that evaluates patient eligibility for Type 2 Diabetes clinical trials using a LangGraph pipeline, a FastAPI REST backend, and a React/Vite frontend.

> **Safety note:** This tool is a pre-screening aid only. It does not constitute a final eligibility decision, diagnosis, or clinical recommendation. All outputs must be verified by a qualified healthcare professional.

---

## Features

- **Agentic LangGraph pipeline** — five-node graph: filter → retrieve → evaluate → rank → report
- **Rule-based + LLM evaluation** — age, HbA1c, eGFR, and recruiting status evaluated deterministically; medication and condition criteria evaluated by Gemini / Grok
- **FAISS vector retrieval** — patient evidence and trial text chunked and retrieved via semantic similarity
- **Top-3 trial ranking** — scored and ranked by supported criterion count and confidence
- **Markdown + PDF report generation** — full eligibility report with evidence IDs, reasoning, and unanswered questions
- **React UI** — real-time workflow animation, expandable trial cards with criterion-level evidence panels, confidence bars, and report download
- **15 synthetic patients** — FHIR-normalised records against 36 frozen ClinicalTrials.gov trial records

---

## Tech Stack

| Layer | Technology |
|---|---|
| Pipeline orchestration | LangGraph 0.2+ |
| LLM inference | Google Gemini 2.0 Flash / xAI Grok 3 Mini (via LangChain) |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` |
| Vector store | FAISS (CPU) |
| Backend API | FastAPI + Uvicorn |
| Report generation | ReportLab (PDF), custom Markdown renderer |
| Frontend | React 18 + Vite 5 + TypeScript |
| Styling | Tailwind CSS + Framer Motion |
| Backend hosting | Render |
| Frontend hosting | Vercel |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   React / Vite Frontend                  │
│  (Vercel)  GET /patients  POST /screen  GET /report/*   │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────┐
│               FastAPI  (api_server.py)                   │
│               (Render)  port $PORT                       │
└──┬─────────────┬──────────────┬──────────────┬──────────┘
   │             │              │              │
   ▼             ▼              ▼              ▼
filter_node  retrieval_node  evaluation_node  ranking_node
   │             │              │              │
   └─────────────┴──────────────┴──────┬───────┘
                                       ▼
                                  report_node
                             (Markdown + PDF artifact)
```

### LangGraph Nodes

| Node | Responsibility |
|---|---|
| `filter_node` | Hard-filter trials by recruiting status and age bounds |
| `retrieval_node` | Extract patient evidence; retrieve trial evidence via FAISS |
| `evaluation_node` | Rule engine (age/HbA1c/eGFR/recruiting) + LLM evaluator (medication/condition) |
| `ranking_node` | Score and rank filtered trials; cap at top 3 |
| `report_node` | Generate Markdown report + PDF artifact; persist to disk |

---

## Folder Structure

```
froncort.ai-assignment/
├── clinical-trial-agent/          # Python backend
│   ├── app/
│   │   ├── evaluation/            # Rule engine + LLM evaluator + router
│   │   ├── graph/                 # LangGraph nodes + workflow
│   │   ├── llm/                   # LangChain LLM client (Google / xAI)
│   │   ├── models/                # Pydantic models (Patient, Trial, AgentState, …)
│   │   ├── reports/               # Markdown + PDF report generators
│   │   ├── retrieval/             # FAISS vector store, embeddings, parser, loader
│   │   ├── services/              # Service layer wiring pipeline nodes
│   │   └── utils/                 # Logger, helpers, constants
│   ├── artifacts/
│   │   ├── logs/
│   │   ├── metrics/
│   │   ├── reports/               # Generated .md reports
│   │   └── report_pdfs/           # Generated .pdf reports
│   ├── config/
│   │   └── settings.py            # Pydantic-settings config (env-driven)
│   ├── data/
│   │   └── Type2-Diabetes-Trial-Agent-Dataset.json
│   ├── metrics/
│   ├── scripts/
│   ├── tests/
│   ├── api_server.py              # FastAPI entrypoint (Render)
│   ├── main.py                    # CLI entrypoint (typer)
│   ├── render.yaml                # Render deployment config
│   └── requirements.txt
│
├── clinical-trial-ui/             # React/Vite frontend
│   ├── src/
│   │   └── App.tsx                # Single-file UI (types + components + app)
│   ├── vercel.json                # Vercel deployment config
│   ├── vite.config.ts
│   └── package.json
│
├── README.md
└── DEPLOYMENT.md
```

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Google Gemini API key **or** an xAI API key

### 1 — Clone

```bash
git clone <repo-url>
cd froncort.ai-assignment
```

### 2 — Backend

```bash
cd clinical-trial-agent

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set your GOOGLE_API_KEY (or XAI_API_KEY + LLM__PROVIDER=xai)

# Build the FAISS vector index (required before first run)
python main.py index

# Start the API server
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
```

The API is now available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`.

### 3 — Frontend

```bash
cd clinical-trial-ui

npm install
npm run dev
```

Open `http://localhost:5173`.

> The Vite dev server proxies `/api/*` to `http://localhost:8000` automatically — no env var needed locally.

---

## Environment Variables

### Backend (`clinical-trial-agent/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_API_KEY` | Yes (if Google) | — | Google Gemini API key |
| `XAI_API_KEY` | Yes (if xAI) | — | xAI Grok API key |
| `LLM__PROVIDER` | No | `google` | `google` or `xai` |
| `LLM__MODEL` | No | `gemini-2.0-flash` | Model name for the chosen provider |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins, e.g. `https://your-app.vercel.app` |
| `PORT` | No | `8000` | HTTP port (set automatically by Render) |

### Frontend (`clinical-trial-ui/.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | Production only | `/api` (proxied) | Full URL of the deployed Render backend |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{"status":"ok"}` |
| `GET` | `/patients` | List all 15 patients with demographics and lab results |
| `POST` | `/screen` | Run the full pipeline for `{"patient_id":"P-1842"}` |
| `GET` | `/report/{patient_id}/markdown` | Latest Markdown report for a patient |
| `GET` | `/report/{patient_id}/pdf` | Latest PDF report for a patient |
| `GET` | `/docs` | Interactive Swagger UI |

### `POST /screen` — Response Shape

```jsonc
{
  "patient":        { "id": "P-1842", "age": 60, "gender": "male", ... },
  "ranked_trials":  [ { "trial_id": "NCT...", "title": "...", "clinical_fit": "SUPPORTED", "score": 0.857, ... } ],
  "evaluations":    { "NCT...": [ { "criterion_id": "inc_0", "status": "SUPPORTED", "confidence": 0.95, ... } ] },
  "filter_reasons": { "NCT...": "Status: COMPLETED" },
  "report_markdown": "# Clinical Trial Pre-Screening Report\n...",
  "report_data":    { "generated_at": "...", "summary": { ... }, "trials": [ ... ] },
  "trace_id":       "uuid",
  "run_timestamp":  "2026-07-31T14:00:00Z"
}
```

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for exact step-by-step instructions.

---

## Screenshots

> _Add screenshots here after deployment._

| Patient Selection | AI Screening in Progress |
|---|---|
| ![Patient selection screen](docs/screenshots/patient-select.png) | ![Workflow animation](docs/screenshots/workflow.png) |

| Trial Results | Report Download |
|---|---|
| ![Top 3 trials with criteria](docs/screenshots/trials.png) | ![Report card](docs/screenshots/report.png) |

---

## Evaluation Documents

- [AI_USAGE.md](clinical-trial-agent/AI_USAGE.md) — AI tool usage disclosure
- [EVALUATION.md](clinical-trial-agent/EVALUATION.md) — Assignment evaluation notes
- [RESEARCH.md](clinical-trial-agent/RESEARCH.md) — Research and design decisions

---

## License

Educational use only. Trial data sourced from public ClinicalTrials.gov records (frozen snapshot). Patient data is entirely synthetic.
