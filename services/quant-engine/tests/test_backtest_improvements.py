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
    }
