"""Warehouse management endpoints."""

import structlog
from fastapi import APIRouter

from app.bigquery.provisioner import provision_all_tables, list_table_status
from app.bigquery.client import check_connectivity

log = structlog.get_logger("quant_engine.api.warehouse")
router = APIRouter()


@router.post("/provision")
async def provision():
    """Idempotently create all V3 BigQuery tables. Safe to call repeatedly."""
    result = provision_all_tables()
    return {
        "ok": True,
        "summary": {
            "created": len(result["created"]),
            "already_existed": len(result["exists"]),
            "errors": len(result["errors"]),
        },
        "details": result,
    }


@router.get("/tables")
async def list_tables():
    """List all registered tables and their existence status."""
    bq = check_connectivity()
    if not bq.get("connected"):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"error": "BigQuery unavailable", "details": bq})
    return {"tables": list_table_status()}


@router.get("/datasets")
async def list_datasets():
    """List BigQuery datasets in the project."""
    return check_connectivity()
