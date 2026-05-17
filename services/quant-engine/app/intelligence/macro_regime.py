"""
Macro Regime Intelligence engine (Wave G).

Reads `cleaned.macro_cleaned` (populated by Wave C's FRED ingestor) and
classifies four regimes at the latest available date:

  • Liquidity regime  — M2 + Fed balance sheet + ON RRP + DXY direction
  • Inflation regime  — Core CPI/PCE YoY + breakevens + headline CPI
  • Rates regime      — Fed funds direction + 10Y level + 2s10s curve shape
  • Growth regime     — Unemployment trend + NFP + ISM-equivalent activity

Writes to:
  • features.macro_features    (per-series regime tags, regime confidence)
  • research.macro_observations (narrative summary per regime + transition note)
  • artifacts.macro_artifacts  (artifact_type = regime_transition | regime_state)

Classifier is deterministic band + z-score logic. We avoid heavier statistical
models here so the engine is interpretable and re-runs are reproducible. The
Wave J contextual-analog engine consumes these regime tags as features.
"""

from __future__ import annotations

import json
import statistics
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified

log = structlog.get_logger("quant_engine.intelligence.macro_regime")


# ─── Regime labels (closed sets for downstream join-friendliness) ─────────────

LIQUIDITY_STATES = ("expanding", "neutral", "contracting", "stressed")
INFLATION_STATES = ("disinflating", "stable", "sticky", "accelerating", "deflationary")
RATES_STATES = ("cutting", "neutral", "hiking", "restrictive")
CURVE_STATES = ("normal", "flat", "inverted")
GROWTH_STATES = ("expansion", "slowdown", "contraction", "recovery")


@dataclass
class SeriesSnapshot:
    series_id: str
    value: Optional[float]
    yoy: Optional[float]
    mom: Optional[float]
    zscore_36m: Optional[float]
    percentile_120m: Optional[float]
    trend_label: Optional[str]
    last_date: Optional[str]


@dataclass
class RegimeResult:
    label: str
    confidence: float
    drivers: dict
    body: str


# ─── Data loader ──────────────────────────────────────────────────────────────


def _load_series(
    series_ids: list[str],
    *,
    lookback_days: int = 365 * 10,
) -> dict[str, list[dict]]:
    """Return {series_id: [observations sorted asc]} from cleaned.macro_cleaned."""
    bq = get_bigquery_client()
    cleaned = fully_qualified(settings.BQ_DATASET_CLEANED, "macro_cleaned")
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=lookback_days)).isoformat()
    in_list = ", ".join(f"'{s}'" for s in series_ids)
    sql = f"""
        SELECT
          series_id,
          DATE(observation_time) AS d,
          value,
          yoy_change,
          mom_change
        FROM `{cleaned}`
        WHERE series_id IN ({in_list})
          AND DATE(observation_time) >= DATE('{cutoff}')
          AND value IS NOT NULL
        ORDER BY series_id, observation_time ASC
    """
    rows = list(bq.query(sql).result())
    grouped: dict[str, list[dict]] = {sid: [] for sid in series_ids}
    for r in rows:
        sid = r["series_id"]
        if sid in grouped:
            grouped[sid].append({
                "date": str(r["d"]),
                "value": float(r["value"]),
                "yoy": float(r["yoy_change"]) if r["yoy_change"] is not None else None,
                "mom": float(r["mom_change"]) if r["mom_change"] is not None else None,
            })
    return grouped


def _snapshot(series_id: str, points: list[dict]) -> Optional[SeriesSnapshot]:
    if not points:
        return None
    last = points[-1]
    values = [p["value"] for p in points if p["value"] is not None]
    if not values:
        return None
    # 36m window for z-score, 120m for percentile
    window_36m = values[-min(len(values), 36 * 22):]  # daily approx → ~3y of daily obs
    window_120m = values[-min(len(values), 120 * 22):]
    try:
        mu = statistics.mean(window_36m)
        sd = statistics.pstdev(window_36m) or 1e-9
        z = (last["value"] - mu) / sd
    except Exception:
        z = None
    try:
        sorted_w = sorted(window_120m)
        rank = sum(1 for v in sorted_w if v <= last["value"]) / len(sorted_w)
        pct = round(rank, 4)
    except Exception:
        pct = None
    trend = None
    if len(values) >= 22:
        recent = statistics.mean(values[-5:])
        prior = statistics.mean(values[-22:-5])
        trend = "up" if recent > prior * 1.001 else "down" if recent < prior * 0.999 else "flat"
    return SeriesSnapshot(
        series_id=series_id,
        value=last["value"],
        yoy=last.get("yoy"),
        mom=last.get("mom"),
        zscore_36m=round(z, 4) if z is not None else None,
        percentile_120m=pct,
        trend_label=trend,
        last_date=last["date"],
    )


