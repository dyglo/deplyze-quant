"""
Economic-release calendar connector.

Strategy: re-use the FRED `/releases/dates` endpoint. FRED publishes the
schedule of upcoming macro releases (CPI, payrolls, FOMC, etc.) keyed by
release_id; we map a curated set of release_ids to human labels and ingest
them into `raw_public.public_calendar_raw`.

Why FRED instead of a dedicated calendar provider:
  • free, attribution-preserving, no scraping;
  • already authenticated via FRED_API_KEY;
  • the release schedule that matters most for institutional research is the
    US macro release set, which FRED publishes authoritatively.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import AsyncIterator, Iterable, Optional

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

log = structlog.get_logger("quant_engine.connectors.calendar")

FRED_BASE = "https://api.stlouisfed.org/fred"

# Curated default release_ids (FRED authoritative IDs).
# https://fred.stlouisfed.org/releases
DEFAULT_RELEASES: dict[int, dict[str, str]] = {
    10:  {"name": "Consumer Price Index",                  "importance": "high", "country": "US"},
    50:  {"name": "Employment Situation (Nonfarm Payrolls)", "importance": "high", "country": "US"},
    53:  {"name": "Personal Income and Outlays (PCE)",     "importance": "high", "country": "US"},
    20:  {"name": "Gross Domestic Product",                "importance": "high", "country": "US"},
    91:  {"name": "FOMC Statement",                         "importance": "high", "country": "US"},
    18:  {"name": "Industrial Production",                  "importance": "med",  "country": "US"},
    14:  {"name": "Producer Price Index",                   "importance": "med",  "country": "US"},
    151: {"name": "ISM Manufacturing PMI",                  "importance": "med",  "country": "US"},
    175: {"name": "Retail Sales",                           "importance": "med",  "country": "US"},
    87:  {"name": "Initial Jobless Claims",                 "importance": "med",  "country": "US"},
}

_RPS = 1.0
_MIN_INTERVAL = 1.0 / _RPS


class CalendarError(Exception):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class _RL:
    def __init__(self, interval: float):
        self._interval = interval
        self._next = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            sleep = self._next - now
            if sleep > 0:
                await asyncio.sleep(sleep)
                now = time.monotonic()
            self._next = now + self._interval


_LIMITER = _RL(_MIN_INTERVAL)


class CalendarClient:
    def __init__(self, api_key: Optional[str] = None, timeout_s: float = 20.0):
        self._api_key = (api_key or settings.FRED_API_KEY or "").strip()
        if not self._api_key:
            raise CalendarError("FRED_API_KEY required for calendar connector (uses FRED /releases).")
        self._timeout = httpx.Timeout(timeout_s)

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=20),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def _get(self, path: str, params: dict) -> dict:
        await _LIMITER.acquire()
        merged = dict(params, api_key=self._api_key, file_type="json")
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.get(f"{FRED_BASE}/{path}", params=merged)
            if r.status_code == 429:
                await asyncio.sleep(5.0)
                raise httpx.NetworkError("FRED calendar 429")
            if r.status_code >= 500:
                raise httpx.NetworkError(f"FRED calendar {r.status_code}")
            if r.status_code != 200:
                raise CalendarError(f"FRED calendar {r.status_code} {path}: {r.text[:200]}")
            return r.json()

    async def iter_release_dates(
        self,
        releases: Optional[Iterable[int]] = None,
        since_date: Optional[str] = None,
        days_ahead: int = 120,
    ) -> AsyncIterator[dict]:
        """
        Yield release-date records shaped for `raw_public.public_calendar_raw`.
        Backwards-and-forward window: from `since_date` (default: 30 days ago)
        through `since_date + days_ahead`.
        """
        rel_ids = list(releases) if releases else list(DEFAULT_RELEASES.keys())

        start = since_date or (datetime.now(timezone.utc).date() - timedelta(days=30)).isoformat()
        end = (datetime.fromisoformat(start).date() + timedelta(days=days_ahead)).isoformat()

        ingestion = _now_iso()
        for rid in rel_ids:
            meta = DEFAULT_RELEASES.get(rid, {})
            params = {
                "release_id": rid,
                "realtime_start": start,
                "realtime_end": end,
                "include_release_dates_with_no_data": "true",
                "limit": 1000,
            }
            try:
                payload = await self._get("release/dates", params)
            except Exception as e:
                log.error("calendar.release_failed", release_id=rid, error=str(e))
                continue

            for dt in payload.get("release_dates") or []:
                event_date = dt.get("date")
                yield {
                    "id": str(uuid.uuid4()),
                    "symbol": None,
                    "asset_type": "macro",
                    "provider": "fred_release_calendar",
                    "source_url": f"https://fred.stlouisfed.org/release?rid={rid}",
                    "source_type": "calendar",
                    "ingestion_time": ingestion,
                    "observation_time": event_date,
                    "lineage_id": f"fred_release:{rid}:{event_date}",
                    "confidence": 1.0,
                    "event_type": "macro_release",
                    "event_name": meta.get("name") or f"release_id={rid}",
                    "event_date": event_date,
                    "country": meta.get("country", "US"),
                    "importance": meta.get("importance", "med"),
                    "actual_value": None,
                    "forecast_value": None,
                    "previous_value": None,
                    "raw_payload": dict(dt, release_id=rid),
                }
