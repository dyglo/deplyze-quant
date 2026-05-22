"""
Unit tests for app.portfolio_awareness.recompute.

All tests are self-contained and require no live BQ / Firestore credentials.
Integration paths that need live infrastructure are skipped via a sentinel
environment variable:

  INTEGRATION_TESTS=1 pytest tests/ -v

Run in CI (no live deps):
  cd services/quant-engine && python -m pytest tests/ -v
"""

from __future__ import annotations

import math
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch, call

import pytest

from app.portfolio_awareness.recompute import (
    _log_returns,
    _total_return,
    _annualised_vol,
    _sharpe,
    _max_drawdown,
    _hhi,
    _normalise_weights,
    _find_stale_portfolios,
    _narrate_hero,
    _narrate_return_decomp,
    _narrate_risk_decomp,
    _pct,
    RecomputeReport,
)

INTEGRATION = os.getenv("INTEGRATION_TESTS") == "1"
skip_integration = pytest.mark.skipif(not INTEGRATION, reason="requires live BQ/Firestore")


# ─── Analytics helpers ────────────────────────────────────────────────────────

def test_log_returns_basic():
    prices = [100.0, 110.0, 121.0]
    rets = _log_returns(prices)
    assert len(rets) == 2
    assert abs(rets[0] - math.log(110 / 100)) < 1e-9
    assert abs(rets[1] - math.log(121 / 110)) < 1e-9


def test_log_returns_skips_non_positive():
    rets = _log_returns([100.0, 0.0, 110.0])
    # 0.0 → skip; no valid pair spanning it
    assert len(rets) == 0


def test_total_return_flat():
    assert _total_return([100.0, 100.0, 100.0]) == pytest.approx(0.0, abs=1e-9)


def test_total_return_up():
    # Simple 10% gain
    r = _total_return([100.0, 110.0])
    assert abs(r - 0.10) < 1e-6


def test_total_return_empty():
    assert _total_return([100.0]) == 0.0


def test_annualised_vol_constant():
    assert _annualised_vol([0.01] * 20) == pytest.approx(0.0, abs=1e-9)


def test_annualised_vol_insufficient():
    assert _annualised_vol([0.01, 0.02]) == 0.0


def test_max_drawdown_no_drawdown():
    # Monotonically increasing
    assert _max_drawdown([100.0, 110.0, 120.0]) == 0.0


def test_max_drawdown_half():
    prices = [100.0, 50.0, 80.0]
    mdd = _max_drawdown(prices)
    assert abs(mdd - (-0.50)) < 1e-9


def test_hhi_equal_weights():
    # 4 equal weights → HHI = 0.25
    assert _hhi([0.25, 0.25, 0.25, 0.25]) == pytest.approx(0.25, abs=1e-9)


def test_hhi_single():
    assert _hhi([1.0]) == pytest.approx(1.0, abs=1e-9)


def test_hhi_empty():
    assert _hhi([]) == 0.0


# ─── Weight normalisation ────────────────────────────────────────────────────

def _mk_holding(symbol: str, weight: Optional[float] = None) -> Dict[str, Any]:
    return {"symbol": symbol, "weight": weight, "sector": "Tech", "assetClass": "equity", "name": symbol}


def test_normalise_weights_explicit():
    holdings = [_mk_holding("AAPL", 0.6), _mk_holding("MSFT", 0.4)]
    prices = {"AAPL": [100.0, 110.0], "MSFT": [200.0, 210.0]}
    w = _normalise_weights(holdings, prices)
    assert abs(w["AAPL"] - 0.6) < 1e-9
    assert abs(w["MSFT"] - 0.4) < 1e-9


def test_normalise_weights_equal_fallback():
    holdings = [_mk_holding("A"), _mk_holding("B"), _mk_holding("C")]
    prices = {"A": [1.0, 2.0], "B": [1.0, 2.0], "C": [1.0, 2.0]}
    w = _normalise_weights(holdings, prices)
    for sym in ["A", "B", "C"]:
        assert abs(w[sym] - 1 / 3) < 1e-9


def test_normalise_weights_normalises_to_one():
    holdings = [_mk_holding("X", 2.0), _mk_holding("Y", 3.0)]
    prices = {"X": [1.0, 2.0], "Y": [1.0, 2.0]}
    w = _normalise_weights(holdings, prices)
    assert abs(sum(w.values()) - 1.0) < 1e-9


def test_normalise_weights_empty():
    assert _normalise_weights([], {}) == {}


# ─── Stale portfolio filter ───────────────────────────────────────────────────

def _mock_bq_row(portfolio_id: str, hours_ago: int):
    r = MagicMock()
    r.portfolio_id = portfolio_id
    r.last_generated = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    return r


def test_find_stale_portfolios_explicit_list_filters_stale():
    """Only portfolios beyond the threshold should be returned."""
    fresh_row = _mock_bq_row("fresh-p", hours_ago=5)
    stale_row = _mock_bq_row("stale-p", hours_ago=30)
    never_seen = "never-p"

    mock_client = MagicMock()
    mock_client.query.return_value.result.return_value = [fresh_row, stale_row]

    pids = ["fresh-p", "stale-p", never_seen]
    result = _find_stale_portfolios(mock_client, max_age_hours=18, limit=10, portfolio_ids=pids)

    assert "stale-p" in result
    assert never_seen in result
    assert "fresh-p" not in result


