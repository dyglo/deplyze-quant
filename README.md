# Deplyze Quant V5

**AI-native quantitative research and personalized institutional intelligence platform.**

Deplyze Quant is a research operating system that continuously ingests, structures,
and interprets global financial market data to surface institutional-grade
intelligence for independent traders, small prop firms, and quantitative
researchers. 

The platform is intentionally **not**:
- a signal-selling service,
- a retail trading dashboard,
- or an autonomous trading bot.

It is an institutional-style research desk in software form: regime detection,
volatility analysis, cross-asset relationships, macro context, and AI-generated
briefings — with the trader as the final decision-maker.

With **V5 Phase 1**, Deplyze Quant introduces the **Personalized Institutional Intelligence Infrastructure**, bringing user-specific memory, behavioral sessionization, and automated daily profiling via BigQuery and a dedicated Python analytics engine.

---

## Current frontend scope

The page removal on 2026-10-13 retires Intelligent Terminal, Relation Maps, World Equity, US Sectors, Countries and Regional, FX and Liquidity, Portfolio (all sub-pages), Backtesting, Quant Lab, and the standalone Briefing pages. Historical Intelligence remains available.

| Surface | Route | Access |
|---|---|---|
| Home | `/` | Public |
| Instrument detail | `/instruments/:symbol` | Public |
| Macro Regime Desk | `/macro` | Public |
| Historical Intelligence | `/historical-intelligence` | Public |
| Global Yields | `/market/global-yields` | Public |
| Commodities | `/market/commodities` | Public |
| Investigations | `/investigations` | Full account |
| Deep Research | `/research`, `/research/i/:id` | Full account |
| Research Copilot | `/copilot` | Full account |
| Research Library | `/library` | Full account |
| Artifact detail | `/artifacts/:id` | Full account |
| Settings | `/settings` | Full account |
| Login | `/login` | Sign-in surface |

The `/positioning` alias still redirects to `/research`. Unknown and retired routes use the existing Home fallback. Navigation and the public sitemap contain only supported routes.

Shared portfolio holdings/watchlists, Macro portfolio analysis, saved research (including older lab/briefing artifacts), Home/Library briefing feeds, personalization, provider integrations, and email remain available. The Awareness synthesis writer/recompute job stays because daily emails and Copilot portfolio tools consume its data. Email CTAs now open Home or Macro instead of retired Portfolio pages.

The Rust backtest service source, Python backtest endpoints/exporters, gateway backtest proxy, deployment job, and export scheduler configuration were removed. No database tables, persisted collections, migrations, deployed services, or live scheduler jobs were deleted or changed.

See [the removal report](docs/page-removal-report.md) for the file inventory, verification results, retained dependencies, and infrastructure candidates. Earlier architecture audits and release specifications are historical where they describe retired pages.

## Architecture

```
┌── Browser (Vite + React 18) ───────────────────────────────────────┐
│  Firebase Auth · React Router · shadcn/Radix · Recharts · Motion  │
└────────────────────────────────────────────────────────────────────┘
                              │ Bearer ID token & telemetry events
                              ▼
┌── cloud-run/gateway (Node + Express + Firebase Admin + Gemini) ───┐
│  /v1/market     /v1/macro          /v1/research                   │
│  /v1/copilot    /v1/instruments    /v1/personalization/*          │
│                                                                   │
│  Provider adapters (Finnhub, Alpha Vantage, Twelve Data, Tavily)  │
│  Event routing to BigQuery spine, Proxy to Quant Engine           │
└───────────────────────────────────────────────────────────────────┘
                              │ Server-to-Server
                              ▼
┌── cloud-run/quant-engine (Python + FastAPI + Pydantic) ───────────┐
│  /personalization/sessionize                                      │
│  /personalization/profile/build                                   │
│  /personalization/briefing/materialize                            │
│                                                                   │
│  Personalization rules, BigQuery interactions, Ranker logic       │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ├─ Firestore  (workspaces / artifacts / briefings / memory)
                              ├─ BigQuery   (raw_app / cleaned / features / artifacts / ops)
                              ├─ Secret Mgr (personalization-user-id-salt)
                              └─ Scheduler  (Nightly sessionization & profile builds)
```

API keys and secrets live securely in Google Secret Manager. The frontend interacts directly with the gateway, which coordinates data gathering from external APIs and delegates heavy personalization tasks to the Python-based quant engine.

---

## Local development

```bash
# 1. Install dependencies
npm install
npm --prefix cloud-run/gateway install
cd services/quant-engine && uv sync && cd ../..

# 2. Provide secrets in .env.local at repo root
#    - VITE_FIREBASE_* (frontend)
#    - GEMINI_API_KEY, FINNHUB_API_KEY, etc. (gateway)

# 3. Run the gateway and frontend together
npm run dev:all
# frontend:  http://localhost:5173
# gateway:   http://localhost:8080
```

---

## V5 Rollout Phases

| Phase | Focus                                              | Status      |
| ----- | -------------------------------------------------- | ----------- |
| 1     | Personalized Institutional Intelligence Infra      | **Current** |
| 2     | Behavior-driven Candidate Ranking & Filtering      | Planned     |
| 3     | Automated Personal Briefings                       | Planned     |
| 4     | AI Copilot Context Injection                       | Planned     |

---

## Repository layout

```
src/                      Frontend (Vite + React + TypeScript)
  components/quant/       Quant-domain UI primitives
  pages/                  One file per route
  services/               API clients + hooks
cloud-run/gateway/        Authenticated API gateway (Node + Express)
  src/routes/             /v1/* route handlers
services/quant-engine/    Python Analytics & Personalization Engine (FastAPI)
  app/                    Core logic for BigQuery pipelines, ranking, profiling
functions/                Firebase Cloud Functions
firestore.rules           Membership-based access control
firestore.indexes.json    Composite index definitions
docs/                     Architecture & product requirements
```

---

## Disclaimer

Deplyze Quant produces probabilistic research intelligence, **not financial
advice**. The platform does not recommend trades, guarantee outcomes, or
execute orders. The trader remains the final decision-maker.
