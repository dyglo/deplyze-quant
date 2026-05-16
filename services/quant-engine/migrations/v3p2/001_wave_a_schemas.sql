-- =============================================================================
-- Deplyze Quant V3 · Phase 2 · Wave A · BigQuery Schema Migration
-- =============================================================================
-- Purpose: Additive extension of the V3 Phase 1 warehouse. Introduces
--          domain-specific tables for SEC filings, FRED/macro intelligence,
--          narrative memory, ontology features, and dedicated artifact buckets.
--
-- Safety:  ALL statements use CREATE TABLE IF NOT EXISTS — idempotent.
--          No DROP / ALTER COLUMN. Re-running this script is safe.
--          Run against the same project the Cloud Run engine uses.
--
-- Canonical source of truth: app/bigquery/schemas.py. Keep this file in sync
-- with the Python schemas; the Python provisioner is the runtime applicator.
-- This SQL exists for human review and as a fallback for `bq query` rollouts.
-- =============================================================================

-- Replace {PROJECT_ID} via envsubst, sed, or `bq --project_id=...` at apply time.

-- ─── cleaned ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.cleaned.filings_cleaned` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  cik                   STRING,
  accession_number      STRING,
  form_type             STRING,
  filing_date           DATE,
  period_of_report      DATE,
  entity_name           STRING,
  primary_document_url  STRING,
  primary_document_mime STRING,
  related_symbols       ARRAY<STRING>,
  themes                ARRAY<STRING>,
  is_amended            BOOL,
  dedup_hash            STRING,
  updated_at            TIMESTAMP
)
PARTITION BY filing_date
CLUSTER BY cik, form_type;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.cleaned.narrative_cleaned` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  theme_id              STRING,
  theme_label           STRING,
  source_document_id    STRING,
  polarity              FLOAT64,
  intensity             FLOAT64,
  salience              FLOAT64,
  excerpt               STRING,
  published_at          TIMESTAMP,
  related_symbols       ARRAY<STRING>,
  related_entities      ARRAY<STRING>,
  dedup_hash            STRING,
  updated_at            TIMESTAMP
)
PARTITION BY DATE(published_at)
CLUSTER BY theme_id;

-- ─── features ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.features.macro_features` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  series_id             STRING,
  series_name           STRING,
  frequency             STRING,
  value                 FLOAT64,
  yoy_change            FLOAT64,
  mom_change            FLOAT64,
  zscore_36m            FLOAT64,
  percentile_120m       FLOAT64,
  trend_label           STRING,
  regime_label          STRING,
  regime_confidence     FLOAT64,
  updated_at            TIMESTAMP
)
PARTITION BY DATE(observation_time)
CLUSTER BY series_id;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.features.narrative_features` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  theme_id              STRING,
  theme_label           STRING,
  window_days           INT64,
  mentions              INT64,
  mentions_7d           INT64,
  mentions_30d          INT64,
  emergence_score       FLOAT64,
  recurrence_score      FLOAT64,
  polarity_mean         FLOAT64,
  intensity_mean        FLOAT64,
  related_symbols       ARRAY<STRING>,
  updated_at            TIMESTAMP
)
PARTITION BY DATE(observation_time)
CLUSTER BY theme_id;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.features.filing_features` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  cik                   STRING,
  accession_number      STRING,
  form_type             STRING,
  filing_date           DATE,
  sentiment_score       FLOAT64,
  novelty_score         FLOAT64,
  urgency_score         FLOAT64,
  length_zscore         FLOAT64,
  risk_factor_delta     FLOAT64,
  topic_tags            ARRAY<STRING>,
  related_symbols       ARRAY<STRING>,
  updated_at            TIMESTAMP
)
PARTITION BY filing_date
CLUSTER BY cik, form_type;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.features.ontology_features` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  entity_id             STRING,
  entity_label          STRING,
  entity_type           STRING,
  salience              FLOAT64,
  link_density          FLOAT64,
  first_seen_at         TIMESTAMP,
  last_seen_at          TIMESTAMP,
  mention_count         INT64,
  co_entities           ARRAY<STRING>,
  related_symbols       ARRAY<STRING>,
  updated_at            TIMESTAMP
)
PARTITION BY DATE(observation_time)
CLUSTER BY entity_type, entity_id;

