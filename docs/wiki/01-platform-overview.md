# 1. Platform Overview

> **Deplyze Quant** is an AI-native quantitative research and market
> intelligence platform. As of **V3 Phase 2**, it pairs a Vite/React
> research terminal with two Cloud Run services — an authenticated
> Express gateway and a dedicated FastAPI Quant Engine — sitting on top
> of a multi-layer BigQuery refinery, Firestore (user state), Redis
> (cache), and a deterministic intelligence pipeline orchestrated by
> Cloud Scheduler.

This page is the canonical entry point. Each numbered section links to
a dedicated wiki page with the full detail.

---

## 1.1 Mission & product surface

Deplyze Quant lets analysts:

- Pull live and historical market data from a curated mesh of providers
  (Finnhub, Alpha Vantage, Twelve Data, FMP, Polygon, EODHD, SEC EDGAR,
  FRED, CFTC, Tavily/Serper, etc.) without ever touching their own keys.
- Run an AI copilot (Gemini) grounded in real provider data — quotes,
  fundamentals, filings, macro, news, and the V3P2 intelligence layer.
- Build watchlists, screens, and dashboards that materialise into
  research artifacts (briefings, snapshots, charts) stored in
  Firestore.
- Browse the **warehouse-backed intelligence layer** introduced in
  V3P2 — macro regimes, narrative emergence, filings observations,
  anomaly summaries, and autonomous daily/weekly briefings — surfaced
  via the **Research Library**, **Model Observatory**, **Warehouse
  Explorer**, and **Macro Intelligence Terminal**.

The headline V3P2 outcome: intelligence is now **persisted and
reproducible**. Every observation, artifact, and briefing lands in
BigQuery with full lineage, partitioned by `observation_time`, and is
read by the gateway through `/v1/macro/regimes`, `/v1/filings/*`,
`/v1/narratives/*`, `/v1/research/macro-observations`,
`/v1/relations/context`, and `/v1/briefings/latest`.

---

## 1.2 System architecture (post V3P2)

```
                    ┌────────────────────────────────────────────────────┐
                    │            Web app (Vite + React, Firebase)        │
                    │  Macro Terminal · Research Library · Warehouse     │
                    │  Explorer · Model Observatory · Copilot · Charts   │
                    └─────────────────────────┬──────────────────────────┘
                                              │ Firebase ID token
                                              ▼
                    ┌────────────────────────────────────────────────────┐
                    │   deplyze-gateway  (Express · Cloud Run · us-c1)   │
                    │  /v1/market /v1/macro /v1/research /v1/copilot     │
                    │  /v1/instruments /v1/providers /v1/briefings       │
                    │  /v1/fundamentals /v1/earnings /v1/edgar           │
                    │  /v1/intelligence  +  V3P2 mounts:                 │
                    │    /v1/macro/regimes  /v1/filings/*                │
                    │    /v1/narratives/*   /v1/research/...             │
                    │    /v1/relations/context  /v1/briefings/latest     │
                    └──┬──────────────────────────────────────────┬──────┘
                       │ Redis cache                              │ Reads
                       │ (Upstash / Memorystore)                  ▼
                       │                          ┌──────────────────────┐
                       │                          │     BigQuery         │
                       │                          │     Refinery         │
                       │                          │                      │
                       │                          │  dq_raw zone         │
                       │                          │   ├─ raw_api         │
                       │                          │   ├─ raw_public      │
                       │                          │   └─ raw_documents   │
                       │                          │  dq_features zone    │
                       │                          │   └─ features        │
                       │                          │  dq_intelligence     │
                       │                          │   ├─ cleaned         │
                       │                          │   └─ artifacts       │
                       │                          │  dq_research zone    │
                       │                          │   └─ research        │
                       │                          │  + model_outputs     │
                       │                          └──────────▲───────────┘
                       │                                     │ Writes
                       │                                     │ (background)
                       ▼                                     │
       Provider mesh (server-side keys)        ┌─────────────┴─────────────┐
       Finnhub · AlphaVantage · TwelveData      │ deplyze-quant-engine     │
       FMP · Polygon · EODHD · SEC EDGAR        │ FastAPI · Cloud Run      │
       FRED · CFTC · RSS · Calendar · Gemini    │ (separate from gateway)  │
       Tavily · Serper                          │                          │
                                                │  /v1/pipelines/...       │
                                                │  /v1/warehouse/...       │
                                                │  /health /ready /version │
                                                └─────────────▲────────────┘
                                                              │ HTTP-OIDC
                                                              │
                                                ┌─────────────┴────────────┐
                                                │     Cloud Scheduler      │
                                                │  10 V3P2 cron jobs       │
                                                │  (ingest · refine ·      │
                                                │   intelligence)          │
                                                └──────────────────────────┘
```

