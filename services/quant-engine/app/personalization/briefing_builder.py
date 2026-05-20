"""
briefing_builder.py — materializes artifacts.personalized_briefings for a
single user. Answers the report's five briefing questions:

  1. What changed overnight?
  2. What changed in my portfolio?
  3. What changed in my watchlists?
  4. Which narratives strengthened or weakened?
  5. What deserves attention first?

Each section is composed from ranked candidates. The briefing is the
homepage replacement (PR6) and the highest-value retention surface.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone
from typing import Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings
from app.personalization.candidate_generator import generate_candidates
from app.personalization.ranker import (
    UserProfile,
    rank_candidates,
    ranker_version,
)

log = structlog.get_logger("quant_engine.personalization.briefing_builder")

MAX_TOTAL_ITEMS = 12
SECTION_BUCKETS = [
    ("overnight_changes", "What changed overnight"),
    ("portfolio_changes", "What changed in your portfolio"),
    ("watchlist_changes", "What changed in your watchlists"),
    ("narrative_shifts", "Narrative shifts"),
    ("attention_first", "What deserves attention first"),
]


def _profile_for_user(bq: bigquery.Client, user_id_hash: str) -> UserProfile:
    """
    Load the latest user_profile_daily snapshot. If none exists (new user),
    return an empty-but-valid profile so the ranker still produces a global
    briefing.
    """
    tbl = fully_qualified(settings.BQ_DATASET_FEATURES, "user_profile_daily")
    sql = f"""
        SELECT user_id_hash, watchlist_symbols, portfolio_symbols,
               active_investigation_ids, regime_style, preferred_depth
        FROM `{tbl}`
        WHERE user_id_hash = @uid
        ORDER BY snapshot_date DESC
        LIMIT 1
    """
    try:
        rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash),
        ])).result())
    except Exception as e:
        log.warning("briefing_builder.profile_lookup_failed", error=str(e))
        rows = []

    if not rows:
        return UserProfile(
            user_id_hash=user_id_hash,
            watchlist_symbols=[],
            portfolio_symbols=[],
            active_investigation_symbols=[],
        )
    r = rows[0]

    # We don't yet have investigation→symbols expansion; PR7 ships the join.
    return UserProfile(
        user_id_hash=user_id_hash,
        watchlist_symbols=list(r.get("watchlist_symbols") or []),
        portfolio_symbols=list(r.get("portfolio_symbols") or []),
        active_investigation_symbols=[],
        regime_style=r.get("regime_style"),
        preferred_depth=r.get("preferred_depth"),
    )


def _bucket_for(candidate_kind: str, comps: dict[str, float]) -> str:
    if comps.get("portfolio_impact", 0) > 0:
        return "portfolio_changes"
    if comps.get("watchlist_match", 0) > 0:
        return "watchlist_changes"
    if candidate_kind == "narrative":
        return "narrative_shifts"
    if comps.get("regime_urgency", 0) >= 0.6:
        return "attention_first"
    return "overnight_changes"


def build_briefing(
    user_id_hash: str,
    *,
    briefing_window: str = "premarket",
    briefing_date: Optional[date] = None,
    portfolio_id: Optional[str] = None,
    persist: bool = True,
) -> dict:
    """
    Build (and optionally persist) a personalized briefing for `user_id_hash`.
    """
    if briefing_date is None:
        briefing_date = date.fromisoformat(datetime.now(timezone.utc).date().isoformat())

    bq = get_bigquery_client()
    profile = _profile_for_user(bq, user_id_hash)
    candidates = generate_candidates(lookback_hours=24, max_per_kind=25)
    ranked = rank_candidates(candidates, profile)
    passed = [r for r in ranked if r.gate_passed][:MAX_TOTAL_ITEMS]

    # Bucket items into sections for the UI; preserve order within sections.
    sections: dict[str, list[dict]] = {key: [] for key, _ in SECTION_BUCKETS}
    ranked_items_flat: list[dict] = []
    for r in passed:
        bucket = _bucket_for(r.candidate.kind, r.component_scores)
        item = {
            "artifact_id": r.candidate.artifact_id,
            "kind": r.candidate.kind,
            "title": r.candidate.title,
            "summary": r.candidate.summary,
            "base_score": r.base_score,
            "component_scores": r.component_scores,
            "reason_codes": r.reason_codes,
            "confidence": r.candidate.confidence,
            "severity": r.candidate.severity,
            "symbols": r.candidate.symbols,
        }
        sections[bucket].append(item)
        ranked_items_flat.append(item)

    safety_gate_log = [
        {
            "artifact_id": r.candidate.artifact_id,
            "reasons": r.gate_reasons,
        }
        for r in ranked
        if not r.gate_passed
    ]

    headline = (
        f"{len(ranked_items_flat)} institutional observations for your portfolio and watchlists."
        if ranked_items_flat
        else "No new institutional observations cross today's relevance threshold."
    )

    briefing = {
        "briefing_id": str(uuid.uuid4()),
        "user_id_hash": user_id_hash,
        "briefing_date": briefing_date.isoformat(),
        "briefing_window": briefing_window,
        "title": "Personalized Morning Terminal",
        "summary": headline,
        "sections": json.dumps([
            {"key": key, "label": label, "items": sections[key]}
            for key, label in SECTION_BUCKETS
        ]),
        "ranked_items": json.dumps(ranked_items_flat),
        "portfolio_id": portfolio_id,
        "candidate_set_size": len(candidates),
        "ranker_version": ranker_version(),
        "profile_version": settings.PERSONALIZATION_PROFILE_VERSION,
        "safety_gate_log": json.dumps(safety_gate_log),
        "explainability": json.dumps({
            "weights": __import__("app.personalization.ranker", fromlist=["WEIGHTS"]).WEIGHTS,
            "freshness_hours": 48,
            "min_confidence_gate": 0.25,
        }),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "materialized_at": datetime.now(timezone.utc).isoformat() if persist else None,
        "lineage_id": f"briefing:{user_id_hash}:{briefing_date.isoformat()}:{briefing_window}",
    }

    if persist:
        _persist_briefing(bq, briefing)

    return briefing


def _persist_briefing(bq: bigquery.Client, briefing: dict) -> None:
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "personalized_briefings")
    # Idempotent: dedupe on (user_id_hash, briefing_date, briefing_window).
    bq.query(
        f"""
        DELETE FROM `{tbl}`
        WHERE user_id_hash = @uid
          AND briefing_date = @d
          AND briefing_window = @w
        """,
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("uid", "STRING", briefing["user_id_hash"]),
            bigquery.ScalarQueryParameter("d", "DATE", briefing["briefing_date"]),
            bigquery.ScalarQueryParameter("w", "STRING", briefing["briefing_window"]),
        ]),
    ).result()
    errors = bq.insert_rows_json(tbl, [briefing])
    if errors:
        log.error("briefing_builder.insert_errors", errors=errors[:3])


def latest_briefing(user_id_hash: str) -> Optional[dict]:
    """Return the most recent persisted briefing for `user_id_hash`, or None."""
    bq = get_bigquery_client()
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "personalized_briefings")
    sql = f"""
        SELECT *
        FROM `{tbl}`
        WHERE user_id_hash = @uid
        ORDER BY briefing_date DESC, materialized_at DESC
        LIMIT 1
    """
    try:
        rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash),
        ])).result())
        if not rows:
            return None
        return dict(rows[0])
    except Exception as e:
        log.warning("briefing_builder.latest_lookup_failed", error=str(e))
        return None


__all__ = ["build_briefing", "latest_briefing"]
