"""
Filings refinery — orchestrates SEC EDGAR ingestion into the warehouse.

Pipeline shape:
  ticker/CIK list  →  EdgarClient.iter_recent_filings()
                         │
                         ├─► raw_public.public_filings_raw     (one row / filing)
                         └─► raw_documents.document_sources_raw (one row / primary doc)

Both writes are idempotent at the run level — the refinery deduplicates against
the lineage_id (`edgar:{cik10}:{accession}`) before insert. Re-running the same
window is safe.

Wave G/H/K consume from the raw layer; Wave A's `cleaned.filings_cleaned` is
populated by a separate normalization step (kept out of this module so the
connector concern stays small).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Iterable, List, Optional

import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.connectors.edgar import EdgarClient, EdgarError, DEFAULT_FORMS
from app.quality.scorer import enrich_record  # for data_quality_score / created_at

log = structlog.get_logger("quant_engine.refinery.filings_ingestor")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _filings_dq(rec: dict) -> float:
    """Trivial DQ scorer for filings — every required field present → 1.0."""
    required = ("cik", "accession_number", "form_type", "filing_date", "document_url")
    missing = [k for k in required if not rec.get(k)]
    return 1.0 if not missing else max(0.0, 1.0 - 0.2 * len(missing))


def _serialize_for_bq(rows: List[dict]) -> List[dict]:
    out = []
    for row in rows:
        r = {k: v for k, v in row.items() if not k.startswith("_")}
        for k, v in list(r.items()):
            if isinstance(v, (dict, list)):
                r[k] = json.dumps(v)
        out.append(r)
    return out


async def _resolve_ciks(client: EdgarClient, symbols_or_ciks: Iterable[str]) -> List[tuple[str, Optional[str]]]:
    """
    Accepts a mixed iterable of tickers (e.g. "AAPL") and CIKs (e.g. "320193"
    or "0000320193"). Returns a list of (cik10, symbol_hint or None).
    """
    out: List[tuple[str, Optional[str]]] = []
    for s in symbols_or_ciks:
        s = (s or "").strip()
        if not s:
            continue
        if s.isdigit():
            out.append((s.zfill(10), None))
            continue
        cik = await client.cik_for_symbol(s)
        if cik:
            out.append((cik, s.upper()))
        else:
            log.warning("filings.cik_unresolved", input=s)
    return out


async def ingest_edgar_filings(
    run_id: str,
    symbols_or_ciks: List[str],
    days_back: Optional[int] = None,
    forms: Optional[List[str]] = None,
) -> dict:
    """
    Fetch recent EDGAR filings for the given tickers/CIKs and persist them to
    raw_public.public_filings_raw + raw_documents.document_sources_raw.

    Returns a summary dict suitable for the in-memory _runs registry shape.
    """
    # Lazy-import the runs registry so this module is import-safe in unit tests
    # that don't bring up FastAPI.
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    days = days_back or settings.EDGAR_DEFAULT_LOOKBACK_DAYS
    since = (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()
    forms_set = set(forms) if forms else set(DEFAULT_FORMS)

    summary = {
        "run_id": run_id,
        "pipeline_name": "edgar_filings_ingest",
        "status": "running",
        "started_at": _now_iso(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
        "filings_written": 0,
        "documents_written": 0,
        "since_date": since,
    }
    _runs[run_id] = summary

    try:
        client = EdgarClient()
    except EdgarError as e:
        summary["status"] = "failed"
        summary["completed_at"] = _now_iso()
        summary["errors"].append({"stage": "client_init", "error": str(e)})
        log.error("filings.client_init_failed", error=str(e))
        return summary

    resolved = await _resolve_ciks(client, symbols_or_ciks)
    log.info("filings.resolved_ciks", count=len(resolved))

    filings_table = fully_qualified(settings.BQ_DATASET_RAW_PUBLIC, "public_filings_raw")
    documents_table = fully_qualified(settings.BQ_DATASET_RAW_DOCUMENTS, "document_sources_raw")
    bq = get_bigquery_client()

    # Dedup across this run by lineage_id (same accession can appear if a
    # caller passes the same CIK twice through different aliases).
    seen_lineage: set[str] = set()
    filings_rows: List[dict] = []
    document_rows: List[dict] = []

    for cik10, symbol_hint in resolved:
        try:
            async for rec in client.iter_recent_filings(
                cik10,
                forms=forms_set,
                since_date=since,
                symbol_hint=symbol_hint,
            ):
                lid = rec.get("lineage_id")
                if not lid or lid in seen_lineage:
                    continue
                seen_lineage.add(lid)

                # finalize lineage / quality / timestamps
                rec["data_quality_score"] = _filings_dq(rec)
                enrich_record(rec, lambda r: r["data_quality_score"])  # adds created_at
                filings_rows.append(rec)

                # spawn parallel document_sources_raw record
                doc_meta = rec.get("_document_source") or {}
                document_rows.append({
                    "id": str(uuid.uuid4()),
                    "symbol": symbol_hint,
                    "asset_type": "equity",
                    "provider": "sec_edgar",
                    "source_url": doc_meta.get("document_url"),
                    "source_type": "filing",
                    "ingestion_time": rec["ingestion_time"],
                    "observation_time": rec.get("observation_time"),
                    "lineage_id": lid,
                    "confidence": 1.0,
                    "data_quality_score": _filings_dq(rec),
                    "created_at": rec["ingestion_time"],
                    "document_type": doc_meta.get("document_type"),
                    "document_title": doc_meta.get("document_title"),
                    "document_url": doc_meta.get("document_url"),
                    "mime_type": doc_meta.get("mime_type"),
                    "file_size_bytes": None,
                    "language": "en",
                    "raw_payload": rec.get("raw_payload"),
                })
        except Exception as e:
            log.error("filings.ingest_failed", cik=cik10, error=str(e))
            summary["errors"].append({"cik": cik10, "stage": "iter", "error": str(e)})

    # Persist in two streaming-inserts. BigQuery insert_rows_json caps at 10K
    # rows per call; we batch defensively.
    def _batched(rows: List[dict], size: int = 500):
        for i in range(0, len(rows), size):
            yield rows[i : i + size]

    for batch in _batched(_serialize_for_bq(filings_rows)):
        errors = bq.insert_rows_json(filings_table, batch)
        if errors:
            log.error("filings.bq_insert_errors", table=filings_table, errors=errors[:3])
            summary["errors"].append({"table": filings_table, "errors": errors[:3]})
        else:
            summary["filings_written"] += len(batch)

    for batch in _batched(_serialize_for_bq(document_rows)):
        errors = bq.insert_rows_json(documents_table, batch)
        if errors:
            log.error("filings.bq_doc_errors", table=documents_table, errors=errors[:3])
            summary["errors"].append({"table": documents_table, "errors": errors[:3]})
        else:
            summary["documents_written"] += len(batch)

    summary["records_processed"] = summary["filings_written"] + summary["documents_written"]
    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _now_iso()
    log.info(
        "filings.complete",
        run_id=run_id,
        filings=summary["filings_written"],
        docs=summary["documents_written"],
        errors=len(summary["errors"]),
    )
    return summary
