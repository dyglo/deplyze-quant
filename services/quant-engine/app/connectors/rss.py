"""
RSS / Atom feed connector — narrative ingestion from public news/research feeds.

Curated default feed set covers reserve banks, public research desks, and
exchange announcements. Operators can override per-call. Each entry is shaped
for `raw_public.public_rss_raw`; the document-parsing pipeline (Wave E) picks
them up and produces `parsed_documents_raw`.
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

log = structlog.get_logger("quant_engine.connectors.rss")

# Curated, all public, all attribution-preserving. Add/remove via operator
# config in production rather than editing this list directly when possible.
DEFAULT_FEEDS: tuple[tuple[str, str], ...] = (
    ("federal_reserve_press",     "https://www.federalreserve.gov/feeds/press_all.xml"),
    ("federal_reserve_speeches",  "https://www.federalreserve.gov/feeds/speeches.xml"),
    ("federal_reserve_monetary",  "https://www.federalreserve.gov/feeds/press_monetary.xml"),
    ("treasury_press",            "https://home.treasury.gov/news/press-releases/feed"),
    ("bls_news",                  "https://www.bls.gov/feed/bls_latest.rss"),
    ("ecb_press",                 "https://www.ecb.europa.eu/rss/press.html"),
    ("boe_news",                  "https://www.bankofengland.co.uk/rss/news"),
    ("sec_press",                 "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&count=40&output=atom"),
    ("imf_news",                  "https://www.imf.org/en/News/rss?l=en"),
    ("worldbank_news",            "https://www.worldbank.org/en/news/feed"),
)

_RPS = 4.0
_MIN_INTERVAL = 1.0 / _RPS


class RssError(Exception):
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


def _parse_published(entry: dict) -> Optional[str]:
    """feedparser exposes `published_parsed` as a struct_time."""
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    try:
        return datetime(*parsed[:6], tzinfo=timezone.utc).isoformat()
    except Exception:
        return None


class RssClient:
    def __init__(self, user_agent: str = "Deplyze Quant Refinery", timeout_s: float = 20.0):
        self._headers = {"User-Agent": user_agent, "Accept": "application/rss+xml, application/atom+xml, application/xml, */*"}
        self._timeout = httpx.Timeout(timeout_s)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        reraise=True,
    )
    async def _fetch_feed(self, url: str) -> str:
        await _LIMITER.acquire()
        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers, follow_redirects=True) as client:
            r = await client.get(url)
            if r.status_code >= 500:
                raise httpx.NetworkError(f"RSS {r.status_code}: {url}")
            if r.status_code != 200:
                raise RssError(f"RSS {r.status_code} for {url}")
            return r.text

    async def iter_feeds(
        self,
        feeds: Optional[Iterable[tuple[str, str]]] = None,
    ) -> AsyncIterator[dict]:
        """
        Yield entry records shaped for `raw_public.public_rss_raw`. Imports
        feedparser lazily because it pulls in sgmllib-style parsing and we
        don't want to make it a hard import for non-RSS code paths.
        """
        import feedparser  # type: ignore

        feed_list = list(feeds) if feeds else list(DEFAULT_FEEDS)
        ingestion = _now_iso()

        for name, url in feed_list:
            try:
                xml = await self._fetch_feed(url)
            except Exception as e:
                log.error("rss.fetch_failed", feed=name, url=url, error=str(e))
                continue

            parsed = feedparser.parse(xml)
            for entry in (parsed.entries or []):
                link = entry.get("link") or ""
                title = entry.get("title") or ""
                published = _parse_published(entry)
                summary = entry.get("summary") or ""
                yield {
                    "id": str(uuid.uuid4()),
                    "symbol": None,
                    "asset_type": "narrative",
                    "provider": "rss",
                    "source_url": link or url,
                    "source_type": "rss",
                    "ingestion_time": ingestion,
                    "observation_time": published,
                    "lineage_id": f"rss:{name}:{link or title}",
                    "confidence": 1.0,
                    "feed_name": name,
                    "feed_url": url,
                    "title": title,
                    "link": link,
                    "published_at": published,
                    "content_snippet": summary[:2000] if summary else None,
                    "raw_payload": dict(entry),
                }
