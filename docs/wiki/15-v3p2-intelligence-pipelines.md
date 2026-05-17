# 15. V3P2 Intelligence Pipelines

> The wave-by-wave operational reference for V3 Phase 2. Each pipeline
> is a Cloud Scheduler-triggered endpoint on `deplyze-quant-engine`
> that ingests, refines, or materialises intelligence into BigQuery.

This page complements:

- [1.4 V3 Phase 2 Architecture](./01.4-v3-phase2-architecture.md) — the conceptual map.
- [2.3 Quant Engine Service](./02.3-quant-engine-service.md) — the service surface.
- [3.4 BigQuery Data Warehouse](./03.4-bigquery-data-warehouse.md) — the schema.

---

## 15.1 Pipeline catalogue

V3P2 ships ten Cloud Scheduler jobs. Each line below has the form:

```
{job}  ── HTTP-POST ──▶  {endpoint on deplyze-quant-engine}
                                     │
                                     ▼
                            {BigQuery writes}
```

| Job | Wave | Schedule (ET) | Endpoint | Writes |
|---|---|---|---|---|
| `v3p2-ingest-calendar` | D | 04:00 daily | `/v1/pipelines/ingest/calendar` | `raw_public.public_calendar_raw` |
| `v3p2-ingest-edgar` | B | 06:30 daily | `/v1/pipelines/ingest/edgar` | `raw_public.public_filings_raw` + `raw_documents.document_sources_raw` |
| `v3p2-ingest-fred-daily` | C | 09:00 daily | `/v1/pipelines/ingest/fred` | `raw_public.public_macro_raw` + `cleaned.macro_cleaned` |
| `v3p2-macro-regime` | G | 09:45 daily | `/v1/pipelines/intelligence/macro-regime` | `features.macro_features` + `research.macro_observations` + `artifacts.macro_artifacts` |
| `v3p2-narratives` | H | 10:00 daily | `/v1/pipelines/intelligence/narratives` | `features.narrative_features` + `research.narrative_memory` + `artifacts.narrative_artifacts` + `cleaned.narrative_cleaned` |
| `v3p2-briefings` | K | 10:30 daily | `/v1/pipelines/briefings/generate` | `research.generated_briefings` |
| `v3p2-ingest-rss` | D | every 3h | `/v1/pipelines/ingest/rss` | `raw_public.public_rss_raw` |
| `v3p2-refine-docs` | E | every 6h | `/v1/pipelines/refine/documents` | `raw_documents.parsed_documents_raw` |
| `v3p2-refine-entities` | F | every 6h + 30m | `/v1/pipelines/refine/entities` | `features.ontology_features` |
| `v3p2-ingest-cot-weekly` | D | Fri 18:00 | `/v1/pipelines/ingest/cot` | `raw_public.public_reports_raw` |

All jobs run in `us-central1` and call the engine over OIDC-authenticated
HTTP via the `scheduler-invoker` service account.

---

## 15.2 Provisioning

```bash
bash services/quant-engine/deploy/v3p2/schedulers.sh
```

The script is **idempotent**: re-running won't recreate existing jobs
but will report them as "already exists". To verify:

```bash
gcloud scheduler jobs list --location us-central1 \
  --filter='name:v3p2-*' --format='table(name,schedule,state)'
```

Expect **10 jobs** in `ENABLED` state.

---

## 15.3 Daily order of operations

The schedule is **ordered**: each downstream job depends on the
freshness of an upstream write.

```
04:00 ── v3p2-ingest-calendar      seeds today's release schedule
06:30 ── v3p2-ingest-edgar         pulls fresh filings + source URLs
09:00 ── v3p2-ingest-fred-daily    refreshes the macro warehouse
09:45 ── v3p2-macro-regime         reads macro_cleaned, emits regimes
10:00 ── v3p2-narratives           reads ontology_features, emits themes
10:30 ── v3p2-briefings            rolls up the artifact tables
                                       (daily / weekly / anomaly)
every  3h ── v3p2-ingest-rss
every  6h ── v3p2-refine-docs
every  6h+30m ── v3p2-refine-entities
Fri 18:00 ── v3p2-ingest-cot-weekly
```

The 30-minute offset between docs / entities is intentional — the
entity extractor reads from `parsed_documents_raw` and must let the
parser finish first.

---

## 15.4 Per-pipeline reference

### Wave B — EDGAR filings (`/v1/pipelines/ingest/edgar`)

```python
class EdgarIngestRequest(BaseModel):
    symbols_or_ciks: List[str]
    days_back: Optional[int] = None
    forms: Optional[List[str]] = None
```

