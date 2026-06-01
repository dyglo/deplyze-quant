#!/usr/bin/env bash
# V4 Agent Scheduler manifests — Cloud Scheduler → Cloud Run (quant-engine)
# All times are America/New_York (ET). Weekdays only where applicable.
# Invoke: bash services/quant-engine/deploy/v4/schedulers.sh
# Prerequisites: gcloud authenticated, PROJECT and REGION set, quant-engine deployed.

set -euo pipefail

PROJECT="${FIREBASE_PROJECT_ID:-deplyze-quant}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SERVICE_URL="${QUANT_ENGINE_URL:-}"   # set to quant-engine Cloud Run URL
SA="${QUANT_ENGINE_SA:-}"            # service account with invoker permission

if [[ -z "$SERVICE_URL" || -z "$SA" ]]; then
  echo "ERROR: set QUANT_ENGINE_URL and QUANT_ENGINE_SA before running." >&2
  exit 1
fi

# Retry + deadline policy (Stage 2 reliability):
#   - Agent runs now execute SYNCHRONOUSLY inside the request and return 5xx on
#     failure, so Cloud Scheduler's retry policy actually retries failed runs.
#   - --attempt-deadline gives the synchronous run room to complete (must be
#     <= the Cloud Run request timeout; raise both together if a run needs more).
RETRY_FLAGS=(
  --max-retry-attempts=3
  --min-backoff=30s
  --max-backoff=300s
  --max-doublings=3
  --attempt-deadline=300s
)

create_or_update() {
  local name="$1" schedule="$2" path="$3" body="$4"
  echo "→ Ensuring scheduler: $name  [$schedule]"
  if gcloud scheduler jobs describe "$name" --project="$PROJECT" --location="$REGION" &>/dev/null; then
    gcloud scheduler jobs update http "$name" \
      --project="$PROJECT" \
      --location="$REGION" \
      --schedule="$schedule" \
      --time-zone="America/New_York" \
      --uri="${SERVICE_URL}${path}" \
      --http-method=POST \
      --message-body="$body" \
      --update-headers="Content-Type=application/json" \
      --oidc-service-account-email="$SA" \
      --oidc-token-audience="$SERVICE_URL" \
      "${RETRY_FLAGS[@]}"
  else
    gcloud scheduler jobs create http "$name" \
      --project="$PROJECT" \
      --location="$REGION" \
      --schedule="$schedule" \
      --time-zone="America/New_York" \
      --uri="${SERVICE_URL}${path}" \
      --http-method=POST \
      --message-body="$body" \
      --headers="Content-Type=application/json" \
      --oidc-service-account-email="$SA" \
      --oidc-token-audience="$SERVICE_URL" \
      "${RETRY_FLAGS[@]}"
  fi
}

# ── V4 Agent cadences ─────────────────────────────────────────────────────────
# Each job hits POST /agents/run/{agent_id} on the quant-engine service.
# The run executes synchronously and returns 200 on success / 5xx on failure;
# a 5xx triggers the retry policy above. Runs are recorded in artifacts.agent_runs
# (query GET /agents/runs for status).

# Earnings Agent — 06:30 ET weekdays (after EDGAR ingestor 06:00)
create_or_update "v4-agent-earnings"    "30 6 * * 1-5"  "/agents/run/earnings_agent"    '{"dry_run":false}'

# Macro Agent — 09:45 ET weekdays (after FRED refresh 09:00)
create_or_update "v4-agent-macro"       "45 9 * * 1-5"  "/agents/run/macro_agent"       '{"dry_run":false}'

# Liquidity Agent — 10:00 ET weekdays
create_or_update "v4-agent-liquidity"   "0 10 * * 1-5"  "/agents/run/liquidity_agent"   '{"dry_run":false}'

# Regime Agent — 10:15 ET weekdays (after macro + liquidity settle)
create_or_update "v4-agent-regime"      "15 10 * * 1-5" "/agents/run/regime_agent"      '{"dry_run":false}'

# Sentiment Agent — every 3 hours (after RSS ingestor)
create_or_update "v4-agent-sentiment"   "0 */3 * * *"   "/agents/run/sentiment_agent"   '{"dry_run":false}'

# Volatility Agent — 16:30 ET weekdays (after market close)
create_or_update "v4-agent-volatility"  "30 16 * * 1-5" "/agents/run/volatility_agent"  '{"dry_run":false}'

# Opportunity Agent — 16:45 ET weekdays (after vol agent)
create_or_update "v4-agent-opportunity" "45 16 * * 1-5" "/agents/run/opportunity_agent" '{"dry_run":false}'

# Cross-Asset Agent — 17:00 ET weekdays
create_or_update "v4-agent-cross-asset" "0 17 * * 1-5"  "/agents/run/cross_asset_agent" '{"dry_run":false}'

# Risk Agent — 17:30 ET weekdays (after all market-close agents)
create_or_update "v4-agent-risk"        "30 17 * * 1-5" "/agents/run/risk_agent"        '{"dry_run":false}'

echo ""
echo "✓ V4 agent schedulers configured."
echo "  Provision the BQ table first: POST ${SERVICE_URL}/warehouse/init"
echo "  Verify: gcloud scheduler jobs list --project=${PROJECT} --location=${REGION} | grep v4-agent"
