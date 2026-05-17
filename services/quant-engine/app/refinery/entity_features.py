"""
Entity-feature orchestrator (Wave F).

Reads parsed_documents_raw, runs `extract_mentions` + `aggregate_features` per
document, and writes per-(entity_id, document) rows into
`features.ontology_features`.

The cleaned narrative layer (`cleaned.narrative_cleaned`) is *not* written here
— that's Wave H's job (narrative theme tracking). This module focuses on
entity → document salience.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.refinery.entities import extract_mentions, aggregate_features

log = structlog.get_logger("quant_engine.refinery.entity_features")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _select_unprocessed(parsed_table: str, ontology_table: str, limit: int) -> str:
    return f"""
        SELECT
          p.id              AS parsed_id,
          p.lineage_id      AS lineage_id,
          p.symbol          AS symbol,
          p.source_url      AS source_url,
          p.source_type     AS source_type,
          p.provider        AS provider,
          p.observation_time AS observation_time,
          p.extracted_text  AS extracted_text,
          p.extraction_quality AS extraction_quality
        FROM `{parsed_table}` p
        WHERE p.extraction_quality >= 0.3
          AND p.extracted_text IS NOT NULL
          AND CHAR_LENGTH(p.extracted_text) > 200
          AND NOT EXISTS (
            SELECT 1 FROM `{ontology_table}` o
            WHERE o.lineage_id = p.lineage_id
          )
        ORDER BY p.ingestion_time DESC
        LIMIT {int(limit)}
    """


def _load_ticker_map_sync(limit: int = 2000) -> dict[str, str]:
    """
    Pull a ticker→name map from cleaned.instruments. This is the runtime
    companion to the curated ontology — every SEC issuer in our warehouse is
    eligible to match in document text.
    """
    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_CLEANED, "instruments")
    try:
        rows = bq.query(
            f"SELECT symbol, name FROM `{table}` WHERE symbol IS NOT NULL "
            f"AND is_active IS NOT FALSE LIMIT {int(limit)}"
        ).result()
        return {r["symbol"]: r["name"] or r["symbol"] for r in rows}
    except Exception as e:
        log.warning("entityfeatures.instruments_unavailable", error=str(e))
        return {}


async def extract_entity_features(
    run_id: str,
    *,
    limit: int = 200,
    top_n_per_doc: int = 50,
) -> dict:
    """
    Pull unprocessed parsed_documents_raw rows, extract entities, write
    per-(entity, document) rows into features.ontology_features.
    """
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    parsed_table = fully_qualified(settings.BQ_DATASET_RAW_DOCUMENTS, "parsed_documents_raw")
    ontology_table = fully_qualified(settings.BQ_DATASET_FEATURES, "ontology_features")
    bq = get_bigquery_client()

    summary = {
        "run_id": run_id,
        "pipeline_name": "entity_features",
        "status": "running",
        "started_at": _now_iso(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
        "documents_scanned": 0,
        "feature_rows_written": 0,
    }
    _runs[run_id] = summary

    try:
        docs = [dict(r) for r in bq.query(_select_unprocessed(parsed_table, ontology_table, limit)).result()]
    except Exception as e:
        summary["status"] = "failed"
        summary["completed_at"] = _now_iso()
        summary["errors"].append({"stage": "select", "error": str(e)})
        log.error("entityfeatures.select_failed", error=str(e))
        return summary

    summary["documents_scanned"] = len(docs)
    if not docs:
        summary["status"] = "completed"
        summary["completed_at"] = _now_iso()
        return summary

    ticker_map = _load_ticker_map_sync()
    feature_rows: List[dict] = []
    now = _now_iso()

    for doc in docs:
        text = doc.get("extracted_text") or ""
        if not text:
            continue

        obs_time = doc.get("observation_time")
        if isinstance(obs_time, datetime):
            obs_time = obs_time.isoformat()
        elif not obs_time:
            obs_time = now

        mentions = extract_mentions(text, extra_companies=ticker_map)
        features = aggregate_features(mentions, text_length=len(text))[:top_n_per_doc]

        for feat in features:
            feature_rows.append({
                "id": str(uuid.uuid4()),
                "symbol": doc.get("symbol"),
                "asset_type": None,
                "provider": doc.get("provider"),
                "source_url": doc.get("source_url"),
                "source_type": doc.get("source_type"),
                "ingestion_time": now,
                "observation_time": obs_time,
                "processing_time": now,
                "lineage_id": doc.get("lineage_id"),
                "confidence": doc.get("extraction_quality") or 1.0,
                "data_quality_score": doc.get("extraction_quality") or 1.0,
                "created_at": now,
                "entity_id": feat.entity_id,
                "entity_label": feat.entity_label,
                "entity_type": feat.entity_type,
                "salience": feat.salience,
                "link_density": round(len(feat.co_entities) / 20.0, 4),  # normalized
                "first_seen_at": obs_time,
                "last_seen_at": obs_time,
                "mention_count": feat.mention_count,
                "co_entities": feat.co_entities[:20],
                "related_symbols": [doc["symbol"]] if doc.get("symbol") else [],
                "updated_at": now,
            })

    # serialize JSON fields
    for r in feature_rows:
        for k, v in list(r.items()):
            if isinstance(v, (dict,)):
                r[k] = json.dumps(v)

    def _chunks(rows_, size=500):
        for i in range(0, len(rows_), size):
            yield rows_[i : i + size]

    for batch in _chunks(feature_rows):
        errors = bq.insert_rows_json(ontology_table, batch)
        if errors:
            log.error("entityfeatures.bq_errors", errors=errors[:3])
            summary["errors"].append({"table": ontology_table, "errors": errors[:3]})
        else:
            summary["feature_rows_written"] += len(batch)

    summary["records_processed"] = summary["feature_rows_written"]
    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _now_iso()
    log.info(
        "entityfeatures.complete",
        run_id=run_id,
        docs=summary["documents_scanned"],
        rows=summary["feature_rows_written"],
    )
    return summary
