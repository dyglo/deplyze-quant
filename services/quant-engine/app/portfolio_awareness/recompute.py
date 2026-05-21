"""
Portfolio Awareness server-side recompute scheduler.

Enumerates portfolios stale beyond max_age_hours, reads holdings from
Firestore (portfolios/{pid}/holdings), fetches OHLCV close prices from
BigQuery cleaned.ohlcv_cleaned, computes the same aggregates the frontend
produces (KPIs, contributors, sector breakdown, risk decomposition, monitor
probes, narrative lines), and writes via the existing write_snapshot() writer.

Firestore schema (read-only here):
  portfolios/{portfolioId}              — doc: uid, workspaceId, benchmarkId
  portfolios/{portfolioId}/holdings/{}  — doc: symbol, weight?, sector, assetClass

Called by:
  POST /portfolio-awareness/recompute (authenticated Cloud Scheduler invoker)
  Cloud Scheduler daily at 04:00 UTC

Conventions that match the frontend analytics:
  - Log returns: ln(price[t] / price[t-1])
  - Annualisation: 252 trading days
  - Volatility: sample stddev (ddof=1) × sqrt(252) — same as TS annualisedVol
  - Total return: exp(sum(log_returns)) − 1 — same as expDec(sum(logReturns))
  - Contribution: effective_weight × total_return (linear approx)
  - HHI: sum(w_i^2) over normalised weights
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import structlog
from google.cloud import bigquery
from google.cloud import firestore as fs

from app.bigquery.client import get_bigquery_client, fully_qualified
from app.core.config import settings
from app.portfolio_awareness.writer import SynthesisPayload, write_snapshot

log = structlog.get_logger("quant_engine.portfolio_awareness.recompute")

ARTIFACTS_DS = settings.BQ_DATASET_ARTIFACTS
CLEANED_DS = settings.BQ_DATASET_CLEANED
TABLE_SYNTHESIS = "portfolio_awareness_synthesis"
TABLE_OHLCV = "ohlcv_cleaned"
TRADING_DAYS = 252
DEFAULT_LOOKBACK_DAYS = 252


# ─── Report ──────────────────────────────────────────────────────────────────

@dataclass
class RecomputeReport:
    scanned: int = 0
    recomputed: int = 0
    skipped: int = 0
    errors: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scanned": self.scanned,
            "recomputed": self.recomputed,
            "skipped": self.skipped,
            "errors": self.errors,
        }


# ─── Firestore client ────────────────────────────────────────────────────────

_fs_client: Optional[fs.Client] = None


def _get_firestore() -> fs.Client:
    global _fs_client
    if _fs_client is None:
        _fs_client = fs.Client(project=settings.GCP_PROJECT_ID)
    return _fs_client


def _load_portfolio_meta(portfolio_id: str) -> Dict[str, Any]:
    """Read top-level portfolio doc for benchmark_id, uid, workspace_id."""
    try:
        doc = _get_firestore().collection("portfolios").document(portfolio_id).get()
        if not doc.exists:
            return {}
        data = doc.to_dict() or {}
        return {
            "benchmark_id": data.get("benchmarkId"),
            "uid": data.get("uid"),
            "workspace_id": data.get("workspaceId"),
        }
    except Exception as exc:
        log.warning("recompute.firestore_meta_failed", portfolio_id=portfolio_id, error=str(exc))
        return {}


def _load_holdings_from_firestore(portfolio_id: str) -> List[Dict[str, Any]]:
    """
    Read holdings from Firestore portfolios/{pid}/holdings.
    Returns a list of dicts with keys: symbol, weight (may be None),
    assetClass, sector, name.
    """
    try:
        snap = (
            _get_firestore()
            .collection("portfolios")
            .document(portfolio_id)
            .collection("holdings")
            .get()
        )
    except Exception as exc:
        log.warning("recompute.firestore_holdings_failed", portfolio_id=portfolio_id, error=str(exc))
        return []

    result: List[Dict[str, Any]] = []
    for doc in snap:
        data = doc.to_dict()
        if not data:
            continue
        symbol = str(data.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        weight = data.get("weight")
        result.append({
            "symbol": symbol,
            "weight": float(weight) if isinstance(weight, (int, float)) and weight > 0 else None,
            "assetClass": str(data.get("assetClass", "equity")),
            "sector": str(data.get("sector") or "Unclassified"),
            "name": str(data.get("name") or symbol),
        })
    return result


# ─── Stale portfolio detection ───────────────────────────────────────────────

def _find_stale_portfolios(
    client: bigquery.Client,
    max_age_hours: int,
    limit: int,
    portfolio_ids: Optional[List[str]] = None,
) -> List[str]:
    """
    Return portfolio_ids from the synthesis table that have not had a snapshot
    within the last max_age_hours. When portfolio_ids is provided, the scan
    is restricted to that list (still enforces the staleness threshold).
    """
    table = f"`{settings.GCP_PROJECT_ID}.{ARTIFACTS_DS}.{TABLE_SYNTHESIS}`"
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

    if portfolio_ids:
        pid_clause = ", ".join(f"'{p}'" for p in portfolio_ids)
        q = f"""
            SELECT portfolio_id, MAX(generated_at) AS last_generated
            FROM {table}
            WHERE portfolio_id IN ({pid_clause})
              AND is_test = FALSE
            GROUP BY portfolio_id
        """
        rows = list(client.query(q).result())
        seen: Dict[str, datetime] = {}
        for r in rows:
            last = r.last_generated
            if isinstance(last, datetime):
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                seen[r.portfolio_id] = last

        stale = []
        for pid in portfolio_ids:
            last = seen.get(pid)
            if last is None or last < cutoff:
                stale.append(pid)
        return stale[:limit]

    # No filter — find all stale portfolios from the synthesis table.
    q = f"""
        SELECT portfolio_id, MAX(generated_at) AS last_generated
        FROM {table}
        WHERE is_test = FALSE
        GROUP BY portfolio_id
        HAVING MAX(generated_at) < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {max_age_hours} HOUR)
        ORDER BY MAX(generated_at) ASC
        LIMIT {limit}
    """
    rows = list(client.query(q).result())
    return [r.portfolio_id for r in rows]


# ─── OHLCV price loader ──────────────────────────────────────────────────────

def _load_ohlcv_batch(
    client: bigquery.Client,
    symbols: List[str],
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> Dict[str, List[float]]:
    """
    Fetch daily close prices for a list of symbols from cleaned.ohlcv_cleaned.
    Returns {symbol: [price, ...]} ordered by observation_time ASC.
    Uses adjusted_close when available, falls back to close.
    """
    if not symbols:
        return {}

    sym_list = ", ".join(f"'{s}'" for s in symbols)
    table = f"`{fully_qualified(CLEANED_DS, TABLE_OHLCV)}`"
    q = f"""
        SELECT symbol, observation_time,
               COALESCE(adjusted_close, close) AS close
        FROM {table}
        WHERE symbol IN ({sym_list})
          AND observation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
          AND COALESCE(adjusted_close, close) > 0
        ORDER BY symbol, observation_time ASC
    """
    rows = list(client.query(q).result())
    result: Dict[str, List[float]] = {}
    for r in rows:
        sym = r.symbol
        if sym not in result:
            result[sym] = []
        result[sym].append(float(r.close))
    return result


# ─── Analytics helpers ───────────────────────────────────────────────────────

def _log_returns(prices: List[float]) -> List[float]:
    out: List[float] = []
    for i in range(1, len(prices)):
        a, b = prices[i - 1], prices[i]
        if a > 0 and b > 0:
            out.append(math.log(b / a))
    return out


def _total_return(prices: List[float]) -> float:
    """exp(sum(log_returns)) − 1 — matches TS expDec(sum(logReturns))."""
    rets = _log_returns(prices)
    if not rets:
        return 0.0
    return math.exp(sum(rets)) - 1


def _annualised_vol(rets: List[float]) -> float:
    """
    Sample stddev (ddof=1) × sqrt(252).
    Matches TS annualisedVol which uses (rets.length − 1) denominator.
    """
    n = len(rets)
    if n < 5:
        return 0.0
    mean = sum(rets) / n
    sse = sum((r - mean) ** 2 for r in rets)
    return math.sqrt(sse / (n - 1)) * math.sqrt(TRADING_DAYS)


def _sharpe(rets: List[float], risk_free: float = 0.045) -> float:
    """Annualised Sharpe: (annualised_return − rf) / annualised_vol."""
    n = len(rets)
    if n < 5:
        return 0.0
    mean_daily = sum(rets) / n
    ann_ret = math.exp(mean_daily * TRADING_DAYS) - 1
    vol = _annualised_vol(rets)
    if vol <= 0:
        return 0.0
    return (ann_ret - risk_free) / vol


def _max_drawdown(prices: List[float]) -> float:
    """Peak-to-trough drawdown as a negative decimal (e.g. -0.15)."""
    if len(prices) < 2:
        return 0.0
    peak = prices[0]
    mdd = 0.0
    for p in prices:
        if p > peak:
            peak = p
        dd = (p - peak) / peak if peak > 0 else 0.0
        if dd < mdd:
            mdd = dd
    return mdd


def _hhi(weights: List[float]) -> float:
    """Herfindahl-Hirschman Index over normalised weights."""
    total = sum(weights)
    if total <= 0:
        return 0.0
    nw = [w / total for w in weights]
    return sum(w * w for w in nw)


def _normalise_weights(
    holdings: List[Dict[str, Any]],
    prices: Dict[str, List[float]],
) -> Dict[str, float]:
    """
    Derive effective per-holding weights summing to 1.
    Priority:
      1. Explicit weight field (> 0) — normalised to 1.
      2. Equal weight among holdings that have OHLCV price history.
    Holdings with neither explicit weight nor price data are omitted.
    """
    explicit: Dict[str, float] = {}
    no_weight: List[str] = []

    for h in holdings:
        sym = h["symbol"]
        w = h.get("weight")
        if isinstance(w, float) and w > 0:
            explicit[sym] = w
        elif sym in prices and len(prices[sym]) >= 2:
            no_weight.append(sym)

    if not explicit and not no_weight:
        return {}

    if not no_weight:
        total = sum(explicit.values())
        return {sym: w / total for sym, w in explicit.items() if total > 0}

    if not explicit:
        n = len(no_weight)
        return {sym: 1.0 / n for sym in no_weight}

    # Mixed: normalise explicit first, remaining goes to equal-weight bucket.
    total_exp = sum(explicit.values())
    if total_exp >= 1.0:
        return {sym: w / total_exp for sym, w in explicit.items()}
    remaining = 1.0 - total_exp
    eq = remaining / len(no_weight)
    result = {sym: w for sym, w in explicit.items()}
    for sym in no_weight:
        result[sym] = eq
    return result


# ─── KPIs ────────────────────────────────────────────────────────────────────

def _compute_kpis(
    holdings: List[Dict[str, Any]],
    weights: Dict[str, float],
    prices: Dict[str, List[float]],
    benchmark_prices: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """
    Portfolio-level KPIs: totalReturn, annVol, sharpe, maxDrawdown.
    Portfolio return = weighted sum of individual holding returns.
    Vol / Sharpe / MDD computed from daily portfolio log returns.
    """
    # Per-holding returns
    holding_rets: Dict[str, float] = {}
    for h in holdings:
        sym = h["symbol"]
        p = prices.get(sym, [])
        if len(p) >= 2 and sym in weights:
            holding_rets[sym] = _total_return(p)

    if not holding_rets:
        return {
            "totalReturn": 0.0,
            "annVol": 0.0,
            "sharpe": 0.0,
            "maxDrawdown": 0.0,
            "holdings": len(holdings),
        }

    total_return = sum(holding_rets[sym] * weights[sym] for sym in holding_rets)

    # Daily portfolio return series (zip all holdings' daily returns)
    min_len = min(len(prices[sym]) for sym in holding_rets)
    port_prices: List[float] = []
    for i in range(min_len):
        day_price = sum(
            prices[sym][i] * weights[sym]
            for sym in holding_rets
            if len(prices[sym]) > i
        )
        port_prices.append(day_price)

    port_rets = _log_returns(port_prices)
    ann_vol = _annualised_vol(port_rets)
    sharpe = _sharpe(port_rets)
    mdd = _max_drawdown(port_prices)

    benchmark_total = None
    if benchmark_prices and len(benchmark_prices) >= 2:
        benchmark_total = _total_return(benchmark_prices)

    result: Dict[str, Any] = {
        "totalReturn": round(total_return, 6),
        "annVol": round(ann_vol, 6),
        "sharpe": round(sharpe, 4),
        "maxDrawdown": round(mdd, 6),
        "holdings": len(holdings),
    }
    if benchmark_total is not None:
        result["benchmarkTotalReturn"] = round(benchmark_total, 6)
        result["activeReturn"] = round(total_return - benchmark_total, 6)
    return result


# ─── Contributors ─────────────────────────────────────────────────────────────

def _compute_contributors(
    holdings: List[Dict[str, Any]],
    weights: Dict[str, float],
    prices: Dict[str, List[float]],
) -> Dict[str, Any]:
    """
    Contribution per holding = effective_weight × total_return.
    Returns top (positive) and bottom (negative) rows, max 8/6.
    """
    rows = []
    for h in holdings:
        sym = h["symbol"]
        w = weights.get(sym, 0.0)
        p = prices.get(sym, [])
        if w <= 0 or len(p) < 2:
            continue
        tr = _total_return(p)
        rows.append({"symbol": sym, "weight": round(w, 6), "contribution": round(w * tr, 6)})

    rows.sort(key=lambda r: r["contribution"], reverse=True)
    top = [r for r in rows if r["contribution"] >= 0][:8]
    bottom = [r for r in rows if r["contribution"] < 0]
    bottom.sort(key=lambda r: r["contribution"])
    bottom = bottom[:6]
    return {"top": top, "bottom": bottom}


# ─── Sector breakdown ─────────────────────────────────────────────────────────

def _compute_sector_breakdown(
    holdings: List[Dict[str, Any]],
    weights: Dict[str, float],
    prices: Dict[str, List[float]],
) -> Dict[str, Any]:
    """Roll up contribution and weight by sector."""
    sectors: Dict[str, Dict[str, Any]] = {}
    for h in holdings:
        sym = h["symbol"]
        sector = h.get("sector") or "Unclassified"
        w = weights.get(sym, 0.0)
        p = prices.get(sym, [])
        tr = _total_return(p) if len(p) >= 2 else 0.0
        contrib = w * tr

        if sector not in sectors:
            sectors[sector] = {
                "sector": sector,
                "weight": 0.0,
                "contribution": 0.0,
                "members": 0,
            }
        sectors[sector]["weight"] += w
        sectors[sector]["contribution"] += contrib
        sectors[sector]["members"] += 1

    rows = sorted(sectors.values(), key=lambda r: r["weight"], reverse=True)
    for r in rows:
        r["weight"] = round(r["weight"], 6)
        r["contribution"] = round(r["contribution"], 6)
    return {"sectors": rows[:12]}


# ─── Risk decomposition ──────────────────────────────────────────────────────

_STRESS_HIGH_VOL = 0.35
_STRESS_MDD = -0.20
_STRESS_UNDERPERF = -0.10
_STRESS_CONCENTRATION = 2.5  # weight / (1/n) ratio threshold


def _compute_risk_decomposition(
    holdings: List[Dict[str, Any]],
    weights: Dict[str, float],
    prices: Dict[str, List[float]],
    kpis: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Risk decomposition: HHI, per-holding stress flags, sector risk share.
    Stress dimensions match clientStress.ts: volatility, drawdown,
    concentration, underperformance, recent_weakness.
    """
    weight_vals = [weights[sym] for sym in weights]
    hhi = _hhi(weight_vals)
    n = len(weight_vals)
    eq_weight = 1.0 / n if n > 0 else 0.0

    holding_stress = []
    dim_flags: Dict[str, List[str]] = {
        "volatility": [],
        "drawdown": [],
        "concentration": [],
        "underperformance": [],
        "recent_weakness": [],
    }

    all_ret21: Dict[str, float] = {}
    for h in holdings:
        sym = h["symbol"]
        p = prices.get(sym, [])
        if len(p) >= 22:
            all_ret21[sym] = _total_return(p[-22:])

    median_ret21: float = 0.0
    if all_ret21:
        vals = sorted(all_ret21.values())
        mid = len(vals) // 2
        median_ret21 = vals[mid]

    for h in holdings:
        sym = h["symbol"]
        w = weights.get(sym, 0.0)
        if w <= 0:
            continue
        p = prices.get(sym, [])
        dims_hit: List[str] = []
        severity = 0.0

        if len(p) >= 30:
            rets = _log_returns(p)
            vol = _annualised_vol(rets)
            if vol > _STRESS_HIGH_VOL:
                dims_hit.append("volatility")
                severity += min((vol - _STRESS_HIGH_VOL) / _STRESS_HIGH_VOL, 1.0)
                dim_flags["volatility"].append(sym)

            mdd = _max_drawdown(p)
            if mdd < _STRESS_MDD:
                dims_hit.append("drawdown")
                severity += min(abs(mdd - _STRESS_MDD) / abs(_STRESS_MDD), 1.0)
                dim_flags["drawdown"].append(sym)

            tr = _total_return(p)
            if tr < _STRESS_UNDERPERF:
                dims_hit.append("underperformance")
                severity += min(abs(tr - _STRESS_UNDERPERF) / abs(_STRESS_UNDERPERF), 1.0)
                dim_flags["underperformance"].append(sym)

        if eq_weight > 0 and w / eq_weight > _STRESS_CONCENTRATION:
            dims_hit.append("concentration")
            severity += min((w / eq_weight - _STRESS_CONCENTRATION) / _STRESS_CONCENTRATION, 1.0)
            dim_flags["concentration"].append(sym)

        if sym in all_ret21:
            r21 = all_ret21[sym]
            if r21 < median_ret21 - 0.10:
                dims_hit.append("recent_weakness")
                severity += 0.5
                dim_flags["recent_weakness"].append(sym)

        if dims_hit:
            holding_stress.append({
                "symbol": sym,
                "weight": round(w, 6),
                "intensity": round(min(severity / max(len(dims_hit), 1), 1.0), 4),
                "count": len(dims_hit),
                "dimensions": dims_hit,
            })

    holding_stress.sort(key=lambda r: (r["count"], r["intensity"]), reverse=True)

    # Sector volatility share
    sector_risk: List[Dict[str, Any]] = []
    sector_vols: Dict[str, float] = {}
    sector_weights: Dict[str, float] = {}
    for h in holdings:
        sym = h["symbol"]
        sector = h.get("sector") or "Unclassified"
        w = weights.get(sym, 0.0)
        if w <= 0:
            continue
        p = prices.get(sym, [])
        vol = _annualised_vol(_log_returns(p)) if len(p) >= 30 else 0.0
        sector_vols[sector] = sector_vols.get(sector, 0.0) + w * vol
        sector_weights[sector] = sector_weights.get(sector, 0.0) + w

    total_port_vol = sum(sector_vols.values())
    for sector, wv in sorted(sector_vols.items(), key=lambda x: x[1], reverse=True)[:10]:
        sector_risk.append({
            "sector": sector,
            "weight": round(sector_weights.get(sector, 0.0), 6),
            "contribPct": round(wv / total_port_vol, 6) if total_port_vol > 0 else 0.0,
        })

    # Stress dimension summary
    dim_labels = {
        "volatility": "Volatility",
        "drawdown": "Drawdown",
        "concentration": "Concentration",
        "underperformance": "Underperformance",
        "recent_weakness": "Recent Weakness",
    }
    stress_dimensions = [
        {
            "key": k,
            "label": dim_labels[k],
            "flagged": len(v),
            "meanSeverity": round(
                sum(
                    s["intensity"]
                    for s in holding_stress
                    if k in s["dimensions"]
                ) / len(v),
                4,
            ) if v else 0.0,
        }
        for k, v in dim_flags.items()
        if v
    ]

    stressed_count = sum(1 for s in holding_stress if s["count"] >= 2)

    return {
        "hhi": round(hhi, 6),
        "stressedCount": stressed_count,
        "holdingStress": holding_stress[:12],
        "sectorRisk": sector_risk,
        "stressDimensions": stress_dimensions,
    }


