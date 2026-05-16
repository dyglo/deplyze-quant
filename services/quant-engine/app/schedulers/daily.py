"""Daily pipeline orchestrator — ingest → refine → features → artifacts."""

import structlog
from datetime import datetime, timezone
from typing import List

from app.refinery.ingestor import run_ingest
from app.refinery.refiner import run_refine
from app.features.engine import run_features
from app.artifacts.generator import run_artifacts

log = structlog.get_logger("quant_engine.schedulers.daily")


async def run_daily_pipeline(run_id: str, symbols: List[str], dry_run: bool = False) -> None:
    from app.api.pipelines import _runs
    _runs[run_id]["status"] = "running"
    now = datetime.now(timezone.utc).isoformat()
    log.info("daily_pipeline.start", run_id=run_id, symbols=symbols, dry_run=dry_run)

    if dry_run:
        log.info("daily_pipeline.dry_run", message="Dry run — skipping actual execution")
        _runs[run_id].update({"status": "completed", "completed_at": now, "dry_run": True})
        return

    errors = []

    # Step 1: Ingest
    try:
        await run_ingest(f"{run_id}_ingest", symbols, None, "1day", 2)
    except Exception as e:
        log.error("daily_pipeline.ingest_failed", error=str(e))
        errors.append({"step": "ingest", "error": str(e)})

    # Step 2: Refine
    try:
        await run_refine(f"{run_id}_refine", symbols)
    except Exception as e:
        log.error("daily_pipeline.refine_failed", error=str(e))
        errors.append({"step": "refine", "error": str(e)})

    # Step 3: Features
    try:
        await run_features(f"{run_id}_features", symbols, None)
    except Exception as e:
        log.error("daily_pipeline.features_failed", error=str(e))
        errors.append({"step": "features", "error": str(e)})

    # Step 4: Artifacts
    try:
        await run_artifacts(f"{run_id}_artifacts", symbols, None)
    except Exception as e:
        log.error("daily_pipeline.artifacts_failed", error=str(e))
        errors.append({"step": "artifacts", "error": str(e)})

    total_processed = 0
    total_artifacts = 0

    ingest_run = _runs.get(f"{run_id}_ingest")
    if ingest_run:
        total_processed += ingest_run.get("records_processed", 0)
        if ingest_run.get("errors"):
            errors.extend([{"step": "ingest", "error": err} for err in ingest_run["errors"]])

    refine_run = _runs.get(f"{run_id}_refine")
    if refine_run:
        total_processed += refine_run.get("records_processed", 0)
        if refine_run.get("errors"):
            errors.extend([{"step": "refine", "error": err} for err in refine_run["errors"]])

    features_run = _runs.get(f"{run_id}_features")
    if features_run:
        total_processed += features_run.get("records_processed", 0)
        if features_run.get("errors"):
            errors.extend([{"step": "features", "error": err} for err in features_run["errors"]])

    artifacts_run = _runs.get(f"{run_id}_artifacts")
    if artifacts_run:
        total_artifacts += artifacts_run.get("artifacts_generated", 0)
        if artifacts_run.get("errors"):
            errors.extend([{"step": "artifacts", "error": err} for err in artifacts_run["errors"]])

    status = "completed" if not errors else "completed_with_errors"

    _runs[run_id].update({
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "records_processed": total_processed,
        "artifacts_generated": total_artifacts,
        "errors": errors
    })
    log.info("daily_pipeline.complete", run_id=run_id, status=status, processed=total_processed, artifacts=total_artifacts)
