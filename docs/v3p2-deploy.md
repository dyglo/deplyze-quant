# Deplyze Quant V3 Phase 2 — Deploy Agent Execution Prompt

> **Self-contained instructions for a deploy agent (human or LLM) to roll
> V3 Phase 2 to production.** Assumes Phase 1 is already live (Cloud Run
> services `deplyze-gateway` + `deplyze-quant-engine`, BigQuery datasets
> `raw_api / raw_public / raw_documents / cleaned / features / research /
> artifacts / model_outputs`, Firebase Auth, scheduler-invoker service
> account).
>
> Source repository: `dyglo/deplyze-quant`, main branch.
>
> Reading order: top to bottom. Each step has a verification command.

## 0. Pre-flight

```bash
# Identity + project
gcloud auth login
gcloud config set project deplyze-quant

# Required env (export before you run anything; see services/quant-engine/deploy.sh):
export POLYGON_API_KEY=…
export FMP_API_KEY=…
export EODHD_API_KEY=…
export FINNHUB_API_KEY=…
export TWELVE_DATA_API_KEY=…
export ALPHA_VANTAGE_API_KEY=…
export GEMINI_API_KEY=…
export TAVILY_API_KEY=…
export SERPER_API_KEY=…

# V3 Phase 2 new env vars (REQUIRED for the new connectors):
export EDGAR_USER_AGENT="Deplyze Quant ops@deplyze.io"  # MUST identify operator with real contact email
export FRED_API_KEY=…                                     # https://fred.stlouisfed.org/docs/api/api_key.html
```

Confirm:
```bash
gcloud projects describe deplyze-quant --format='value(name)'
gcloud config get-value project
```

## 1. Merge order (PRs #51 → #67)

Stacked PRs land in order. Each waits for the previous to be on `main`.

| Order | PR | Title | Touches |
|---|---|---|---|
| 1 | #51 | Wave A — BigQuery refinery schemas | Python `bigquery/schemas.py` + DDL |
| 2 | #52 | Wave B — SEC EDGAR connector | quant-engine |
| 3 | #54 | Wave C — FRED + Treasury yield | quant-engine |
| 4 | #57 | Wave D — CFTC COT + RSS + macro calendar | quant-engine |
| 5 | #59 | Wave E — Document parsing pipeline | quant-engine + reqs |
| 6 | #60 | Wave F — Entity extraction | quant-engine |
| 7 | #61 | Wave G — Macro Regime Intelligence | quant-engine |
| 8 | #62 | Wave H — Narrative intelligence | quant-engine |
| 9 | #63 | Wave I — Relations Map enrichment | frontend `src/lib/quant/relations/` |
| 10 | #64 | Wave J — Contextual analog engine | frontend `src/lib/quant/` |
| 11 | #65 | Wave K — Autonomous briefings | quant-engine |
| 12 | #66 | Wave L — Gateway V3P2 routes | `cloud-run/gateway/` |
| 13 | #67 | Wave M — Frontend enrichment panels | frontend |

Wave N (this doc + scheduler manifests) lands directly with the final merge.

## 2. Provision BigQuery tables

The V3P1 provisioner has been extended with the 12 V3P2 tables. After merging
Wave A:

```bash
# Option A — Python provisioner (preferred):
cd services/quant-engine
python provision_bq.py

# Option B — raw SQL (fallback for environments without Python deps):
PROJECT_ID=deplyze-quant
sed "s/{PROJECT_ID}/${PROJECT_ID}/g" migrations/v3p2/001_wave_a_schemas.sql \
  | bq query --project_id="${PROJECT_ID}" --use_legacy_sql=false --nouse_cache
```

**Verify:**
```bash
for t in filings_cleaned narrative_cleaned; do
  bq show --format=prettyjson "deplyze-quant:cleaned.$t" >/dev/null && echo "✓ cleaned.$t"
done
for t in macro_features narrative_features filing_features ontology_features; do
  bq show --format=prettyjson "deplyze-quant:features.$t" >/dev/null && echo "✓ features.$t"
done
for t in macro_observations narrative_memory filing_observations; do
  bq show --format=prettyjson "deplyze-quant:research.$t" >/dev/null && echo "✓ research.$t"
done
for t in macro_artifacts narrative_artifacts filing_artifacts; do
  bq show --format=prettyjson "deplyze-quant:artifacts.$t" >/dev/null && echo "✓ artifacts.$t"
done
```

Expect 12 ✓ lines.

## 3. Deploy the quant engine

V3P2 ships several new Python deps (feedparser, beautifulsoup4, lxml, pypdf).
The deploy script already builds from `requirements.txt`.

```bash
bash services/quant-engine/deploy.sh
```

The script also injects the V3P2 env vars **if exported in your shell**. The
existing script may need a one-time edit to include the two new variables in
its `--set-env-vars` block:

```diff
- SERPER_API_KEY=${SERPER_API_KEY:-}"
+ SERPER_API_KEY=${SERPER_API_KEY:-},\
+ EDGAR_USER_AGENT=${EDGAR_USER_AGENT:-},\
+ FRED_API_KEY=${FRED_API_KEY:-}"
```

**Verify:**
```bash
SERVICE_URL=$(gcloud run services describe deplyze-quant-engine --region us-central1 --format 'value(status.url)')
TOKEN=$(gcloud auth print-identity-token)

curl -s "$SERVICE_URL/health" -H "Authorization: Bearer $TOKEN"
# → {"ok": true, ...}
```

## 4. Deploy the gateway

