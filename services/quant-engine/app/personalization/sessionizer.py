"""
sessionizer.py — collapses raw_app.user_events into cleaned.user_sessions
and the value-event spine cleaned.user_value_events.

Run as a daily batch (Cloud Scheduler → POST /personalization/sessionize).
Idempotent: re-running for a given event_date overwrites that partition's
sessions deterministically because session_id is derived from the event
stream (30-min inactivity gap, see SESSION_GAP_MIN).

The trading-calendar enrichment (session_window) lets retention analytics
align to trading rhythms rather than calendar days — required by the
report's MDAU-Q metric.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.personalization.sessionizer")

SESSION_GAP_MIN = 30  # minutes of inactivity that close a session

# Value-event types — server-side authoritative list, mirrors
# cloud-run/gateway/src/lib/personalization.ts::isValueAction.
VALUE_EVENT_TYPES = (
    "expand", "save", "export", "scenario_run", "copilot_followup",
    "investigation_create", "investigation_update", "investigation_pin",
)


def _bq() -> bigquery.Client:
    return get_bigquery_client()


def sessionize_date(target_date: Optional[date] = None) -> dict:
    """
    Build sessions and value events for `target_date`. Default: yesterday
    (UTC) so the previous market day has fully landed.
    """
    if target_date is None:
        target_date = date.fromisoformat(datetime.now(timezone.utc).date().isoformat())

    events_tbl = fully_qualified(settings.BQ_DATASET_RAW_APP, "user_events")
    sessions_tbl = fully_qualified(settings.BQ_DATASET_CLEANED, "user_sessions")
    value_tbl = fully_qualified(settings.BQ_DATASET_CLEANED, "user_value_events")
    value_types_sql = ", ".join(f"'{t}'" for t in VALUE_EVENT_TYPES)

    # Build sessions with a SQL MERGE-style rebuild for the target partition.
    # Strategy:
    #   1. Delete existing rows in the target partition for sessions + value
    #      events (idempotent re-run).
    #   2. INSERT freshly sessionized rows derived from raw_app.user_events.
    # Sessions are bounded by SESSION_GAP_MIN of inactivity per user.
    sessions_sql = f"""
        DELETE FROM `{sessions_tbl}` WHERE session_date = @d;

        INSERT INTO `{sessions_tbl}` (
            session_id, user_id_hash, started_at, ended_at, duration_s,
            event_count, value_event_count, pages_visited, market_day,
            session_window, entry_surface, exit_surface, session_date,
            app_version, properties, created_at
        )
        WITH ev AS (
            SELECT
                user_id_hash,
                event_type,
                event_category,
                placement,
                app_version,
                COALESCE(client_ts, ingested_at) AS ts
            FROM `{events_tbl}`
            WHERE event_date = @d AND user_id_hash IS NOT NULL
        ),
        gapped AS (
            SELECT
                user_id_hash, event_type, event_category, placement,
                app_version, ts,
                IF(
                    TIMESTAMP_DIFF(
                        ts,
                        LAG(ts) OVER (PARTITION BY user_id_hash ORDER BY ts),
                        MINUTE
                    ) > {SESSION_GAP_MIN}
                    OR LAG(ts) OVER (PARTITION BY user_id_hash ORDER BY ts) IS NULL,
                    1, 0
                ) AS is_new_session
            FROM ev
        ),
        marked AS (
            SELECT *,
                SUM(is_new_session) OVER (
                    PARTITION BY user_id_hash ORDER BY ts
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS session_idx
            FROM gapped
        )
        SELECT
            CONCAT(user_id_hash, ':', CAST(@d AS STRING), ':', CAST(session_idx AS STRING)) AS session_id,
            user_id_hash,
            MIN(ts) AS started_at,
            MAX(ts) AS ended_at,
            CAST(TIMESTAMP_DIFF(MAX(ts), MIN(ts), SECOND) AS INT64) AS duration_s,
            COUNT(*) AS event_count,
            COUNTIF(event_type IN ({value_types_sql})) AS value_event_count,
            ARRAY_AGG(DISTINCT placement IGNORE NULLS LIMIT 32) AS pages_visited,
            -- market_day: simple weekday heuristic; a proper trading calendar
            -- enrichment lands in a later wave (US holidays still flagged
            -- here as market_day=true, but session_window stays informative).
            EXTRACT(DAYOFWEEK FROM MIN(ts)) BETWEEN 2 AND 6 AS market_day,
            CASE
                WHEN EXTRACT(DAYOFWEEK FROM MIN(ts)) IN (1, 7) THEN 'weekend'
                WHEN EXTRACT(HOUR FROM MIN(ts) AT TIME ZONE 'America/New_York') < 9 THEN 'premarket'
                WHEN EXTRACT(HOUR FROM MIN(ts) AT TIME ZONE 'America/New_York') < 12 THEN 'open'
                WHEN EXTRACT(HOUR FROM MIN(ts) AT TIME ZONE 'America/New_York') < 15 THEN 'midday'
                WHEN EXTRACT(HOUR FROM MIN(ts) AT TIME ZONE 'America/New_York') < 17 THEN 'close'
                ELSE 'afterhours'
            END AS session_window,
            ARRAY_AGG(placement IGNORE NULLS ORDER BY ts ASC LIMIT 1)[SAFE_OFFSET(0)] AS entry_surface,
            ARRAY_AGG(placement IGNORE NULLS ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS exit_surface,
            @d AS session_date,
            ANY_VALUE(app_version) AS app_version,
            CAST(NULL AS JSON) AS properties,
            CURRENT_TIMESTAMP() AS created_at
        FROM marked
        GROUP BY user_id_hash, session_idx;
    """

    value_sql = f"""
        DELETE FROM `{value_tbl}` WHERE event_date = @d;

        INSERT INTO `{value_tbl}` (
            value_event_id, user_id_hash, session_id, value_type,
            source_event_id, evidence_artifact_ids, portfolio_id, symbol,
            placement, event_ts, event_date, properties
        )
        SELECT
            GENERATE_UUID() AS value_event_id,
            user_id_hash,
            session_id,
            event_type AS value_type,
            event_id AS source_event_id,
            CASE WHEN artifact_id IS NOT NULL THEN [artifact_id] ELSE [] END
                AS evidence_artifact_ids,
            portfolio_id,
            symbol,
            placement,
            COALESCE(client_ts, ingested_at) AS event_ts,
            event_date,
            properties
        FROM `{events_tbl}`
        WHERE event_date = @d
          AND event_type IN ({value_types_sql})
          AND user_id_hash IS NOT NULL;
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("d", "DATE", target_date)],
    )

    bq = _bq()
    bq.query(sessions_sql, job_config=job_config).result()
    bq.query(value_sql, job_config=job_config).result()

    log.info("sessionizer.completed", target_date=str(target_date))
    return {"status": "ok", "target_date": str(target_date)}
