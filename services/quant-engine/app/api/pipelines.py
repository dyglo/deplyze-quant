"""Pipeline orchestration endpoints."""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

import structlog
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.core.config import settings

log = structlog.get_logger("quant_engine.api.pipelines")
router = APIRouter()

# In-memory run registry (process-scoped; replace with BQ model_runs for persistence)
_runs: dict = {}


class IngestRequest(BaseModel):
    symbols: List[str]
    providers: Optional[List[str]] = None
    timeframe: str = "1day"
    days_back: int = 30


class RefineRequest(BaseModel):
    symbols: List[str]
    dataset: str = "ohlcv_cleaned"


class FeaturesRequest(BaseModel):
    symbols: List[str]
    feature_types: Optional[List[str]] = None  # returns, volatility, momentum, etc.


class ArtifactsRequest(BaseModel):
    symbols: List[str]
    artifact_types: Optional[List[str]] = None


class DailyRunRequest(BaseModel):
    symbols: List[str]
    dry_run: bool = False


class BackfillRequest(BaseModel):
    symbols: List[str]
    start_date: str   # YYYY-MM-DD
    end_date: str     # YYYY-MM-DD
    providers: Optional[List[str]] = None


class EdgarIngestRequest(BaseModel):
    # Either tickers (resolved to CIK via SEC mapping) or pre-resolved CIKs.
    symbols_or_ciks: List[str]
    days_back: Optional[int] = None
    forms: Optional[List[str]] = None


class FredIngestRequest(BaseModel):
    series_ids: Optional[List[str]] = None      # defaults to DEFAULT_SERIES
    since_date: Optional[str] = None            # YYYY-MM-DD
    days_back: int = 1825                       # 5y default if no since_date


class CotIngestRequest(BaseModel):
    markets: Optional[List[str]] = None         # defaults to DEFAULT_MARKETS
    since_date: Optional[str] = None            # YYYY-MM-DD


class RssIngestRequest(BaseModel):
    # Each entry: [feed_name, feed_url]. None → DEFAULT_FEEDS.
    feeds: Optional[List[List[str]]] = None


class CalendarIngestRequest(BaseModel):
    releases: Optional[List[int]] = None        # FRED release_ids; None → DEFAULT_RELEASES
    since_date: Optional[str] = None            # YYYY-MM-DD
    days_ahead: int = 120


class DocumentParseRequest(BaseModel):
    limit: int = 200
    user_agent: Optional[str] = None


class EntityFeatureRequest(BaseModel):
    limit: int = 200
    top_n_per_doc: int = 50


class MacroRegimeRequest(BaseModel):
    pass


class NarrativeIntelligenceRequest(BaseModel):
    lookback_days: int = 180


class BriefingsRequest(BaseModel):
    # Subset of {daily_market_intelligence, weekly_regime_brief, anomaly_summary}.
    # None / empty → generate all three.
    briefing_types: Optional[List[str]] = None


def _new_run(pipeline_name: str) -> dict:
    run_id = str(uuid.uuid4())
    run = {
        "run_id": run_id,
        "pipeline_name": pipeline_name,
        "status": "queued",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
    }
    _runs[run_id] = run
    return run


@router.post("/ingest")
async def ingest(req: IngestRequest, background_tasks: BackgroundTasks):
    """Trigger data ingestion from configured providers."""
    from app.refinery.ingestor import run_ingest
    run = _new_run("ingest")
    background_tasks.add_task(run_ingest, run["run_id"], req.symbols, req.providers, req.timeframe, req.days_back)
    return {"run_id": run["run_id"], "status": "queued", "symbols": req.symbols}


@router.post("/refine")
async def refine(req: RefineRequest, background_tasks: BackgroundTasks):
    """Normalize and deduplicate raw data into cleaned dataset."""
    from app.refinery.refiner import run_refine
    run = _new_run("refine")
    background_tasks.add_task(run_refine, run["run_id"], req.symbols)
    return {"run_id": run["run_id"], "status": "queued"}


@router.post("/features")
async def features(req: FeaturesRequest, background_tasks: BackgroundTasks):
    """Compute feature vectors from cleaned data."""
    from app.features.engine import run_features
    run = _new_run("features")
    background_tasks.add_task(run_features, run["run_id"], req.symbols, req.feature_types)
    return {"run_id": run["run_id"], "status": "queued"}