Resolves tickers to CIKs (or accepts pre-resolved CIKs), pulls recent
filings via the SEC `submissions` API, and writes lineage-tagged rows
to `raw_public.public_filings_raw` + `raw_documents.document_sources_raw`.

**Required env:** `EDGAR_USER_AGENT` (SEC fair-use; must be a real
contact string). Client backs off on 429 with tenacity retries.

### Wave C — FRED macro (`/v1/pipelines/ingest/fred`)

```python
class FredIngestRequest(BaseModel):
    series_ids: Optional[List[str]] = None    # defaults to DEFAULT_SERIES
    since_date: Optional[str] = None          # YYYY-MM-DD
    days_back: int = 1825                     # 5y default
```

Pulls FRED series (defaults to ~30 institutional macro / yield series)
and writes to `raw_public.public_macro_raw` + `cleaned.macro_cleaned`
with YoY / MoM changes pre-computed.

**Required env:** `FRED_API_KEY`. Self-throttles to ~60 req/min vs the
120/min ceiling.

For the macro regime engine to classify all four regime axes, the
ingestor must include these 17 series:

```
WALCL · M2SL · RRPONTSYD · DTWEXBGS              (liquidity)
CPIAUCSL · CPILFESL · PCEPILFE · T10YIE          (inflation)
FEDFUNDS · DFF · DGS10 · DGS2 · T10Y2Y           (rates)
UNRATE · PAYEMS · INDPRO                         (growth)
```

### Wave D · COT (`/v1/pipelines/ingest/cot`)

```python
class CotIngestRequest(BaseModel):
    markets: Optional[List[str]] = None    # defaults to DEFAULT_MARKETS
    since_date: Optional[str] = None       # YYYY-MM-DD
```

Pulls CFTC Commitment of Traders via Socrata, writes to
`raw_public.public_reports_raw`. Runs Fridays at 18:00 ET (CFTC
publishes once a week).

### Wave D · RSS (`/v1/pipelines/ingest/rss`)

```python
class RssIngestRequest(BaseModel):
    feeds: Optional[List[List[str]]] = None    # [[name, url], ...]
```

RSS / Atom feed ingestion. Each `[feed_name, feed_url]` pair writes
items to `raw_public.public_rss_raw`. Runs every 3 hours.

### Wave D · Calendar (`/v1/pipelines/ingest/calendar`)

```python
class CalendarIngestRequest(BaseModel):
    releases: Optional[List[int]] = None    # FRED release_ids
    since_date: Optional[str] = None        # YYYY-MM-DD
    days_ahead: int = 120
```

Pulls FRED release dates and writes them to
`raw_public.public_calendar_raw`. Runs 04:00 ET daily to seed the
day's release schedule before any other job touches macro data.

### Wave E — Document parsing (`/v1/pipelines/refine/documents`)

```python
class DocumentParseRequest(BaseModel):
    limit: int = 200
    user_agent: Optional[str] = None
```

Selects up to `limit` rows from `raw_documents.document_sources_raw`
that have no corresponding `parsed_documents_raw` record, fetches each,
extracts text (PDF / HTML / XML / plain), and writes:

- `raw_documents.parsed_documents_raw` with `extraction_method`,
  `extraction_quality`, and lineage back to the source URL.

Diagnose with a small batch:

```bash
curl -X POST "$SERVICE_URL/v1/pipelines/refine/documents" \
  -d '{"limit":10}'
```

If `records_processed` is 0, inspect `extraction_method` values in the
table.

### Wave F — Entity extraction (`/v1/pipelines/refine/entities`)

```python
class EntityFeatureRequest(BaseModel):
    limit: int = 200
    top_n_per_doc: int = 50
```

Reads `parsed_documents_raw` rows with `extraction_quality >= 0.3` and
runs the deterministic rule-based extractor in `refinery/ontology.py`
+ `refinery/entity_features.py`. Writes per-`(entity, document)` rows
to `features.ontology_features` with:

- `entity_id`, `entity_label`, `entity_type` (`instrument` /
  `entity` / `theme`)
- `salience`, `mention_count`, `co_entities`, `related_symbols`
- `first_seen_at`, `last_seen_at`
- `lineage_id`, `source_url`, `provider`

If runs report 0 written, all source docs are below the 0.3 quality
floor — lower the floor in `entity_features.py::_select_unprocessed`
or improve the parser.

### Wave G — Macro regime intelligence (`/v1/pipelines/intelligence/macro-regime`)

Classifies four orthogonal regimes from `cleaned.macro_cleaned`:

