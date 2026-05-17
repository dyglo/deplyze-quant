"""
CFTC Commitment of Traders (COT) connector.

Public Socrata endpoint (no auth, polite rate limits):
  https://publicreporting.cftc.gov/resource/6dca-aqww.json  (Legacy F&O combined)

The COT report breaks down futures positioning by trader category (commercials,
non-commercials, non-reportables, dealers, asset managers, leveraged funds, …).
This connector is the source of truth for *positioning* intelligence: who is
long/short the curve, the dollar, oil, metals, crops.

We ship a curated default set covering rates, FX, energy, metals, and grains —
the most institutional-relevant contracts.
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

log = structlog.get_logger("quant_engine.connectors.cot")

# Socrata legacy F&O combined. Each row = one report week, one contract.
COT_LEGACY_FUTOPT = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"

# Curated commodity_subgroup_name + market_and_exchange_names that we ingest by
# default. These are the institutional set: rates, FX, energy, metals, grains.
DEFAULT_MARKETS: tuple[str, ...] = (
    "FED FUNDS - CHICAGO BOARD OF TRADE",
    "ULTRA U.S. TREASURY BONDS - CHICAGO BOARD OF TRADE",
    "UST BOND - CHICAGO BOARD OF TRADE",
    "U.S. TREASURY BONDS - CHICAGO BOARD OF TRADE",
    "10-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE",
    "ULTRA UST 10Y - CHICAGO BOARD OF TRADE",
    "5-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE",
    "2-YEAR U.S. TREASURY NOTES - CHICAGO BOARD OF TRADE",
    "USD INDEX - ICE FUTURES U.S.",
    "EURO FX - CHICAGO MERCANTILE EXCHANGE",
    "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",
    "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE",
    "CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE",
    "NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE",
    "GOLD - COMMODITY EXCHANGE INC.",
    "SILVER - COMMODITY EXCHANGE INC.",
    "COPPER- #1 - COMMODITY EXCHANGE INC.",
    "CORN - CHICAGO BOARD OF TRADE",
    "WHEAT-SRW - CHICAGO BOARD OF TRADE",
    "SOYBEANS - CHICAGO BOARD OF TRADE",
)

_RPS = 2.0
_MIN_INTERVAL = 1.0 / _RPS


class CotError(Exception):
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


class CotClient:
    def __init__(self, timeout_s: float = 30.0):
        self._timeout = httpx.Timeout(timeout_s)

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=20),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def _get(self, url: str, params: dict) -> list[dict]:
        await _LIMITER.acquire()
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.get(url, params=params)
            if r.status_code == 429:
                await asyncio.sleep(5.0)
                raise httpx.NetworkError("COT 429 rate-limited")
            if r.status_code >= 500:
                raise httpx.NetworkError(f"COT {r.status_code}")
            if r.status_code != 200:
                raise CotError(f"COT {r.status_code} for {url}: {r.text[:200]}")
            return r.json()

    async def iter_reports(
        self,
        *,
        markets: Optional[Iterable[str]] = None,
        since_date: Optional[str] = None,
        limit_per_page: int = 1000,
    ) -> AsyncIterator[dict]:
        """
        Yield COT records shaped for `raw_public.public_filings_raw`-style
        narrative storage. We re-use `public_reports_raw` (issuing_body=CFTC).
        """
        market_set = list(markets) if markets else list(DEFAULT_MARKETS)
        ingestion = _now_iso()

        # Socrata supports SoQL via $where / $limit / $offset. We page per market
        # to keep URLs short and predictable.
        for market in market_set:
            offset = 0
            while True:
                where = [f"market_and_exchange_names='{market}'"]
                if since_date:
                    # report_date_as_yyyy_mm_dd is the canonical date column
                    where.append(f"report_date_as_yyyy_mm_dd >= '{since_date}T00:00:00.000'")
                params = {
                    "$where": " AND ".join(where),
                    "$limit": limit_per_page,
                    "$offset": offset,
                    "$order": "report_date_as_yyyy_mm_dd ASC",
                }
                rows = await self._get(COT_LEGACY_FUTOPT, params)
                if not rows:
                    break
                for row in rows:
                    report_date = row.get("report_date_as_yyyy_mm_dd")
                    yield {
                        "id": str(uuid.uuid4()),
                        "symbol": None,
                        "asset_type": "positioning",
                        "provider": "cftc",
                        "source_url": COT_LEGACY_FUTOPT,
                        "source_type": "cot_report",
                        "ingestion_time": ingestion,
                        "observation_time": report_date,
                        "lineage_id": f"cot:{market}:{report_date}",
                        "confidence": 1.0,
                        "report_title": market,
                        "report_date": (report_date or "")[:10] or None,
                        "issuing_body": "CFTC",
                        "report_type": "COT_LEGACY_FUTOPT",
                        "document_url": "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
                        "raw_payload": row,
                    }
                if len(rows) < limit_per_page:
                    break
                offset += limit_per_page
