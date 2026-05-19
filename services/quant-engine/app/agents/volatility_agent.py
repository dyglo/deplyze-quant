"""
Volatility Agent — V4 Intelligence Domain: Volatility.

Surveys the volatility_features table (written by the daily pipeline) to produce:
  1. Universe-wide vol regime summary (expansion / normal / compression / high)
  2. Per-symbol vol anomaly events (top movers by vol percentile rank)
  3. Vol-of-vol observation (dispersion across the instrument universe)

Runs at 16:30 ET after market close.
"""

from __future__ import annotations

import statistics
from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW, SEVERITY_INFO,
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_RISK_REGIME_FIT, PLACEMENT_INSTRUMENT_INTELLIGENCE,
    PLACEMENT_SCENARIO_STRESS,
)
from app.agents.registry import DOMAIN_VOLATILITY
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.volatility")

_PLACEMENTS = [
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RISK_REGIME_FIT,
    PLACEMENT_INSTRUMENT_INTELLIGENCE, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_SCENARIO_STRESS,
]


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    vol_table = fully_qualified(settings.BQ_DATASET_FEATURES, "volatility_features")
    today = datetime.now(timezone.utc).date().isoformat()

    sql = f"""
        SELECT symbol, volatility_regime, annualised_vol, vol_percentile_rank,
               vol_trend, atr_percentile
        FROM `{vol_table}`
        WHERE DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)
          AND annualised_vol IS NOT NULL
        ORDER BY observation_time DESC
    """
    try:
        all_rows = list(bq.query(sql).result())
    except Exception as e:
        log.warning("volatility_agent.query_failed", error=str(e))
        return []

    # Deduplicate — latest row per symbol
    seen: set[str] = set()
    rows = []
    for r in all_rows:
        if r["symbol"] not in seen:
            seen.add(r["symbol"])
            rows.append(r)

    if not rows:
        return []

    outputs: list[AgentOutput] = []
    vols = [float(r["annualised_vol"]) for r in rows if r["annualised_vol"]]
    pcts = [float(r["vol_percentile_rank"]) for r in rows if r["vol_percentile_rank"] is not None]
    regimes = [r["volatility_regime"] for r in rows if r["volatility_regime"]]

    # ── Output 1: Universe vol regime summary ─────────────────────────────────
    if vols and pcts:
        med_vol = statistics.median(vols)
        med_pct = statistics.median(pcts)
        expansion_count = sum(1 for r in regimes if r in ("expansion", "high"))
        compression_count = sum(1 for r in regimes if r == "compression")

        if med_pct > 0.80 or expansion_count / len(regimes) > 0.5:
            universe_regime = "elevated"
            severity = SEVERITY_HIGH
            body = (
                f"Volatility universe scan: **elevated** regime detected. "
                f"Median annualised vol {med_vol:.1f}% at {med_pct:.0%} historical percentile. "
                f"{expansion_count}/{len(rows)} instruments in vol-expansion or high-vol state."
            )
        elif med_pct < 0.25 or compression_count / len(regimes) > 0.4:
            universe_regime = "compressed"
            severity = SEVERITY_MEDIUM
            body = (
                f"Volatility compression detected across {compression_count}/{len(rows)} instruments. "
                f"Median vol {med_vol:.1f}% at {med_pct:.0%} percentile. "
                f"Historically, prolonged compression has preceded sharp vol normalisations."
            )
        else:
            universe_regime = "normal"
            severity = SEVERITY_INFO
            body = (
                f"Volatility universe: **normal** regime. "
                f"Median vol {med_vol:.1f}% at {med_pct:.0%} percentile across {len(rows)} instruments."
            )

        conf = 0.75 if len(rows) >= 10 else 0.5

        outputs.append(AgentOutput(
            agent_id="volatility_agent",
            domain=DOMAIN_VOLATILITY,
            artifact_type="volatility_observation",
            title=f"Universe Volatility: {universe_regime.title()} Regime",
            summary=f"Cross-market volatility surveillance: {universe_regime} regime ({len(rows)} instruments).",
            body=body,
            confidence=conf,
            severity=severity,
            symbols=[],
            evidence={
                "universe_regime": universe_regime,
                "median_vol": round(med_vol, 2),
                "median_pct_rank": round(med_pct, 3),
                "expansion_count": expansion_count,
                "compression_count": compression_count,
                "instrument_count": len(rows),
            },
            source_tables=[vol_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["volatility", universe_regime, "universe"],
        ))

    # ── Output 2: Top vol anomalies (expansion + high pct rank) ───────────────
    anomalies = [
        r for r in rows
        if r["vol_percentile_rank"] is not None
        and float(r["vol_percentile_rank"]) > 0.85
        and r["volatility_regime"] in ("expansion", "high")
    ]
    anomalies.sort(key=lambda r: float(r["vol_percentile_rank"] or 0), reverse=True)
    top_anomalies = anomalies[:8]

    if top_anomalies:
        syms = [r["symbol"] for r in top_anomalies]
        max_pct = float(top_anomalies[0]["vol_percentile_rank"])
        sev = SEVERITY_HIGH if max_pct > 0.95 else SEVERITY_MEDIUM

        outputs.append(AgentOutput(
            agent_id="volatility_agent",
            domain=DOMAIN_VOLATILITY,
            artifact_type="volatility_observation",
            title=f"Vol Expansion Alert: {len(top_anomalies)} Instruments Above 85th Percentile",
            summary=(
                f"{', '.join(syms[:5])}{'…' if len(syms) > 5 else ''} showing vol expansion "
                f"above historical 85th percentile."
            ),
            body=(
                f"Volatility surveillance detected {len(top_anomalies)} instruments "
                f"with annualised vol above 85th historical percentile. "
                f"Highest: {syms[0]} at {max_pct:.0%} pct rank. "
                f"Affected: {', '.join(syms[:8])}."
            ),
            confidence=0.80,
            severity=sev,
            symbols=syms,
            evidence={
                "anomaly_symbols": [
                    {
                        "symbol": r["symbol"],
                        "vol": round(float(r["annualised_vol"] or 0), 2),
                        "pct_rank": round(float(r["vol_percentile_rank"] or 0), 3),
                        "regime": r["volatility_regime"],
                    }
                    for r in top_anomalies
                ],
            },
            source_tables=[vol_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["volatility", "anomaly", "expansion"],
        ))

    log.info("volatility_agent.complete", outputs=len(outputs), instruments=len(rows))
    return outputs
