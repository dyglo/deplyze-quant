from app.backtest.improvements import suggest_improvements


def test_suggest_improvements_returns_ranked_actionable_json():
    result = {
        "aggregate_metrics": {
            "sharpe_ratio": 0.2,
            "deflated_sharpe_ratio": 0.4,
            "profit_factor": 0.9,
            "max_drawdown": 0.22,
        },
        "expectancy_metrics": {"system_quality_number": 0.8, "recovery_factor": 0.1},
        "walk_forward": {"oos_vs_insample_ratio": 0.3},
        "transaction_costs": {"sharpe_drag": 0.1},
        "signal_attribution": [
            {"signal_id": "ts_momentum_12_1", "marginal_sharpe": -0.2},
        ],
        "regime_metrics": {
            "transitional": {"max_drawdown": 0.18, "sharpe_ratio": -0.2},
        },
    }

    response = suggest_improvements(result)

    assert response["result_id"]
    assert len(response["suggestions"]) <= 3
    assert response["suggestions"][0]["rank"] == 1
    assert response["suggestions"][0]["action_patch"]["type"] in {
        "remove_signal",
        "add_or_update_signal",
        "set_rebalance_freq",
        "set_position_sizing",
        "set_execution_controls",
    }


def test_many_bad_trades_suggests_engine_supported_anti_churn_controls():
    result = {
        "aggregate_metrics": {
            "sharpe_ratio": -0.3,
            "deflated_sharpe_ratio": 0.0,
            "profit_factor": 0.7,
            "max_drawdown": 0.18,
            "total_trades": 125,
            "avg_trade_duration_days": 4.0,
        },
        "expectancy_metrics": {"system_quality_number": -0.5, "recovery_factor": -0.2},
        "transaction_costs": {"sharpe_drag": 0.2},
        "dollar_summary": {
            "starting_capital": 100000,
            "enhanced_final": 92000,
            "buy_hold_final": 140000,
        },
    }

    response = suggest_improvements(result)

    first = response["suggestions"][0]
    assert first["category"] == "ExecutionControls"
    assert first["action_patch"]["type"] == "set_execution_controls"
    assert first["action_patch"]["rebalance_freq"] == "Monthly"
    assert "underperformed buy-and-hold" in response["verdict"]
