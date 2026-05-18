#!/usr/bin/env bash
# ─── Deploy deplyze-quant-engine to Cloud Run ────────────────────────────────
# Run from repo root: bash services/quant-engine/deploy.sh
#
# Prerequisites:
#   - gcloud auth login (or GCP_SA_KEY env var for CI)
#   - docker configured for Artifact Registry:
#     gcloud auth configure-docker us-central1-docker.pkg.dev
#
# Required env vars (set before running or in CI secrets):
#   POLYGON_API_KEY, FMP_API_KEY, EODHD_API_KEY, FINNHUB_API_KEY,
#   TWELVE_DATA_API_KEY, ALPHA_VANTAGE_API_KEY, GEMINI_API_KEY,
#   TAVILY_API_KEY, SERPER_API_KEY

set -euo pipefail

PROJECT_ID="deplyze-quant"
REGION="us-central1"
SERVICE_NAME="deplyze-quant-engine"
AR_REPO="deplyze-quant-engine"
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}"
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")

echo "=== Deplyze Quant Engine — Deploy ==="
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo "Image:    ${IMAGE_TAG}:${SHA}"
echo ""

# 1. Build
echo "→ Building Docker image..."
docker build \
  --platform linux/amd64 \
  -t "${IMAGE_TAG}:${SHA}" \
  -t "${IMAGE_TAG}:latest" \
  ./services/quant-engine

# 2. Push
echo "→ Pushing to Artifact Registry..."
docker push "${IMAGE_TAG}:${SHA}"
docker push "${IMAGE_TAG}:latest"

# 3. Deploy
echo "→ Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "${IMAGE_TAG}:${SHA}" \
  --region "$REGION" \
  --platform managed \
  --no-allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --no-cpu-throttling \
  --timeout 300 \
  --service-account "quant-engine@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-env-vars "\
GCP_PROJECT_ID=${PROJECT_ID},\
BIGQUERY_LOCATION=US,\
QUANT_ENGINE_ENV=production,\
POLYGON_API_KEY=${POLYGON_API_KEY:-},\
FMP_API_KEY=${FMP_API_KEY:-},\
EODHD_API_KEY=${EODHD_API_KEY:-},\
FINNHUB_API_KEY=${FINNHUB_API_KEY:-},\
TWELVE_DATA_API_KEY=${TWELVE_DATA_API_KEY:-},\
ALPHA_VANTAGE_API_KEY=${ALPHA_VANTAGE_API_KEY:-},\
GEMINI_API_KEY=${GEMINI_API_KEY:-},\
TAVILY_API_KEY=${TAVILY_API_KEY:-},\
SERPER_API_KEY=${SERPER_API_KEY:-},\
EDGAR_USER_AGENT=${EDGAR_USER_AGENT:-},\
FRED_API_KEY=${FRED_API_KEY:-}"

# 4. Health check
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --format 'value(status.url)')

echo ""
echo "→ Service URL: $SERVICE_URL"
echo "→ Checking /health ..."

for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
    "$SERVICE_URL/health" 2>/dev/null || echo "000")
  echo "  Attempt $i/12: HTTP $STATUS"
  if [ "$STATUS" = "200" ]; then
    echo "✓ Service healthy"
    break
  fi
  sleep 5
done

echo ""
echo "=== Deploy complete ==="
echo "  Health:  $SERVICE_URL/health"
echo "  Ready:   $SERVICE_URL/ready"
echo "  BQ:      $SERVICE_URL/bigquery/status"
echo ""
echo "To provision BigQuery tables:"
echo "  curl -X POST $SERVICE_URL/warehouse/provision \\"
echo "    -H 'Authorization: Bearer \$(gcloud auth print-identity-token)'"
