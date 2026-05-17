# Deplyze Quant — Wiki

> Authoritative documentation for the Deplyze Quant platform.
> Mirror copy of the GitHub Wiki, version-controlled in-repo so it
> regenerates deterministically with each release.

This wiki documents the platform as of **V3 Phase 2** (Waves A–N): a
multi-layer BigQuery data refinery, a dedicated Quant Engine FastAPI
service on Cloud Run, ten scheduled intelligence pipelines, and the
deterministic briefings + observation system on top.

---

## Table of contents

1. **[Platform Overview](./01-platform-overview.md)**
   - 1.1 Mission & product surface
   - 1.2 System architecture (post V3P2)
   - 1.3 Major modules
   - **1.4 [V3 Phase 2 Architecture](./01.4-v3-phase2-architecture.md)**
2. **Services**
   - 2.1 Web app (Vite + React)
   - 2.2 Gateway (Node / Express on Cloud Run)
   - **2.3 [Quant Engine Service](./02.3-quant-engine-service.md)**
3. **Data**
   - 3.1 Provider mesh
   - 3.2 Firestore (user state)
   - 3.3 Redis cache
   - **3.4 [BigQuery Data Warehouse](./03.4-bigquery-data-warehouse.md)**
4. Authentication & request flow
5. Frontend architecture
6. Provider hub & API mesh
7. AI / Copilot subsystem
8. Search & news subsystem
9. Charts, screening, and analytics
10. Saved research & content management
11. **[Model Observatory & Data Warehouse](./11-model-observatory-and-data-warehouse.md)**
    - 11.1 [Model Observatory](./11.1-model-observatory.md)
    - 11.2 [Warehouse Explorer](./11.2-warehouse-explorer.md)
12. Macro intelligence terminal
13. Infrastructure overview
14. Operations & runbooks
15. **[V3P2 Intelligence Pipelines](./15-v3p2-intelligence-pipelines.md)**

---

## What changed in V3 Phase 2

The platform now writes and reads from a real BigQuery refinery instead
of computing intelligence in-process on every request. The shape of the
system is:

```
Cloud Scheduler ─▶ deplyze-quant-engine (FastAPI / Cloud Run)
                       │
                       ├── ingest:   EDGAR · FRED · CFTC · RSS · Calendar
                       ├── refine:   document parser · entity extractor
                       └── intelligence: macro regimes · narratives · briefings
                       │
                       ▼
                BigQuery refinery
                       │
                       ▼
deplyze-gateway (Cloud Run, Express)
        │   /v1/macro/regimes
        │   /v1/filings/*
        │   /v1/narratives/*
        │   /v1/research/macro-observations
        │   /v1/relations/context
        │   /v1/briefings/latest
        ▼
Web app — Warehouse Explorer · Model Observatory · Research Library · Macro Terminal
```

See [1.4 — V3 Phase 2 Architecture](./01.4-v3-phase2-architecture.md)
for the full picture, [2.3 — Quant Engine Service](./02.3-quant-engine-service.md)
for the new service, [3.4 — BigQuery Data Warehouse](./03.4-bigquery-data-warehouse.md)
for the schema, and [15 — V3P2 Intelligence Pipelines](./15-v3p2-intelligence-pipelines.md)
for the wave-by-wave pipeline reference.
