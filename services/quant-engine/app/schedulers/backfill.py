"""Historical backfill scheduler."""

import structlog
from datetime import datetime, timezone, timedelta
from typing import List

log = structlog.get_logger("quant_engine.schedulers.backfill")


async def run_backfill(run_id: str, symbols: List[str], start_date: str, end_date: str) -> None:
    from app.api.pipelines import _runs
    from app.refinery.ingestor import run_ingest
    from app.refinery.refiner import run_refine
    from app.features.engine import run_features

    _runs[run_id]["status"] = "running"
    log.info("backfill.start", run_id=run_id, symbols=symbols, start=start_date, end=end_date)

    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        days_back = (end - start).days + 1
    except ValueError as e:
        _runs[run_id].update({"status": "failed", "errors": [{"error": f"Invalid date format: {e}"}]})
        return

    errors = []

    try:
        await run_ingest(f"{run_id}_ingest", symbols, None, "1day", days_back, start_date, end_date)
    except Exception as e:
        log.error("backfill.ingest_failed", run_id=run_id, error=str(e))
        errors.append({"step": "ingest", "error": str(e)})

    try:
        await run_refine(f"{run_id}_refine", symbols)
    except Exception as e:
        log.error("backfill.refine_failed", run_id=run_id, error=str(e))
        errors.append({"step": "refine", "error": str(e)})

    try:
        await run_features(f"{run_id}_features", symbols, None)
    except Exception as e:
        log.error("backfill.features_failed", run_id=run_id, error=str(e))
        errors.append({"step": "features", "error": str(e)})

    _runs[run_id].update({
        "status": "completed" if not errors else "completed_with_errors",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
    })
    log.info("backfill.complete", run_id=run_id, errors=len(errors))
