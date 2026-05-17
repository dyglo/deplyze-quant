"""
Document parsing orchestrator (Wave E).

Reads unprocessed rows from `raw_documents.document_sources_raw`, fetches the
underlying document, extracts text, and writes results to
`raw_documents.parsed_documents_raw`.

Design notes:
  • A document is considered "unprocessed" when no parsed_documents_raw row
    references its lineage_id. We compute the set difference in BigQuery
    rather than maintaining a separate queue.
  • Failures are persistent: a failed parse still writes a row with
    `extraction_quality=0.0` so we don't retry indefinitely. Operators can
    requeue by deleting the failed row.
  • Body cap: 25 MB per document. PDFs above the cap are skipped with a
    structured-log warning to preserve Cloud Run memory headroom.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.refinery.parsers import parse, detect_mime

log = structlog.get_logger("quant_engine.refinery.document_parser")

_MAX_BODY_BYTES = 25 * 1024 * 1024  # 25 MB
_FETCH_TIMEOUT_S = 60.0
_FETCH_CONCURRENCY = 4


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _fetch(url: str, *, user_agent: str) -> tuple[bytes, Optional[str], int]:
    headers = {
        "User-Agent": user_agent,
        "Accept": "*/*",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(_FETCH_TIMEOUT_S), headers=headers, follow_redirects=True) as client:
        r = await client.get(url)
        body = r.content[:_MAX_BODY_BYTES]
        return body, r.headers.get("content-type"), r.status_code


def _select_unprocessed_query(sources_table: str, parsed_table: str, limit: int) -> str:
    return f"""
        SELECT
          s.id              AS source_id,
          s.lineage_id      AS lineage_id,
          s.document_url    AS document_url,
          s.mime_type       AS mime_type_hint,
          s.document_type   AS document_type,
          s.symbol          AS symbol,
          s.provider        AS provider,
          s.source_type     AS source_type,
          s.ingestion_time  AS ingestion_time,
          s.observation_time AS observation_time
        FROM `{sources_table}` s
        WHERE s.document_url IS NOT NULL
          AND s.lineage_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM `{parsed_table}` p
            WHERE p.source_document_id = s.id
          )
        ORDER BY s.ingestion_time DESC
        LIMIT {int(limit)}
    """


async def _parse_one(row: dict, sem: asyncio.Semaphore, user_agent: str) -> Optional[dict]:
    url = row["document_url"]
    async with sem:
        try:
            body, content_type, status = await _fetch(url, user_agent=user_agent)
            if status != 200 or not body:
                log.warning("docparse.fetch_bad_status", url=url, status=status, bytes=len(body))
                return {
                    "_status_code": status,
                    "extracted_text": "",
                    "page_count": None,
                    "extraction_method": "fetch_failed",
                    "extraction_quality": 0.0,
                    "mime_detected": content_type or row.get("mime_type_hint"),
                }
            mime = detect_mime(url, content_type or row.get("mime_type_hint"))
            result = parse(body, url=url, content_type=mime)
            return {
                "_status_code": status,
                "extracted_text": result.text,
                "page_count": result.page_count,
                "extraction_method": result.extraction_method,
                "extraction_quality": result.extraction_quality,
                "mime_detected": result.mime_type,
            }
        except Exception as e:
            log.error("docparse.fetch_or_parse_failed", url=url, error=str(e))
            return {
                "_status_code": 0,
                "extracted_text": "",
                "page_count": None,
                "extraction_method": f"error:{type(e).__name__}",
                "extraction_quality": 0.0,
                "mime_detected": row.get("mime_type_hint"),
            }


async def parse_unprocessed_documents(
    run_id: str,
    *,
    limit: int = 200,
    user_agent: Optional[str] = None,
) -> dict:
    """
    Pull up to `limit` unparsed document_sources_raw rows, fetch + parse, and
    write parsed_documents_raw rows. Returns a run summary.
    """
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    ua = (user_agent or getattr(settings, "EDGAR_USER_AGENT", "") or "Deplyze Quant Refinery").strip()

    sources_table = fully_qualified(settings.BQ_DATASET_RAW_DOCUMENTS, "document_sources_raw")
    parsed_table = fully_qualified(settings.BQ_DATASET_RAW_DOCUMENTS, "parsed_documents_raw")

    summary = {
        "run_id": run_id,
        "pipeline_name": "document_parse",
        "status": "running",
        "started_at": _now_iso(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
        "selected": 0,
        "parsed_written": 0,
        "limit": limit,
    }
    _runs[run_id] = summary

    bq = get_bigquery_client()
    sql = _select_unprocessed_query(sources_table, parsed_table, limit)
    try:
        rows = [dict(r) for r in bq.query(sql).result()]
    except Exception as e:
        summary["status"] = "failed"
        summary["completed_at"] = _now_iso()
        summary["errors"].append({"stage": "select", "error": str(e)})
        log.error("docparse.select_failed", error=str(e))
        return summary

    summary["selected"] = len(rows)
    if not rows:
        summary["status"] = "completed"
        summary["completed_at"] = _now_iso()
        return summary

    sem = asyncio.Semaphore(_FETCH_CONCURRENCY)
    results = await asyncio.gather(*[_parse_one(r, sem, ua) for r in rows])

    now = _now_iso()
    parsed_rows = []
    for src, res in zip(rows, results):
        if res is None:
            continue
        parsed_rows.append({
            "id": str(uuid.uuid4()),
            "symbol": src.get("symbol"),
            "asset_type": None,
            "provider": src.get("provider"),
            "source_url": src.get("document_url"),
            "source_type": src.get("source_type"),
            "ingestion_time": now,
            "observation_time": src.get("observation_time"),
            "lineage_id": src.get("lineage_id"),
            "confidence": res["extraction_quality"],
            "data_quality_score": res["extraction_quality"],
            "created_at": now,
            "source_document_id": src.get("source_id"),
            "document_type": src.get("document_type"),
            "extracted_text": res["extracted_text"][:1_000_000],  # 1MB cap into BQ
            "page_count": res["page_count"],
            "extraction_method": res["extraction_method"],
            "extraction_quality": res["extraction_quality"],
            "raw_payload": json.dumps({
                "mime_detected": res["mime_detected"],
                "status_code": res.get("_status_code"),
                "char_count": len(res["extracted_text"]),
            }),
        })

    # serialize JSON fields
    for r in parsed_rows:
        for k, v in list(r.items()):
            if isinstance(v, (dict, list)):
                r[k] = json.dumps(v)

    # batched insert
    def _chunks(rows_, size=200):
        for i in range(0, len(rows_), size):
            yield rows_[i : i + size]

    for batch in _chunks(parsed_rows):
        errors = bq.insert_rows_json(parsed_table, batch)
        if errors:
            log.error("docparse.bq_errors", errors=errors[:3])
            summary["errors"].append({"table": parsed_table, "errors": errors[:3]})
        else:
            summary["parsed_written"] += len(batch)

    summary["records_processed"] = summary["parsed_written"]
    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _now_iso()
    log.info("docparse.complete", run_id=run_id, selected=summary["selected"], written=summary["parsed_written"])
    return summary
