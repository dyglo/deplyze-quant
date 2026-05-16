# V3 Phase 2 — BigQuery Migrations

Additive schema migrations for the Intelligence Refinery work. Every script is
idempotent: re-running is safe.

## Layout

| File | Wave | Tables |
|------|------|--------|
| `001_wave_a_schemas.sql` | A | `cleaned.filings_cleaned`, `cleaned.narrative_cleaned`, `features.macro_features`, `features.narrative_features`, `features.filing_features`, `features.ontology_features`, `research.macro_observations`, `research.narrative_memory`, `research.filing_observations`, `artifacts.macro_artifacts`, `artifacts.narrative_artifacts`, `artifacts.filing_artifacts` |

## Apply paths

There are two equivalent ways to apply the migrations. Both are idempotent.

### 1. Python provisioner (preferred — runtime path)

The `TABLE_REGISTRY` inside `app/bigquery/provisioner.py` is the single source
of truth at runtime. The provisioner uses `client.create_table(..., exists_ok=
False)` and traps `Conflict` so an existing table is left untouched.

```bash
cd services/quant-engine
python provision_bq.py
```

### 2. Raw `bq query` (fallback for deploy agents)

```bash
PROJECT_ID=deplyze-quant-prod  # adjust per environment
sed "s/{PROJECT_ID}/${PROJECT_ID}/g" migrations/v3p2/001_wave_a_schemas.sql \
  | bq query --project_id="${PROJECT_ID}" --use_legacy_sql=false --nouse_cache
```

## Safety guarantees

- `CREATE TABLE IF NOT EXISTS` only — no `DROP`, no destructive `ALTER`.
- Schema fields match `app/bigquery/schemas.py` 1:1. Keep them in sync.
- All new tables are partitioned (DAY) and clustered for cost control.
- Storage cost is zero until first insert.

## Rollback

If a table must be removed:

```sql
DROP TABLE `${PROJECT_ID}.cleaned.filings_cleaned`;
```

Do **not** drop in production without an approved rollback plan; downstream
consumers (Wave G/H/K) will reference these tables.