Three high-impact V3P2 deltas vs V3 Phase 1:

1. **A second Cloud Run service** — `deplyze-quant-engine` — handles
   ingestion, refinement, and intelligence. The gateway no longer
   computes intelligence itself; it just reads materialised BigQuery
   tables.
2. **A multi-zone BigQuery refinery** — raw → cleaned → features →
   artifacts/research/model_outputs — with 12 new V3P2 tables on top
   of the V3P1 base.
3. **Cloud Scheduler** drives the pipeline. 10 jobs (`v3p2-ingest-*`,
   `v3p2-refine-*`, `v3p2-macro-regime`, `v3p2-narratives`,
   `v3p2-briefings`) call `deplyze-quant-engine` over authenticated
   HTTP on a fixed cron.

See **[1.4 — V3 Phase 2 Architecture](./01.4-v3-phase2-architecture.md)**
for the wave-by-wave breakdown.

---

## 1.3 Major modules

| Module | Page | Purpose |
|---|---|---|
| Macro Intelligence Terminal | §12 | Live regime board, calendar, observations |
| Research Library | §10 | User-saved artifacts **+** V3P2 deterministic briefings panel |
| Warehouse Explorer | [11.2](./11.2-warehouse-explorer.md) | Dataset registry across the BigQuery zones |
| Model Observatory | [11.1](./11.1-model-observatory.md) | ML model registry, status, validation criteria |
| Briefings System | [15](./15-v3p2-intelligence-pipelines.md) | Daily / weekly / anomaly briefings written by the quant engine |
| Copilot | §7 | Gemini grounded in provider data + V3P2 artifacts |
| Charts & Screens | §9 | Quote-driven workflows for analysts |

### Warehouse Explorer

`src/pages/WarehouseExplorer.tsx` ships a curated **dataset registry**
covering four zones (`dq_raw`, `dq_intelligence`, `dq_research`,
`dq_features`) and 14+ datasets including `instruments`, `quotes_eod`,
`macro_observations`, `narrative_memory`, `narrative_features`,
`generated_briefings`, and the planned feature stores
(`features.returns`, `features.volatility`, `features.factor_loadings`).
The page renders status pills, owners, freshness, and per-zone
descriptions so analysts can see, at a glance, **which datasets are
populated vs planned**.

### Model Observatory

`src/pages/ModelObservatory.tsx` tracks **seven** quant models with
explicit lifecycle status (`data-ready`, `needs-training`,
`needs-dataset`, `planned`, `disabled`):

| Model | Category | Status |
|---|---|---|
| Regime Classifier | Market Regime | `needs-dataset` |
| Directional Bias | Forecast | `needs-dataset` |
| Volatility Forecaster | Volatility | `needs-dataset` |
| Correlation Shift Detector | Correlations | `needs-dataset` |
| Sentiment Intelligence | NLP | `data-ready` |
| Anomaly Detection | Anomaly | `data-ready` |
| Event Impact Model | Event Study | `planned` |

Each card shows expected output, feature set, required providers and
datasets, validation criteria, and the next blocking step.

### Research Library