| Axis | Inputs | Output states (examples) |
|---|---|---|
| Liquidity | `WALCL`, `M2SL`, `RRPONTSYD`, `DTWEXBGS` | `expansion`, `contraction` |
| Inflation | `CPILFESL`, `PCEPILFE`, `T10YIE` | `hot`, `cooling`, `cold` |
| Rates | `FEDFUNDS`, `DFF`, `DGS10`, `DGS2`, `T10Y2Y` | `hiking`, `cutting`, `pause` |
| Growth | `UNRATE`, `PAYEMS`, `INDPRO` | `expansion`, `slowing`, `contraction` |

Classification is **fully deterministic**: each regime function reads
`SeriesSnapshot` values, applies fixed bands + z-score thresholds, and
emits a `RegimeResult` with `regime_state`, `confidence`, and
`severity`. No statistical learning, no LLM — fully reproducible per
as-of date.

Per run, writes:

1. `features.macro_features` — z-scores, yoy / mom, trend indicators.
2. `research.macro_observations` — one row per axis ("what's the
   regime today").
3. `artifacts.macro_artifacts` — state-change events.

Fails fast if `macro_cleaned` is empty — run Wave C first.

### Wave H — Narrative intelligence (`/v1/pipelines/intelligence/narratives`)

```python
class NarrativeIntelligenceRequest(BaseModel):
    lookback_days: int = 180
```

Reads `features.ontology_features` filtered to `entity_type = 'theme'`
over the lookback (default 180 days) and tracks each theme's
lifecycle. Per theme, computes:

- `emergence_score = clamp((m30 / (1 + m_prior)) * sqrt(m30) / 5.0, 0, 1)`
- `recurrence_score = present_windows / windows` (windows = lookback / 30)
- `lifetime_score = 0.6 * recurrence + 0.3 * emergence + 0.1 * min(1.0, total/100)`
- `intensity_mean = mean(salience over mentions)`

Writes to:

1. `features.narrative_features` — rolling stats per theme.
2. `research.narrative_memory` — one row per theme, lifetime view.
3. `cleaned.narrative_cleaned` — per-document narrative rows.
4. `artifacts.narrative_artifacts` — emits when
   `emergence ≥ 0.5` OR (`m7 ≥ 5` AND `recurrence < 0.5`), with
   `severity = 'high'` when `emergence ≥ 0.75`.

Returns "0 themes tracked" if `ontology_features` has no theme
entities — run Waves E + F first.

### Wave K — Autonomous briefings (`/v1/pipelines/briefings/generate`)

```python
class BriefingsRequest(BaseModel):
    briefing_types: Optional[List[str]] = None    # subset of three
```

Three briefing generators, all deterministic, all template-based,
**no LLM calls**:

#### `daily_market_intelligence`

| Field | Value |
|---|---|
| Window | last 24h |
| Inputs | `macro_artifacts`, `regime_artifacts`, `narrative_artifacts`, `anomaly_artifacts`, `filing_artifacts` |
| Sections | Macro regimes · Asset-level regimes · Narrative emergence · Anomalies · Material filings |
| Tags | `daily_market_intelligence`, `v3p2` |

#### `weekly_regime_brief`

| Field | Value |
|---|---|
| Window | last 7 days |
| Inputs | `research.macro_observations` grouped by `observation_type` |
| Sections | Current state per axis (liquidity / inflation / rates / growth) |
| Tags | `weekly_regime_brief`, `macro`, `v3p2` |

#### `anomaly_summary`

| Field | Value |
|---|---|
| Window | last 3 days |
| Inputs | `artifacts.anomaly_artifacts` grouped by symbol |
| Tags | `anomaly_summary`, `v3p2` |

All three write to `research.generated_briefings` with
`provider = "deplyze_quant"`,
`model_version = "deplyze-briefings-1.0-deterministic"`, and
`lineage_id = "briefing:<type>:<period_end>"` — the lineage id is the
**idempotency key**: re-running for the same day overwrites by
producing the same id.

### Wave M — Gateway exposure (`cloud-run/gateway/src/routes/v3p2.ts`)

Wave M does not run as a Scheduler job; it's the **read surface**
mounted on the gateway. The V3P2 router fills in the new paths on top
of the existing `/v1` mounts:

| Endpoint | Purpose |
|---|---|
| `GET /v1/macro/regimes` | Latest regime per axis (30d window). |
| `GET /v1/filings/recent` | Recent filings, filterable by `forms`. |
| `GET /v1/filings/:id` | Single filing detail + observations. |
| `GET /v1/narratives/themes` | Theme registry (memory). |
| `GET /v1/narratives/recent` | Recent narrative mentions. |
| `GET /v1/research/macro-observations` | Macro observations stream. |
| `GET /v1/relations/context` | Cross-axis context for symbols. |
| `GET /v1/briefings/latest` | Latest briefings, deduped per `briefing_type`. |

All routes use the gateway's Redis cache with `TTL.quote * N`
multipliers (regimes `* 10`, filings `* 4`, narratives / research /
briefings `* 5`).

### Wave N — Deploy manifests & runbook

Wave N is infrastructure-only:

- `services/quant-engine/deploy.sh` — Cloud Run deploy for the engine.
- `services/quant-engine/deploy/v3p2/schedulers.sh` — Cloud Scheduler.
- `services/quant-engine/deploy/v3p2/runbook.md` — operations.
- `services/quant-engine/deploy/v3p2/cost-controls.md` — cost guardrails.
- `docs/v3p2-deploy.md` — top-level deploy prompt.

---

## 15.5 Routine operations

### Backfill a single connector

```bash
SERVICE_URL=$(gcloud run services describe deplyze-quant-engine \
  --region us-central1 --format 'value(status.url)')
TOKEN=$(gcloud auth print-identity-token)

curl -X POST "$SERVICE_URL/v1/pipelines/ingest/edgar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbols_or_ciks":["AAPL","MSFT","NVDA"],"days_back":365}'
```

The response carries `run_id`; poll the status endpoint:

```bash
curl "$SERVICE_URL/v1/pipelines/status/<run_id>" \
  -H "Authorization: Bearer $TOKEN"
```

### Force-regenerate today's briefings

```bash
curl -X POST "$SERVICE_URL/v1/pipelines/briefings/generate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"briefing_types":["daily_market_intelligence","weekly_regime_brief","anomaly_summary"]}'
```

### Diagnose a stuck pipeline

1. `gcloud scheduler jobs describe <name> --location us-central1` —
   last run + last status.
2. Logs:
   ```bash
   gcloud logging read \
     "resource.type=cloud_run_revision AND severity>=ERROR" \
     --limit 50
   ```
3. If the engine OOM'd, bump memory in
   `services/quant-engine/deploy.sh` (`--memory 2Gi`) and redeploy.

### Rollback policy

All V3P2 pipelines are **additive** — no destructive writes. To roll
back:

1. Pause the relevant Scheduler jobs:
   ```bash
   gcloud scheduler jobs pause v3p2-<job> --location us-central1
   ```
2. **Only with explicit approval**, drop V3P2 tables per
   `migrations/v3p2/README.md`. Downstream gateway routes will 500
   until tables are recreated.

---

## 15.6 Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `EDGAR_USER_AGENT is not configured` | env var missing | Set on Cloud Run; redeploy. |
| `FRED_API_KEY required` | env var missing | Set on Cloud Run; redeploy. |
| EDGAR `429` | SEC rate-limit | Verify User-Agent specifies a real contact. Client backs off. |
| FRED `429` | over budget | Reduce `series_ids` or `days_back`. |
| `document_parse` 0 written | extraction failures | Re-run with `limit=10`; inspect `extraction_method`. |
| `entity_features` 0 written | docs below quality floor | Lower 0.3 floor in `_select_unprocessed`. |
| Macro regime: "no macro data" | `macro_cleaned` empty | Run `/ingest/fred` first. |
| Narratives: "0 themes tracked" | no theme entities | Run docs + entities first. |

---

## 15.7 Cross-references

- `services/quant-engine/deploy/v3p2/schedulers.sh` — Cloud Scheduler
- `services/quant-engine/deploy/v3p2/runbook.md` — operational runbook
- `services/quant-engine/deploy/v3p2/cost-controls.md` — cost controls
- `services/quant-engine/app/api/pipelines.py` — pipeline endpoints
- `services/quant-engine/app/intelligence/macro_regime.py` — regime engine
- `services/quant-engine/app/intelligence/narratives.py` — narrative engine
- `services/quant-engine/app/briefings/generators.py` — briefing templates
- `cloud-run/gateway/src/routes/v3p2.ts` — gateway read surface
- `docs/v3p2-deploy.md` — V3P2 deploy prompt
- [1.4 V3 Phase 2 Architecture](./01.4-v3-phase2-architecture.md)
- [2.3 Quant Engine Service](./02.3-quant-engine-service.md)
- [3.4 BigQuery Data Warehouse](./03.4-bigquery-data-warehouse.md)
