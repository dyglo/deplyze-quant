"""
V5 Personalization API — FastAPI router exposed by the quant-engine.

These endpoints are called by:
  - The Cloud Run gateway (PR4) — proxies briefing / feed / copilot-context
    / investigation routes to the engine.
  - Cloud Scheduler (PR3 deploy scripts) — pre-market briefing materialize,
    nightly profile build, daily sessionize.

Auth: this service sits behind the internal Cloud Run IAM perimeter. There
is no public ingress — the gateway is the only authorized caller.

When PERSONALIZATION_ENABLED=false the materialization endpoints become
no-ops and the read endpoints return empty payloads, matching the
gateway's 404-from-flag behavior.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

import structlog
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.personalization import is_personalization_enabled
from app.personalization import (
    briefing_builder,
    investigation_memory,
    notification_policy,
    profile_builder,
    sessionizer,
)
from app.personalization.candidate_generator import generate_candidates
from app.personalization.ranker import (
    UserProfile,
    rank_candidates,
    ranker_version,
)

log = structlog.get_logger("quant_engine.api.personalization")
router = APIRouter()


# ─── Models ──────────────────────────────────────────────────────────────────

class SessionizeRequest(BaseModel):
    target_date: Optional[str] = Field(
        None, description="ISO YYYY-MM-DD. Defaults to today UTC."
    )


class ProfileBuildRequest(BaseModel):
    target_date: Optional[str] = None
    user_id_hash: Optional[str] = Field(
        None, description="If provided, build only for this user; otherwise all eligible."
    )


class BriefingRequest(BaseModel):
    user_id_hash: str
    briefing_window: str = "premarket"
    briefing_date: Optional[str] = None
    portfolio_id: Optional[str] = None
    persist: bool = True


class MaterializeRequest(BaseModel):
    briefing_window: str = "premarket"
    user_id_hash: Optional[str] = None
    briefing_date: Optional[str] = None
    portfolio_id: Optional[str] = None


class InvestigationCreateRequest(BaseModel):
    user_id_hash: str
    title: str
    thesis: Optional[str] = None
    symbols: list[str] = []
    themes: list[str] = []
    tags: list[str] = []
    unresolved_questions: list[str] = []


class InvestigationUpdateRequest(BaseModel):
    user_id_hash: str
    patch: dict[str, Any]


# ─── Guard ───────────────────────────────────────────────────────────────────

def _require_enabled() -> None:
    if not is_personalization_enabled():
        raise HTTPException(status_code=404, detail="Personalization disabled.")


# ─── Materialization (scheduler-driven) ──────────────────────────────────────

@router.post("/sessionize")
async def http_sessionize(req: SessionizeRequest):
    _require_enabled()
    td = date.fromisoformat(req.target_date) if req.target_date else None
    return sessionizer.sessionize_date(target_date=td)


@router.post("/profile/build")
async def http_profile_build(req: ProfileBuildRequest):
    _require_enabled()
    td = date.fromisoformat(req.target_date) if req.target_date else None
    return profile_builder.build_profiles(target_date=td, user_id_hash=req.user_id_hash)


@router.post("/briefing/materialize")
async def http_briefing_materialize(req: MaterializeRequest):
    _require_enabled()
    bd = date.fromisoformat(req.briefing_date) if req.briefing_date else None

    if req.user_id_hash is None:
        # Population build: process all known users.
        user_hashes = briefing_builder.get_all_user_hashes()
        for uid in user_hashes:
            try:
                briefing_builder.build_briefing(
                    user_id_hash=uid,
                    briefing_window=req.briefing_window,
                    briefing_date=bd,
                    portfolio_id=req.portfolio_id,
                    persist=True,
                )
            except Exception as exc:
                log.warning(
                    "briefing_materialize.user_failed",
                    user_id_hash=uid,
                    error=str(exc),
                )
        log.info("briefing_materialize.population_done", users_processed=len(user_hashes))
        return {"status": "ok", "mode": "population", "users_processed": len(user_hashes)}

    # Single-user build
    briefing_builder.build_briefing(
        user_id_hash=req.user_id_hash,
        briefing_window=req.briefing_window,
        briefing_date=bd,
        portfolio_id=req.portfolio_id,
        persist=True,
    )
    log.info("briefing_materialize.single_done", user_id_hash=req.user_id_hash)
    return {"status": "ok", "mode": "single", "user_id_hash": req.user_id_hash}


# ─── Read endpoints (gateway-proxied) ────────────────────────────────────────

@router.get("/briefing")
async def http_get_briefing(user_id_hash: str = Query(..., min_length=8)):
    _require_enabled()
    b = briefing_builder.latest_briefing(user_id_hash)
    if not b:
        # No persisted briefing yet — synthesize on demand (no persist).
        b = briefing_builder.build_briefing(user_id_hash=user_id_hash, persist=False)
    return {"briefing": b}


@router.get("/feed")
async def http_get_feed(
    user_id_hash: str = Query(..., min_length=8),
    limit: int = Query(20, ge=1, le=50),
):
    """
    Personalized intelligence feed — same ranking pipeline as the briefing
    but flat-listed and not bucketed into the five briefing sections.
    """
    _require_enabled()
    candidates = generate_candidates(lookback_hours=48, max_per_kind=30)
    profile = briefing_builder._profile_for_user(__bq_client(), user_id_hash)
    ranked = rank_candidates(candidates, profile)
    items = [
        {
            "artifact_id": r.candidate.artifact_id,
            "kind": r.candidate.kind,
            "title": r.candidate.title,
            "summary": r.candidate.summary,
            "base_score": r.base_score,
            "reason_codes": r.reason_codes,
            "confidence": r.candidate.confidence,
            "severity": r.candidate.severity,
            "symbols": r.candidate.symbols,
        }
        for r in ranked if r.gate_passed
    ][:limit]
    return {"items": items, "ranker_version": ranker_version()}


@router.get("/copilot-context")
async def http_get_copilot_context(user_id_hash: str = Query(..., min_length=8)):
    """
    Compact grounding payload for the Research Copilot (PR7 will wire it in).
    Returns the user's active investigations + most recent profile snippet
    + top 3 ranked items as evidence anchors.
    """
    _require_enabled()
    investigations = investigation_memory.list_investigations(user_id_hash, status="active")
    profile = briefing_builder._profile_for_user(__bq_client(), user_id_hash)
    feed = await http_get_feed(user_id_hash=user_id_hash, limit=3)
    return {
        "profile_summary": {
            "regime_style": profile.regime_style,
            "preferred_depth": profile.preferred_depth,
            "risk_posture": profile.risk_posture,
            "watchlist_symbols": profile.watchlist_symbols,
            "portfolio_symbols": profile.portfolio_symbols,
        },
        "active_investigations": [
            {
                "id": inv["investigation_id"],
                "title": inv.get("title"),
                "thesis": inv.get("thesis"),
                "symbols": list(inv.get("symbols") or []),
                "unresolved_questions": list(inv.get("unresolved_questions") or []),
            }
            for inv in investigations[:8]
        ],
        "top_evidence": feed["items"],
    }


@router.get("/watchlist")
async def http_get_watchlist(user_id_hash: str = Query(..., min_length=8)):
    """Watchlist-aware intelligence — candidates whose symbols overlap the user's watchlist."""
    _require_enabled()
    profile = briefing_builder._profile_for_user(__bq_client(), user_id_hash)
    if not profile.watchlist_symbols:
        return {"items": [], "note": "No watchlist symbols configured."}
    candidates = generate_candidates(lookback_hours=72, max_per_kind=40)
    ranked = rank_candidates(candidates, profile)
    overlap_only = [
        r for r in ranked
        if r.gate_passed and any(s.upper() in {x.upper() for x in profile.watchlist_symbols} for s in r.candidate.symbols)
    ]
    return {
        "items": [
            {
                "artifact_id": r.candidate.artifact_id,
                "title": r.candidate.title,
                "summary": r.candidate.summary,
                "base_score": r.base_score,
                "reason_codes": r.reason_codes,
                "symbols": r.candidate.symbols,
            }
            for r in overlap_only[:25]
        ],
    }


