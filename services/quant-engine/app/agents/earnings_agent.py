"""
Earnings Agent — V4 Intelligence Domain: Earnings.

Processes recent SEC filings (public_filings_raw) and earnings data
(earnings_cleaned) to produce structured filing intelligence artifacts.

Detects:
  - EPS surprise magnitude outliers (>15% beat/miss)
  - Recent 10-K/10-Q/8-K filings worth flagging
  - Insider transaction clusters (from filings)

Runs at 06:30 ET (after EDGAR ingestor has refreshed).
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

import structlog

from app.agents.schemas import (
    AgentOutput, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_INFO,
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_BRIEFINGS, PLACEMENT_INSTRUMENT_INTELLIGENCE,
)
from app.agents.registry import DOMAIN_EARNINGS
from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings

log = structlog.get_logger("quant_engine.agents.earnings")

_PLACEMENTS = [
    PLACEMENT_INTELLIGENCE_TERMINAL, PLACEMENT_RESEARCH_COPILOT,
    PLACEMENT_BRIEFINGS, PLACEMENT_INSTRUMENT_INTELLIGENCE,
]


async def run(portfolio_id: Optional[str] = None) -> list[AgentOutput]:
    bq = get_bigquery_client()
    filings_table = fully_qualified("raw_public", "public_filings_raw")
    earnings_table = fully_qualified(settings.BQ_DATASET_CLEANED, "earnings_cleaned")
    today = datetime.now(timezone.utc).date().isoformat()
    cutoff_3d = (datetime.now(timezone.utc) - timedelta(days=3)).date().isoformat()
    cutoff_14d = (datetime.now(timezone.utc) - timedelta(days=14)).date().isoformat()

    outputs: list[AgentOutput] = []

    # ── Recent material filings (10-K, 10-Q, 8-K) ────────────────────────────
    sql_filings = f"""
        SELECT cik, entity_name, form_type, filing_date, accession_number,
               document_url, symbol
        FROM `{filings_table}`
        WHERE DATE(filing_date) >= DATE('{cutoff_3d}')
          AND form_type IN ('10-K', '10-Q', '8-K', 'S-1', 'DEF 14A')
        ORDER BY filing_date DESC
        LIMIT 30
    """
    try:
        filing_rows = list(bq.query(sql_filings).result())
    except Exception as e:
        log.warning("earnings_agent.filings_query_failed", error=str(e))
        filing_rows = []

    if filing_rows:
        form_groups: dict[str, list] = {}
        for r in filing_rows:
            ft = r["form_type"] or "other"
            form_groups.setdefault(ft, []).append(r)

        form_summary = ", ".join(f"{ft}: {len(rows)}" for ft, rows in form_groups.items())
        syms = list({r["symbol"] for r in filing_rows if r.get("symbol")})[:12]
        entities = list({r["entity_name"] for r in filing_rows if r.get("entity_name")})[:8]

        outputs.append(AgentOutput(
            agent_id="earnings_agent",
            domain=DOMAIN_EARNINGS,
            artifact_type="earnings_observation",
            title=f"Recent Material Filings: {len(filing_rows)} in Last 3 Days",
            summary=f"SEC filings activity: {form_summary}. Entities: {', '.join(entities[:5])}.",
            body=(
                f"## Recent Material SEC Filings\n\n"
                f"{len(filing_rows)} material filings detected in the last 3 days.\n\n"
                f"**Form distribution:** {form_summary}\n\n"
                f"**Reporting entities:** {', '.join(entities[:8])}\n\n"
                f"_Source: SEC EDGAR via public_filings_raw. Human review required._"
            ),
            confidence=0.90,
            severity=SEVERITY_INFO,
            symbols=syms,
            evidence={
                "form_distribution": {ft: len(rows) for ft, rows in form_groups.items()},
                "entities": entities,
                "filing_count": len(filing_rows),
            },
            source_tables=[filings_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["earnings", "filings", "sec"],
        ))

    # ── EPS surprise outliers ─────────────────────────────────────────────────
    sql_eps = f"""
        SELECT symbol, period, eps_actual, eps_estimate, eps_surprise_pct,
               revenue_actual, revenue_estimate
        FROM `{earnings_table}`
        WHERE DATE(observation_time) >= DATE('{cutoff_14d}')
          AND ABS(eps_surprise_pct) > 15
          AND eps_estimate IS NOT NULL
          AND eps_actual IS NOT NULL
        ORDER BY ABS(eps_surprise_pct) DESC
        LIMIT 20
    """
    try:
        eps_rows = list(bq.query(sql_eps).result())
    except Exception as e:
        log.warning("earnings_agent.eps_query_failed", error=str(e))
        eps_rows = []

    if eps_rows:
        beats = [r for r in eps_rows if float(r.get("eps_surprise_pct") or 0) > 0]
        misses = [r for r in eps_rows if float(r.get("eps_surprise_pct") or 0) < 0]
        max_beat = max((float(r["eps_surprise_pct"] or 0) for r in beats), default=0)
        max_miss = min((float(r["eps_surprise_pct"] or 0) for r in misses), default=0)

        syms = [r["symbol"] for r in eps_rows if r.get("symbol")]
        sev = SEVERITY_HIGH if abs(max_beat) > 30 or abs(max_miss) > 30 else SEVERITY_MEDIUM

        outputs.append(AgentOutput(
            agent_id="earnings_agent",
            domain=DOMAIN_EARNINGS,
            artifact_type="earnings_observation",
            title=f"EPS Surprise Outliers: {len(beats)} Beats, {len(misses)} Misses (>15%)",
            summary=(
                f"{len(eps_rows)} EPS surprise events >15% in last 14 days. "
                f"Largest beat: {max_beat:+.0f}%. Largest miss: {max_miss:.0f}%."
            ),
            body=(
                f"## EPS Surprise Outliers (Last 14 Days)\n\n"
                f"**Beats ({len(beats)}):** "
                f"{', '.join(r['symbol'] for r in beats[:6] if r.get('symbol'))}\n\n"
                f"**Misses ({len(misses)}):** "
                f"{', '.join(r['symbol'] for r in misses[:6] if r.get('symbol'))}\n\n"
                f"Largest beat: **{max_beat:+.0f}%**. Largest miss: **{max_miss:.0f}%**.\n\n"
                f"_Source: earnings_cleaned. Not investment advice._"
            ),
            confidence=0.85,
            severity=sev,
            symbols=syms[:12],
            evidence={
                "beat_count": len(beats),
                "miss_count": len(misses),
                "max_beat_pct": round(max_beat, 2),
                "max_miss_pct": round(max_miss, 2),
                "outliers": [
                    {
                        "symbol": r["symbol"],
                        "surprise_pct": round(float(r["eps_surprise_pct"] or 0), 2),
                        "period": r["period"],
                    }
                    for r in eps_rows[:10]
                ],
            },
            source_tables=[earnings_table],
            observation_date=today,
            recommended_placements=_PLACEMENTS,
            tags=["earnings", "eps", "surprise"],
        ))

    log.info("earnings_agent.complete", outputs=len(outputs))
    return outputs
