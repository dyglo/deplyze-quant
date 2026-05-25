"""
candidate_generator.py — assembles the per-user candidate pool the ranker
scores. Phase 1 sources:

  1. artifacts.agent_outputs            (V4 agentic feed)
  2. artifacts.macro_artifacts          (regime transitions)
  3. artifacts.narrative_artifacts      (narrative strengthening/weakening)
  4. artifacts.historical_analog_artifacts (analog matches)
  5. artifacts.relationship_artifacts   (cross-asset / breakdowns)

The function is read-only and deterministic. It does NOT score; the ranker
does that in ranker.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.personalization.candidate_generator")


@dataclass
class Candidate:
    artifact_id: str
    kind: str                       # agent_output | macro | narrative | analog | relationship
    title: Optional[str]
    summary: Optional[str]
    body: Optional[str]
    confidence: float
    severity: Optional[str]
    symbols: list[str] = field(default_factory=list)
    placement_hints: list[str] = field(default_factory=list)
    generated_at: Optional[datetime] = None
    raw: dict[str, Any] = field(default_factory=dict)

    def to_ranker_row(self) -> dict[str, Any]:
        return {
            "artifact_id": self.artifact_id,
            "kind": self.kind,
            "title": self.title,
            "summary": self.summary,
            "confidence": self.confidence,
            "severity": self.severity,
            "symbols": self.symbols,
            "placement_hints": self.placement_hints,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }


def generate_candidates(
    *,
    lookback_hours: int = 24,
    max_per_kind: int = 25,
    include_kinds: Optional[list[str]] = None,
) -> list[Candidate]:
    """
    Pull recent candidates across all V4 artifact tables. The pool is
    user-agnostic; per-user relevance is computed by the ranker against
    a user_profile_daily snapshot.
    """
    bq = get_bigquery_client()
    cutoff_h = max(1, min(lookback_hours, 24 * 14))
    kinds = set(include_kinds or [
        "agent_output", "macro", "narrative", "analog", "relationship",
    ])
    candidates: list[Candidate] = []

    if "agent_output" in kinds:
        candidates.extend(_pull_agent_outputs(bq, cutoff_h, max_per_kind))
    if "macro" in kinds:
        candidates.extend(_pull_macro_artifacts(bq, cutoff_h, max_per_kind))
    if "narrative" in kinds:
        candidates.extend(_pull_narrative_artifacts(bq, cutoff_h, max_per_kind))
    if "analog" in kinds:
        candidates.extend(_pull_analog_artifacts(bq, cutoff_h, max_per_kind))
    if "relationship" in kinds:
        candidates.extend(_pull_relationship_artifacts(bq, cutoff_h, max_per_kind))

    log.info("candidate_generator.assembled", count=len(candidates), kinds=sorted(kinds))
    return candidates


def _scalar_rows(bq: bigquery.Client, sql: str, params: list) -> list[dict[str, Any]]:
    try:
        job = bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
        return [dict(r) for r in job.result()]
    except Exception as e:
        log.warning("candidate_generator.query_failed", error=str(e), sql=sql[:120])
        return []


def _pull_agent_outputs(bq: bigquery.Client, hours: int, limit: int) -> list[Candidate]:
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "agent_outputs")
    sql = f"""
        SELECT artifact_id, title, summary, body, confidence, severity,
               symbols, recommended_placements, generated_at, domain, artifact_type
        FROM `{tbl}`
        WHERE generated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @h HOUR)
          AND COALESCE(is_test, FALSE) = FALSE
        ORDER BY severity DESC, confidence DESC, generated_at DESC
        LIMIT @lim
    """
    rows = _scalar_rows(bq, sql, [
        bigquery.ScalarQueryParameter("h", "INT64", hours),
        bigquery.ScalarQueryParameter("lim", "INT64", limit),
    ])
    return [
        Candidate(
            artifact_id=str(r["artifact_id"]),
            kind="agent_output",
            title=r.get("title"),
            summary=r.get("summary"),
            body=r.get("body"),
            confidence=float(r.get("confidence") or 0.5),
            severity=r.get("severity"),
            symbols=list(r.get("symbols") or []),
            placement_hints=list(r.get("recommended_placements") or []),
            generated_at=r.get("generated_at"),
            raw={"domain": r.get("domain"), "artifact_type": r.get("artifact_type")},
        )
        for r in rows
    ]


def _generic_artifact_pull(
    bq: bigquery.Client,
    table_name: str,
    kind: str,
    hours: int,
    limit: int,
) -> list[Candidate]:
    """Read shape that the V3P2 / V4 artifact tables share."""
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, table_name)
    sql = f"""
        SELECT
            artifact_id,
            COALESCE(title, summary) AS title,
            summary,
            CAST(NULL AS STRING) AS body,
            COALESCE(confidence, 0.5) AS confidence,
            severity,
            ARRAY_CONCAT(
              IF(symbol IS NULL OR symbol = '', [], [UPPER(symbol)]),
              ARRAY(SELECT UPPER(s) FROM UNNEST(IFNULL(related_symbols, [])) AS s)
            ) AS symbols,
            created_at AS generated_at,
            artifact_type
        FROM `{tbl}`
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @h HOUR)
          AND COALESCE(is_test, FALSE) = FALSE
        ORDER BY confidence DESC, created_at DESC
        LIMIT @lim
    """
    rows = _scalar_rows(bq, sql, [
        bigquery.ScalarQueryParameter("h", "INT64", hours),
        bigquery.ScalarQueryParameter("lim", "INT64", limit),
    ])
    return [
        Candidate(
            artifact_id=str(r["artifact_id"]),
            kind=kind,
            title=r.get("title"),
            summary=r.get("summary"),
            body=r.get("body"),
            confidence=float(r.get("confidence") or 0.5),
            severity=r.get("severity"),
            symbols=list(r.get("symbols") or []),
            generated_at=r.get("generated_at"),
            raw={"artifact_type": r.get("artifact_type")},
        )
        for r in rows
    ]


def _pull_macro_artifacts(bq, hours, limit):
    return _generic_artifact_pull(bq, "macro_artifacts", "macro", hours, limit)


def _pull_narrative_artifacts(bq, hours, limit):
    return _generic_artifact_pull(bq, "narrative_artifacts", "narrative", hours, limit)


def _pull_analog_artifacts(bq, hours, limit):
    return _generic_artifact_pull(bq, "historical_analog_artifacts", "analog", hours, limit)


def _pull_relationship_artifacts(bq, hours, limit):
    return _generic_artifact_pull(bq, "relationship_artifacts", "relationship", hours, limit)


__all__ = ["Candidate", "generate_candidates"]
