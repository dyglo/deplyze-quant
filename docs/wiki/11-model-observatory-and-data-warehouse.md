# 11. Model Observatory & Data Warehouse

> V3 Phase 2 promotes the analyst's view of the platform's "engine
> room" into a first-class top-level area. **Model Observatory** is the
> honest registry of ML models on the platform; **Warehouse Explorer**
> is the live registry of BigQuery datasets and the provider mesh that
> feeds them.

The two pages are paired by design: every model in the observatory
declares the datasets it needs, and every dataset in the warehouse
shows whether the models that depend on it can run.

---

## Subpages

- **[11.1 Model Observatory](./11.1-model-observatory.md)** — model
  registry, statuses, validation criteria, diagnostics.
- **[11.2 Warehouse Explorer](./11.2-warehouse-explorer.md)** —
  dataset registry across the four logical zones, provider routing
  map, archive of intelligence artifacts.

---

## Design philosophy

The wiki page §11 captures three principles the V3P2 implementation
follows in code:

1. **No fake performance numbers.** The observatory never shows
   hit-rates / Sharpe / IC that aren't backed by a real run. Models in
   pre-training states surface with explicit `needs-dataset` or
   `needs-training` status badges and a `nextStep` describing what
   unblocks them.
2. **Datasets are first-class.** Every model declares
   `requiredProviders` and `requiredDatasets`. The warehouse explorer
   exposes those datasets with provenance, cadence, schema, and a
   live wiring status (`wired` / `partial` / `planned`).
3. **The intelligence layer is just another set of datasets.** V3P2
   artifacts (`macro_artifacts`, `narrative_artifacts`,
   `filing_artifacts`), observations (`macro_observations`,
   `narrative_memory`, `filing_observations`), and briefings
   (`generated_briefings`) appear in the warehouse explorer alongside
   the raw provider feeds — making it explicit that the platform's
   own intelligence is materialised, queryable BigQuery state, not
   in-memory magic.

---

## Cross-references

- `src/pages/ModelObservatory.tsx` — Observatory page
- `src/pages/WarehouseExplorer.tsx` — Explorer page
- `src/components/quant/ModelDrawerBody.tsx` — Model detail drawer
- `src/components/quant/DatasetDrawerBody.tsx` — Dataset detail drawer
- [3.4 BigQuery Data Warehouse](./03.4-bigquery-data-warehouse.md) —
  underlying schema
