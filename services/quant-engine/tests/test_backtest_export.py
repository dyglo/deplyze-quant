import pandas as pd

from app.backtest.export import (
    _add_engine_signal_columns,
    _series_covers_request,
)


def test_series_coverage_rejects_partial_warehouse_data():
    s = pd.Series(
        [1.0, 2.0, 3.0],
        index=pd.to_datetime(["2024-05-28", "2024-05-29", "2024-05-30"]),
    )

    assert not _series_covers_request(s, "2016-01-01", "2026-05-26")


def test_export_adds_all_engine_momentum_columns():
    frame = pd.DataFrame({"asset_close": [100.0 + i for i in range(300)]})

    _add_engine_signal_columns(frame)

    assert {"ts_momentum_12_1", "ts_momentum_63_21", "ts_momentum_21_5"}.issubset(frame.columns)
    assert frame["ts_momentum_21_5"].iloc[-1] > 0
