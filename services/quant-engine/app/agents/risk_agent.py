"""
Risk Agent — V4 Intelligence Domain: Risk.

Composites all agent outputs from today into a unified risk environment score.
Detects multi-factor stress confluences.

Runs last at 17:30 ET after all market-close agents have settled.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_RISK_REGIME_FIT, PLACEMENT_SCENARIO_STRESS,
    PLACEMENT_PORTFOLIO_OVERVIEW, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_INTELLIGENCE_TERMINAL,
)
from app.agents.registry import DOMAIN_RISK
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.risk")

_PLACEMENTS = [
    PLACEMENT_RISK_REGIME_FIT, PLACEMENT_SCENARIO_STRESS,
    PLACEMENT_PORTFOLIO_OVERVIEW, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_INTELLIGENCE_TERMINAL,
]

_SEVERITY_WEIGHTS = {"high": 1.0, "medium": 0.5, "info": 0.1, "low": 0.1}


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    agent_out = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    today = datetime.now(timezone.utc).date().isoformat()

    # Pull all today's agent outputs (excluding risk_agent itself)
    sql = f"""
        SELECT agent_id, domain, artifact_type, title, summary,
               severity, confidence, tags, evidence
        FROM `{agent_out}`
        WHERE DATE(observation_date) = '{today}'
          AND agent_id != 'risk_agent'
          AND is_test = FALSE
        ORDER BY generated_at DESC
    """
    try:
        rows = list(bq.query(sql).result())
    except Exception as e:
        log.warning("risk_agent.query_failed", error=str(e))
        return []

    if not rows:
        return []

    # Compute risk environment score
    domain_severities: dict[str, list[str]] = {}
    for r in rows:
        domain = r["domain"] or "unknown"
        sev = r["severity"] or "info"
        domain_severities.setdefault(domain, []).append(sev)

    # Worst severity per domain → risk score contribution
    domain_scores: dict[str, float] = {}
    for domain, sevs in domain_severities.items():
        worst = max(sevs, key=lambda s: _SEVERITY_WEIGHTS.get(s, 0))
        domain_scores[domain] = _SEVERITY_WEIGHTS.get(worst, 0)

    # Confluence detection — multiple domains flagging high/medium simultaneously
    high_domains = [d for d, s in domain_scores.items() if s >= 1.0]
    medium_domains = [d for d, s in domain_scores.items() if s >= 0.5]

    raw_score = sum(domain_scores.values()) / max(len(domain_scores), 1)
    # Amplify confluences: 2+ high = stress; 3+ medium = caution
    if len(high_domains) >= 2:
        risk_level = "elevated"
        composite_score = min(1.0, raw_score * 1.5)
        severity = SEVERITY_HIGH
    elif len(medium_domains) >= 3 or raw_score > 0.5:
        risk_level = "cautionary"
        composite_score = raw_score
        severity = SEVERITY_MEDIUM
    elif raw_score > 0.2:
        risk_level = "moderate"
        composite_score = raw_score
        severity = SEVERITY_INFO
    else:
        risk_level = "benign"
        composite_score = raw_score
        severity = SEVERITY_INFO

    confidence = min(0.85, 0.40 + composite_score * 0.60)

    # Build evidence narrative
    evidence_lines = [f"- **{d.replace('_', ' ').title()}**: {s:.0%} risk weight" for d, s in sorted(domain_scores.items(), key=lambda x: -x[1])]
    if high_domains:
        confluence_note = f"\n\n**Risk confluence detected** across: {', '.join(high_domains)}."
    elif medium_domains:
        confluence_note = f"\n\nMultiple domains at medium risk: {', '.join(medium_domains[:4])}."
    else:
        confluence_note = ""

    outputs = [AgentOutput(
        agent_id="risk_agent",
        domain=DOMAIN_RISK,
        artifact_type="risk_observation",
        title=f"Risk Environment: {risk_level.title()} (Score {composite_score:.2f})",
        summary=(
            f"Composite risk environment: **{risk_level}**. "
            f"{len(rows)} intelligence signals composited across {len(domain_scores)} domains."
        ),
        body=(
            f"## Risk Environment Composite\n\n"
            f"**Classification: {risk_level.title()}** "
            f"(composite score {composite_score:.2f}, confidence {confidence:.0%})\n\n"
            f"### Domain Risk Weights\n"
            + "\n".join(evidence_lines)
            + confluence_note
            + "\n\n"
            f"_Source: {len(rows)} agent observations from today. "
            f"Human judgement required for all portfolio decisions._"
        ),
        confidence=round(confidence, 3),
        severity=severity,
        symbols=[],
        portfolio_id=portfolio_id,
        evidence={
            "risk_level": risk_level,
            "composite_score": round(composite_score, 4),
            "domain_scores": domain_scores,
            "high_domains": high_domains,
            "medium_domains": medium_domains,
            "signal_count": len(rows),
        },
        source_tables=[agent_out],
        observation_date=today,
        recommended_placements=_PLACEMENTS,
        tags=["risk", risk_level, "composite", "environment"],
    )]

    log.info("risk_agent.complete", risk_level=risk_level, score=round(composite_score, 3))
    return outputs
