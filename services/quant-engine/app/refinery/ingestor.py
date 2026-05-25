"""
Data ingestor — fetches from providers, enriches with quality scores,
writes immutable raw records to BigQuery raw_api tables.
"""

import uuid
import json
import structlog
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.quality.scorer import enrich_record, score_ohlcv_record, score_news_record

log = structlog.get_logger("quant_engine.refinery.ingestor")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _date_range(days_back: int):
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days_back)
    return str(start), str(today)


def _asset_type(symbol: str) -> str:
    sym_upper = symbol.upper()
    if sym_upper.startswith("C:") or "/" in sym_upper or (len(sym_upper) == 6 and sym_upper.isalpha()):
        return "fx"
    if sym_upper in ["GLD", "USO", "UNG", "SLV", "DBA", "DBC"]:
        return "commodity"
    if sym_upper in ["SPY", "QQQ", "VXX", "IWM", "DIA", "VIX", "VT", "EFA", "EEM", "ACWI"]:
        return "index"
    return "equity"


def _base_ohlcv_record(
    *,
    symbol: str,
    provider: str,
    observation_time: str,
    open_: float | None,
    high: float | None,
    low: float | None,
    close: float | None,
    volume: float | None,
    adjusted_close: float | None,
    raw_payload: dict,
) -> dict:
    now = _now_iso()
    rec = {
        "id": str(uuid.uuid4()),
        "symbol": symbol.upper(),
        "asset_type": _asset_type(symbol),
        "provider": provider,
        "source_type": "api",
        "ingestion_time": now,
        "observation_time": observation_time,
        "processing_time": now,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "adjusted_close": adjusted_close if adjusted_close is not None else close,
        "timeframe": "1day",
        "raw_payload": raw_payload,
        "created_at": now,
    }
    enrich_record(rec, score_ohlcv_record)
    return rec


async def _ingest_ohlcv_polygon(symbol: str, from_date: str, to_date: str) -> List[dict]:
    from app.providers.clients import PolygonClient
    client = PolygonClient()
    raw = await client.get_ohlcv(symbol, from_date, to_date)
    results = raw.get("results", [])
    records = []
    for r in results:
        obs_ts = datetime.fromtimestamp(r["t"] / 1000, tz=timezone.utc).isoformat()
        records.append(_base_ohlcv_record(
            symbol=symbol,
            provider="polygon",
            observation_time=obs_ts,
            open_=r.get("o"),
            high=r.get("h"),
            low=r.get("l"),
            close=r.get("c"),
            volume=r.get("v"),
            adjusted_close=r.get("c"),
            raw_payload=r,
        ))
    return records


async def _ingest_ohlcv_fmp(symbol: str, from_date: str, to_date: str) -> List[dict]:
    from app.providers.clients import FMPClient
    client = FMPClient()
    raw = await client.get_ohlcv(symbol, from_date, to_date)
    bars = raw.get("historical", []) if isinstance(raw, dict) else []
    records = []
    for r in reversed(bars):
        date = r.get("date")
        if not date:
            continue
        records.append(_base_ohlcv_record(
            symbol=symbol,
            provider="fmp",
            observation_time=f"{date}T00:00:00+00:00",
            open_=r.get("open"),
            high=r.get("high"),
            low=r.get("low"),
            close=r.get("close"),
            volume=r.get("volume"),
            adjusted_close=r.get("adjClose") or r.get("close"),
            raw_payload=r,
        ))
    return records


async def _ingest_ohlcv_eodhd(symbol: str, from_date: str, to_date: str) -> List[dict]:
    from app.providers.clients import EODHDClient
    client = EODHDClient()
    bars = await client.get_ohlcv(symbol, from_date, to_date)
    records = []
    for r in bars:
        date = r.get("date")
        if not date:
            continue
        records.append(_base_ohlcv_record(
            symbol=symbol,
            provider="eodhd",
            observation_time=f"{date}T00:00:00+00:00",
            open_=r.get("open"),
            high=r.get("high"),
            low=r.get("low"),
            close=r.get("close"),
            volume=r.get("volume"),
            adjusted_close=r.get("adjusted_close") or r.get("close"),
            raw_payload=r,
        ))
    return records


