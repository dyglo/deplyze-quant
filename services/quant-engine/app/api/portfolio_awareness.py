"""
FastAPI routes for Portfolio Awareness Synthesis.

  POST /portfolio-awareness/{portfolio_id}/snapshot
      Body: SynthesisPayload (without portfolio_id; that is taken from
      the path). Writes one row to artifacts.portfolio_awareness_synthesis
      for today's UTC date. Idempotent — same-day re-snapshots replace
      the existing row.

  GET  /portfolio-awareness/{portfolio_id}/latest
      Returns the most recent snapshot within the last 7 days, or 404.

Authentication: handled by the upstream gateway. This service trusts the
caller; do not expose it directly to the public internet.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

from app.portfolio_awareness.writer import (
    SynthesisPayload,
    write_snapshot,
    latest_snapshot,
)

router = APIRouter()
log = structlog.get_logger("quant_engine.api.portfolio_awareness")


class SynthesisPayloadIn(BaseModel):
    benchmark_id: Optional[str] = None
    uid: Optional[str] = None
    workspace_id: Optional[str] = None
    kpis: Dict[str, Any] = Field(default_factory=dict)
    contributors: Dict[str, Any] = Field(default_factory=dict)
    sector_breakdown: Dict[str, Any] = Field(default_factory=dict)
    risk_decomposition: Dict[str, Any] = Field(default_factory=dict)
    monitor_probes: List[Dict[str, Any]] = Field(default_factory=list)
    narrative_lines: Dict[str, List[str]] = Field(default_factory=dict)
    holding_symbols: List[str] = Field(default_factory=list)
    source_tables: Optional[List[str]] = None
    is_test: bool = False


@router.post("/{portfolio_id}/snapshot")
async def snapshot_portfolio_awareness(
    payload: SynthesisPayloadIn,
    portfolio_id: str = Path(..., min_length=1, max_length=128),
) -> Dict[str, Any]:
    """Persist a portfolio awareness snapshot for today (UTC)."""
    sp = SynthesisPayload(
        portfolio_id=portfolio_id,
        benchmark_id=payload.benchmark_id,
        uid=payload.uid,
        workspace_id=payload.workspace_id,
        kpis=payload.kpis,
        contributors=payload.contributors,
        sector_breakdown=payload.sector_breakdown,
        risk_decomposition=payload.risk_decomposition,
        monitor_probes=payload.monitor_probes,
        narrative_lines=payload.narrative_lines,
        holding_symbols=payload.holding_symbols,
        source_tables=payload.source_tables,
        is_test=payload.is_test,
    )
    try:
        result = write_snapshot(sp)
    except Exception as exc:  # noqa: BLE001
        log.error("awareness_snapshot.write_failed", portfolio_id=portfolio_id, error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to persist awareness snapshot")
    return {"ok": True, **result}


@router.get("/{portfolio_id}/latest")
async def latest_portfolio_awareness(
    portfolio_id: str = Path(..., min_length=1, max_length=128),
    max_age_days: int = 7,
) -> Dict[str, Any]:
    """Return the most recent snapshot within max_age_days."""
    try:
        snap = latest_snapshot(portfolio_id, max_age_days=max_age_days)
    except Exception as exc:  # noqa: BLE001
        log.error("awareness_snapshot.read_failed", portfolio_id=portfolio_id, error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to read awareness snapshot")
    if snap is None:
        raise HTTPException(status_code=404, detail="No snapshot in window")
    return snap
