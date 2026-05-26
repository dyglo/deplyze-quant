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