`src/pages/ResearchLibrary.tsx` is the user's persistent research
surface. With V3P2 it gained a `V3P2LatestBriefingsPanel` at the top
that reads `research.generated_briefings` via `/v1/briefings/latest` —
explicitly **separate** from the user's manually saved library below,
so users can see the platform's own deterministic intelligence next to
their own.

### Briefings System

The quant engine's `briefings/generators.py` produces three briefing
types — `daily_market_intelligence`, `weekly_regime_brief`,
`anomaly_summary` — fully deterministic, template-based, with no LLM
calls. Each lands in `research.generated_briefings` with a lineage
`briefing:<type>:<period_end>` and is surfaced to the UI through the
gateway. See [§15](./15-v3p2-intelligence-pipelines.md).

---

## 1.4 V3 Phase 2 Architecture

Full detail lives on its own page —
**[1.4 V3 Phase 2 Architecture](./01.4-v3-phase2-architecture.md)** —
covering: BigQuery refinery schema (12 new tables), the SEC EDGAR /
FRED / CFTC / RSS / Calendar connectors, the document parsing and
entity extraction pipeline, the macro regime and narrative
intelligence engines, and the autonomous briefing generation system.

---

## 2. Services

### 2.1 Web app (Vite + React)

Static SPA hosted on Firebase Hosting, talks only to the gateway
(`/v1` in dev, `/api/v1` in prod via Firebase Hosting rewrites). All
provider keys live server-side.

### 2.2 Gateway (Node / Express on Cloud Run)

Entry: `cloud-run/gateway/src/index.ts`. Sub-routers under
`/v1`: `market`, `macro`, `research`, `copilot`, `instruments`,
`providers`, `briefings`, `fundamentals`, `earnings`, `edgar`,
`intelligence`, plus the V3P2 router (`routes/v3p2.ts`) mounted last
to fill in `/v1/macro/regimes`, `/v1/filings/*`, `/v1/narratives/*`,
`/v1/research/macro-observations`, `/v1/relations/context`, and
`/v1/briefings/latest`.

- **Auth:** Firebase ID token via `middleware/auth.ts`.
- **CORS, rate limit, request-id, helmet:** all middleware.
- **Cache:** Redis (Upstash / Memorystore) with named TTLs (`TTL.quote`,
  `TTL.fundamentals`, etc.). V3P2 reads use `TTL.quote * N` multipliers
  (e.g. regimes cached for `TTL.quote * 10`, briefings for `TTL.quote * 5`).
- **Required env:** `FIREBASE_PROJECT_ID`, `GEMINI_API_KEY`,
  `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TWELVE_DATA_API_KEY`,
  `TAVILY_API_KEY`, `SERPER_API_KEY`. Optional V2/V3 providers:
  `POLYGON_API_KEY`, `FMP_API_KEY`, `EODHD_API_KEY`,
  `SEC_EDGAR_USER_AGENT`. Project: `GCP_PROJECT` for BigQuery reads.

### 2.3 Quant Engine Service

`deplyze-quant-engine` is a separate FastAPI service on Cloud Run.
See its dedicated page —
**[2.3 Quant Engine Service](./02.3-quant-engine-service.md)** — for
the full architecture, lifecycle, endpoint matrix, and deployment
process.

---

## 3. Data

### 3.1 Provider mesh

Direct provider HTTP clients in `cloud-run/gateway/src/providers/`
(Finnhub, Alpha Vantage, Twelve Data, FMP, Polygon, EODHD, SEC EDGAR,
Tavily, Serper, Gemini) and in
`services/quant-engine/app/providers/` (FRED, EDGAR, CFTC, RSS,
Calendar). The quant engine's provider layer is what ultimately writes
into `raw_api/*` and `raw_public/*` BigQuery tables.

### 3.2 Firestore (user state)

Per-user state — auth profile, saved research, watchlists, screen
configs, copilot threads — stays in Firestore. Hybrid persistence is
intentional: BigQuery is for high-volume, time-series, market /
intelligence data; Firestore is for low-volume, per-user, mutable
state.

