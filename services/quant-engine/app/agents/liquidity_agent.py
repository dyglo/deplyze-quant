"""
Liquidity Agent — V4 Intelligence Domain: Liquidity.

Reads the liquidity_regime observations already classified by macro_regime.py
and produces a focused liquidity stress assessment with evidence-backed context.

Detects:
  - Liquidity stress windows (RRP drain + DXY surge + M2 contraction)
  - Fed balance sheet trend reversals
  - Global USD funding pressure

Runs at 10:00 ET (after FRED refresh + macro_regime classifier).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_MACRO_REGIME_DESK, PLACEMENT_INTELLIGENCE_TERMINAL,
    PLACEMENT_RESEARCH_COPILOT, PLACEMENT_RISK_REGIME_FIT,
    PLACEMENT_SCENARIO_STRESS,
)
from app.agents.registry import DOMAIN_LIQUIDITY
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.liquidity")

_PLACEMENTS = [
    PLACEMENT_MACRO_REGIME_DESK, PLACEMENT_INTELLIGENCE_TERMINAL,
    PLACEMENT_RESEARCH_COPILOT, PLACEMENT_RISK_REGIME_FIT,
    PLACEMENT_SCENARIO_STRESS,
]

_STRESS_SERIES = ["WALCL", "M2SL", "RRPONTSYD", "DTWEXBGS"]


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    macro_obs = fully_qualified(settings.BQ_DATASET_RESEARCH, "macro_observations")
    macro_feat = fully_qualified(settings.BQ_DATASET_FEATURES, "macro_features")
    today = datetime.now(timezone.utc).date().isoformat()

    # Pull latest liquidity observation
    sql_obs = f"""
        SELECT regime_state, title, summary, body, confidence, severity,
               related_series
        FROM `{macro_obs}`
        WHERE observation_type = 'liquidity_regime'
          AND DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
        ORDER BY observation_time DESC
        LIMIT 1
    """
    try:
        obs_rows = list(bq.query(sql_obs).result())
    except Exception as e:
        log.warning("liquidity_agent.obs_query_failed", error=str(e))
        obs_rows = []

    # Pull series-level evidence
    sql_feat = f"""
        SELECT series_id, value, yoy_change, trend_label, regime_label,
               zscore_36m, percentile_120m
        FROM `{macro_feat}`
        WHERE series_id IN ({', '.join(f"'{s}'" for s in _STRESS_SERIES)})
          AND DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY)
        ORDER BY series_id, observation_time DESC
    """
    try:
        feat_rows = list(bq.query(sql_feat).result())
    except Exception as e:
        log.warning("liquidity_agent.feat_query_failed", error=str(e))
        feat_rows = []

    # Deduplicate — latest per series
    series_snap: dict[str, dict] = {}
    for r in feat_rows:
        sid = r["series_id"]
        if sid not in series_snap:
            series_snap[sid] = dict(r)

    outputs: list[AgentOutput] = []

    # ── Stress composite ──────────────────────────────────────────────────────
    stress_signals: list[str] = []
    walcl = series_snap.get("WALCL")
    m2 = series_snap.get("M2SL")
    rrp = series_snap.get("RRPONTSYD")
    dxy = series_snap.get("DTWEXBGS")

    if walcl and walcl.get("trend_label") == "down":
        stress_signals.append("Fed balance sheet contracting")
    if m2 and m2.get("yoy_change") is not None and float(m2["yoy_change"]) < 0:
        stress_signals.append(f"M2 YoY negative ({float(m2['yoy_change']):.2%})")
    if rrp and rrp.get("trend_label") == "up":
        stress_signals.append("ON RRP rising (liquidity draining into Fed)")
    if dxy and dxy.get("trend_label") == "up":
        stress_signals.append("USD strengthening (global liquidity tightening)")

    # Use macro_obs regime if available
    if obs_rows:
        obs = obs_rows[0]
        regime = obs["regime_state"]
        conf = float(obs["confidence"] or 0.5)
        obs_body = obs["body"] or ""

        sev_map = {
            "stressed": SEVERITY_HIGH,
            "contracting": SEVERITY_MEDIUM,
            "neutral": SEVERITY_INFO,
            "expanding": SEVERITY_INFO,
        }
        severity = sev_map.get(regime, SEVERITY_INFO)

        if stress_signals:
            stress_note = f" Active stress signals: {'; '.join(stress_signals)}."
        else:
            stress_note = " No acute stress signals detected."

        outputs.append(AgentOutput(
            agent_id="liquidity_agent",
            domain=DOMAIN_LIQUIDITY,
            artifact_type="liquidity_observation",
            title=f"Liquidity Environment: {regime.title()}",
            summary=obs["summary"] or f"Global liquidity regime: {regime}.",
            body=obs_body + stress_note,
            confidence=conf,
            severity=severity,
            symbols=[],
            evidence={
                "regime_state": regime,
                "stress_signals": stress_signals,
                "series": {
                    sid: {
                        "value": s.get("value"),
                        "trend": s.get("trend_label"),
                        "yoy": s.get("yoy_change"),
                        "zscore": s.get("zscore_36m"),
                    }
                    for sid, s in series_snap.items()
                },
            },
            source_tables=[macro_obs, macro_feat],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["liquidity", regime, "macro"],
        ))
    elif stress_signals:
        # Fallback if no obs table data — construct from features directly
        outputs.append(AgentOutput(
            agent_id="liquidity_agent",
            domain=DOMAIN_LIQUIDITY,
            artifact_type="liquidity_observation",
            title="Liquidity Stress Signals Detected",
            summary=f"Liquidity stress signals: {'; '.join(stress_signals[:3])}.",
            body=f"Liquidity surveillance detected: {'; '.join(stress_signals)}.",
            confidence=0.55,
            severity=SEVERITY_MEDIUM,
            symbols=[],
            evidence={"stress_signals": stress_signals},
            source_tables=[macro_feat],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["liquidity", "stress", "macro"],
        ))

    log.info("liquidity_agent.complete", outputs=len(outputs), stress_signals=len(stress_signals))
    return outputs
