"""Historical backfill scheduler."""

import structlog
from datetime import datetime, timezone, timedelta
from typing import List

log = structlog.get_logger("quant_engine.schedulers.backfill")


async def run_backfill(run_id: str, symbols: List[str], start_date: str, end_date: str) -> None:
    from app.api.pipelines import _runs
    from app.refinery.ingestor import run_ingest

    _runs[run_id]["status"] = "running"
    log.info("backfill.start", run_id=run_id, symbols=symbols, start=start_date, end=end_date)

    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        days_back = (end - start).days + 1
    except ValueError as e:
        _runs[run_id].update({"status": "failed", "errors": [{"error": f"Invalid date format: {e}"}]})
        return

    await run_ingest(run_id, symbols, None, "1day", days_back)
    log.info("backfill.complete", run_id=run_id)
