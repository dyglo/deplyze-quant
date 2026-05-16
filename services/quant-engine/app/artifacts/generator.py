"""
Artifact generator — creates structured research artifacts from feature outputs.
Writes to artifacts.* tables and research.intelligence_timeline.
Only generates artifacts from real computed feature data.
"""

import uuid
import json
import structlog
from datetime import datetime, timezone
from typing import List, Optional

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified

log = structlog.get_logger("quant_engine.artifacts.generator")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_artifact(dataset: str, table: str, artifact: dict) -> bool:
    client = get_bigquery_client()
    fqt = fully_qualified(dataset, table)
    clean = {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in artifact.items()}
    errors = client.insert_rows_json(fqt, [clean])
    if errors:
        log.error("artifact.write_failed", table=fqt, errors=errors[:2])
        return False
    return True


def _write_timeline(event: dict) -> bool:
    client = get_bigquery_client()
    fqt = fully_qualified(settings.BQ_DATASET_RESEARCH, "intelligence_timeline")
    clean = {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in event.items()}
    errors = client.insert_rows_json(fqt, [clean])
    return len(errors) == 0


def _load_latest_features(client, symbol: str, feature_table: str) -> dict:
    """Load the most recent feature row for a symbol."""
    fqt = fully_qualified(settings.BQ_DATASET_FEATURES, feature_table)
    query = f"""
        SELECT *
        FROM `{fqt}`
        WHERE symbol = @symbol
        ORDER BY observation_time DESC
        LIMIT 1
    """
    bq = __import__("google.cloud.bigquery", fromlist=["QueryJobConfig", "ScalarQueryParameter"])
    job_config = bq.QueryJobConfig(
        query_parameters=[bq.ScalarQueryParameter("symbol", "STRING", symbol)]
    )
    rows = list(client.query(query, job_config=job_config))
    if not rows:
        return {}
    return dict(rows[0])


def _generate_volatility_artifact(symbol: str, vol_row: dict, now: str) -> Optional[dict]:
    """Generate a volatility_event artifact if vol is in extreme regime."""
    vol21 = vol_row.get("realized_vol_21d")
    pct = vol_row.get("vol_percentile_252d")
    regime = vol_row.get("vol_regime")

    if vol21 is None or regime not in ("high", "low"):
        return None

    severity = "high" if (pct and pct > 0.90) or (pct and pct < 0.05) else "medium"
    direction = "elevated" if regime == "high" else "compressed"

    return {
        "artifact_id": str(uuid.uuid4()),
        "artifact_type": "volatility_event",
        "title": f"{symbol} — {direction.title()} Volatility Regime",
        "summary": (
            f"{symbol} is in a {direction} volatility environment. "
            f"21-day realized vol: {vol21:.1%}. "
            f"Percentile rank (252d history): {pct:.0%}."
        ),
        "symbol": symbol,
        "related_symbols": [symbol],
        "evidence": {"realized_vol_21d": vol21, "vol_percentile_252d": pct, "vol_regime": regime},
        "metrics": {"realized_vol_21d": vol21, "vol_percentile_252d": pct},
        "confidence": 0.85,
        "severity": severity,
        "source_tables": [fully_qualified(settings.BQ_DATASET_FEATURES, "volatility_features")],
        "lineage_id": vol_row.get("lineage_id"),
        "is_test": False,
        "created_at": now,
        "updated_at": now,
    }


def _generate_anomaly_artifact(symbol: str, anom_row: dict, now: str) -> Optional[dict]:
    """Generate an anomaly_event artifact if anomaly_score > threshold."""
    score = anom_row.get("anomaly_score")
    is_anomaly = anom_row.get("is_anomaly", False)

    if not is_anomaly or score is None:
        return None

    return {
        "artifact_id": str(uuid.uuid4()),
        "artifact_type": "anomaly_event",
        "title": f"{symbol} — Statistical Return Anomaly Detected",
        "summary": (
            f"{symbol} has produced an abnormal return. "
            f"Anomaly score: {score:.2f} standard deviations from 63-day history."
        ),
        "symbol": symbol,
        "related_symbols": [symbol],
        "evidence": {"anomaly_score": score, "zscore_return": anom_row.get("zscore_return")},
        "metrics": {"anomaly_score": score},
        "confidence": min(0.95, 0.6 + (score - 2.5) * 0.1),
        "severity": "high" if score > 3.5 else "medium",
        "source_tables": [fully_qualified(settings.BQ_DATASET_FEATURES, "anomaly_features")],
        "lineage_id": anom_row.get("lineage_id"),
        "is_test": False,
        "created_at": now,
        "updated_at": now,
    }


