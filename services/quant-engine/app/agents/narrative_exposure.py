"""
Narrative Exposure Engine — V4 Phase 2.

Maps portfolio holdings to active narrative themes from the V3P2 warehouse:
  - research.narrative_memory    (persistent narrative themes + related_symbols)
  - features.narrative_features  (current intensity + emergence scores)
  - features.ontology_features   (entity-symbol relationships)

For each narrative theme, computes:
  - portfolio_weight : sum of holding weights where symbol is in related_symbols
  - theme_intensity  : current narrative intensity from narrative_features
  - theme_polarity   : positive/negative/neutral
  - matching_symbols : which holdings are exposed to this theme

Surfaces: AI, rates, semiconductor, consumer weakness, energy, supply chain,
liquidity, geopolitical, and other detected themes.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.narrative_exposure")


async def compute_narrative_exposure(
    symbols: list[str],
    weights: Optional[dict[str, float]] = None,
    top_k: int = 10,
) -> dict:
    """
    Compute narrative exposure for a list of symbols with optional weights.
    symbols: list of portfolio/watchlist symbols
    weights: {symbol: weight 0-1}; if None, equal weighting assumed
    """
    if not symbols:
        return {
            "exposures": [],
            "error": "No symbols provided",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    bq = get_bigquery_client()
    narrative_mem = fully_qualified(settings.BQ_DATASET_RESEARCH, "narrative_memory")
    narrative_feat = fully_qualified(settings.BQ_DATASET_FEATURES, "narrative_features")
    today = datetime.now(timezone.utc).date().isoformat()

    # Normalise weights
    if weights:
        total = sum(weights.values())
        norm_weights = {s: w / total for s, w in weights.items()} if total > 0 else {}
    else:
        norm_weights = {s: 1.0 / len(symbols) for s in symbols}

    # ── Load narrative memory (all active themes) ─────────────────────────────
    mem_sql = f"""
        SELECT
          theme_id, theme_label, related_symbols, polarity_mean,
          intensity_mean, lifetime_score, last_seen_at, tags
        FROM `{narrative_mem}`
        WHERE last_seen_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
          AND theme_label IS NOT NULL
        ORDER BY lifetime_score DESC
        LIMIT 100
    """
    try:
        mem_rows = [dict(r) for r in bq.query(mem_sql).result()]
    except Exception as e:
        log.warning("narrative_exposure.mem_query_failed", error=str(e))
        mem_rows = []

    # ── Load current narrative feature scores ─────────────────────────────────
    feat_sql = f"""
        SELECT theme_id, emergence_score, intensity_mean, mentions_7d, polarity_mean
        FROM `{narrative_feat}`
        WHERE DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
          AND theme_id IS NOT NULL
        ORDER BY observation_time DESC
    """
    try:
        feat_rows = [dict(r) for r in bq.query(feat_sql).result()]
    except Exception as e:
        log.warning("narrative_exposure.feat_query_failed", error=str(e))
        feat_rows = []

    # Feature lookup: theme_id → {emergence_score, intensity_mean, mentions_7d}
    feat_by_theme: dict[str, dict] = {}
    for r in feat_rows:
        tid = r["theme_id"]
        if tid and tid not in feat_by_theme:
            feat_by_theme[tid] = {
                "emergence_score": r.get("emergence_score") or 0.0,
                "intensity_mean": r.get("intensity_mean") or 0.0,
                "mentions_7d": r.get("mentions_7d") or 0,
                "polarity_mean": r.get("polarity_mean") or 0.0,
            }

    # ── Match symbols to themes ───────────────────────────────────────────────
    symbol_set = set(s.upper() for s in symbols)
    exposures: list[dict] = []

    for r in mem_rows:
        related = [s.upper() for s in (r.get("related_symbols") or [])]
        matched = [s for s in related if s in symbol_set]
        if not matched:
            continue

        portfolio_weight = sum(norm_weights.get(s, 0.0) for s in matched)
        if portfolio_weight < 0.005:  # skip negligible exposures
            continue

        theme_id = r["theme_id"] or ""
        feat = feat_by_theme.get(theme_id, {})

        polarity = float(r.get("polarity_mean") or feat.get("polarity_mean") or 0.0)
        if polarity > 0.1:
            polarity_label = "positive"
        elif polarity < -0.1:
            polarity_label = "negative"
        else:
            polarity_label = "neutral"

        intensity = float(r.get("intensity_mean") or feat.get("intensity_mean") or 0.0)
        emergence = float(feat.get("emergence_score") or 0.0)
        mentions_7d = int(feat.get("mentions_7d") or 0)

        exposures.append({
            "theme_id": theme_id,
            "theme_label": r["theme_label"] or theme_id,
            "portfolio_weight": round(portfolio_weight, 4),
            "matching_symbols": matched[:8],
            "polarity_label": polarity_label,
            "polarity_score": round(polarity, 3),
            "intensity": round(intensity, 3),
            "emergence_score": round(emergence, 3),
            "mentions_7d": mentions_7d,
            "lifetime_score": round(float(r.get("lifetime_score") or 0), 3),
            "tags": list(r.get("tags") or []),
            "last_seen": str(r.get("last_seen_at") or ""),
        })

    # Sort by portfolio weight * intensity (most impactful first)
    exposures.sort(key=lambda x: -(x["portfolio_weight"] * (x["intensity"] + 0.1)))
    exposures = exposures[:top_k]

    return {
        "exposures": exposures,
        "symbols_analysed": list(symbol_set),
        "themes_matched": len(exposures),
        "themes_scanned": len(mem_rows),
        "data_quality": "full" if mem_rows else "unavailable",
        "source_tables": [narrative_mem, narrative_feat],
        "generated_at": today,
    }
