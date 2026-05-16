"""
BigQuery table schemas for all Deplyze Quant V3 datasets.
All schemas include standard lineage/quality fields.
"""

from google.cloud import bigquery

S = bigquery.SchemaField

# ─── Shared base fields ──────────────────────────────────────────────────────

_BASE = [
    S("id", "STRING", "REQUIRED"),
    S("symbol", "STRING", "NULLABLE"),
    S("asset_type", "STRING", "NULLABLE"),
    S("provider", "STRING", "NULLABLE"),
    S("source_url", "STRING", "NULLABLE"),
    S("source_type", "STRING", "NULLABLE"),
    S("ingestion_time", "TIMESTAMP", "REQUIRED"),
    S("observation_time", "TIMESTAMP", "NULLABLE"),
    S("processing_time", "TIMESTAMP", "NULLABLE"),
    S("data_quality_score", "FLOAT64", "NULLABLE"),
    S("lineage_id", "STRING", "NULLABLE"),
    S("confidence", "FLOAT64", "NULLABLE"),
    S("metadata", "JSON", "NULLABLE"),
    S("created_at", "TIMESTAMP", "REQUIRED"),
]

def _base():
    return list(_BASE)

# ─── raw_api ─────────────────────────────────────────────────────────────────

MARKET_QUOTES_RAW = _base() + [
    S("bid", "FLOAT64", "NULLABLE"),
    S("ask", "FLOAT64", "NULLABLE"),
    S("price", "FLOAT64", "NULLABLE"),
    S("volume", "FLOAT64", "NULLABLE"),
    S("change_pct", "FLOAT64", "NULLABLE"),
    S("market_cap", "FLOAT64", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

OHLCV_RAW = _base() + [
    S("open", "FLOAT64", "NULLABLE"),
    S("high", "FLOAT64", "NULLABLE"),
    S("low", "FLOAT64", "NULLABLE"),
    S("close", "FLOAT64", "NULLABLE"),
    S("volume", "FLOAT64", "NULLABLE"),
    S("adjusted_close", "FLOAT64", "NULLABLE"),
    S("timeframe", "STRING", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

FUNDAMENTALS_RAW = _base() + [
    S("period", "STRING", "NULLABLE"),
    S("fiscal_year", "INT64", "NULLABLE"),
    S("fiscal_quarter", "INT64", "NULLABLE"),
    S("revenue", "FLOAT64", "NULLABLE"),
    S("net_income", "FLOAT64", "NULLABLE"),
    S("eps", "FLOAT64", "NULLABLE"),
    S("pe_ratio", "FLOAT64", "NULLABLE"),
    S("market_cap", "FLOAT64", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

EARNINGS_RAW = _base() + [
    S("period", "STRING", "NULLABLE"),
    S("fiscal_year", "INT64", "NULLABLE"),
    S("fiscal_quarter", "INT64", "NULLABLE"),
    S("eps_actual", "FLOAT64", "NULLABLE"),
    S("eps_estimate", "FLOAT64", "NULLABLE"),
    S("eps_surprise", "FLOAT64", "NULLABLE"),
    S("eps_surprise_pct", "FLOAT64", "NULLABLE"),
    S("revenue_actual", "FLOAT64", "NULLABLE"),
    S("revenue_estimate", "FLOAT64", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

NEWS_RAW = _base() + [
    S("headline", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("author", "STRING", "NULLABLE"),
    S("published_at", "TIMESTAMP", "NULLABLE"),
    S("sentiment_label", "STRING", "NULLABLE"),
    S("sentiment_score", "FLOAT64", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("raw_payload", "JSON", "NULLABLE"),
]

PROVIDER_RESPONSES_RAW = _base() + [
    S("endpoint", "STRING", "NULLABLE"),
    S("http_status", "INT64", "NULLABLE"),
    S("latency_ms", "FLOAT64", "NULLABLE"),
    S("request_params", "JSON", "NULLABLE"),
    S("response_size_bytes", "INT64", "NULLABLE"),
    S("error_message", "STRING", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

# ─── raw_public ───────────────────────────────────────────────────────────────

PUBLIC_MACRO_RAW = _base() + [
    S("series_id", "STRING", "NULLABLE"),
    S("series_name", "STRING", "NULLABLE"),
    S("frequency", "STRING", "NULLABLE"),
    S("units", "STRING", "NULLABLE"),
    S("value", "FLOAT64", "NULLABLE"),
    S("vintage_date", "DATE", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

PUBLIC_FILINGS_RAW = _base() + [
    S("cik", "STRING", "NULLABLE"),
    S("accession_number", "STRING", "NULLABLE"),
    S("form_type", "STRING", "NULLABLE"),
    S("filing_date", "DATE", "NULLABLE"),
    S("period_of_report", "DATE", "NULLABLE"),
    S("entity_name", "STRING", "NULLABLE"),
    S("document_url", "STRING", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

PUBLIC_CALENDAR_RAW = _base() + [
    S("event_type", "STRING", "NULLABLE"),
    S("event_name", "STRING", "NULLABLE"),
    S("event_date", "DATE", "NULLABLE"),
    S("country", "STRING", "NULLABLE"),
    S("importance", "STRING", "NULLABLE"),
    S("actual_value", "FLOAT64", "NULLABLE"),
    S("forecast_value", "FLOAT64", "NULLABLE"),
    S("previous_value", "FLOAT64", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

PUBLIC_REPORTS_RAW = _base() + [
    S("report_title", "STRING", "NULLABLE"),
    S("report_date", "DATE", "NULLABLE"),
    S("issuing_body", "STRING", "NULLABLE"),
    S("report_type", "STRING", "NULLABLE"),
    S("document_url", "STRING", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

PUBLIC_RSS_RAW = _base() + [
    S("feed_name", "STRING", "NULLABLE"),
    S("feed_url", "STRING", "NULLABLE"),
    S("title", "STRING", "NULLABLE"),
    S("link", "STRING", "NULLABLE"),
    S("published_at", "TIMESTAMP", "NULLABLE"),
    S("content_snippet", "STRING", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

# ─── raw_documents ────────────────────────────────────────────────────────────

DOCUMENT_SOURCES_RAW = _base() + [
    S("document_type", "STRING", "NULLABLE"),
    S("document_title", "STRING", "NULLABLE"),
    S("document_url", "STRING", "NULLABLE"),
    S("mime_type", "STRING", "NULLABLE"),
    S("file_size_bytes", "INT64", "NULLABLE"),
    S("language", "STRING", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

PARSED_DOCUMENTS_RAW = _base() + [
    S("source_document_id", "STRING", "NULLABLE"),
    S("document_type", "STRING", "NULLABLE"),
    S("extracted_text", "STRING", "NULLABLE"),
    S("page_count", "INT64", "NULLABLE"),
    S("extraction_method", "STRING", "NULLABLE"),
    S("extraction_quality", "FLOAT64", "NULLABLE"),
    S("raw_payload", "JSON", "NULLABLE"),
]

# ─── cleaned ─────────────────────────────────────────────────────────────────

INSTRUMENTS = [
    S("id", "STRING", "REQUIRED"),
    S("symbol", "STRING", "REQUIRED"),
    S("name", "STRING", "NULLABLE"),
    S("asset_type", "STRING", "NULLABLE"),
    S("exchange", "STRING", "NULLABLE"),
    S("currency", "STRING", "NULLABLE"),
    S("sector", "STRING", "NULLABLE"),
    S("industry", "STRING", "NULLABLE"),
    S("country", "STRING", "NULLABLE"),
    S("is_active", "BOOL", "NULLABLE"),
    S("metadata", "JSON", "NULLABLE"),
    S("created_at", "TIMESTAMP", "REQUIRED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

OHLCV_CLEANED = _base() + [
    S("open", "FLOAT64", "NULLABLE"),
    S("high", "FLOAT64", "NULLABLE"),
    S("low", "FLOAT64", "NULLABLE"),
    S("close", "FLOAT64", "NULLABLE"),
    S("volume", "FLOAT64", "NULLABLE"),
    S("adjusted_close", "FLOAT64", "NULLABLE"),
    S("timeframe", "STRING", "NULLABLE"),
    S("is_adjusted", "BOOL", "NULLABLE"),
    S("dedup_hash", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

FUNDAMENTALS_CLEANED = _base() + [
    S("period", "STRING", "NULLABLE"),
    S("fiscal_year", "INT64", "NULLABLE"),
    S("fiscal_quarter", "INT64", "NULLABLE"),
    S("revenue", "FLOAT64", "NULLABLE"),
    S("gross_profit", "FLOAT64", "NULLABLE"),
    S("operating_income", "FLOAT64", "NULLABLE"),
    S("net_income", "FLOAT64", "NULLABLE"),
    S("eps_diluted", "FLOAT64", "NULLABLE"),
    S("pe_ratio", "FLOAT64", "NULLABLE"),
    S("pb_ratio", "FLOAT64", "NULLABLE"),
    S("market_cap", "FLOAT64", "NULLABLE"),
    S("total_assets", "FLOAT64", "NULLABLE"),
    S("total_debt", "FLOAT64", "NULLABLE"),
    S("free_cash_flow", "FLOAT64", "NULLABLE"),
    S("dedup_hash", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

EARNINGS_CLEANED = _base() + [
    S("period", "STRING", "NULLABLE"),
    S("fiscal_year", "INT64", "NULLABLE"),
    S("fiscal_quarter", "INT64", "NULLABLE"),
    S("eps_actual", "FLOAT64", "NULLABLE"),
    S("eps_estimate", "FLOAT64", "NULLABLE"),
    S("eps_surprise", "FLOAT64", "NULLABLE"),
    S("eps_surprise_pct", "FLOAT64", "NULLABLE"),
    S("beat_miss_meet", "STRING", "NULLABLE"),
    S("dedup_hash", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

MACRO_CLEANED = _base() + [
    S("series_id", "STRING", "NULLABLE"),
    S("series_name", "STRING", "NULLABLE"),
    S("frequency", "STRING", "NULLABLE"),
    S("units", "STRING", "NULLABLE"),
    S("value", "FLOAT64", "NULLABLE"),
    S("vintage_date", "DATE", "NULLABLE"),
    S("yoy_change", "FLOAT64", "NULLABLE"),
    S("mom_change", "FLOAT64", "NULLABLE"),
    S("dedup_hash", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

NEWS_CLEANED = _base() + [
    S("headline", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("published_at", "TIMESTAMP", "NULLABLE"),
    S("sentiment_label", "STRING", "NULLABLE"),
    S("sentiment_score", "FLOAT64", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("dedup_hash", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

# ─── features ─────────────────────────────────────────────────────────────────

RETURNS_FEATURES = _base() + [
    S("timeframe", "STRING", "NULLABLE"),
    S("simple_return_1d", "FLOAT64", "NULLABLE"),
    S("simple_return_5d", "FLOAT64", "NULLABLE"),
    S("simple_return_21d", "FLOAT64", "NULLABLE"),
    S("simple_return_63d", "FLOAT64", "NULLABLE"),
    S("log_return_1d", "FLOAT64", "NULLABLE"),
    S("log_return_5d", "FLOAT64", "NULLABLE"),
    S("cumulative_return_ytd", "FLOAT64", "NULLABLE"),
    S("max_drawdown_21d", "FLOAT64", "NULLABLE"),
    S("max_drawdown_252d", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

VOLATILITY_FEATURES = _base() + [
    S("timeframe", "STRING", "NULLABLE"),
    S("realized_vol_21d", "FLOAT64", "NULLABLE"),
    S("realized_vol_63d", "FLOAT64", "NULLABLE"),
    S("realized_vol_252d", "FLOAT64", "NULLABLE"),
    S("vol_zscore_21d", "FLOAT64", "NULLABLE"),
    S("vol_percentile_252d", "FLOAT64", "NULLABLE"),
    S("vol_regime", "STRING", "NULLABLE"),
    S("atr_14d", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

CORRELATION_FEATURES = _base() + [
    S("symbol_b", "STRING", "NULLABLE"),
    S("timeframe", "STRING", "NULLABLE"),
    S("window_days", "INT64", "NULLABLE"),
    S("pearson_correlation", "FLOAT64", "NULLABLE"),
    S("rolling_corr_21d", "FLOAT64", "NULLABLE"),
    S("rolling_corr_63d", "FLOAT64", "NULLABLE"),
    S("corr_change_21d", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

REGIME_FEATURES = _base() + [
    S("timeframe", "STRING", "NULLABLE"),
    S("regime_label", "STRING", "NULLABLE"),
    S("regime_confidence", "FLOAT64", "NULLABLE"),
    S("vol_regime", "STRING", "NULLABLE"),
    S("trend_label", "STRING", "NULLABLE"),
    S("trend_strength", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

MOMENTUM_FEATURES = _base() + [
    S("timeframe", "STRING", "NULLABLE"),
    S("momentum_21d", "FLOAT64", "NULLABLE"),
    S("momentum_63d", "FLOAT64", "NULLABLE"),
    S("momentum_persistence", "FLOAT64", "NULLABLE"),
    S("rsi_14d", "FLOAT64", "NULLABLE"),
    S("sma_cross_signal", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

ANOMALY_FEATURES = _base() + [
    S("timeframe", "STRING", "NULLABLE"),
    S("anomaly_score", "FLOAT64", "NULLABLE"),
    S("zscore_price", "FLOAT64", "NULLABLE"),
    S("zscore_volume", "FLOAT64", "NULLABLE"),
    S("zscore_return", "FLOAT64", "NULLABLE"),
    S("is_anomaly", "BOOL", "NULLABLE"),
    S("anomaly_type", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

BENCHMARK_FEATURES = _base() + [
    S("benchmark_symbol", "STRING", "NULLABLE"),
    S("timeframe", "STRING", "NULLABLE"),
    S("beta_63d", "FLOAT64", "NULLABLE"),
    S("alpha_63d", "FLOAT64", "NULLABLE"),
    S("tracking_error_63d", "FLOAT64", "NULLABLE"),
    S("excess_return_21d", "FLOAT64", "NULLABLE"),
    S("sharpe_ratio_252d", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

RELATIONSHIP_FEATURES = _base() + [
    S("entity_a", "STRING", "NULLABLE"),
    S("entity_b", "STRING", "NULLABLE"),
    S("relationship_type", "STRING", "NULLABLE"),
    S("strength", "FLOAT64", "NULLABLE"),
    S("direction", "STRING", "NULLABLE"),
    S("window_days", "INT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

# ─── research ─────────────────────────────────────────────────────────────────

RESEARCH_OBSERVATIONS = _base() + [
    S("observation_type", "STRING", "NULLABLE"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("body", "STRING", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("tags", "STRING", "REPEATED"),
    S("severity", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

INTELLIGENCE_TIMELINE = _base() + [
    S("event_type", "STRING", "NULLABLE"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("artifact_id", "STRING", "NULLABLE"),
    S("severity", "STRING", "NULLABLE"),
    S("tags", "STRING", "REPEATED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

GENERATED_BRIEFINGS = _base() + [
    S("briefing_type", "STRING", "NULLABLE"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("body", "STRING", "NULLABLE"),
    S("period_start", "DATE", "NULLABLE"),
    S("period_end", "DATE", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("tags", "STRING", "REPEATED"),
    S("model_version", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

COPILOT_CONTEXT = _base() + [
    S("session_id", "STRING", "NULLABLE"),
    S("context_type", "STRING", "NULLABLE"),
    S("query", "STRING", "NULLABLE"),
    S("response", "STRING", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("artifact_ids", "STRING", "REPEATED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

# ─── V3 Phase 2 · cleaned (filings + narrative) ──────────────────────────────

FILINGS_CLEANED = _base() + [
    S("cik", "STRING", "NULLABLE"),
    S("accession_number", "STRING", "NULLABLE"),
    S("form_type", "STRING", "NULLABLE"),
    S("filing_date", "DATE", "NULLABLE"),
    S("period_of_report", "DATE", "NULLABLE"),
    S("entity_name", "STRING", "NULLABLE"),
    S("primary_document_url", "STRING", "NULLABLE"),
    S("primary_document_mime", "STRING", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("themes", "STRING", "REPEATED"),
    S("is_amended", "BOOL", "NULLABLE"),
    S("dedup_hash", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

NARRATIVE_CLEANED = _base() + [
    S("theme_id", "STRING", "NULLABLE"),
    S("theme_label", "STRING", "NULLABLE"),
    S("source_document_id", "STRING", "NULLABLE"),
    S("polarity", "FLOAT64", "NULLABLE"),
    S("intensity", "FLOAT64", "NULLABLE"),
    S("salience", "FLOAT64", "NULLABLE"),
    S("excerpt", "STRING", "NULLABLE"),
    S("published_at", "TIMESTAMP", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("related_entities", "STRING", "REPEATED"),
    S("dedup_hash", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

# ─── V3 Phase 2 · features (macro + narrative + filing + ontology) ───────────

MACRO_FEATURES = _base() + [
    S("series_id", "STRING", "NULLABLE"),
    S("series_name", "STRING", "NULLABLE"),
    S("frequency", "STRING", "NULLABLE"),
    S("value", "FLOAT64", "NULLABLE"),
    S("yoy_change", "FLOAT64", "NULLABLE"),
    S("mom_change", "FLOAT64", "NULLABLE"),
    S("zscore_36m", "FLOAT64", "NULLABLE"),
    S("percentile_120m", "FLOAT64", "NULLABLE"),
    S("trend_label", "STRING", "NULLABLE"),
    S("regime_label", "STRING", "NULLABLE"),
    S("regime_confidence", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

NARRATIVE_FEATURES = _base() + [
    S("theme_id", "STRING", "NULLABLE"),
    S("theme_label", "STRING", "NULLABLE"),
    S("window_days", "INT64", "NULLABLE"),
    S("mentions", "INT64", "NULLABLE"),
    S("mentions_7d", "INT64", "NULLABLE"),
    S("mentions_30d", "INT64", "NULLABLE"),
    S("emergence_score", "FLOAT64", "NULLABLE"),
    S("recurrence_score", "FLOAT64", "NULLABLE"),
    S("polarity_mean", "FLOAT64", "NULLABLE"),
    S("intensity_mean", "FLOAT64", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

FILING_FEATURES = _base() + [
    S("cik", "STRING", "NULLABLE"),
    S("accession_number", "STRING", "NULLABLE"),
    S("form_type", "STRING", "NULLABLE"),
    S("filing_date", "DATE", "NULLABLE"),
    S("sentiment_score", "FLOAT64", "NULLABLE"),
    S("novelty_score", "FLOAT64", "NULLABLE"),
    S("urgency_score", "FLOAT64", "NULLABLE"),
    S("length_zscore", "FLOAT64", "NULLABLE"),
    S("risk_factor_delta", "FLOAT64", "NULLABLE"),
    S("topic_tags", "STRING", "REPEATED"),
    S("related_symbols", "STRING", "REPEATED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

ONTOLOGY_FEATURES = _base() + [
    S("entity_id", "STRING", "NULLABLE"),
    S("entity_label", "STRING", "NULLABLE"),
    S("entity_type", "STRING", "NULLABLE"),
    S("salience", "FLOAT64", "NULLABLE"),
    S("link_density", "FLOAT64", "NULLABLE"),
    S("first_seen_at", "TIMESTAMP", "NULLABLE"),
    S("last_seen_at", "TIMESTAMP", "NULLABLE"),
    S("mention_count", "INT64", "NULLABLE"),
    S("co_entities", "STRING", "REPEATED"),
    S("related_symbols", "STRING", "REPEATED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

# ─── V3 Phase 2 · research (macro/narrative/filing memory) ───────────────────

MACRO_OBSERVATIONS = _base() + [
    S("observation_type", "STRING", "NULLABLE"),
    S("regime_state", "STRING", "NULLABLE"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("body", "STRING", "NULLABLE"),
    S("related_series", "STRING", "REPEATED"),
    S("related_symbols", "STRING", "REPEATED"),
    S("tags", "STRING", "REPEATED"),
    S("severity", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

NARRATIVE_MEMORY = _base() + [
    S("theme_id", "STRING", "NULLABLE"),
    S("theme_label", "STRING", "NULLABLE"),
    S("emergence_at", "TIMESTAMP", "NULLABLE"),
    S("last_seen_at", "TIMESTAMP", "NULLABLE"),
    S("recurrence_count", "INT64", "NULLABLE"),
    S("lifetime_score", "FLOAT64", "NULLABLE"),
    S("polarity_mean", "FLOAT64", "NULLABLE"),
    S("intensity_mean", "FLOAT64", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("related_entities", "STRING", "REPEATED"),
    S("tags", "STRING", "REPEATED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

FILING_OBSERVATIONS = _base() + [
    S("filing_id", "STRING", "NULLABLE"),
    S("cik", "STRING", "NULLABLE"),
    S("accession_number", "STRING", "NULLABLE"),
    S("form_type", "STRING", "NULLABLE"),
    S("observation_type", "STRING", "NULLABLE"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("body", "STRING", "NULLABLE"),
    S("key_metrics", "JSON", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("tags", "STRING", "REPEATED"),
    S("severity", "STRING", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

# ─── artifacts ────────────────────────────────────────────────────────────────

RESEARCH_ARTIFACTS = [
    S("artifact_id", "STRING", "REQUIRED"),
    S("artifact_type", "STRING", "REQUIRED"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("symbol", "STRING", "NULLABLE"),
    S("related_symbols", "STRING", "REPEATED"),
    S("evidence", "JSON", "NULLABLE"),
    S("metrics", "JSON", "NULLABLE"),
    S("confidence", "FLOAT64", "NULLABLE"),
    S("severity", "STRING", "NULLABLE"),
    S("source_tables", "STRING", "REPEATED"),
    S("lineage_id", "STRING", "NULLABLE"),
    S("is_test", "BOOL", "NULLABLE"),
    S("created_at", "TIMESTAMP", "REQUIRED"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

def _artifact_table():
    return list(RESEARCH_ARTIFACTS)

ANOMALY_ARTIFACTS = _artifact_table()
REGIME_ARTIFACTS = _artifact_table()
CORRELATION_ARTIFACTS = _artifact_table()
VOLATILITY_ARTIFACTS = _artifact_table()
HISTORICAL_ANALOG_ARTIFACTS = _artifact_table()
RELATIONSHIP_ARTIFACTS = _artifact_table()

# V3 Phase 2 artifact tables — reuse the canonical RESEARCH_ARTIFACTS shape
# so all artifact tables stay query-compatible across the warehouse.
MACRO_ARTIFACTS = _artifact_table()
NARRATIVE_ARTIFACTS = _artifact_table()
FILING_ARTIFACTS = _artifact_table()

# ─── model_outputs ────────────────────────────────────────────────────────────

MODEL_PREDICTIONS = _base() + [
    S("model_id", "STRING", "NULLABLE"),
    S("model_version", "STRING", "NULLABLE"),
    S("prediction_type", "STRING", "NULLABLE"),
    S("horizon_days", "INT64", "NULLABLE"),
    S("predicted_value", "FLOAT64", "NULLABLE"),
    S("prediction_interval_low", "FLOAT64", "NULLABLE"),
    S("prediction_interval_high", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

CONFIDENCE_SCORES = _base() + [
    S("model_id", "STRING", "NULLABLE"),
    S("score_type", "STRING", "NULLABLE"),
    S("score_value", "FLOAT64", "NULLABLE"),
    S("score_label", "STRING", "NULLABLE"),
    S("feature_importance", "JSON", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

MODEL_VALIDATION_METRICS = _base() + [
    S("model_id", "STRING", "NULLABLE"),
    S("model_version", "STRING", "NULLABLE"),
    S("metric_name", "STRING", "NULLABLE"),
    S("metric_value", "FLOAT64", "NULLABLE"),
    S("validation_period_start", "DATE", "NULLABLE"),
    S("validation_period_end", "DATE", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

BENCHMARK_COMPARISONS = _base() + [
    S("model_id", "STRING", "NULLABLE"),
    S("benchmark_id", "STRING", "NULLABLE"),
    S("comparison_metric", "STRING", "NULLABLE"),
    S("model_value", "FLOAT64", "NULLABLE"),
    S("benchmark_value", "FLOAT64", "NULLABLE"),
    S("difference", "FLOAT64", "NULLABLE"),
    S("updated_at", "TIMESTAMP", "NULLABLE"),
]

MODEL_RUNS = [
    S("run_id", "STRING", "REQUIRED"),
    S("pipeline_name", "STRING", "NULLABLE"),
    S("status", "STRING", "NULLABLE"),
    S("started_at", "TIMESTAMP", "REQUIRED"),
    S("completed_at", "TIMESTAMP", "NULLABLE"),
    S("duration_seconds", "FLOAT64", "NULLABLE"),
    S("records_ingested", "INT64", "NULLABLE"),
    S("records_processed", "INT64", "NULLABLE"),
    S("artifacts_generated", "INT64", "NULLABLE"),
    S("error_count", "INT64", "NULLABLE"),
    S("error_message", "STRING", "NULLABLE"),
    S("metadata", "JSON", "NULLABLE"),
    S("created_at", "TIMESTAMP", "REQUIRED"),
]
