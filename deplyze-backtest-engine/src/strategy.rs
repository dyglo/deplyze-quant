//! Strategy validation, the signal catalog, and signal-series resolution.
//!
//! Validation is intentionally strict: a spec that references an unknown signal,
//! carries an empty entry expression, or inverts its date range is rejected
//! before any compute is spent. Tier requirements are surfaced (all users are
//! Pro in Sprint 1, so gating is informational rather than blocking).

use std::collections::HashMap;

use crate::loader::MarketData;
use crate::models::*;
use crate::regime::RegimeLabels;

// ─── Signal catalog ─────────────────────────────────────────────────────────────

/// The canonical signal library. `source_columns` name the real warehouse
/// columns each signal reads (verified against `cleaned.macro_cleaned` /
/// `ohlcv_cleaned`), so the frontend and validator share one source of truth.
pub fn signal_library() -> SignalLibrary {
    let s = |signal_id: &str,
             signal_type: SignalType,
             label: &str,
             description: &str,
             min_tier: UserTier,
             source_columns: &[&str],
             unit: &str| SignalMeta {
        signal_id: signal_id.to_string(),
        signal_type,
        label: label.to_string(),
        description: description.to_string(),
        min_tier,
        source_columns: source_columns.iter().map(|c| c.to_string()).collect(),
        unit: unit.to_string(),
    };

    SignalLibrary {
        signals: vec![
            s(
                "macro_regime_risk_on",
                SignalType::MacroRegime,
                "Macro Regime (P risk-on)",
                "Causal filtered probability of the risk-on macro regime from the Gaussian HMM.",
                UserTier::Pro,
                &["DGS10", "DGS2", "WALCL", "RRPONTSYD", "M2SL", "DTWEXBGS"],
                "probability",
            ),
            s(
                "yield_curve_10y2y",
                SignalType::YieldSpread,
                "Yield Curve 10y-2y",
                "Treasury term spread; inversion (negative) is a classic risk-off precursor.",
                UserTier::Pro,
                &["T10Y2Y", "DGS10", "DGS2"],
                "percent",
            ),
            s(
                "yield_curve_10y3m",
                SignalType::YieldSpread,
                "Yield Curve 10y-3m",
                "10-year minus 3-month spread (Estrella recession indicator).",
                UserTier::Pro,
                &["T10Y3M", "DGS10", "DGS3MO"],
                "percent",
            ),
            s(
                "liquidity_composite",
                SignalType::MacroRegime,
                "Liquidity Composite",
                "Net liquidity proxy: Fed balance sheet + M2 less reverse-repo drain, USD-adjusted.",
                UserTier::Pro,
                &["WALCL", "RRPONTSYD", "M2SL", "DTWEXBGS"],
                "zscore",
            ),
            s(
                "inflation_persistence",
                SignalType::MacroRegime,
                "Inflation Persistence",
                "Composite of core CPI, core PCE and 10y breakevens.",
                UserTier::Pro,
                &["CPILFESL", "PCEPILFE", "T10YIE"],
                "zscore",
            ),
            s(
                "realized_vol_z",
                SignalType::VolatilityZScore,
                "Realized Volatility (z)",
                "Causal z-score of 21-day realized volatility of the traded instrument.",
                UserTier::Pro,
                &["asset_return"],
                "zscore",
            ),
            s(
                "ts_momentum_12_1",
                SignalType::MomentumFactor,
                "Time-Series Momentum 12-1",
                "12-month minus 1-month trailing price momentum of the traded instrument.",
                UserTier::Pro,
                &["asset_close"],
                "ratio",
            ),
        ],
    }
}

// ─── Validation ─────────────────────────────────────────────────────────────────

