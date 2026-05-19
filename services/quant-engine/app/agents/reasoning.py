"""
Multi-System Contextual Reasoning Engine — V4 Phase 2.

Synthesises all of today's agent_outputs into cross-domain reasoning narratives.
Instead of surfacing isolated observations, this engine detects cross-signal
patterns and produces evidence-backed synthesis statements.

Examples of synthesis:
  "Volatility expansion is occurring while liquidity weakens and AI narrative
   breadth deteriorates — a pattern historically associated with elevated
   instability for growth-heavy portfolios."

Reads from: artifacts.agent_outputs (today)
Writes to:  artifacts.agent_outputs (artifact_type='multi_system_reasoning')
"""

from __future__ import annotations

import json
import statistics
from datetime import datetime, timezone
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_PORTFOLIO_OVERVIEW, PLACEMENT_RISK_REGIME_FIT,
    PLACEMENT_SCENARIO_STRESS,
)
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.reasoning")

_PLACEMENTS = [
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_PORTFOLIO_OVERVIEW, PLACEMENT_RISK_REGIME_FIT,
    PLACEMENT_SCENARIO_STRESS,
]

# Cross-domain pattern definitions — each maps a condition tuple to a synthesis
_PATTERNS = [
    {
        "id": "vol_liquidity_stress",
        "requires": {"volatility": "elevated", "liquidity": "contracting"},
        "title": "Compounding Stress: Vol Expansion + Liquidity Contraction",
        "body": (
            "Volatility expansion is occurring while system liquidity contracts — "
            "a historically unstable combination. Elevated vol in a tightening "
            "liquidity environment has been associated with increased correlation "
            "across risk assets and reduced ability to absorb drawdowns. "
            "Growth-heavy and leveraged portfolios are disproportionately exposed."
        ),
        "severity": SEVERITY_HIGH,
        "confidence": 0.78,
        "tags": ["vol_liquidity_stress", "multi_signal", "risk"],
    },
    {
        "id": "vol_liquidity_compression",
        "requires": {"volatility": "compressed", "liquidity": "expanding"},
        "title": "Complacency Window: Vol Compression + Liquidity Expansion",
        "body": (
            "Simultaneous volatility compression and liquidity expansion creates "
            "a complacency window. Historically, this combination has been "
            "associated with rising asset prices but increasing fragility — "
            "volatility is suppressed artificially. When conditions normalise, "
            "vol reversion can be rapid and severe."
        ),
        "severity": SEVERITY_MEDIUM,
        "confidence": 0.65,
        "tags": ["complacency", "vol_compression", "liquidity_expansion"],
    },
    {
        "id": "stagflation_risk",
        "requires": {"regime": "stagflation", "liquidity": "contracting"},
        "title": "Stagflation Signal: Deteriorating Growth + Sticky Inflation",
        "body": (
            "The regime engine classifies the current environment as stagflationary — "
            "growth weakening while inflation remains elevated. Combined with "
            "contracting liquidity, this creates a difficult regime for most "
            "traditional asset allocations. Bonds face duration risk while equities "
            "face earnings pressure. Real assets (commodities, TIPS) have historically "
            "performed better in this regime."
        ),
        "severity": SEVERITY_HIGH,
        "confidence": 0.72,
        "tags": ["stagflation", "macro", "multi_signal"],
    },
    {
        "id": "risk_off_consensus",
        "requires": {"regime": "risk-off", "sentiment": "risk-off", "volatility": "elevated"},
        "title": "Three-Domain Risk-Off Consensus",
        "body": (
            "Regime classification, sentiment surveillance, and volatility "
            "surveillance all point toward risk-off conditions simultaneously. "
            "Three-domain consensus is a stronger signal than any individual "
            "observation. Historically associated with accelerating downside "
            "momentum and correlation spikes across portfolios."
        ),
        "severity": SEVERITY_HIGH,
        "confidence": 0.85,
        "tags": ["risk_off", "multi_domain_consensus", "high_conviction"],
    },
    {
        "id": "risk_on_broad",
        "requires": {"regime": "risk-on", "sentiment": "risk-on", "volatility": "compressed"},
        "title": "Broad Risk-On Alignment",
        "body": (
            "Regime, sentiment, and volatility surveillance are in broad alignment "
            "toward a risk-on environment. Vol compression + positive sentiment "
            "momentum + supportive macro regime has historically correlated with "
            "continued risk asset strength. Monitor liquidity conditions for "
            "sustainability signals."
        ),
        "severity": SEVERITY_INFO,
        "confidence": 0.70,
        "tags": ["risk_on", "multi_domain_alignment", "monitoring"],
    },
    {
        "id": "cross_asset_breakdown_risk_off",
        "requires": {"cross_asset": "breakdown", "regime": "risk-off"},
        "title": "Correlation Breakdown During Risk-Off: Diversification Fragility",
        "body": (
            "Cross-asset correlation breakdown events are occurring concurrent "
            "with a risk-off macro regime — a pattern where traditional "
            "diversification assumptions can fail. When risk-off materialises "
            "with simultaneous correlation shifts, assets expected to diversify "
            "(e.g. bonds vs equities) may move in unexpected directions."
        ),
        "severity": SEVERITY_HIGH,
        "confidence": 0.75,
        "tags": ["correlation_breakdown", "diversification_risk", "multi_signal"],
    },
    {
        "id": "earnings_surprise_vol_expansion",
        "requires": {"earnings": "beat_cluster", "volatility": "elevated"},
        "title": "Earnings Beat Cluster in Elevated Vol Environment",
        "body": (
            "A cluster of EPS beats is occurring alongside elevated market "
            "volatility. Historically, positive earnings surprises during "
            "high-vol regimes produce muted price reactions compared to "
            "low-vol environments — the market 'prices in' uncertainty, "
            "diminishing the surprise premium."
        ),
        "severity": SEVERITY_INFO,
        "confidence": 0.58,
        "tags": ["earnings", "volatility", "surprise_premium"],
    },
]


