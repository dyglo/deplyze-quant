"""Health, readiness and status endpoints."""

import time
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter

from app.core.config import settings
from app.bigquery.client import check_connectivity

log = structlog.get_logger("quant_engine.api.health")
router = APIRouter()

_start_time = time.time()
VERSION = "3.0.0"


@router.get("/health")
async def health():
    """Liveness probe — always returns 200 if the process is running."""
    return {"ok": True, "service": "deplyze-quant-engine", "version": VERSION}


@router.get("/ready")
async def ready():
    """Readiness probe — checks BigQuery connectivity."""
    bq = check_connectivity()
    ok = bq.get("connected", False)
    status = 200 if ok else 503
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=status,
        content={
            "ready": ok,
            "service": "deplyze-quant-engine",
            "version": VERSION,
            "env": settings.QUANT_ENGINE_ENV,
            "bigquery": bq,
            "uptime_seconds": round(time.time() - _start_time, 1),
        },
    )


@router.get("/version")
async def version():
    return {
        "version": VERSION,
        "service": "deplyze-quant-engine",
        "env": settings.QUANT_ENGINE_ENV,
        "project": settings.GCP_PROJECT_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/bigquery/status")
async def bigquery_status():
    """Detailed BigQuery connectivity and dataset status."""
    from app.bigquery.provisioner import list_table_status
    bq = check_connectivity()
    tables = []
    if bq.get("connected"):
        try:
            tables = list_table_status()
        except Exception as e:
            log.error("bigquery_status.table_list_failed", error=str(e))
    return {
        "connectivity": bq,
        "tables": tables,
        "configured_providers": settings.configured_providers,
    }
