"""
Sentiment Agent — V4 Intelligence Domain: Sentiment.

Analyses RSS/news feed data from raw_public.public_rss_raw and the existing
narrative_artifacts table to produce sentiment regime observations.

Scoring is rule-based (keyword weighting + narrative velocity). No LLM.
Institutional consumers need reproducible, auditable outputs.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW, SEVERITY_INFO,
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_BRIEFINGS, PLACEMENT_INSTRUMENT_INTELLIGENCE,
)
from app.agents.registry import DOMAIN_SENTIMENT
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.sentiment")

_PLACEMENTS = [
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_BRIEFINGS, PLACEMENT_INSTRUMENT_INTELLIGENCE,
]

# Simple risk-sentiment keyword weights (-1 to +1)
_RISK_ON_WORDS = {
    "rally", "surge", "breakout", "momentum", "bull", "growth",
    "recovery", "optimism", "beat", "upgrade",
}
_RISK_OFF_WORDS = {
    "recession", "selloff", "crash", "fear", "uncertainty", "downgrade",
    "default", "collapse", "panic", "inflation", "crisis",
}


def _score_headline(text: str) -> float:
    """Simple bag-of-words sentiment in [-1, 1]."""
    words = set(text.lower().split())
    pos = len(words & _RISK_ON_WORDS)
    neg = len(words & _RISK_OFF_WORDS)
    total = pos + neg
    if total == 0:
        return 0.0
    return (pos - neg) / total


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    rss_table = fully_qualified("raw_public", "public_rss_raw")
    narrative_table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "narrative_artifacts")
    today = datetime.now(timezone.utc).date().isoformat()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()

    # 1. RSS headline sentiment
    rss_sql = f"""
        SELECT feed_name, title, content_snippet, published_at
        FROM `{rss_table}`
        WHERE ingestion_time >= TIMESTAMP('{cutoff}')
          AND title IS NOT NULL
        ORDER BY published_at DESC
        LIMIT 200
    """
    try:
        rss_rows = list(bq.query(rss_sql).result())
    except Exception as e:
        log.warning("sentiment_agent.rss_query_failed", error=str(e))
        rss_rows = []

    scores: list[float] = []
    feed_counts: Counter = Counter()
    for r in rss_rows:
        text = f"{r['title'] or ''} {r['content_snippet'] or ''}"
        scores.append(_score_headline(text))
        feed_counts[r["feed_name"] or "unknown"] += 1

    # 2. Narrative artifacts (from V3P2 narratives engine)
    # narrative_artifacts uses the base artifact schema — title/summary/evidence columns
    narr_sql = f"""
        SELECT title, summary, confidence, related_symbols, evidence
        FROM `{narrative_table}`
        WHERE DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
          AND artifact_type IN ('narrative_emergence', 'narrative_spike', 'narrative_state')
        ORDER BY created_at DESC
        LIMIT 20
    """
    try:
        narr_rows = list(bq.query(narr_sql).result())
    except Exception as e:
        log.warning("sentiment_agent.narr_query_failed", error=str(e))
        narr_rows = []

    outputs: list[AgentOutput] = []

    # ── Output 1: Aggregate headline sentiment regime ─────────────────────────
    if scores:
        avg_score = sum(scores) / len(scores)
        pos_frac = sum(1 for s in scores if s > 0.1) / len(scores)
        neg_frac = sum(1 for s in scores if s < -0.1) / len(scores)

        if avg_score > 0.15:
            regime = "risk-on"
            severity = SEVERITY_INFO
        elif avg_score < -0.15:
            regime = "risk-off"
            severity = SEVERITY_MEDIUM if avg_score < -0.3 else SEVERITY_INFO
        else:
            regime = "neutral"
            severity = SEVERITY_INFO

        conf = min(0.85, 0.4 + abs(avg_score) * 1.5)
        outputs.append(AgentOutput(
            agent_id="sentiment_agent",
            domain=DOMAIN_SENTIMENT,
            artifact_type="sentiment_observation",
            title=f"Headline Sentiment: {regime.title()} ({len(scores)} items)",
            summary=(
                f"News flow over the past 12 hours shows {regime} sentiment. "
                f"Risk-positive headlines: {pos_frac:.0%}. "
                f"Risk-negative headlines: {neg_frac:.0%}."
            ),
            body=(
                f"Headline sentiment composite: **{regime}** "
                f"(score {avg_score:+.3f}, {len(scores)} items analysed). "
                f"Top feeds: {', '.join(f for f, _ in feed_counts.most_common(3))}. "
                f"Positive signal fraction: {pos_frac:.1%}. Negative: {neg_frac:.1%}."
            ),
            confidence=round(conf, 3),
            severity=severity,
            evidence={
                "avg_score": round(avg_score, 4),
                "pos_fraction": round(pos_frac, 4),
                "neg_fraction": round(neg_frac, 4),
                "sample_size": len(scores),
                "top_feeds": dict(feed_counts.most_common(5)),
            },
            source_tables=[rss_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["sentiment", regime, "news"],
        ))

    # ── Output 2: Emerging narratives (from narrative_artifacts) ──────────────
    if narr_rows:
        top = narr_rows[0]
        top_title = top["title"] or "Emerging narrative"
        top_conf = float(top["confidence"] or 0.5)

        related_syms: list[str] = []
        for r in narr_rows[:5]:
            syms = r["related_symbols"]
            if syms:
                related_syms.extend(syms)
        related_syms = list(dict.fromkeys(related_syms))[:12]

        sev = SEVERITY_HIGH if top_conf > 0.7 else SEVERITY_MEDIUM

        outputs.append(AgentOutput(
            agent_id="sentiment_agent",
            domain=DOMAIN_SENTIMENT,
            artifact_type="sentiment_observation",
            title=f"Narrative Intelligence: {top_title}",
            summary=top["summary"] or f"Narrative intelligence detected: {top_title}.",
            body=top["summary"] or f"Dominant narrative: {top_title}. {len(narr_rows)} narrative events in the past 3 days.",
            confidence=top_conf,
            severity=sev,
            symbols=related_syms,
            evidence={
                "top_narrative": top_title,
                "narrative_count": len(narr_rows),
                "narratives": [r["title"] for r in narr_rows[:5] if r.get("title")],
            },
            source_tables=[narrative_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["sentiment", "narrative"],
        ))

    log.info("sentiment_agent.complete", outputs=len(outputs))
    return outputs
