"""
Regime Agent — V4 Intelligence Domain: Regime.

Composites macro (liquidity, inflation, rates, growth) + volatility universe
outputs into a single unified regime label (risk-on / risk-off / transition /
stagflation / recovery). Detects regime transition events.

Reads from:
  - research.macro_observations (all four macro classifiers)
  - artifacts.agent_outputs (volatility + liquidity agent outputs from today)

Writes regime_transition artifacts to artifacts.agent_outputs.
Runs after macro + liquidity + vol agents have all settled (10:15 ET).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_MACRO_REGIME_DESK, PLACEMENT_INTELLIGENCE_TERMINAL,
    PLACEMENT_RESEARCH_COPILOT, PLACEMENT_PORTFOLIO_OVERVIEW,
    PLACEMENT_RISK_REGIME_FIT, PLACEMENT_SCENARIO_STRESS,
)
from app.agents.registry import DOMAIN_REGIME
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.regime")

_PLACEMENTS = [
    PLACEMENT_MACRO_REGIME_DESK, PLACEMENT_INTELLIGENCE_TERMINAL,
    PLACEMENT_RESEARCH_COPILOT, PLACEMENT_PORTFOLIO_OVERVIEW,
    PLACEMENT_RISK_REGIME_FIT, PLACEMENT_SCENARIO_STRESS,
]

# Composite scoring grid
_GROWTH_SCORE = {"expansion": 1.0, "recovery": 0.5, "slowdown": -0.5, "contraction": -1.0}
_LIQUIDITY_SCORE = {"expanding": 1.0, "neutral": 0.0, "contracting": -0.5, "stressed": -1.0}
_INFLATION_SCORE = {"stable": 0.5, "disinflating": 0.3, "deflationary": 0.0, "sticky": -0.3, "accelerating": -0.8}


def _composite_label(growth: str, liquidity: str, inflation: str, vol: str) -> tuple[str, float]:
    g = _GROWTH_SCORE.get(growth, 0.0)
    l_ = _LIQUIDITY_SCORE.get(liquidity, 0.0)
    i = _INFLATION_SCORE.get(inflation, 0.0)
    v = -0.5 if vol in ("elevated", "expansion", "high") else 0.3 if vol == "compressed" else 0.0

    score = g * 0.35 + l_ * 0.30 + i * 0.20 + v * 0.15

    if score >= 0.5:
        label = "risk-on"
    elif score >= 0.1:
        label = "mild-risk-on"
    elif score >= -0.1:
        label = "transition"
    elif score >= -0.5:
        label = "mild-risk-off"
    else:
        label = "risk-off"

    # Override for stagflation: growth bad + inflation bad
    if g < -0.25 and i < -0.3:
        label = "stagflation"

    confidence = min(0.90, 0.40 + abs(score) * 0.80)
    return label, round(confidence, 3)


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    macro_obs = fully_qualified(settings.BQ_DATASET_RESEARCH, "macro_observations")
    agent_out = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    today = datetime.now(timezone.utc).date().isoformat()

    # Load macro observations
    sql_macro = f"""
        SELECT observation_type, regime_state, confidence
        FROM `{macro_obs}`
        WHERE observation_type IN (
            'liquidity_regime', 'inflation_regime', 'rates_regime', 'growth_regime'
        )
          AND DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
        ORDER BY observation_time DESC
        LIMIT 4
    """
    try:
        macro_rows = list(bq.query(sql_macro).result())
    except Exception as e:
        log.warning("regime_agent.macro_query_failed", error=str(e))
        macro_rows = []

    # Load today's vol agent output
    sql_vol = f"""
        SELECT title, evidence, confidence
        FROM `{agent_out}`
        WHERE agent_id = 'volatility_agent'
          AND DATE(observation_date) = '{today}'
          AND artifact_type = 'volatility_observation'
        ORDER BY generated_at DESC
        LIMIT 1
    """
    try:
        vol_rows = list(bq.query(sql_vol).result())
    except Exception as e:
        log.warning("regime_agent.vol_query_failed", error=str(e))
        vol_rows = []

    # Extract regime states
    macro_states: dict[str, str] = {}
    for r in macro_rows:
        kind = r["observation_type"].replace("_regime", "")
        if kind not in macro_states:
            macro_states[kind] = r["regime_state"] or "unknown"

    growth = macro_states.get("growth", "slowdown")
    liquidity = macro_states.get("liquidity", "neutral")
    inflation = macro_states.get("inflation", "stable")
    rates = macro_states.get("rates", "neutral")

    vol_regime = "normal"
    if vol_rows:
        import json as _json
        ev = vol_rows[0].get("evidence") or {}
        if isinstance(ev, str):
            try:
                ev = _json.loads(ev)
            except Exception:
                ev = {}
        vol_regime = ev.get("universe_regime", "normal")

    composite, confidence = _composite_label(growth, liquidity, inflation, vol_regime)

    sev_map = {
        "risk-off": SEVERITY_HIGH,
        "stagflation": SEVERITY_HIGH,
        "mild-risk-off": SEVERITY_MEDIUM,
        "transition": SEVERITY_MEDIUM,
        "mild-risk-on": SEVERITY_INFO,
        "risk-on": SEVERITY_INFO,
    }
    severity = sev_map.get(composite, SEVERITY_INFO)

    outputs = [AgentOutput(
        agent_id="regime_agent",
        domain=DOMAIN_REGIME,
        artifact_type="regime_transition",
        title=f"Composite Market Regime: {composite.title()}",
        summary=(
            f"Regime composite classifies the current environment as **{composite}**. "
            f"Growth: {growth} | Liquidity: {liquidity} | Inflation: {inflation} | "
            f"Volatility: {vol_regime}."
        ),
        body=(
            f"## Composite Regime: {composite.title()}\n\n"
            f"The Deplyze regime engine composites four macro dimensions and volatility "
            f"surveillance into a unified market regime classification.\n\n"
            f"| Dimension | State |\n|---|---|\n"
            f"| Growth | {growth} |\n"
            f"| Liquidity | {liquidity} |\n"
            f"| Inflation | {inflation} |\n"
            f"| Rates | {rates} |\n"
            f"| Volatility Universe | {vol_regime} |\n\n"
            f"**Composite regime: {composite}** (confidence {confidence:.0%}). "
            f"This classification is deterministic and evidence-based. "
            f"Human judgement required for portfolio decisions."
        ),
        confidence=confidence,
        severity=severity,
        symbols=[],
        portfolio_id=portfolio_id,
        evidence={
            "composite_regime": composite,
            "growth": growth,
            "liquidity": liquidity,
            "inflation": inflation,
            "rates": rates,
            "vol_universe": vol_regime,
        },
        source_tables=[macro_obs, agent_out],
        observation_date=today,
        recommended_placements=_PLACEMENTS,
        tags=["regime", composite, "macro", "composite"],
    )]

    log.info("regime_agent.complete", regime=composite, confidence=confidence)
    return outputs