# ─── Monitor probes ───────────────────────────────────────────────────────────

def _compute_monitor_probes(
    holdings: List[Dict[str, Any]],
    weights: Dict[str, float],
    kpis: Dict[str, Any],
    risk: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Produce up to 5 institutional monitor probes from computed metrics.
    Categories: concentration, volatility, drawdown, diversification, breadth.
    Mirrors the priority ordering of the frontend buildMonitorProbes().
    """
    probes: List[Dict[str, Any]] = []

    hhi = kpis.get("hhi") or risk.get("hhi", 0.0)
    ann_vol = kpis.get("annVol", 0.0)
    mdd = kpis.get("maxDrawdown", 0.0)
    n = len(holdings)
    stressed = risk.get("stressedCount", 0)

    # 1 — Concentration
    if hhi > 0.20:
        probes.append({
            "id": "conc-hhi-high",
            "category": "concentration",
            "severity": "high" if hhi > 0.30 else "medium",
            "title": "Concentration risk above institutional threshold",
            "rationale": f"HHI of {hhi:.3f} indicates the portfolio is highly concentrated — diversification may limit idiosyncratic exposure.",
            "evidence": [
                {"label": "HHI", "value": f"{hhi:.3f}"},
                {"label": "Holdings", "value": str(n)},
            ],
        })

    # 2 — Volatility
    if ann_vol > 0.25:
        sev = "high" if ann_vol > 0.40 else "medium"
        probes.append({
            "id": "vol-elevated",
            "category": "volatility",
            "severity": sev,
            "title": "Portfolio volatility in elevated range",
            "rationale": f"Annualised vol of {ann_vol:.1%} exceeds the moderate threshold — risk-adjusted return measurement is sensitive to this regime.",
            "evidence": [
                {"label": "Ann. Vol", "value": f"{ann_vol:.1%}"},
            ],
        })

    # 3 — Drawdown
    if mdd < -0.15:
        sev = "high" if mdd < -0.25 else "medium"
        probes.append({
            "id": "mdd-watch",
            "category": "drawdown",
            "severity": sev,
            "title": "Maximum drawdown warrants monitoring",
            "rationale": f"The portfolio experienced a {abs(mdd):.1%} peak-to-trough decline over the look-back window.",
            "evidence": [
                {"label": "Max Drawdown", "value": f"{mdd:.1%}"},
            ],
        })

    # 4 — Multi-dim stress
    if stressed > 0:
        top_symbols = [s["symbol"] for s in risk.get("holdingStress", []) if s["count"] >= 2][:3]
        probes.append({
            "id": "multi-stress",
            "category": "diversification",
            "severity": "high" if stressed >= 3 else "medium",
            "title": f"{stressed} position{'s' if stressed != 1 else ''} flagged across multiple stress dimensions",
            "rationale": "Holdings facing simultaneous volatility, drawdown and/or underperformance signals may warrant closer attention.",
            "evidence": [
                {"label": "Stressed holdings", "value": str(stressed)},
                {"label": "Symbols", "value": ", ".join(top_symbols) if top_symbols else "—"},
            ],
            "symbols": top_symbols,
        })

    # 5 — Breadth (low diversification)
    if n < 5:
        probes.append({
            "id": "breadth-low",
            "category": "breadth",
            "severity": "medium",
            "title": "Portfolio breadth is low",
            "rationale": f"With only {n} holding{'s' if n != 1 else ''}, idiosyncratic events can have outsized portfolio-level impact.",
            "evidence": [
                {"label": "Holdings", "value": str(n)},
            ],
        })

    return sorted(probes, key=lambda p: {"high": 0, "medium": 1, "low": 2}[p["severity"]])[:6]


# ─── Narrative formatters ─────────────────────────────────────────────────────
# Python ports of narrateHero / narrateReturnDecomposition /
# narrateRiskDecomposition from src/lib/portfolio/sectionNarratives.ts.
# Voice rules: second-person possessive, reflective, never directive.

def _pct(v: float, signed: bool = True, dp: int = 2) -> str:
    if not math.isfinite(v):
        return "—"
    s = f"{v * 100:.{dp}f}%"
    return f"+{s}" if signed and v > 0 else s


def _narrate_hero(kpis: Dict[str, Any]) -> List[Dict[str, Any]]:
    tr = kpis.get("totalReturn", 0.0) or 0.0
    bm = kpis.get("benchmarkTotalReturn")
    bm_id = kpis.get("benchmarkId", "benchmark")
    sharpe = kpis.get("sharpe", 0.0) or 0.0
    mdd = kpis.get("maxDrawdown", 0.0) or 0.0
    lines: List[Dict[str, Any]] = []

    if bm is not None:
        active = tr - bm
        verb = "ahead of" if active >= 0 else "behind"
        lines.append({
            "emphasis": True,
            "text": f"Your portfolio is {_pct(tr)} on the period — {verb} {bm_id} by {_pct(abs(active), False)}.",
        })
    else:
        lines.append({
            "emphasis": True,
            "text": f"Your portfolio is {_pct(tr)} on the period.",
        })

    sharpe_read = (
        "strong risk-adjusted" if sharpe >= 1 else
        "moderate risk-adjusted" if sharpe >= 0.5 else
        "weak risk-adjusted"
    )
    lines.append({
        "text": f"Sharpe of {sharpe:.2f} reflects {sharpe_read} performance; the deepest drawdown experienced was {_pct(abs(mdd), False)}.",
    })
    return lines


def _narrate_return_decomp(
    contributors: Dict[str, Any],
    kpis: Dict[str, Any],
    sector_breakdown: Dict[str, Any],
) -> List[Dict[str, Any]]:
    tr = kpis.get("totalReturn", 0.0) or 0.0
    top = contributors.get("top", [])
    bottom = contributors.get("bottom", [])
    sectors = sector_breakdown.get("sectors", [])
    lines: List[Dict[str, Any]] = []

    if top:
        best = top[0]
        top3 = top[:3]
        top3_contrib = sum(r["contribution"] for r in top3)
        names = ", ".join(r["symbol"] for r in top3)
        lines.append({
            "emphasis": True,
            "text": (
                f"Your strongest contributor on the period was {best['symbol']} "
                f"({_pct(best['contribution'])} of portfolio return). "
                f"The top three names — {names} — together accounted for {_pct(top3_contrib)}."
            ),
        })

    top_sector = next(
        (s for s in sectors if s.get("sector") and s["sector"] != "Unclassified"),
        None,
    )
    if top_sector and tr != 0:
        share = top_sector["contribution"] / tr
        lines.append({
            "text": (
                f"{top_sector['sector']} drove the largest sector contribution at "
                f"{_pct(top_sector['contribution'])}, roughly "
                f"{_pct(abs(share), False, 0)} of the portfolio's total return."
            ),
        })

    if bottom:
        worst = bottom[0]
        neg_count = len(bottom)
        lines.append({
            "text": (
                f"{neg_count} of your positions detracted from the period — "
                f"the weakest was {worst['symbol']} at {_pct(worst['contribution'])}."
            ),
        })
    elif top:
        lines.append({"text": "Every position posted a positive contribution on the period — a rare breadth."})

    return lines


def _narrate_risk_decomp(
    kpis: Dict[str, Any],
    risk: Dict[str, Any],
) -> List[Dict[str, Any]]:
    ann_vol = kpis.get("annVol", 0.0) or 0.0
    mdd = kpis.get("maxDrawdown", 0.0) or 0.0
    hhi = risk.get("hhi", 0.0) or 0.0
    n_holdings = kpis.get("holdings", 1) or 1
    stressed = risk.get("stressedCount", 0) or 0
    sector_risk = risk.get("sectorRisk", [])
    lines: List[Dict[str, Any]] = []

    v_read = (
        "elevated" if ann_vol > 0.30 else
        "moderate" if ann_vol > 0.18 else
        "subdued" if ann_vol > 0 else "unmeasured"
    )
    lines.append({
        "emphasis": True,
        "text": (
            f"Annualised volatility is {_pct(ann_vol, False)} — {v_read} for a diversified equity book — "
            f"and the deepest drawdown experienced is {_pct(abs(mdd), False)}."
        ),
    })

    hhi_read = (
        "highly concentrated" if hhi > 0.20 else
        "moderately concentrated" if hhi > 0.12 else
        "broadly diversified"
    )
    lines.append({
        "text": (
            f"Your weights are {hhi_read} (HHI {hhi:.3f}); "
            f"{stressed} of {n_holdings} positions face multi-dimensional stress signals."
        ),
    })

    if sector_risk and sector_risk[0].get("contribPct", 0) > 0.25:
        top_s = sector_risk[0]
        lines.append({
            "text": (
                f"{top_s['sector']} carries {_pct(top_s['contribPct'], False, 0)} of your weighted volatility — "
                "a single-sector dependence worth monitoring."
            ),
        })

    return lines


def _build_narrative_lines(
    kpis: Dict[str, Any],
    contributors: Dict[str, Any],
    sector_breakdown: Dict[str, Any],
    risk: Dict[str, Any],
) -> Dict[str, List[str]]:
    """
    Produce narrative_lines matching the frontend's sectionNarratives output.
    Keys match the section IDs used by the awareness page:
      hero, returnDecomposition, riskDecomposition
    """
    def to_strings(lines: List[Dict[str, Any]]) -> List[str]:
        return [l["text"] for l in lines if l.get("text")]

    return {
        "hero": to_strings(_narrate_hero(kpis)),
        "returnDecomposition": to_strings(_narrate_return_decomp(contributors, kpis, sector_breakdown)),
        "riskDecomposition": to_strings(_narrate_risk_decomp(kpis, risk)),
    }


# ─── Per-portfolio recompute ──────────────────────────────────────────────────

def _recompute_one(
    bq: bigquery.Client,
    portfolio_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Run the full recompute for one portfolio. Returns the write_snapshot()
    result dict on success, or None when the portfolio has no usable holdings.
    Raises on BQ / Firestore hard failures so the caller can record the error.
    """
    meta = _load_portfolio_meta(portfolio_id)
    holdings = _load_holdings_from_firestore(portfolio_id)

    if not holdings:
        log.info("recompute.no_holdings", portfolio_id=portfolio_id)
        return None

    symbols = [h["symbol"] for h in holdings]
    prices = _load_ohlcv_batch(bq, symbols)
    weights = _normalise_weights(holdings, prices)

    if not weights:
        log.info("recompute.no_weights_resolved", portfolio_id=portfolio_id)
        return None

    # Benchmark prices (optional)
    bm_id = meta.get("benchmark_id")
    bm_prices: Optional[List[float]] = None
    if bm_id:
        bm_data = _load_ohlcv_batch(bq, [bm_id])
        bm_prices = bm_data.get(bm_id)

    kpis = _compute_kpis(holdings, weights, prices, bm_prices)
    if bm_id:
        kpis["benchmarkId"] = bm_id
    contributors = _compute_contributors(holdings, weights, prices)
    sector_breakdown = _compute_sector_breakdown(holdings, weights, prices)
    risk = _compute_risk_decomposition(holdings, weights, prices, kpis)
    monitor_probes = _compute_monitor_probes(holdings, weights, kpis, risk)
    narrative_lines = _build_narrative_lines(kpis, contributors, sector_breakdown, risk)

    payload = SynthesisPayload(
        portfolio_id=portfolio_id,
        benchmark_id=bm_id,
        uid=meta.get("uid"),
        workspace_id=meta.get("workspace_id"),
        kpis=kpis,
        contributors=contributors,
        sector_breakdown=sector_breakdown,
        risk_decomposition=risk,
        monitor_probes=monitor_probes,
        narrative_lines=narrative_lines,
        holding_symbols=symbols,
        source_tables=["cleaned.ohlcv_cleaned", "firestore.portfolios", "firestore.holdings"],
        is_test=False,
    )

    result = write_snapshot(payload)
    log.info(
        "recompute.portfolio_written",
        portfolio_id=portfolio_id,
        holdings=len(holdings),
        symbols_with_data=len(prices),
    )
    return result


# ─── Public entry point ───────────────────────────────────────────────────────

def recompute_stale_portfolios(
    max_age_hours: int = 18,
    limit: int = 50,
    portfolio_ids: Optional[List[str]] = None,
) -> RecomputeReport:
    """
    Find stale portfolios, recompute their awareness snapshots, and persist
    them via write_snapshot().

    Args:
        max_age_hours: Re-snapshot portfolios whose last snapshot is older
            than this threshold.
        limit: Maximum number of portfolios to process per run.
        portfolio_ids: Optional explicit list — bypasses the BQ stale scan
            but still enforces the age filter.

    Returns:
        RecomputeReport with counts and per-portfolio error details.
    """
    bq = get_bigquery_client()
    report = RecomputeReport()

    try:
        stale = _find_stale_portfolios(bq, max_age_hours, limit, portfolio_ids)
    except Exception as exc:
        log.error("recompute.stale_scan_failed", error=str(exc))
        raise

    report.scanned = len(stale)
    log.info("recompute.start", scanned=report.scanned, max_age_hours=max_age_hours)

    for pid in stale:
        try:
            result = _recompute_one(bq, pid)
            if result is None:
                report.skipped += 1
            else:
                report.recomputed += 1
        except Exception as exc:
            log.error("recompute.portfolio_failed", portfolio_id=pid, error=str(exc))
            report.errors.append({"portfolio_id": pid, "error": str(exc)})

    log.info(
        "recompute.done",
        scanned=report.scanned,
        recomputed=report.recomputed,
        skipped=report.skipped,
        errors=len(report.errors),
    )
    return report
