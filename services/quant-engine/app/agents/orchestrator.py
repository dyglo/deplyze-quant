"""
V4 Agent Orchestrator — runs all background intelligence agents, deduplicates
outputs by lineage_id, and persists to artifacts.agent_outputs in BigQuery.

Called by:
  - The /agents/run FastAPI endpoint (on-demand or scheduler webhook)
  - Cloud Scheduler (individual agent cadences hit /agents/run?agent_id=X)

Each agent run is idempotent: lineage_id prevents double-writes.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents import (
    macro_agent, sentiment_agent, volatility_agent, cross_asset_agent,
    liquidity_agent, regime_agent, opportunity_agent, earnings_agent, risk_agent,
)
from app.agents.schemas import AgentOutput, AGENT_OUTPUTS_SCHEMA
from app.agents.registry import AGENT_REGISTRY, REGISTRY_BY_ID
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.orchestrator")

# Map agent_id → run function
_AGENT_RUNNERS = {
    "macro_agent": macro_agent.run,
    "sentiment_agent": sentiment_agent.run,
    "volatility_agent": volatility_agent.run,
    "cross_asset_agent": cross_asset_agent.run,
    "liquidity_agent": liquidity_agent.run,
    "regime_agent": regime_agent.run,
    "opportunity_agent": opportunity_agent.run,
    "earnings_agent": earnings_agent.run,
    "risk_agent": risk_agent.run,
}

# Agents that depend on others must run after their dependencies.
# Regime requires macro + liquidity + vol outputs in BQ.
# Risk requires all others.
_DEPENDENCY_ORDER = [
    ["earnings_agent", "macro_agent", "sentiment_agent", "volatility_agent",
     "cross_asset_agent", "liquidity_agent"],  # tier 1 — parallel
    ["regime_agent", "opportunity_agent"],       # tier 2 — after vol+macro
    ["risk_agent"],                              # tier 3 — after all
]


async def _run_agent(
    agent_id: str,
    portfolio_id: Optional[str],
    run_id: str,
) -> tuple[str, list[AgentOutput], Optional[str]]:
    """Run a single agent; return (agent_id, outputs, error)."""
    runner = _AGENT_RUNNERS.get(agent_id)
    if not runner:
        return agent_id, [], f"No runner registered for {agent_id}"
    try:
        outputs = await runner(portfolio_id=portfolio_id)
        return agent_id, outputs, None
    except Exception as e:
        log.error("orchestrator.agent_failed", agent_id=agent_id, run_id=run_id, error=str(e))
        return agent_id, [], str(e)


async def _persist(outputs: list[AgentOutput]) -> dict:
    """Write AgentOutput records to artifacts.agent_outputs, skipping existing lineage_ids."""
    if not outputs:
        return {"inserted": 0, "skipped": 0, "errors": []}

    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")

    # Check existing lineage_ids for today to ensure idempotency
    ids = list({o.lineage_id for o in outputs if o.lineage_id})
    if ids:
        id_list = ", ".join(f"'{x}'" for x in ids[:200])
        today = datetime.now(timezone.utc).date().isoformat()
        check_sql = f"""
            SELECT lineage_id FROM `{table}`
            WHERE DATE(observation_date) = '{today}'
              AND lineage_id IN ({id_list})
        """
        try:
            existing = {r["lineage_id"] for r in bq.query(check_sql).result()}
        except Exception:
            existing = set()
    else:
        existing = set()

    rows_to_insert = [o.to_bq_row() for o in outputs if o.lineage_id not in existing]
    skipped = len(outputs) - len(rows_to_insert)

    errors = []
    inserted = 0
    for i in range(0, len(rows_to_insert), 100):
        batch = rows_to_insert[i : i + 100]
        errs = bq.insert_rows_json(table, batch)
        if errs:
            errors.extend(errs[:3])
            log.error("orchestrator.bq_errors", errors=errs[:2])
        else:
            inserted += len(batch)

    return {"inserted": inserted, "skipped": skipped, "errors": errors}


async def run_all(portfolio_id: Optional[str] = None) -> dict:
    """Run all scheduled agents in dependency order."""
    run_id = str(uuid.uuid4())
    started = datetime.now(timezone.utc).isoformat()
    total_outputs: list[AgentOutput] = []
    agent_results: dict[str, dict] = {}

    for tier in _DEPENDENCY_ORDER:
        tier_tasks = [
            _run_agent(agent_id, portfolio_id, run_id)
            for agent_id in tier
            if agent_id in _AGENT_RUNNERS
        ]
        results = await asyncio.gather(*tier_tasks)
        for agent_id, outputs, error in results:
            agent_results[agent_id] = {
                "output_count": len(outputs),
                "error": error,
            }
            total_outputs.extend(outputs)

        # Persist after each tier so downstream agents can read today's outputs
        if total_outputs:
            await _persist(total_outputs)
            total_outputs = []

    return {
        "run_id": run_id,
        "started_at": started,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "agent_results": agent_results,
        "portfolio_id": portfolio_id,
    }


async def run_one(agent_id: str, portfolio_id: Optional[str] = None) -> dict:
    """Run a single agent and persist its outputs."""
    run_id = str(uuid.uuid4())
    _, outputs, error = await _run_agent(agent_id, portfolio_id, run_id)
    persist_result = await _persist(outputs)
    return {
        "run_id": run_id,
        "agent_id": agent_id,
        "output_count": len(outputs),
        "persist": persist_result,
        "error": error,
    }


async def ensure_agent_outputs_table() -> bool:
    """Create artifacts.agent_outputs if it does not exist."""
    from google.cloud import bigquery as bq_lib
    bq = get_bigquery_client()
    table_id = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    try:
        bq.get_table(table_id)
        return True
    except Exception:
        pass
    try:
        table = bq_lib.Table(table_id, schema=AGENT_OUTPUTS_SCHEMA)
        table.time_partitioning = bq_lib.TimePartitioning(field="observation_date")
        bq.create_table(table)
        log.info("orchestrator.table_created", table=table_id)
        return True
    except Exception as e:
        log.error("orchestrator.table_create_failed", table=table_id, error=str(e))
        return False