# ─── Classifiers ──────────────────────────────────────────────────────────────


def classify_liquidity(snaps: dict[str, SeriesSnapshot]) -> RegimeResult:
    """
    Liquidity proxies:
      WALCL  (Fed balance sheet) — expansion vs contraction (yoy)
      M2SL   (M2 money supply)   — yoy growth
      RRPONTSYD (ON RRP)         — falling RRP = liquidity returning to system
      DTWEXBGS (broad USD)       — strong dollar = global liquidity drain
    """
    wal = snaps.get("WALCL")
    m2 = snaps.get("M2SL")
    rrp = snaps.get("RRPONTSYD")
    dxy = snaps.get("DTWEXBGS")

    score = 0.0
    drivers = {}
    if wal and wal.yoy is not None:
        score += (wal.yoy * 10)   # WALCL yoy small in % terms
        drivers["WALCL_yoy"] = wal.yoy
    if m2 and m2.yoy is not None:
        score += (m2.yoy * 8)
        drivers["M2_yoy"] = m2.yoy
    if rrp and rrp.trend_label:
        # falling RRP = liquidity easing
        score += (0.5 if rrp.trend_label == "down" else -0.5 if rrp.trend_label == "up" else 0)
        drivers["RRP_trend"] = rrp.trend_label
    if dxy and dxy.yoy is not None:
        score -= (dxy.yoy * 2)
        drivers["DXY_yoy"] = dxy.yoy

    if score >= 1.0:
        label = "expanding"
    elif score >= 0.0:
        label = "neutral"
    elif score >= -1.5:
        label = "contracting"
    else:
        label = "stressed"
    confidence = min(1.0, abs(score) / 3.0)
    body = (
        f"Liquidity regime classified as **{label}**. "
        f"Driver mix: {json.dumps(drivers, sort_keys=True)}. "
        f"Composite liquidity score: {round(score, 3)} (positive = ease, negative = tighten)."
    )
    return RegimeResult(label, round(confidence, 4), drivers, body)


def classify_inflation(snaps: dict[str, SeriesSnapshot]) -> RegimeResult:
    """
    CPILFESL (Core CPI yoy) is the anchor. PCEPILFE confirms. T10YIE = market.
    """
    core = snaps.get("CPILFESL")
    head = snaps.get("CPIAUCSL")
    core_pce = snaps.get("PCEPILFE")
    breakeven = snaps.get("T10YIE")

    core_yoy = core.yoy if core and core.yoy is not None else None
    head_yoy = head.yoy if head and head.yoy is not None else None
    pce_yoy = core_pce.yoy if core_pce and core_pce.yoy is not None else None
    be = breakeven.value if breakeven and breakeven.value is not None else None

    drivers = {"core_cpi_yoy": core_yoy, "headline_cpi_yoy": head_yoy,
               "core_pce_yoy": pce_yoy, "breakeven_10y": be}

    if core_yoy is None:
        return RegimeResult("stable", 0.2, drivers, "Insufficient inflation data — defaulting to stable.")

    # Direction (using mom for momentum)
    accelerating = bool(core and core.mom is not None and core.mom > 0.002)  # ~0.2% mom = hot
    disinflating = bool(core and core.mom is not None and core.mom < -0.001)

    if core_yoy < 0:
        label = "deflationary"
    elif core_yoy < 0.02:
        label = "stable"
    elif core_yoy < 0.03 and disinflating:
        label = "disinflating"
    elif core_yoy < 0.04:
        label = "sticky"
    elif accelerating or core_yoy >= 0.04:
        label = "accelerating"
    else:
        label = "sticky"

    confidence = min(1.0, abs(core_yoy - 0.02) * 25)
    body = (
        f"Inflation regime: **{label}**. Core CPI yoy {core_yoy:.2%}, "
        f"PCE core yoy {pce_yoy:.2%} (10y breakeven {be:.2%})."
        if pce_yoy is not None and be is not None
        else f"Inflation regime: **{label}**. Core CPI yoy {core_yoy:.2%}."
    )
    return RegimeResult(label, round(confidence, 4), drivers, body)


