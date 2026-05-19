"""
Cross-Asset Agent — V4 Intelligence Domain: Cross-Asset.

Reads correlation_features (written by the daily pipeline's correlationDrift
computation) and detects:
  - Canonical pair breakdown events (Gold/USD, Bonds/Equities, BTC/Risk)
  - Universe-wide correlation compression (risk-on clustering)
  - Dependency-shift anomalies (sudden regime change in pair relationships)

Runs at 17:00 ET after close, after vol agent.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_RISK_REGIME_FIT, PLACEMENT_INSTRUMENT_INTELLIGENCE,
)
from app.agents.registry import DOMAIN_CROSS_ASSET
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.cross_asset")

_PLACEMENTS = [
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_RISK_REGIME_FIT, PLACEMENT_INSTRUMENT_INTELLIGENCE,
]

# Canonical pairs we monitor for breakdown events
_CANONICAL_PAIRS = [
    ("GLD", "UUP"),    # Gold / USD — normally negative
    ("TLT", "SPY"),    # Bonds / Equities — risk-off / risk-on
    ("BTC/USD", "SPY"), # Crypto / Risk
    ("GLD", "TLT"),    # Safe-haven cluster
    ("HYG", "SPY"),    # Credit / Equity
]


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    corr_table = fully_qualified(settings.BQ_DATASET_FEATURES, "correlation_features")
    today = datetime.now(timezone.utc).date().isoformat()

    sql = f"""
        SELECT symbol_a, symbol_b, current_correlation, baseline_correlation,
               drift_magnitude, drift_direction, regime_shift, observation_time
        FROM `{corr_table}`
        WHERE DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
          AND drift_magnitude IS NOT NULL
        ORDER BY drift_magnitude DESC
        LIMIT 50
    """
    try:
        rows = list(bq.query(sql).result())
    except Exception as e:
        log.warning("cross_asset_agent.query_failed", error=str(e))
        return []

    if not rows:
        return []

    outputs: list[AgentOutput] = []

    # ── Detect canonical pair breakdowns ──────────────────────────────────────
    pair_map: dict[tuple, dict] = {}
    for r in rows:
        key = (r["symbol_a"], r["symbol_b"])
        rev = (r["symbol_b"], r["symbol_a"])
        if key not in pair_map and rev not in pair_map:
            pair_map[key] = dict(r)

    breakdown_events = []
    for pair in _CANONICAL_PAIRS:
        fwd = pair
        rev = (pair[1], pair[0])
        row = pair_map.get(fwd) or pair_map.get(rev)
        if not row:
            continue
        dm = float(row.get("drift_magnitude") or 0)
        if dm > 0.25 or row.get("regime_shift"):
            breakdown_events.append({
                "pair": pair,
                "current_corr": row.get("current_correlation"),
                "baseline_corr": row.get("baseline_correlation"),
                "drift": dm,
                "direction": row.get("drift_direction"),
                "regime_shift": row.get("regime_shift"),
            })

    if breakdown_events:
        pair_strs = [f"{b['pair'][0]}/{b['pair'][1]}" for b in breakdown_events]
        max_drift = max(b["drift"] for b in breakdown_events)
        sev = SEVERITY_HIGH if max_drift > 0.4 else SEVERITY_MEDIUM

        outputs.append(AgentOutput(
            agent_id="cross_asset_agent",
            domain=DOMAIN_CROSS_ASSET,
            artifact_type="cross_asset_observation",
            title=f"Correlation Breakdown: {', '.join(pair_strs[:3])}",
            summary=(
                f"Cross-asset correlation surveillance detected breakdown in "
                f"{len(breakdown_events)} canonical relationship(s): {', '.join(pair_strs)}."
            ),
            body=(
                f"**Correlation breakdown alert**: {len(breakdown_events)} canonical pair(s) showing "
                f"significant drift from historical baseline.\n\n"
                + "\n".join(
                    f"- **{b['pair'][0]}/{b['pair'][1]}**: "
                    f"current {b['current_corr']:.2f} vs baseline {b['baseline_corr']:.2f} "
                    f"(drift {b['drift']:.2f}, {b['direction'] or 'unknown'} direction)"
                    for b in breakdown_events
                    if b.get("current_corr") is not None and b.get("baseline_corr") is not None
                )
            ),
            confidence=min(0.9, 0.5 + max_drift),
            severity=sev,
            symbols=list({s for pair in [b["pair"] for b in breakdown_events] for s in pair}),
            evidence={"breakdown_events": breakdown_events},
            source_tables=[corr_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["cross_asset", "correlation", "breakdown"],
        ))

    # ── Top drift events (broader universe) ───────────────────────────────────
    top_drifts = sorted(rows, key=lambda r: float(r.get("drift_magnitude") or 0), reverse=True)[:5]
    if top_drifts:
        td = top_drifts[0]
        dm = float(td.get("drift_magnitude") or 0)
        if dm > 0.20:
            outputs.append(AgentOutput(
                agent_id="cross_asset_agent",
                domain=DOMAIN_CROSS_ASSET,
                artifact_type="cross_asset_observation",
                title=f"Dependency Shift: {td['symbol_a']}/{td['symbol_b']} ({dm:.2f} drift)",
                summary=(
                    f"Largest correlation drift in the universe: "
                    f"{td['symbol_a']}/{td['symbol_b']} at {dm:.2f} magnitude."
                ),
                body=(
                    f"Correlation dependency shift detected. "
                    f"{td['symbol_a']}/{td['symbol_b']}: "
                    f"current {td.get('current_correlation', 'n/a')}, "
                    f"baseline {td.get('baseline_correlation', 'n/a')}, "
                    f"drift {dm:.2f} ({td.get('drift_direction', '')}). "
                    f"Regime shift flagged: {bool(td.get('regime_shift'))}."
                ),
                confidence=min(0.85, 0.4 + dm),
                severity=SEVERITY_MEDIUM if dm < 0.4 else SEVERITY_HIGH,
                symbols=[td["symbol_a"], td["symbol_b"]],
                evidence={
                    "top_drift_pairs": [
                        {
                            "pair": f"{r['symbol_a']}/{r['symbol_b']}",
                            "drift": float(r.get("drift_magnitude") or 0),
                            "direction": r.get("drift_direction"),
                        }
                        for r in top_drifts
                    ],
                },
                source_tables=[corr_table],
                observation_date=today,
                recommended_placements=_PLACEMENTS,
                tags=["cross_asset", "correlation", "drift"],
            ))

    log.info("cross_asset_agent.complete", outputs=len(outputs))
    return outputs
