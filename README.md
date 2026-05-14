# Deplyze Quant

**AI-native quantitative research and market intelligence platform.**

Deplyze Quant is a research operating system that continuously ingests, structures,
and interprets global financial market data to surface institutional-grade
intelligence for independent traders, small prop firms, and quantitative
researchers. See `docs/deplyzequant-prd.md` for the full product requirements.

The platform is intentionally **not**:

- a signal-selling service,
- a retail trading dashboard,
- or an autonomous trading bot.

It is an institutional-style research desk in software form: regime detection,
volatility analysis, cross-asset relationships, macro context, and AI-generated
briefings — with the trader as the final decision-maker.

---

## Architecture

```
┌── Browser (Vite + React 18) ───────────────────────────────────────┐
│  Firebase Auth · React Router · shadcn/Radix · Recharts · Motion  │
└────────────────────────────────────────────────────────────────────┘
                              │ Bearer ID token
                              ▼
┌── cloud-run/gateway (Node + Express + Firebase Admin + Gemini) ───┐
│  /v1/market   /v1/macro     /v1/research                          │
│  /v1/copilot  /v1/instruments  /v1/providers                      │
│                                                                   │
│  Provider adapters: Finnhub · Alpha Vantage · Twelve Data ·       │
│  Tavily · Serper. Gemini for synthesis & Copilot.                 │
│  Firestore-backed TTL cache (`providerCache`).                    │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ├─ Firestore  (workspaces / projects / artifacts / briefings)
                              ├─ BigQuery   (Phase 2+: raw / cleaned / features / research)
                              └─ Vertex AI  (Phase 4+: ML models)
```

API keys live only on the server. The browser talks to the gateway via
`/api/v1/*`, which Vite proxies to `http://localhost:8080` in dev and a Cloud
Run service in production.

---

## Local development

```bash
# 1. Install dependencies in all three packages
npm install
npm --prefix cloud-run/gateway install
npm --prefix functions install

# 2. Provide secrets in .env.local at repo root (see .env.example)
#    - VITE_FIREBASE_* (frontend)
#    - GEMINI_API_KEY, FINNHUB_API_KEY, ALPHA_VANTAGE_API_KEY,
#      TWELVE_DATA_API_KEY, TAVILY_API_KEY, SERPER_API_KEY (gateway)
#    - FIREBASE_PROJECT_ID

# 3. Run the gateway and frontend together
npm run dev:all
# frontend:  http://localhost:5173
# gateway:   http://localhost:8080
```

The gateway loads `.env.local` from the repo root or its own directory at
startup. In Cloud Run, env vars come from Secret Manager and the runtime
configuration; `.env.local` is only used for local development.

---

## Build phases

| Phase | Focus                              | Status      |
| ----- | ---------------------------------- | ----------- |
| 1     | Frontend shell + gateway providers | **Current** |
| 2     | BigQuery ingestion pipelines       | Planned     |
| 3     | Quant analysis engine              | Planned     |
| 4     | ML intelligence (Vertex AI)        | Planned     |
| 5     | Agentic research layer             | Planned     |

---

## Repository layout

```
src/                      Frontend (Vite + React + TypeScript)
  components/quant/       Quant-domain UI primitives
  pages/                  One file per route (PRD §15)
  services/               gatewayClient + Firestore + per-domain wrappers
  hooks/                  Data-fetching React hooks
cloud-run/gateway/        Authenticated API gateway (Node + Express)
  src/providers/          Finnhub / AV / TD / Tavily / Serper adapters
  src/routes/             /v1/* route handlers
  src/services/           Firestore Admin, Gemini, TTL cache
functions/                Firebase Cloud Functions (scheduled, triggered)
firestore.rules           Membership-based access control
docs/                     PRD + glossary + infra notes
```

---

## Disclaimer

Deplyze Quant produces probabilistic research intelligence, **not financial
advice**. The platform does not recommend trades, guarantee outcomes, or
execute orders. The trader remains the final decision-maker.
