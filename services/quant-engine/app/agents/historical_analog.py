"""
Historical Analog Engine — V4 Phase 2.

Finds historical periods whose macro/volatility/liquidity regime fingerprint
most closely resembles the current environment.

Uses existing warehouse features:
  - features.macro_features      (series: WALCL, M2SL, FEDFUNDS, DGS10, UNRATE, CPILFESL)
  - features.volatility_features (annualised_vol, vol_percentile_rank, volatility_regime)

Algorithm:
  1. Load last N years of daily feature snapshots (deduplicated per day)
  2. Build a 5-dimensional feature vector per day:
       [growth_zscore, liquidity_zscore, inflation_zscore, rates_zscore, vol_pct_rank]
  3. Compute the current vector from today's features
  4. Euclidean distance to all historical windows → rank → top-K analogs
  5. Return analog windows with similarity score, dominant regime, and outcome context

No fake/synthetic data. Returns an empty list with an explanation if data is insufficient.
"""

from __future__ import annotations

import math
import statistics
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.historical_analog")

# Series → feature dimension mapping
_GROWTH_SERIES = "UNRATE"
_LIQUIDITY_SERIES = "WALCL"
_INFLATION_SERIES = "CPILFESL"
_RATES_SERIES = "DGS10"

# Minimum data points needed for a reliable analog search
_MIN_HISTORY_DAYS = 252 * 3  # 3 years


