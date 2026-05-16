"""
Data quality scorer.
Assigns a 0.0–1.0 quality score and a lineage_id to every raw record.
"""

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any, Dict


def generate_lineage_id() -> str:
    return str(uuid.uuid4())


def compute_dedup_hash(record: Dict[str, Any], key_fields: list) -> str:
    """Stable hash over key_fields to detect duplicates."""
    parts = "|".join(str(record.get(f, "")) for f in sorted(key_fields))
    return hashlib.sha256(parts.encode()).hexdigest()[:32]


def score_ohlcv_record(record: Dict[str, Any]) -> float:
    """Score OHLCV record completeness and validity. Returns 0.0–1.0."""
    score = 1.0
    required = ["open", "high", "low", "close", "volume", "observation_time"]
    for f in required:
        if record.get(f) is None:
            score -= 0.15
    # Sanity checks
    o, h, l, c = (record.get(k) for k in ["open", "high", "low", "close"])
    if None not in (o, h, l, c):
        if h < l:
            score -= 0.3
        if not (l <= o <= h and l <= c <= h):
            score -= 0.2
        if any(v <= 0 for v in [o, h, l, c] if v is not None):
            score -= 0.2
    return max(0.0, round(score, 4))


def score_fundamentals_record(record: Dict[str, Any]) -> float:
    score = 1.0
    key_fields = ["revenue", "net_income", "eps", "pe_ratio", "market_cap"]
    missing = sum(1 for f in key_fields if record.get(f) is None)
    score -= missing * 0.15
    return max(0.0, round(score, 4))


def score_news_record(record: Dict[str, Any]) -> float:
    score = 1.0
    if not record.get("headline"):
        score -= 0.4
    if not record.get("published_at"):
        score -= 0.3
    if not record.get("summary"):
        score -= 0.2
    return max(0.0, round(score, 4))


def score_generic_record(record: Dict[str, Any], required_fields: list) -> float:
    score = 1.0
    missing = sum(1 for f in required_fields if record.get(f) is None)
    score -= missing * (1.0 / max(len(required_fields), 1))
    return max(0.0, round(score, 4))


def enrich_record(record: Dict[str, Any], scorer_fn=None) -> Dict[str, Any]:
    """Add quality_score, lineage_id and created_at to a record in-place."""
    record.setdefault("lineage_id", generate_lineage_id())
    record.setdefault("created_at", datetime.now(timezone.utc).isoformat())
    record.setdefault("ingestion_time", record["created_at"])
    if scorer_fn:
        record["data_quality_score"] = scorer_fn(record)
    else:
        record.setdefault("data_quality_score", 1.0)
    return record