# ─── Investigations ──────────────────────────────────────────────────────────

@router.post("/investigation")
async def http_create_investigation(req: InvestigationCreateRequest):
    _require_enabled()
    return investigation_memory.create_investigation(
        user_id_hash=req.user_id_hash,
        title=req.title,
        thesis=req.thesis,
        symbols=req.symbols,
        themes=req.themes,
        tags=req.tags,
        unresolved_questions=req.unresolved_questions,
    )


@router.get("/investigation")
async def http_list_investigations(
    user_id_hash: str = Query(..., min_length=8),
    status: Optional[str] = Query("active"),
):
    _require_enabled()
    return {"investigations": investigation_memory.list_investigations(user_id_hash, status=status)}


@router.patch("/investigation/{investigation_id}")
async def http_update_investigation(investigation_id: str, req: InvestigationUpdateRequest):
    _require_enabled()
    try:
        return investigation_memory.update_investigation(
            investigation_id, user_id_hash=req.user_id_hash, patch=req.patch,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Investigation not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Internal ────────────────────────────────────────────────────────────────

def __bq_client():
    # Defer import so module load is light; FastAPI workers each get their
    # own BigQuery client via get_bigquery_client's internal cache.
    from app.bigquery.client import get_bigquery_client
    return get_bigquery_client()
