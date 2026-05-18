# GitHub Secrets — Setup Guide

Add these at **Settings → Secrets and variables → Actions → New repository secret**.

---

## GCP Service Account Key

| Secret | Description |
|--------|-------------|
| `GCP_SA_KEY` | Full JSON of a GCP service account key. Used for **all** GCP and Firebase operations — no `FIREBASE_TOKEN` needed. |

### Required IAM roles for the service account

Grant these at **GCP Console → IAM → Add principal**:

| Role | Why |
|------|-----|
| `roles/run.admin` | Deploy and manage Cloud Run services |
| `roles/iam.serviceAccountUser` | Act as service accounts during deploy |
| `roles/artifactregistry.writer` | Push Docker images to Artifact Registry |
| `roles/firebase.admin` | Deploy Firebase Hosting + Firestore rules |

> **How to create the key**: GCP Console → IAM → Service Accounts → select your SA → Keys → Add Key → JSON.  
> Copy the entire JSON and paste it as the value of `GCP_SA_KEY`.

---

## Firebase Client Config (Vite build)

Find all values at **Firebase Console → Project Settings → Your apps**.

| Secret | Value |
|--------|-------|
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `deplyze-quant.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `deplyze-quant` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `deplyze-quant.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | App ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Measurement ID |
| `VITE_GATEWAY_URL` | Cloud Run service URL — e.g. `https://deplyze-gateway-xxx.run.app` |

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

## Important notes

**`FIREBASE_TOKEN` is NOT required.** `firebase-tools` v13+ removed the `--token` flag.
All Firebase deployments (Hosting + Firestore) now authenticate via `GCP_SA_KEY` through
`GOOGLE_APPLICATION_CREDENTIALS`, set automatically by the `google-github-actions/auth` action.

**Artifact Registry** is created automatically on first deploy if it does not exist.
The workflow runs `gcloud artifacts repositories create` idempotently before every push.

---

## Workflow triggers

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | PR → `main` | Full CI: type-check, Vite build, Docker validation (path-filtered) |
| `ci.yml` | Push to `main` | Lightweight post-merge check: type-check + Vite build only (no Docker) |
| `deploy.yml` | Push to `main` | Deploy only changed services: gateway / Firestore / hosting / quant engine |
| `deploy.yml` | `workflow_dispatch` | Manual full deploy with `skip_gateway` / `skip_hosting` / `skip_firestore` / `skip_quant_engine` flags |

> Feature branch pushes (without an open PR) do not trigger CI — the PR event covers them.
> See [CICD.md](CICD.md) for the full architecture, rollback procedure, and cost practices.
