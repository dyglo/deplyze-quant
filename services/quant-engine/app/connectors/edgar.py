"""
SEC EDGAR connector — public filings ingestion.

SEC fair-use policy (https://www.sec.gov/os/accessing-edgar-data):
  • Max 10 requests/second per IP.
  • Every request MUST send a descriptive User-Agent identifying the operator
    and contact email; requests without one are throttled / blocked.

This client enforces both. The User-Agent is read from settings.EDGAR_USER_AGENT
which is operator-configured (e.g. "Deplyze Quant research@deplyze.io"). If unset,
the connector refuses to make requests rather than risk a SEC IP block.

Endpoints used (all public, no auth):
  • https://www.sec.gov/files/company_tickers.json          → ticker ↔ CIK map
  • https://data.sec.gov/submissions/CIK{cik10}.json        → recent filings
  • https://www.sec.gov/cgi-bin/browse-edgar?...            → search/historic
  • https://www.sec.gov/Archives/...                        → filing documents

The connector returns dicts shaped for `raw_public.public_filings_raw` and
`raw_documents.document_sources_raw`. Persistence is the refinery's job; this
file is pure I/O.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

log = structlog.get_logger("quant_engine.connectors.edgar")

# ─── Constants ────────────────────────────────────────────────────────────────

EDGAR_BASE = "https://www.sec.gov"
EDGAR_DATA = "https://data.sec.gov"
TICKER_MAP_URL = f"{EDGAR_BASE}/files/company_tickers.json"
SUBMISSIONS_URL = f"{EDGAR_DATA}/submissions/CIK{{cik10}}.json"

# SEC throttle: 10 rps. We stay well under (8 rps headroom).
_SEC_RPS_BUDGET = 8.0
_MIN_INTERVAL_S = 1.0 / _SEC_RPS_BUDGET

# Forms we want by default. Operators can override per-call.
DEFAULT_FORMS = frozenset(
    {"10-K", "10-Q", "8-K", "20-F", "S-1", "S-3", "S-4", "DEF 14A", "13F-HR", "SC 13D", "SC 13G", "4"}
)


class EdgarError(Exception):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _pad_cik(cik: str | int) -> str:
    """SEC CIKs are zero-padded to 10 digits in URLs."""
    return str(int(cik)).zfill(10)


class _RateLimiter:
    """Process-wide token-bucket-ish limiter. Single-process is fine because
    we run one EDGAR ingest job at a time as a Cloud Run Job."""

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


# ─── Client ──────────────────────────────────────────────────────────────────


class EdgarClient:
    """
    Thin async client over SEC EDGAR. Stateless aside from the in-memory
    ticker→CIK map cache (warmed on first lookup).
    """

    def __init__(self, user_agent: Optional[str] = None, timeout_s: float = 30.0):
        ua = (user_agent or getattr(settings, "EDGAR_USER_AGENT", "")).strip()
        if not ua:
            raise EdgarError(
                "EDGAR_USER_AGENT is not configured. SEC requires a descriptive "
                "User-Agent with contact email. Set EDGAR_USER_AGENT in Cloud Run env."
            )
        self._headers = {
            "User-Agent": ua,
            "Accept-Encoding": "gzip, deflate",
            "Host": "www.sec.gov",
        }
        self._headers_data = dict(self._headers, **{"Host": "data.sec.gov"})
        self._timeout = httpx.Timeout(timeout_s)
        self._ticker_map: dict[str, str] | None = None

    # ─── Low-level fetcher ───────────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=2, max=20),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def _get(self, url: str, *, host: str) -> httpx.Response:
        await _LIMITER.acquire()
        headers = self._headers_data if host == "data.sec.gov" else self._headers
        async with httpx.AsyncClient(timeout=self._timeout, headers=headers) as client:
            r = await client.get(url)
            if r.status_code == 429:
                # SEC has rate-limited us; back off hard and let tenacity retry.
                log.warning("edgar.rate_limited", url=url)
                await asyncio.sleep(5.0)
                raise httpx.NetworkError("EDGAR 429 rate-limited")
            if r.status_code >= 500:
                raise httpx.NetworkError(f"EDGAR {r.status_code}: {url}")
            if r.status_code != 200:
                raise EdgarError(f"EDGAR {r.status_code} for {url}: {r.text[:200]}")
            return r

    # ─── Ticker ↔ CIK ─────────────────────────────────────────────────────────

    async def load_ticker_map(self) -> dict[str, str]:
        """Lazy-load the SEC company_tickers.json mapping (one-shot, ~500KB)."""
        if self._ticker_map is not None:
            return self._ticker_map
        r = await self._get(TICKER_MAP_URL, host="www.sec.gov")
        payload = r.json()
        # company_tickers.json is keyed by row index with shape:
        # {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}}
        m: dict[str, str] = {}
        for row in payload.values():
            ticker = str(row.get("ticker", "")).upper().strip()
            cik = row.get("cik_str")
            if ticker and cik is not None:
                m[ticker] = _pad_cik(cik)
        log.info("edgar.ticker_map_loaded", entries=len(m))
        self._ticker_map = m
        return m

    async def cik_for_symbol(self, symbol: str) -> Optional[str]:
        m = await self.load_ticker_map()
        return m.get(symbol.upper().strip())

    # ─── Submissions / filings ────────────────────────────────────────────────

    async def list_submissions(self, cik: str | int) -> dict:
        """
        Returns the SEC submissions JSON for a CIK. Includes entity metadata
        and the `filings.recent` array (most recent ~1000 filings).
        """
        url = SUBMISSIONS_URL.format(cik10=_pad_cik(cik))
        r = await self._get(url, host="data.sec.gov")
        return r.json()

    async def iter_recent_filings(
        self,
        cik: str | int,
        *,
        forms: Optional[set[str]] = None,
        since_date: Optional[str] = None,
        symbol_hint: Optional[str] = None,
    ) -> AsyncIterator[dict]:
        """
        Yield normalized filing records for a CIK. Each record is shaped to fit
        `raw_public.public_filings_raw`. `symbol_hint` is propagated when the
        caller already resolved the ticker (saves a reverse lookup downstream).
        """
        forms_filter = forms or DEFAULT_FORMS
        sub = await self.list_submissions(cik)
        entity_name = sub.get("name", "")
        recent = (sub.get("filings") or {}).get("recent") or {}
        accession_numbers = recent.get("accessionNumber") or []
        form_types = recent.get("form") or []
        filing_dates = recent.get("filingDate") or []
        period_dates = recent.get("reportDate") or []
        primary_docs = recent.get("primaryDocument") or []
        primary_doc_descs = recent.get("primaryDocDescription") or []
        is_xbrl = recent.get("isXBRL") or []

        ingestion_iso = _now_iso()
        padded = _pad_cik(cik)

        for i, accession in enumerate(accession_numbers):
            form = form_types[i] if i < len(form_types) else None
            if form not in forms_filter:
                continue
            filing_date = filing_dates[i] if i < len(filing_dates) else None
            if since_date and filing_date and filing_date < since_date:
                continue
            period = period_dates[i] if i < len(period_dates) else None
            primary = primary_docs[i] if i < len(primary_docs) else None
            primary_desc = primary_doc_descs[i] if i < len(primary_doc_descs) else None
            xbrl = bool(is_xbrl[i]) if i < len(is_xbrl) else None

            # Accession in URL form ("0000320193-24-000123" → "000032019324000123")
            acc_no_dashes = (accession or "").replace("-", "")
            doc_url = (
                f"{EDGAR_BASE}/Archives/edgar/data/{int(padded)}/{acc_no_dashes}/{primary}"
                if primary
                else f"{EDGAR_BASE}/cgi-bin/browse-edgar?action=getcompany&CIK={padded}&type={form}"
            )

            yield {
                # base lineage fields (match _BASE in schemas.py)
                "id": str(uuid.uuid4()),
                "symbol": symbol_hint,
                "asset_type": "equity",
                "provider": "sec_edgar",
                "source_url": doc_url,
                "source_type": "filing",
                "ingestion_time": ingestion_iso,
                "observation_time": (
                    datetime.fromisoformat(filing_date).replace(tzinfo=timezone.utc).isoformat()
                    if filing_date
                    else None
                ),
                "lineage_id": f"edgar:{padded}:{accession}",
                "confidence": 1.0,  # SEC primary source
                # public_filings_raw extension fields
                "cik": padded,
                "accession_number": accession,
                "form_type": form,
                "filing_date": filing_date,
                "period_of_report": period,
                "entity_name": entity_name,
                "document_url": doc_url,
                "raw_payload": {
                    "primary_document": primary,
                    "primary_doc_description": primary_desc,
                    "is_xbrl": xbrl,
                    "accession_number": accession,
                },
                # extras consumed by the refinery to spawn document_sources_raw
                "_document_source": {
                    "document_type": form,
                    "document_title": primary_desc or (form or "filing"),
                    "document_url": doc_url,
                    "mime_type": "text/html" if (primary or "").lower().endswith((".htm", ".html")) else None,
                },
            }
