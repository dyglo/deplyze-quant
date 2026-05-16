"""
Provider clients — thin wrappers around financial API providers.
Reads keys from settings (env vars). No keys stored in code.
Uses tenacity for retry with exponential backoff.
"""

import structlog
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

log = structlog.get_logger("quant_engine.providers")

RETRY_ARGS = dict(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
)


class ProviderError(Exception):
    def __init__(self, provider: str, message: str, status_code: int = 0):
        super().__init__(f"[{provider}] {message}")
        self.provider = provider
        self.status_code = status_code


# ─── Polygon ─────────────────────────────────────────────────────────────────

class PolygonClient:
    BASE = "https://api.polygon.io"

    def __init__(self):
        self.key = settings.POLYGON_API_KEY
        if not self.key:
            raise ProviderError("polygon", "POLYGON_API_KEY not configured")

    @retry(**RETRY_ARGS)
    async def get_ohlcv(self, symbol: str, from_date: str, to_date: str, timespan: str = "day") -> dict:
        url = f"{self.BASE}/v2/aggs/ticker/{symbol}/range/1/{timespan}/{from_date}/{to_date}"
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params={"apiKey": self.key, "adjusted": "true", "limit": 5000})
            if r.status_code != 200:
                raise ProviderError("polygon", r.text, r.status_code)
            return r.json()

    @retry(**RETRY_ARGS)
    async def get_quote(self, symbol: str) -> dict:
        url = f"{self.BASE}/v2/last/trade/{symbol}"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params={"apiKey": self.key})
            if r.status_code != 200:
                raise ProviderError("polygon", r.text, r.status_code)
            return r.json()


# ─── FMP ─────────────────────────────────────────────────────────────────────

class FMPClient:
    BASE = "https://financialmodelingprep.com/api"

    def __init__(self):
        self.key = settings.FMP_API_KEY
        if not self.key:
            raise ProviderError("fmp", "FMP_API_KEY not configured")

    @retry(**RETRY_ARGS)
    async def get_ohlcv(self, symbol: str, from_date: str, to_date: str) -> dict:
        url = f"{self.BASE}/v3/historical-price-full/{symbol}"
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params={"apikey": self.key, "from": from_date, "to": to_date})
            if r.status_code != 200:
                raise ProviderError("fmp", r.text, r.status_code)
            return r.json()

    @retry(**RETRY_ARGS)
    async def get_fundamentals(self, symbol: str, period: str = "annual") -> dict:
        url = f"{self.BASE}/v3/income-statement/{symbol}"
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params={"apikey": self.key, "period": period, "limit": 10})
            if r.status_code != 200:
                raise ProviderError("fmp", r.text, r.status_code)
            return r.json()

    @retry(**RETRY_ARGS)
    async def get_earnings(self, symbol: str) -> dict:
        url = f"{self.BASE}/v3/earnings-surprises/{symbol}"
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params={"apikey": self.key})
            if r.status_code != 200:
                raise ProviderError("fmp", r.text, r.status_code)
            return r.json()


# ─── Finnhub ──────────────────────────────────────────────────────────────────

class FinnhubClient:
    BASE = "https://finnhub.io/api/v1"

    def __init__(self):
        self.key = settings.FINNHUB_API_KEY
        if not self.key:
            raise ProviderError("finnhub", "FINNHUB_API_KEY not configured")

    @retry(**RETRY_ARGS)
    async def get_quote(self, symbol: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{self.BASE}/quote", params={"symbol": symbol, "token": self.key})
            if r.status_code != 200:
                raise ProviderError("finnhub", r.text, r.status_code)
            return r.json()

    @retry(**RETRY_ARGS)
    async def get_news(self, symbol: str, from_date: str, to_date: str) -> list:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                f"{self.BASE}/company-news",
                params={"symbol": symbol, "from": from_date, "to": to_date, "token": self.key},
            )
            if r.status_code != 200:
                raise ProviderError("finnhub", r.text, r.status_code)
            return r.json()


# ─── Alpha Vantage ───────────────────────────────────────────────────────────

class AlphaVantageClient:
    BASE = "https://www.alphavantage.co/query"

    def __init__(self):
        self.key = settings.ALPHA_VANTAGE_API_KEY
        if not self.key:
            raise ProviderError("alpha_vantage", "ALPHA_VANTAGE_API_KEY not configured")

    @retry(**RETRY_ARGS)
    async def get_daily(self, symbol: str, outputsize: str = "compact") -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(self.BASE, params={
                "function": "TIME_SERIES_DAILY_ADJUSTED",
                "symbol": symbol,
                "outputsize": outputsize,
                "apikey": self.key,
            })
            if r.status_code != 200:
                raise ProviderError("alpha_vantage", r.text, r.status_code)
            return r.json()


def get_available_providers() -> dict:
    """Return which providers are available based on configured keys."""
    return {
        "polygon": bool(settings.POLYGON_API_KEY),
        "fmp": bool(settings.FMP_API_KEY),
        "eodhd": bool(settings.EODHD_API_KEY),
        "finnhub": bool(settings.FINNHUB_API_KEY),
        "twelve_data": bool(settings.TWELVE_DATA_API_KEY),
        "alpha_vantage": bool(settings.ALPHA_VANTAGE_API_KEY),
    }
