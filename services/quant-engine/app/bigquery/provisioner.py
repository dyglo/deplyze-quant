"""
Idempotent BigQuery table provisioner.
Creates tables if they don't exist. Never overwrites existing tables.
"""

import structlog
from google.cloud import bigquery
from google.api_core.exceptions import Conflict

from app.core.config import settings
from app.bigquery.client import get_bigquery_client
from app.bigquery import schemas as S

log = structlog.get_logger("quant_engine.bigquery.provisioner")

# Registry: (dataset, table_name) -> schema, partition_field, cluster_fields
TABLE_REGISTRY = [
    # raw_api
    (settings.BQ_DATASET_RAW_API, "market_quotes_raw", S.MARKET_QUOTES_RAW, "ingestion_time", ["symbol", "provider"]),
    (settings.BQ_DATASET_RAW_API, "ohlcv_raw", S.OHLCV_RAW, "ingestion_time", ["symbol", "provider", "asset_type"]),
    (settings.BQ_DATASET_RAW_API, "fundamentals_raw", S.FUNDAMENTALS_RAW, "ingestion_time", ["symbol", "provider"]),
    (settings.BQ_DATASET_RAW_API, "earnings_raw", S.EARNINGS_RAW, "ingestion_time", ["symbol", "provider"]),
    (settings.BQ_DATASET_RAW_API, "news_raw", S.NEWS_RAW, "ingestion_time", ["symbol", "provider"]),
    (settings.BQ_DATASET_RAW_API, "provider_responses_raw", S.PROVIDER_RESPONSES_RAW, "ingestion_time", ["provider"]),
    # raw_public
    (settings.BQ_DATASET_RAW_PUBLIC, "public_macro_raw", S.PUBLIC_MACRO_RAW, "ingestion_time", ["source_type"]),
    (settings.BQ_DATASET_RAW_PUBLIC, "public_filings_raw", S.PUBLIC_FILINGS_RAW, "ingestion_time", ["symbol"]),
    (settings.BQ_DATASET_RAW_PUBLIC, "public_calendar_raw", S.PUBLIC_CALENDAR_RAW, "ingestion_time", ["source_type"]),
    (settings.BQ_DATASET_RAW_PUBLIC, "public_reports_raw", S.PUBLIC_REPORTS_RAW, "ingestion_time", ["source_type"]),
    (settings.BQ_DATASET_RAW_PUBLIC, "public_rss_raw", S.PUBLIC_RSS_RAW, "ingestion_time", ["source_type"]),
    # raw_documents
    (settings.BQ_DATASET_RAW_DOCUMENTS, "document_sources_raw", S.DOCUMENT_SOURCES_RAW, "ingestion_time", ["source_type"]),
    (settings.BQ_DATASET_RAW_DOCUMENTS, "parsed_documents_raw", S.PARSED_DOCUMENTS_RAW, "ingestion_time", ["source_type"]),
    # cleaned
    (settings.BQ_DATASET_CLEANED, "instruments", S.INSTRUMENTS, None, ["symbol", "asset_type"]),
    (settings.BQ_DATASET_CLEANED, "ohlcv_cleaned", S.OHLCV_CLEANED, "observation_time", ["symbol", "provider"]),
    (settings.BQ_DATASET_CLEANED, "fundamentals_cleaned", S.FUNDAMENTALS_CLEANED, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_CLEANED, "earnings_cleaned", S.EARNINGS_CLEANED, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_CLEANED, "macro_cleaned", S.MACRO_CLEANED, "observation_time", ["source_type"]),
    (settings.BQ_DATASET_CLEANED, "news_cleaned", S.NEWS_CLEANED, "ingestion_time", ["symbol"]),
    # features
    (settings.BQ_DATASET_FEATURES, "returns_features", S.RETURNS_FEATURES, "observation_time", ["symbol", "asset_type"]),
    (settings.BQ_DATASET_FEATURES, "volatility_features", S.VOLATILITY_FEATURES, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_FEATURES, "correlation_features", S.CORRELATION_FEATURES, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_FEATURES, "regime_features", S.REGIME_FEATURES, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_FEATURES, "momentum_features", S.MOMENTUM_FEATURES, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_FEATURES, "anomaly_features", S.ANOMALY_FEATURES, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_FEATURES, "benchmark_features", S.BENCHMARK_FEATURES, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_FEATURES, "relationship_features", S.RELATIONSHIP_FEATURES, "observation_time", ["symbol"]),
    # research
    (settings.BQ_DATASET_RESEARCH, "research_observations", S.RESEARCH_OBSERVATIONS, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_RESEARCH, "intelligence_timeline", S.INTELLIGENCE_TIMELINE, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_RESEARCH, "generated_briefings", S.GENERATED_BRIEFINGS, "observation_time", None),
    (settings.BQ_DATASET_RESEARCH, "copilot_context", S.COPILOT_CONTEXT, "observation_time", None),
    # artifacts
    (settings.BQ_DATASET_ARTIFACTS, "research_artifacts", S.RESEARCH_ARTIFACTS, "created_at", ["symbol", "artifact_type"]),
    (settings.BQ_DATASET_ARTIFACTS, "anomaly_artifacts", S.ANOMALY_ARTIFACTS, "created_at", ["symbol"]),
    (settings.BQ_DATASET_ARTIFACTS, "regime_artifacts", S.REGIME_ARTIFACTS, "created_at", ["symbol"]),
    (settings.BQ_DATASET_ARTIFACTS, "correlation_artifacts", S.CORRELATION_ARTIFACTS, "created_at", ["symbol"]),
    (settings.BQ_DATASET_ARTIFACTS, "volatility_artifacts", S.VOLATILITY_ARTIFACTS, "created_at", ["symbol"]),
    (settings.BQ_DATASET_ARTIFACTS, "historical_analog_artifacts", S.HISTORICAL_ANALOG_ARTIFACTS, "created_at", ["symbol"]),
    (settings.BQ_DATASET_ARTIFACTS, "relationship_artifacts", S.RELATIONSHIP_ARTIFACTS, "created_at", ["symbol"]),
    # model_outputs
    (settings.BQ_DATASET_MODEL_OUTPUTS, "model_predictions", S.MODEL_PREDICTIONS, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_MODEL_OUTPUTS, "confidence_scores", S.CONFIDENCE_SCORES, "observation_time", ["symbol"]),
    (settings.BQ_DATASET_MODEL_OUTPUTS, "model_validation_metrics", S.MODEL_VALIDATION_METRICS, "observation_time", None),
    (settings.BQ_DATASET_MODEL_OUTPUTS, "benchmark_comparisons", S.BENCHMARK_COMPARISONS, "observation_time", None),
    (settings.BQ_DATASET_MODEL_OUTPUTS, "model_runs", S.MODEL_RUNS, "started_at", None),
]