def test_find_stale_portfolios_respects_limit():
    mock_client = MagicMock()
    rows = [_mock_bq_row(f"p{i}", hours_ago=100) for i in range(10)]
    mock_client.query.return_value.result.return_value = rows

    pids = [r.portfolio_id for r in rows]
    result = _find_stale_portfolios(mock_client, max_age_hours=18, limit=3, portfolio_ids=pids)
    assert len(result) <= 3


# ─── Narrative formatters ─────────────────────────────────────────────────────

def test_narrate_hero_positive_return():
    kpis = {"totalReturn": 0.12, "sharpe": 1.2, "maxDrawdown": -0.08}
    lines = _narrate_hero(kpis)
    assert any("12.00%" in l["text"] for l in lines)
    assert lines[0]["emphasis"] is True


def test_narrate_hero_with_benchmark():
    kpis = {
        "totalReturn": 0.12,
        "benchmarkTotalReturn": 0.08,
        "benchmarkId": "SPY",
        "sharpe": 1.0,
        "maxDrawdown": -0.05,
    }
    lines = _narrate_hero(kpis)
    assert any("SPY" in l["text"] for l in lines)
    assert any("ahead of" in l["text"] for l in lines)


def test_narrate_return_decomp_with_contributors():
    contributors = {
        "top": [
            {"symbol": "AAPL", "weight": 0.3, "contribution": 0.05},
            {"symbol": "MSFT", "weight": 0.2, "contribution": 0.03},
            {"symbol": "NVDA", "weight": 0.15, "contribution": 0.02},
        ],
        "bottom": [{"symbol": "INTC", "weight": 0.1, "contribution": -0.01}],
    }
    kpis = {"totalReturn": 0.10}
    sector_breakdown = {"sectors": [{"sector": "Tech", "weight": 0.65, "contribution": 0.09}]}
    lines = _narrate_return_decomp(contributors, kpis, sector_breakdown)
    assert any("AAPL" in l["text"] for l in lines)
    assert any("INTC" in l["text"] for l in lines)


def test_narrate_risk_decomp():
    kpis = {"annVol": 0.22, "maxDrawdown": -0.18, "holdings": 10}
    risk = {"hhi": 0.15, "stressedCount": 2, "sectorRisk": [
        {"sector": "Tech", "weight": 0.6, "contribPct": 0.45},
    ]}
    lines = _narrate_risk_decomp(kpis, risk)
    assert any("22.00%" in l["text"] for l in lines)
    assert any("HHI" in l["text"] for l in lines)
    assert lines[0]["emphasis"] is True


def test_pct_positive():
    assert _pct(0.123) == "+12.30%"


def test_pct_negative():
    assert _pct(-0.05) == "-5.00%"


def test_pct_unsigned():
    assert _pct(0.10, signed=False) == "10.00%"


# ─── write_snapshot call count ───────────────────────────────────────────────

@patch("app.portfolio_awareness.recompute.write_snapshot")
@patch("app.portfolio_awareness.recompute._load_ohlcv_batch")
@patch("app.portfolio_awareness.recompute._load_portfolio_meta")
@patch("app.portfolio_awareness.recompute._load_holdings_from_firestore")
@patch("app.portfolio_awareness.recompute._find_stale_portfolios")
@patch("app.portfolio_awareness.recompute.get_bigquery_client")
def test_recompute_calls_write_snapshot_once_per_portfolio(
    mock_bq,
    mock_find_stale,
    mock_holdings,
    mock_meta,
    mock_ohlcv,
    mock_write,
):
    """write_snapshot must be called exactly once per stale portfolio."""
    mock_find_stale.return_value = ["pid-1", "pid-2"]
    mock_meta.return_value = {"benchmark_id": None, "uid": "u1", "workspace_id": "ws1"}
    mock_holdings.return_value = [
        {"symbol": "AAPL", "weight": 0.5, "sector": "Tech", "assetClass": "equity", "name": "AAPL"},
        {"symbol": "MSFT", "weight": 0.5, "sector": "Tech", "assetClass": "equity", "name": "MSFT"},
    ]
    prices = [float(100 + i) for i in range(260)]
    mock_ohlcv.return_value = {"AAPL": prices, "MSFT": prices}
    mock_write.return_value = {
        "artifact_id": "test-id",
        "portfolio_id": "pid-1",
        "snapshot_date": "2026-05-21",
        "lineage_id": "v5p3:abc",
        "generated_at": "2026-05-21T04:00:00+00:00",
    }

    from app.portfolio_awareness.recompute import recompute_stale_portfolios
    report = recompute_stale_portfolios(max_age_hours=18, limit=10)

    assert mock_write.call_count == 2
    assert report.recomputed == 2
    assert report.skipped == 0
    assert report.errors == []
