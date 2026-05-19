"""
ranker.py — Phase 1 rules-first BaseScore (deep-research-report §"Recommended
retention algorithm"):

  BaseScore = Gate × (
       0.30 PortfolioImpact
     + 0.20 WatchlistMatch
     + 0.15 InvestigationContinuation
     + 0.10 RegimeUrgency
     + 0.10 Confidence
     + 0.05 Novelty
     + 0.05 Recency
     + 0.05 SourceQuality
     - 0.10 FatiguePenalty
     - 0.10 DuplicationPenalty )

The gate enforces deterministic safety: suppress low-confidence outputs,
duplicates, anything that could read as personalized trade pressure, and
candidates older than the freshness window. Gates are auditable in
features.user_candidate_features.gate_reasons.

Phase 2 will swap the linear combination for a supervised LTR reranker but
will keep the same gate + reason-code interface so explainability survives.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import structlog

from app.personalization.candidate_generator import Candidate
from app.core.config import settings

log = structlog.get_logger("quant_engine.personalization.ranker")

# ─── Weights ──────────────────────────────────────────────────────────────────

WEIGHTS = {
    "portfolio_impact": 0.30,
    "watchlist_match": 0.20,
    "investigation_continuation": 0.15,
    "regime_urgency": 0.10,
    "confidence": 0.10,
    "novelty": 0.05,
    "recency": 0.05,
    "source_quality": 0.05,
}
PENALTIES = {
    "fatigue": 0.10,
    "duplication": 0.10,
}

FRESHNESS_HOURS = 48
MIN_CONFIDENCE_GATE = 0.25


# ─── Profile shape (lightweight) ─────────────────────────────────────────────

@dataclass
class UserProfile:
    user_id_hash: str
    watchlist_symbols: list[str]
    portfolio_symbols: list[str]
    active_investigation_symbols: list[str]
    regime_style: Optional[str] = None
    preferred_depth: Optional[str] = None
    recent_seen_artifact_ids: list[str] = None
    recent_dismissed_artifact_ids: list[str] = None

    def __post_init__(self):
        self.recent_seen_artifact_ids = self.recent_seen_artifact_ids or []
        self.recent_dismissed_artifact_ids = self.recent_dismissed_artifact_ids or []


@dataclass
class RankedCandidate:
    candidate: Candidate
    base_score: float
    gate_passed: bool
    gate_reasons: list[str]
    reason_codes: list[str]
    component_scores: dict[str, float]


# ─── Scoring components ──────────────────────────────────────────────────────

def _overlap(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    sa, sb = set(s.upper() for s in a), set(s.upper() for s in b)
    inter = sa & sb
    if not inter:
        return 0.0
    return min(1.0, len(inter) / max(1, min(len(sa), len(sb))))


def _portfolio_impact(c: Candidate, p: UserProfile) -> float:
    return _overlap(c.symbols, p.portfolio_symbols)


def _watchlist_match(c: Candidate, p: UserProfile) -> float:
    return _overlap(c.symbols, p.watchlist_symbols)


def _investigation_continuation(c: Candidate, p: UserProfile) -> float:
    return _overlap(c.symbols, p.active_investigation_symbols)


def _regime_urgency(c: Candidate) -> float:
    sev = (c.severity or "").lower()
    if sev == "high":
        return 1.0
    if sev == "medium":
        return 0.6
    if sev == "low":
        return 0.3
    return 0.2


def _recency(c: Candidate) -> float:
    if not c.generated_at:
        return 0.5
    delta_h = (datetime.now(timezone.utc) - c.generated_at.astimezone(timezone.utc)).total_seconds() / 3600
    if delta_h <= 0:
        return 1.0
    # Half-life of 12 hours so day-old candidates still register.
    return float(math.pow(0.5, delta_h / 12.0))


def _source_quality(c: Candidate) -> float:
    # V4 agent outputs already pass through agent registry safety constraints,
    # so we treat them as high source quality. Other artifact kinds default
    # to 0.7 — refinable when we add per-source priors.
    return 0.9 if c.kind == "agent_output" else 0.7


def _novelty(c: Candidate, p: UserProfile) -> float:
    if c.artifact_id in (p.recent_seen_artifact_ids or []):
        return 0.0
    return 1.0


def _fatigue(c: Candidate, p: UserProfile) -> float:
    # If user has dismissed many candidates of this kind/category recently,
    # apply a penalty. Phase 1 treats any dismissal of the same artifact as
    # a hard 1.0 penalty.
    if c.artifact_id in (p.recent_dismissed_artifact_ids or []):
        return 1.0
    return 0.0


def _duplication(c: Candidate, seen_titles: set[str]) -> float:
    title = (c.title or "").strip().lower()
    if not title:
        return 0.0
    return 1.0 if title in seen_titles else 0.0


# ─── Gate ────────────────────────────────────────────────────────────────────

def _evaluate_gate(c: Candidate) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if (c.confidence or 0.0) < MIN_CONFIDENCE_GATE:
        reasons.append("below_confidence_floor")
    if c.generated_at:
        age_h = (datetime.now(timezone.utc) - c.generated_at.astimezone(timezone.utc)).total_seconds() / 3600
        if age_h > FRESHNESS_HOURS:
            reasons.append("stale_artifact")
    # Hard refusal of trade-pressure language. Even if the candidate
    # accidentally contains a buy/sell verb, the ranker drops it.
    blob = " ".join(filter(None, [c.title or "", c.summary or ""])).lower()
    if any(p in blob for p in [" buy ", " sell ", "buy now", "sell now", "you should buy", "you should sell"]):
        reasons.append("trade_pressure_language")
    return (len(reasons) == 0, reasons)


# ─── Reason-code emitter (for explainability UI) ─────────────────────────────

def _reason_codes(comps: dict[str, float], c: Candidate) -> list[str]:
    codes: list[str] = []
    if comps["portfolio_impact"] >= 0.5:
        codes.append("affects_portfolio")
    elif comps["portfolio_impact"] > 0:
        codes.append("touches_portfolio")
    if comps["watchlist_match"] > 0:
        codes.append("watchlist_overlap")
    if comps["investigation_continuation"] > 0:
        codes.append("active_investigation")
    if comps["regime_urgency"] >= 0.6:
        codes.append("elevated_severity")
    if (c.confidence or 0.0) >= 0.7:
        codes.append("high_confidence_source")
    if c.kind == "agent_output":
        codes.append("v4_agent_grounded")
    elif c.kind == "analog":
        codes.append("historical_analog")
    elif c.kind == "narrative":
        codes.append("narrative_shift")
    return codes


# ─── Public API ──────────────────────────────────────────────────────────────

def rank_candidates(
    candidates: list[Candidate],
    profile: UserProfile,
) -> list[RankedCandidate]:
    """
    Score and order candidates for `profile`. Returns gate-failed candidates
    too (with base_score=0, gate_passed=False) so audit logs are complete.
    """
    seen_titles: set[str] = set()
    out: list[RankedCandidate] = []
    for c in candidates:
        gate_passed, gate_reasons = _evaluate_gate(c)
        comps = {
            "portfolio_impact": _portfolio_impact(c, profile),
            "watchlist_match": _watchlist_match(c, profile),
            "investigation_continuation": _investigation_continuation(c, profile),
            "regime_urgency": _regime_urgency(c),
            "confidence": float(min(1.0, max(0.0, c.confidence or 0.0))),
            "novelty": _novelty(c, profile),
            "recency": _recency(c),
            "source_quality": _source_quality(c),
        }
        score = sum(WEIGHTS[k] * v for k, v in comps.items())
        score -= PENALTIES["fatigue"] * _fatigue(c, profile)
        score -= PENALTIES["duplication"] * _duplication(c, seen_titles)

        if c.title:
            seen_titles.add(c.title.strip().lower())

        if not gate_passed:
            score = 0.0

        out.append(RankedCandidate(
            candidate=c,
            base_score=round(score, 6),
            gate_passed=gate_passed,
            gate_reasons=gate_reasons,
            reason_codes=_reason_codes(comps, c) if gate_passed else [],
            component_scores={k: round(v, 4) for k, v in comps.items()},
        ))

    out.sort(key=lambda r: r.base_score, reverse=True)
    return out


def ranker_version() -> str:
    return settings.PERSONALIZATION_RANKER_VERSION


__all__ = ["UserProfile", "RankedCandidate", "rank_candidates", "ranker_version", "WEIGHTS", "PENALTIES"]
