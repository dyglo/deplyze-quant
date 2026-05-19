"""
Warehouse Janitor (Active CDC Deduplication Reconciler).
Runs optimized BigQuery clean-up queries to prune duplicate records
across all critical cleaned tables using the dedup_hash.
"""

import structlog
from datetime import datetime, timezone
from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified

log = structlog.get_logger("quant_engine.refinery.reconciler")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def reconcile_table_duplicates(table_fqn: str) -> int:
    """
    Executes a CDC merge/deduplication statement in BigQuery.
    Deletes older redundant rows with identical dedup_hash.
    Returns the number of rows pruned.
    """
    client = get_bigquery_client()
    
    # We first select total count before clean-up
    count_sql = f"SELECT COUNT(*) as cnt FROM `{table_fqn}`"
    try:
        before_cnt = list(client.query(count_sql).result())[0].cnt
    except Exception as e:
        log.error("reconciler.count_failed", table=table_fqn, error=str(e))
        return 0

    # Execute deduplication query
    dedup_sql = f"""
        DELETE FROM `{table_fqn}`
        WHERE dedup_hash IS NOT NULL
          AND id NOT IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER(PARTITION BY dedup_hash ORDER BY created_at DESC, ingestion_time DESC) as rn
              FROM `{table_fqn}`
              WHERE dedup_hash IS NOT NULL
            ) WHERE rn = 1
          )
    """
    try:
        query_job = client.query(dedup_sql)
        query_job.result()  # Wait for completion
        
        # Select total count after clean-up
        after_cnt = list(client.query(count_sql).result())[0].cnt
        pruned = before_cnt - after_cnt
        log.info("reconciler.prune_success", table=table_fqn, before=before_cnt, after=after_cnt, pruned=pruned)
        return pruned
    except Exception as e:
        log.error("reconciler.query_failed", table=table_fqn, error=str(e))
        return 0


async def run_reconcile(run_id: str) -> dict:
    """
    Runs the Warehouse Janitor deduplication pipeline across all cleaned datasets.
    """
    from app.api.pipelines import _runs
    summary = {
        "run_id": run_id,
        "pipeline_name": "warehouse_reconcile",
        "status": "running",
        "started_at": _now_iso(),
        "completed_at": None,
        "records_processed": 0,
        "errors": [],
    }
    _runs[run_id] = summary
    log.info("reconciler.start", run_id=run_id)

    cleaned_tables = [
        "ohlcv_cleaned",
        "fundamentals_cleaned",
        "earnings_cleaned",
        "macro_cleaned",
        "news_cleaned",
        "filings_cleaned",
        "narrative_cleaned"
    ]
    
    total_pruned = 0
    errors = []
    
    for table_name in cleaned_tables:
        table_fqn = fully_qualified(settings.BQ_DATASET_CLEANED, table_name)
        try:
            pruned = reconcile_table_duplicates(table_fqn)
            total_pruned += pruned
        except Exception as e:
            log.error("reconciler.table_failed", table=table_name, error=str(e))
            errors.append({"table": table_name, "error": str(e)})

    summary.update({
        "status": "completed" if not errors else "completed_with_errors",
        "completed_at": _now_iso(),
        "records_processed": total_pruned,
        "errors": errors,
    })
    log.info("reconciler.complete", run_id=run_id, total_pruned=total_pruned)
    return summary
