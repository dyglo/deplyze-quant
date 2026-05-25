"""
Feature engineering engine.
Reads cleaned OHLCV, computes all feature vectors, writes to features.* tables.

All calculations:
  - avoid lookahead bias (only use data up to observation_time)
  - preserve timestamps and lineage
  - include quality/confidence fields
"""

import uuid
import json
import structlog
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import List, Optional

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified

log = structlog.get_logger("quant_engine.features.engine")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val):
    """Return None for NaN/Inf, else round to 8 decimal places."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, 8)
    except Exception:
        return None


# ─── Pure calculation functions (no lookahead) ────────────────────────────────

def simple_returns(prices: np.ndarray) -> np.ndarray:
    """Simple period-over-period returns. Length = len(prices)-1."""
    if len(prices) < 2:
        return np.array([])
    return np.diff(prices) / prices[:-1]


def log_returns(prices: np.ndarray) -> np.ndarray:
    if len(prices) < 2:
        return np.array([])
    return np.diff(np.log(prices))


def rolling_vol(returns: np.ndarray, window: int = 21, annualize: bool = True) -> float:
    if len(returns) < window:
        return None
    r = returns[-window:]
    vol = float(np.std(r, ddof=1))
    return vol * np.sqrt(252) if annualize else vol


def max_drawdown(prices: np.ndarray) -> float:
    if len(prices) < 2:
        return None
    peak = np.maximum.accumulate(prices)
    dd = (prices - peak) / peak
    return float(np.min(dd))


def z_score(series: np.ndarray, window: int = 21) -> float:
    if len(series) < window:
        return None
    s = series[-window:]
    std = np.std(s, ddof=1)
    if std == 0:
        return 0.0
    return float((s[-1] - np.mean(s)) / std)


def percentile_rank(history: np.ndarray, value: float) -> float:
    if len(history) == 0:
        return None
    return float(np.sum(history <= value) / len(history))


def momentum_n(prices: np.ndarray, n: int) -> float:
    if len(prices) <= n:
        return None
    return float((prices[-1] - prices[-n - 1]) / prices[-n - 1])


def momentum_persistence(returns: np.ndarray, window: int = 21) -> float:
    """Fraction of days with positive returns over window."""
    if len(returns) < window:
        return None
    r = returns[-window:]
    return float(np.sum(r > 0) / len(r))


def anomaly_score(returns: np.ndarray, window: int = 63) -> float:
    """Z-score of latest return vs recent history. High abs = anomaly."""
    if len(returns) < window:
        return None
    hist = returns[-window:-1]
    curr = returns[-1]
    std = np.std(hist, ddof=1)
    if std == 0:
        return 0.0
    return float(abs((curr - np.mean(hist)) / std))


def regime_label(returns: np.ndarray, vol_21: float) -> str:
    """Simple regime classification from recent returns and volatility."""
    if returns is None or len(returns) < 21 or vol_21 is None:
        return "unknown"
    r21 = float(np.sum(returns[-21:]))
    if vol_21 > 0.30:
        return "high_vol_stress"
    if r21 > 0.05 and vol_21 < 0.15:
        return "bull_low_vol"
    if r21 < -0.05 and vol_21 > 0.20:
        return "bear_high_vol"
    if abs(r21) < 0.02:
        return "consolidation"
    return "transitional"


# ─── BQ query ─────────────────────────────────────────────────────────────────

def _load_cleaned_ohlcv(client, symbol: str, lookback_days: int = 365) -> pd.DataFrame:
    query = f"""
        SELECT observation_time, close, volume, adjusted_close, lineage_id
        FROM `{fully_qualified(settings.BQ_DATASET_CLEANED, 'ohlcv_cleaned')}`
        WHERE symbol = @symbol
          AND observation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
        ORDER BY observation_time ASC
    """
    bq = __import__("google.cloud.bigquery", fromlist=["QueryJobConfig", "ScalarQueryParameter"])
    job_config = bq.QueryJobConfig(
        query_parameters=[bq.ScalarQueryParameter("symbol", "STRING", symbol)]
    )
    return client.query(query, job_config=job_config).to_dataframe()


# ─── Feature writers ─────────────────────────────────────────────────────────

def _write_rows(table_fqn: str, rows: List[dict]) -> int:
    if not rows:
        return 0
    client = get_bigquery_client()
    clean = []
    for r in rows:
        cr = {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in r.items()}
        clean.append(cr)
    bq = __import__("google.cloud.bigquery", fromlist=["QueryJobConfig", "ScalarQueryParameter"])
    deduped = []
    for row in clean:
        symbol = row.get("symbol")
        observation_time = row.get("observation_time")
        provider = row.get("provider")
        if not symbol or not observation_time or not provider:
            deduped.append(row)
            continue
        exists_sql = f"""
            SELECT 1
            FROM `{table_fqn}`
            WHERE symbol = @symbol
              AND provider = @provider
              AND DATE(observation_time) = DATE(@observation_time)
            LIMIT 1
        """
        job_config = bq.QueryJobConfig(query_parameters=[
            bq.ScalarQueryParameter("symbol", "STRING", symbol),
            bq.ScalarQueryParameter("provider", "STRING", provider),
            bq.ScalarQueryParameter("observation_time", "TIMESTAMP", observation_time),
        ])
        if not list(client.query(exists_sql, job_config=job_config).result()):
            deduped.append(row)
    if not deduped:
        return 0
    errors = client.insert_rows_json(table_fqn, deduped)
    if errors:
        log.error("features.write_errors", table=table_fqn, errors=errors[:2])
    return len(deduped) - len(errors)


def _compute_and_write_returns(symbol: str, df: pd.DataFrame, now: str) -> int:
    prices = df["adjusted_close"].to_numpy(dtype=float)
    rets = simple_returns(prices)
    log_rets = log_returns(prices)
    if len(rets) < 5:
        return 0
    row = {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "asset_type": "equity",
        "provider": "derived",
        "source_type": "feature",
        "ingestion_time": now,
        "observation_time": str(df["observation_time"].iloc[-1]),
        "simple_return_1d": _safe(rets[-1] if len(rets) >= 1 else None),
        "simple_return_5d": _safe((prices[-1] / prices[-6] - 1) if len(prices) >= 6 else None),
        "simple_return_21d": _safe((prices[-1] / prices[-22] - 1) if len(prices) >= 22 else None),
        "simple_return_63d": _safe((prices[-1] / prices[-64] - 1) if len(prices) >= 64 else None),
        "log_return_1d": _safe(log_rets[-1] if len(log_rets) >= 1 else None),
        "log_return_5d": _safe(np.sum(log_rets[-5:]) if len(log_rets) >= 5 else None),
        "cumulative_return_ytd": _safe((prices[-1] / prices[0] - 1) if len(prices) >= 2 else None),
        "max_drawdown_21d": _safe(max_drawdown(prices[-22:]) if len(prices) >= 22 else None),
        "max_drawdown_252d": _safe(max_drawdown(prices[-253:]) if len(prices) >= 253 else None),
        "data_quality_score": 1.0,
        "lineage_id": str(df["lineage_id"].iloc[-1]) if "lineage_id" in df.columns else None,
        "confidence": 1.0,
        "created_at": now,
        "updated_at": now,
    }
    table = fully_qualified(settings.BQ_DATASET_FEATURES, "returns_features")
    return _write_rows(table, [row])


def _compute_and_write_volatility(symbol: str, df: pd.DataFrame, now: str) -> int:
    prices = df["adjusted_close"].to_numpy(dtype=float)
    rets = simple_returns(prices)
    if len(rets) < 21:
        return 0
    vol21 = rolling_vol(rets, 21)
    vol63 = rolling_vol(rets, 63) if len(rets) >= 63 else None
    vol252 = rolling_vol(rets, 252) if len(rets) >= 252 else None
    vol_z = z_score(np.array([rolling_vol(rets[:i], 21) for i in range(21, len(rets)+1) if rolling_vol(rets[:i], 21) is not None]))
    row = {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "asset_type": "equity",
        "provider": "derived",
        "source_type": "feature",
        "ingestion_time": now,
        "observation_time": str(df["observation_time"].iloc[-1]),
        "realized_vol_21d": _safe(vol21),
        "realized_vol_63d": _safe(vol63),
        "realized_vol_252d": _safe(vol252),
        "vol_zscore_21d": _safe(vol_z),
        "vol_percentile_252d": _safe(percentile_rank(
            np.array([rolling_vol(rets[:i], 21) for i in range(21, len(rets)+1) if rolling_vol(rets[:i], 21) is not None]),
            vol21
        ) if vol21 else None),
        "vol_regime": "high" if vol21 and vol21 > 0.30 else ("low" if vol21 and vol21 < 0.12 else "normal"),
        "data_quality_score": 1.0,
        "lineage_id": str(df["lineage_id"].iloc[-1]) if "lineage_id" in df.columns else None,
        "confidence": 1.0,
        "created_at": now,
        "updated_at": now,
    }
    table = fully_qualified(settings.BQ_DATASET_FEATURES, "volatility_features")
    return _write_rows(table, [row])


def _compute_and_write_momentum(symbol: str, df: pd.DataFrame, now: str) -> int:
    prices = df["adjusted_close"].to_numpy(dtype=float)
    rets = simple_returns(prices)
    if len(rets) < 21:
        return 0
    row = {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "asset_type": "equity",
        "provider": "derived",
        "source_type": "feature",
        "ingestion_time": now,
        "observation_time": str(df["observation_time"].iloc[-1]),
        "momentum_21d": _safe(momentum_n(prices, 21)),
        "momentum_63d": _safe(momentum_n(prices, 63) if len(prices) > 63 else None),
        "momentum_persistence": _safe(momentum_persistence(rets, 21)),
        "data_quality_score": 1.0,
        "lineage_id": str(df["lineage_id"].iloc[-1]) if "lineage_id" in df.columns else None,
        "confidence": 1.0,
        "created_at": now,
        "updated_at": now,
    }
    table = fully_qualified(settings.BQ_DATASET_FEATURES, "momentum_features")
    return _write_rows(table, [row])


def _compute_and_write_anomaly(symbol: str, df: pd.DataFrame, now: str) -> int:
    prices = df["adjusted_close"].to_numpy(dtype=float)
    rets = simple_returns(prices)
    if len(rets) < 63:
        return 0
    score = anomaly_score(rets, 63)
    row = {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "asset_type": "equity",
        "provider": "derived",
        "source_type": "feature",
        "ingestion_time": now,
        "observation_time": str(df["observation_time"].iloc[-1]),
        "anomaly_score": _safe(score),
        "zscore_return": _safe(z_score(rets, 21)),
        "is_anomaly": score is not None and score > 2.5,
        "anomaly_type": "return_extreme" if (score and score > 2.5) else None,
        "data_quality_score": 1.0,
        "lineage_id": str(df["lineage_id"].iloc[-1]) if "lineage_id" in df.columns else None,
        "confidence": 1.0,
        "created_at": now,
        "updated_at": now,
    }
    table = fully_qualified(settings.BQ_DATASET_FEATURES, "anomaly_features")
    return _write_rows(table, [row])


def _compute_and_write_regime(symbol: str, df: pd.DataFrame, now: str) -> int:
    prices = df["adjusted_close"].to_numpy(dtype=float)
    rets = simple_returns(prices)
    if len(rets) < 21:
        return 0
    vol21 = rolling_vol(rets, 21)
    label = regime_label(rets, vol21)
    ret_21 = float(np.sum(rets[-21:])) if len(rets) >= 21 else None
    row = {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "asset_type": "equity",
        "provider": "derived",
        "source_type": "feature",
        "ingestion_time": now,
        "observation_time": str(df["observation_time"].iloc[-1]),
        "regime_label": label,
        "regime_confidence": _safe(0.7),  # baseline confidence; will be model-refined later
        "vol_regime": "high" if vol21 and vol21 > 0.30 else ("low" if vol21 and vol21 < 0.12 else "normal"),
        "trend_label": "up" if ret_21 and ret_21 > 0.02 else ("down" if ret_21 and ret_21 < -0.02 else "flat"),
        "trend_strength": _safe(abs(ret_21) if ret_21 is not None else None),
        "data_quality_score": 1.0,
        "lineage_id": str(df["lineage_id"].iloc[-1]) if "lineage_id" in df.columns else None,
        "confidence": 1.0,
        "created_at": now,
        "updated_at": now,
    }
    table = fully_qualified(settings.BQ_DATASET_FEATURES, "regime_features")
    return _write_rows(table, [row])


# ─── Orchestrator ─────────────────────────────────────────────────────────────

FEATURE_TYPES = ["returns", "volatility", "momentum", "anomaly", "regime"]


async def run_features(
    run_id: str,
    symbols: List[str],
    feature_types: Optional[List[str]],
) -> None:
    from app.api.pipelines import _runs
    if run_id not in _runs:
        _runs[run_id] = {
            "run_id": run_id,
            "pipeline_name": "features",
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
            "records_processed": 0,
            "artifacts_generated": 0,
            "errors": [],
        }
    else:
        _runs[run_id]["status"] = "running"

    types = feature_types or FEATURE_TYPES
    client = get_bigquery_client()
    total = 0
    errors = []
    now = _now_iso()

    for symbol in symbols:
        try:
            df = _load_cleaned_ohlcv(client, symbol)
            if df.empty or len(df) < 5:
                log.warning("features.insufficient_data", symbol=symbol, rows=len(df))
                continue

            if "returns" in types:
                total += _compute_and_write_returns(symbol, df, now)
            if "volatility" in types:
                total += _compute_and_write_volatility(symbol, df, now)
            if "momentum" in types:
                total += _compute_and_write_momentum(symbol, df, now)
            if "anomaly" in types:
                total += _compute_and_write_anomaly(symbol, df, now)
            if "regime" in types:
                total += _compute_and_write_regime(symbol, df, now)

            log.info("features.symbol_done", symbol=symbol)
        except Exception as e:
            log.error("features.symbol_failed", symbol=symbol, error=str(e))
            errors.append({"symbol": symbol, "error": str(e)})

    _runs[run_id].update({
        "status": "completed" if not errors else "completed_with_errors",
        "completed_at": now,
        "records_processed": total,
        "errors": errors,
    })
    log.info("features.complete", run_id=run_id, total=total)
