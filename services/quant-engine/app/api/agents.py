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
from fastapi import APIRouter, BackgroundTasks, Query, Path, Body, Response
from pydantic import BaseModel
from google.cloud import bigquery

from app.agents.orchestrator import run_all, run_one, ensure_agent_outputs_table
from app.agents import run_ledger
from app.agents.registry import AGENT_REGISTRY, REGISTRY_BY_ID
from app.agents import reasoning as reasoning_engine
from app.agents import historical_analog as analog_engine
from app.agents import vulnerability as vulnerability_engine
from app.agents import narrative_exposure as narrative_engine
from app.agents.orchestrator import _persist
from app.bigquery.client import fully_qualified, run_query
from app.core.config import settings

log = structlog.get_logger("quant_engine.api.agents")
router = APIRouter()


# ─── Pydantic models ──────────────────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    portfolio_id: Optional[str] = None
    dry_run: bool = False
    # Synchronous by default: the run executes inside the request so Cloud Run
    # keeps CPU allocated for its whole duration and Cloud Scheduler waits for
    # (and can retry on) the result. `background=true` opts into the legacy
    # fire-and-forget path, which has no execution guarantee — manual use only.
    background: bool = False
    trigger: Optional[str] = None   # ledger label: scheduled | manual | full


class AgentRunResponse(BaseModel):
    run_id: str
    status: str
    message: str


async def _ensure_tables() -> None:
    """Ensure both the outputs table and the run ledger exist before a run."""
    await ensure_agent_outputs_table()
    run_ledger.ensure_table()


# ─── POST /agents/run ────────────────────────────────────────────────────────

@router.post("/run")
async def trigger_full_run(
    response: Response,
    background_tasks: BackgroundTasks,
    req: AgentRunRequest = Body(default_factory=AgentRunRequest),
):
    if req.dry_run:
        return {
            "run_id": str(uuid.uuid4()),
            "status": "dry_run",
            "agents": [e.agent_id for e in AGENT_REGISTRY if e.trigger_type == "scheduled"],
        }

    await _ensure_tables()
    trigger = req.trigger or "full"

    if req.background:
        run_id = str(uuid.uuid4())
        background_tasks.add_task(_run_all_bg, req.portfolio_id, trigger)
        return {"run_id": run_id, "status": "accepted", "message": "Full agent run started in background"}

    # Synchronous: execute in-request so the run is durable and verifiable.
    result = await run_all(portfolio_id=req.portfolio_id, trigger=trigger)
    if result.get("failed"):
        response.status_code = 500  # signal Cloud Scheduler to retry
    return result


async def _run_all_bg(portfolio_id: Optional[str], trigger: str) -> None:
    try:
        result = await run_all(portfolio_id=portfolio_id, trigger=trigger)
        log.info("agents.full_run_complete", result=result)
    except Exception as e:
        log.error("agents.full_run_failed", error=str(e))


# ─── POST /agents/run/:agent_id ──────────────────────────────────────────────

@router.post("/run/{agent_id}")
async def trigger_single_agent(
    response: Response,
    agent_id: str = Path(...),
    background_tasks: BackgroundTasks = None,
    req: AgentRunRequest = Body(default_factory=AgentRunRequest),
):
    if agent_id not in REGISTRY_BY_ID:
        response.status_code = 404
        return {"error": f"Unknown agent_id: {agent_id}"}
    if req.dry_run:
        return {"agent_id": agent_id, "status": "dry_run"}

    await _ensure_tables()
    trigger = req.trigger or "scheduled"

    if req.background and background_tasks is not None:
        run_id = str(uuid.uuid4())
        background_tasks.add_task(_run_one_bg, agent_id, req.portfolio_id, trigger)
        return {"run_id": run_id, "status": "accepted", "agent_id": agent_id}

    # Synchronous: execute in-request so the run is durable and verifiable.
    result = await run_one(agent_id=agent_id, portfolio_id=req.portfolio_id, trigger=trigger)
    if result.get("failed"):
        response.status_code = 500  # signal Cloud Scheduler to retry
    return result


