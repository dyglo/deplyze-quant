# GitHub Secrets — Setup Guide

Add these at **Settings → Secrets and variables → Actions → New repository secret**.

---

## GCP / Firebase Infrastructure

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `GCP_SA_KEY` | Service account JSON key for Cloud Run deploys | GCP Console → IAM → Service Accounts → Create key (JSON). Required roles: `Cloud Run Admin`, `Artifact Registry Writer`, `Service Account User` |
| `FIREBASE_TOKEN` | Firebase CI token (hosting + Firestore deploys) | Run `firebase login:ci` locally, copy the printed token |

---

## Firebase Client Config (Vite build)

Find all values at **Firebase Console → Project Settings → Your apps**.

| Secret | Value |
|--------|-------|
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `deplyze-quant.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `deplyze-quant` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `deplyze-quant.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID from console |
| `VITE_FIREBASE_APP_ID` | App ID from console |
| `VITE_FIREBASE_MEASUREMENT_ID` | Measurement ID from console |
| `VITE_GATEWAY_URL` | Deployed Cloud Run URL e.g. `https://deplyze-gateway-xxx.run.app` |

---

## API Keys (injected into Cloud Run as env vars)

| Secret | Provider |
|--------|----------|
| `GEMINI_API_KEY` | Google AI Studio |
| `FINNHUB_API_KEY` | finnhub.io |
| `ALPHA_VANTAGE_API_KEY` | alphavantage.co |
| `TWELVE_DATA_API_KEY` | twelvedata.com |
| `TAVILY_API_KEY` | tavily.com |
| `SERPER_API_KEY` | serper.dev |
| `POLYGON_API_KEY` | polygon.io |
| `FMP_API_KEY` | financialmodelingprep.com |
| `EODHD_API_KEY` | eodhd.com |
| `SEC_EDGAR_USER_AGENT` | `YourApp contact@youremail.com` (SEC policy requires a contact string) |

---

## One-time GCP setup (run once before first deploy)

```bash
# Enable required APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  --project=deplyze-quant

# Create Artifact Registry repository for Docker images
gcloud artifacts repositories create services \
  --repository-format=docker \
  --location=us-central1 \
  --project=deplyze-quant
```

---

## Workflow triggers

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | Every push + every PR → `main` | TypeScript checks + Vite build + Docker build validation |
| `deploy.yml` | Push to `main` | Build & push Docker image → Cloud Run deploy → Firestore rules → Firebase Hosting |
| `deploy.yml` | Manual (`workflow_dispatch`) | Can skip gateway or hosting independently |
