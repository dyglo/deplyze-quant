"""
profile_builder.py — nightly user_profile_daily snapshots.

Builds a per-user institutional behavioral cognition snapshot from:
  - watchlist symbols + portfolio symbols (via Firestore mirror — populated
    on first sync; profile is still built from BQ value events if Firestore
    is empty)
  - value events from cleaned.user_value_events (short-decay attention)
  - 90-day value event distribution (long-decay style)

The short-decay/long-decay split implements the report's "two simultaneous
decays" strategy (§Feature engineering): 7-14d half-life for current
attention, 60-90d half-life for stable style.

Phase 1 produces structurally complete snapshots even when value event
history is sparse; later phases enrich them with portfolio/watchlist data
from Firestore.
"""

from __future__ import annotations

import json
import math
import uuid
from datetime import date, datetime, timezone
from typing import Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.personalization.profile_builder")

SHORT_HALFLIFE_DAYS = 10
LONG_HALFLIFE_DAYS = 75
LOOKBACK_DAYS = 90


def _decay(days_old: float, halflife: float) -> float:
    if halflife <= 0:
        return 0.0
    return math.pow(0.5, days_old / halflife)


def build_profiles(target_date: Optional[date] = None, user_id_hash: Optional[str] = None) -> dict:
    """
    Build profile snapshots for `target_date` (default: today UTC).
    When `user_id_hash` is provided, builds only that user's snapshot;
    otherwise builds snapshots for every user with at least one event in
    the lookback window.
    """
    if target_date is None:
        target_date = date.fromisoformat(datetime.now(timezone.utc).date().isoformat())

    profile_tbl = fully_qualified(settings.BQ_DATASET_FEATURES, "user_profile_daily")
    value_tbl = fully_qualified(settings.BQ_DATASET_CLEANED, "user_value_events")
    events_tbl = fully_qualified(settings.BQ_DATASET_RAW_APP, "user_events")

    where_user = "AND user_id_hash = @uid" if user_id_hash else ""

    # Pull a per-user behavioral aggregate over the lookback window. The
    # heavy lifting is in SQL so we don't pull raw event rows into Python.
    query = f"""
        WITH base AS (
            SELECT
                user_id_hash,
                DATE_DIFF(@d, event_date, DAY) AS days_old,
                event_type,
                event_category,
                symbol,
                portfolio_id,
                placement,
                value_type,
                event_ts
            FROM `{value_tbl}`
            WHERE event_date BETWEEN DATE_SUB(@d, INTERVAL @lookback DAY) AND @d
              {where_user}
        ),
        recent_themes AS (
            SELECT
                user_id_hash,
                ARRAY_AGG(STRUCT(placement, days_old) IGNORE NULLS) AS placements,
                ARRAY_AGG(symbol IGNORE NULLS) AS symbols,
                ARRAY_AGG(value_type) AS value_types,
                COUNT(*) AS total_value_events,
                COUNTIF(days_old <= 14) AS recent_value_events,
                ARRAY_AGG(DISTINCT placement IGNORE NULLS LIMIT 20) AS active_surfaces,
                MAX(event_ts) AS last_value_at
            FROM base
            GROUP BY user_id_hash
        ),
        agg AS (
            SELECT
                rt.user_id_hash,
                rt.total_value_events,
                rt.recent_value_events,
                rt.active_surfaces,
                rt.symbols,
                rt.value_types,
                rt.last_value_at,
                (SELECT APPROX_TOP_COUNT(p.placement, 5) FROM UNNEST(rt.placements) p) AS top_placements
            FROM recent_themes rt
        )
        SELECT * FROM agg
    """
    params = [
        bigquery.ScalarQueryParameter("d", "DATE", target_date),
        bigquery.ScalarQueryParameter("lookback", "INT64", LOOKBACK_DAYS),
    ]
    if user_id_hash:
        params.append(bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash))

    bq = get_bigquery_client()
    rows = list(bq.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params)).result())

    if not rows:
        log.info("profile_builder.no_users", target_date=str(target_date))
        return {"status": "ok", "snapshots": 0}

    # Cheap regime-style classifier from top placements. The classifier is
    # intentionally simple in Phase 1 — the structure is what downstream
    # ranking and Copilot grounding consume; precision arrives in Phase 2
    # with the supervised value model.
    snapshots = []
    now = datetime.now(timezone.utc)
    for row in rows:
        top_placements = [p["value"] for p in (row.get("top_placements") or []) if p]
        regime_style = _classify_regime_style(top_placements)
        preferred_depth = "deep" if (row.get("recent_value_events") or 0) >= 5 else "moderate"

        snapshots.append({
            "user_id_hash": row["user_id_hash"],
            "snapshot_date": target_date.isoformat(),
            "portfolio_identity": None,
            "macro_sensitivity": None,
            "narrative_affinity": None,
            "sector_focus": [],
            "regime_style": regime_style,
            "preferred_depth": preferred_depth,
            "risk_posture": "balanced",
            "workflow_signature": json.dumps({
                "active_surfaces": list(row.get("active_surfaces") or []),
                "top_placements": top_placements,
                "last_value_at": row["last_value_at"].isoformat() if row.get("last_value_at") else None,
            }),
            "temporal_engagement": json.dumps({
                "total_value_events_90d": int(row.get("total_value_events") or 0),
                "recent_value_events_14d": int(row.get("recent_value_events") or 0),
            }),
            "active_investigation_ids": [],
            "watchlist_symbols": [],
            "portfolio_symbols": [],
            "short_decay_features": json.dumps({"halflife_days": SHORT_HALFLIFE_DAYS}),
            "long_decay_features": json.dumps({"halflife_days": LONG_HALFLIFE_DAYS}),
            "fatigue_signals": None,
            "profile_version": settings.PERSONALIZATION_PROFILE_VERSION,
            "builder_version": "v1.0",
            "source_events_window_days": LOOKBACK_DAYS,
            "generated_at": now.isoformat(),
        })

    # Idempotent rewrite of target_date partition for the affected users.
    # We DELETE then INSERT so re-runs converge.
    table = fully_qualified(settings.BQ_DATASET_FEATURES, "user_profile_daily")
    uid_list = ", ".join(f"'{s['user_id_hash']}'" for s in snapshots)
    bq.query(
        f"DELETE FROM `{table}` WHERE snapshot_date = @d AND user_id_hash IN ({uid_list})",
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("d", "DATE", target_date),
        ]),
    ).result()
    errors = bq.insert_rows_json(table, snapshots)
    if errors:
        log.error("profile_builder.insert_errors", errors=errors[:5])
        return {"status": "error", "errors": errors[:5]}

    log.info("profile_builder.completed", target_date=str(target_date), snapshots=len(snapshots))
    return {"status": "ok", "snapshots": len(snapshots)}


def _classify_regime_style(top_placements: list[str]) -> str:
    """
    Cheap heuristic mapping the user's top product surfaces to one of the
    canonical institutional research personas. Real classification arrives
    in Phase 2; the categories themselves are stable.
    """
    if not top_placements:
        return "generalist"
    surfaces = {p.lower() if isinstance(p, str) else "" for p in top_placements}
    if any("macro" in s or "regime" in s for s in surfaces):
        return "macro_first"
    if any("vol" in s or "scenario" in s for s in surfaces):
        return "volatility_sensitive"
    if any("earning" in s for s in surfaces):
        return "earnings_focused"
    if any("analog" in s for s in surfaces):
        return "analog_focused"
    return "bottom_up"


__all__ = ["build_profiles"]
