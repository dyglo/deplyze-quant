"""
investigation_memory.py — CRUD over artifacts.investigation_memory.

Investigations are institutional workflow memory: a thesis or question the
user is pursuing, with symbols, themes, pinned cards, and unresolved
questions attached. New evidence overlapping the investigation surfaces
via the ranker's investigation_continuation_score even when the user has
not opened the app recently.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.personalization.investigation_memory")

VALID_STATUSES = ("active", "paused", "resolved", "archived")


def _tbl() -> str:
    return fully_qualified(settings.BQ_DATASET_ARTIFACTS, "investigation_memory")


def create_investigation(
    *,
    user_id_hash: str,
    title: str,
    thesis: Optional[str] = None,
    symbols: Optional[list[str]] = None,
    themes: Optional[list[str]] = None,
    tags: Optional[list[str]] = None,
    unresolved_questions: Optional[list[str]] = None,
) -> dict:
    now = datetime.now(timezone.utc)
    inv = {
        "investigation_id": str(uuid.uuid4()),
        "user_id_hash": user_id_hash,
        "title": title,
        "thesis": thesis,
        "status": "active",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "last_resurfaced_at": None,
        "created_date": now.date().isoformat(),
        "symbols": symbols or [],
        "themes": themes or [],
        "pinned_artifact_ids": [],
        "copilot_thread_ids": [],
        "saved_briefing_ids": [],
        "unresolved_questions": unresolved_questions or [],
        "related_macro_events": [],
        "related_analog_artifact_ids": [],
        "continuation_score": None,
        "evidence_overlap_count": 0,
        "tags": tags or [],
        "properties": None,
        "lineage_id": f"investigation:{user_id_hash}:{now.date().isoformat()}",
    }
    bq = get_bigquery_client()
    errors = bq.insert_rows_json(_tbl(), [inv])
    if errors:
        log.error("investigation_memory.create_failed", errors=errors[:3])
        raise RuntimeError(f"Investigation insert failed: {errors[:3]}")
    return inv


def list_investigations(user_id_hash: str, status: Optional[str] = "active") -> list[dict]:
    bq = get_bigquery_client()
    where_status = "AND status = @status" if status else ""
    sql = f"""
        SELECT *
        FROM `{_tbl()}`
        WHERE user_id_hash = @uid {where_status}
        ORDER BY updated_at DESC
        LIMIT 200
    """
    params = [bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash)]
    if status:
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))
    try:
        rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params)).result())
        return [dict(r) for r in rows]
    except Exception as e:
        log.warning("investigation_memory.list_failed", error=str(e))
        return []


def update_investigation(
    investigation_id: str,
    *,
    user_id_hash: str,
    patch: dict[str, Any],
) -> dict:
    """
    Partial update. BigQuery cannot UPDATE individual rows efficiently in
    streaming-buffer windows, so the write strategy is: read existing,
    overwrite via DELETE + INSERT. Safe because investigations are user-
    scoped and small.
    """
    valid_keys = {
        "title", "thesis", "status", "symbols", "themes", "pinned_artifact_ids",
        "copilot_thread_ids", "saved_briefing_ids", "unresolved_questions",
        "related_macro_events", "related_analog_artifact_ids",
        "continuation_score", "evidence_overlap_count", "tags", "properties",
    }
    bad = set(patch.keys()) - valid_keys
    if bad:
        raise ValueError(f"Unsupported patch keys: {sorted(bad)}")
    if patch.get("status") and patch["status"] not in VALID_STATUSES:
        raise ValueError(f"Invalid status. Must be one of {VALID_STATUSES}")

    bq = get_bigquery_client()
    sql = f"""
        SELECT * FROM `{_tbl()}`
        WHERE investigation_id = @id AND user_id_hash = @uid
        LIMIT 1
    """
    rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("id", "STRING", investigation_id),
        bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash),
    ])).result())
    if not rows:
        raise LookupError("Investigation not found")
    current = dict(rows[0])
    current.update(patch)
    current["updated_at"] = datetime.now(timezone.utc).isoformat()
    # ISO-encode timestamps that came back as datetime.
    for k in ("created_at", "last_resurfaced_at"):
        v = current.get(k)
        if isinstance(v, datetime):
            current[k] = v.isoformat()
    if isinstance(current.get("created_date"), date):
        current["created_date"] = current["created_date"].isoformat()

    bq.query(
        f"DELETE FROM `{_tbl()}` WHERE investigation_id = @id AND user_id_hash = @uid",
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("id", "STRING", investigation_id),
            bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash),
        ]),
    ).result()
    errors = bq.insert_rows_json(_tbl(), [current])
    if errors:
        log.error("investigation_memory.update_insert_errors", errors=errors[:3])
        raise RuntimeError(f"Investigation update failed: {errors[:3]}")
    return current


def close_investigation(investigation_id: str, *, user_id_hash: str, status: str = "resolved") -> dict:
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status. Must be one of {VALID_STATUSES}")
    return update_investigation(investigation_id, user_id_hash=user_id_hash, patch={"status": status})


__all__ = [
    "create_investigation",
    "list_investigations",
    "update_investigation",
    "close_investigation",
    "VALID_STATUSES",
]
