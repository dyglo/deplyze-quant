"""
V4 Agents API — FastAPI router for agent orchestration and output queries.

Routes:
  POST /agents/run                            — trigger full orchestration run
  POST /agents/run/:agent_id                  — trigger single agent
  GET  /agents/registry                       — static registry definitions
  GET  /agents/outputs                        — query recent agent outputs
  GET  /agents/outputs/portfolio/:pid         — portfolio-specific outputs
  GET  /agents/status                         — today's run summary
  GET  /agents/reasoning                      — multi-system synthesized reasoning
  GET  /agents/analog                         — historical analog results
  POST /agents/vulnerability                  — portfolio regime vulnerability
  GET  /agents/narrative-exposure             — narrative exposure by symbols
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

import structlog
from fastapi import APIRouter, BackgroundTasks, Query, Path, Body
from pydantic import BaseModel

from app.agents.orchestrator import run_all, run_one, ensure_agent_outputs_table
from app.agents.registry import AGENT_REGISTRY, REGISTRY_BY_ID
from app.agents import reasoning as reasoning_engine
from app.agents import historical_analog as analog_engine
from app.agents import vulnerability as vulnerability_engine
from app.agents import narrative_exposure as narrative_engine
from app.agents.orchestrator import _persist
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.api.agents")
router = APIRouter()


# ─── Pydantic models ──────────────────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    portfolio_id: Optional[str] = None
    dry_run: bool = False


class AgentRunResponse(BaseModel):
    run_id: str
    status: str
    message: str


# ─── POST /agents/run ────────────────────────────────────────────────────────

@router.post("/run")
async def trigger_full_run(
    background_tasks: BackgroundTasks,
    req: AgentRunRequest = Body(default_factory=AgentRunRequest),
):
    run_id = str(uuid.uuid4())
    if req.dry_run:
        return {"run_id": run_id, "status": "dry_run", "agents": [e.agent_id for e in AGENT_REGISTRY if e.trigger_type == "scheduled"]}

    background_tasks.add_task(_run_all_bg, run_id, req.portfolio_id)
    return {"run_id": run_id, "status": "accepted", "message": "Full agent run started in background"}


async def _run_all_bg(run_id: str, portfolio_id: Optional[str]) -> None:
    try:
        await ensure_agent_outputs_table()
        result = await run_all(portfolio_id=portfolio_id)
        log.info("agents.full_run_complete", run_id=run_id, result=result)
    except Exception as e:
        log.error("agents.full_run_failed", run_id=run_id, error=str(e))


# ─── POST /agents/run/:agent_id ──────────────────────────────────────────────

@router.post("/run/{agent_id}")
async def trigger_single_agent(
    agent_id: str = Path(...),
    background_tasks: BackgroundTasks = None,
    req: AgentRunRequest = Body(default_factory=AgentRunRequest),
):
    if agent_id not in REGISTRY_BY_ID:
        return {"error": f"Unknown agent_id: {agent_id}"}
    if req.dry_run:
        return {"agent_id": agent_id, "status": "dry_run"}

    run_id = str(uuid.uuid4())
    if background_tasks:
        background_tasks.add_task(_run_one_bg, agent_id, run_id, req.portfolio_id)
        return {"run_id": run_id, "status": "accepted", "agent_id": agent_id}

    result = await run_one(agent_id=agent_id, portfolio_id=req.portfolio_id)
    return result


async def _run_one_bg(agent_id: str, run_id: str, portfolio_id: Optional[str]) -> None:
    try:
        await ensure_agent_outputs_table()
        result = await run_one(agent_id=agent_id, portfolio_id=portfolio_id)
        log.info("agents.single_run_complete", agent_id=agent_id, run_id=run_id, result=result)
    except Exception as e:
        log.error("agents.single_run_failed", agent_id=agent_id, run_id=run_id, error=str(e))


# ─── GET /agents/registry ────────────────────────────────────────────────────

@router.get("/registry")
async def get_registry():
    return {
        "agents": [
            {
                "agent_id": e.agent_id,
                "domain": e.domain,
                "trigger_type": e.trigger_type,
                "cadence_cron": e.cadence_cron,
                "input_sources": e.input_sources,
                "output_artifact_type": e.output_artifact_type,
                "affected_pages": e.affected_pages,
                "description": e.description,
                "safety_notes": e.safety_notes,
            }
            for e in AGENT_REGISTRY
        ],
        "count": len(AGENT_REGISTRY),
    }


# ─── GET /agents/outputs ─────────────────────────────────────────────────────

@router.get("/outputs")
async def get_outputs(
    domain: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    artifact_type: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    days: int = Query(default=2, ge=1, le=30),
    limit: int = Query(default=50, ge=1, le=200),
):
    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")

    wheres = [f"DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)"]
    if domain:
        wheres.append(f"domain = '{domain}'")
    if severity:
        wheres.append(f"severity = '{severity}'")
    if artifact_type:
        wheres.append(f"artifact_type = '{artifact_type}'")
    if symbol:
        wheres.append(f"'{symbol}' IN UNNEST(symbols)")
    wheres.append("is_test = FALSE")

    where_clause = " AND ".join(wheres)
    sql = f"""
        SELECT artifact_id, agent_id, domain, artifact_type, title, summary,
               body, confidence, severity, symbols, portfolio_id, evidence,
               source_tables, generated_at, observation_date,
               recommended_placements, tags, lineage_id
        FROM `{table}`
        WHERE {where_clause}
        ORDER BY generated_at DESC
        LIMIT {limit}
    """
    try:
        rows = list(bq.query(sql).result())
        return {"outputs": [dict(r) for r in rows], "count": len(rows)}
    except Exception as e:
        log.error("agents.outputs_query_failed", error=str(e))
        return {"outputs": [], "count": 0, "error": str(e)}


# ─── GET /agents/outputs/portfolio/:portfolio_id ──────────────────────────────

@router.get("/outputs/portfolio/{portfolio_id}")
async def get_portfolio_outputs(
    portfolio_id: str = Path(...),
    days: int = Query(default=3, ge=1, le=14),
    limit: int = Query(default=30, ge=1, le=100),
):
    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    sql = f"""
        SELECT artifact_id, agent_id, domain, artifact_type, title, summary,
               body, confidence, severity, symbols, portfolio_id, evidence,
               source_tables, generated_at, observation_date,
               recommended_placements, tags
        FROM `{table}`
        WHERE (
          portfolio_id = '{portfolio_id}'
          OR domain IN ('macro', 'regime', 'risk', 'liquidity')
        )
          AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT {limit}
    """
    try:
        rows = list(bq.query(sql).result())
        return {"outputs": [dict(r) for r in rows], "portfolio_id": portfolio_id, "count": len(rows)}
    except Exception as e:
        log.error("agents.portfolio_query_failed", error=str(e))
        return {"outputs": [], "portfolio_id": portfolio_id, "count": 0, "error": str(e)}


# ─── GET /agents/status ───────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    today = datetime.now(timezone.utc).date().isoformat()
    sql = f"""
        SELECT agent_id, domain, COUNT(*) AS output_count,
               MAX(generated_at) AS last_generated,
               COUNTIF(severity = 'high') AS high_severity_count
        FROM `{table}`
        WHERE DATE(observation_date) = '{today}'
          AND is_test = FALSE
        GROUP BY agent_id, domain
        ORDER BY agent_id
    """
    try:
        rows = list(bq.query(sql).result())
        status = [dict(r) for r in rows]
        all_ids = {e.agent_id for e in AGENT_REGISTRY if e.trigger_type == "scheduled"}
        ran_ids = {r["agent_id"] for r in status}
        pending = list(all_ids - ran_ids)
        return {
            "date": today,
            "ran": status,
            "pending": pending,
            "ran_count": len(ran_ids),
            "total_scheduled": len(all_ids),
        }
    except Exception as e:
        log.error("agents.status_query_failed", error=str(e))
        return {"date": today, "ran": [], "pending": [], "error": str(e)}


# ─── GET /agents/reasoning ───────────────────────────────────────────────────

@router.get("/reasoning")
async def get_reasoning(
    portfolio_id: Optional[str] = Query(None),
    background_tasks: BackgroundTasks = None,
):
    """
    Return multi-system synthesised reasoning from today's agent outputs.
    If no reasoning outputs exist for today, run the engine on-demand.
    """
    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    today = datetime.now(timezone.utc).date().isoformat()

    # Check for cached today reasoning
    sql = f"""
        SELECT artifact_id, domain, artifact_type, title, summary, body,
               confidence, severity, evidence, generated_at, tags
        FROM `{table}`
        WHERE artifact_type = 'multi_system_reasoning'
          AND DATE(observation_date) = '{today}'
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT 5
    """
    try:
        cached = [dict(r) for r in bq.query(sql).result()]
    except Exception:
        cached = []

    if cached:
        return {"reasoning": cached, "count": len(cached), "source": "cached"}

    # Run on-demand
    try:
        outputs = await reasoning_engine.run(portfolio_id=portfolio_id)
        if outputs:
            await _persist(outputs)
        return {
            "reasoning": [o.to_bq_row() for o in outputs],
            "count": len(outputs),
            "source": "computed",
        }
    except Exception as e:
        log.error("agents.reasoning_failed", error=str(e))
        return {"reasoning": [], "count": 0, "error": str(e)}


# ─── GET /agents/analog ──────────────────────────────────────────────────────

@router.get("/analog")
async def get_analog(
    lookback_years: int = Query(default=10, ge=3, le=20),
    top_k: int = Query(default=4, ge=1, le=8),
):
    """Historical analog search for current macro/vol conditions."""
    try:
        result = await analog_engine.find_analogs(
            lookback_years=lookback_years,
            top_k=top_k,
        )
        return result
    except Exception as e:
        log.error("agents.analog_failed", error=str(e))
        return {"analogs": [], "error": str(e)}


# ─── POST /agents/vulnerability ───────────────────────────────────────────────

class HoldingInput(BaseModel):
    symbol: str
    weight: float
    asset_class: Optional[str] = None


class VulnerabilityRequest(BaseModel):
    holdings: List[HoldingInput]
    portfolio_id: Optional[str] = None


@router.post("/vulnerability")
async def compute_vulnerability(req: VulnerabilityRequest):
    """Compute portfolio regime vulnerability across 6 dimensions."""
    holdings = [h.model_dump() for h in req.holdings]
    try:
        result = await vulnerability_engine.compute_vulnerability(
            holdings=holdings,
            portfolio_id=req.portfolio_id,
        )
        return result
    except Exception as e:
        log.error("agents.vulnerability_failed", error=str(e))
        return {"error": str(e), "dimensions": {}}


# ─── GET /agents/narrative-exposure ──────────────────────────────────────────

@router.get("/narrative-exposure")
async def get_narrative_exposure(
    symbols: str = Query(..., description="Comma-separated symbols"),
    weights: Optional[str] = Query(None, description="Comma-separated weights matching symbols"),
    top_k: int = Query(default=8, ge=1, le=20),
):
    """Compute narrative theme exposure for a list of symbols."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    weight_map: Optional[dict[str, float]] = None
    if weights:
        w_list = [float(w.strip()) for w in weights.split(",") if w.strip()]
        if len(w_list) == len(sym_list):
            weight_map = dict(zip(sym_list, w_list))
    try:
        result = await narrative_engine.compute_narrative_exposure(
            symbols=sym_list,
            weights=weight_map,
            top_k=top_k,
        )
        return result
    except Exception as e:
        log.error("agents.narrative_exposure_failed", error=str(e))
        return {"exposures": [], "error": str(e)}