### 3.3 Redis cache

Gateway-side response cache, namespaced per route family. V3P2 routes
share the same cache primitive (`withCache`) and TTL constants as the
rest of `/v1`, so warehouse reads are typically served from cache
within a single user session.

### 3.4 BigQuery Data Warehouse

The defining infrastructure addition in V3P2. See its dedicated page —
**[3.4 BigQuery Data Warehouse](./03.4-bigquery-data-warehouse.md)** —
for the full schema, table-by-table, with partitioning and clustering.

---

## 4–10. (Unchanged from V3P1 wiki)

Sections 4–10 — authentication, frontend architecture, provider hub,
copilot, search, charts/screening, saved research — are unchanged in
content from V3P1 and continue to apply. The only V3P2 touch-point in
those pages is that **Saved Research** now hosts the V3P2 briefings
panel (see §1.3 above).

---

## 11. Model Observatory & Data Warehouse

V3P2 promoted this into a first-class top-level area with two
subpages:

- [11.1 Model Observatory](./11.1-model-observatory.md) — model
  registry, statuses, validation criteria.
- [11.2 Warehouse Explorer](./11.2-warehouse-explorer.md) — dataset
  registry across the BigQuery zones.

---

## 12. Macro intelligence terminal

The macro terminal continues to surface the live regime board, the
calendar, and the institutional macro series. As of V3P2 it reads
**warehouse-backed** observations (`research.macro_observations`,
`features.macro_features`, `artifacts.macro_artifacts`) instead of
computing on the fly. The regimes returned by `/v1/macro/regimes` are
exactly what `app/intelligence/macro_regime.py` wrote on the last
`v3p2-macro-regime` Scheduler tick.

---

## 13. Infrastructure overview

V3P2-current infrastructure:

| Component | Tech | Notes |
|---|---|---|
| Web app | Vite + React | Firebase Hosting, project `deplyze-quant` |
| Gateway | Node 20 + Express | Cloud Run `deplyze-gateway`, `us-central1` |
| **Quant Engine** | **Python 3.11 + FastAPI** | **Cloud Run `deplyze-quant-engine`, `us-central1`** |
| Auth | Firebase Auth | Firebase project `deplyze-quant` |
| **Warehouse** | **BigQuery** | **Project `deplyze-quant`, datasets `raw_api/raw_public/raw_documents/cleaned/features/research/artifacts/model_outputs`** |
| User store | Firestore | Same Firebase project |
| Cache | Redis | Upstash or Memorystore |
| **Scheduler** | **Cloud Scheduler** | **10 V3P2 jobs in `us-central1`** |
| Artifact Registry | `us-central1-docker.pkg.dev/deplyze-quant/...` | Two repos: `deplyze-gateway`, `deplyze-quant-engine` |

#### V3P2 environment variables

In addition to the gateway's existing env, the quant engine requires:

```
GCP_PROJECT            = deplyze-quant
BQ_DATASET_RAW_API     = raw_api
BQ_DATASET_RAW_PUBLIC  = raw_public
BQ_DATASET_RAW_DOCS    = raw_documents
BQ_DATASET_CLEANED     = cleaned
BQ_DATASET_FEATURES    = features
BQ_DATASET_RESEARCH    = research
BQ_DATASET_ARTIFACTS   = artifacts
BQ_DATASET_MODEL_OUT   = model_outputs
EDGAR_USER_AGENT       = "Deplyze Quant <ops@deplyze.com>"     # required for SEC fair-use
FRED_API_KEY           = <fred-api-key>                         # required for macro ingestion
```

The gateway picks up `SEC_EDGAR_USER_AGENT` (legacy V2 naming) for its
own EDGAR routes; the engine uses `EDGAR_USER_AGENT` and `FRED_API_KEY`
for the ingestion pipelines.

#### Cloud Scheduler jobs (V3P2)

Ten jobs, all in `us-central1`, all calling the quant engine over
authenticated HTTP via the `scheduler-invoker` service account:

