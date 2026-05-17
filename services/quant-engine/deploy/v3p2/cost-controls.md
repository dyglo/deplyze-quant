# V3 Phase 2 — Cost Controls & Verification

Verification checklist for deploy agents. Re-run after every Wave A–N PR
merge that touches ingestion or query patterns.

## BigQuery

| Control | Where | Verification |
|---|---|---|
| Storage cost-only growth | All V3P2 tables are DAY-partitioned + clustered | `bq show --format=prettyjson PROJECT:cleaned.macro_cleaned \| jq .timePartitioning` |
| Query budget cap | Gateway routes (`routes/v3p2.ts`, `routes/intelligence.ts`) | `maximumBytesBilled: 50 MB` per call — grep `maximumBytesBilled` |
| Engine-side query budget | Future direct-SQL engines | Use `JobConfigurationQuery.maximumBytesBilled` on every `bq.query()` call |
| Partition pruning | Every gateway query | `EXPLAIN` returns < 100MB scanned for monthly windows |
| Dedup on ingest | Each refinery's lineage_id dedup | Cardinality of `lineage_id` ≈ inserted rows (no doubles on re-run) |
| No SELECT * | Every gateway query | grep `SELECT \*` in `routes/` — should be zero matches in V3P2 routes |

## Cloud Run

| Control | Where | Verification |
|---|---|---|
| Min instances = 0 | `services/quant-engine/deploy.sh` | `gcloud run services describe deplyze-quant-engine --format='value(spec.template.spec.containers[0].resources)'` |
| Memory cap | `deploy.sh --memory 1Gi` | bump to 2Gi if document parser OOMs on PDFs >15MB |
| Timeout cap | `deploy.sh --timeout 300` | refinery jobs that exceed this need Cloud Run Jobs migration |
| Concurrency | default (80) | acceptable for background-task workload |

## Public-source connectors

| Source | Self-throttle (rps) | Hard ceiling | Headroom |
|---|---|---|---|
| SEC EDGAR | 8 | 10 | 20% |
| FRED | 1 (~60/min) | 2 (120/min) | 50% |
| FRED calendar | 1 | shared with FRED | shared |
| CFTC Socrata | 2 | unspecified (Socrata) | comfortable |
| RSS | 4 | per-host varies | acceptable for ~10 feeds |

If any connector starts returning 429s in production logs, the rate budget
constant in the relevant `app/connectors/*.py` file needs to drop and the
service redeploy.

## Cloud Scheduler

| Control | Where | Verification |
|---|---|---|
| Total jobs ≤ 10 | `deploy/v3p2/schedulers.sh` | `gcloud scheduler jobs list --location us-central1 \| wc -l` |
| OIDC auth | every create_job call | `--oidc-service-account-email` is set; jobs without it return 403 |
| Attempt deadline 30m | every create_job call | prevents runaway retries when the engine hangs |
| Max retries 2 | every create_job call | failed jobs page on the third attempt → manual triage |

## Gateway

| Control | Where | Verification |
|---|---|---|
| Auth-gated | `index.ts` `router.use(authenticate, userRateLimiter)` | unauthenticated curl returns 401 |
| Per-user rate limit | shared `userRateLimiter` middleware | already in V3P1; V3P2 routes inherit |
| `maximumBytesBilled` | `routes/v3p2.ts` | every `bq.query()` call sets it explicitly |
| TTL cache | `withCache(...)` on every endpoint | minimum TTL = `TTL.quote * 4` (~10min for fast-changing data) |

## Acceptance criteria for a clean V3P2 deploy

- [ ] `gcloud run services describe deplyze-quant-engine` returns READY
- [ ] All 10 Scheduler jobs created and ENABLED
- [ ] Provisioner reports 0 errors (all V3P2 tables present)
- [ ] `POST /v1/pipelines/ingest/fred` smoke succeeds, returns `run_id`
- [ ] After 1 daily cycle: `bq query "SELECT COUNT(*) FROM \`PROJECT.research.generated_briefings\` WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)"` returns 3
- [ ] Gateway `/v1/macro/regimes` returns 4 rows
- [ ] Gateway `/v1/briefings/latest` returns 3 rows
- [ ] No 5xx on the gateway in the past hour: `gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=deplyze-gateway AND httpRequest.status>=500' --freshness 1h --limit 5`