def _generate_regime_artifact(symbol: str, regime_row: dict, now: str) -> Optional[dict]:
    """Generate a regime_transition artifact for stress/bear regimes."""
    label = regime_row.get("regime_label")
    if not label or label in ("unknown", "consolidation"):
        return None

    label_map = {
        "high_vol_stress": ("High Volatility Stress Regime", "high"),
        "bear_high_vol": ("Bear Market with High Volatility", "high"),
        "bull_low_vol": ("Bull Market with Low Volatility", "low"),
        "transitional": ("Transitional Regime", "medium"),
    }
    title_suffix, severity = label_map.get(label, (label, "medium"))

    return {
        "artifact_id": str(uuid.uuid4()),
        "artifact_type": "regime_transition",
        "title": f"{symbol} — {title_suffix}",
        "summary": (
            f"{symbol} is classified as: {label}. "
            f"Trend: {regime_row.get('trend_label', 'unknown')}. "
            f"Vol regime: {regime_row.get('vol_regime', 'unknown')}."
        ),
        "symbol": symbol,
        "related_symbols": [symbol],
        "evidence": {"regime_label": label, "vol_regime": regime_row.get("vol_regime"), "trend_label": regime_row.get("trend_label")},
        "metrics": {"regime_confidence": regime_row.get("regime_confidence"), "trend_strength": regime_row.get("trend_strength")},
        "confidence": regime_row.get("regime_confidence", 0.7),
        "severity": severity,
        "source_tables": [fully_qualified(settings.BQ_DATASET_FEATURES, "regime_features")],
        "lineage_id": regime_row.get("lineage_id"),
        "is_test": False,
        "created_at": now,
        "updated_at": now,
    }


def _to_timeline_event(artifact: dict, now: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "symbol": artifact.get("symbol"),
        "asset_type": "equity",
        "provider": "quant_engine",
        "source_type": "derived",
        "ingestion_time": now,
        "observation_time": now,
        "event_type": artifact.get("artifact_type"),
        "title": artifact.get("title"),
        "summary": artifact.get("summary"),
        "related_symbols": artifact.get("related_symbols", []),
        "artifact_id": artifact.get("artifact_id"),
        "severity": artifact.get("severity"),
        "tags": [artifact.get("artifact_type"), artifact.get("symbol", "")],
        "confidence": artifact.get("confidence"),
        "data_quality_score": 1.0,
        "lineage_id": artifact.get("lineage_id"),
        "created_at": now,
    }


ARTIFACT_TABLE_MAP = {
    "volatility_event": "volatility_artifacts",
    "anomaly_event": "anomaly_artifacts",
    "regime_transition": "regime_artifacts",
    "correlation_shift": "correlation_artifacts",
}


async def run_artifacts(
    run_id: str,
    symbols: List[str],
    artifact_types: Optional[List[str]],
) -> None:
    from app.api.pipelines import _runs
    now = _now_iso()
    if run_id not in _runs:
        _runs[run_id] = {
            "run_id": run_id,
            "pipeline_name": "artifacts",
            "status": "running",
            "started_at": now,
            "completed_at": None,
            "records_processed": 0,
            "artifacts_generated": 0,
            "errors": [],
        }
    else:
        _runs[run_id]["status"] = "running"
    log.info("artifacts.start", run_id=run_id, symbols=symbols)

    client = get_bigquery_client()
    total = 0
    errors = []
    types = artifact_types or ["volatility_event", "anomaly_event", "regime_transition"]

    for symbol in symbols:
        try:
            generated = []

            if "volatility_event" in types:
                vol_row = _load_latest_features(client, symbol, "volatility_features")
                if vol_row:
                    a = _generate_volatility_artifact(symbol, vol_row, now)
                    if a:
                        generated.append(a)

            if "anomaly_event" in types:
                anom_row = _load_latest_features(client, symbol, "anomaly_features")
                if anom_row:
                    a = _generate_anomaly_artifact(symbol, anom_row, now)
                    if a:
                        generated.append(a)

            if "regime_transition" in types:
                reg_row = _load_latest_features(client, symbol, "regime_features")
                if reg_row:
                    a = _generate_regime_artifact(symbol, reg_row, now)
                    if a:
                        generated.append(a)

            for artifact in generated:
                atype = artifact["artifact_type"]
                # Write to research_artifacts (master)
                _write_artifact(settings.BQ_DATASET_ARTIFACTS, "research_artifacts", artifact)
                # Write to specific table
                specific_table = ARTIFACT_TABLE_MAP.get(atype)
                if specific_table:
                    _write_artifact(settings.BQ_DATASET_ARTIFACTS, specific_table, artifact)
                # Write to intelligence timeline
                _write_timeline(_to_timeline_event(artifact, now))
                total += 1
                log.info("artifact.generated", symbol=symbol, type=atype)

        except Exception as e:
            log.error("artifacts.symbol_failed", symbol=symbol, error=str(e))
            errors.append({"symbol": symbol, "error": str(e)})

    _runs[run_id].update({
        "status": "completed" if not errors else "completed_with_errors",
        "completed_at": now,
        "artifacts_generated": total,
        "errors": errors,
    })
    log.info("artifacts.complete", run_id=run_id, total=total)