| Job | Schedule (ET) | Target |
|---|---|---|
| `v3p2-ingest-calendar` | 04:00 daily | `/v1/pipelines/ingest/calendar` |
| `v3p2-ingest-edgar` | 06:30 daily | `/v1/pipelines/ingest/edgar` |
| `v3p2-ingest-fred-daily` | 09:00 daily | `/v1/pipelines/ingest/fred` |
| `v3p2-macro-regime` | 09:45 daily | `/v1/pipelines/intelligence/macro-regime` |
| `v3p2-narratives` | 10:00 daily | `/v1/pipelines/intelligence/narratives` |
| `v3p2-briefings` | 10:30 daily | `/v1/pipelines/briefings/generate` |
| `v3p2-ingest-rss` | every 3h | `/v1/pipelines/ingest/rss` |
| `v3p2-refine-docs` | every 6h | `/v1/pipelines/refine/documents` |
| `v3p2-refine-entities` | every 6h+30m | `/v1/pipelines/refine/entities` |
| `v3p2-ingest-cot-weekly` | Fri 18:00 | `/v1/pipelines/ingest/cot` |

Provisioned by `services/quant-engine/deploy/v3p2/schedulers.sh`
(idempotent — safe to re-run). Verify with:

```bash
gcloud scheduler jobs list --location us-central1 \
  --filter='name:v3p2-*' --format='table(name,schedule,state)'
```

#### Deployment

```bash
# Gateway
bash cloud-run/gateway/deploy.sh
# Quant engine
bash services/quant-engine/deploy.sh
# V3P2 schedulers
bash services/quant-engine/deploy/v3p2/schedulers.sh
# BigQuery tables (idempotent)
cd services/quant-engine && python provision_bq.py
```

The full deployment runbook is in `docs/v3p2-deploy.md`; the
operational runbook (daily order of operations, common failure modes,
rollback) is in `services/quant-engine/deploy/v3p2/runbook.md`.

---

## 14. Operations & runbooks

See `services/quant-engine/deploy/v3p2/runbook.md` for the
operational reference. Quick-hit pointers below; the rest is on
[15 — V3P2 Intelligence Pipelines](./15-v3p2-intelligence-pipelines.md).

**Backfill a single connector:**

```bash
SERVICE_URL=$(gcloud run services describe deplyze-quant-engine \
  --region us-central1 --format 'value(status.url)')
TOKEN=$(gcloud auth print-identity-token)

curl -X POST "$SERVICE_URL/v1/pipelines/ingest/edgar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbols_or_ciks":["AAPL","MSFT","NVDA"],"days_back":365}'
```

**Force-regenerate today's briefings:**

```bash
curl -X POST "$SERVICE_URL/v1/pipelines/briefings/generate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"briefing_types":["daily_market_intelligence","weekly_regime_brief","anomaly_summary"]}'
```

**Rollback policy:** all V3P2 pipelines are additive — no destructive
writes. Roll back by pausing Scheduler jobs:

```bash
gcloud scheduler jobs pause v3p2-<job> --location us-central1
```

---

## 15. V3P2 Intelligence Pipelines

Dedicated page — **[15 V3P2 Intelligence Pipelines](./15-v3p2-intelligence-pipelines.md)** —
covering each wave (B through K + N): EDGAR ingest, FRED ingest, COT
ingest, RSS / calendar ingest, document parsing, entity extraction,
macro regime detection, narrative intelligence, briefing generation,
and deployment manifests.

---

## Cross-references

- Source: `docs/v3p2-deploy.md` (deployment prompt)
- Source: `services/quant-engine/deploy/v3p2/runbook.md` (operational runbook)
- Source: `services/quant-engine/migrations/v3p2/001_wave_a_schemas.sql` (BigQuery schema)
- Source: `services/quant-engine/app/main.py` (FastAPI entrypoint)
- Source: `cloud-run/gateway/src/routes/v3p2.ts` (gateway V3P2 routes)
