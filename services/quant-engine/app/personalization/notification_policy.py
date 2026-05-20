"""
notification_policy.py — alert send/suppress/defer decisions with hard
caps. Phase 1 is deterministic. Every decision is logged to
artifacts.notification_decisions for off-policy evaluation.

Hard caps live HERE, not in product code:
  - MAX_ALERTS_PER_DAY (default 3)
  - MIN_ALERT_CONFIDENCE (default 0.6)
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone
from typing import Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings
from app.personalization.ranker import RankedCandidate

log = structlog.get_logger("quant_engine.personalization.notification_policy")

DECISION_SEND = "send"
DECISION_SUPPRESS = "suppress"
DECISION_DEFER = "defer"


def decide(
    *,
    user_id_hash: str,
    ranked: RankedCandidate,
    channel: str = "web",
    sent_today_count: int = 0,
    persist: bool = True,
) -> dict:
    """
    Deterministic decision policy. Returns the decision record (also written
    to artifacts.notification_decisions when persist=True).
    """
    reasons: list[str] = []
    decision = DECISION_SEND

    if not ranked.gate_passed:
        decision = DECISION_SUPPRESS
        reasons.extend([f"ranker_gate:{r}" for r in ranked.gate_reasons])
    if (ranked.candidate.confidence or 0.0) < settings.MIN_ALERT_CONFIDENCE:
        decision = DECISION_SUPPRESS
        reasons.append("below_min_alert_confidence")
    if sent_today_count >= settings.MAX_ALERTS_PER_DAY:
        decision = DECISION_DEFER
        reasons.append("daily_cap_reached")

    record = {
        "decision_id": str(uuid.uuid4()),
        "user_id_hash": user_id_hash,
        "decision_at": datetime.now(timezone.utc).isoformat(),
        "decision_date": datetime.now(timezone.utc).date().isoformat(),
        "candidate_artifact_id": ranked.candidate.artifact_id,
        "channel": channel,
        "decision": decision,
        "decision_reasons": reasons,
        "policy_version": settings.PERSONALIZATION_POLICY_VERSION,
        "severity": ranked.candidate.severity,
        "confidence": ranked.candidate.confidence,
        "expected_value": ranked.base_score,
        "fatigue_penalty": ranked.component_scores.get("fatigue", 0.0)
            if isinstance(ranked.component_scores, dict) else None,
        "outcome": None,
        "outcome_at": None,
        "experiment_arm": None,
        "properties": json.dumps({"reason_codes": ranked.reason_codes}),
    }

    if persist:
        _persist_decision(record)
    return record


def _persist_decision(record: dict) -> None:
    bq = get_bigquery_client()
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "notification_decisions")
    errors = bq.insert_rows_json(tbl, [record])
    if errors:
        log.error("notification_policy.insert_errors", errors=errors[:3])


def sent_today_count(user_id_hash: str, channel: str = "web") -> int:
    """How many alerts have been SENT to this user today on this channel."""
    bq = get_bigquery_client()
    tbl = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "notification_decisions")
    sql = f"""
        SELECT COUNT(*) AS n
        FROM `{tbl}`
        WHERE user_id_hash = @uid
          AND channel = @ch
          AND decision = 'send'
          AND decision_date = CURRENT_DATE()
    """
    try:
        rows = list(bq.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("uid", "STRING", user_id_hash),
            bigquery.ScalarQueryParameter("ch", "STRING", channel),
        ])).result())
        return int(rows[0]["n"]) if rows else 0
    except Exception:
        return 0


__all__ = ["decide", "sent_today_count", "DECISION_SEND", "DECISION_SUPPRESS", "DECISION_DEFER"]
