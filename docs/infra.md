# Infrastructure — Deplyze Quant

This file is intentionally a stub during Phase 1. It will be filled in during
Phase 2 (BigQuery ingestion) and Phase 5 (agent fleet).

## Planned topology (target architecture)

- **Firebase Hosting** — static frontend (Vite build output).
- **Cloud Run / gateway** — authenticated API, holds provider keys.
- **Cloud Run / ingest-worker** (Phase 2) — pulls Finnhub / Alpha Vantage /
  Twelve Data / Tavily / Serper data on a schedule, writes to BigQuery `dq_raw`.
- **Cloud Run / analysis-worker** (Phase 3) — runs regime, vol, correlation,
  seasonality, anomaly jobs; writes `dq_features` and `dq_research`.
- **Cloud Run / agents/{macro,vol,sentiment,xasset,liquidity,regime,opportunity,
  earnings,risk}** (Phase 5) — one service per agent.
- **Cloud Scheduler + Pub/Sub** — orchestration: `ingest.*`, `analysis.*`,
  `agent.*` topics.
- **BigQuery** — datasets `dq_raw`, `dq_cleaned`, `dq_features`, `dq_research`.
- **Vertex AI** (Phase 4) — model training & serving for the ML suite.
- **Secret Manager** — provider keys, GEMINI_API_KEY.

## Phase 1 actuals

- Firebase Auth + Firestore are operational.
- Gateway is deployable as a single Cloud Run service (existing Dockerfile).
- BigQuery, agent services, and Vertex AI are **not** yet provisioned.

## Local development

The gateway loads `.env.local` at startup. The browser talks to the gateway
through `/api/v1/*` (Vite dev proxy → `http://localhost:8080`, prod →
Firebase Hosting rewrite to Cloud Run).
