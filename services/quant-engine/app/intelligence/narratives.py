"""
Narrative Intelligence engine (Wave H).

Reads `features.ontology_features` (Wave F output) filtered to theme entities
and tracks each theme's lifecycle:

  • Emergence   — first appearance in the last 90 days, weight by salience
  • Recurrence  — count of prior windows where the theme was mentioned
  • Lifetime    — total time the theme has been observed in the warehouse
  • Polarity / Intensity — aggregated from per-mention narrative_cleaned

Persists to:
  • features.narrative_features    — per-theme rolling stats (7d/30d windows)
  • research.narrative_memory      — long-lived theme memory (one row per theme)
  • artifacts.narrative_artifacts  — emergence/spike events
  • cleaned.narrative_cleaned      — per-document narrative observations
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified

log = structlog.get_logger("quant_engine.intelligence.narratives")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize(d: dict) -> dict:
    out = dict(d)
    for k, v in list(out.items()):
        if isinstance(v, (dict, list)):
            out[k] = json.dumps(v)
    return out


def _load_theme_mentions(lookback_days: int = 180) -> list[dict]:
    """
    Return ontology_features rows for theme entities within the lookback. We
    keep only the latest copy per (entity_id, lineage_id) so re-runs of Wave F
    over the same document don't double-count.
    """
    bq = get_bigquery_client()
    ont = fully_qualified(settings.BQ_DATASET_FEATURES, "ontology_features")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
    sql = f"""
        SELECT
          entity_id,
          ANY_VALUE(entity_label) AS entity_label,
          lineage_id,
          symbol,
          source_url,
          ANY_VALUE(provider) AS provider,
          MAX(observation_time) AS observation_time,
          MAX(salience) AS salience,
          MAX(mention_count) AS mention_count,
          ARRAY_AGG(DISTINCT IFNULL(co_entities[SAFE_OFFSET(0)], '') IGNORE NULLS LIMIT 10) AS related_entities,
        FROM `{ont}`
        WHERE entity_type = 'theme'
          AND observation_time >= TIMESTAMP('{cutoff}')
        GROUP BY entity_id, lineage_id, symbol, source_url
    """
    return [dict(r) for r in bq.query(sql).result()]


def _bucket(window_days: int, ts_iso: Optional[str], now: datetime) -> bool:
    if not ts_iso:
        return False
    try:
        ts = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
    except Exception:
        return False
    return (now - ts).days <= window_days


async def compute_narrative_intelligence(run_id: str, *, lookback_days: int = 180) -> dict:
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    summary = {
        "run_id": run_id,
        "pipeline_name": "narrative_intelligence",
        "status": "running",
        "started_at": _now_iso(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
        "themes_tracked": 0,
        "lookback_days": lookback_days,
    }
    _runs[run_id] = summary

    try:
        mentions = _load_theme_mentions(lookback_days=lookback_days)
    except Exception as e:
        summary["status"] = "failed"
        summary["completed_at"] = _now_iso()
        summary["errors"].append({"stage": "load", "error": str(e)})
        log.error("narratives.load_failed", error=str(e))
        return summary

    if not mentions:
        summary["status"] = "completed"
        summary["completed_at"] = _now_iso()
        return summary

    by_theme: dict[str, list[dict]] = defaultdict(list)
    for m in mentions:
        by_theme[m["entity_id"]].append(m)
    summary["themes_tracked"] = len(by_theme)

    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    bq = get_bigquery_client()
    feat_table = fully_qualified(settings.BQ_DATASET_FEATURES, "narrative_features")
    mem_table = fully_qualified(settings.BQ_DATASET_RESEARCH, "narrative_memory")
    art_table = fully_qualified(settings.BQ_DATASET_ARTIFACTS, "narrative_artifacts")
    cleaned_table = fully_qualified(settings.BQ_DATASET_CLEANED, "narrative_cleaned")

    feature_rows: list[dict] = []
    memory_rows: list[dict] = []
    artifact_rows: list[dict] = []
    cleaned_rows: list[dict] = []

    for theme_id, items in by_theme.items():
        theme_label = items[0].get("entity_label") or theme_id

        # Sort oldest → newest
        items.sort(key=lambda x: (x.get("observation_time") or ""))
        first_seen = items[0].get("observation_time")
        last_seen = items[-1].get("observation_time")

        total = len(items)
        m7 = sum(1 for x in items if _bucket(7, x.get("observation_time"), now_dt))
        m30 = sum(1 for x in items if _bucket(30, x.get("observation_time"), now_dt))
        m90 = sum(1 for x in items if _bucket(90, x.get("observation_time"), now_dt))
        m_prior = max(0, total - m30)  # everything older than 30d

        # Emergence: high mentions_30d, low prior — theme just showed up.
        emergence = (m30 / (1 + m_prior)) * (m30 ** 0.5) / 5.0
        emergence = round(min(1.0, emergence), 4)
        # Recurrence: theme present across multiple 30d windows in the lookback.
        windows = max(1, lookback_days // 30)
        present_windows = 0
        for w in range(windows):
            start = now_dt - timedelta(days=(w + 1) * 30)
            end = now_dt - timedelta(days=w * 30)
            for x in items:
                ts_iso = x.get("observation_time")
                if not ts_iso:
                    continue
                try:
                    ts = datetime.fromisoformat(str(ts_iso).replace("Z", "+00:00"))
                except Exception:
                    continue
                if start <= ts < end:
                    present_windows += 1
                    break
        recurrence = round(present_windows / windows, 4)

        salience_mean = round(
            sum(float(x.get("salience") or 0) for x in items) / max(1, total), 4
        )

        related_symbols = sorted({
            str(x.get("symbol")) for x in items if x.get("symbol")
        })[:25]

        # ── features.narrative_features ───────────────────────────────────────
        feature_rows.append({
            "id": str(uuid.uuid4()),
            "symbol": None,
            "asset_type": "narrative",
            "provider": "deplyze_quant",
            "source_url": None,
            "source_type": "narrative_feature",
            "ingestion_time": now,
            "observation_time": now,
            "lineage_id": f"narrative_feature:{theme_id}:{now[:10]}",
            "confidence": 1.0,
            "data_quality_score": 1.0,
            "created_at": now,
            "theme_id": theme_id,
            "theme_label": theme_label,
            "window_days": lookback_days,
            "mentions": total,
            "mentions_7d": m7,
            "mentions_30d": m30,
            "emergence_score": emergence,
            "recurrence_score": recurrence,
            "polarity_mean": None,
            "intensity_mean": salience_mean,
            "related_symbols": related_symbols,
            "updated_at": now,
        })

        # ── research.narrative_memory ────────────────────────────────────────
        # Lifetime score = blend of recurrence + emergence + scale.
        lifetime_score = round(min(1.0, 0.6 * recurrence + 0.3 * emergence + 0.1 * min(1.0, total / 100.0)), 4)
        memory_rows.append({
            "id": str(uuid.uuid4()),
            "symbol": None,
            "asset_type": "narrative",
            "provider": "deplyze_quant",
            "source_url": None,
            "source_type": "narrative_memory",
            "ingestion_time": now,
            "observation_time": now,
            "lineage_id": f"narrative_memory:{theme_id}",
            "confidence": 1.0,
            "data_quality_score": 1.0,
            "created_at": now,
            "theme_id": theme_id,
            "theme_label": theme_label,
            "emergence_at": first_seen,
            "last_seen_at": last_seen,
            "recurrence_count": present_windows,
            "lifetime_score": lifetime_score,
            "polarity_mean": None,
            "intensity_mean": salience_mean,
            "related_symbols": related_symbols,
            "related_entities": [],
            "tags": ["theme", theme_id],
            "updated_at": now,
        })

        # ── artifacts.narrative_artifacts (emergence or spike) ───────────────
        if emergence >= 0.5 or (m7 >= 5 and recurrence < 0.5):
            artifact_rows.append({
                "artifact_id": f"narrative:{theme_id}:{now[:10]}",
                "artifact_type": "narrative_emergence",
                "title": f"Narrative emergence: {theme_label}",
                "summary": (
                    f"Theme '{theme_label}' shows emergence score {emergence}. "
                    f"30d mentions: {m30}; prior: {m_prior}; 7d: {m7}. "
                    f"Recurrence across windows: {recurrence}. Lifetime score: {lifetime_score}."
                ),
                "symbol": None,
                "related_symbols": related_symbols,
                "evidence": {
                    "mentions_7d": m7, "mentions_30d": m30, "mentions_total": total,
                    "prior_mentions": m_prior, "windows_present": present_windows,
                },
                "metrics": {
                    "emergence_score": emergence,
                    "recurrence_score": recurrence,
                    "lifetime_score": lifetime_score,
                    "intensity_mean": salience_mean,
                },
                "confidence": min(1.0, emergence * 1.2),
                "severity": "high" if emergence >= 0.75 else "med",
                "source_tables": [fully_qualified(settings.BQ_DATASET_FEATURES, "ontology_features")],
                "lineage_id": f"narrative_artifact:{theme_id}:{now[:10]}",
                "is_test": False,
                "created_at": now,
                "updated_at": now,
            })

        # ── cleaned.narrative_cleaned — per-document narrative rows ──────────
        for x in items:
            obs_iso = x.get("observation_time")
            cleaned_rows.append({
                "id": str(uuid.uuid4()),
                "symbol": x.get("symbol"),
                "asset_type": "narrative",
                "provider": x.get("provider"),
                "source_url": x.get("source_url"),
                "source_type": "narrative_observation",
                "ingestion_time": now,
                "observation_time": obs_iso,
                "lineage_id": f"narrative_obs:{theme_id}:{x.get('lineage_id')}",
                "confidence": 1.0,
                "data_quality_score": 1.0,
                "created_at": now,
                "theme_id": theme_id,
                "theme_label": theme_label,
                "source_document_id": x.get("lineage_id"),
                "polarity": None,
                "intensity": float(x.get("salience") or 0.0),
                "salience": float(x.get("salience") or 0.0),
                "excerpt": None,
                "published_at": obs_iso,
                "related_symbols": [x.get("symbol")] if x.get("symbol") else [],
                "related_entities": list(x.get("related_entities") or [])[:10],
                "dedup_hash": f"{theme_id}|{x.get('lineage_id')}"[:64],
                "updated_at": now,
            })

    def _chunks(rows_, size=300):
        for i in range(0, len(rows_), size):
            yield rows_[i : i + size]

    for table, rows in (
        (feat_table, feature_rows),
        (mem_table, memory_rows),
        (art_table, artifact_rows),
        (cleaned_table, cleaned_rows),
    ):
        serialized = [_serialize(r) for r in rows]
        for batch in _chunks(serialized):
            errors = bq.insert_rows_json(table, batch)
            if errors:
                log.error("narratives.bq_errors", table=table, errors=errors[:3])
                summary["errors"].append({"table": table, "errors": errors[:3]})
            else:
                summary["records_processed"] += len(batch)
                if table == art_table:
                    summary["artifacts_generated"] += len(batch)

    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _now_iso()
    log.info(
        "narratives.complete",
        run_id=run_id,
        themes=summary["themes_tracked"],
        artifacts=summary["artifacts_generated"],
    )
    return summary
