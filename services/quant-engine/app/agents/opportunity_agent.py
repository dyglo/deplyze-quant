"""
Opportunity Agent — V4 Intelligence Domain: Opportunity.

Scores asymmetric setups by compositing:
  - Momentum features (trend strength + persistence)
  - Volatility percentile rank (low vol + momentum = compression setup)
  - Narrative catalyst alignment (from narrative_artifacts)

IMPORTANT: This agent surfaces anomalies worth monitoring.
It does NOT generate trade signals, buy/sell recommendations,
or guaranteed predictions of any kind.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_INSTRUMENT_INTELLIGENCE,
    PLACEMENT_RESEARCH_COPILOT,
)
from app.agents.registry import DOMAIN_OPPORTUNITY
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.opportunity")

_PLACEMENTS = [
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_INSTRUMENT_INTELLIGENCE,
    PLACEMENT_RESEARCH_COPILOT,
]


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    vol_table = fully_qualified(settings.BQ_DATASET_FEATURES, "volatility_features")
    mom_table = fully_qualified(settings.BQ_DATASET_FEATURES, "momentum_features")
    today = datetime.now(timezone.utc).date().isoformat()

    # Join vol + momentum features for asymmetric setup scoring
    sql = f"""
        SELECT
          v.symbol,
          v.annualised_vol,
          v.vol_percentile_rank,
          v.volatility_regime,
          v.vol_trend,
          m.trend_label,
          m.momentum_score,
          m.trend_strength,
          m.momentum_persistence
        FROM (
          SELECT symbol, annualised_vol, vol_percentile_rank, volatility_regime,
                 vol_trend, observation_time
          FROM `{vol_table}`
          WHERE DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)
        ) v
        LEFT JOIN (
          SELECT symbol, trend_label, momentum_score, trend_strength,
                 momentum_persistence, observation_time
          FROM `{mom_table}`
          WHERE DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)
        ) m ON v.symbol = m.symbol
        ORDER BY v.observation_time DESC, m.observation_time DESC
    """
    try:
        all_rows = list(bq.query(sql).result())
    except Exception as e:
        log.warning("opportunity_agent.query_failed", error=str(e))
        return []

    # Deduplicate — latest per symbol
    seen: set[str] = set()
    rows = []
    for r in all_rows:
        if r["symbol"] not in seen:
            seen.add(r["symbol"])
            rows.append(r)

    if not rows:
        return []

    # Score each symbol: compression setup = low vol pct + positive momentum
    scored = []
    for r in rows:
        vol_pct = float(r["vol_percentile_rank"] or 0.5)
        mom_score = float(r["momentum_score"] or 0.0)
        trend_str = float(r["trend_strength"] or 0.0)
        regime = r["volatility_regime"] or "normal"
        trend = r["trend_label"] or "flat"

        # Compression + momentum setup
        if regime == "compression" and trend in ("up", "strong-up") and mom_score > 0:
            asym_score = (1 - vol_pct) * 0.5 + mom_score * 0.3 + trend_str * 0.2
            label = "compression_breakout_candidate"
        # Vol expansion + weak momentum (potential mean reversion)
        elif regime in ("expansion", "high") and vol_pct > 0.8 and mom_score < 0:
            asym_score = vol_pct * 0.4 + abs(mom_score) * 0.3 + trend_str * 0.1
            label = "elevated_vol_attention"
        else:
            continue

        scored.append({
            "symbol": r["symbol"],
            "score": round(asym_score, 4),
            "label": label,
            "vol_pct": round(vol_pct, 3),
            "mom_score": round(mom_score, 3),
            "regime": regime,
            "trend": trend,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:10]

    outputs: list[AgentOutput] = []

    if top:
        compression = [s for s in top if s["label"] == "compression_breakout_candidate"]
        attention = [s for s in top if s["label"] == "elevated_vol_attention"]

        if compression:
            syms = [s["symbol"] for s in compression]
            outputs.append(AgentOutput(
                agent_id="opportunity_agent",
                domain=DOMAIN_OPPORTUNITY,
                artifact_type="opportunity_observation",
                title=f"Compression Setup Monitor: {', '.join(syms[:5])}",
                summary=(
                    f"{len(compression)} instrument(s) showing vol compression + positive "
                    f"momentum alignment. Anomalies for further research — not trade signals."
                ),
                body=(
                    f"## Compression Setups Detected ({len(compression)} instruments)\n\n"
                    f"The opportunity engine identified instruments with simultaneous "
                    f"vol compression and positive momentum. These are research anomalies "
                    f"for human review — not investment recommendations.\n\n"
                    f"| Symbol | Vol Pct | Momentum | Trend |\n|---|---|---|---|\n"
                    + "\n".join(
                        f"| {s['symbol']} | {s['vol_pct']:.0%} | {s['mom_score']:+.2f} | {s['trend']} |"
                        for s in compression[:8]
                    )
                    + "\n\n_Source: volatility + momentum features. Human judgement required._"
                ),
                confidence=min(0.70, 0.35 + (sum(s["score"] for s in compression) / len(compression))),
                severity=SEVERITY_INFO,
                symbols=syms,
                evidence={"setups": compression[:8]},
                source_tables=[vol_table, mom_table],
                observation_date=today,
                recommended_placements=_PLACEMENTS,
                tags=["opportunity", "compression", "momentum"],
            ))

        if attention:
            syms = [s["symbol"] for s in attention]
            outputs.append(AgentOutput(
                agent_id="opportunity_agent",
                domain=DOMAIN_OPPORTUNITY,
                artifact_type="opportunity_observation",
                title=f"Vol Elevation Monitor: {', '.join(syms[:4])}",
                summary=(
                    f"{len(attention)} instrument(s) with elevated vol + weakening momentum. "
                    f"Monitoring context, not actionable signal."
                ),
                body=(
                    f"{len(attention)} instruments detected with vol above 80th percentile "
                    f"and weakening momentum: {', '.join(syms)}."
                ),
                confidence=0.60,
                severity=SEVERITY_INFO,
                symbols=syms,
                evidence={"setups": attention[:8]},
                source_tables=[vol_table, mom_table],
                observation_date=today,
                recommended_placements=_PLACEMENTS,
                tags=["opportunity", "vol_elevated", "momentum"],
            ))

    log.info("opportunity_agent.complete", outputs=len(outputs), scored=len(scored))
    return outputs
