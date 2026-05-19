"""
Deplyze Quant Engine — FastAPI Application Entry Point

Service: deplyze-quant-engine
Region:  us-central1
Registry: us-central1-docker.pkg.dev/deplyze-quant/deplyze-quant-engine

This service provides:
  - BigQuery warehouse management (schema creation, verification)
  - Data ingestion pipeline coordination
  - Feature engineering (returns, vol, z-scores, momentum, etc.)
  - Artifact generation and intelligence timeline persistence
  - Pipeline run orchestration
  - Health / readiness endpoints for Cloud Run

It is deployed SEPARATELY from deplyze-gateway (the existing Node/Express
authenticated API). This service is invoked by:
  - Cloud Scheduler (scheduled pipeline runs)
  - Internal Cloud Run Jobs
  - The gateway (optionally, for on-demand pipeline triggers)

Authentication: Cloud Run service-to-service auth (GCP IAM).
Secrets: passed as Cloud Run environment variables (never in source).
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import configure_logging
from app.bigquery.client import get_bigquery_client
from app.api.health import router as health_router
from app.api.pipelines import router as pipelines_router
from app.api.warehouse import router as warehouse_router
from app.api.agents import router as agents_router

# ─── Logging ────────────────────────────────────────────────────────────────

configure_logging()
log = structlog.get_logger("quant_engine.main")


# ─── Lifespan (startup / shutdown) ──────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Startup: validate BigQuery connectivity, warm the BQ client.
    Shutdown: gracefully flush any pending state.
    """
    log.info("quant_engine.startup", env=settings.QUANT_ENGINE_ENV, project=settings.GCP_PROJECT_ID)

    # Validate BigQuery connectivity — fail fast on misconfiguration
    try:
        client = get_bigquery_client()
        # Light probe: list datasets
        datasets = list(client.list_datasets(project=settings.GCP_PROJECT_ID))
        dataset_ids = [ds.dataset_id for ds in datasets]
        log.info("bigquery.connected", datasets=dataset_ids, count=len(dataset_ids))
    except Exception as exc:
        log.error("bigquery.connection_failed", error=str(exc))
        # In production we still start (Cloud Run will mark unready via /ready)
        # but we log the fatal error prominently
        if settings.QUANT_ENGINE_ENV == "production":
            log.critical("bigquery.unavailable_in_production", error=str(exc))
        # Don't sys.exit — let /ready reflect the failure

    log.info("quant_engine.ready")
    yield
    log.info("quant_engine.shutdown")


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Deplyze Quant Engine",
    description=(
        "Autonomous quantitative intelligence infrastructure. "
        "Ingests, refines, features-engineers, and publishes financial data to BigQuery."
    ),
    version="4.0.0",
    docs_url="/docs" if settings.QUANT_ENGINE_ENV != "production" else None,
    redoc_url="/redoc" if settings.QUANT_ENGINE_ENV != "production" else None,
    lifespan=lifespan,
)

# CORS — restrict to internal GCP origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# ─── Routers ────────────────────────────────────────────────────────────────

app.include_router(health_router, tags=["Health"])
app.include_router(pipelines_router, prefix="/pipelines", tags=["Pipelines"])
app.include_router(warehouse_router, prefix="/warehouse", tags=["Warehouse"])
app.include_router(agents_router, prefix="/agents", tags=["Agents"])


# ─── Global error handler ────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError) -> JSONResponse:
    body = await request.body()
    log.error("validation_error", path=str(request.url), errors=exc.errors(), body=body.decode(errors="ignore"))
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body_received": body.decode(errors="ignore")},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception) -> JSONResponse:
    log.error("unhandled_exception", path=str(request.url), error=str(exc), exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "code": "INTERNAL_ERROR"},
    )
