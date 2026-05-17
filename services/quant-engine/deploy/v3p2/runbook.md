# V3 Phase 2 — Operational Runbook

Reference doc for operators running the V3P2 intelligence-refinery pipelines.

## Architecture (post Wave N)

```
Cloud Scheduler ──HTTP──> deplyze-quant-engine (Cloud Run)
                                │
                                ├─> raw_public.public_filings_raw      (Wave B)
                                ├─> raw_public.public_macro_raw        (Wave C)
                                ├─> raw_public.public_reports_raw      (Wave D / COT)
                                ├─> raw_public.public_rss_raw          (Wave D / RSS)
                                ├─> raw_public.public_calendar_raw     (Wave D / cal)
                                ├─> raw_documents.parsed_documents_raw (Wave E)
                                ├─> features.ontology_features         (Wave F)
                                ├─> features.macro_features            (Wave G)
                                ├─> research.macro_observations        (Wave G)
                                ├─> artifacts.macro_artifacts          (Wave G)
                                ├─> features.narrative_features        (Wave H)
                                ├─> research.narrative_memory          (Wave H)
                                ├─> artifacts.narrative_artifacts      (Wave H)
                                ├─> cleaned.narrative_cleaned          (Wave H)
                                └─> research.generated_briefings       (Wave K)

deplyze-gateway (Cloud Run, separate)
   └─> reads ↑ tables via /v1/{macro,filings,narratives,research,relations,briefings}
```

## Daily order of operations

| Time (ET) | Job | Pipeline | Reads | Writes |
|---|---|---|---|---|
| 04:00 | `v3p2-ingest-calendar` | calendar ingestor | FRED `/release/dates` | `public_calendar_raw` |
| 06:30 | `v3p2-ingest-edgar` | EDGAR connector | SEC submissions | `public_filings_raw`, `document_sources_raw` |
| 09:00 | `v3p2-ingest-fred-daily` | FRED ingestor | FRED API | `public_macro_raw`, `macro_cleaned` |
| 09:45 | `v3p2-macro-regime` | macro regime engine | `macro_cleaned` | `macro_features`, `macro_observations`, `macro_artifacts` |
| 10:00 | `v3p2-narratives` | narrative engine | `ontology_features` | `narrative_features`, `narrative_memory`, `narrative_artifacts`, `narrative_cleaned` |
| 10:30 | `v3p2-briefings` | briefing generator | macro/narrative/anomaly artifacts | `generated_briefings` |
| every 3h | `v3p2-ingest-rss` | RSS connector | configured feeds | `public_rss_raw` |
| every 6h | `v3p2-refine-docs` | document parser | `document_sources_raw` | `parsed_documents_raw` |
| every 6h+30m | `v3p2-refine-entities` | entity extractor | `parsed_documents_raw`, `cleaned.instruments` | `ontology_features` |
| Fri 18:00 | `v3p2-ingest-cot-weekly` | COT connector | CFTC Socrata | `public_reports_raw` |

## Routine operations

### Backfill a single connector
```bash
SERVICE_URL=$(gcloud run services describe deplyze-quant-engine --region us-central1 --format 'value(status.url)')
TOKEN=$(gcloud auth print-identity-token)

curl -X POST "$SERVICE_URL/v1/pipelines/ingest/edgar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbols_or_ciks":["AAPL","MSFT","NVDA"],"days_back":365}'
```

Get the `run_id` from the response, then poll:
```bash
curl "$SERVICE_URL/v1/pipelines/status/<run_id>" -H "Authorization: Bearer $TOKEN"
```

### Force-regenerate today's briefings
```bash
curl -X POST "$SERVICE_URL/v1/pipelines/briefings/generate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"briefing_types":["daily_market_intelligence","weekly_regime_brief","anomaly_summary"]}'
```

### Diagnose stuck pipeline
1. `gcloud scheduler jobs describe <name> --location us-central1` — last run + last status.
2. `gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 50`
3. If the engine OOM'd, scale memory in `services/quant-engine/deploy.sh` (`--memory 2Gi`) and redeploy.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `EDGAR_USER_AGENT is not configured` | env var missing | Set `EDGAR_USER_AGENT` in Cloud Run; redeploy. |
| `FRED_API_KEY required` | env var missing | Set `FRED_API_KEY`; redeploy. |
| EDGAR returns 429 | SEC rate-limit | The client backs off (5s + tenacity retry). If persistent, check User-Agent specifies a real contact. |
| FRED returns 429 | over budget | Reduce series_ids or `days_back`. We self-throttle to 60/min vs 120/min ceiling. |
| `document_parse` reports 0 written | extraction failure mass | Run with `{"limit":10}` and check `extraction_method` values in `parsed_documents_raw`. |
| `entity_features` reports 0 written | `extraction_quality < 0.3` on all docs | Lower the quality floor in `entity_features.py` (`_select_unprocessed`) or improve parser quality. |
| Macro regime engine returns "no macro data" | macro_cleaned empty | Run `/v1/pipelines/ingest/fred` first. |
| Narrative engine returns "0 themes tracked" | no theme entities matched | Run document ingestion + parsing + entities first; themes only emerge from text. |

## Rollback

All pipelines are additive — no destructive writes. To roll back:
1. Pause Scheduler jobs: `gcloud scheduler jobs pause <name> --location us-central1`.
2. (Optional) Drop V3P2 tables: see `migrations/v3p2/README.md` rollback section. **Only do this with explicit approval**; downstream gateway routes will 500 until tables are recreated.

## Cost controls

See `cost-controls.md` for the verification checklist.