-- ─── research ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.research.macro_observations` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  observation_type      STRING,
  regime_state          STRING,
  title                 STRING,
  summary               STRING,
  body                  STRING,
  related_series        ARRAY<STRING>,
  related_symbols       ARRAY<STRING>,
  tags                  ARRAY<STRING>,
  severity              STRING,
  updated_at            TIMESTAMP
)
PARTITION BY DATE(observation_time)
CLUSTER BY observation_type, regime_state;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.research.narrative_memory` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  theme_id              STRING,
  theme_label           STRING,
  emergence_at          TIMESTAMP,
  last_seen_at          TIMESTAMP,
  recurrence_count      INT64,
  lifetime_score        FLOAT64,
  polarity_mean         FLOAT64,
  intensity_mean        FLOAT64,
  related_symbols       ARRAY<STRING>,
  related_entities      ARRAY<STRING>,
  tags                  ARRAY<STRING>,
  updated_at            TIMESTAMP
)
PARTITION BY DATE(last_seen_at)
CLUSTER BY theme_id;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.research.filing_observations` (
  id                    STRING    NOT NULL,
  symbol                STRING,
  asset_type            STRING,
  provider              STRING,
  source_url            STRING,
  source_type           STRING,
  ingestion_time        TIMESTAMP NOT NULL,
  observation_time      TIMESTAMP,
  processing_time       TIMESTAMP,
  data_quality_score    FLOAT64,
  lineage_id            STRING,
  confidence            FLOAT64,
  metadata              JSON,
  created_at            TIMESTAMP NOT NULL,
  filing_id             STRING,
  cik                   STRING,
  accession_number      STRING,
  form_type             STRING,
  observation_type      STRING,
  title                 STRING,
  summary               STRING,
  body                  STRING,
  key_metrics           JSON,
  related_symbols       ARRAY<STRING>,
  tags                  ARRAY<STRING>,
  severity              STRING,
  updated_at            TIMESTAMP
)
PARTITION BY DATE(observation_time)
CLUSTER BY cik, form_type;

-- ─── artifacts ────────────────────────────────────────────────────────────────
-- These reuse the canonical research_artifacts shape so cross-bucket joins and
-- federated artifact queries remain ergonomic.

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.artifacts.macro_artifacts` (
  artifact_id      STRING    NOT NULL,
  artifact_type    STRING    NOT NULL,
  title            STRING,
  summary          STRING,
  symbol           STRING,
  related_symbols  ARRAY<STRING>,
  evidence         JSON,
  metrics          JSON,
  confidence       FLOAT64,
  severity         STRING,
  source_tables    ARRAY<STRING>,
  lineage_id       STRING,
  is_test          BOOL,
  created_at       TIMESTAMP NOT NULL,
  updated_at       TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY artifact_type;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.artifacts.narrative_artifacts` (
  artifact_id      STRING    NOT NULL,
  artifact_type    STRING    NOT NULL,
  title            STRING,
  summary          STRING,
  symbol           STRING,
  related_symbols  ARRAY<STRING>,
  evidence         JSON,
  metrics          JSON,
  confidence       FLOAT64,
  severity         STRING,
  source_tables    ARRAY<STRING>,
  lineage_id       STRING,
  is_test          BOOL,
  created_at       TIMESTAMP NOT NULL,
  updated_at       TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY artifact_type;

CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.artifacts.filing_artifacts` (
  artifact_id      STRING    NOT NULL,
  artifact_type    STRING    NOT NULL,
  title            STRING,
  summary          STRING,
  symbol           STRING,
  related_symbols  ARRAY<STRING>,
  evidence         JSON,
  metrics          JSON,
  confidence       FLOAT64,
  severity         STRING,
  source_tables    ARRAY<STRING>,
  lineage_id       STRING,
  is_test          BOOL,
  created_at       TIMESTAMP NOT NULL,
  updated_at       TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY artifact_type, symbol;

-- =============================================================================
-- END Wave A migration · 12 tables · all idempotent
-- =============================================================================
