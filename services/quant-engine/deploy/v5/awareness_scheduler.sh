#!/usr/bin/env bash
# Portfolio Awareness server-side recompute scheduler — Cloud Scheduler → quant-engine.
#
# Runs daily at 04:00 UTC. Snapshots every portfolio that hasn't been snapshotted
# in the last 18 hours, so every portfolio gets at least one durable daily record
# even when no user opens the page.
#
# Invoke:
#   bash services/quant-engine/deploy/v5/awareness_scheduler.sh
#
# Prerequisites:
#   gcloud authenticated, PROJECT and REGION set, quant-engine deployed with
#   /portfolio-awareness/recompute route mounted.
#
# Required env vars:
#   QUANT_ENGINE_URL   — Cloud Run URL of the quant-engine service
#   QUANT_ENGINE_SA    — service account email with roles/run.invoker

set -euo pipefail

PROJECT="${FIREBASE_PROJECT_ID:-deplyze-quant}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SERVICE_URL="${QUANT_ENGINE_URL:-}"
SA="${QUANT_ENGINE_SA:-}"

if [[ -z "$SERVICE_URL" || -z "$SA" ]]; then
  echo "ERROR: set QUANT_ENGINE_URL and QUANT_ENGINE_SA before running." >&2
  exit 1
fi

JOB_NAME="v5-awareness-recompute"
SCHEDULE="0 4 * * *"   # daily at 04:00 UTC
ENDPOINT="/portfolio-awareness/recompute"
BODY='{"max_age_hours":18,"limit":100}'

echo "→ Ensuring scheduler: $JOB_NAME  [$SCHEDULE UTC]"

if gcloud scheduler jobs describe "$JOB_NAME" \
     --project="$PROJECT" \
     --location="$REGION" &>/dev/null; then
  gcloud scheduler jobs update http "$JOB_NAME" \
    --project="$PROJECT" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="UTC" \
    --uri="${SERVICE_URL}${ENDPOINT}" \
    --http-method=POST \
    --message-body="$BODY" \
    --update-headers="Content-Type=application/json" \
    --oidc-service-account-email="$SA" \
    --oidc-token-audience="$SERVICE_URL"
  echo "  updated."
else
  gcloud scheduler jobs create http "$JOB_NAME" \
    --project="$PROJECT" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="UTC" \
    --uri="${SERVICE_URL}${ENDPOINT}" \
    --http-method=POST \
    --message-body="$BODY" \
    --headers="Content-Type=application/json" \
    --oidc-service-account-email="$SA" \
    --oidc-token-audience="$SERVICE_URL"
  echo "  created."
fi

echo "Awareness recompute scheduler ensured: $JOB_NAME"