pub fn validate(spec: &StrategySpec) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut tier_requirements = Vec::new();

    let lib = signal_library();
    let known: HashMap<&str, &SignalMeta> =
        lib.signals.iter().map(|m| (m.signal_id.as_str(), m)).collect();

    // Date range.
    if spec.date_range.start_date >= spec.date_range.end_date {
        errors.push("date_range.start_date must be before end_date".into());
    }

    // Signals present and well-formed.
    if spec.signals.is_empty() {
        errors.push("at least one signal is required".into());
    }
    let weight_sum: f64 = spec.signals.iter().map(|s| s.weight).sum();
    if !spec.signals.is_empty() && weight_sum <= 0.0 {
        errors.push("signal weights must sum to a positive value".into());
    }
    for sig in &spec.signals {
        if !known.contains_key(sig.signal_id.as_str()) {
            errors.push(format!("unknown signal_id: {}", sig.signal_id));
        } else if let Some(meta) = known.get(sig.signal_id.as_str()) {
            if tier_rank(spec.tier) < tier_rank(meta.min_tier) {
                tier_requirements.push(format!(
                    "signal '{}' requires {:?} tier",
                    sig.signal_id, meta.min_tier
                ));
            }
        }
        if !(0.0..=1.0).contains(&sig.weight) {
            warnings.push(format!("signal '{}' weight {} outside [0,1]", sig.signal_id, sig.weight));
        }
    }

    // Entry/exit logic must reference known signals and be non-empty.
    validate_logic(&spec.entry_logic, &known, "entry_logic", &mut errors);
    validate_logic(&spec.exit_logic, &known, "exit_logic", &mut errors);
    if spec.entry_logic.conditions.is_empty() {
        errors.push("entry_logic must contain at least one condition".into());
    }
    if spec.exit_logic.conditions.is_empty() {
        warnings.push("exit_logic is empty; positions will only close at series end or via the circuit breaker".into());
    }

    // Risk sanity.
    let max_dd = frac(spec.risk_params.max_drawdown_pct);
    if !(0.0..1.0).contains(&max_dd) {
        warnings.push("max_drawdown_pct should be in (0,100]; circuit breaker may be ineffective".into());
    }
    if frac(spec.risk_params.position_cap_pct) <= 0.0 {
        errors.push("position_cap_pct must be positive".into());
    }

    // Position sizing sanity.
    match &spec.position_sizing {
        PositionSizing::FixedFractional { fraction } if *fraction <= 0.0 => {
            errors.push("FixedFractional.fraction must be positive".into());
        }
        PositionSizing::Kelly { kelly_fraction } if !(0.0..=1.0).contains(kelly_fraction) => {
            warnings.push("Kelly.kelly_fraction outside [0,1]; full Kelly is rarely advisable".into());
        }
        PositionSizing::VolTarget { target_annual_vol } if *target_annual_vol <= 0.0 => {
            errors.push("VolTarget.target_annual_vol must be positive".into());
        }
        _ => {}
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
        tier_requirements,
    }
}

fn validate_logic(
    expr: &LogicExpression,
    known: &HashMap<&str, &SignalMeta>,
    ctx: &str,
    errors: &mut Vec<String>,
) {
    for c in &expr.conditions {
        if !known.contains_key(c.signal_id.as_str()) {
            errors.push(format!("{ctx} references unknown signal_id: {}", c.signal_id));
        }
    }
}

fn tier_rank(t: UserTier) -> u8 {
    match t {
        UserTier::Free => 0,
        UserTier::Pro => 1,
        UserTier::Institutional => 2,
    }
}

fn frac(pct: f64) -> f64 {
    if pct > 1.0 {
        pct / 100.0
    } else {
        pct
    }
}

// ─── Signal-series resolution ────────────────────────────────────────────────────

/// Build the per-signal value series the engine evaluates, from market data and
/// the causal regime posteriors. `MacroRegime` signals read the filtered
/// risk-on probability; everything else maps to a real wide-parquet column.
/// Missing columns are an error — we never fabricate a series.
pub fn resolve_signal_series(
    spec: &StrategySpec,
    md: &MarketData,
    regime: &RegimeLabels,
) -> Result<HashMap<String, Vec<f64>>, String> {
    let n = md.n;
    let mut out: HashMap<String, Vec<f64>> = HashMap::new();

    // Collect every signal_id referenced by the spec (config + logic).
    let mut ids: Vec<String> = spec.signals.iter().map(|s| s.signal_id.clone()).collect();
    for c in spec.entry_logic.conditions.iter().chain(spec.exit_logic.conditions.iter()) {
        ids.push(c.signal_id.clone());
    }
    ids.sort();
    ids.dedup();

    for id in ids {
        if out.contains_key(&id) {
            continue;
        }
        let series = match id.as_str() {
            "macro_regime_risk_on" => regime
                .filtered
                .iter()
                .map(|p| p.first().copied().unwrap_or(0.0))
                .collect::<Vec<f64>>(),
            "realized_vol_z" => {
                // Reuse the loader's risk proxy if exported; else flag missing.
                md.column("vol_zscore")
                    .map(|c| c.to_vec())
                    .ok_or_else(|| "realized_vol_z requires asset returns".to_string())?
            }
            // Spread / macro signals map to their primary FRED column.
            "yield_curve_10y2y" => column_or_derive(md, "T10Y2Y", &["DGS10", "DGS2"], n)?,
            "yield_curve_10y3m" => column_or_derive(md, "T10Y3M", &["DGS10", "DGS3MO"], n)?,
            "liquidity_composite" => md
                .column("liquidity_composite")
                .map(|c| c.to_vec())
                .ok_or_else(|| "liquidity_composite not present in dataset".to_string())?,
            "inflation_persistence" => md
                .column("inflation_persistence")
                .map(|c| c.to_vec())
                .ok_or_else(|| "inflation_persistence not present in dataset".to_string())?,
            other => md
                .column(other)
                .map(|c| c.to_vec())
                .ok_or_else(|| format!("signal column not found in dataset: {other}"))?,
        };
        if series.len() != n {
            return Err(format!("signal '{id}' length {} != {n} bars", series.len()));
        }
        out.insert(id, series);
    }
    Ok(out)
}

