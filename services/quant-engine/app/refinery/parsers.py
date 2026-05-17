"""
Document parsers — content extraction for the refinery pipeline.

Supported MIME types (auto-detected from URL + Content-Type):
  • application/pdf                   → pypdf
  • text/html, application/xhtml+xml  → BeautifulSoup + lxml
  • application/xml, text/xml         → BeautifulSoup (XML mode)
  • text/plain                        → passthrough

All parsers return a ParseResult with `text`, `page_count`, `extraction_method`,
and `extraction_quality` (0..1, where 1 = clean structured text). The quality
score is the signal Wave E/G use to decide whether a document is worth indexing
into narrative_features.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import structlog

log = structlog.get_logger("quant_engine.refinery.parsers")


@dataclass
class ParseResult:
    text: str
    page_count: Optional[int]
    extraction_method: str
    extraction_quality: float
    mime_type: str


# ─── Detection ────────────────────────────────────────────────────────────────


def detect_mime(url: str, content_type: Optional[str] = None) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct:
        return ct
    u = url.lower()
    if u.endswith(".pdf"):
        return "application/pdf"
    if u.endswith((".htm", ".html")):
        return "text/html"
    if u.endswith(".xml"):
        return "application/xml"
    if u.endswith(".txt"):
        return "text/plain"
    # SEC EDGAR primary docs are typically .htm even when the URL looks bare.
    return "text/html"


# ─── HTML / XML ───────────────────────────────────────────────────────────────


def _clean_text(s: str) -> str:
    # Collapse whitespace; preserve paragraph breaks.
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def parse_html(body: bytes | str, *, mime: str = "text/html") -> ParseResult:
    from bs4 import BeautifulSoup  # type: ignore

    raw = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body
    parser = "xml" if mime in ("application/xml", "text/xml") else "lxml"
    try:
        soup = BeautifulSoup(raw, parser)
    except Exception as e:
        log.warning("parser.html_fallback", error=str(e))
        soup = BeautifulSoup(raw, "html.parser")

    # Strip script/style/header/footer/nav — keep editorial body.
    for tag in soup(["script", "style", "noscript", "iframe", "header", "footer", "nav"]):
        tag.decompose()

    text = _clean_text(soup.get_text(separator="\n"))
    # quality: longer & has paragraph-like structure → higher score
    if len(text) < 200:
        quality = 0.2
    elif "\n\n" not in text:
        quality = 0.6
    else:
        quality = min(1.0, 0.7 + 0.3 * (text.count("\n\n") / 50.0))
    return ParseResult(
        text=text,
        page_count=None,
        extraction_method=f"beautifulsoup4:{parser}",
        extraction_quality=round(quality, 4),
        mime_type=mime,
    )


# ─── PDF ──────────────────────────────────────────────────────────────────────


def parse_pdf(body: bytes) -> ParseResult:
    from pypdf import PdfReader  # type: ignore
    import io

    reader = PdfReader(io.BytesIO(body))
    pages_text: list[str] = []
    for page in reader.pages:
        try:
            pages_text.append(page.extract_text() or "")
        except Exception as e:
            log.debug("parser.pdf_page_failed", error=str(e))
            pages_text.append("")

    text = _clean_text("\n\n".join(pages_text))
    page_count = len(reader.pages)
    # quality: chars-per-page heuristic — scanned PDFs often return ~0 chars
    if page_count == 0 or not text:
        quality = 0.0
    else:
        cpp = len(text) / page_count
        quality = min(1.0, cpp / 1500.0)  # ~1500 chars/page = full
    return ParseResult(
        text=text,
        page_count=page_count,
        extraction_method="pypdf",
        extraction_quality=round(quality, 4),
        mime_type="application/pdf",
    )


# ─── Plain ────────────────────────────────────────────────────────────────────


def parse_plain(body: bytes | str) -> ParseResult:
    raw = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body
    text = _clean_text(raw)
    return ParseResult(
        text=text,
        page_count=None,
        extraction_method="passthrough",
        extraction_quality=1.0 if text else 0.0,
        mime_type="text/plain",
    )


# ─── Dispatcher ───────────────────────────────────────────────────────────────


def parse(
    body: bytes,
    *,
    url: str,
    content_type: Optional[str] = None,
) -> ParseResult:
    mime = detect_mime(url, content_type)
    try:
        if mime == "application/pdf":
            return parse_pdf(body)
        if mime in ("text/html", "application/xhtml+xml"):
            return parse_html(body, mime="text/html")
        if mime in ("application/xml", "text/xml"):
            return parse_html(body, mime=mime)
        return parse_plain(body)
    except Exception as e:
        log.error("parser.failed", url=url, mime=mime, error=str(e))
        return ParseResult(
            text="",
            page_count=None,
            extraction_method="failed",
            extraction_quality=0.0,
            mime_type=mime,
        )
