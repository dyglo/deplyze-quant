"""Wide-parquet export for the Rust backtest engine.

The Rust service (`deplyze-backtest-engine`) owns all execution; it consumes a
**wide, daily, forward-filled** parquet produced here. This module is a pure
pivot/join — it performs *no* feature engineering and *no* standardization. All
regime features and z-scores are derived causally inside the Rust engine, which
is the single source of truth for the no-look-ahead guarantee. Emitting derived
features here would risk leaking the future into the columns the engine trades.

Output schema (one row per trading day of the asset, ascending `date`):
  * ``date``         — STRING ``YYYY-MM-DD`` (the Rust loader's index).
  * ``asset_close``  — adjusted close of ``BACKTEST_ASSET_SYMBOL``.
  * ``asset_return`` — daily simple return (from ``returns_features`` when
                       present, else derived from ``asset_close``).
  * one column per FRED ``series_id`` (raw level), forward-filled onto the
    asset's trading-day spine: ``DGS10``, ``DGS2``, ``WALCL``, ``T10Y2Y`` …

If the warehouse has no data for the asset the export raises ``ExportError`` and
writes nothing (so the engine keeps returning ``PARQUET_NOT_READY`` rather than
serving an empty book).
"""

from __future__ import annotations

import io
import os
from datetime import datetime, timezone

import pandas as pd
import structlog
from google.cloud import storage

from app.bigquery.client import fully_qualified, get_bigquery_client
from app.core.config import settings

log = structlog.get_logger("quant_engine.backtest.export")

# Raw FRED series the engine expects (levels). The Rust loader builds regime
# features from these causally; missing series degrade gracefully there.
DEFAULT_FRED_SERIES: list[str] = [
    # Yields
    "DGS1MO", "DGS3MO", "DGS6MO", "DGS1", "DGS2", "DGS5", "DGS10", "DGS30",
    # Spreads
    "T10Y2Y", "T10Y3M",
    # Policy rates
    "FEDFUNDS", "DFF",
    # Liquidity
    "WALCL", "M2SL", "RRPONTSYD", "DTWEXBGS",
    # Inflation
    "CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE", "T10YIE",
    # Growth / labor
    "UNRATE", "PAYEMS", "INDPRO",
]

MIN_BACKTEST_ROWS = 60


class ExportError(Exception):
    """Raised when the export cannot produce a usable dataset."""


def _load_asset_close(symbol: str, lookback_days: int) -> pd.Series:
    """Adjusted close (fallback close) for ``symbol``, indexed by date."""
    bq = get_bigquery_client()
    ohlcv = fully_qualified(settings.BQ_DATASET_CLEANED, "ohlcv_cleaned")
    sql = f"""
        SELECT
          DATE(observation_time) AS d,
          COALESCE(adjusted_close, close) AS px
        FROM `{ohlcv}`
        WHERE symbol = @symbol
          AND observation_time IS NOT NULL
          AND COALESCE(adjusted_close, close) IS NOT NULL
          AND DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL @lookback DAY)
        ORDER BY d ASC
    """
    job_config = _query_params(symbol=symbol, lookback=lookback_days)
    rows = list(bq.query(sql, job_config=job_config).result())
    if not rows:
        return pd.Series(dtype="float64")
    # Collapse possible duplicate dates to the last observation.
    s = pd.Series(
        {pd.Timestamp(r["d"]): float(r["px"]) for r in rows},
        dtype="float64",
    ).sort_index()
    return s[~s.index.duplicated(keep="last")]


def _load_asset_returns(symbol: str, lookback_days: int) -> pd.Series:
    """Daily simple returns for ``symbol`` from features.returns_features."""
    bq = get_bigquery_client()
    rf = fully_qualified(settings.BQ_DATASET_FEATURES, "returns_features")
    sql = f"""
        SELECT
          DATE(observation_time) AS d,
          simple_return_1d AS r
        FROM `{rf}`
        WHERE symbol = @symbol
          AND observation_time IS NOT NULL
          AND simple_return_1d IS NOT NULL
          AND DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL @lookback DAY)
        ORDER BY d ASC
    """
    job_config = _query_params(symbol=symbol, lookback=lookback_days)
    try:
        rows = list(bq.query(sql, job_config=job_config).result())
    except Exception as e:  # table may not exist in some environments
        log.warning("backtest.returns_features_unavailable", error=str(e))
        return pd.Series(dtype="float64")
    if not rows:
        return pd.Series(dtype="float64")
    s = pd.Series(
        {pd.Timestamp(r["d"]): float(r["r"]) for r in rows},
        dtype="float64",
    ).sort_index()
    return s[~s.index.duplicated(keep="last")]


def _load_macro_wide(series_ids: list[str], lookback_days: int) -> pd.DataFrame:
    """Pivot cleaned.macro_cleaned long → wide (date index, series columns)."""
    bq = get_bigquery_client()
    cleaned = fully_qualified(settings.BQ_DATASET_CLEANED, "macro_cleaned")
    in_list = ", ".join(f"'{s}'" for s in series_ids)
    sql = f"""
        SELECT
          series_id,
          DATE(observation_time) AS d,
          value
        FROM `{cleaned}`
        WHERE series_id IN ({in_list})
          AND value IS NOT NULL
          AND observation_time IS NOT NULL
          AND DATE(observation_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL @lookback DAY)
        ORDER BY d ASC
    """
    job_config = _query_params(lookback=lookback_days)
    rows = list(bq.query(sql, job_config=job_config).result())
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(
        [{"d": pd.Timestamp(r["d"]), "series_id": r["series_id"], "value": float(r["value"])} for r in rows]
    )
    wide = df.pivot_table(index="d", columns="series_id", values="value", aggfunc="last")
    return wide.sort_index()


