# V4 Agentic Intelligence Layer — Deployment Handoff

**Branch:** `feat/intelligence-layer-wave-i-hardening`  
**Date:** 2026-05-19  
**For:** Deployment Agent

---

## What was built

V4 adds a background agentic intelligence layer to the Deplyze Quant platform.
Nine background agents run on Cloud Scheduler, write structured outputs to a new
BigQuery table (`artifacts.agent_outputs`), and surface through new gateway routes
(`/v1/agents/*`) and frontend components. No chatbot UI. Pure intelligence infrastructure.

---

## Deployment sequence

### Step 1 — BigQuery: provision `artifacts.agent_outputs`

The new table is registered in the warehouse provisioner. Provision it by calling:

```
POST {QUANT_ENGINE_URL}/warehouse/init
Authorization: Bearer {INTERNAL_SA_TOKEN}
```

Expected response includes `artifact.agent_outputs` in the created/existing tables list.

Verify:
```sql
SELECT table_name FROM `deplyze-quant.artifacts.INFORMATION_SCHEMA.TABLES`
WHERE table_name = 'agent_outputs';
```

Schema: DATE-partitioned on `observation_date`, clustered on `(agent_id, domain)`.  
19 fields including `artifact_id`, `agent_id`, `domain`, `artifact_type`, `severity`,
`confidence`, `symbols[]`, `portfolio_id`, `evidence` (JSON), `recommended_placements[]`.

---

### Step 2 — Redeploy `deplyze-quant-engine` (Cloud Run)

The quant-engine service has a new FastAPI router at `/agents/*` and a new `app/agents/`
package. Redeploy with the same image build process used for previous waves:

```bash
cd services/quant-engine
docker build -t us-central1-docker.pkg.dev/deplyze-quant/deplyze-quant-engine/app:v4 .
docker push us-central1-docker.pkg.dev/deplyze-quant/deplyze-quant-engine/app:v4
gcloud run deploy deplyze-quant-engine \
  --image us-central1-docker.pkg.dev/deplyze-quant/deplyze-quant-engine/app:v4 \
  --region us-central1 \
  --project deplyze-quant
```

No new environment variables required beyond existing V3P2 vars.
The agents read from existing tables — no new connectors.

Verify new routes:
```
GET {QUANT_ENGINE_URL}/agents/registry   → 200, returns 10 agent definitions
GET {QUANT_ENGINE_URL}/agents/status     → 200, returns [] (no runs yet)
```

---

### Step 3 — Redeploy `deplyze-gateway` (Cloud Run)

The gateway has a new agents router mounted at `/v1/agents/*`.  
Redeploy with the same process as previous gateway deployments.

When redeploying the gateway, keep VPC egress constrained to private ranges:

```bash
gcloud run deploy deplyze-gateway \
  --region us-central1 \
  --project deplyze-quant \
  --vpc-connector deplyze-vpc-connector \
  --vpc-egress private-ranges-only
```

Redis stays reachable through the VPC connector, while public market/search
providers continue to use normal Cloud Run internet egress.

New env var required on gateway:
```
BQ_DATASET_ARTIFACTS=artifacts    # already set if V3P2 is deployed; confirm
```

Verify after deploy:
```
GET {GATEWAY_URL}/v1/agents/registry       → 200
GET {GATEWAY_URL}/v1/agents/outputs        → 200, outputs: []
GET {GATEWAY_URL}/v1/agents/regime         → 200, regime: null
GET {GATEWAY_URL}/v1/agents/risk           → 200, risk: null
```
(null outputs are expected before agent runs; not an error)

---

### Step 4 — Create Cloud Scheduler jobs

Run the V4 scheduler script with the quant-engine service URL and invoker SA:

```bash
export FIREBASE_PROJECT_ID=deplyze-quant
export CLOUD_RUN_REGION=us-central1
export QUANT_ENGINE_URL=https://{QUANT_ENGINE_CLOUD_RUN_URL}
export QUANT_ENGINE_SA=quant-engine-invoker@deplyze-quant.iam.gserviceaccount.com

bash services/quant-engine/deploy/v4/schedulers.sh
```

