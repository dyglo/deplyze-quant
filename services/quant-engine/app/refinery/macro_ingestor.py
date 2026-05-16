"""
Macro refinery — FRED + Treasury yields → warehouse.

Writes two layers per ingest run:
  raw_public.public_macro_raw  (one row per observation, full fidelity)
  cleaned.macro_cleaned        (deduplicated, with yoy/mom changes pre-computed)

Wave G (macro regime intelligence) reads from `cleaned.macro_cleaned`. This
keeps the regime engine cheap to run — no recomputation of YoY/MoM in BigQuery.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.connectors.fred import FredClient, FredError, DEFAULT_SERIES

log = structlog.get_logger("quant_engine.refinery.macro_ingestor")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dedup_hash(series_id: str, obs_date: str) -> str:
    return hashlib.sha256(f"fred|{series_id}|{obs_date}".encode()).hexdigest()[:32]


def _serialize_for_bq(rows: List[dict]) -> List[dict]:
    out = []
    for row in rows:
        r = dict(row)
        for k, v in list(r.items()):
            if isinstance(v, (dict, list)):
                r[k] = json.dumps(v)
        out.append(r)
    return out


def _compute_changes(values_by_date: Dict[str, Optional[float]]) -> Dict[str, Dict[str, Optional[float]]]:
    """
    For each (sorted) date, compute YoY (~365d) and MoM (~30d) change vs the
    closest prior observation. Returns {date: {"yoy": ..., "mom": ...}}.

    Approximate windowing is fine: macro series have irregular cadence (daily
    DGS vs monthly CPI) and downstream consumers care about *relative* state.
    """
    dates = sorted(values_by_date.keys())
    parsed = [datetime.fromisoformat(d).date() for d in dates]
    out: Dict[str, Dict[str, Optional[float]]] = {}
    for i, d in enumerate(dates):
        cur = values_by_date[d]
        if cur is None:
            out[d] = {"yoy": None, "mom": None}
            continue
        # find prior obs >= 30d back, >= 335d back (for YoY tolerance)
        target_mom = parsed[i] - timedelta(days=30)
        target_yoy = parsed[i] - timedelta(days=365)
        mom_val = yoy_val = None
        for j in range(i - 1, -1, -1):
            pdate = parsed[j]
            pval = values_by_date[dates[j]]
            if pval is None:
                continue
            if mom_val is None and pdate <= target_mom:
                mom_val = (cur - pval) / pval if pval else None
            if yoy_val is None and pdate <= target_yoy:
                yoy_val = (cur - pval) / pval if pval else None
            if mom_val is not None and yoy_val is not None:
                break
        out[d] = {"yoy": yoy_val, "mom": mom_val}
    return out


async def ingest_fred_macro(
    run_id: str,
    series_ids: Optional[List[str]] = None,
    since_date: Optional[str] = None,
    days_back: int = 1825,  # 5y default — institutional macro context window
) -> dict:
    """
    Pull FRED series (Treasury yields + macro state) and write raw + cleaned
    layers in one pass.
    """
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    if not since_date:
        since_date = (datetime.now(timezone.utc).date() - timedelta(days=days_back)).isoformat()
    chosen = series_ids or list(DEFAULT_SERIES.keys())

    summary = {
        "run_id": run_id,
        "pipeline_name": "fred_macro_ingest",
        "status": "running",
        "started_at": _now_iso(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
        "raw_written": 0,
        "cleaned_written": 0,
        "series_count": len(chosen),
        "since_date": since_date,
    }
    _runs[run_id] = summary

    try:
        client = FredClient()
    except FredError as e:
        summary["status"] = "failed"
        summary["completed_at"] = _now_iso()
        summary["errors"].append({"stage": "client_init", "error": str(e)})
        log.error("macro.client_init_failed", error=str(e))
        return summary

    bq = get_bigquery_client()
    raw_table = fully_qualified(settings.BQ_DATASET_RAW_PUBLIC, "public_macro_raw")
    cleaned_table = fully_qualified(settings.BQ_DATASET_CLEANED, "macro_cleaned")

    # Group observations by series so we can compute YoY/MoM in one pass.
    by_series: Dict[str, List[dict]] = {sid: [] for sid in chosen}

    for sid in chosen:
        try:
            async for rec in client.iter_observations(sid, since_date=since_date):
                by_series[sid].append(rec)
        except Exception as e:
            log.error("macro.series_failed", series_id=sid, error=str(e))
            summary["errors"].append({"series_id": sid, "error": str(e)})

    raw_rows: List[dict] = []
    cleaned_rows: List[dict] = []
    now_iso = _now_iso()

    for sid, observations in by_series.items():
        if not observations:
            continue
        raw_rows.extend(observations)

        # Build cleaned layer with YoY/MoM
        values_by_date: Dict[str, Optional[float]] = {}
        for obs in observations:
            d = obs.get("raw_payload", {}).get("date") if isinstance(obs.get("raw_payload"), dict) else None
            if not d and obs.get("observation_time"):
                d = obs["observation_time"][:10]
            if d:
                values_by_date[d] = obs.get("value")

        changes = _compute_changes(values_by_date)

        for obs in observations:
            raw = obs.get("raw_payload") or {}
            d = raw.get("date") if isinstance(raw, dict) else None
            if not d and obs.get("observation_time"):
                d = obs["observation_time"][:10]
            ch = changes.get(d or "", {"yoy": None, "mom": None})

            cleaned_rows.append({
                "id": str(uuid.uuid4()),
                "symbol": None,
                "asset_type": "macro",
                "provider": "fred",
                "source_url": obs.get("source_url"),
                "source_type": "macro_series",
                "ingestion_time": now_iso,
                "observation_time": obs.get("observation_time"),
                "lineage_id": obs.get("lineage_id"),
                "confidence": 1.0,
                "data_quality_score": 1.0 if obs.get("value") is not None else 0.5,
                "created_at": now_iso,
                "series_id": sid,
                "series_name": obs.get("series_name"),
                "frequency": obs.get("frequency"),
                "units": obs.get("units"),
                "value": obs.get("value"),
                "vintage_date": obs.get("vintage_date"),
                "yoy_change": ch["yoy"],
                "mom_change": ch["mom"],
                "dedup_hash": _dedup_hash(sid, d or ""),
                "updated_at": now_iso,
            })

    def _batched(rows: List[dict], size: int = 500):
        for i in range(0, len(rows), size):
            yield rows[i : i + size]

    for batch in _batched(_serialize_for_bq(raw_rows)):
        errors = bq.insert_rows_json(raw_table, batch)
        if errors:
            log.error("macro.bq_raw_errors", errors=errors[:3])
            summary["errors"].append({"table": raw_table, "errors": errors[:3]})
        else:
            summary["raw_written"] += len(batch)

    for batch in _batched(_serialize_for_bq(cleaned_rows)):
        errors = bq.insert_rows_json(cleaned_table, batch)
        if errors:
            log.error("macro.bq_cleaned_errors", errors=errors[:3])
            summary["errors"].append({"table": cleaned_table, "errors": errors[:3]})
        else:
            summary["cleaned_written"] += len(batch)

    summary["records_processed"] = summary["raw_written"] + summary["cleaned_written"]
    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _now_iso()
    log.info(
        "macro.complete",
        run_id=run_id,
        series=summary["series_count"],
        raw=summary["raw_written"],
        cleaned=summary["cleaned_written"],
        errors=len(summary["errors"]),
    )
    return summary