def _query_params(**kwargs):
    from google.cloud import bigquery

    params = []
    if "symbol" in kwargs:
        params.append(bigquery.ScalarQueryParameter("symbol", "STRING", kwargs["symbol"]))
    if "lookback" in kwargs:
        params.append(bigquery.ScalarQueryParameter("lookback", "INT64", int(kwargs["lookback"])))
    return bigquery.QueryJobConfig(query_parameters=params)


def build_wide_frame(symbol: str, series_ids: list[str], lookback_days: int) -> pd.DataFrame:
    """Assemble the wide daily frame on the asset's trading-day spine."""
    close = _load_asset_close(symbol, lookback_days)
    if close.empty:
        raise ExportError(f"no OHLCV data for symbol '{symbol}' in cleaned.ohlcv_cleaned")

    returns = _load_asset_returns(symbol, lookback_days)
    macro = _load_macro_wide(series_ids, lookback_days)

    # Trading-day spine = the asset's observed dates (ascending).
    spine = close.index

    frame = pd.DataFrame(index=spine)
    frame["asset_close"] = close

    if not returns.empty:
        frame["asset_return"] = returns.reindex(spine)
    # Derive any gaps (or the whole column) from close.
    derived = frame["asset_close"].pct_change()
    if "asset_return" in frame:
        frame["asset_return"] = frame["asset_return"].fillna(derived)
    else:
        frame["asset_return"] = derived
    frame["asset_return"] = frame["asset_return"].fillna(0.0)

    # Macro: forward-fill onto the trading-day spine (releases are sparse/lagged).
    if not macro.empty:
        macro_ff = macro.reindex(macro.index.union(spine)).sort_index().ffill()
        macro_on_spine = macro_ff.reindex(spine)
        for col in macro.columns:
            frame[col] = macro_on_spine[col]

    frame = frame.dropna(subset=["asset_close"]).copy()
    frame.insert(0, "date", [ts.strftime("%Y-%m-%d") for ts in frame.index])
    frame = frame.reset_index(drop=True)
    return frame


def _upload_parquet(df: pd.DataFrame, bucket_name: str, object_path: str) -> int:
    buf = io.BytesIO()
    df.to_parquet(buf, engine="pyarrow", index=False, compression="snappy")
    data = buf.getvalue()
    client = storage.Client(project=settings.GCP_PROJECT_ID)
    blob = client.bucket(bucket_name).blob(object_path)
    blob.upload_from_string(data, content_type="application/octet-stream")
    return len(data)


def _write_parquet_local(df: pd.DataFrame, path: str) -> int:
    """Write the parquet to a local path (dev only). Returns bytes written."""
    abspath = os.path.abspath(path)
    os.makedirs(os.path.dirname(abspath) or ".", exist_ok=True)
    df.to_parquet(abspath, engine="pyarrow", index=False, compression="snappy")
    return os.path.getsize(abspath)


def run_export(
    symbol: str | None = None,
    series_ids: list[str] | None = None,
    lookback_days: int | None = None,
    local_out: str | None = None,
) -> dict:
    """Build the wide parquet and write it to GCS and/or a local path.

    ``local_out`` is a developer convenience for testing the engine without GCS
    (the Rust engine then reads it via ``BACKTEST_PARQUET_LOCAL``). It is
    rejected in production to avoid arbitrary server-side file writes. When a
    bucket is configured the upload still happens, so the nightly job is
    unaffected.
    """
    symbol = symbol or settings.BACKTEST_ASSET_SYMBOL
    series_ids = series_ids or DEFAULT_FRED_SERIES
    lookback_days = lookback_days or settings.BACKTEST_LOOKBACK_DAYS

    if local_out and settings.is_production:
        raise ExportError("local_out is not permitted in production")
    if not settings.GCS_BACKTEST_BUCKET and not local_out:
        raise ExportError("GCS_BACKTEST_BUCKET is not configured and no local_out was provided")

    started = datetime.now(timezone.utc)
    frame = build_wide_frame(symbol, series_ids, lookback_days)
    if len(frame) < MIN_BACKTEST_ROWS:
        raise ExportError(
            f"insufficient OHLCV data for symbol '{symbol}': {len(frame)} rows "
            f"(need >= {MIN_BACKTEST_ROWS})"
        )
    macro_cols = [c for c in frame.columns if c not in ("date", "asset_close", "asset_return")]

    summary: dict = {
        "status": "ok",
        "symbol": symbol,
        "rows": int(len(frame)),
        "macro_columns": sorted(macro_cols),
        "macro_column_count": len(macro_cols),
        "data_from": frame["date"].iloc[0] if len(frame) else None,
        "data_through": frame["date"].iloc[-1] if len(frame) else None,
    }

    if settings.GCS_BACKTEST_BUCKET:
        size = _upload_parquet(frame, settings.GCS_BACKTEST_BUCKET, settings.BACKTEST_PARQUET_OBJECT)
        summary["gcs_uri"] = f"gs://{settings.GCS_BACKTEST_BUCKET}/{settings.BACKTEST_PARQUET_OBJECT}"
        summary["bytes_written"] = size
    if local_out:
        local_size = _write_parquet_local(frame, local_out)
        summary["local_path"] = os.path.abspath(local_out)
        summary["local_bytes_written"] = local_size

    summary["duration_s"] = round((datetime.now(timezone.utc) - started).total_seconds(), 2)
    log.info("backtest.export_complete", **summary)
    return summary