async def _run_one_bg(agent_id: str, portfolio_id: Optional[str], trigger: str) -> None:
    try:
        result = await run_one(agent_id=agent_id, portfolio_id=portfolio_id, trigger=trigger)
        log.info("agents.single_run_complete", agent_id=agent_id, result=result)
    except Exception as e:
        log.error("agents.single_run_failed", agent_id=agent_id, error=str(e))


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
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")

    wheres = ["DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)"]
    params = [
        bigquery.ScalarQueryParameter("days", "INT64", days),
        bigquery.ScalarQueryParameter("lim", "INT64", limit),
    ]
    if domain:
        wheres.append("domain = @domain")
        params.append(bigquery.ScalarQueryParameter("domain", "STRING", domain))
    if severity:
        wheres.append("severity = @severity")
        params.append(bigquery.ScalarQueryParameter("severity", "STRING", severity))
    if artifact_type:
        wheres.append("artifact_type = @artifact_type")
        params.append(bigquery.ScalarQueryParameter("artifact_type", "STRING", artifact_type))
    if symbol:
        wheres.append("@symbol IN UNNEST(symbols)")
        params.append(bigquery.ScalarQueryParameter("symbol", "STRING", symbol))
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
        LIMIT @lim
    """
    try:
        rows = run_query(sql, params)
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
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    sql = f"""
        SELECT artifact_id, agent_id, domain, artifact_type, title, summary,
               body, confidence, severity, symbols, portfolio_id, evidence,
               source_tables, generated_at, observation_date,
               recommended_placements, tags
        FROM `{table}`
        WHERE (
          portfolio_id = @portfolio_id
          OR domain IN ('macro', 'regime', 'risk', 'liquidity')
        )
          AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT @lim
    """
    params = [
        bigquery.ScalarQueryParameter("portfolio_id", "STRING", portfolio_id),
        bigquery.ScalarQueryParameter("days", "INT64", days),
        bigquery.ScalarQueryParameter("lim", "INT64", limit),
    ]
    try:
        rows = run_query(sql, params)
        return {"outputs": [dict(r) for r in rows], "portfolio_id": portfolio_id, "count": len(rows)}
    except Exception as e:
        log.error("agents.portfolio_query_failed", error=str(e))
        return {"outputs": [], "portfolio_id": portfolio_id, "count": 0, "error": str(e)}


# ─── GET /agents/status ───────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    today = datetime.now(timezone.utc).date().isoformat()
    sql = f"""
        SELECT agent_id, domain, COUNT(*) AS output_count,
               MAX(generated_at) AS last_generated,
               COUNTIF(severity = 'high') AS high_severity_count
        FROM `{table}`
        WHERE DATE(observation_date) = @today
          AND is_test = FALSE
        GROUP BY agent_id, domain
        ORDER BY agent_id
    """
    try:
        rows = run_query(sql, [bigquery.ScalarQueryParameter("today", "DATE", today)])
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


# ─── GET /agents/runs ─────────────────────────────────────────────────────────

@router.get("/runs")
async def get_runs(
    status: Optional[str] = Query(None, description="started|completed|completed_with_errors|failed"),
    agent_id: Optional[str] = Query(None),
    days: int = Query(default=2, ge=1, le=30),
    limit: int = Query(default=50, ge=1, le=200),
):
    """Operational reporting over the durable run ledger (artifacts.agent_runs).

    Returns the latest row per run_id (the terminal 'finish' row wins over the
    'started' row). A run whose latest row is still 'started' was killed before
    completing — surfaced here as the reliability signal.
    """
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_runs")
    wheres = ["run_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)"]
    params = [
        bigquery.ScalarQueryParameter("days", "INT64", days),
        bigquery.ScalarQueryParameter("lim", "INT64", limit),
    ]
    if agent_id:
        wheres.append("agent_id = @agent_id")
        params.append(bigquery.ScalarQueryParameter("agent_id", "STRING", agent_id))
    where_clause = " AND ".join(wheres)

    # completed_at is non-null only on the finish row, so DESC (NULLs last) makes
    # the terminal row win per run_id.
    status_filter = ""
    if status:
        status_filter = "WHERE status = @status"
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))

    sql = f"""
        WITH ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                     PARTITION BY run_id ORDER BY completed_at DESC
                   ) AS rn
            FROM `{table}`
            WHERE {where_clause}
        )
        SELECT run_id, agent_id, trigger, status, started_at, completed_at,
               duration_ms, attempt, output_count, inserted, skipped,
               portfolio_id, error, agent_results
        FROM ranked
        WHERE rn = 1
        {status_filter}
        ORDER BY started_at DESC
        LIMIT @lim
    """
    try:
        rows = run_query(sql, params)
        runs = [dict(r) for r in rows]
        return {
            "runs": runs,
            "count": len(runs),
            "failed_count": sum(1 for r in runs if r.get("status") in ("failed", "started")),
        }
    except Exception as e:
        log.error("agents.runs_query_failed", error=str(e))
        return {"runs": [], "count": 0, "error": str(e)}


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
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    today = datetime.now(timezone.utc).date().isoformat()

    # Check for cached today reasoning
    sql = f"""
        SELECT artifact_id, domain, artifact_type, title, summary, body,
               confidence, severity, evidence, generated_at, tags
        FROM `{table}`
        WHERE artifact_type = 'multi_system_reasoning'
          AND DATE(observation_date) = @today
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT 5
    """
    try:
        cached = [dict(r) for r in run_query(sql, [bigquery.ScalarQueryParameter("today", "DATE", today)])]
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
