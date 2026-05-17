"""
Briefing generators — deterministic template renderers.

Briefing types produced:
  • daily_market_intelligence — last 24h artifact roll-up
  • weekly_regime_brief       — current macro regime state + drift
  • anomaly_summary           — recent anomaly_artifacts roll-up

Each generator returns a dict shaped for `research.generated_briefings`.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.core.config import settings
from app.bigquery.client import get_bigquery_client, fully_qualified

log = structlog.get_logger("quant_engine.briefings.generators")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat()


def _briefing_skeleton(*, briefing_type: str, title: str, period_start: str, period_end: str) -> dict:
    now = _iso(_now())
    return {
        "id": str(uuid.uuid4()),
        "symbol": None,
        "asset_type": None,
        "provider": "deplyze_quant",
        "source_url": None,
        "source_type": "briefing",
        "ingestion_time": now,
        "observation_time": now,
        "lineage_id": f"briefing:{briefing_type}:{period_end}",
        "confidence": 1.0,
        "data_quality_score": 1.0,
        "created_at": now,
        "briefing_type": briefing_type,
        "title": title,
        "summary": "",
        "body": "",
        "period_start": period_start,
        "period_end": period_end,
        "related_symbols": [],
        "tags": [briefing_type, "v3p2"],
        "model_version": "deplyze-briefings-1.0-deterministic",
        "updated_at": now,
    }


def _bq_recent_artifacts(table_fqn: str, since_iso: str, limit: int = 50) -> list[dict]:
    bq = get_bigquery_client()
    sql = f"""
        SELECT artifact_id, artifact_type, title, summary, symbol, related_symbols,
               confidence, severity, created_at, evidence, metrics
        FROM `{table_fqn}`
        WHERE created_at >= TIMESTAMP('{since_iso}')
        ORDER BY created_at DESC
        LIMIT {int(limit)}
    """
    try:
        return [dict(r) for r in bq.query(sql).result()]
    except Exception as e:
        log.warning("briefings.bq_query_failed", table=table_fqn, error=str(e))
        return []


# ─── Daily market intelligence ────────────────────────────────────────────────


def generate_daily_brief() -> dict:
    now = _now()
    since = now - timedelta(hours=24)
    since_iso = _iso(since)

    macro = _bq_recent_artifacts(fully_qualified(settings.BQ_DATASET_ARTIFACTS, "macro_artifacts"), since_iso, 20)
    narrative = _bq_recent_artifacts(fully_qualified(settings.BQ_DATASET_ARTIFACTS, "narrative_artifacts"), since_iso, 20)
    anomalies = _bq_recent_artifacts(fully_qualified(settings.BQ_DATASET_ARTIFACTS, "anomaly_artifacts"), since_iso, 20)
    regime = _bq_recent_artifacts(fully_qualified(settings.BQ_DATASET_ARTIFACTS, "regime_artifacts"), since_iso, 10)
    filings = _bq_recent_artifacts(fully_qualified(settings.BQ_DATASET_ARTIFACTS, "filing_artifacts"), since_iso, 10)

    brief = _briefing_skeleton(
        briefing_type="daily_market_intelligence",
        title=f"Daily market intelligence — {now.date().isoformat()}",
        period_start=since.date().isoformat(),
        period_end=now.date().isoformat(),
    )

    sections: list[str] = []
    related: set[str] = set()

    if macro:
        lines = ["## Macro regimes"]
        for a in macro:
            lines.append(f"- **{a.get('title', a.get('artifact_type'))}** — {a.get('summary', '')[:200]} (confidence {a.get('confidence', 0):.2f})")
        sections.append("\n".join(lines))

    if regime:
        lines = ["## Asset-level regimes"]
        for a in regime:
            lines.append(f"- {a.get('symbol', '—')}: {a.get('title')} — {a.get('summary', '')[:200]}")
            if a.get("symbol"):
                related.add(a["symbol"])
        sections.append("\n".join(lines))

    if narrative:
        lines = ["## Narrative emergence"]
        for a in narrative:
            rs = a.get("related_symbols") or []
            if isinstance(rs, str):
                try:
                    rs = json.loads(rs)
                except Exception:
                    rs = []
            for s in rs[:5]:
                related.add(s)
            lines.append(f"- **{a.get('title')}** — {a.get('summary', '')[:200]}")
        sections.append("\n".join(lines))

    if anomalies:
        lines = ["## Anomalies"]
        for a in anomalies:
            lines.append(f"- {a.get('symbol', '—')}: {a.get('title')} ({a.get('severity', '—')})")
            if a.get("symbol"):
                related.add(a["symbol"])
        sections.append("\n".join(lines))

    if filings:
        lines = ["## Material filings (last 24h)"]
        for a in filings:
            lines.append(f"- {a.get('symbol', '—')}: {a.get('title')} ({a.get('severity', '—')})")
            if a.get("symbol"):
                related.add(a["symbol"])
        sections.append("\n".join(lines))

    if not sections:
        sections.append("_No qualifying artifacts in the last 24 hours._")

    body = "\n\n".join(sections)
    summary = f"Daily roll-up of {len(macro)+len(narrative)+len(anomalies)+len(regime)+len(filings)} V3P2 artifacts since {since.date()}."

    brief["body"] = body
    brief["summary"] = summary
    brief["related_symbols"] = sorted(related)[:25]
    return brief


# ─── Weekly regime brief ──────────────────────────────────────────────────────


def generate_weekly_regime_brief() -> dict:
    now = _now()
    since = now - timedelta(days=7)
    since_iso = _iso(since)

    bq = get_bigquery_client()
    obs_table = fully_qualified(settings.BQ_DATASET_RESEARCH, "macro_observations")
    sql = f"""
        SELECT observation_type, regime_state, title, body, severity, confidence, observation_time
        FROM `{obs_table}`
        WHERE observation_time >= TIMESTAMP('{since_iso}')
        ORDER BY observation_time DESC
    """
    try:
        rows = [dict(r) for r in bq.query(sql).result()]
    except Exception as e:
        log.warning("briefings.weekly_regime_query_failed", error=str(e))
        rows = []

    by_kind: dict[str, dict] = {}
    for r in rows:
        kind = r.get("observation_type") or "unknown"
        if kind not in by_kind:
            by_kind[kind] = r

    brief = _briefing_skeleton(
        briefing_type="weekly_regime_brief",
        title=f"Weekly regime brief — week ending {now.date().isoformat()}",
        period_start=since.date().isoformat(),
        period_end=now.date().isoformat(),
    )

    sections: list[str] = ["## Current regime state"]
    if not by_kind:
        sections.append("_No macro regime observations were written in the past 7 days. Run `/intelligence/macro-regime` to seed the engine._")
    else:
        for kind, r in by_kind.items():
            sections.append(
                f"### {kind.replace('_', ' ').title()}: **{r.get('regime_state')}**\n"
                f"{r.get('body') or r.get('title')}\n"
                f"_Confidence: {r.get('confidence', 0):.2f} · Severity: {r.get('severity', '—')}_"
            )

    body = "\n\n".join(sections)
    brief["summary"] = f"Weekly summary of {len(by_kind)} macro regime states."
    brief["body"] = body
    brief["tags"] = ["weekly_regime_brief", "macro", "v3p2"]
    return brief


# ─── Anomaly summary ──────────────────────────────────────────────────────────


def generate_anomaly_summary() -> dict:
    now = _now()
    since = now - timedelta(days=3)
    since_iso = _iso(since)

    artifacts = _bq_recent_artifacts(
        fully_qualified(settings.BQ_DATASET_ARTIFACTS, "anomaly_artifacts"),
        since_iso,
        limit=100,
    )

    brief = _briefing_skeleton(
        briefing_type="anomaly_summary",
        title=f"Anomaly summary — 3-day window ending {now.date().isoformat()}",
        period_start=since.date().isoformat(),
        period_end=now.date().isoformat(),
    )

    by_symbol: dict[str, list[dict]] = {}
    for a in artifacts:
        sym = a.get("symbol") or "—"
        by_symbol.setdefault(sym, []).append(a)

    sections: list[str] = []
    if not artifacts:
        sections.append("_No qualifying anomalies in the past 3 days._")
    else:
        sections.append(f"## {len(artifacts)} anomalies across {len(by_symbol)} symbols")
        for sym, items in by_symbol.items():
            sections.append(f"### {sym}")
            for a in items[:5]:
                sections.append(f"- {a.get('title')} — {a.get('summary', '')[:200]} ({a.get('severity', '—')})")

    brief["body"] = "\n\n".join(sections)
    brief["summary"] = f"{len(artifacts)} anomalies in {len(by_symbol)} symbols over 3 days."
    brief["related_symbols"] = sorted([s for s in by_symbol.keys() if s != "—"])[:25]
    brief["tags"] = ["anomaly_summary", "v3p2"]
    return brief


# ─── Orchestrator ─────────────────────────────────────────────────────────────


_GENERATORS = {
    "daily_market_intelligence": generate_daily_brief,
    "weekly_regime_brief": generate_weekly_regime_brief,
    "anomaly_summary": generate_anomaly_summary,
}


def _serialize(d: dict) -> dict:
    out = dict(d)
    for k, v in list(out.items()):
        if isinstance(v, (dict, list)):
            out[k] = json.dumps(v)
    return out


async def generate_briefings(
    run_id: str,
    briefing_types: Optional[list[str]] = None,
) -> dict:
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    types = briefing_types or list(_GENERATORS.keys())
    summary = {
        "run_id": run_id,
        "pipeline_name": "briefings",
        "status": "running",
        "started_at": _iso(_now()),
        "completed_at": None,
        "records_processed": 0,
        "artifacts_generated": 0,
        "errors": [],
        "briefings_written": 0,
        "types_requested": types,
    }
    _runs[run_id] = summary

    bq = get_bigquery_client()
    table = fully_qualified(settings.BQ_DATASET_RESEARCH, "generated_briefings")
    rows: list[dict] = []

    for t in types:
        gen = _GENERATORS.get(t)
        if not gen:
            summary["errors"].append({"type": t, "error": "unknown_briefing_type"})
            continue
        try:
            rows.append(gen())
        except Exception as e:
            log.error("briefings.gen_failed", type=t, error=str(e))
            summary["errors"].append({"type": t, "error": str(e)})

    if rows:
        serialized = [_serialize(r) for r in rows]
        errors = bq.insert_rows_json(table, serialized)
        if errors:
            log.error("briefings.bq_errors", errors=errors[:3])
            summary["errors"].append({"table": table, "errors": errors[:3]})
        else:
            summary["briefings_written"] = len(rows)

    summary["records_processed"] = summary["briefings_written"]
    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _iso(_now())
    log.info("briefings.complete", run_id=run_id, written=summary["briefings_written"], types=types)
    return summary