def classify_rates(snaps: dict[str, SeriesSnapshot]) -> RegimeResult:
    """
    Rates regime via FFR level + trend, curve via 2s10s.
    """
    ffr = snaps.get("FEDFUNDS") or snaps.get("DFF")
    ten = snaps.get("DGS10")
    two = snaps.get("DGS2")
    spread = snaps.get("T10Y2Y")

    drivers = {
        "ffr": ffr.value if ffr else None,
        "ffr_trend": ffr.trend_label if ffr else None,
        "ust10y": ten.value if ten else None,
        "ust2y": two.value if two else None,
        "spread_10y2y": spread.value if spread else None,
    }

    # rates state
    if ffr and ffr.trend_label == "up":
        label_rates = "hiking"
    elif ffr and ffr.trend_label == "down":
        label_rates = "cutting"
    elif ffr and ffr.value is not None and ffr.value >= 4.5:
        label_rates = "restrictive"
    else:
        label_rates = "neutral"

    # curve shape
    sp = spread.value if spread and spread.value is not None else None
    if sp is None:
        curve = "flat"
    elif sp < -0.1:
        curve = "inverted"
    elif sp < 0.3:
        curve = "flat"
    else:
        curve = "normal"

    composite_label = f"{label_rates}/{curve}"
    confidence = 0.7 if ffr and ffr.value is not None else 0.3
    body = (
        f"Rates regime: **{label_rates}**, curve **{curve}** (2s10s {sp:.2f}%)."
        if sp is not None
        else f"Rates regime: **{label_rates}**, curve shape unavailable."
    )
    return RegimeResult(composite_label, confidence, drivers, body)


def classify_growth(snaps: dict[str, SeriesSnapshot]) -> RegimeResult:
    """
    Growth state via UNRATE direction + NFP momentum + INDPRO yoy.
    """
    unrate = snaps.get("UNRATE")
    nfp = snaps.get("PAYEMS")
    indpro = snaps.get("INDPRO")

    drivers = {
        "unrate": unrate.value if unrate else None,
        "unrate_trend": unrate.trend_label if unrate else None,
        "nfp_yoy": nfp.yoy if nfp else None,
        "indpro_yoy": indpro.yoy if indpro else None,
    }

    score = 0.0
    if unrate and unrate.trend_label == "up":
        score -= 1.0
    elif unrate and unrate.trend_label == "down":
        score += 0.5
    if nfp and nfp.yoy is not None:
        score += nfp.yoy * 10
    if indpro and indpro.yoy is not None:
        score += indpro.yoy * 5

    if score >= 1.5:
        label = "expansion"
    elif score >= 0.0:
        label = "recovery" if unrate and unrate.trend_label == "down" else "slowdown"
    elif score >= -1.5:
        label = "slowdown"
    else:
        label = "contraction"
    confidence = min(1.0, abs(score) / 3.0)
    body = (
        f"Growth regime: **{label}**. UNRATE {drivers.get('unrate')} "
        f"(trend {drivers.get('unrate_trend')}); NFP yoy {drivers.get('nfp_yoy')}; "
        f"IP yoy {drivers.get('indpro_yoy')}. Composite score {round(score, 3)}."
    )
    return RegimeResult(label, round(confidence, 4), drivers, body)


# ─── Orchestrator ─────────────────────────────────────────────────────────────


_SERIES_NEEDED = [
    # Liquidity
    "WALCL", "M2SL", "RRPONTSYD", "DTWEXBGS",
    # Inflation
    "CPIAUCSL", "CPILFESL", "PCEPILFE", "T10YIE",
    # Rates
    "FEDFUNDS", "DFF", "DGS10", "DGS2", "T10Y2Y",
    # Growth
    "UNRATE", "PAYEMS", "INDPRO",
]


