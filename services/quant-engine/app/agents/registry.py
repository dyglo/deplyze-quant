"""
V4 Agent Registry — static definitions for the 10 intelligence domains.

Each entry defines:
  - agent_id        : stable machine identifier
  - domain          : intelligence responsibility area
  - trigger_type    : scheduled | event | on_demand
  - cadence_cron    : Cloud Scheduler cron expression (ET)
  - input_sources   : BQ tables consumed
  - output_artifact_type : written to artifacts.agent_outputs
  - affected_pages  : product pages that surface this agent's outputs
  - description     : human-readable purpose summary

This is the single source of truth for agent configuration. Runtime state
(last_run_at, last_status, confidence) is stored in artifacts.agent_outputs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

# ─── Domain constants ─────────────────────────────────────────────────────────

DOMAIN_MACRO = "macro"
DOMAIN_SENTIMENT = "sentiment"
DOMAIN_VOLATILITY = "volatility"
DOMAIN_CROSS_ASSET = "cross_asset"
DOMAIN_LIQUIDITY = "liquidity"
DOMAIN_REGIME = "regime"
DOMAIN_OPPORTUNITY = "opportunity"
DOMAIN_EARNINGS = "earnings"
DOMAIN_RISK = "risk"
DOMAIN_RESEARCH = "research"

ALL_DOMAINS = [
    DOMAIN_MACRO, DOMAIN_SENTIMENT, DOMAIN_VOLATILITY, DOMAIN_CROSS_ASSET,
    DOMAIN_LIQUIDITY, DOMAIN_REGIME, DOMAIN_OPPORTUNITY, DOMAIN_EARNINGS,
    DOMAIN_RISK, DOMAIN_RESEARCH,
]

# ─── Registry entry ───────────────────────────────────────────────────────────

@dataclass
class AgentRegistryEntry:
    agent_id: str
    domain: str
    trigger_type: str                   # "scheduled" | "event" | "on_demand"
    cadence_cron: str                   # Cloud Scheduler cron (ET); "" for on_demand
    input_sources: List[str]            # BQ table names consumed
    output_artifact_type: str           # artifact_type value written to BQ
    affected_pages: List[str]           # product pages receiving this agent's output
    description: str
    safety_notes: List[str] = field(default_factory=list)

# ─── Registry ─────────────────────────────────────────────────────────────────

AGENT_REGISTRY: List[AgentRegistryEntry] = [
    AgentRegistryEntry(
        agent_id="macro_agent",
        domain=DOMAIN_MACRO,
        trigger_type="scheduled",
        cadence_cron="45 9 * * 1-5",   # 09:45 ET weekdays (after FRED data refresh)
        input_sources=[
            "cleaned.macro_cleaned",
            "features.macro_features",
            "research.macro_observations",
        ],
        output_artifact_type="macro_intelligence",
        affected_pages=[
            "MacroRegimeDesk", "IntelligenceTerminal", "ResearchCopilot",
            "PortfolioOverview", "RiskRegimeFit",
        ],
        description=(
            "Synthesises FRED macro series into four regime classifiers "
            "(liquidity, inflation, rates, growth) with narrative evidence. "
            "Detects regime transitions and publishes structured macro intelligence."
        ),
        safety_notes=["deterministic classifiers", "no trade signals"],
    ),
    AgentRegistryEntry(
        agent_id="sentiment_agent",
        domain=DOMAIN_SENTIMENT,
        trigger_type="scheduled",
        cadence_cron="0 */3 * * *",     # every 3h (after RSS ingestor)
        input_sources=[
            "raw_public.public_rss_raw",
            "research.narrative_artifacts",
            "research.narrative_memory",
        ],
        output_artifact_type="sentiment_observation",
        affected_pages=[
            "IntelligenceTerminal", "ResearchCopilot", "Briefings",
            "InstrumentIntelligence", "PositioningSentiment",
        ],
        description=(
            "Tracks narrative momentum across RSS/news feeds. "
            "Identifies emerging narratives, sentiment regime shifts, "
            "and cross-asset narrative exposures. No LLM — rule-based scoring."
        ),
        safety_notes=["no predictive claims", "source-transparent"],
    ),
    AgentRegistryEntry(
        agent_id="volatility_agent",
        domain=DOMAIN_VOLATILITY,
        trigger_type="scheduled",
        cadence_cron="30 16 * * 1-5",   # 16:30 ET (after close)
        input_sources=[
            "cleaned.ohlcv_cleaned",
            "features.volatility_features",
        ],
        output_artifact_type="volatility_observation",
        affected_pages=[
            "IntelligenceTerminal", "RiskRegimeFit", "InstrumentIntelligence",
            "ResearchCopilot", "ScenarioStress",
        ],
        description=(
            "Surveys realised and implied volatility regimes across the instrument universe. "
            "Detects vol expansion clusters, compression regimes, and vol-of-vol spikes. "
            "Scores each symbol's vol percentile rank vs 12-month history."
        ),
        safety_notes=["historical observation only", "no vol forecasts"],
    ),
    AgentRegistryEntry(
        agent_id="cross_asset_agent",
        domain=DOMAIN_CROSS_ASSET,
        trigger_type="scheduled",
        cadence_cron="0 17 * * 1-5",    # 17:00 ET (after close)
        input_sources=[
            "cleaned.ohlcv_cleaned",
            "features.correlation_features",
            "features.macro_features",
        ],
        output_artifact_type="cross_asset_observation",
        affected_pages=[
            "IntelligenceTerminal", "ResearchCopilot", "ExposureAnalysis",
            "RelationsMap", "RiskRegimeFit",
        ],
        description=(
            "Monitors cross-asset correlation structure. Detects correlation "
            "breakdowns (Gold/USD, Bonds/Equities, BTC/Risk), "
            "dependency-shift events, and contagion risk windows."
        ),
        safety_notes=["correlation does not imply causation", "evidence-sourced only"],
    ),
    AgentRegistryEntry(
        agent_id="liquidity_agent",
        domain=DOMAIN_LIQUIDITY,
        trigger_type="scheduled",
        cadence_cron="0 10 * * 1-5",    # 10:00 ET (after FRED refresh)
        input_sources=[
            "cleaned.macro_cleaned",
            "features.macro_features",
        ],
        output_artifact_type="liquidity_observation",
        affected_pages=[
            "MacroRegimeDesk", "IntelligenceTerminal", "ResearchCopilot",
            "RiskRegimeFit", "ScenarioStress",
        ],
        description=(
            "Monitors Fed balance sheet, M2, ON RRP drain, and broad USD for "
            "liquidity regime. Detects stress conditions (e.g. RRP drain + USD surge). "
            "Computes liquidity composite and stress index."
        ),
        safety_notes=["macro surveillance only", "no trade recommendations"],
    ),
    AgentRegistryEntry(
        agent_id="regime_agent",
        domain=DOMAIN_REGIME,
        trigger_type="scheduled",
        cadence_cron="0 10 15 * * 1-5", # after macro + liquidity agents settle
        input_sources=[
            "research.macro_observations",
            "artifacts.macro_artifacts",
            "artifacts.agent_outputs",
        ],
        output_artifact_type="regime_transition",
        affected_pages=[
            "MacroRegimeDesk", "RiskRegimeFit", "PortfolioOverview",
            "ResearchCopilot", "ScenarioStress", "IntelligenceTerminal",
        ],
        description=(
            "Composites macro, liquidity, volatility, and sentiment into a unified "
            "regime classification (risk-on/off/transition). Detects regime transition "
            "events and writes structured transition artifacts."
        ),
        safety_notes=["classification-based", "confidence-gated"],
    ),
    AgentRegistryEntry(
        agent_id="opportunity_agent",
        domain=DOMAIN_OPPORTUNITY,
        trigger_type="scheduled",
        cadence_cron="45 16 * * 1-5",   # 16:45 ET (after vol agent)
        input_sources=[
            "cleaned.ohlcv_cleaned",
            "features.volatility_features",
            "features.momentum_features",
            "research.narrative_artifacts",
        ],
        output_artifact_type="opportunity_observation",
        affected_pages=[
            "IntelligenceTerminal", "InstrumentIntelligence",
            "ResearchCopilot", "HistoricalIntelligenceTerminal",
        ],
        description=(
            "Scores asymmetric setups: momentum + vol compression + narrative catalyst alignment. "
            "Does NOT generate trade signals. Surfaces anomalies worth monitoring."
        ),
        safety_notes=[
            "not investment advice", "no buy/sell signals",
            "confidence-gated", "source-transparent",
        ],
    ),
    AgentRegistryEntry(
        agent_id="earnings_agent",
        domain=DOMAIN_EARNINGS,
        trigger_type="scheduled",
        cadence_cron="30 6 * * 1-5",    # 06:30 ET (after EDGAR ingestor)
        input_sources=[
            "raw_public.public_filings_raw",
            "cleaned.earnings_cleaned",
            "cleaned.fundamentals_cleaned",
            "research.parsed_documents",
        ],
        output_artifact_type="earnings_observation",
        affected_pages=[
            "IntelligenceTerminal", "ResearchCopilot", "ResearchLibrary",
            "InstrumentIntelligence", "Briefings",
        ],
        description=(
            "Processes recent SEC filings and earnings reports. Detects EPS surprise "
            "magnitude, guidance revision patterns, and insider transaction context. "
            "Publishes structured filing intelligence artifacts."
        ),
        safety_notes=["filing data only", "no fundamental valuation conclusions"],
    ),
    AgentRegistryEntry(
        agent_id="risk_agent",
        domain=DOMAIN_RISK,
        trigger_type="scheduled",
        cadence_cron="0 17 30 * * 1-5", # 17:30 ET (after all market agents)
        input_sources=[
            "artifacts.agent_outputs",
            "features.volatility_features",
            "cleaned.macro_cleaned",
            "features.macro_features",
        ],
        output_artifact_type="risk_observation",
        affected_pages=[
            "RiskRegimeFit", "ScenarioStress", "PortfolioOverview",
            "ResearchCopilot", "IntelligenceTerminal",
        ],
        description=(
            "Composites all agent outputs into a unified risk environment score. "
            "Detects multi-factor stress confluences (vol + liquidity + macro deterioration). "
            "Surfaces portfolio-level risk observations and regime-fit assessments."
        ),
        safety_notes=["risk surveillance only", "no portfolio construction advice"],
    ),
    AgentRegistryEntry(
        agent_id="research_copilot",
        domain=DOMAIN_RESEARCH,
        trigger_type="on_demand",
        cadence_cron="",
        input_sources=[
            "artifacts.agent_outputs",
            "research.macro_observations",
            "research.narrative_artifacts",
            "research.narrative_memory",
            "cleaned.ohlcv_cleaned",
            "features.macro_features",
        ],
        output_artifact_type="copilot_response",
        affected_pages=["ResearchCopilot"],
        description=(
            "Orchestrates all background intelligence silently to answer research queries. "
            "Synthesises macro regimes, narrative memory, volatility states, "
            "portfolio holdings, and agent observations into grounded responses."
        ),
        safety_notes=[
            "human decision ownership", "no trade execution",
            "confidence-based reasoning", "auditability",
        ],
    ),
]

# ─── Lookup helpers ───────────────────────────────────────────────────────────

REGISTRY_BY_ID: dict[str, AgentRegistryEntry] = {e.agent_id: e for e in AGENT_REGISTRY}
REGISTRY_BY_DOMAIN: dict[str, AgentRegistryEntry] = {e.domain: e for e in AGENT_REGISTRY}

SCHEDULED_AGENTS = [e for e in AGENT_REGISTRY if e.trigger_type == "scheduled"]