def _create_table(
    client: bigquery.Client,
    dataset_id: str,
    table_id: str,
    schema: list,
    partition_field: str | None,
    cluster_fields: list | None,
) -> dict:
    """Create one table idempotently. Returns status dict."""
    fqt = f"{settings.GCP_PROJECT_ID}.{dataset_id}.{table_id}"
    table = bigquery.Table(fqt, schema=schema)

    if partition_field:
        table.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.DAY,
            field=partition_field,
        )

    if cluster_fields:
        # Limit to 4 cluster fields (BQ max)
        table.clustering_fields = cluster_fields[:4]

    try:
        client.create_table(table, exists_ok=False)
        log.info("table.created", table=fqt)
        return {"table": fqt, "status": "created"}
    except Conflict:
        log.debug("table.already_exists", table=fqt)
        return {"table": fqt, "status": "exists"}
    except Exception as e:
        log.error("table.create_failed", table=fqt, error=str(e))
        return {"table": fqt, "status": "error", "error": str(e)}


def provision_all_tables() -> dict:
    """
    Idempotently create all V3 tables. Safe to call multiple times.
    Returns summary of created / existing / errored tables.
    """
    client = get_bigquery_client()
    results = {"created": [], "exists": [], "errors": []}

    for dataset_id, table_id, schema, partition_field, cluster_fields in TABLE_REGISTRY:
        r = _create_table(client, dataset_id, table_id, schema, partition_field, cluster_fields)
        if r["status"] == "created":
            results["created"].append(r["table"])
        elif r["status"] == "exists":
            results["exists"].append(r["table"])
        else:
            results["errors"].append(r)

    log.info(
        "provisioner.complete",
        created=len(results["created"]),
        already_existed=len(results["exists"]),
        errors=len(results["errors"]),
    )
    return results


def list_table_status() -> list:
    """Return existence status for every table in the registry."""
    client = get_bigquery_client()
    statuses = []
    for dataset_id, table_id, _, _, _ in TABLE_REGISTRY:
        fqt = f"{settings.GCP_PROJECT_ID}.{dataset_id}.{table_id}"
        try:
            client.get_table(fqt)
            statuses.append({"table": fqt, "exists": True})
        except Exception:
            statuses.append({"table": fqt, "exists": False})
    return statuses