def _serialize(d: dict) -> dict:
    out = dict(d)
    for k, v in list(out.items()):
        if isinstance(v, dict):
            out[k] = json.dumps(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


async def compute_macro_regimes(run_id: str) -> dict:
    """
    Compute the four regimes, persist features/observations/artifacts. Returns
    a run summary.
    """
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    summary = {
        "run_id": run_id,
        "pipeline_name": "macro_regime",
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
    }
    _runs[run_id] = summary

    try:
        grouped = _load_series(_SERIES_NEEDED)
    except Exception as e:
        summary["status"] = "failed"
        summary["completed_at"] = datetime.now(timezone.utc).isoformat()
        summary["errors"].append({"stage": "load", "error": str(e)})
        log.error("macro_regime.load_failed", error=str(e))
        return summary

    snaps: dict[str, SeriesSnapshot] = {}
    for sid in _SERIES_NEEDED:
        s = _snapshot(sid, grouped.get(sid) or [])
        if s:
            snaps[sid] = s

    if not snaps:
        summary["status"] = "completed"
        summary["completed_at"] = datetime.now(timezone.utc).isoformat()
        summary["errors"].append({"stage": "snapshot", "error": "no macro data available"})
        return summary

    liquidity = classify_liquidity(snaps)
    inflation = classify_inflation(snaps)
    rates = classify_rates(snaps)
    growth = classify_growth(snaps)

    now = datetime.now(timezone.utc).isoformat()
    bq = get_bigquery_client()
    macro_features = fully_qualified(settings.BQ_DATASET_FEATURES, "macro_features")
    macro_obs = fully_qualified(settings.BQ_DATASET_RESEARCH, "macro_observations")
    macro_art = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "macro_artifacts")

    # Feature rows — one per series snapshot with the dominant regime label
    feature_rows = []
    for sid, snap in snaps.items():
        # series-to-regime affinity (which classifier "owns" this series)
        if sid in ("WALCL", "M2SL", "RRPONTSYD", "DTWEXBGS"):
            regime_label, regime_conf = liquidity.label, liquidity.confidence
        elif sid in ("CPIAUCSL", "CPILFESL", "PCEPILFE", "T10YIE"):
            regime_label, regime_conf = inflation.label, inflation.confidence
        elif sid in ("FEDFUNDS", "DFF", "DGS10", "DGS2", "T10Y2Y"):
            regime_label, regime_conf = rates.label, rates.confidence
        else:
            regime_label, regime_conf = growth.label, growth.confidence

        feature_rows.append({
            "id": str(uuid.uuid4()),
            "symbol": None,
            "asset_type": "macro",
            "provider": "deplyze_quant",
            "source_url": f"https://fred.stlouisfed.org/series/{sid}",
            "source_type": "macro_feature",
            "ingestion_time": now,
            "observation_time": (snap.last_date + "T00:00:00+00:00") if snap.last_date else now,
            "processing_time": now,
            "lineage_id": f"macro_regime:{sid}:{snap.last_date}",
            "confidence": regime_conf,
            "data_quality_score": 1.0,
            "created_at": now,
            "series_id": sid,
            "series_name": sid,
            "frequency": None,
            "value": snap.value,
            "yoy_change": snap.yoy,
            "mom_change": snap.mom,
            "zscore_36m": snap.zscore_36m,
            "percentile_120m": snap.percentile_120m,
            "trend_label": snap.trend_label,
            "regime_label": regime_label,
            "regime_confidence": regime_conf,
            "updated_at": now,
        })

    # Observation rows — one per regime, narrative summary
    obs_rows = []
    artifact_rows = []
    for kind, res in (
        ("liquidity_regime", liquidity),
        ("inflation_regime", inflation),
        ("rates_regime", rates),
        ("growth_regime", growth),
    ):
        obs_rows.append({
            "id": str(uuid.uuid4()),
            "symbol": None,
            "asset_type": "macro",
            "provider": "deplyze_quant",
            "source_url": None,
            "source_type": "macro_intelligence",
            "ingestion_time": now,
            "observation_time": now,
            "lineage_id": f"macro_regime_obs:{kind}:{now[:10]}",
            "confidence": res.confidence,
            "data_quality_score": 1.0,
            "created_at": now,
            "observation_type": kind,
            "regime_state": res.label,
            "title": f"{kind.replace('_', ' ').title()}: {res.label}",
            "summary": res.body[:280],
            "body": res.body,
            "related_series": list(res.drivers.keys()),
            "related_symbols": [],
            "tags": [kind, res.label, "macro"],
            "severity": (
                "high" if res.confidence > 0.7 else "med" if res.confidence > 0.4 else "low"
            ),
            "updated_at": now,
        })
        artifact_rows.append({
            "artifact_id": f"macro:{kind}:{now[:10]}",
            "artifact_type": kind,
            "title": f"{kind.replace('_', ' ').title()}: {res.label}",
            "summary": res.body[:280],
            "symbol": None,
            "related_symbols": [],
            "evidence": res.drivers,
            "metrics": {"confidence": res.confidence, "label": res.label},
            "confidence": res.confidence,
            "severity": "high" if res.confidence > 0.7 else "med" if res.confidence > 0.4 else "low",
            "source_tables": [fully_qualified(settings.BQ_DATASET_CLEANED, "macro_cleaned")],
            "lineage_id": f"macro_regime:{kind}:{now[:10]}",
            "is_test": False,
            "created_at": now,
            "updated_at": now,
        })

    def _chunks(rows_, size=200):
        for i in range(0, len(rows_), size):
            yield rows_[i : i + size]

    for table, rows in (
        (macro_features, feature_rows),
        (macro_obs, obs_rows),
        (macro_art, artifact_rows),
    ):
        serialized = [_serialize(r) for r in rows]
        for batch in _chunks(serialized):
            errors = bq.insert_rows_json(table, batch)
            if errors:
                log.error("macro_regime.bq_errors", table=table, errors=errors[:3])
                summary["errors"].append({"table": table, "errors": errors[:3]})
            else:
                summary["records_processed"] += len(batch)
                if table == macro_art:
                    summary["artifacts_generated"] += len(batch)

    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = datetime.now(timezone.utc).isoformat()
    log.info(
        "macro_regime.complete",
        run_id=run_id,
        liquidity=liquidity.label,
        inflation=inflation.label,
        rates=rates.label,
        growth=growth.label,
        artifacts=summary["artifacts_generated"],
    )
    return summary
