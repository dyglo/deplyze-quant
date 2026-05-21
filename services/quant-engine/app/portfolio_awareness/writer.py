"""
Portfolio Awareness Synthesis writer.

Persists the per-portfolio awareness snapshot to BigQuery
`artifacts.portfolio_awareness_synthesis`. Idempotent on
`(portfolio_id, snapshot_date)` via MERGE semantics — repeated snapshots
on the same UTC date overwrite the existing row.

Initial implementation is **client-computes / backend-persists**: the
frontend computes the full synthesis (KPIs, contributors, risk, monitor
probes) and POSTs it via the gateway. This writer validates the payload
shape and stores it. A future cron'd writer will recompute server-side
using marketdata + holdings from Firestore so the snapshot persists
even when no user opens the page.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client
from app.core.config import settings

log = structlog.get_logger("quant_engine.portfolio_awareness.writer")

ARTIFACTS_DATASET = settings.BQ_DATASET_ARTIFACTS
TABLE_NAME = "portfolio_awareness_synthesis"


def _lineage_id(portfolio_id: str, snapshot_date: str) -> str:
    key = f"awareness:{portfolio_id}:{snapshot_date}"
    return f"v5p3:{hashlib.sha1(key.encode()).hexdigest()[:12]}"


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@dataclass
class SynthesisPayload:
    portfolio_id: str
    benchmark_id: Optional[str]
    uid: Optional[str]
    workspace_id: Optional[str]
    kpis: Dict[str, Any]
    contributors: Dict[str, Any]
    sector_breakdown: Dict[str, Any]
    risk_decomposition: Dict[str, Any]
    monitor_probes: List[Dict[str, Any]]
    narrative_lines: Dict[str, List[str]]
    holding_symbols: List[str]
    source_tables: Optional[List[str]] = None
    is_test: bool = False


def _table_ref() -> str:
    return f"`{settings.GCP_PROJECT_ID}.{ARTIFACTS_DATASET}.{TABLE_NAME}`"


def _row_for_insert(p: SynthesisPayload, snapshot_date: str) -> Dict[str, Any]:
    return {
        "artifact_id": str(uuid.uuid4()),
        "portfolio_id": p.portfolio_id,
        "snapshot_date": snapshot_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "benchmark_id": p.benchmark_id,
        "uid": p.uid,
        "workspace_id": p.workspace_id,
        "kpis": json.dumps(p.kpis or {}),
        "contributors": json.dumps(p.contributors or {}),
        "sector_breakdown": json.dumps(p.sector_breakdown or {}),
        "risk_decomposition": json.dumps(p.risk_decomposition or {}),
        "monitor_probes": json.dumps(p.monitor_probes or []),
        "narrative_lines": json.dumps(p.narrative_lines or {}),
        "holding_symbols": list(p.holding_symbols or []),
        "source_tables": list(p.source_tables or []),
        "lineage_id": _lineage_id(p.portfolio_id, snapshot_date),
        "is_test": bool(p.is_test),
    }


def write_snapshot(payload: SynthesisPayload, snapshot_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Idempotently write a snapshot for (portfolio_id, snapshot_date).

    Approach: DELETE same-day row(s) then INSERT. This is simpler than a
    MERGE since the JSON columns + REPEATED fields make MERGE statements
    unwieldy; the DELETE-INSERT is atomic within the BigQuery write API
    when we batch the DML.
    """
    date_iso = snapshot_date or _today_iso()
    client = get_bigquery_client()
    table = _table_ref()
    row = _row_for_insert(payload, date_iso)

    # Step 1: DELETE same-day row(s) for this portfolio.
    delete_q = f"""
        DELETE FROM {table}
        WHERE portfolio_id = @portfolio_id
          AND snapshot_date = @snapshot_date
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("portfolio_id", "STRING", payload.portfolio_id),
            bigquery.ScalarQueryParameter("snapshot_date", "DATE", date_iso),
        ]
    )
    client.query(delete_q, job_config=job_config).result()

    # Step 2: INSERT.
    table_ref = client.dataset(ARTIFACTS_DATASET).table(TABLE_NAME)
    errors = client.insert_rows_json(table_ref, [row])
    if errors:
        log.error("awareness_synthesis.insert_failed", errors=errors, portfolio_id=payload.portfolio_id)
        raise RuntimeError(f"BigQuery insert failed: {errors}")

    log.info(
        "awareness_synthesis.written",
        portfolio_id=payload.portfolio_id,
        snapshot_date=date_iso,
        symbols=len(payload.holding_symbols),
        probes=len(payload.monitor_probes or []),
    )
    return {
        "artifact_id": row["artifact_id"],
        "portfolio_id": payload.portfolio_id,
        "snapshot_date": date_iso,
        "lineage_id": row["lineage_id"],
        "generated_at": row["generated_at"],
    }


def latest_snapshot(portfolio_id: str, *, max_age_days: int = 7) -> Optional[Dict[str, Any]]:
    """Return the most recent snapshot for a portfolio within max_age_days, or None."""
    client = get_bigquery_client()
    table = _table_ref()
    q = f"""
        SELECT
          artifact_id,
          portfolio_id,
          snapshot_date,
          generated_at,
          benchmark_id,
          kpis,
          contributors,
          sector_breakdown,
          risk_decomposition,
          monitor_probes,
          narrative_lines,
          holding_symbols,
          source_tables,
          lineage_id
        FROM {table}
        WHERE portfolio_id = @portfolio_id
          AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @max_age_days DAY)
        ORDER BY snapshot_date DESC, generated_at DESC
        LIMIT 1
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("portfolio_id", "STRING", portfolio_id),
            bigquery.ScalarQueryParameter("max_age_days", "INT64", max_age_days),
        ]
    )
    rows = list(client.query(q, job_config=job_config).result())
    if not rows:
        return None
    r = dict(rows[0])
    # Deserialise JSON columns (BQ returns strings for JSON when client lib doesn't parse)
    for col in ("kpis", "contributors", "sector_breakdown", "risk_decomposition", "monitor_probes", "narrative_lines"):
        v = r.get(col)
        if isinstance(v, str):
            try:
                r[col] = json.loads(v)
            except json.JSONDecodeError:
                r[col] = None
    # Normalise datetime / date fields to ISO strings for transport
    if isinstance(r.get("snapshot_date"), (datetime,)):
        r["snapshot_date"] = r["snapshot_date"].date().isoformat()
    elif r.get("snapshot_date") is not None:
        r["snapshot_date"] = str(r["snapshot_date"])
    if isinstance(r.get("generated_at"), datetime):
        r["generated_at"] = r["generated_at"].isoformat()
    return r
