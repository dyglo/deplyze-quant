"""
FRED (Federal Reserve Economic Data) connector.

Covers macro-series ingestion *and* Treasury yields — the FRED DGS* series
(`DGS3MO`, `DGS2`, `DGS5`, `DGS10`, `DGS30`, etc.) are the canonical public
source for the Treasury yield curve, so we don't need a separate Treasury
connector.

API: https://fred.stlouisfed.org/docs/api/fred/
Rate limit: 120 requests/min (we self-throttle to ~60/min for headroom).
Auth: api_key query parameter; key is operator-provided.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Iterable, Optional

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

log = structlog.get_logger("quant_engine.connectors.fred")

FRED_BASE = "https://api.stlouisfed.org/fred"
_RPS_BUDGET = 1.0          # ~60/min — half the 120/min ceiling
_MIN_INTERVAL_S = 1.0 / _RPS_BUDGET

# Institutional default series — yield curve + macro state.
# Operators can override per-call. Kept as a flat dict so frontend / docs can
# render labels without an extra round trip.
DEFAULT_SERIES: dict[str, str] = {
    # ── US Treasury yield curve (daily) ──────────────────────────────────────
    "DGS1MO":  "US Treasury 1M yield",
    "DGS3MO":  "US Treasury 3M yield",
    "DGS6MO":  "US Treasury 6M yield",
    "DGS1":    "US Treasury 1Y yield",
    "DGS2":    "US Treasury 2Y yield",
    "DGS5":    "US Treasury 5Y yield",
    "DGS10":   "US Treasury 10Y yield",
    "DGS30":   "US Treasury 30Y yield",
    "T10Y2Y":  "10Y minus 2Y spread",
    "T10Y3M":  "10Y minus 3M spread",
    # ── Policy / liquidity ────────────────────────────────────────────────────
    "FEDFUNDS": "Effective Fed Funds Rate",
    "DFF":      "Federal Funds Rate (daily)",
    "WALCL":    "Fed Balance Sheet — total assets",
    "M2SL":     "M2 money supply",
    "RRPONTSYD": "Overnight Reverse Repo (ON RRP)",
    # ── Growth / activity ────────────────────────────────────────────────────
    "GDPC1":    "Real GDP",
    "INDPRO":   "Industrial Production index",
    "UNRATE":   "Unemployment rate",
    "PAYEMS":   "Nonfarm payrolls",
    "ICSA":     "Initial jobless claims",
    # ── Inflation ─────────────────────────────────────────────────────────────
    "CPIAUCSL": "CPI all items (SA)",
    "CPILFESL": "Core CPI (SA)",
    "PCEPI":    "PCE price index",
    "PCEPILFE": "Core PCE",
    "T5YIE":    "5Y breakeven inflation",
    "T10YIE":   "10Y breakeven inflation",
    # ── Risk / FX / commodities ──────────────────────────────────────────────
    "VIXCLS":   "CBOE Volatility Index",
    "DTWEXBGS": "Broad USD index (trade weighted)",
    "DCOILWTICO": "WTI crude oil spot",
    "GOLDAMGBD228NLBM": "Gold London PM fix",
}


class FredError(Exception):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class _RateLimiter:
    def __init__(self, min_interval_s: float):
        self._min_interval = min_interval_s
        self._next_allowed = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            sleep = self._next_allowed - now
            if sleep > 0:
                await asyncio.sleep(sleep)
                now = time.monotonic()
            self._next_allowed = now + self._min_interval


_LIMITER = _RateLimiter(_MIN_INTERVAL_S)


class FredClient:
    """
    Async FRED client. Stateless beyond constructor config.

    Series metadata is fetched lazily and cached per-instance so a batch
    ingest run only pays the metadata cost once per series.
    """

    def __init__(self, api_key: Optional[str] = None, timeout_s: float = 20.0):
        self._api_key = (api_key or settings.FRED_API_KEY or "").strip()
        if not self._api_key:
            raise FredError(
                "FRED_API_KEY is not configured. Get a free key at "
                "https://fred.stlouisfed.org/docs/api/api_key.html"
            )
        self._timeout = httpx.Timeout(timeout_s)
        self._series_meta: dict[str, dict] = {}

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=20),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def _get(self, path: str, params: dict) -> dict:
        await _LIMITER.acquire()
        url = f"{FRED_BASE}/{path}"
        merged = dict(params, api_key=self._api_key, file_type="json")
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.get(url, params=merged)
            if r.status_code == 429:
                log.warning("fred.rate_limited", path=path)
                await asyncio.sleep(5.0)
                raise httpx.NetworkError("FRED 429 rate-limited")
            if r.status_code >= 500:
                raise httpx.NetworkError(f"FRED {r.status_code}: {path}")
            if r.status_code != 200:
                raise FredError(f"FRED {r.status_code} for {path}: {r.text[:200]}")
            return r.json()

    async def get_series_metadata(self, series_id: str) -> dict:
        if series_id in self._series_meta:
            return self._series_meta[series_id]
        payload = await self._get("series", {"series_id": series_id})
        seriess = payload.get("seriess") or []
        meta = seriess[0] if seriess else {}
        self._series_meta[series_id] = meta
        return meta

    async def iter_observations(
        self,
        series_id: str,
        *,
        since_date: Optional[str] = None,
        limit: int = 100_000,
        units: str = "lin",
    ) -> AsyncIterator[dict]:
        """
        Yield observation records shaped for `raw_public.public_macro_raw`.

        `units='lin'` is the FRED default (raw values). For YoY-transformed
        series the cleaned-layer transform handles it.
        """
        meta = await self.get_series_metadata(series_id)
        series_name = meta.get("title") or DEFAULT_SERIES.get(series_id) or series_id
        frequency = (meta.get("frequency_short") or "").strip() or None
        units_label = meta.get("units_short") or meta.get("units") or None

        params: dict = {
            "series_id": series_id,
            "limit": limit,
            "sort_order": "asc",
            "units": units,
        }
        if since_date:
            params["observation_start"] = since_date

        payload = await self._get("series/observations", params)
        observations = payload.get("observations") or []
        ingestion_iso = _now_iso()

        for obs in observations:
            raw_value = obs.get("value")
            # FRED uses '.' for missing values.
            if raw_value in (None, ".", ""):
                value: Optional[float] = None
            else:
                try:
                    value = float(raw_value)
                except (TypeError, ValueError):
                    value = None
            obs_date = obs.get("date")
            yield {
                "id": str(uuid.uuid4()),
                "symbol": None,
                "asset_type": "macro",
                "provider": "fred",
                "source_url": f"https://fred.stlouisfed.org/series/{series_id}",
                "source_type": "macro_series",
                "ingestion_time": ingestion_iso,
                "observation_time": (
                    datetime.fromisoformat(obs_date).replace(tzinfo=timezone.utc).isoformat()
                    if obs_date
                    else None
                ),
                "lineage_id": f"fred:{series_id}:{obs_date}",
                "confidence": 1.0,
                # public_macro_raw extension fields
                "series_id": series_id,
                "series_name": series_name,
                "frequency": frequency,
                "units": units_label,
                "value": value,
                "vintage_date": obs.get("realtime_end") or obs.get("realtime_start") or obs_date,
                "raw_payload": obs,
            }

    async def iter_default_series(
        self,
        since_date: Optional[str] = None,
        series_ids: Optional[Iterable[str]] = None,
    ) -> AsyncIterator[tuple[str, dict]]:
        """
        Convenience: yield (series_id, observation_record) for each observation
        in the configured series list. Defaults to DEFAULT_SERIES.
        """
        ids = list(series_ids) if series_ids else list(DEFAULT_SERIES.keys())
        for sid in ids:
            try:
                async for rec in self.iter_observations(sid, since_date=since_date):
                    yield sid, rec
            except Exception as e:
                log.error("fred.series_failed", series_id=sid, error=str(e))
                continue
