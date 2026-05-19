"""
Macro Agent — V4 Intelligence Domain: Macro.

Wraps the existing macro_regime intelligence engine and adapts its outputs
into the unified AgentOutput schema. Publishes to artifacts.agent_outputs.

Runs after the FRED ingestor and macro_regime classifier have executed (09:45 ET).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_MACRO_REGIME_DESK, PLACEMENT_INTELLIGENCE_TERMINAL,
    PLACEMENT_RESEARCH_COPILOT, PLACEMENT_PORTFOLIO_OVERVIEW,
    PLACEMENT_RISK_REGIME_FIT,
)
from app.agents.registry import DOMAIN_MACRO
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.macro")

_PLACEMENTS = [
    PLACEMENT_MACRO_REGIME_DESK, PLACEMENT_INTELLIGENCE_TERMINAL,
    PLACEMENT_RESEARCH_COPILOT, PLACEMENT_PORTFOLIO_OVERVIEW,
    PLACEMENT_RISK_REGIME_FIT,
]
_SOURCE = "research.macro_observations"


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    """Read latest macro observations and produce AgentOutput records."""
    bq = get_bigquery_client()
    obs_table = fully_qualified(settings.BQ_DATASET_RESEARCH, "macro_observations")
    today = datetime.now(timezone.utc).date().isoformat()

    sql = f"""
        SELECT observation_type, regime_state, title, summary, body,
               confidence, severity, related_series
        FROM `{obs_table}`
        WHERE DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)
        ORDER BY observation_time DESC
        LIMIT 8
    """
    try:
        rows = list(bq.query(sql).result())
    except Exception as e:
        log.warning("macro_agent.query_failed", error=str(e))
        return []

    outputs: list[AgentOutput] = []
    seen: set[str] = set()

    for r in rows:
        kind = r["observation_type"] or "macro"
        if kind in seen:
            continue
        seen.add(kind)

        conf = float(r["confidence"] or 0.5)
        sev_raw = r["severity"] or ""
        severity = (
            SEVERITY_HIGH if sev_raw == "high" or conf > 0.7
            else SEVERITY_MEDIUM if sev_raw in ("med", "medium") or conf > 0.4
            else SEVERITY_INFO
        )

        outputs.append(AgentOutput(
            agent_id="macro_agent",
            domain=DOMAIN_MACRO,
            artifact_type="macro_intelligence",
            title=r["title"] or f"Macro: {kind}",
            summary=r["summary"] or "",
            body=r["body"] or "",
            confidence=conf,
            severity=severity,
            symbols=[],
            portfolio_id=portfolio_id,
            evidence={
                "observation_type": kind,
                "regime_state": r["regime_state"],
                "related_series": list(r["related_series"] or []),
            },
            source_tables=[obs_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["macro", kind, r["regime_state"] or ""],
        ))

    log.info("macro_agent.complete", outputs=len(outputs))
    return outputs