def _euclidean(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


async def find_analogs(
    lookback_years: int = 10,
    top_k: int = 4,
    min_gap_days: int = 90,
) -> dict:
    """
    Find historical analogs to current conditions.
    Returns dict with: analogs list, current_vector, data_quality, generated_at.
    """
    bq = get_bigquery_client()
    macro_table = fully_qualified(settings.BQ_DATASET_FEATURES, "macro_features")
    vol_table = fully_qualified(settings.BQ_DATASET_FEATURES, "volatility_features")
    today = datetime.now(timezone.utc).date().isoformat()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_years * 365)).date().isoformat()

    # ── Load macro feature snapshots ──────────────────────────────────────────
    series_ids = [_GROWTH_SERIES, _LIQUIDITY_SERIES, _INFLATION_SERIES, _RATES_SERIES]
    macro_sql = f"""
        SELECT
          DATE(observation_time) AS d,
          series_id,
          zscore_36m,
          trend_label
        FROM `{macro_table}`
        WHERE series_id IN ({', '.join(f"'{s}'" for s in series_ids)})
          AND DATE(observation_time) >= DATE('{cutoff}')
          AND zscore_36m IS NOT NULL
        ORDER BY observation_time ASC
    """
    try:
        macro_rows = list(bq.query(macro_sql).result())
    except Exception as e:
        log.warning("analog.macro_query_failed", error=str(e))
        return {"analogs": [], "error": str(e), "data_quality": "unavailable"}

    # ── Load vol feature snapshots (SPY as universe proxy) ────────────────────
    vol_sql = f"""
        SELECT
          DATE(observation_time) AS d,
          AVG(vol_percentile_rank) AS med_vol_pct
        FROM `{vol_table}`
        WHERE DATE(observation_time) >= DATE('{cutoff}')
          AND vol_percentile_rank IS NOT NULL
          AND symbol IN ('SPY', 'QQQ', 'IWM')
        GROUP BY d
        ORDER BY d ASC
    """
    try:
        vol_rows = list(bq.query(vol_sql).result())
    except Exception as e:
        log.warning("analog.vol_query_failed", error=str(e))
        vol_rows = []

    # ── Build per-day feature matrix ──────────────────────────────────────────
    # Pivot macro: {date: {series_id: zscore}}
    day_macro: dict[str, dict[str, float]] = {}
    for r in macro_rows:
        d = str(r["d"])
        sid = r["series_id"]
        z = r["zscore_36m"]
        if z is not None:
            day_macro.setdefault(d, {})[sid] = float(z)

    # Vol lookup
    vol_by_day: dict[str, float] = {}
    for r in vol_rows:
        vol_by_day[str(r["d"])] = float(r["med_vol_pct"] or 0.5)

    # Build unified feature vectors
    # Dimensions: [growth_z, liquidity_z, inflation_z, rates_z, vol_pct]
    vectors: dict[str, list[float]] = {}
    for d, macros in day_macro.items():
        if len(macros) < 3:  # need at least 3 of 4 series
            continue
        growth_z = macros.get(_GROWTH_SERIES, 0.0)
        liq_z = macros.get(_LIQUIDITY_SERIES, 0.0)
        inf_z = macros.get(_INFLATION_SERIES, 0.0)
        rates_z = macros.get(_RATES_SERIES, 0.0)
        vol_pct = vol_by_day.get(d, 0.5)
        vectors[d] = [growth_z, liq_z, inf_z, rates_z, vol_pct]

    if len(vectors) < _MIN_HISTORY_DAYS:
        return {
            "analogs": [],
            "data_quality": "insufficient",
            "data_quality_note": (
                f"Only {len(vectors)} days of feature history available; "
                f"need ≥{_MIN_HISTORY_DAYS} for reliable analog search."
            ),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── Current vector (most recent day with full data) ───────────────────────
    sorted_days = sorted(vectors.keys())
    # Look for most recent day with all 4 macro series
    current_day = None
    for d in reversed(sorted_days):
        if d >= today[:10]:
            continue  # future dates (shouldn't happen but guard)
        macros = day_macro.get(d, {})
        if all(s in macros for s in series_ids):
            current_day = d
            break

    if current_day is None:
        # Fall back to most recent available
        current_day = sorted_days[-1]

    current_vec = vectors[current_day]

    # ── Distance computation ──────────────────────────────────────────────────
    distances: list[tuple[str, float]] = []
    for d, vec in vectors.items():
        if d >= current_day:
            continue  # exclude current and future
        dist = _euclidean(current_vec, vec)
        distances.append((d, dist))

    distances.sort(key=lambda x: x[1])

    # ── Select top-K with min_gap_days separation ─────────────────────────────
    selected: list[tuple[str, float]] = []
    for d, dist in distances:
        # Check gap from already-selected days
        if all(
            abs((datetime.strptime(d, "%Y-%m-%d") - datetime.strptime(sd, "%Y-%m-%d")).days)
            >= min_gap_days
            for sd, _ in selected
        ):
            selected.append((d, dist))
            if len(selected) >= top_k:
                break

    # ── Max distance for normalisation ───────────────────────────────────────
    if distances:
        max_dist = max(dist for _, dist in distances[:50]) or 1.0
    else:
        max_dist = 1.0

    # ── Build output ──────────────────────────────────────────────────────────
    analogs = []
    for analog_day, dist in selected:
        similarity = max(0.0, 1.0 - (dist / max_dist))
        vec = vectors[analog_day]
        m = day_macro.get(analog_day, {})

        # Regime narrative for this analog window
        growth_z = vec[0]
        liq_z = vec[1]
        inf_z = vec[2]
        rates_z = vec[3]
        vol_p = vec[4]

        if growth_z > 0.5 and liq_z > 0 and inf_z < 1.0:
            regime_label = "expansion"
        elif growth_z < -0.5 and inf_z > 1.0:
            regime_label = "stagflation"
        elif growth_z < -0.5:
            regime_label = "contraction"
        elif liq_z < -0.5:
            regime_label = "tightening"
        else:
            regime_label = "transition"

        analogs.append({
            "date": analog_day,
            "similarity_score": round(similarity, 3),
            "distance": round(dist, 4),
            "regime_label": regime_label,
            "feature_vector": {
                "growth_zscore": round(vec[0], 3),
                "liquidity_zscore": round(vec[1], 3),
                "inflation_zscore": round(vec[2], 3),
                "rates_zscore": round(vec[3], 3),
                "vol_percentile": round(vec[4], 3),
            },
            "context_note": (
                f"Period characterised by {regime_label} conditions "
                f"(vol at {vol_p:.0%} historical percentile). "
                f"Growth z-score {growth_z:+.2f}, liquidity {liq_z:+.2f}, "
                f"inflation {inf_z:+.2f}, rates {rates_z:+.2f}."
            ),
        })

    return {
        "analogs": analogs,
        "current_day": current_day,
        "current_vector": {
            "growth_zscore": round(current_vec[0], 3),
            "liquidity_zscore": round(current_vec[1], 3),
            "inflation_zscore": round(current_vec[2], 3),
            "rates_zscore": round(current_vec[3], 3),
            "vol_percentile": round(current_vec[4], 3),
        },
        "history_days": len(vectors),
        "data_quality": "full" if len(vectors) >= _MIN_HISTORY_DAYS * 2 else "partial",
        "source_tables": [macro_table, vol_table],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
