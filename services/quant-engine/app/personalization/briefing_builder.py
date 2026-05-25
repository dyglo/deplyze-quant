"""
briefing_builder.py — materializes artifacts.personalized_briefings for a
single user. Returns a structured morning-terminal shape with six named
sections:

  regime              — current macro regime context
  portfolio_pulse     — overnight portfolio P&L + risk flags (if portfolio known)
  watchlist_overnight — movers for watchlist symbols (if watchlist non-empty)
  ranked_feed         — up to 8 ranked intelligence items
  research_queue      — up to 3 active investigations (if any)
  is_personalized     — false for cold/global brief (no profile data yet)

The returned dict matches the StructuredBriefing TypeScript interface consumed
by MorningTerminal.tsx.
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
from app.personalization.candidate_generator import generate_candidates
from app.personalization.ranker import (
    UserProfile,
    rank_candidates,
    ranker_version,
)

log = structlog.get_logger("quant_engine.personalization.briefing_builder")

MAX_FEED_ITEMS = 8
MIN_FEED_ITEMS = 3   # guaranteed minimum even if items fall below confidence gate
MAX_QUEUE_ITEMS = 3
MIN_CONFIDENCE_GATE = 0.40
WATCHLIST_MOVE_THRESHOLD = 0.005   # 0.5 %


# ─── Profile loader ───────────────────────────────────────────────────────────

def _profile_for_user(bq: bigquery.Client, user_id_hash: str) -> UserProfile:
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
    return UserProfile(
        user_id_hash=user_id_hash,
        watchlist_symbols=list(r.get("watchlist_symbols") or []),
        portfolio_symbols=list(r.get("portfolio_symbols") or []),
        active_investigation_symbols=[],
        regime_style=r.get("regime_style"),
        preferred_depth=r.get("preferred_depth"),
    )


# ─── Section fetchers ─────────────────────────────────────────────────────────

def _fetch_regime_context(bq: bigquery.Client) -> Optional[dict]:
    """
    Returns the latest macro regime context from regime_agent outputs.
    episode_day = days since this transition was observed (proxy for episode length).
    shifted_recently = episode_day < 7.
    """
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    sql = f"""
        SELECT title, summary, confidence, observation_date, generated_at
        FROM `{tbl}`
        WHERE agent_id = 'regime_agent'
          AND is_test = FALSE
          AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
        ORDER BY generated_at DESC
        LIMIT 1
    """
    try:
        rows = list(bq.query(sql).result())
    except Exception as e:
        log.warning("briefing_builder.regime_lookup_failed", error=str(e))
        return None
    if not rows:
        return None
    r = dict(rows[0])

    obs = r.get("observation_date")
    try:
        obs_str = obs.isoformat() if hasattr(obs, "isoformat") else str(obs)
        obs_date = date.fromisoformat(obs_str[:10])
    except Exception:
        obs_date = date.today()
    episode_day = max(1, (date.today() - obs_date).days)

    return {
        "label": r.get("title") or "Current Macro Regime",
        "confidence": min(1.0, max(0.0, float(r.get("confidence") or 0.0))),
        "episode_day": episode_day,
        "summary": r.get("summary") or "",
        "historical_analog": None,
        "shifted_recently": episode_day < 7,
    }


def _fetch_portfolio_pulse(
    bq: bigquery.Client,
    portfolio_id: Optional[str],
    portfolio_symbols: list[str],
) -> Optional[dict]:
    """
    Returns overnight portfolio pulse.

    If portfolio_id is provided, uses the portfolio_awareness_synthesis snapshot
    (monitor_probes → flags, kpis → returns).

    Falls back to a lightweight OHLCV-based computation when only
    portfolio_symbols are available but no snapshot exists.
    """
    if not portfolio_id and not portfolio_symbols:
        return None

    # ── Path A: portfolio_awareness_synthesis ────────────────────────────────
    if portfolio_id:
        tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "portfolio_awareness_synthesis")
        sql = f"""
            SELECT
              TO_JSON_STRING(kpis) AS kpis,
              TO_JSON_STRING(risk_decomposition) AS risk_decomposition,
              TO_JSON_STRING(monitor_probes) AS monitor_probes
            FROM `{tbl}`
            WHERE portfolio_id = @pid
              AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
              AND is_test = FALSE
            ORDER BY snapshot_date DESC, generated_at DESC
            LIMIT 1
        """
        try:
            rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("pid", "STRING", portfolio_id),
            ])).result())
        except Exception as e:
            log.warning("briefing_builder.pulse_synthesis_failed", error=str(e))
            rows = []

        if rows:
            r = dict(rows[0])
            kpis: dict = _safe_json(r.get("kpis")) or {}
            probes: list = _safe_json(r.get("monitor_probes")) or []

            flags = [
                {
                    "symbol": (p.get("symbols") or [""])[0] if p.get("symbols") else "",
                    "reason": p.get("title") or p.get("category") or "Risk flag",
                    "severity": p.get("severity") or "medium",
                }
                for p in probes
                if p.get("severity") in ("high", "medium", "low")
            ][:5]

            high_flags = sum(1 for f in flags if f["severity"] == "high")
            med_flags = sum(1 for f in flags if f["severity"] == "medium")
            regime_compat = max(0, min(100, 100 - high_flags * 25 - med_flags * 10))

            pnl_delta = float(kpis.get("totalReturn") or 0.0)

            return {
                "pnl_delta_pct": round(pnl_delta, 4),
                "regime_compatibility": regime_compat,
                "flag_count": len(flags),
                "flags": flags,
                "holdings_count": None,  # not available from synthesis path
            }

    # ── Path B: lightweight OHLCV-based pulse ────────────────────────────────
    if not portfolio_symbols:
        return None

    symbols_upper = [s.upper() for s in portfolio_symbols[:20]]
    tbl_ohlcv = fully_qualified(settings.BQ_DATASET_CLEANED, "ohlcv_cleaned")
    sql = f"""
        SELECT symbol, close, observation_time
        FROM `{tbl_ohlcv}`
        WHERE symbol IN UNNEST(@syms)
          AND observation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 4 DAY)
          AND close > 0
        ORDER BY symbol, observation_time DESC
    """
    try:
        rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ArrayQueryParameter("syms", "STRING", symbols_upper),
        ])).result())
    except Exception as e:
        log.warning("briefing_builder.pulse_ohlcv_failed", error=str(e))
        return None

    if not rows:
        return None

    # Group prices per symbol; take last two closes → 1d return
    by_sym: dict[str, list[float]] = {}
    for row in rows:
        sym = str(row["symbol"]).upper()
        by_sym.setdefault(sym, []).append(float(row["close"]))

    returns: list[float] = []
    for sym, prices in by_sym.items():
        if len(prices) >= 2:
            returns.append((prices[0] / prices[1]) - 1.0)

    if not returns:
        return None

    pnl_delta = sum(returns) / len(returns)  # equal-weight
    return {
        "pnl_delta_pct": round(pnl_delta, 4),
        "regime_compatibility": 75,  # neutral default when no synthesis available
        "flag_count": 0,
        "flags": [],
        "holdings_count": len(portfolio_symbols),
    }


def _fetch_watchlist_overnight(
    bq: bigquery.Client,
    watchlist_symbols: list[str],
) -> Optional[dict]:
    """
    Returns movers among watchlist symbols (|change| >= 0.5 %) plus
    a narrative_shift flag if any narrative agent output mentions the symbol
    in the last 48 h.
    """
    if not watchlist_symbols:
        return None

    symbols_upper = [s.upper() for s in watchlist_symbols[:30]]
    tbl_ohlcv = fully_qualified(settings.BQ_DATASET_CLEANED, "ohlcv_cleaned")

    # Last 2 closes per symbol for overnight change
    sql_ohlcv = f"""
        SELECT symbol,
          ARRAY_AGG(close ORDER BY observation_time DESC LIMIT 2) AS closes
        FROM `{tbl_ohlcv}`
        WHERE symbol IN UNNEST(@syms)
          AND observation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
          AND close > 0
        GROUP BY symbol
    """
    try:
        price_rows = list(bq.query(sql_ohlcv, job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ArrayQueryParameter("syms", "STRING", symbols_upper),
        ])).result())
    except Exception as e:
        log.warning("briefing_builder.watchlist_ohlcv_failed", error=str(e))
        price_rows = []

    # Symbols with recent narrative activity
    tbl_ao = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    sql_narr = f"""
        SELECT DISTINCT UPPER(sym) AS symbol
        FROM `{tbl_ao}`, UNNEST(symbols) AS sym
        WHERE domain = 'narrative'
          AND is_test = FALSE
          AND generated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 48 HOUR)
          AND UPPER(sym) IN UNNEST(@syms)
    """
    try:
        narr_rows = list(bq.query(sql_narr, job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ArrayQueryParameter("syms", "STRING", symbols_upper),
        ])).result())
        narrative_syms = {str(r["symbol"]).upper() for r in narr_rows}
    except Exception as e:
        log.warning("briefing_builder.watchlist_narrative_failed", error=str(e))
        narrative_syms = set()

    movers = []
    for row in price_rows:
        sym = str(row["symbol"]).upper()
        closes = list(row["closes"])
        if len(closes) < 2 or closes[1] == 0:
            continue
        change_pct = (closes[0] / closes[1]) - 1.0
        if abs(change_pct) < WATCHLIST_MOVE_THRESHOLD:
            continue
        movers.append({
            "symbol": sym,
            "change_pct": round(change_pct, 4),
            "narrative_shift": sym in narrative_syms,
            "catalyst_this_week": None,
        })

    movers.sort(key=lambda m: abs(m["change_pct"]), reverse=True)

    if not movers:
        return None
    return {"movers": movers}


def _fetch_research_queue(bq: bigquery.Client, user_id_hash: str) -> Optional[list]:
    """
    Returns up to 3 active investigations with a has_new_evidence flag.
    new_evidence = any agent output in last 24 h shares a symbol with the investigation.
    """
    tbl_inv = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "investigation_memory")
    sql = f"""
        SELECT investigation_id, title, symbols, updated_at
        FROM `{tbl_inv}`
        WHERE user_id_hash = @uid
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT {MAX_QUEUE_ITEMS}
    """
    try:
        inv_rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash),
        ])).result())
    except Exception as e:
        log.warning("briefing_builder.research_queue_failed", error=str(e))
        return None

    if not inv_rows:
        return None

    all_symbols = list({
        sym.upper()
        for row in inv_rows
        for sym in (list(row.get("symbols") or []))
    })[:50]

    recent_symbols: set[str] = set()
    if all_symbols:
        tbl_ao = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
        sql_ev = f"""
            SELECT DISTINCT UPPER(sym) AS symbol
            FROM `{tbl_ao}`, UNNEST(symbols) AS sym
            WHERE is_test = FALSE
              AND generated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
              AND UPPER(sym) IN UNNEST(@syms)
        """
        try:
            ev_rows = list(bq.query(sql_ev, job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ArrayQueryParameter("syms", "STRING", all_symbols),
            ])).result())
            recent_symbols = {str(r["symbol"]).upper() for r in ev_rows}
        except Exception as e:
            log.warning("briefing_builder.research_evidence_check_failed", error=str(e))

    queue = []
    for row in inv_rows:
        syms = [s.upper() for s in (list(row.get("symbols") or []))]
        has_new = bool(syms and any(s in recent_symbols for s in syms))
        queue.append({
            "id": str(row["investigation_id"]),
            "title": str(row.get("title") or ""),
            "has_new_evidence": has_new,
            "symbols": syms,
        })
    return queue or None


# ─── Ranked-feed helpers ──────────────────────────────────────────────────────

_REASON_TAG_MAP = {
    "affects_portfolio":       "portfolio exposure",
    "touches_portfolio":       "portfolio exposure",
    "watchlist_overlap":       "watchlist match",
    "active_investigation":    "investigation match",
    "elevated_severity":       "high confidence",
    "high_confidence_source":  "high confidence",
    "v4_agent_grounded":       "regime signal",
    "historical_analog":       "regime signal",
    "narrative_shift":         "regime signal",
}

_CTA_MAP = {
    "macro":         ("/macro",                     "View macro desk"),
    "regime":        ("/macro",                     "Explore regime"),
    "narrative":     ("/instruments/narratives",    "View narratives"),
    "analog":        ("/historical-intelligence",   "Explore analogs"),
    "risk":          ("/portfolio/risk",             "View risk"),
    "opportunity":   ("/instruments",               "Browse instruments"),
    "agent_output":  ("/briefings",                 "View briefings"),
}


def _reason_tag(reason_codes: list[str]) -> str:
    for code in reason_codes:
        if code in _REASON_TAG_MAP:
            return _REASON_TAG_MAP[code]
    return "regime signal"


def _cta(kind: str, symbols: list[str]) -> tuple[str, str]:
    if symbols:
        return (f"/instruments/{symbols[0].upper()}", "View instrument")
    return _CTA_MAP.get(kind, ("/briefings", "View briefings"))


# ─── Safe JSON helper ─────────────────────────────────────────────────────────

def _safe_json(v: object) -> object:
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(str(v))
    except Exception:
        return None


# ─── Build ────────────────────────────────────────────────────────────────────

def build_briefing(
    user_id_hash: str,
    *,
    briefing_window: str = "premarket",
    briefing_date: Optional[date] = None,
    portfolio_id: Optional[str] = None,
    persist: bool = True,
) -> dict:
    """
    Build (and optionally persist) a structured morning briefing.
    Returns the StructuredBriefing shape consumed by MorningTerminal.tsx.
    """
    if briefing_date is None:
        briefing_date = date.fromisoformat(datetime.now(timezone.utc).date().isoformat())

    bq = get_bigquery_client()
    profile = _profile_for_user(bq, user_id_hash)
    now_utc = datetime.now(timezone.utc)

    # Midnight tonight UTC (valid_until for cache)
    midnight = datetime(
        now_utc.year, now_utc.month, now_utc.day,
        23, 59, 59, tzinfo=timezone.utc,
    )

    # ── Parallel section fetching (fail-gracefully each) ─────────────────────
    try:
        regime = _fetch_regime_context(bq)
    except Exception as e:
        log.warning("briefing_builder.regime_section_failed", error=str(e))
        regime = None

    try:
        portfolio_pulse = _fetch_portfolio_pulse(
            bq, portfolio_id, list(profile.portfolio_symbols or []),
        )
    except Exception as e:
        log.warning("briefing_builder.pulse_section_failed", error=str(e))
        portfolio_pulse = None

    try:
        watchlist_overnight = _fetch_watchlist_overnight(
            bq, list(profile.watchlist_symbols or []),
        )
    except Exception as e:
        log.warning("briefing_builder.watchlist_section_failed", error=str(e))
        watchlist_overnight = None

    try:
        research_queue = _fetch_research_queue(bq, user_id_hash)
    except Exception as e:
        log.warning("briefing_builder.queue_section_failed", error=str(e))
        research_queue = None

    # ── Ranked feed (main intelligence items) ────────────────────────────────
    candidates = generate_candidates(lookback_hours=24, max_per_kind=25)
    ranked = rank_candidates(candidates, profile)

    ranked_feed = []
    below_threshold_pool = []  # gate-passed items below MIN_CONFIDENCE_GATE, for fill
    safety_gate_log = []
    for r in ranked:
        if not r.gate_passed:
            safety_gate_log.append({
                "artifact_id": r.candidate.artifact_id,
                "reasons": r.gate_reasons,
            })
            continue
        cta_route, cta_label = _cta(r.candidate.kind, list(r.candidate.symbols or []))
        item = {
            "id": r.candidate.artifact_id,
            "title": (r.candidate.title or "")[:120],
            "reason_tag": _reason_tag(r.reason_codes),
            "confidence": min(1.0, max(0.0, float(r.candidate.confidence or 0.0))),
            "explanation": (r.candidate.summary or "")[:300],
            "cta_label": cta_label,
            "cta_route": cta_route,
            "below_threshold": False,
        }
        if r.candidate.confidence is not None and r.candidate.confidence < MIN_CONFIDENCE_GATE:
            below_threshold_pool.append({**item, "below_threshold": True})
            continue
        ranked_feed.append(item)
        if len(ranked_feed) >= MAX_FEED_ITEMS:
            break

    # Guarantee minimum 3 items — fill from below-threshold pool if needed.
    # Items are marked below_threshold=True so the UI can render a separator.
    if len(ranked_feed) < MIN_FEED_ITEMS:
        needed = MIN_FEED_ITEMS - len(ranked_feed)
        ranked_feed.extend(below_threshold_pool[:needed])

    is_personalized = bool(profile.portfolio_symbols or profile.watchlist_symbols)

    briefing_id = str(uuid.uuid4())
    lineage_id = f"briefing:{user_id_hash}:{briefing_date.isoformat()}:{briefing_window}"

    structured = {
        "briefing_id": briefing_id,
        "generated_at": now_utc.isoformat(),
        "valid_until": midnight.isoformat(),
        "is_personalized": is_personalized,
        "regime": regime or {},
        "portfolio_pulse": portfolio_pulse,
        "watchlist_overnight": watchlist_overnight,
        "ranked_feed": ranked_feed,
        "research_queue": research_queue,
        "ranker_version": ranker_version(),
        "lineage_id": lineage_id,
        "candidate_set_size": len(candidates),
    }

    if persist:
        _persist_briefing(bq, structured, user_id_hash, briefing_date, briefing_window,
                          portfolio_id, safety_gate_log)

    log.info(
        "briefing_builder.built",
        user_id_hash=user_id_hash,
        briefing_date=briefing_date.isoformat(),
        feed_items=len(ranked_feed),
        is_personalized=is_personalized,
        has_regime=regime is not None,
        has_pulse=portfolio_pulse is not None,
        has_watchlist=watchlist_overnight is not None,
        has_queue=research_queue is not None,
    )

    return structured


def _persist_briefing(
    bq: bigquery.Client,
    structured: dict,
    user_id_hash: str,
    briefing_date: date,
    briefing_window: str,
    portfolio_id: Optional[str],
    safety_gate_log: list,
) -> None:
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
            bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash),
            bigquery.ScalarQueryParameter("d", "DATE", briefing_date.isoformat()),
            bigquery.ScalarQueryParameter("w", "STRING", briefing_window),
        ]),
    ).result()

    now_iso = datetime.now(timezone.utc).isoformat()
    row = {
        "briefing_id": structured["briefing_id"],
        "user_id_hash": user_id_hash,
        "briefing_date": briefing_date.isoformat(),
        "briefing_window": briefing_window,
        "title": "Personalized Morning Terminal",
        "summary": (
            f"{len(structured['ranked_feed'])} ranked items · "
            f"{'personalized' if structured['is_personalized'] else 'global'}"
        ),
        # sections stores the full structured payload for round-trip reads
        "sections": json.dumps(structured),
        "ranked_items": json.dumps(structured["ranked_feed"]),
        "portfolio_id": portfolio_id,
        "candidate_set_size": structured.get("candidate_set_size", 0),
        "ranker_version": structured.get("ranker_version", ""),
        "profile_version": settings.PERSONALIZATION_PROFILE_VERSION,
        "safety_gate_log": json.dumps(safety_gate_log),
        "explainability": json.dumps({}),
        "generated_at": structured["generated_at"],
        "materialized_at": now_iso,
        "lineage_id": structured["lineage_id"],
    }

    errors = bq.insert_rows_json(tbl, [row])
    if errors:
        log.error("briefing_builder.insert_errors", errors=errors[:3])


def get_all_user_hashes() -> list[str]:
    """
    Return distinct user_id_hash values from the most recent user_profile_daily
    snapshots (last 7 days). Used by the population materialize path.
    """
    bq = get_bigquery_client()
    tbl = fully_qualified(settings.BQ_DATASET_FEATURES, "user_profile_daily")
    sql = f"""
        SELECT DISTINCT user_id_hash
        FROM `{tbl}`
        WHERE snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    """
    try:
        rows = list(bq.query(sql).result())
        return [str(r["user_id_hash"]) for r in rows if r["user_id_hash"]]
    except Exception as e:
        log.warning("briefing_builder.get_all_user_hashes_failed", error=str(e))
        return []


def latest_briefing(user_id_hash: str) -> Optional[dict]:
    """
    Return the most recent persisted briefing for `user_id_hash`, or None.
    Parses the `sections` column back to a dict (structured briefing shape).
    """
    bq = get_bigquery_client()
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "personalized_briefings")
    sql = f"""
        SELECT sections, generated_at, materialized_at
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
        r = dict(rows[0])
        parsed = _safe_json(r.get("sections"))
        if isinstance(parsed, dict):
            # Stamp materialized_at from the BQ row in case the in-dict value differs
            if r.get("materialized_at"):
                mat = r["materialized_at"]
                parsed["materialized_at"] = mat.isoformat() if hasattr(mat, "isoformat") else str(mat)
            return parsed
        return None
    except Exception as e:
        log.warning("briefing_builder.latest_lookup_failed", error=str(e))
        return None


__all__ = ["build_briefing", "latest_briefing", "get_all_user_hashes"]
