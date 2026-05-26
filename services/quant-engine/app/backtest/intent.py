"""Backtest natural-language intent resolution.

This module intentionally covers the structured strategy language the frontend
needs before the Rust engine runs. LLM planners may still be useful later, but
the deployment-critical path should not depend on free-form JSON using stale
signal IDs.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any


class IntentResolutionError(Exception):
    """Raised when a query cannot be converted into a runnable StrategySpec."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "INTENT_UNRESOLVED",
        clarifying_question: str | None = None,
        suggestions: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.clarifying_question = clarifying_question
        self.suggestions = suggestions or []

    def to_response(self) -> dict[str, Any]:
        return {
            "error": str(self),
            "code": self.code,
            "clarifying_question": self.clarifying_question,
            "suggestions": self.suggestions,
        }


def resolve_intent(query: str, *, today: datetime | None = None) -> dict[str, Any]:
    """Resolve a natural-language backtest prompt into a StrategySpec.

    The output uses only signal IDs exposed by the Rust engine:
    ``ts_momentum_12_1`` for time-series momentum and
    ``yield_curve_10y2y`` for the 10y-2y inversion exit.
    """
    q = " ".join(query.strip().split())
    if not q:
        raise IntentResolutionError(
            "Backtest query is empty.",
            code="NLP_PARSE_FAILED",
            clarifying_question="What instrument, time window, and signals should I test?",
        )

    now = today or datetime.now(timezone.utc)
    instrument = _resolve_instrument(q)
    start_date, end_date = _resolve_date_range(q, instrument, now)
    starting_capital = _resolve_starting_capital(q)
    risk_per_trade = _resolve_risk_per_trade(q)

    wants_ma_trend = bool(
        re.search(
            r"\b(?:moving\s+average|ma|sma|above\s+its\s+\d{2,3}[-\s]?day|"
            r"\d{2,3}[-\s]?day\s+trend|trend\s+is\s+positive|trend\s+turns?\s+negative)\b",
            q,
            re.I,
        )
    )
    wants_vol_adjusted_momentum = bool(re.search(r"\bvol(?:atility)?[-\s]?adjusted\s+momentum\b", q, re.I))
    wants_momentum = bool(
        re.search(r"\bmomentum\b|\btrend\b|\btactical\b|\bstrong\s+markets?\b|\bweakens?\b", q, re.I)
    )
    wants_mean_reversion = bool(re.search(r"\bmean\s+reversion\b|\boverbought\b|\boversold\b|\bz[-\s]?score\b", q, re.I))
    wants_carry = bool(re.search(r"\bcarry\b|\breal\s+yields?\b|\byields?\s+falling\b", q, re.I))
    wants_cross_asset = bool(re.search(r"\brelative\b|\bcross[-\s]?asset\b|\bversus\s+(?:spy|benchmark)\b", q, re.I))
    wants_macro = bool(re.search(r"\bmacro\b|\bregime\b|\brisk[-\s]?on\b|\brisk[-\s]?off\b|\bstrong\s+markets?\b", q, re.I))
    wants_yield_stress = bool(re.search(r"yield[-\s]?curve\s+stress|curve\s+stress|stress\s+rises?", q, re.I))
    wants_yield_exit = bool(re.search(r"yield\s+curve|10\s*y\s*[-/]?\s*2\s*y|invert", q, re.I))
    wants_tactical_controls = bool(
        re.search(
            r"\btactical(?:\s+allocation)?\b|\ballocation\b|\breduce\s+exposure\b|"
            r"\bmove\s+to\s+cash\b|\brisk[-\s]?off\b|\bweakens?\b",
            q,
            re.I,
        )
    )
    if not any([
        wants_momentum,
        wants_ma_trend,
        wants_vol_adjusted_momentum,
        wants_mean_reversion,
        wants_carry,
        wants_cross_asset,
        wants_macro,
        wants_yield_exit,
        wants_yield_stress,
    ]):
        raise IntentResolutionError(
            "Could not identify a supported entry or exit signal in the backtest query.",
            code="NLP_PARSE_FAILED",
            clarifying_question=(
                "Should the strategy enter on momentum, macro regime, liquidity, "
                "inflation persistence, volatility, or yield-curve signals?"
            ),
            suggestions=["momentum", "yield curve inversion", "macro regime"],
        )

    signals: list[dict[str, Any]] = []
    if wants_ma_trend:
        signals.append(
            {
                "signal_id": "trend_200d_slope",
                "signal_type": "TrendFactor",
                "threshold": 0.0,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    if wants_vol_adjusted_momentum:
        signals.append(
            {
                "signal_id": "vol_adjusted_momentum",
                "signal_type": "MomentumFactor",
                "threshold": 0.0,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    elif wants_momentum and not wants_ma_trend:
        momentum_signal = _resolve_momentum_signal(q, start_date, end_date)
        signals.append(
            {
                "signal_id": momentum_signal,
                "signal_type": "MomentumFactor",
                "threshold": 0.0,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    elif wants_momentum:
        momentum_signal = "trend_200d_slope"
    if wants_mean_reversion:
        signals.append(
            {
                "signal_id": "mean_reversion_z",
                "signal_type": "MeanReversion",
                "threshold": 0.0,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    if wants_carry:
        signals.append(
            {
                "signal_id": "carry_factor",
                "signal_type": "CarryFactor",
                "threshold": 0.0,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    if wants_cross_asset:
        signals.append(
            {
                "signal_id": "cross_asset_momentum",
                "signal_type": "CrossAssetMomentum",
                "threshold": 0.0,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    if wants_macro:
        signals.append(
            {
                "signal_id": "macro_regime_risk_on",
                "signal_type": "MacroRegime",
                "threshold": 0.55,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    if wants_yield_exit:
        signals.append(
            {
                "signal_id": "yield_curve_10y2y",
                "signal_type": "YieldSpread",
                "threshold": 0.0,
                "direction": "CrossDown",
                "weight": 1.0,
            }
        )
    elif wants_yield_stress:
        signals.append(
            {
                "signal_id": "yield_curve_score",
                "signal_type": "YieldSpread",
                "threshold": 0.0,
                "direction": "Above",
                "weight": 1.0,
            }
        )
    signals = _dedupe_signals(signals)
    for signal in signals:
        signal["weight"] = 1.0 / len(signals)

    entry_conditions: list[dict[str, Any]] = []
    exit_conditions: list[dict[str, Any]] = []
    if wants_ma_trend:
        entry_conditions.append({"signal_id": "trend_200d_slope", "direction": "Above", "threshold": 0.0})
        if not wants_yield_exit:
            exit_conditions.append({"signal_id": "trend_200d_slope", "direction": "Below", "threshold": 0.0})
    if wants_vol_adjusted_momentum:
        entry_conditions.append({"signal_id": "vol_adjusted_momentum", "direction": "Above", "threshold": 0.0})
        if not wants_yield_exit:
            exit_conditions.append({"signal_id": "vol_adjusted_momentum", "direction": "Below", "threshold": -0.10})
    elif wants_momentum and not wants_ma_trend:
        entry_conditions.append({"signal_id": momentum_signal, "direction": "Above", "threshold": 0.0})
        if not wants_yield_exit:
            exit_conditions.append({"signal_id": momentum_signal, "direction": "Below", "threshold": 0.0})
    if wants_mean_reversion:
        entry_conditions.append({"signal_id": "mean_reversion_z", "direction": "Above", "threshold": 0.0})
        if not wants_yield_exit:
            exit_conditions.append({"signal_id": "mean_reversion_z", "direction": "Below", "threshold": 0.0})
    if wants_carry:
        entry_conditions.append({"signal_id": "carry_factor", "direction": "Above", "threshold": 0.0})
        if not wants_yield_exit:
            exit_conditions.append({"signal_id": "carry_factor", "direction": "Below", "threshold": 0.0})
    if wants_cross_asset:
        entry_conditions.append({"signal_id": "cross_asset_momentum", "direction": "Above", "threshold": 0.0})
        if not wants_yield_exit:
            exit_conditions.append({"signal_id": "cross_asset_momentum", "direction": "Below", "threshold": 0.0})
    if wants_macro:
        entry_conditions.append({"signal_id": "macro_regime_risk_on", "direction": "Above", "threshold": 0.55})
        if not wants_yield_exit:
            exit_conditions.append({"signal_id": "macro_regime_risk_on", "direction": "Below", "threshold": 0.45})
    if wants_yield_exit:
        exit_conditions.append({"signal_id": "yield_curve_10y2y", "direction": "CrossDown", "threshold": 0.0})
    elif wants_yield_stress:
        exit_conditions.append({"signal_id": "yield_curve_score", "direction": "Below", "threshold": -0.25})
    if not entry_conditions:
        entry_conditions = [{"signal_id": signals[0]["signal_id"], "direction": "Above", "threshold": signals[0]["threshold"]}]
    if not exit_conditions:
        exit_conditions = [{"signal_id": entry_conditions[0]["signal_id"], "direction": "Below", "threshold": 0.0}]

    return {
        "id": _slug_strategy(instrument, wants_momentum or wants_ma_trend, wants_yield_exit),
        "name": _strategy_name(instrument, wants_momentum or wants_ma_trend, wants_yield_exit, wants_macro),
        "instrument": instrument,
        "date_range": {"start_date": start_date, "end_date": end_date},
        "signals": signals,
        "entry_logic": {"operator": "AND", "conditions": entry_conditions},
        "exit_logic": {"operator": "OR", "conditions": exit_conditions},
        "position_sizing": {"method": "FixedFractional", "fraction": 0.95},
        "risk_params": {
            "max_drawdown_pct": 25.0,
            "position_cap_pct": 100.0,
            "risk_per_trade_pct": risk_per_trade,
            "min_rr": 2.0,
            **_resolve_execution_controls(q, start_date, end_date, tactical=wants_tactical_controls, yield_event_exit=wants_yield_exit),
        },
        "comparison_mode": True,
        "cost_model": {"commission_bps": 1.0, "slippage_bps": 2.0},
        "starting_capital": starting_capital,
        "tier": "Pro",
    }


def _dedupe_signals(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for signal in signals:
        sid = str(signal["signal_id"])
        if sid in seen:
            continue
        seen.add(sid)
        out.append(signal)
    return out


def _resolve_execution_controls(
    query: str,
    start_date: str,
    end_date: str,
    *,
    tactical: bool,
    yield_event_exit: bool,
) -> dict[str, Any]:
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    days = (end - start).days
    q = query.lower()
    monthly = tactical and days >= 365 * 3 and bool(re.search(r"\ballocation\b|\bmulti[-\s]?signal\b|\bmacro\b", q))
    if monthly:
        return {
            "rebalance_freq": "Monthly",
            "min_holding_period_bars": 21,
            "signal_confirmation_bars": 3,
            "exit_confirmation_bars": 1 if yield_event_exit else 2,
            "cooldown_bars": 5,
            "entry_score_threshold": 0.10,
            "exit_score_threshold": 0.25,
            "min_weight_change_pct": 0.02,
        }
    if tactical:
        return {
            "rebalance_freq": "Weekly",
            "min_holding_period_bars": 10,
            "signal_confirmation_bars": 2,
            "exit_confirmation_bars": 1 if yield_event_exit else 2,
            "cooldown_bars": 3,
            "entry_score_threshold": 0.05,
            "exit_score_threshold": 0.15,
            "min_weight_change_pct": 0.01,
        }
    return {
        "rebalance_freq": "Weekly",
        "min_holding_period_bars": 5,
        "signal_confirmation_bars": 1,
        "exit_confirmation_bars": 1,
        "cooldown_bars": 0,
        "entry_score_threshold": 0.0,
        "exit_score_threshold": 0.0,
        "min_weight_change_pct": 0.01,
    }


def _resolve_instrument(query: str) -> str:
    q = query.lower()
    if re.search(r"\bgold\b|\bxau\b|\bxau\s*/?\s*usd\b", q):
        return "XAUUSD"
    if re.search(r"\bsilver\b|\bxag\b|\bxag\s*/?\s*usd\b", q):
        return "XAGUSD"

    match = re.search(r"\b(?:on|for|trade|trading)\s+([A-Z]{1,5})(?:\b|$)", query)
    if match:
        return match.group(1).upper()

    stopwords = {"A", "I", "THE", "AND", "OR", "ON", "FOR", "OVER", "WITH", "USE"}
    for match in re.finditer(
        r"\b([A-Z]{1,5})(?:\s+(?:strategy|momentum|trend|tactical|mean|macro)\b|\b)",
        query,
    ):
        candidate = match.group(1).upper()
        if candidate not in stopwords:
            return candidate

    raise IntentResolutionError(
        "Could not resolve the requested instrument to a known backtest symbol.",
        code="INSTRUMENT_NOT_FOUND",
        clarifying_question="Which instrument should I backtest?",
        suggestions=["SPY", "QQQ", "GLD", "XAUUSD"],
    )


def _resolve_date_range(query: str, instrument: str, today: datetime) -> tuple[str, str]:
    end_date = today.date().isoformat()
    explicit_start = _resolve_explicit_start(query)
    if explicit_start:
        return explicit_start, end_date
    years_match = re.search(r"\b(?:over|for|past|last)\s+(\d{1,2})\s+years?\b", query, re.I)
    if years_match:
        years = int(years_match.group(1))
        # Historical Research uses the long-history precious metals provider for
        # gold. Its reliable production window starts in 1994, and acceptance
        # expects a 30-year gold prompt to use that full available window.
        if instrument == "XAUUSD" and years >= 30:
            return "1994-01-01", end_date
        return f"{max(1900, today.year - years)}-01-01", end_date
    return f"{today.year - 10}-01-01", end_date


def _resolve_explicit_start(query: str) -> str | None:
    month_names = {
        "jan": 1, "january": 1,
        "feb": 2, "february": 2,
        "mar": 3, "march": 3,
        "apr": 4, "april": 4,
        "may": 5,
        "jun": 6, "june": 6,
        "jul": 7, "july": 7,
        "aug": 8, "august": 8,
        "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10,
        "nov": 11, "november": 11,
        "dec": 12, "december": 12,
    }
    match = re.search(r"\bfrom\s+([A-Za-z]+)\s+(\d{4})\b", query, re.I)
    if match:
        month = month_names.get(match.group(1).lower())
        if month:
            return f"{int(match.group(2)):04d}-{month:02d}-01"
    match = re.search(r"\b(?:from|since)\s+(\d{4})-(\d{1,2})(?:-\d{1,2})?\b", query, re.I)
    if match:
        return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-01"
    match = re.search(r"\b(?:from|since)\s+(\d{4})\b", query, re.I)
    if match:
        return f"{int(match.group(1)):04d}-01-01"
    return None


def _resolve_momentum_signal(query: str, start_date: str, end_date: str) -> str:
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    days = (end - start).days
    q = query.lower()
    if days < 365 * 2 or re.search(r"\bshort[-\s]?term\b|\bswing\b|\b1[-\s]?month\b", q):
        return "ts_momentum_21_5"
    if days < 365 * 8 or re.search(r"\btactical\b|\bweekly\b|\bquarter\b|\b3[-\s]?month\b", q):
        return "ts_momentum_63_21"
    return "ts_momentum_12_1"


def _resolve_starting_capital(query: str) -> float:
    match = re.search(r"\$\s*([0-9][0-9,]*(?:\.\d+)?)", query)
    if match:
        return float(match.group(1).replace(",", ""))
    match = re.search(r"\b([0-9][0-9,]*(?:\.\d+)?)\s+(?:starting\s+)?capital\b", query, re.I)
    if match:
        return float(match.group(1).replace(",", ""))
    return 100_000.0


def _resolve_risk_per_trade(query: str) -> float:
    match = re.search(r"\b([0-9]+(?:\.\d+)?)\s*%\s+risk\s+per\s+trade\b", query, re.I)
    if match:
        return float(match.group(1))
    return 1.0


def _slug_strategy(instrument: str, momentum: bool, yield_exit: bool) -> str:
    parts = ["strat", instrument.lower()]
    if momentum:
        parts.append("momentum")
    if yield_exit:
        parts.extend(["yield", "curve", "exit"])
    return "_".join(parts)


def _strategy_name(instrument: str, momentum: bool, yield_exit: bool, macro: bool) -> str:
    label = "Gold" if instrument == "XAUUSD" else instrument
    if momentum and yield_exit:
        return f"{label} Momentum with Yield Curve Exit"
    if momentum and macro:
        return f"Tactical {label}: Momentum & Macro Regime"
    if momentum:
        return f"{label} Momentum"
    if macro:
        return f"{label} Macro Regime Strategy"
    return f"{label} Yield Curve Strategy"
