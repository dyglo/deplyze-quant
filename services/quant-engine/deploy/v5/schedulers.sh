#!/usr/bin/env bash
# V5 Personalization scheduler manifests — Cloud Scheduler → Cloud Run
# (quant-engine).
#
# All times are America/New_York (ET). Weekdays only where applicable.
#
# Invoke: bash services/quant-engine/deploy/v5/schedulers.sh
# Prerequisites: gcloud authenticated, PROJECT and REGION set,
#                quant-engine deployed with V5 routes mounted.

set -euo pipefail

PROJECT="${FIREBASE_PROJECT_ID:-deplyze-quant}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SERVICE_URL="${QUANT_ENGINE_URL:-}"   # quant-engine Cloud Run URL
SA="${QUANT_ENGINE_SA:-}"            # service account with run.invoker

if [[ -z "$SERVICE_URL" || -z "$SA" ]]; then
  echo "ERROR: set QUANT_ENGINE_URL and QUANT_ENGINE_SA before running." >&2
  exit 1
fi

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
      --oidc-token-audience="$SERVICE_URL"
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
      --oidc-token-audience="$SERVICE_URL"
  fi
}

# ── V5 Personalization cadences ──────────────────────────────────────────────
# 1. Daily sessionization — collapses yesterday's raw_app.user_events into
#    cleaned.user_sessions and cleaned.user_value_events. Runs at 01:30 ET
#    (after the previous trading day has fully landed).
create_or_update \
  "v5-personalization-sessionize" \
  "30 1 * * *" \
  "/personalization/sessionize" \
  '{}'

# 2. Nightly profile build — produces features.user_profile_daily snapshots
#    for every user with activity in the lookback window. Runs at 02:00 ET.
create_or_update \
  "v5-personalization-profile-build" \
  "0 2 * * *" \
  "/personalization/profile/build" \
  '{}'

# 3. Pre-market personalized briefing materialization — invoked per-user
#    by the gateway when users first hit the morning terminal. The
#    scheduled run here is a placeholder that exercises the path daily;
#    per-user materialization will be added in PR4 once the gateway can
#    enumerate active users from Firestore.
#    Scheduler invokes a no-op /personalization/briefing/materialize with
#    a sentinel user, only to keep the path warm and surface failures
#    early via Cloud Run alerting.
# (Disabled by default — uncomment after seeding a sentinel user.)
# create_or_update \
#   "v5-personalization-briefing-warm" \
#   "15 8 * * 1-5" \
#   "/personalization/briefing/materialize" \
#   '{"user_id_hash":"sentinel"}'

echo "V5 schedulers ensured."
