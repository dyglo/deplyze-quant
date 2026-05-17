"""
Multi-source public refinery orchestrators (Wave D).

Three ingestors:
  • ingest_cot_reports()    → raw_public.public_reports_raw  (CFTC COT)
  • ingest_rss_feeds()      → raw_public.public_rss_raw
  • ingest_release_calendar()→ raw_public.public_calendar_raw

Each shares the same lineage-tagged write path: deduplicate by lineage_id
within the run, batch into BigQuery via insert_rows_json, return a summary
dict suitable for the in-memory _runs registry.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional, Iterable

import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified

log = structlog.get_logger("quant_engine.refinery.public_ingestors")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_for_bq(rows: List[dict]) -> List[dict]:
    out = []
    for row in rows:
        r = dict(row)
        for k, v in list(r.items()):
            if isinstance(v, (dict, list)):
                r[k] = json.dumps(v)
        out.append(r)
    return out


def _batched(rows: List[dict], size: int = 500):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def _new_summary(run_id: str, pipeline: str, **extra) -> dict:
    return {
        "run_id": run_id,
        "pipeline_name": pipeline,
        "status": "running",
        "started_at": _now_iso(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
        "written": 0,
        **extra,
    }


def _runs_registry() -> dict:
    try:
        from app.api.pipelines import _runs
        return _runs
    except Exception:
        return {}


async def _drain(
    *,
    run_id: str,
    pipeline_name: str,
    table_fqn: str,
    source_iter,
    extra: Optional[dict] = None,
) -> dict:
    """Common pattern: stream records, dedup by lineage_id, batch-write."""
    summary = _new_summary(run_id, pipeline_name, **(extra or {}))
    _runs_registry()[run_id] = summary

    bq = get_bigquery_client()
    seen: set[str] = set()
    rows: List[dict] = []

    try:
        async for rec in source_iter:
            lid = rec.get("lineage_id")
            if not lid or lid in seen:
                continue
            seen.add(lid)
            # ensure created_at present for the schema's REQUIRED field
            rec.setdefault("created_at", rec.get("ingestion_time") or _now_iso())
            rec.setdefault("data_quality_score", 1.0)
            rows.append(rec)
    except Exception as e:
        log.error(f"{pipeline_name}.iter_failed", error=str(e))
        summary["errors"].append({"stage": "iter", "error": str(e)})

    for batch in _batched(_serialize_for_bq(rows)):
        errors = bq.insert_rows_json(table_fqn, batch)
        if errors:
            log.error(f"{pipeline_name}.bq_errors", errors=errors[:3])
            summary["errors"].append({"table": table_fqn, "errors": errors[:3]})
        else:
            summary["written"] += len(batch)

    summary["records_processed"] = summary["written"]
    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _now_iso()
    log.info(f"{pipeline_name}.complete", run_id=run_id, written=summary["written"], errors=len(summary["errors"]))
    return summary


async def ingest_cot_reports(
    run_id: str,
    markets: Optional[List[str]] = None,
    since_date: Optional[str] = None,
) -> dict:
    from app.connectors.cot import CotClient

    client = CotClient()
    table = fully_qualified(settings.BQ_DATASET_RAW_PUBLIC, "public_reports_raw")
    return await _drain(
        run_id=run_id,
        pipeline_name="cot_ingest",
        table_fqn=table,
        source_iter=client.iter_reports(markets=markets, since_date=since_date),
        extra={"markets": len(markets) if markets else "default", "since_date": since_date},
    )


async def ingest_rss_feeds(
    run_id: str,
    feeds: Optional[List[tuple[str, str]]] = None,
) -> dict:
    from app.connectors.rss import RssClient

    client = RssClient()
    table = fully_qualified(settings.BQ_DATASET_RAW_PUBLIC, "public_rss_raw")
    return await _drain(
        run_id=run_id,
        pipeline_name="rss_ingest",
        table_fqn=table,
        source_iter=client.iter_feeds(feeds=feeds),
        extra={"feed_count": len(feeds) if feeds else "default"},
    )


async def ingest_release_calendar(
    run_id: str,
    releases: Optional[List[int]] = None,
    since_date: Optional[str] = None,
    days_ahead: int = 120,
) -> dict:
    from app.connectors.calendar import CalendarClient

    try:
        client = CalendarClient()
    except Exception as e:
        # Surface a clean failure rather than blowing up the background task.
        summary = _new_summary(run_id, "calendar_ingest", days_ahead=days_ahead)
        summary["status"] = "failed"
        summary["completed_at"] = _now_iso()
        summary["errors"].append({"stage": "client_init", "error": str(e)})
        _runs_registry()[run_id] = summary
        return summary

    table = fully_qualified(settings.BQ_DATASET_RAW_PUBLIC, "public_calendar_raw")
    return await _drain(
        run_id=run_id,
        pipeline_name="calendar_ingest",
        table_fqn=table,
        source_iter=client.iter_release_dates(
            releases=releases, since_date=since_date, days_ahead=days_ahead
        ),
        extra={"release_count": len(releases) if releases else "default", "days_ahead": days_ahead},
    )