```bash
cd cloud-run/gateway
# Existing deploy path (Dockerfile already present). If your repo uses CI:
# the gateway-build CI job will produce the image automatically. To deploy
# manually:

gcloud builds submit --tag us-central1-docker.pkg.dev/deplyze-quant/deplyze-gateway/deplyze-gateway:v3p2 .
gcloud run deploy deplyze-gateway \
  --image us-central1-docker.pkg.dev/deplyze-quant/deplyze-gateway/deplyze-gateway:v3p2 \
  --region us-central1 \
  --platform managed \
  --no-allow-unauthenticated \
  --service-account "gateway@deplyze-quant.iam.gserviceaccount.com"
```

**Verify routes return 401 unauthenticated (auth working) and 200 with a
Firebase ID token:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" "$GATEWAY_URL/v1/macro/regimes"
# → 401  (expected, auth required)
```

## 5. Set up Cloud Scheduler triggers

```bash
bash services/quant-engine/deploy/v3p2/schedulers.sh
```

This creates ten jobs (see `runbook.md` for the table). The script is
idempotent — re-running won't recreate existing jobs but will report them
as "already exists".

**Verify:**
```bash
gcloud scheduler jobs list --location us-central1 --filter='name:v3p2-*' --format='table(name,schedule,state)'
```

Expect 10 jobs in `ENABLED` state.

## 6. First-run priming

Before the schedulers fire, prime the pipeline so the gateway has data to
serve. Run these in order (each is async — wait ~30s between):

```bash
SERVICE_URL=$(gcloud run services describe deplyze-quant-engine --region us-central1 --format 'value(status.url)')
TOKEN=$(gcloud auth print-identity-token)

# 1. Macro (5y backfill — FRED daily series)
curl -X POST "$SERVICE_URL/v1/pipelines/ingest/fred" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"days_back":1825}'

# 2. EDGAR (1y backfill for a starter universe)
curl -X POST "$SERVICE_URL/v1/pipelines/ingest/edgar" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"symbols_or_ciks":["AAPL","MSFT","NVDA","TSLA","META","AMZN","GOOGL","JPM","XOM","UNH"],"days_back":365}'

# 3. Calendar + RSS + COT
curl -X POST "$SERVICE_URL/v1/pipelines/ingest/calendar" -H "Authorization: Bearer $TOKEN" -d '{}'
curl -X POST "$SERVICE_URL/v1/pipelines/ingest/rss"      -H "Authorization: Bearer $TOKEN" -d '{}'
curl -X POST "$SERVICE_URL/v1/pipelines/ingest/cot"      -H "Authorization: Bearer $TOKEN" -d '{}'

# 4. Parse documents (wait until #2 finishes — check via /v1/pipelines/status/<run_id>)
curl -X POST "$SERVICE_URL/v1/pipelines/refine/documents" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"limit":500}'

# 5. Entity extraction (wait until #4 finishes)
curl -X POST "$SERVICE_URL/v1/pipelines/refine/entities" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"limit":500}'

# 6. Macro regime engine
curl -X POST "$SERVICE_URL/v1/pipelines/intelligence/macro-regime" -H "Authorization: Bearer $TOKEN" -d '{}'

# 7. Narrative intelligence engine
curl -X POST "$SERVICE_URL/v1/pipelines/intelligence/narratives" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"lookback_days":180}'

# 8. Generate first briefings
curl -X POST "$SERVICE_URL/v1/pipelines/briefings/generate" -H "Authorization: Bearer $TOKEN" -d '{}'
```

## 7. Acceptance verification

Run the checklist in `services/quant-engine/deploy/v3p2/cost-controls.md`
section "Acceptance criteria for a clean V3P2 deploy". Every box must be
ticked before considering the deploy complete.

Spot-check via gateway from a logged-in browser session:
- `/macro-regime-desk` shows the **Macro Regime Intelligence** panel with 4 cells populated.
- `/research-library` shows the **Latest Briefings** panel with 3 cards.

## 8. Rollback (worst-case)

V3P2 is additive at the data layer — *no destructive schema changes*. To
unwind safely:

```bash
# Pause schedulers (instant)
for j in $(gcloud scheduler jobs list --location us-central1 --filter='name:v3p2-*' --format='value(name)'); do
  gcloud scheduler jobs pause "$j" --location us-central1
done

# Roll quant-engine back to the prior revision
gcloud run services update-traffic deplyze-quant-engine \
  --region us-central1 \
  --to-revisions PRIOR_REVISION_ID=100

# Roll gateway back
gcloud run services update-traffic deplyze-gateway \
  --region us-central1 \
  --to-revisions PRIOR_REVISION_ID=100
```

Tables can remain in place — they're inert without writers.

## 9. Telemetry hooks (post-deploy)

Watch these for the first 48h:

- **Cloud Run logs:** `gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=deplyze-quant-engine AND severity>=WARNING' --freshness 24h --limit 50`
- **Scheduler success rate:** Cloud Console → Cloud Scheduler → look for `LAST_STATUS=SUCCESS` on every `v3p2-*` job.
- **BigQuery spend:** `bq ls -j --project_id=deplyze-quant --max_results=100 --format=prettyjson | jq '.[].statistics.totalBytesBilled | tonumber' | awk '{s+=$1} END {print s/1e9, "GB billed"}'`
- **Table growth:** `bq query "SELECT table_id, row_count, size_bytes/1e6 AS mb FROM \`deplyze-quant.research.__TABLES__\`"` — expect linear growth, not exponential.

## 10. Handoff notes

After V3P2 is live the operator should:
1. Add `EDGAR_USER_AGENT` and `FRED_API_KEY` to the secret-rotation calendar.
2. Add the 10 new scheduler jobs to oncall dashboards.
3. Review the cost-controls doc weekly for the first month.
4. File any new connector candidates as Wave-Phase-3 candidates rather than monkey-patching the existing connectors.