async def _ingest_news_finnhub(symbol: str, from_date: str, to_date: str) -> List[dict]:
    from app.providers.clients import FinnhubClient
    client = FinnhubClient()
    items = await client.get_news(symbol, from_date, to_date)
    records = []
    for item in (items or []):
        rec = {
            "id": str(uuid.uuid4()),
            "symbol": symbol,
            "asset_type": "equity",
            "provider": "finnhub",
            "source_type": "api",
            "observation_time": datetime.fromtimestamp(item.get("datetime", 0), tz=timezone.utc).isoformat(),
            "headline": item.get("headline"),
            "summary": item.get("summary"),
            "author": item.get("source"),
            "ingestion_time": _now_iso(),
            "published_at": datetime.fromtimestamp(item.get("datetime", 0), tz=timezone.utc).isoformat(),
            "source_url": item.get("url"),
            "raw_payload": item,
            "created_at": _now_iso(),
        }
        enrich_record(rec, score_news_record)
        records.append(rec)
    return records


def _write_to_bq(table_fqn: str, rows: List[dict]) -> int:
    """Write rows to BigQuery. Returns count of successfully inserted rows."""
    if not rows:
        return 0
    client = get_bigquery_client()
    # Serialize JSON fields to strings as BQ expects
    clean_rows = []
    for row in rows:
        r = dict(row)
        for k, v in r.items():
            if isinstance(v, dict) or isinstance(v, list):
                r[k] = json.dumps(v)
        clean_rows.append(r)
    errors = client.insert_rows_json(table_fqn, clean_rows)
    if errors:
        log.error("bq.insert_errors", table=table_fqn, errors=errors[:3])
        return len(rows) - len(errors)
    return len(rows)


async def run_ingest(
    run_id: str,
    symbols: List[str],
    providers: Optional[List[str]],
    timeframe: str,
    days_back: int,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> None:
    """Background task: ingest OHLCV + news for given symbols."""
    from app.api.pipelines import _runs
    if run_id not in _runs:
        _runs[run_id] = {
            "run_id": run_id,
            "pipeline_name": "ingest",
            "status": "running",
            "started_at": _now_iso(),
            "completed_at": None,
            "records_processed": 0,
            "artifacts_generated": 0,
            "errors": [],
        }
    else:
        _runs[run_id]["status"] = "running"
    log.info("ingest.start", run_id=run_id, symbols=symbols, days_back=days_back)

    from_date, to_date = (from_date, to_date) if from_date and to_date else _date_range(days_back)
    total_written = 0
    errors = []

    ohlcv_table = fully_qualified(settings.BQ_DATASET_RAW_API, "ohlcv_raw")
    news_table = fully_qualified(settings.BQ_DATASET_RAW_API, "news_raw")

    for symbol in symbols:
        # OHLCV via Polygon -> FMP -> EODHD. Stop on the first provider that
        # returns a usable history for this symbol.
        try:
            rows = []
            provider_errors = []
            chain = []
            allowed = set(providers or [])
            if settings.POLYGON_API_KEY and (not allowed or "polygon" in allowed):
                chain.append(("polygon", _ingest_ohlcv_polygon))
            if settings.FMP_API_KEY and (not allowed or "fmp" in allowed):
                chain.append(("fmp", _ingest_ohlcv_fmp))
            if settings.EODHD_API_KEY and (not allowed or "eodhd" in allowed):
                chain.append(("eodhd", _ingest_ohlcv_eodhd))
            for provider, fetcher in chain:
                try:
                    rows = await fetcher(symbol, from_date, to_date)
                    if rows:
                        log.info("ingest.ohlcv_provider_selected", symbol=symbol, provider=provider, rows=len(rows))
                        break
                    provider_errors.append({"provider": provider, "error": "empty response"})
                except Exception as provider_err:
                    provider_errors.append({"provider": provider, "error": str(provider_err)})
                    log.warning("ingest.ohlcv_provider_failed", symbol=symbol, provider=provider, error=str(provider_err))
            written = _write_to_bq(ohlcv_table, rows)
            total_written += written
            log.info("ingest.ohlcv", symbol=symbol, rows=written)
            if not rows and provider_errors:
                errors.append({"symbol": symbol, "type": "ohlcv", "error": provider_errors})
        except Exception as e:
            log.error("ingest.ohlcv_failed", symbol=symbol, error=str(e))
            errors.append({"symbol": symbol, "type": "ohlcv", "error": str(e)})

        # News via Finnhub
        try:
            if settings.FINNHUB_API_KEY:
                rows = await _ingest_news_finnhub(symbol, from_date, to_date)
                written = _write_to_bq(news_table, rows)
                total_written += written
                log.info("ingest.news", symbol=symbol, rows=written)
        except Exception as e:
            log.error("ingest.news_failed", symbol=symbol, error=str(e))
            errors.append({"symbol": symbol, "type": "news", "error": str(e)})

    _runs[run_id].update({
        "status": "completed" if not errors else "completed_with_errors",
        "completed_at": _now_iso(),
        "records_processed": total_written,
        "errors": errors,
    })
    log.info("ingest.complete", run_id=run_id, total_written=total_written, error_count=len(errors))
