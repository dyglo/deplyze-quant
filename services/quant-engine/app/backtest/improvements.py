"""Structured backtest improvement suggestions.

The endpoint is intentionally deterministic and cached per result hash. LLM
copy can be layered on later, but production should not depend on a model call
to return the actionable improvement loop.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import structlog

from app.core.config import settings

log = structlog.get_logger("quant_engine.backtest.improvements")

_CACHE: dict[str, dict[str, Any]] = {}


def _num(obj: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = obj.get(key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _result_key(payload: dict[str, Any]) -> str:
    stable = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()


def suggest_improvements(payload: dict[str, Any]) -> dict[str, Any]:
    key = _result_key(payload)
    if key in _CACHE:
        return _CACHE[key]

    metrics = payload.get("aggregate_metrics") or {}
    expectancy = payload.get("expectancy_metrics") or {}
    walk = payload.get("walk_forward") or {}
    costs = payload.get("transaction_costs") or {}
    attribution = payload.get("signal_attribution") or []
    regimes = payload.get("regime_metrics") or {}
    dollar = payload.get("dollar_summary") or {}

    sharpe = _num(metrics, "sharpe_ratio")
    dsr = _num(metrics, "deflated_sharpe_ratio")
    mdd = _num(metrics, "max_drawdown")
    profit_factor = _num(metrics, "profit_factor")
    total_trades = _num(metrics, "total_trades")
    avg_duration = _num(metrics, "avg_trade_duration_days")
    sqn = _num(expectancy, "system_quality_number")
    recovery = _num(expectancy, "recovery_factor")
    oos_ratio = _num(walk, "oos_vs_insample_ratio", 1.0)
    cost_sharpe_drag = _num(costs, "sharpe_drag")
    enhanced_final = _num(dollar, "enhanced_final")
    buy_hold_final = _num(dollar, "buy_hold_final")
    underperforms_buy_hold = enhanced_final > 0 and buy_hold_final > 0 and enhanced_final < buy_hold_final
    poor_quality = sharpe <= 0.0 or profit_factor < 1.0 or sqn < 1.0 or underperforms_buy_hold
    many_trades = total_trades >= 40 or (total_trades >= 20 and avg_duration > 0 and avg_duration < 15)

    suggestions: list[dict[str, Any]] = []

    if many_trades and poor_quality:
        slower = total_trades >= 80 or avg_duration < 8
        suggestions.append(
            {
                "rank": 1,
                "category": "ExecutionControls",
                "title": "Slow the execution clock",
                "explanation": (
                    "The strategy is trading frequently while the quality metrics are weak. "
                    "Rerun with a slower rebalance cadence, minimum holding period, signal persistence, "
                    "and wider ensemble exit buffer before changing the signal set."
                ),
                "expected_impact": "Targets lower turnover and fewer exits caused by small signal-score changes; it does not assume returns improve.",
                "action": "Apply anti-churn controls and rerun.",
                "action_patch": {
                    "type": "set_execution_controls",
                    "rebalance_freq": "Monthly" if slower else "Weekly",
                    "min_holding_period_bars": 21 if slower else 10,
                    "signal_confirmation_bars": 3 if slower else 2,
                    "exit_confirmation_bars": 2,
                    "cooldown_bars": 5 if slower else 3,
                    "entry_score_threshold": 0.10 if slower else 0.05,
                    "exit_score_threshold": 0.25 if slower else 0.15,
                    "min_weight_change_pct": 0.02 if slower else 0.01,
                },
            }
        )

    negative_signal = None
    for item in attribution:
        try:
            marginal = float(item.get("marginal_sharpe", 0.0))
        except (TypeError, ValueError):
            marginal = 0.0
        if marginal < -0.05 and (
            negative_signal is None or marginal < float(negative_signal.get("marginal_sharpe", 0.0))
        ):
            negative_signal = item
    if negative_signal:
        sid = str(negative_signal.get("signal_id", "signal"))
        suggestions.append(
            {
                "rank": 1,
                "category": "SignalRemoval",
                "title": f"Remove weak signal: {sid}",
                "explanation": f"{sid} reduced marginal Sharpe in this run; remove it and rerun before adding complexity.",
                "expected_impact": "Potential Sharpe improvement and lower turnover if the signal was noisy.",
                "action": f"Remove {sid} from the strategy signals.",
                "action_patch": {"type": "remove_signal", "signal_id": sid},
            }
        )

    if underperforms_buy_hold:
        gap = buy_hold_final - enhanced_final
        suggestions.append(
            {
                "rank": len(suggestions) + 1,
                "category": "AbandonStrategy",
                "title": "Do not ignore buy-and-hold underperformance",
                "explanation": (
                    f"The strategy finished below buy-and-hold by approximately ${gap:,.0f}. "
                    "If anti-churn controls and signal simplification do not close that gap, the honest conclusion is to abandon this variant."
                ),
                "expected_impact": "Improves research discipline by treating benchmark failure as a reject signal, not a tuning challenge.",
                "action": "Rerun with conservative execution controls before deciding whether to retire the idea.",
                "action_patch": {
                    "type": "set_execution_controls",
                    "rebalance_freq": "Monthly",
                    "min_holding_period_bars": 21,
                    "signal_confirmation_bars": 3,
                    "exit_confirmation_bars": 2,
                    "cooldown_bars": 5,
                    "entry_score_threshold": 0.10,
                    "exit_score_threshold": 0.25,
                    "min_weight_change_pct": 0.02,
                },
            }
        )

    worst_regime = None
    for key_name, label in [
        ("risk_on", "Risk-On"),
        ("transitional", "Transitional"),
        ("risk_off", "Risk-Off"),
    ]:
        row = regimes.get(key_name) or {}
        row_mdd = _num(row, "max_drawdown")
        row_sharpe = _num(row, "sharpe_ratio")
        if row_mdd > 0.12 or row_sharpe < -0.1:
            if worst_regime is None or row_mdd > worst_regime["mdd"]:
                worst_regime = {"label": label, "mdd": row_mdd, "sharpe": row_sharpe}
    if worst_regime:
        suggestions.append(
            {
                "rank": len(suggestions) + 1,
                "category": "RegimeFilter",
                "title": f"Reduce exposure in {worst_regime['label']}",
                "explanation": f"{worst_regime['label']} carried weak risk-adjusted performance; add or tighten a macro regime filter.",
                "expected_impact": f"Designed to reduce drawdown from the {worst_regime['mdd']:.1%} regime loss profile.",
                "action": "Add macro_regime_risk_on as a risk filter and require risk-on probability above 0.55.",
                "action_patch": {
                    "type": "add_or_update_signal",
                    "signal": {
                        "signal_id": "macro_regime_risk_on",
                        "signal_type": "MacroRegime",
                        "threshold": 0.55,
                        "direction": "Above",
                        "weight": 0.35,
                    },
                    "entry_operator": "AND",
                    "exit_operator": "OR",
                },
            }
        )

    if oos_ratio < 0.7:
        suggestions.append(
            {
                "rank": len(suggestions) + 1,
                "category": "Overfitting",
                "title": "Simplify before trusting the edge",
                "explanation": "Out-of-sample Sharpe is materially below the in-sample profile, which is a classic overfitting warning.",
                "expected_impact": "Improves robustness by lowering parameter sensitivity.",
                "action": "Use weekly rebalancing, signal persistence, and wider ensemble exit thresholds before rerunning.",
                "action_patch": {
                    "type": "set_execution_controls",
                    "rebalance_freq": "Weekly",
                    "min_holding_period_bars": 10,
                    "signal_confirmation_bars": 2,
                    "exit_confirmation_bars": 2,
                    "cooldown_bars": 3,
                    "entry_score_threshold": 0.05,
                    "exit_score_threshold": 0.15,
                    "min_weight_change_pct": 0.01,
                },
            }
        )

    if cost_sharpe_drag > abs(sharpe) * 0.30 and cost_sharpe_drag > 0.05:
        suggestions.append(
            {
                "rank": len(suggestions) + 1,
                "category": "Rebalance",
                "title": "Reduce turnover cost drag",
                "explanation": "Transaction costs are consuming a large share of Sharpe; slower rebalancing can preserve more edge.",
                "expected_impact": f"Targets a reduction in the {cost_sharpe_drag:.2f} Sharpe cost drag.",
                "action": "Change rebalance frequency to Weekly and ignore small target-weight changes.",
                "action_patch": {
                    "type": "set_execution_controls",
                    "rebalance_freq": "Weekly",
                    "min_holding_period_bars": 5,
                    "signal_confirmation_bars": 1,
                    "exit_confirmation_bars": 1,
                    "cooldown_bars": 0,
                    "entry_score_threshold": 0.0,
                    "exit_score_threshold": 0.0,
                    "min_weight_change_pct": 0.02,
                },
            }
        )

    if sqn > 2.0 and recovery > 0.5 and mdd < 0.15:
        suggestions.append(
            {
                "rank": len(suggestions) + 1,
                "category": "PositionSizing",
                "title": "Consider cautious half-Kelly scaling",
                "explanation": "SQN and recovery factor are constructive while drawdown is contained; sizing can be tested conservatively.",
                "expected_impact": "May increase dollar expectancy without changing the signal set.",
                "action": "Switch sizing to fractional Kelly at 0.5.",
                "action_patch": {"type": "set_position_sizing", "method": "Kelly", "kelly_fraction": 0.5},
            }
        )

    if not suggestions:
        suggestions.append(
            {
                "rank": 1,
                "category": "SignalRemoval" if profit_factor < 1.0 else "PositionSizing",
                "title": "Keep the system simple",
                "explanation": "No single failure mode dominates; rerun with one signal changed at a time to avoid overfitting.",
                "expected_impact": "Improves diagnostic clarity rather than promising an immediate metric lift.",
                "action": "Use VolTarget sizing at 10% annual volatility and rerun.",
                "action_patch": {"type": "set_position_sizing", "method": "VolTarget", "target_annual_vol": 0.10},
            }
        )

    verdict = (
        f"Strategy quality is {'strong' if sqn > 2 and dsr > 0.7 else 'mixed' if sharpe > 0 else 'weak'}: "
        f"SQN {sqn:.2f}, DSR {dsr:.2f}, profit factor {profit_factor:.2f}. "
        f"{'It underperformed buy-and-hold; simplify or abandon it if reruns do not improve the evidence. ' if underperforms_buy_hold else ''}"
        "Treat expectancy and out-of-sample behavior as more important than win rate."
    )
    out = {"result_id": key, "verdict": verdict, "suggestions": suggestions[:3]}
    for i, suggestion in enumerate(out["suggestions"], start=1):
        suggestion["rank"] = i
    out = _llm_refine(payload, out)
    _CACHE[key] = out
    return out


def _llm_refine(payload: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    """Optionally ask Gemini to tighten the wording while preserving actions."""
    if not settings.GEMINI_API_KEY:
        return fallback
    try:
        import httpx

        prompt = {
            "instruction": (
                "Return strict JSON only. Improve the wording of this backtest improvement report. "
                "Do not invent metrics. Keep at most three suggestions. Preserve each action_patch exactly. "
                "Keep categories within RegimeFilter, SignalRemoval, Rebalance, PositionSizing, Overfitting, ExecutionControls, AbandonStrategy."
            ),
            "result_excerpt": {
                "aggregate_metrics": payload.get("aggregate_metrics"),
                "expectancy_metrics": payload.get("expectancy_metrics"),
                "walk_forward": payload.get("walk_forward"),
                "transaction_costs": payload.get("transaction_costs"),
                "signal_attribution": payload.get("signal_attribution"),
                "regime_metrics": payload.get("regime_metrics"),
            },
            "draft": fallback,
        }
        response = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
            params={"key": settings.GEMINI_API_KEY},
            json={
                "contents": [{"parts": [{"text": json.dumps(prompt, default=str)}]}],
                "generationConfig": {
                    "temperature": 0.15,
                    "responseMimeType": "application/json",
                },
            },
            timeout=20,
        )
        if response.status_code != 200:
            log.warning("backtest.improvements_llm_failed", status=response.status_code)
            return fallback
        candidates = response.json().get("candidates") or []
        text = (
            candidates[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            if candidates
            else ""
        )
        parsed = json.loads(text)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("suggestions"), list):
            return fallback
        parsed["result_id"] = fallback["result_id"]
        for i, suggestion in enumerate(parsed["suggestions"][:3], start=1):
            suggestion["rank"] = i
            if i - 1 < len(fallback["suggestions"]):
                suggestion["action_patch"] = fallback["suggestions"][i - 1].get("action_patch")
        parsed["suggestions"] = parsed["suggestions"][:3]
        return parsed
    except Exception as e:
        log.warning("backtest.improvements_llm_failed", error=str(e))
        return fallback