/// Read `primary` if present, else derive `a - b` from the two fallback columns.
fn column_or_derive(
    md: &MarketData,
    primary: &str,
    fallback: &[&str; 2],
    n: usize,
) -> Result<Vec<f64>, String> {
    if let Some(c) = md.column(primary) {
        return Ok(c.to_vec());
    }
    let a = md
        .column(fallback[0])
        .ok_or_else(|| format!("missing {} and {}", primary, fallback[0]))?;
    let b = md
        .column(fallback[1])
        .ok_or_else(|| format!("missing {} and {}", primary, fallback[1]))?;
    Ok((0..n)
        .map(|i| {
            if a[i].is_finite() && b[i].is_finite() {
                a[i] - b[i]
            } else {
                f64::NAN
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec_with(signals: Vec<&str>) -> StrategySpec {
        StrategySpec {
            id: "s".into(),
            name: "s".into(),
            date_range: DateRange { start_date: "2020-01-01".into(), end_date: "2021-01-01".into() },
            signals: signals
                .iter()
                .map(|id| SignalConfig {
                    signal_id: id.to_string(),
                    signal_type: SignalType::MacroRegime,
                    threshold: 0.5,
                    direction: Direction::Above,
                    weight: 1.0,
                })
                .collect(),
            entry_logic: LogicExpression {
                operator: Operator::AND,
                conditions: signals
                    .iter()
                    .map(|id| Condition { signal_id: id.to_string(), direction: None, threshold: None })
                    .collect(),
            },
            exit_logic: LogicExpression {
                operator: Operator::OR,
                conditions: vec![Condition { signal_id: signals[0].to_string(), direction: Some(Direction::Below), threshold: Some(0.5) }],
            },
            position_sizing: PositionSizing::VolTarget { target_annual_vol: 0.1 },
            risk_params: RiskParams {
                max_drawdown_pct: 25.0,
                position_cap_pct: 100.0,
                rebalance_freq: RebalanceFreq::Daily,
                risk_per_trade_pct: 1.0,
                min_rr: 2.0,
            },
            comparison_mode: true,
            tier: UserTier::Pro,
            cost_model: CostModel::default(),
        }
    }

    #[test]
    fn valid_spec_passes() {
        let v = validate(&spec_with(vec!["macro_regime_risk_on"]));
        assert!(v.valid, "{:?}", v.errors);
    }

    #[test]
    fn unknown_signal_is_rejected() {
        let v = validate(&spec_with(vec!["does_not_exist"]));
        assert!(!v.valid);
        assert!(v.errors.iter().any(|e| e.contains("unknown signal_id")));
    }

    #[test]
    fn inverted_date_range_is_rejected() {
        let mut spec = spec_with(vec!["macro_regime_risk_on"]);
        spec.date_range = DateRange { start_date: "2021-01-01".into(), end_date: "2020-01-01".into() };
        assert!(!validate(&spec).valid);
    }

    #[test]
    fn library_signals_are_unique() {
        let lib = signal_library();
        let mut ids: Vec<&str> = lib.signals.iter().map(|s| s.signal_id.as_str()).collect();
        let total = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), total, "duplicate signal_id in library");
    }
}
