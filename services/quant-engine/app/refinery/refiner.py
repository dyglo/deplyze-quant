"""
Data refiner — reads raw_api tables, normalizes, deduplicates,
and writes to cleaned dataset. Raw data is never modified.
"""

import uuid
import json
import hashlib
import structlog
from datetime import datetime, timezone
from typing import List

import pandas as pd

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.quality.scorer import compute_dedup_hash, enrich_record, score_ohlcv_record

log = structlog.get_logger("quant_engine.refinery.refiner")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _query_raw_ohlcv(client, symbol: str, days_back: int = 90) -> pd.DataFrame:
    query = f"""
        SELECT *
        FROM `{fully_qualified(settings.BQ_DATASET_RAW_API, 'ohlcv_raw')}`
        WHERE symbol = @symbol
          AND ingestion_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days_back} DAY)
        ORDER BY observation_time ASC
    """
    job_config = __import__("google.cloud.bigquery", fromlist=["QueryJobConfig"]).QueryJobConfig(
        query_parameters=[
            __import__("google.cloud.bigquery", fromlist=["ScalarQueryParameter"]).ScalarQueryParameter(
                "symbol", "STRING", symbol
            )
        ]
    )
    return client.query(query, job_config=job_config).to_dataframe()


def _normalize_ohlcv_row(row: pd.Series) -> dict:
    """Normalize a raw OHLCV row to the cleaned schema."""
    dedup_key = compute_dedup_hash(
        {"symbol": row.get("symbol"), "observation_time": str(row.get("observation_time")), "provider": row.get("provider")},
        ["symbol", "observation_time", "provider"],
    )
    rec = {
        "id": str(uuid.uuid4()),
        "symbol": row.get("symbol"),
        "asset_type": row.get("asset_type", "equity"),
        "provider": row.get("provider"),
        "source_type": row.get("source_type", "api"),
        "observation_time": str(row.get("observation_time")),
        "ingestion_time": _now_iso(),
        "open": float(row["open"]) if pd.notna(row.get("open")) else None,
        "high": float(row["high"]) if pd.notna(row.get("high")) else None,
        "low": float(row["low"]) if pd.notna(row.get("low")) else None,
        "close": float(row["close"]) if pd.notna(row.get("close")) else None,
        "volume": float(row["volume"]) if pd.notna(row.get("volume")) else None,
        "adjusted_close": float(row.get("adjusted_close") or row.get("close", 0)),
        "timeframe": row.get("timeframe", "1day"),
        "is_adjusted": True,
        "dedup_hash": dedup_key,
        "lineage_id": row.get("lineage_id"),
        "confidence": row.get("data_quality_score", 1.0),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    enrich_record(rec, score_ohlcv_record)
    
    # SLA Outlier Check: If z-score is > 5.0, dock the quality score
    z_score = row.get("z_score", 0.0)
    if pd.notna(z_score) and z_score > 5.0:
        rec["data_quality_score"] = max(0.0, round(rec["data_quality_score"] - 0.5, 4))
        # Add metadata anomaly tag
        rec["metadata"] = json.dumps({
            "outlier_detected": True,
            "z_score": float(z_score),
            "rolling_mean": float(row.get("rolling_mean", 0.0)),
            "rolling_std": float(row.get("rolling_std", 0.0))
        })
    return rec


def _write_cleaned(table_fqn: str, rows: List[dict]) -> int:
    if not rows:
        return 0
    client = get_bigquery_client()
    clean_rows = []
    for r in rows:
        cr = dict(r)
        for k, v in cr.items():
            if isinstance(v, (dict, list)):
                cr[k] = json.dumps(v)
        clean_rows.append(cr)
    hashes = [r.get("dedup_hash") for r in clean_rows if r.get("dedup_hash")]
    if hashes:
        bq = __import__("google.cloud.bigquery", fromlist=["QueryJobConfig", "ArrayQueryParameter"])
        existing_query = f"""
            SELECT dedup_hash
            FROM `{table_fqn}`
            WHERE dedup_hash IN UNNEST(@hashes)
        """
        job_config = bq.QueryJobConfig(
            query_parameters=[bq.ArrayQueryParameter("hashes", "STRING", hashes)]
        )
        existing = {row["dedup_hash"] for row in client.query(existing_query, job_config=job_config).result()}
        clean_rows = [r for r in clean_rows if r.get("dedup_hash") not in existing]
        if not clean_rows:
            return 0
    errors = client.insert_rows_json(table_fqn, clean_rows)
    if errors:
        log.error("bq.cleaned_insert_errors", table=table_fqn, errors=errors[:3])
    return len(rows) - len(errors)


async def run_refine(run_id: str, symbols: List[str]) -> None:
    """Background task: normalize raw OHLCV into cleaned.ohlcv_cleaned."""
    from app.api.pipelines import _runs
    if run_id not in _runs:
        _runs[run_id] = {
            "run_id": run_id,
            "pipeline_name": "refine",
            "status": "running",
            "started_at": _now_iso(),
            "completed_at": None,
            "records_processed": 0,
            "artifacts_generated": 0,
            "errors": [],
        }
    else:
        _runs[run_id]["status"] = "running"
    log.info("refine.start", run_id=run_id, symbols=symbols)

    client = get_bigquery_client()
    cleaned_table = fully_qualified(settings.BQ_DATASET_CLEANED, "ohlcv_cleaned")
    total = 0
    errors = []

    for symbol in symbols:
        try:
            df = _query_raw_ohlcv(client, symbol)
            if df.empty:
                log.info("refine.no_raw_data", symbol=symbol)
                continue
            
            # Compute rolling 20-day statistics for outlier detection
            df = df.sort_values("observation_time")
            df['rolling_mean'] = df['close'].rolling(window=20, min_periods=1).mean()
            df['rolling_std'] = df['close'].rolling(window=20, min_periods=1).std().fillna(0)
            df['z_score'] = 0.0
            
            non_zero_std = df['rolling_std'] > 0
            df.loc[non_zero_std, 'z_score'] = abs(df.loc[non_zero_std, 'close'] - df.loc[non_zero_std, 'rolling_mean']) / df.loc[non_zero_std, 'rolling_std']

            rows = [_normalize_ohlcv_row(row) for _, row in df.iterrows()]
            written = _write_cleaned(cleaned_table, rows)
            total += written
            log.info("refine.symbol_done", symbol=symbol, rows=written)
        except Exception as e:
            log.error("refine.symbol_failed", symbol=symbol, error=str(e))
            errors.append({"symbol": symbol, "error": str(e)})

    _runs[run_id].update({
        "status": "completed" if not errors else "completed_with_errors",
        "completed_at": _now_iso(),
        "records_processed": total,
        "errors": errors,
    })
    log.info("refine.complete", run_id=run_id, total=total)