This creates 9 Cloud Scheduler jobs:
| Job | Cadence |
|---|---|
| `v4-agent-earnings` | 06:30 ET weekdays |
| `v4-agent-macro` | 09:45 ET weekdays |
| `v4-agent-liquidity` | 10:00 ET weekdays |
| `v4-agent-regime` | 10:15 ET weekdays |
| `v4-agent-sentiment` | every 3 hours |
| `v4-agent-volatility` | 16:30 ET weekdays |
| `v4-agent-opportunity` | 16:45 ET weekdays |
| `v4-agent-cross-asset` | 17:00 ET weekdays |
| `v4-agent-risk` | 17:30 ET weekdays |

Verify:
```bash
gcloud scheduler jobs list --project=deplyze-quant --location=us-central1 | grep v4-agent
```

---

### Step 5 — Smoke test: trigger a manual agent run

Trigger the macro agent manually to verify the full pipeline:

```bash
curl -X POST {QUANT_ENGINE_URL}/agents/run/macro_agent \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false}'
```

Expected: `{"run_id": "...", "status": "accepted", "agent_id": "macro_agent"}`

After ~30s, verify BQ row exists:
```sql
SELECT agent_id, domain, artifact_type, title, severity, confidence, generated_at
FROM `deplyze-quant.artifacts.agent_outputs`
WHERE DATE(observation_date) = CURRENT_DATE()
  AND agent_id = 'macro_agent'
ORDER BY generated_at DESC
LIMIT 5;
```

Then verify gateway:
```
GET {GATEWAY_URL}/v1/agents/outputs?domain=macro&days=1   → outputs should contain the macro observation
GET {GATEWAY_URL}/v1/agents/regime                        → regime from regime_agent (run after macro)
```

---

### Step 6 — Deploy frontend

The frontend changes are in the same branch. Deploy the React app to Firebase Hosting
using the standard `firebase deploy --only hosting` process.

New frontend surfaces:
- `IntelligenceTerminal` — "Live Intelligence" tab is now the default tab
- `PortfolioOverview` — `AgentPortfolioInsights` panel appears below the existing `PortfolioIntelligencePanel`
- `RiskRegimeFit` — "Background Intelligence" section at the bottom
- `ResearchCopilot` — regime + risk chips in header; agent context silently injected into Copilot grounding

No Firestore rules changes required.
No Firebase Functions changes.

---

## IAM requirements

The quant-engine service account must have:
- `bigquery.tables.create` on dataset `artifacts` (for agent_outputs auto-provision)
- `bigquery.tables.updateData` on `artifacts.agent_outputs`
- `bigquery.tables.getData` on `artifacts`, `research`, `features`, `cleaned`, `raw_public`

The Cloud Scheduler SA (`quant-engine-invoker@...`) must have:
- `roles/run.invoker` on the `deplyze-quant-engine` Cloud Run service

---

## Rollback

If any agent produces unexpected outputs:
1. Pause the scheduler: `gcloud scheduler jobs pause v4-agent-{name} --location=us-central1`
2. Agent outputs are read-only in the gateway — no data is deleted by pausing
3. Frontend gracefully degrades when `/agents/*` returns empty — existing pages are unaffected

The `artifacts.agent_outputs` table is append-only. Individual bad outputs can be filtered
by `is_test = TRUE` convention (set `dry_run=true` in the agent run request to prevent BQ writes).

---

## Verification checklist

- [ ] `artifacts.agent_outputs` table exists with DATE partition
- [ ] `GET /agents/registry` returns 10 agents
- [ ] At least one manual agent run succeeds and writes to BQ
- [ ] `GET /v1/agents/outputs` returns the test output
- [ ] `RegimeStatusChip` renders in IntelligenceTerminal header after regime_agent runs
- [ ] `AgentIntelligenceFeed` on "Live Intelligence" tab shows observations
- [ ] `AgentPortfolioInsights` visible in PortfolioOverview
- [ ] ResearchCopilot context includes regime + risk level in grounding (inspect network → /copilot request body)
- [ ] 9 Scheduler jobs exist and are ENABLED
- [ ] No pre-existing pipeline routes broken (existing /intelligence, /macro, /briefings still 200)
