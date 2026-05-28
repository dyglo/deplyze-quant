"""
Durable agent run ledger (Stage 2 reliability).

Writes execution records to artifacts.agent_runs so every agent invocation is
verifiable after the fact — something FastAPI BackgroundTasks could never give
us (a task killed by instance scale-down left no trace, no retry, no alert).

Two rows are written per run, sharing one run_id:
  * a "started" row at the beginning  (phase=start)
  * a terminal row at the end          (phase=finish; status=completed |
                                        completed_with_errors | failed)

A started row with no matching finish row = a crashed/killed run. Reporting
(`GET /agents/runs`) reads the latest row per run_id.

Ledger writes are best-effort: a failure to record must never break or fail the
actual agent run, so every write is wrapped and only logged on error.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.bigquery.schemas import AGENT_RUNS
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.run_ledger")

ALL_AGENTS = "ALL"


def _table() -> str:
    return fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_runs")


def ensure_table() -> bool:
    """Create artifacts.agent_runs if it does not exist. Idempotent."""
    bq = get_bigquery_client()
    table_id = _table()
    try:
        bq.get_table(table_id)
        return True
    except Exception:
        pass
    try:
        table = bigquery.Table(table_id, schema=AGENT_RUNS)
        table.time_partitioning = bigquery.TimePartitioning(field="run_date")
        bq.create_table(table)
        log.info("run_ledger.table_created", table=table_id)
        return True
    except Exception as e:
        log.error("run_ledger.table_create_failed", table=table_id, error=str(e))
        return False


def _insert(row: dict) -> None:
    try:
        bq = get_bigquery_client()
        errs = bq.insert_rows_json(_table(), [row])
        if errs:
            log.error("run_ledger.insert_errors", errors=errs[:2])
    except Exception as e:  # never break the run on a ledger write
        log.error("run_ledger.insert_failed", error=str(e))


def record_start(
    run_id: str,
    agent_id: str,
    trigger: str,
    portfolio_id: Optional[str] = None,
    attempt: int = 0,
) -> datetime:
    """Write the 'started' row and return the start timestamp for duration calc."""
    started = datetime.now(timezone.utc)
    _insert({
        "run_id": run_id,
        "agent_id": agent_id,
        "trigger": trigger,
        "status": "started",
        "phase": "start",
        "started_at": started.isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "attempt": attempt,
        "output_count": None,
        "inserted": None,
        "skipped": None,
        "portfolio_id": portfolio_id,
        "error": None,
        "agent_results": None,
        "run_date": started.date().isoformat(),
        "is_test": False,
    })
    return started


def record_finish(
    run_id: str,
    agent_id: str,
    status: str,
    started_at: datetime,
    *,
    trigger: Optional[str] = None,
    output_count: int = 0,
    inserted: int = 0,
    skipped: int = 0,
    error: Optional[str] = None,
    agent_results: Optional[dict[str, Any]] = None,
    portfolio_id: Optional[str] = None,
    attempt: int = 0,
) -> None:
    """Write the terminal row for a run."""
    completed = datetime.now(timezone.utc)
    duration_ms = int((completed - started_at).total_seconds() * 1000)
    _insert({
        "run_id": run_id,
        "agent_id": agent_id,
        "trigger": trigger,
        "status": status,
        "phase": "finish",
        "started_at": started_at.isoformat(),
        "completed_at": completed.isoformat(),
        "duration_ms": duration_ms,
        "attempt": attempt,
        "output_count": output_count,
        "inserted": inserted,
        "skipped": skipped,
        "portfolio_id": portfolio_id,
        "error": (error[:1500] if error else None),
        "agent_results": json.dumps(agent_results) if agent_results is not None else None,
        "run_date": started_at.date().isoformat(),
        "is_test": False,
    })
