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

import asyncio
import io
import os
import re
from datetime import datetime, timedelta, timezone

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
REQUEST_START_TOLERANCE_DAYS = 31
REQUEST_END_TOLERANCE_DAYS = 10
ENGINE_SIGNAL_COLUMNS = ["ts_momentum_12_1", "ts_momentum_63_21", "ts_momentum_21_5"]
FRED_PRICE_SERIES = {
    "XAUUSD": "GOLDAMGBD228NLBM",  # London Bullion Market, gold PM fix, USD/troy ounce
}
WORLD_BANK_GOLD_URL = "https://api.db.nomics.world/v22/series/WB/commodity_prices/FGOLD-1W?observations=1"


class ExportError(Exception):
    """Raised when the export cannot produce a usable dataset."""


def _canonical_symbol(symbol: str) -> str:
    s = (symbol or "").strip().upper().replace("/", "").replace("-", "")
    if s in {"GOLD", "XAU", "XAUUSD"}:
        return "XAUUSD"
    if s in {"SILVER", "XAG", "XAGUSD"}:
        return "XAGUSD"
    return s


def _range_bounds(
    lookback_days: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[str, str]:
    end_dt = (
        datetime.strptime(end_date, "%Y-%m-%d").date()
        if end_date
        else datetime.now(timezone.utc).date()
    )
    start_dt = (
        datetime.strptime(start_date, "%Y-%m-%d").date()
        if start_date
        else end_dt - timedelta(days=lookback_days)
    )
    if start_dt >= end_dt:
        raise ExportError("start_date must be before end_date")
    return start_dt.isoformat(), end_dt.isoformat()


def _date_predicate(alias: str = "observation_time") -> str:
    return (
        f"AND DATE({alias}) BETWEEN DATE(@start_date) AND DATE(@end_date)"
    )


def _lookback_predicate(alias: str = "observation_time") -> str:
    return f"AND DATE({alias}) >= DATE_SUB(CURRENT_DATE(), INTERVAL @lookback DAY)"


def _load_asset_close(
    symbol: str,
    lookback_days: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.Series:
    """Adjusted close (fallback close) for ``symbol``, indexed by date."""
    bq = get_bigquery_client()
    ohlcv = fully_qualified(settings.BQ_DATASET_CLEANED, "ohlcv_cleaned")
    date_filter = _date_predicate() if start_date and end_date else _lookback_predicate()
    sql = f"""
        SELECT
          DATE(observation_time) AS d,
          COALESCE(adjusted_close, close) AS px
        FROM `{ohlcv}`
        WHERE symbol = @symbol
          AND observation_time IS NOT NULL
          AND COALESCE(adjusted_close, close) IS NOT NULL
          {date_filter}
        ORDER BY d ASC
    """
    job_config = _query_params(symbol=symbol, lookback=lookback_days, start_date=start_date, end_date=end_date)
    rows = list(bq.query(sql, job_config=job_config).result())
    if not rows:
        return pd.Series(dtype="float64")
    # Collapse possible duplicate dates to the last observation.
    s = pd.Series(
        {pd.Timestamp(r["d"]): float(r["px"]) for r in rows},
        dtype="float64",
    ).sort_index()
    return s[~s.index.duplicated(keep="last")]


def _load_asset_returns(
    symbol: str,
    lookback_days: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.Series:
    """Daily simple returns for ``symbol`` from features.returns_features."""
    bq = get_bigquery_client()
    rf = fully_qualified(settings.BQ_DATASET_FEATURES, "returns_features")
    date_filter = _date_predicate() if start_date and end_date else _lookback_predicate()
    sql = f"""
        SELECT
          DATE(observation_time) AS d,
          simple_return_1d AS r
        FROM `{rf}`
        WHERE symbol = @symbol
          AND observation_time IS NOT NULL
          AND simple_return_1d IS NOT NULL
          {date_filter}
        ORDER BY d ASC
    """
    job_config = _query_params(symbol=symbol, lookback=lookback_days, start_date=start_date, end_date=end_date)
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


def _load_macro_wide(
    series_ids: list[str],
    lookback_days: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    """Pivot cleaned.macro_cleaned long → wide (date index, series columns)."""
    bq = get_bigquery_client()
    cleaned = fully_qualified(settings.BQ_DATASET_CLEANED, "macro_cleaned")
    in_list = ", ".join(f"'{s}'" for s in series_ids)
    date_filter = _date_predicate() if start_date and end_date else _lookback_predicate()
    sql = f"""
        SELECT
          series_id,
          DATE(observation_time) AS d,
          value
        FROM `{cleaned}`
        WHERE series_id IN ({in_list})
          AND value IS NOT NULL
          AND observation_time IS NOT NULL
          {date_filter}
        ORDER BY d ASC
    """
    job_config = _query_params(lookback=lookback_days, start_date=start_date, end_date=end_date)
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
    if kwargs.get("start_date"):
        params.append(bigquery.ScalarQueryParameter("start_date", "STRING", kwargs["start_date"]))
    if kwargs.get("end_date"):
        params.append(bigquery.ScalarQueryParameter("end_date", "STRING", kwargs["end_date"]))
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

    _add_engine_signal_columns(frame)
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


def _download_parquet(bucket_name: str, object_path: str) -> pd.DataFrame | None:
    client = storage.Client(project=settings.GCP_PROJECT_ID)
    blob = client.bucket(bucket_name).blob(object_path)
    if not blob.exists():
        return None
    return pd.read_parquet(io.BytesIO(blob.download_as_bytes()), engine="pyarrow")


def _frame_starts_near_request(df: pd.DataFrame, start_date: str) -> bool:
    if df is None or df.empty or "date" not in df:
        return False
    first = datetime.strptime(str(df["date"].iloc[0]), "%Y-%m-%d").date()
    requested = datetime.strptime(start_date, "%Y-%m-%d").date()
    return first <= requested + timedelta(days=REQUEST_START_TOLERANCE_DAYS)


def _frame_ends_near_request(df: pd.DataFrame, end_date: str) -> bool:
    if df is None or df.empty or "date" not in df:
        return False
    last = datetime.strptime(str(df["date"].iloc[-1]), "%Y-%m-%d").date()
    requested = datetime.strptime(end_date, "%Y-%m-%d").date()
    return last >= requested - timedelta(days=REQUEST_END_TOLERANCE_DAYS)


def _cached_frame_is_usable(df: pd.DataFrame, start_date: str, end_date: str) -> bool:
    return (
        _frame_starts_near_request(df, start_date)
        and _frame_ends_near_request(df, end_date)
        and all(col in df.columns for col in ENGINE_SIGNAL_COLUMNS)
        and len(df) >= MIN_BACKTEST_ROWS
    )


def _series_covers_request(s: pd.Series, start_date: str | None, end_date: str | None) -> bool:
    if s.empty:
        return False
    if start_date:
        first = s.index.min().date()
        requested_start = datetime.strptime(start_date, "%Y-%m-%d").date()
        if first > requested_start + timedelta(days=REQUEST_START_TOLERANCE_DAYS):
            return False
    if end_date:
        last = s.index.max().date()
        requested_end = datetime.strptime(end_date, "%Y-%m-%d").date()
        if last < requested_end - timedelta(days=REQUEST_END_TOLERANCE_DAYS):
            return False
    return len(s) >= MIN_BACKTEST_ROWS


def _write_parquet_local(df: pd.DataFrame, path: str) -> int:
    """Write the parquet to a local path (dev only). Returns bytes written."""
    abspath = os.path.abspath(path)
    os.makedirs(os.path.dirname(abspath) or ".", exist_ok=True)
    df.to_parquet(abspath, engine="pyarrow", index=False, compression="snappy")
    return os.path.getsize(abspath)


def _add_engine_signal_columns(frame: pd.DataFrame) -> None:
    """Add causal columns the deployed Rust signal resolver expects by name."""
    close = frame["asset_close"]
    frame["ts_momentum_12_1"] = (close.shift(21) / close.shift(252) - 1.0).fillna(0.0)
    frame["ts_momentum_63_21"] = (close.shift(21) / close.shift(63) - 1.0).fillna(0.0)
    frame["ts_momentum_21_5"] = (close.shift(5) / close.shift(21) - 1.0).fillna(0.0)


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


# ─── Provider fallback for instruments not in the warehouse ──────────────────

def _load_ohlcv_from_fred(symbol: str, start_date: str, end_date: str) -> pd.Series:
    """Fetch long-history instrument prices from FRED when Historical Research
    uses FRED for that symbol (notably XAU/USD gold)."""
    import httpx

    canonical = _canonical_symbol(symbol)
    series_id = FRED_PRICE_SERIES.get(canonical)
    if not series_id or not settings.FRED_API_KEY:
        return pd.Series(dtype="float64")
    try:
        r = httpx.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": series_id,
                "api_key": settings.FRED_API_KEY,
                "file_type": "json",
                "limit": 100000,
                "sort_order": "asc",
                "units": "lin",
                "observation_start": start_date,
                "observation_end": end_date,
            },
            timeout=30,
        )
        if r.status_code != 200:
            log.warning("backtest.fred_fallback_failed", symbol=symbol, status=r.status_code)
            return pd.Series(dtype="float64")
        observations = r.json().get("observations", [])
        s = pd.Series(
            {
                pd.Timestamp(row["date"]): float(row["value"])
                for row in observations
                if row.get("date") and row.get("value") not in (None, ".")
            },
            dtype="float64",
        ).sort_index()
        if not s.empty:
            log.info("backtest.ohlcv_provider_fallback", provider="fred", symbol=symbol, rows=len(s))
        return s[~s.index.duplicated(keep="last")]
    except Exception as e:
        log.warning("backtest.fred_fallback_failed", symbol=symbol, error=str(e))
        return pd.Series(dtype="float64")


def _eodhd_symbol(symbol: str) -> str:
    canonical = _canonical_symbol(symbol)
    if canonical in {"XAUUSD", "XAGUSD"}:
        return f"{canonical}.FOREX"
    if "." in symbol:
        return symbol.upper()
    return f"{canonical}.US"


def _twelve_data_symbol(symbol: str) -> str:
    canonical = _canonical_symbol(symbol)
    if canonical == "XAUUSD":
        return "XAU/USD"
    if canonical == "XAGUSD":
        return "XAG/USD"
    return canonical


def _stooq_symbol(symbol: str) -> str | None:
    """Map common US equity/ETF tickers to Stooq daily-history symbols.

    Stooq is intentionally used as a no-key historical fallback. It will not
    cover every global instrument, but it gives production a resilient path for
    common US equities and ETFs when paid providers are rate-limited.
    """
    canonical = _canonical_symbol(symbol)
    if re.match(r"^[A-Z]{1,5}$", canonical):
        return f"{canonical.lower()}.us"
    return None


def _load_ohlcv_from_world_bank_gold(symbol: str, start_date: str, end_date: str) -> pd.Series:
    """World Bank Pink Sheet gold history via DBNomics.

    DBNomics exposes annual gold prices back to 1960. For backtesting we use it
    only as a long-history bridge before paid daily providers begin; values are
    expanded monthly, not invented tick data.
    """
    import httpx

    if _canonical_symbol(symbol) != "XAUUSD":
        return pd.Series(dtype="float64")
    try:
        r = httpx.get(WORLD_BANK_GOLD_URL, timeout=30)
        if r.status_code != 200:
            log.warning("backtest.world_bank_gold_failed", symbol=symbol, status=r.status_code)
            return pd.Series(dtype="float64")
        docs = r.json().get("series", {}).get("docs", [])
        if not docs:
            return pd.Series(dtype="float64")
        doc = docs[0]
        periods = doc.get("period", [])
        values = doc.get("value", [])
        start = pd.Timestamp(start_date)
        end = pd.Timestamp(end_date)
        points: dict[pd.Timestamp, float] = {}
        for period, value in zip(periods, values):
            if value in (None, "NA", ""):
                continue
            try:
                year = int(str(period)[:4])
                px = float(value)
            except (TypeError, ValueError):
                continue
            year_start = pd.Timestamp(year=year, month=1, day=1)
            year_end = pd.Timestamp(year=year, month=12, day=1)
            for ts in pd.date_range(max(start, year_start), min(end, year_end), freq="MS"):
                points[ts] = px
        s = pd.Series(points, dtype="float64").sort_index()
        if not s.empty:
            log.info("backtest.ohlcv_provider_fallback", provider="world_bank_dbnomics", symbol=symbol, rows=len(s))
        return s[~s.index.duplicated(keep="last")]
    except Exception as e:
        log.warning("backtest.world_bank_gold_failed", symbol=symbol, error=str(e))
        return pd.Series(dtype="float64")


def _merge_long_history(primary: pd.Series, long_history: pd.Series) -> pd.Series:
    if primary.empty or long_history.empty:
        return primary if not primary.empty else long_history
    first_primary = primary.index.min()
    prefix = long_history[long_history.index < first_primary]
    if prefix.empty:
        return primary
    merged = pd.concat([prefix, primary]).sort_index()
    return merged[~merged.index.duplicated(keep="last")]


def _merge_provider_with_warehouse(warehouse: pd.Series, provider: pd.Series) -> pd.Series:
    """Use provider coverage for missing dates, while keeping warehouse values
    as the preferred source on overlapping dates."""
    if warehouse.empty:
        return provider
    if provider.empty:
        return warehouse
    merged = pd.concat([provider, warehouse]).sort_index()
    return merged[~merged.index.duplicated(keep="last")]


def _load_ohlcv_from_providers(
    symbol: str,
    lookback_days: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.Series:
    """Fetch OHLCV from external providers (EODHD → Twelve Data → FMP) when the
    BQ warehouse has no data for ``symbol``. Returns adjusted-close indexed by date.
    Mirrors the provider chain in the gateway market route."""
    import httpx

    from_str, to_str = _range_bounds(lookback_days, start_date, end_date)
    canonical = _canonical_symbol(symbol)

    fred_series = _load_ohlcv_from_fred(canonical, from_str, to_str)
    if not fred_series.empty:
        return fred_series
    world_bank_series = _load_ohlcv_from_world_bank_gold(canonical, from_str, to_str)

    # EODHD
    if settings.EODHD_API_KEY:
        try:
            ticker = _eodhd_symbol(canonical)
            url = f"https://eodhd.com/api/eod/{ticker}"
            r = httpx.get(url, params={
                "api_token": settings.EODHD_API_KEY,
                "fmt": "json",
                "period": "d",
                "from": from_str,
                "to": to_str,
            }, timeout=30)
            if r.status_code == 200:
                rows = r.json()
                if isinstance(rows, list) and rows:
                    s = pd.Series(
                        {pd.Timestamp(row["date"]): float(row.get("adjusted_close") or row["close"])
                         for row in rows if row.get("date")},
                        dtype="float64",
                    ).sort_index()
                    if not s.empty:
                        log.info("backtest.ohlcv_provider_fallback", provider="eodhd", symbol=canonical, rows=len(s))
                        return _merge_long_history(s[~s.index.duplicated(keep="last")], world_bank_series)
        except Exception as e:
            log.warning("backtest.eodhd_fallback_failed", symbol=symbol, error=str(e))

    # Twelve Data
    if settings.TWELVE_DATA_API_KEY:
        try:
            r = httpx.get("https://api.twelvedata.com/time_series", params={
                "symbol": _twelve_data_symbol(canonical),
                "interval": "1day",
                "start_date": from_str,
                "end_date": to_str,
                "outputsize": 5000,
                "apikey": settings.TWELVE_DATA_API_KEY,
            }, timeout=30)
            if r.status_code == 200:
                data = r.json()
                values = data.get("values", [])
                if values:
                    s = pd.Series(
                        {pd.Timestamp(row["datetime"]): float(row["close"]) for row in values if row.get("datetime")},
                        dtype="float64",
                    ).sort_index()
                    if not s.empty:
                        log.info("backtest.ohlcv_provider_fallback", provider="twelve_data", symbol=canonical, rows=len(s))
                        return _merge_long_history(s[~s.index.duplicated(keep="last")], world_bank_series)
        except Exception as e:
            log.warning("backtest.twelve_data_fallback_failed", symbol=symbol, error=str(e))

    # Alpha Vantage
    if settings.ALPHA_VANTAGE_API_KEY:
        try:
            r = httpx.get("https://www.alphavantage.co/query", params={
                "function": "TIME_SERIES_DAILY_ADJUSTED",
                "symbol": canonical,
                "outputsize": "full",
                "apikey": settings.ALPHA_VANTAGE_API_KEY,
            }, timeout=30)
            if r.status_code == 200:
                data = r.json()
                series = data.get("Time Series (Daily)", {})
                if series:
                    start_ts = pd.Timestamp(from_str)
                    end_ts = pd.Timestamp(to_str)
                    s = pd.Series(
                        {
                            pd.Timestamp(day): float(row.get("5. adjusted close") or row.get("4. close"))
                            for day, row in series.items()
                            if start_ts <= pd.Timestamp(day) <= end_ts
                        },
                        dtype="float64",
                    ).sort_index()
                    if not s.empty:
                        log.info("backtest.ohlcv_provider_fallback", provider="alpha_vantage", symbol=canonical, rows=len(s))
                        return _merge_long_history(s[~s.index.duplicated(keep="last")], world_bank_series)
        except Exception as e:
            log.warning("backtest.alpha_vantage_fallback_failed", symbol=symbol, error=str(e))

    # Stooq, no-key fallback for common US equities/ETFs.
    stooq_symbol = _stooq_symbol(canonical)
    if stooq_symbol:
        try:
            r = httpx.get("https://stooq.com/q/d/l/", params={
                "s": stooq_symbol,
                "d1": from_str.replace("-", ""),
                "d2": to_str.replace("-", ""),
                "i": "d",
            }, timeout=30)
            if r.status_code == 200:
                df = pd.read_csv(io.StringIO(r.text))
                if not df.empty and {"Date", "Close"}.issubset(df.columns):
                    s = pd.Series(
                        {
                            pd.Timestamp(row["Date"]): float(row["Close"])
                            for _, row in df.iterrows()
                            if pd.notna(row.get("Date")) and pd.notna(row.get("Close"))
                        },
                        dtype="float64",
                    ).sort_index()
                    if not s.empty:
                        log.info("backtest.ohlcv_provider_fallback", provider="stooq", symbol=canonical, rows=len(s))
                        return s[~s.index.duplicated(keep="last")]
        except Exception as e:
            log.warning("backtest.stooq_fallback_failed", symbol=symbol, error=str(e))

    # FMP
    if settings.FMP_API_KEY:
        try:
            r = httpx.get(f"https://financialmodelingprep.com/api/v3/historical-price-full/{canonical}", params={
                "apikey": settings.FMP_API_KEY,
                "from": from_str,
                "to": to_str,
            }, timeout=30)
            if r.status_code == 200:
                data = r.json()
                historical = data.get("historical", [])
                if historical:
                    s = pd.Series(
                        {pd.Timestamp(row["date"]): float(row.get("adjClose") or row["close"])
                         for row in historical if row.get("date")},
                        dtype="float64",
                    ).sort_index()
                    if not s.empty:
                        log.info("backtest.ohlcv_provider_fallback", provider="fmp", symbol=canonical, rows=len(s))
                        return _merge_long_history(s[~s.index.duplicated(keep="last")], world_bank_series)
        except Exception as e:
            log.warning("backtest.fmp_fallback_failed", symbol=symbol, error=str(e))

    return world_bank_series


def build_wide_frame_with_fallback(
    symbol: str,
    series_ids: list[str],
    lookback_days: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    """Like ``build_wide_frame`` but falls back when warehouse data is absent,
    stale, partial, or too short for the requested range."""
    canonical = _canonical_symbol(symbol)
    close = _load_asset_close(canonical, lookback_days, start_date, end_date)
    warehouse_usable = _series_covers_request(close, start_date, end_date)
    if close.empty or not warehouse_usable:
        log.info(
            "backtest.bq_incomplete_trying_providers",
            symbol=canonical,
            warehouse_rows=len(close),
            warehouse_from=close.index.min().date().isoformat() if not close.empty else None,
            warehouse_through=close.index.max().date().isoformat() if not close.empty else None,
            requested_start=start_date,
            requested_end=end_date,
        )
        provider_close = _load_ohlcv_from_providers(canonical, lookback_days, start_date, end_date)
        if not provider_close.empty:
            close = _merge_provider_with_warehouse(close, provider_close)
    if close.empty:
        raise ExportError(
            f"Historical data for {canonical} is unavailable for the requested range "
            "with the current warehouse/provider configuration."
        )

    returns = _load_asset_returns(canonical, lookback_days, start_date, end_date)
    macro = _load_macro_wide(series_ids, lookback_days, start_date, end_date)

    spine = close.index
    frame = pd.DataFrame(index=spine)
    frame["asset_close"] = close

    if not returns.empty:
        frame["asset_return"] = returns.reindex(spine)
    derived = frame["asset_close"].pct_change()
    if "asset_return" in frame:
        frame["asset_return"] = frame["asset_return"].fillna(derived)
    else:
        frame["asset_return"] = derived
    frame["asset_return"] = frame["asset_return"].fillna(0.0)

    if not macro.empty:
        macro_ff = macro.reindex(macro.index.union(spine)).sort_index().ffill()
        macro_on_spine = macro_ff.reindex(spine)
        for col in macro.columns:
            frame[col] = macro_on_spine[col]

    _add_engine_signal_columns(frame)
    frame = frame.dropna(subset=["asset_close"]).copy()
    frame.insert(0, "date", [ts.strftime("%Y-%m-%d") for ts in frame.index])
    frame = frame.reset_index(drop=True)
    return frame


def run_instrument_export(
    symbol: str,
    series_ids: list[str] | None = None,
    lookback_days: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Build and upload a per-instrument parquet to GCS.

    Called on-demand by the gateway when a user selects an instrument for
    backtesting. Uses the same warehouse-first, provider-fallback data path as the
    gateway market route. Range-specific provider fetches are cached at
    ``instruments/{SYMBOL}/{start}_{end}.parquet`` and copied to the engine's
    current lookup object, ``instruments/{SYMBOL}.parquet``.
    """
    if not settings.GCS_BACKTEST_BUCKET:
        raise ExportError("GCS_BACKTEST_BUCKET is not configured")

    series_ids = series_ids or DEFAULT_FRED_SERIES
    lookback_days = lookback_days or settings.BACKTEST_INSTRUMENT_LOOKBACK_DAYS
    canonical = _canonical_symbol(symbol)
    range_start, range_end = _range_bounds(lookback_days, start_date, end_date)
    cache_object_path = f"instruments/{canonical}/{range_start}_{range_end}.parquet"
    engine_object_path = f"instruments/{canonical}.parquet"

    started = datetime.now(timezone.utc)
    frame = _download_parquet(settings.GCS_BACKTEST_BUCKET, cache_object_path)
    cache_hit = frame is not None and _cached_frame_is_usable(frame, range_start, range_end)
    if frame is not None and not cache_hit:
        log.info(
            "backtest.instrument_cache_incomplete",
            symbol=canonical,
            cache_object_path=cache_object_path,
            data_from=frame["date"].iloc[0] if len(frame) else None,
            requested_start=range_start,
        )
        frame = None
    if frame is None:
        frame = build_wide_frame_with_fallback(
            canonical,
            series_ids,
            lookback_days,
            range_start,
            range_end,
        )
    if start_date and not _frame_starts_near_request(frame, range_start):
        data_from = frame["date"].iloc[0] if len(frame) else "unknown"
        raise ExportError(
            f"Historical data for {canonical} only goes back to {data_from} "
            f"with the current provider; requested {range_start} to {range_end}."
        )
    if end_date and not _frame_ends_near_request(frame, range_end):
        data_through = frame["date"].iloc[-1] if len(frame) else "unknown"
        raise ExportError(
            f"Historical data for {canonical} only runs through {data_through} "
            f"with the current provider; requested {range_start} to {range_end}."
        )
    if len(frame) < MIN_BACKTEST_ROWS:
        data_from = frame["date"].iloc[0] if len(frame) else "unknown"
        raise ExportError(
            f"Historical data for {canonical} only has {len(frame)} rows "
            f"from {data_from} to {range_end} with the current provider "
            f"(need >= {MIN_BACKTEST_ROWS})."
        )
    macro_cols = [c for c in frame.columns if c not in ("date", "asset_close", "asset_return")]
    cache_size = 0 if cache_hit else _upload_parquet(frame, settings.GCS_BACKTEST_BUCKET, cache_object_path)
    engine_size = _upload_parquet(frame, settings.GCS_BACKTEST_BUCKET, engine_object_path)

    summary = {
        "status": "ok",
        "symbol": canonical,
        "rows": int(len(frame)),
        "macro_columns": sorted(macro_cols),
        "macro_column_count": len(macro_cols),
        "data_from": frame["date"].iloc[0] if len(frame) else None,
        "data_through": frame["date"].iloc[-1] if len(frame) else None,
        "gcs_uri": f"gs://{settings.GCS_BACKTEST_BUCKET}/{engine_object_path}",
        "cache_gcs_uri": f"gs://{settings.GCS_BACKTEST_BUCKET}/{cache_object_path}",
        "cache_hit": cache_hit,
        "cache_bytes_written": cache_size,
        "bytes_written": engine_size,
        "duration_s": round((datetime.now(timezone.utc) - started).total_seconds(), 2),
    }
    log.info("backtest.instrument_export_complete", **summary)
    return summary