@router.post("/artifacts")
async def artifacts(req: ArtifactsRequest, background_tasks: BackgroundTasks):
    """Generate research artifacts from feature outputs."""
    from app.artifacts.generator import run_artifacts
    run = _new_run("artifacts")
    background_tasks.add_task(run_artifacts, run["run_id"], req.symbols, req.artifact_types)
    return {"run_id": run["run_id"], "status": "queued"}


@router.post("/daily-run")
async def daily_run(req: DailyRunRequest, background_tasks: BackgroundTasks):
    """Full daily pipeline: ingest → refine → features → artifacts."""
    from app.schedulers.daily import run_daily_pipeline
    run = _new_run("daily_run")
    background_tasks.add_task(run_daily_pipeline, run["run_id"], req.symbols, req.dry_run)
    return {"run_id": run["run_id"], "status": "queued", "dry_run": req.dry_run}


@router.post("/backfill")
async def backfill(req: BackfillRequest, background_tasks: BackgroundTasks):
    """Historical backfill for a date range."""
    from app.schedulers.backfill import run_backfill
    run = _new_run("backfill")
    background_tasks.add_task(run_backfill, run["run_id"], req.symbols, req.start_date, req.end_date)
    return {"run_id": run["run_id"], "status": "queued"}


@router.post("/ingest/edgar")
async def ingest_edgar(req: EdgarIngestRequest, background_tasks: BackgroundTasks):
    """
    V3 Phase 2 · Wave B — trigger SEC EDGAR filings ingestion.

    Resolves tickers to CIKs (or accepts CIKs directly), pulls recent filings
    via the SEC `submissions` API, and writes lineage-tagged rows to
    `raw_public.public_filings_raw` and `raw_documents.document_sources_raw`.

    Requires `EDGAR_USER_AGENT` env var (SEC fair-use policy).
    """
    from app.refinery.filings_ingestor import ingest_edgar_filings
    run = _new_run("edgar_filings_ingest")
    background_tasks.add_task(
        ingest_edgar_filings,
        run["run_id"],
        req.symbols_or_ciks,
        req.days_back,
        req.forms,
    )
    return {
        "run_id": run["run_id"],
        "status": "queued",
        "symbols_or_ciks": req.symbols_or_ciks,
        "days_back": req.days_back,
    }


@router.post("/ingest/fred")
async def ingest_fred(req: FredIngestRequest, background_tasks: BackgroundTasks):
    """
    V3 Phase 2 · Wave C — FRED + Treasury yield macro ingestion.

    Pulls FRED series (defaults to ~30 institutional macro/yield series),
    writes to `raw_public.public_macro_raw` and `cleaned.macro_cleaned`
    (with YoY/MoM changes pre-computed).
    """
    from app.refinery.macro_ingestor import ingest_fred_macro
    run = _new_run("fred_macro_ingest")
    background_tasks.add_task(
        ingest_fred_macro,
        run["run_id"],
        req.series_ids,
        req.since_date,
        req.days_back,
    )
    return {
        "run_id": run["run_id"],
        "status": "queued",
        "series_count": len(req.series_ids) if req.series_ids else "default",
        "since_date": req.since_date,
        "days_back": req.days_back,
    }


@router.post("/ingest/cot")
async def ingest_cot(req: CotIngestRequest, background_tasks: BackgroundTasks):
    """V3 Phase 2 · Wave D — CFTC Commitment of Traders ingestion."""
    from app.refinery.public_ingestors import ingest_cot_reports
    run = _new_run("cot_ingest")
    background_tasks.add_task(ingest_cot_reports, run["run_id"], req.markets, req.since_date)
    return {"run_id": run["run_id"], "status": "queued",
            "markets": len(req.markets) if req.markets else "default"}


@router.post("/ingest/rss")
async def ingest_rss(req: RssIngestRequest, background_tasks: BackgroundTasks):
    """V3 Phase 2 · Wave D — RSS / Atom feed ingestion."""
    from app.refinery.public_ingestors import ingest_rss_feeds
    feeds = [(f[0], f[1]) for f in (req.feeds or []) if len(f) >= 2] or None
    run = _new_run("rss_ingest")
    background_tasks.add_task(ingest_rss_feeds, run["run_id"], feeds)
    return {"run_id": run["run_id"], "status": "queued",
            "feed_count": len(feeds) if feeds else "default"}


