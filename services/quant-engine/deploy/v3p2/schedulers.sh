#!/usr/bin/env bash
# ─── V3 Phase 2 · Cloud Scheduler job manifests ──────────────────────────────
#
# Each Scheduler job hits a single POST endpoint on the existing
# `deplyze-quant-engine` Cloud Run service (no new services required).
# Architecturally we treat the engine as the *worker* and Scheduler as the
# trigger source — same model the V3 Phase 1 daily pipeline already uses.
#
# Prereqs:
#   • `deplyze-quant-engine` Cloud Run service deployed (see deploy.sh).
#   • Scheduler service-agent has the Cloud Run Invoker role:
#       gcloud projects add-iam-policy-binding "$PROJECT_ID" \
#         --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
#         --role="roles/cloudrun.invoker"
#   • A SA with Cloud Run Invoker on the engine; we reuse the existing
#     "scheduler-invoker@..." account if it exists.
#
# Idempotency: each `gcloud scheduler jobs create http` will FAIL with
# AlreadyExists if the job exists — that's intended. Use `update` to rotate
# schedules without recreating.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-deplyze-quant}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="deplyze-quant-engine"
SCHEDULER_SA="${SCHEDULER_SA:-scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com}"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)')

if [[ -z "$SERVICE_URL" ]]; then
  echo "ERROR: Could not resolve URL for $SERVICE_NAME — is it deployed?" >&2
  exit 1
fi

echo "Target service: $SERVICE_URL"
echo "Invoker SA:     $SCHEDULER_SA"
echo ""

# ── helper ───────────────────────────────────────────────────────────────────

create_job() {
  local name="$1"
  local schedule="$2"
  local path="$3"
  local body="${4:-{}}"

  echo "→ Creating job: $name  ($schedule)"
  gcloud scheduler jobs create http "$name" \
    --location "$REGION" \
    --project "$PROJECT_ID" \
    --schedule "$schedule" \
    --time-zone "America/New_York" \
    --uri "${SERVICE_URL}${path}" \
    --http-method POST \
    --headers "Content-Type=application/json" \
    --message-body "$body" \
    --oidc-service-account-email "$SCHEDULER_SA" \
    --oidc-token-audience "$SERVICE_URL" \
    --attempt-deadline 30m \
    --max-retry-attempts 2 \
    --min-backoff 30s \
    --max-backoff 1h \
    || echo "  (already exists or failed; use `update` to modify schedule)"
}

# ── V3P2 Scheduler jobs ──────────────────────────────────────────────────────
#
# Cadence rationale:
#   • EDGAR — daily 06:30 ET (after overnight filings settle on the SEC FTP).
#   • FRED  — daily 09:00 ET (catches the morning macro release window).
#   • COT   — Fridays 18:00 ET (CFTC publishes Friday afternoon).
#   • RSS   — every 3h on the hour.
#   • Calendar — daily 04:00 ET.
#   • Document parsing — every 6h, off-cycle from ingestion.
#   • Entity features — every 6h, 30 min after document parsing.
#   • Macro regime — daily 09:45 ET (after FRED ingest).
#   • Narrative intelligence — daily 10:00 ET.
#   • Briefings — daily 10:30 ET (after macro/narrative engines).
#
# Total daily query volume estimate: ~150 BQ queries/day worst-case → far
# below the per-day budget cap configured in V3P1.

create_job v3p2-ingest-edgar      "30 6 * * *"   "/v1/pipelines/ingest/edgar"        '{"symbols_or_ciks":["AAPL","MSFT","NVDA","TSLA","META","AMZN","GOOGL"],"days_back":3}'
create_job v3p2-ingest-fred-daily "0 9 * * *"    "/v1/pipelines/ingest/fred"         '{"days_back":7}'
create_job v3p2-ingest-cot-weekly "0 18 * * 5"   "/v1/pipelines/ingest/cot"          '{}'
create_job v3p2-ingest-rss        "0 */3 * * *"  "/v1/pipelines/ingest/rss"          '{}'
create_job v3p2-ingest-calendar   "0 4 * * *"    "/v1/pipelines/ingest/calendar"     '{"days_ahead":120}'
create_job v3p2-refine-docs       "0 */6 * * *"  "/v1/pipelines/refine/documents"    '{"limit":200}'
create_job v3p2-refine-entities   "30 */6 * * *" "/v1/pipelines/refine/entities"     '{"limit":200}'
create_job v3p2-macro-regime      "45 9 * * *"   "/v1/pipelines/intelligence/macro-regime" '{}'
create_job v3p2-narratives        "0 10 * * *"   "/v1/pipelines/intelligence/narratives"   '{"lookback_days":180}'
create_job v3p2-briefings         "30 10 * * *"  "/v1/pipelines/briefings/generate"  '{}'

echo ""
echo "=== Scheduler setup complete ==="
echo "List jobs: gcloud scheduler jobs list --location $REGION --project $PROJECT_ID"