def _extract_domain_signal(domain: str, rows: list[dict]) -> str | None:
    """Extract the dominant signal from a domain's outputs."""
    domain_rows = [r for r in rows if r.get("domain") == domain]
    if not domain_rows:
        return None

    # For regime: extract composite_regime from evidence
    if domain == "regime":
        for r in domain_rows:
            ev = r.get("evidence") or {}
            if isinstance(ev, str):
                try:
                    ev = json.loads(ev)
                except Exception:
                    ev = {}
            label = ev.get("composite_regime") or ev.get("regime_state")
            if label:
                return str(label)
        return None

    # For volatility: extract universe_regime
    if domain == "volatility":
        for r in domain_rows:
            ev = r.get("evidence") or {}
            if isinstance(ev, str):
                try:
                    ev = json.loads(ev)
                except Exception:
                    ev = {}
            label = ev.get("universe_regime")
            if label:
                return str(label)
        return None

    # For liquidity: extract regime_state from evidence
    if domain == "liquidity":
        for r in domain_rows:
            ev = r.get("evidence") or {}
            if isinstance(ev, str):
                try:
                    ev = json.loads(ev)
                except Exception:
                    ev = {}
            label = ev.get("regime_state")
            if label:
                return str(label)
        return None

    # For sentiment: extract avg_score direction
    if domain == "sentiment":
        for r in domain_rows:
            ev = r.get("evidence") or {}
            if isinstance(ev, str):
                try:
                    ev = json.loads(ev)
                except Exception:
                    ev = {}
            score = ev.get("avg_score")
            if score is not None:
                if float(score) > 0.1:
                    return "risk-on"
                elif float(score) < -0.1:
                    return "risk-off"
                return "neutral"
        return None

    # For cross_asset: detect breakdown events
    if domain == "cross_asset":
        breakdown = any(
            "breakdown" in (r.get("title") or "").lower()
            for r in domain_rows
        )
        return "breakdown" if breakdown else "stable"

    # For earnings: detect beat clusters
    if domain == "earnings":
        beat_cluster = any(
            "beat" in (r.get("title") or "").lower()
            for r in domain_rows
        )
        return "beat_cluster" if beat_cluster else "mixed"

    # For risk: extract risk level
    if domain == "risk":
        for r in domain_rows:
            ev = r.get("evidence") or {}
            if isinstance(ev, str):
                try:
                    ev = json.loads(ev)
                except Exception:
                    ev = {}
            label = ev.get("risk_level")
            if label:
                return str(label)

    return None


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    """Synthesise today's agent outputs into cross-domain reasoning observations."""
    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    today = datetime.now(timezone.utc).date().isoformat()

    sql = f"""
        SELECT domain, artifact_type, title, summary, severity,
               confidence, evidence, generated_at, tags
        FROM `{table}`
        WHERE DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)
          AND agent_id != 'reasoning_agent'
          AND artifact_type != 'multi_system_reasoning'
          AND is_test = FALSE
        ORDER BY generated_at DESC
    """
    try:
        rows = [dict(r) for r in bq.query(sql).result()]
    except Exception as e:
        log.warning("reasoning.query_failed", error=str(e))
        return []

    if not rows:
        return []

    # Extract domain signals
    signals: dict[str, str | None] = {}
    for domain in ["regime", "volatility", "liquidity", "sentiment", "cross_asset", "earnings", "risk", "macro"]:
        signals[domain] = _extract_domain_signal(domain, rows)

    log.info("reasoning.signals", signals={k: v for k, v in signals.items() if v})

    outputs: list[AgentOutput] = []

    # Match patterns
    matched_patterns: list[dict] = []
    for pattern in _PATTERNS:
        reqs = pattern["requires"]
        if all(signals.get(domain) == expected for domain, expected in reqs.items()):
            matched_patterns.append(pattern)

    for p in matched_patterns:
        outputs.append(AgentOutput(
            agent_id="reasoning_agent",
            domain="reasoning",
            artifact_type="multi_system_reasoning",
            title=p["title"],
            summary=p["body"][:200],
            body=p["body"],
            confidence=p["confidence"],
            severity=p["severity"],
            symbols=[],
            portfolio_id=portfolio_id,
            evidence={
                "pattern_id": p["id"],
                "matched_signals": {k: v for k, v in signals.items() if v and k in p["requires"]},
                "all_signals": {k: v for k, v in signals.items() if v},
                "domains_active": [d for d, v in signals.items() if v],
                "source_observation_count": len(rows),
            },
            source_tables=[table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=p["tags"],
        ))

    # Always produce a domain-consensus summary if ≥3 domains active
    active = [(d, v) for d, v in signals.items() if v]
    if len(active) >= 3 and not matched_patterns:
        domain_lines = "; ".join(f"{d}: {v}" for d, v in active)
        outputs.append(AgentOutput(
            agent_id="reasoning_agent",
            domain="reasoning",
            artifact_type="multi_system_reasoning",
            title=f"Multi-Domain Snapshot: {len(active)} Intelligence Dimensions Active",
            summary=f"Active signals: {domain_lines[:180]}.",
            body=(
                f"## Intelligence Snapshot\n\n"
                f"{len(active)} intelligence domains returned observations today.\n\n"
                + "\n".join(f"- **{d.replace('_', ' ').title()}**: {v}" for d, v in active)
                + "\n\n_No compound stress pattern matched at current signal thresholds. "
                f"Continue monitoring — conditions can shift intraday._"
            ),
            confidence=0.60,
            severity=SEVERITY_INFO,
            evidence={
                "active_signals": {d: v for d, v in active},
                "domain_count": len(active),
                "source_observation_count": len(rows),
            },
            source_tables=[table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["multi_system", "snapshot", "monitoring"],
        ))

    log.info("reasoning.complete", outputs=len(outputs), patterns_matched=len(matched_patterns))
    return outputs
