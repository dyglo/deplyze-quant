from datetime import datetime, timezone

from app.backtest.intent import resolve_intent


def test_resolve_gold_momentum_yield_curve_prompt():
    spec = resolve_intent(
        "Test a momentum strategy on gold over 30 years with $50,000 starting capital, "
        "exit when the yield curve inverts, 1% risk per trade",
        today=datetime(2026, 5, 26, tzinfo=timezone.utc),
    )

    assert spec["instrument"] == "XAUUSD"
    assert spec["date_range"] == {"start_date": "1994-01-01", "end_date": "2026-05-26"}
    assert spec["starting_capital"] == 50000.0
    assert spec["risk_params"]["risk_per_trade_pct"] == 1.0

    signal_ids = {signal["signal_id"] for signal in spec["signals"]}
    assert signal_ids == {"ts_momentum_12_1", "yield_curve_10y2y"}
    assert spec["exit_logic"]["conditions"] == [
        {"signal_id": "yield_curve_10y2y", "direction": "CrossDown", "threshold": 0.0}
    ]


def test_resolve_tactical_spy_uses_macro_and_medium_momentum():
    spec = resolve_intent(
        "Backtest a tactical SPY strategy over the last 10 years with $100,000 starting capital. "
        "Use momentum and macro regime to stay invested during strong markets, reduce exposure "
        "during risk-off conditions, and compare against buy-and-hold.",
        today=datetime(2026, 5, 26, tzinfo=timezone.utc),
    )

    assert spec["instrument"] == "SPY"
    assert spec["date_range"] == {"start_date": "2016-01-01", "end_date": "2026-05-26"}
    assert spec["starting_capital"] == 100000.0

    signal_ids = {signal["signal_id"] for signal in spec["signals"]}
    assert signal_ids == {"ts_momentum_63_21", "macro_regime_risk_on"}
    assert spec["entry_logic"]["operator"] == "AND"
    assert spec["exit_logic"]["operator"] == "OR"
    assert spec["risk_params"]["rebalance_freq"] == "Monthly"
    assert spec["risk_params"]["min_holding_period_bars"] == 21
    assert spec["risk_params"]["signal_confirmation_bars"] == 3


def test_resolve_short_window_qqq_uses_short_momentum():
    spec = resolve_intent(
        "Backtest a QQQ momentum strategy from June 2024 to today with $100,000 starting capital. "
        "Enter when momentum is positive, exit when momentum turns negative, and compare against buy-and-hold.",
        today=datetime(2026, 5, 26, tzinfo=timezone.utc),
    )

    assert spec["instrument"] == "QQQ"
    assert spec["date_range"] == {"start_date": "2024-06-01", "end_date": "2026-05-26"}
    assert {signal["signal_id"] for signal in spec["signals"]} == {"ts_momentum_21_5"}


def test_resolve_moving_average_prompt_uses_trend_signal():
    spec = resolve_intent(
        "Backtest an AAPL momentum strategy from 2018 to today with $100,000 starting capital. "
        "Enter when price is above its 50-day moving average and exit when it falls below.",
        today=datetime(2026, 5, 26, tzinfo=timezone.utc),
    )

    assert spec["instrument"] == "AAPL"
    assert spec["date_range"] == {"start_date": "2018-01-01", "end_date": "2026-05-26"}
    assert {signal["signal_id"] for signal in spec["signals"]} == {"trend_200d_slope"}


def test_resolve_real_yields_prompt_uses_carry_signal():
    spec = resolve_intent(
        "Backtest a GLD strategy from 2010 to today with $100,000 starting capital. "
        "Stay invested when real yields are falling or GLD above 100-day MA.",
        today=datetime(2026, 5, 26, tzinfo=timezone.utc),
    )

    assert spec["instrument"] == "GLD"
    assert spec["date_range"] == {"start_date": "2010-01-01", "end_date": "2026-05-26"}
    assert {"carry_factor", "trend_200d_slope"}.issubset({signal["signal_id"] for signal in spec["signals"]})


def test_resolve_tlt_tactical_allocation_uses_anti_churn_controls():
    spec = resolve_intent(
        "Backtest a multi-signal TLT tactical allocation strategy from 2012 to today with $100,000 "
        "starting capital. Stay invested when the 200-day trend is positive, volatility-adjusted "
        "momentum is positive, and the macro regime is risk-on. Reduce exposure or move to cash when "
        "trend turns negative, yield-curve stress rises, or volatility-adjusted momentum weakens.",
        today=datetime(2026, 5, 26, tzinfo=timezone.utc),
    )

    assert spec["instrument"] == "TLT"
    assert spec["date_range"] == {"start_date": "2012-01-01", "end_date": "2026-05-26"}
    signal_ids = {signal["signal_id"] for signal in spec["signals"]}
    assert {"trend_200d_slope", "vol_adjusted_momentum", "macro_regime_risk_on", "yield_curve_score"}.issubset(signal_ids)
    assert spec["risk_params"]["rebalance_freq"] == "Monthly"
    assert spec["risk_params"]["min_holding_period_bars"] == 21
    assert spec["risk_params"]["exit_score_threshold"] == 0.25