@router.post("/ingest/calendar")
async def ingest_calendar(req: CalendarIngestRequest, background_tasks: BackgroundTasks):
    """V3 Phase 2 · Wave D — Economic-release calendar ingestion (FRED-backed)."""
    from app.refinery.public_ingestors import ingest_release_calendar
    run = _new_run("calendar_ingest")
    background_tasks.add_task(
        ingest_release_calendar,
        run["run_id"],
        req.releases,
        req.since_date,
        req.days_ahead,
    )
    return {"run_id": run["run_id"], "status": "queued",
            "release_count": len(req.releases) if req.releases else "default",
            "days_ahead": req.days_ahead}


@router.post("/refine/documents")
async def parse_documents(req: DocumentParseRequest, background_tasks: BackgroundTasks):
    """
    V3 Phase 2 · Wave E — parse unprocessed document_sources_raw rows.

    Pulls up to `limit` documents that have no corresponding parsed_documents_raw
    record, fetches each, extracts text (PDF/HTML/XML/plain), and writes results
    with an extraction_quality score.
    """
    from app.refinery.document_parser import parse_unprocessed_documents
    run = _new_run("document_parse")
    background_tasks.add_task(parse_unprocessed_documents, run["run_id"], limit=req.limit, user_agent=req.user_agent)
    return {"run_id": run["run_id"], "status": "queued", "limit": req.limit}


@router.post("/refine/entities")
async def refine_entities(req: EntityFeatureRequest, background_tasks: BackgroundTasks):
    """
    V3 Phase 2 · Wave F — extract ontology features from parsed documents.

    Reads `parsed_documents_raw` rows with extraction_quality >= 0.3, runs
    deterministic rule-based entity extraction (companies/ETFs/macro/themes/...),
    writes per-(entity, document) rows into `features.ontology_features`.
    """
    from app.refinery.entity_features import extract_entity_features
    run = _new_run("entity_features")
    background_tasks.add_task(extract_entity_features, run["run_id"], limit=req.limit, top_n_per_doc=req.top_n_per_doc)
    return {"run_id": run["run_id"], "status": "queued", "limit": req.limit}


@router.post("/intelligence/macro-regime")
async def intelligence_macro_regime(req: MacroRegimeRequest, background_tasks: BackgroundTasks):
    """
    V3 Phase 2 · Wave G — classify liquidity/inflation/rates/growth regimes
    from cleaned.macro_cleaned and persist features + observations + artifacts.
    """
    from app.intelligence.macro_regime import compute_macro_regimes
    run = _new_run("macro_regime")
    background_tasks.add_task(compute_macro_regimes, run["run_id"])
    return {"run_id": run["run_id"], "status": "queued"}


@router.post("/intelligence/narratives")
async def intelligence_narratives(req: NarrativeIntelligenceRequest, background_tasks: BackgroundTasks):
    """
    V3 Phase 2 · Wave H — narrative theme intelligence over the last
    `lookback_days`. Writes narrative_features + narrative_memory +
    narrative_artifacts + per-document narrative_cleaned rows.
    """
    from app.intelligence.narratives import compute_narrative_intelligence
    run = _new_run("narrative_intelligence")
    background_tasks.add_task(compute_narrative_intelligence, run["run_id"], lookback_days=req.lookback_days)
    return {"run_id": run["run_id"], "status": "queued", "lookback_days": req.lookback_days}


@router.post("/briefings/generate")
async def generate_briefings_route(req: BriefingsRequest, background_tasks: BackgroundTasks):
    """
    V3 Phase 2 · Wave K — generate daily/weekly/anomaly briefings into
    research.generated_briefings. Deterministic, template-based — no LLM
    calls, fully reproducible per as-of date.
    """
    from app.briefings.generators import generate_briefings
    run = _new_run("briefings")
    background_tasks.add_task(generate_briefings, run["run_id"], req.briefing_types)
    return {"run_id": run["run_id"], "status": "queued",
            "types": req.briefing_types or ["daily_market_intelligence", "weekly_regime_brief", "anomaly_summary"]}


@router.get("/status/{run_id}")
async def pipeline_status(run_id: str):
    """Get status of a pipeline run."""
    if run_id not in _runs:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return _runs[run_id]
