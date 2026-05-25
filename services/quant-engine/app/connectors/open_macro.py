"""
Open macro data connectors.

Sources:
  - World Bank Indicators API v2
  - IMF DataMapper API v2
  - DBnomics API v22

The connectors emit provider-neutral observation dicts. Warehouse-specific
dedupe, BigQuery writes, and feature generation live in
app.refinery.open_macro_ingestor.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, AsyncIterator, Iterable, Optional

import httpx
import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

log = structlog.get_logger("quant_engine.connectors.open_macro")

WORLD_BANK_BASE = "https://api.worldbank.org/v2"
IMF_DATAMAPPER_BASE = "https://www.imf.org/external/datamapper/api/v2"
DBNOMICS_BASE = "https://api.db.nomics.world/v22"

USER_AGENT = "Deplyze Quant Data Connector ops@deplyze.io"

DEFAULT_COUNTRIES = [
    "USA", "CHN", "JPN", "DEU", "GBR", "FRA", "IND", "BRA",
    "CAN", "MEX", "AUS", "KOR", "ZAF", "IDN", "TUR", "SAU",
]

ISO3_TO_ISO2 = {
    "ARG": "AR", "AUS": "AU", "BRA": "BR", "CAN": "CA", "CHN": "CN",
    "DEU": "DE", "FRA": "FR", "GBR": "GB", "IDN": "ID", "IND": "IN",
    "JPN": "JP", "KOR": "KR", "MEX": "MX", "NGA": "NG", "RUS": "RU",
    "SAU": "SA", "TUR": "TR", "USA": "US", "ZAF": "ZA",
}

ISO2_TO_ISO3 = {v: k for k, v in ISO3_TO_ISO2.items()}

COUNTRY_NAMES = {
    "ARG": "Argentina", "AUS": "Australia", "BRA": "Brazil",
    "CAN": "Canada", "CHN": "China", "DEU": "Germany",
    "FRA": "France", "GBR": "United Kingdom", "IDN": "Indonesia",
    "IND": "India", "JPN": "Japan", "KOR": "South Korea",
    "MEX": "Mexico", "NGA": "Nigeria", "RUS": "Russia",
    "SAU": "Saudi Arabia", "TUR": "Turkiye", "USA": "United States",
    "ZAF": "South Africa",
}

COUNTRY_ETF_MAP = {
    "USA": ["SPY", "QQQ", "IWM"],
    "CHN": ["FXI"],
    "JPN": ["EWJ"],
    "DEU": ["EWG"],
    "GBR": ["EWU"],
    "CAN": ["EWC"],
    "AUS": ["EWA"],
    "BRA": ["EWZ"],
    "IND": ["INDA"],
    "MEX": ["EWW"],
    "KOR": ["EWY"],
    "ZAF": ["EZA"],
}

DEFAULT_WORLD_BANK_INDICATORS = {
    "NY.GDP.MKTP.CD": ("GDP current US dollars", "growth"),
    "NY.GDP.MKTP.KD.ZG": ("Real GDP growth", "growth"),
    "FP.CPI.TOTL.ZG": ("Inflation consumer prices", "inflation"),
    "GC.DOD.TOTL.GD.ZS": ("Central government debt to GDP", "debt"),
    "SP.POP.TOTL": ("Population", "population"),
    "SL.UEM.TOTL.ZS": ("Unemployment rate", "employment"),
    "EG.USE.ELEC.KH.PC": ("Electric power consumption per capita", "energy"),
    "NE.TRD.GNFS.ZS": ("Trade to GDP", "trade"),
}

DEFAULT_IMF_INDICATORS = {
    "NGDP_RPCH": ("Real GDP growth", "growth"),
    "PCPIPCH": ("Inflation average consumer prices", "inflation"),
    "GGXWDG_NGDP": ("General government gross debt to GDP", "debt"),
    "GGXCNL_NGDP": ("General government net lending borrowing to GDP", "fiscal"),
    "BCA_NGDPD": ("Current account balance to GDP", "external"),
    "LUR": ("Unemployment rate", "employment"),
}

DEFAULT_DBNOMICS_SERIES = [
    "IMF/CPI/A.US.PCPI_IX",
    "AMECO/ZUTN/EA19.1.0.0.0.ZUTN",
]


@dataclass(frozen=True)
class MacroObservation:
    provider: str
    indicator_code: str
    period: str
    value: Optional[float]
    indicator_name: Optional[str] = None
    indicator_category: Optional[str] = None
    country_iso2: Optional[str] = None
    country_iso3: Optional[str] = None
    country_name: Optional[str] = None
    region: Optional[str] = None
    source_dataset: Optional[str] = None
    source_series_id: Optional[str] = None
    frequency: Optional[str] = None
    unit: Optional[str] = None
    value_text: Optional[str] = None
    vintage_date: Optional[str] = None
    is_forecast: bool = False
    source_url: Optional[str] = None
    request_url: Optional[str] = None
    raw_payload: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def observation_date(self) -> Optional[date]:
        return period_to_date(self.period)

    @property
    def deterministic_id(self) -> str:
        key = "|".join([
            self.provider,
            self.source_dataset or "",
            self.source_series_id or "",
            self.indicator_code,
            self.country_iso3 or self.country_iso2 or "",
            self.period,
        ])
        return hashlib.sha256(key.encode("utf-8")).hexdigest()


def period_to_date(period: str) -> Optional[date]:
    if not period:
        return None
    p = str(period)
    try:
        if len(p) == 4 and p.isdigit():
            return date(int(p), 1, 1)
        if len(p) == 7 and p[4] == "-":
            return date(int(p[:4]), int(p[5:7]), 1)
        if len(p) >= 10:
            return date.fromisoformat(p[:10])
    except ValueError:
        return None
    return None


class _RateLimiter:
    def __init__(self, min_interval_s: float):
        self._min_interval_s = min_interval_s
        self._next_allowed = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            if self._next_allowed > now:
                await asyncio.sleep(self._next_allowed - now)
                now = time.monotonic()
            self._next_allowed = now + self._min_interval_s


class BaseOpenMacroClient:
    def __init__(self, *, timeout_s: float = 30.0, min_interval_s: float = 0.2):
        self._timeout = httpx.Timeout(timeout_s)
        self._limiter = _RateLimiter(min_interval_s)

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def _get_json(self, url: str, params: Optional[dict[str, Any]] = None) -> dict | list:
        await self._limiter.acquire()
        headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            response = await client.get(url, params=params, headers=headers)
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                await asyncio.sleep(float(retry_after or 5))
                raise httpx.NetworkError(f"rate limited: {url}")
            if response.status_code >= 500:
                raise httpx.NetworkError(f"{response.status_code}: {url}")
            if response.status_code != 200:
                raise ValueError(f"{response.status_code}: {response.text[:200]}")
            return response.json()


class WorldBankClient(BaseOpenMacroClient):
    async def iter_indicator(
        self,
        indicator_code: str,
        *,
        countries: Iterable[str],
        start_year: int,
        end_year: int,
        indicator_name: Optional[str] = None,
        indicator_category: Optional[str] = None,
    ) -> AsyncIterator[MacroObservation]:
        iso2_codes = [ISO3_TO_ISO2.get(c.upper(), c.upper()) for c in countries]
        country_path = ";".join(iso2_codes) or "all"
        page = 1
        pages = 1
        while page <= pages:
            url = f"{WORLD_BANK_BASE}/country/{country_path}/indicator/{indicator_code}"
            params = {
                "format": "json",
                "date": f"{start_year}:{end_year}",
                "per_page": 20000,
                "page": page,
            }
            payload = await self._get_json(url, params=params)
            if not isinstance(payload, list) or len(payload) < 2:
                log.warning("world_bank.unexpected_payload", indicator=indicator_code)
                return
            meta = payload[0] or {}
            rows = payload[1] or []
            pages = int(meta.get("pages") or 1)
            request_url = httpx.URL(url, params=params)
            for row in rows:
                if not isinstance(row, dict):
                    continue
                iso2 = ((row.get("country") or {}).get("id") or "").upper() or None
                iso3 = (row.get("countryiso3code") or ISO2_TO_ISO3.get(iso2 or "") or "").upper() or None
                indicator = row.get("indicator") or {}
                yield MacroObservation(
                    provider="world_bank",
                    source_dataset=f"world_bank_source_{meta.get('sourceid') or 'unknown'}",
                    source_series_id=indicator_code,
                    indicator_code=indicator_code,
                    indicator_name=indicator.get("value") or indicator_name,
                    indicator_category=indicator_category,
                    country_iso2=iso2,
                    country_iso3=iso3,
                    country_name=(row.get("country") or {}).get("value"),
                    frequency="annual",
                    unit=row.get("unit") or None,
                    period=str(row.get("date") or ""),
                    value=_coerce_float(row.get("value")),
                    value_text=None if row.get("value") is None else str(row.get("value")),
                    vintage_date=meta.get("lastupdated"),
                    is_forecast=False,
                    source_url=f"https://data.worldbank.org/indicator/{indicator_code}",
                    request_url=str(request_url),
                    raw_payload=row,
                    metadata={"source_last_updated": meta.get("lastupdated")},
                )
            page += 1


class ImfDataMapperClient(BaseOpenMacroClient):
    async def iter_indicator(
        self,
        indicator_code: str,
        *,
        countries: Iterable[str],
        periods: Optional[Iterable[int]] = None,
        indicator_name: Optional[str] = None,
        indicator_category: Optional[str] = None,
    ) -> AsyncIterator[MacroObservation]:
        countries_upper = [c.upper() for c in countries]
        params: dict[str, Any] = {}
        if periods:
            params["periods"] = ",".join(str(p) for p in periods)
        url = f"{IMF_DATAMAPPER_BASE}/{indicator_code}/{'/'.join(countries_upper)}"
        payload = await self._get_json(url, params=params)
        if not isinstance(payload, dict):
            return
        indicator_meta = (payload.get("indicators") or {}).get(indicator_code, {})
        values = (payload.get("values") or {}).get(indicator_code, {})
        requested_periods = {str(p) for p in periods or []}
        projection_year = _coerce_int(indicator_meta.get("projection-year"))
        request_url = httpx.URL(url, params=params)
        for country_iso3, series in values.items():
            iso3 = str(country_iso3).upper()
            if countries_upper and iso3 not in countries_upper:
                continue
            if not isinstance(series, dict):
                continue
            for period, value in series.items():
                if requested_periods and str(period) not in requested_periods:
                    continue
                period_year = _coerce_int(period)
                yield MacroObservation(
                    provider="imf_datamapper",
                    source_dataset=indicator_meta.get("dataset") or "IMF_DataMapper",
                    source_series_id=indicator_code,
                    indicator_code=indicator_code,
                    indicator_name=indicator_meta.get("label") or indicator_name,
                    indicator_category=indicator_category,
                    country_iso2=ISO3_TO_ISO2.get(iso3),
                    country_iso3=iso3,
                    country_name=COUNTRY_NAMES.get(iso3),
                    frequency="annual",
                    unit=indicator_meta.get("unit"),
                    period=str(period),
                    value=_coerce_float(value),
                    value_text=None if value is None else str(value),
                    vintage_date=(indicator_meta.get("last-modified") or "")[:10] or None,
                    is_forecast=bool(projection_year and period_year and period_year >= projection_year),
                    source_url=f"https://www.imf.org/external/datamapper/{indicator_code}",
                    request_url=str(request_url),
                    raw_payload={"country": iso3, "period": period, "value": value},
                    metadata={
                        "description": indicator_meta.get("description"),
                        "source": indicator_meta.get("source"),
                    },
                )


class DbnomicsClient(BaseOpenMacroClient):
    async def iter_series(
        self,
        series_ids: Iterable[str],
    ) -> AsyncIterator[MacroObservation]:
        ids = [s for s in series_ids if s]
        if not ids:
            return
        url = f"{DBNOMICS_BASE}/series"
        params = {
            "observations": 1,
            "format": "json",
            "metadata": 1,
            "series_ids": ",".join(ids),
        }
        payload = await self._get_json(url, params=params)
        if not isinstance(payload, dict):
            return
        request_url = httpx.URL(url, params=params)
        for doc in ((payload.get("series") or {}).get("docs") or []):
            if not isinstance(doc, dict):
                continue
            provider = doc.get("provider_code") or ""
            dataset = doc.get("dataset_code") or ""
            series_code = doc.get("series_code") or ""
            series_id = f"{provider}/{dataset}/{series_code}"
            dims = doc.get("dimensions") or {}
            country_iso2, country_iso3 = _country_from_dbnomics_dims(dims)
            periods = doc.get("period") or []
            values = doc.get("value") or []
            starts = doc.get("period_start_day") or []
            for idx, period in enumerate(periods):
                raw_value = values[idx] if idx < len(values) else None
                period_start = starts[idx] if idx < len(starts) else period
                yield MacroObservation(
                    provider="dbnomics",
                    source_dataset=f"{provider}/{dataset}",
                    source_series_id=series_id,
                    indicator_code=series_id,
                    indicator_name=doc.get("series_name") or doc.get("dataset_name"),
                    indicator_category=_category_from_text(f"{doc.get('dataset_name') or ''} {doc.get('series_name') or ''}"),
                    country_iso2=country_iso2,
                    country_iso3=country_iso3,
                    country_name=COUNTRY_NAMES.get(country_iso3 or ""),
                    frequency=doc.get("@frequency"),
                    unit=None,
                    period=str(period_start or period),
                    value=_coerce_float(raw_value),
                    value_text=None if raw_value is None else str(raw_value),
                    vintage_date=(doc.get("indexed_at") or "")[:10] or None,
                    is_forecast=False,
                    source_url=f"https://db.nomics.world/{series_id}",
                    request_url=str(request_url),
                    raw_payload={
                        "period": period,
                        "period_start_day": period_start,
                        "value": raw_value,
                        "dimensions": dims,
                    },
                    metadata={
                        "dataset_name": doc.get("dataset_name"),
                        "provider_code": provider,
                    },
                )


def _country_from_dbnomics_dims(dims: dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    ref_area = str(dims.get("REF_AREA") or dims.get("ref_area") or "").upper()
    geo = str(dims.get("geo") or dims.get("GEO") or "").upper()
    if ref_area:
        return ref_area if len(ref_area) == 2 else ISO3_TO_ISO2.get(ref_area), ISO2_TO_ISO3.get(ref_area, ref_area if len(ref_area) == 3 else None)
    if geo:
        iso3 = geo if len(geo) == 3 else None
        return ISO3_TO_ISO2.get(iso3 or ""), iso3
    return None, None


def _category_from_text(text: str) -> str:
    lower = text.lower()
    if "inflation" in lower or "consumer price" in lower or "cpi" in lower:
        return "inflation"
    if "unemployment" in lower or "employment" in lower:
        return "employment"
    if "debt" in lower:
        return "debt"
    if "current account" in lower or "trade" in lower:
        return "external"
    if "gdp" in lower or "growth" in lower:
        return "growth"
    return "macro"


def _coerce_float(value: Any) -> Optional[float]:
    if value in (None, "", ".", "NA", "NaN"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> Optional[int]:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None
