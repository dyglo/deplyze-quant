//! Backtest execution core.
//!
//! Execution realism is the whole point of this module — without it, reported
//! Sharpe is fantasy. Concretely:
//!   * **t+1 lag**: a decision made from information available at bar `t`
//!     (signals, regime, sizing) earns the return of bar `t+1`. We never let a
//!     bar's own return inform the position that earns it.
//!   * **Transaction costs**: commission + slippage are charged on *turnover*
//!     (|Δweight|) every time the target weight changes.
//!   * **Causal sizing**: vol-target and fractional-Kelly weights use only a
//!     trailing window of returns; no full-sample statistics leak in.
//!   * **Circuit breaker**: when drawdown breaches the risk limit the book is
//!     flattened and held flat through a cooldown.
//!
//! The strategy is long/flat in Sprint 1 (a signal gate decides "in market or
//! not"; sizing decides how much). Regime labels are the **causal filtered**
//! posteriors from [`crate::regime`] — never the smoothed Viterbi path.

use std::collections::HashMap;

use chrono::NaiveDate;

use crate::metrics;
use crate::models::*;
use crate::regime::RegimeLabels;

/// Trailing window for causal sizing statistics (≈ one quarter).
const SIZING_WINDOW: usize = 63;
/// Cooldown (bars) the book stays flat after a circuit-breaker trip.
const BREAKER_COOLDOWN: usize = 21;
/// Lookbacks for the 12-1 momentum comparison baseline (skip most recent month).
const MOM_LONG: usize = 252;
const MOM_SKIP: usize = 21;

/// Everything the engine needs, already loaded and decoded.
pub struct EngineInputs<'a> {
    pub spec: &'a StrategySpec,
    pub dates: &'a [String],
    pub returns: &'a [f64],
    pub regime: &'a RegimeLabels,
    /// Resolved signal series keyed by `signal_id` (length == dates).
    pub signal_series: HashMap<String, Vec<f64>>,
    /// Adjusted close for the momentum baseline (optional).
    pub asset_close: Option<&'a [f64]>,
}

/// Internal per-run simulation output.
struct SimResult {
    gross_returns: Vec<f64>, // length n; before transaction costs
    net_returns: Vec<f64>,   // length n; index 0 == 0.0 (no prior position)
    equity: Vec<f64>,        // length n; equity[0] == 1.0
    gross_equity: Vec<f64>,  // cost-free equity path for cost-drag reporting
    weights: Vec<f64>,       // target weight decided at each bar t
    trades: Vec<Trade>,
    total_cost: f64,
}

// ─── Public entry point ─────────────────────────────────────────────────────────

pub fn run(inputs: &EngineInputs) -> BacktestResults {
    let n = inputs.returns.len();
    let spec = inputs.spec;

    // Resolve entry/exit boolean series, then the long/flat gate.
    let entry = eval_logic(&spec.entry_logic, spec, &inputs.signal_series, n);
    let exit = eval_logic(&spec.exit_logic, spec, &inputs.signal_series, n);
    let (gate, ensemble) = build_signal_gate(inputs, &entry, &exit);

    let sim = simulate(inputs, &gate);

    let aggregate_metrics = aggregate(&sim, n);
    let regime_metrics = partition_by_regime(&sim, inputs.regime);
    let signal_attribution = attribution(inputs, &entry, &exit, &sim);
    let expectancy_metrics = expectancy(&sim, spec.starting_capital, aggregate_metrics.max_drawdown);
    let walk_forward = walk_forward(inputs, &sim);
    let transaction_costs = transaction_cost_summary(&sim);

    let (comparison, baseline_equity) = if spec.comparison_mode {
        let (cmp, bline) = compare_to_baseline(inputs, &sim);
        (Some(cmp), Some(bline))
    } else {
        (None, None)
    };

    let equity_curve = build_equity_curve(inputs, &sim);

    // Buy-and-hold equity: compound the raw asset returns bar-by-bar.
    let buy_hold_equity: Vec<f64> = {
        let mut eq = Vec::with_capacity(n);
        let mut e = 1.0f64;
        eq.push(e);
        for t in 1..n {
            e = (e * (1.0 + inputs.returns[t])).max(1e-9);
            eq.push(e);
        }
        eq
    };

    let dollar_summary = build_dollar_summary(
        spec.starting_capital,
        &sim.equity,
        &buy_hold_equity,
        baseline_equity.as_deref(),
        inputs.dates,
    );

    BacktestResults {
        strategy_id: spec.id.clone(),
        equity_curve,
        trade_log: sim.trades,
        aggregate_metrics,
        regime_metrics,
        signal_attribution,
        comparison,
        dollar_summary: Some(dollar_summary),
        expectancy_metrics: Some(expectancy_metrics),
        walk_forward,
        transaction_costs: Some(transaction_costs),
        ensemble,
        bars: n,
        data_through: inputs.dates.last().cloned().unwrap_or_default(),
    }
}

// ─── Signal logic ───────────────────────────────────────────────────────────────

fn signal_defaults(spec: &StrategySpec, id: &str) -> (Option<Direction>, Option<f64>) {
    spec.signals
        .iter()
        .find(|s| s.signal_id == id)
        .map(|s| (Some(s.direction), Some(s.threshold)))
        .unwrap_or((None, None))
}

fn cond_met(series: &[f64], t: usize, dir: Direction, thr: f64) -> bool {
    let v = series[t];
    if !v.is_finite() {
        return false;
    }
    match dir {
        Direction::Above => v > thr,
        Direction::Below => v < thr,
        Direction::CrossUp => t > 0 && series[t - 1].is_finite() && series[t - 1] <= thr && v > thr,
        Direction::CrossDown => {
            t > 0 && series[t - 1].is_finite() && series[t - 1] >= thr && v < thr
        }
    }
}

/// Evaluate a flat AND/OR expression into a per-bar boolean series. An optional
/// `skip` signal_id is excluded (used for leave-one-out attribution).
fn eval_logic_skip(
    expr: &LogicExpression,
    spec: &StrategySpec,
    series: &HashMap<String, Vec<f64>>,
    n: usize,
    skip: Option<&str>,
) -> Vec<bool> {
    // Materialize the active conditions once.
    let active: Vec<(&[f64], Direction, f64)> = expr
        .conditions
        .iter()
        .filter(|c| skip.map_or(true, |s| c.signal_id != s))
        .filter_map(|c| {
            let s = series.get(&c.signal_id)?;
            let (def_dir, def_thr) = signal_defaults(spec, &c.signal_id);
            let dir = c.direction.or(def_dir)?;
            let thr = c.threshold.or(def_thr)?;
            Some((s.as_slice(), dir, thr))
        })
        .collect();

    let mut out = vec![false; n];
    if active.is_empty() {
        // No resolvable conditions: AND over empty = false (never trigger),
        // which is the safe default for both entry and exit when a signal was
        // dropped. Exit handled separately by the gate.
        return out;
    }
    for t in 0..n {
        let mut acc = match expr.operator {
            Operator::AND => true,
            Operator::OR => false,
        };
        for (s, dir, thr) in &active {
            let m = cond_met(s, t, *dir, *thr);
            acc = match expr.operator {
                Operator::AND => acc && m,
                Operator::OR => acc || m,
            };
        }
        out[t] = acc;
    }
    out
}

fn eval_logic(
    expr: &LogicExpression,
    spec: &StrategySpec,
    series: &HashMap<String, Vec<f64>>,
    n: usize,
) -> Vec<bool> {
    eval_logic_skip(expr, spec, series, n, None)
}

/// Long/flat gate state machine: enter on entry, exit on exit, otherwise hold.
fn build_gate(entry: &[bool], exit: &[bool]) -> Vec<bool> {
    let n = entry.len();
    let mut gate = vec![false; n];
    let mut in_mkt = false;
    for t in 0..n {
        if in_mkt {
            if exit[t] {
                in_mkt = false;
            }
        } else if entry[t] {
            in_mkt = true;
        }
        gate[t] = in_mkt;
    }
    gate
}

fn build_signal_gate(
    inputs: &EngineInputs,
    entry: &[bool],
    exit: &[bool],
) -> (Vec<bool>, Option<EnsembleDiagnostics>) {
    if inputs.spec.signals.len() <= 1 {
        return (build_gate(entry, exit), None);
    }
    let n = inputs.returns.len();
    let mut scored: Vec<(&SignalConfig, Vec<f64>)> = Vec::new();
    for sig in &inputs.spec.signals {
        let Some(series) = inputs.signal_series.get(&sig.signal_id) else { continue };
        let signed: Vec<f64> = series
            .iter()
            .map(|v| {
                if !v.is_finite() {
                    0.0
                } else {
                    match sig.direction {
                        Direction::Above | Direction::CrossUp => *v - sig.threshold,
                        Direction::Below | Direction::CrossDown => sig.threshold - *v,
                    }
                }
            })
            .collect();
        scored.push((sig, trailing_zscore(&signed, 60)));
    }
    if scored.is_empty() {
        return (build_gate(entry, exit), None);
    }

    let mut in_mkt = false;
    let mut gate = vec![false; n];
    let mut weight_sums: Vec<[f64; 3]> = vec![[0.0; 3]; scored.len()];
    let mut weight_counts: Vec<[u32; 3]> = vec![[0; 3]; scored.len()];

    for t in 0..n {
        let regime = inputs.regime.filtered_state.get(t).copied().unwrap_or(0).min(2) as usize;
        let raw_weights: Vec<f64> = scored
            .iter()
            .map(|(sig, score)| {
                let learned = trailing_regime_sharpe(score, inputs.returns, &inputs.regime.filtered_state, t, regime);
                sig.weight.max(0.0) * learned.max(0.0)
            })
            .collect();
        let fallback = raw_weights.iter().all(|w| *w <= 1e-12);
        let mut denom = 0.0;
        let mut combined = 0.0;
        for (i, (sig, score)) in scored.iter().enumerate() {
            let w = if fallback { sig.weight.max(0.0) } else { raw_weights[i] };
            denom += w.abs();
            combined += w * score[t];
            weight_sums[i][regime] += w;
            weight_counts[i][regime] += 1;
        }
        let ensemble_entry = denom > 1e-12 && combined / denom > 0.0;
        if in_mkt {
            if exit[t] || !ensemble_entry {
                in_mkt = false;
            }
        } else if entry[t] || ensemble_entry {
            in_mkt = true;
        }
        gate[t] = in_mkt;
    }

    let diagnostics = scored
        .iter()
        .enumerate()
        .map(|(i, (sig, _))| {
            let avg = |r: usize| {
                if weight_counts[i][r] > 0 {
                    weight_sums[i][r] / weight_counts[i][r] as f64
                } else {
                    0.0
                }
            };
            SignalConfidence {
                signal_id: sig.signal_id.clone(),
                avg_confidence_weight: (avg(0) + avg(1) + avg(2)) / 3.0,
                risk_on_weight: avg(0),
                transitional_weight: avg(1),
                risk_off_weight: avg(2),
            }
        })
        .collect();

    (
        gate,
        Some(EnsembleDiagnostics {
            combination_method: CombinationMethod::RegimeConditional,
            signals: diagnostics,
        }),
    )
}

fn trailing_zscore(values: &[f64], window: usize) -> Vec<f64> {
    let mut out = vec![0.0; values.len()];
    for t in 0..values.len() {
        let lo = (t + 1).saturating_sub(window);
        let slice: Vec<f64> = values[lo..=t].iter().copied().filter(|v| v.is_finite()).collect();
        if slice.len() < 10 {
            continue;
        }
        let m = metrics::Moments::from_slice(&slice);
        if m.std_dev > 1e-12 {
            out[t] = ((values[t] - m.mean) / m.std_dev).clamp(-5.0, 5.0);
        }
    }
    out
}

fn trailing_regime_sharpe(
    score: &[f64],
    returns: &[f64],
    states: &[u8],
    t: usize,
    regime: usize,
) -> f64 {
    let lo = t.saturating_sub(252);
    let mut contrib = Vec::new();
    for k in lo..t {
        if k + 1 >= returns.len() || states.get(k).copied().unwrap_or(0) as usize != regime {
            continue;
        }
        contrib.push(score[k].signum() * returns[k + 1]);
    }
    if contrib.len() < 20 {
        return 1.0;
    }
    let m = metrics::Moments::from_slice(&contrib);
    if m.std_dev <= 1e-12 {
        1.0
    } else {
        (m.mean / m.std_dev * (252.0_f64).sqrt()).max(0.0)
    }
}

// ─── Simulation ─────────────────────────────────────────────────────────────────

fn as_fraction(pct: f64) -> f64 {
    if pct > 1.0 {
        pct / 100.0
    } else {
        pct
    }
}

/// Causal target weight at bar `t` given the gate is "in market".
fn sized_weight(returns: &[f64], t: usize, sizing: &PositionSizing, cap: f64) -> f64 {
    let raw = match sizing {
        PositionSizing::FixedFractional { fraction } => *fraction,
        PositionSizing::EqualWeight => 1.0,
        PositionSizing::VolTarget { target_annual_vol } => {
            let v = trailing_vol(returns, t);
            if v > 1e-9 {
                target_annual_vol / v
            } else {
                0.0
            }
        }
        PositionSizing::Kelly { kelly_fraction } => {
            let (mu, var) = trailing_mean_var(returns, t);
            if var > 1e-12 {
                kelly_fraction * (mu / var)
            } else {
                0.0
            }
        }
    };
    raw.clamp(0.0, cap)
}

/// Annualized trailing volatility using returns in (t-window, t], causal.
fn trailing_vol(returns: &[f64], t: usize) -> f64 {
    let lo = (t + 1).saturating_sub(SIZING_WINDOW);
    let slice = &returns[lo..=t];
    if slice.len() < 2 {
        return 0.0;
    }
    metrics::Moments::from_slice(slice).std_dev * (252.0_f64).sqrt()
}

fn trailing_mean_var(returns: &[f64], t: usize) -> (f64, f64) {
    let lo = (t + 1).saturating_sub(SIZING_WINDOW);
    let slice = &returns[lo..=t];
    if slice.len() < 2 {
        return (0.0, 0.0);
    }
    let m = metrics::Moments::from_slice(slice);
    (m.mean, m.variance)
}

fn simulate(inputs: &EngineInputs, gate: &[bool]) -> SimResult {
    let returns = inputs.returns;
    let n = returns.len();
    let spec = inputs.spec;
    let cap = as_fraction(spec.risk_params.position_cap_pct);
    let max_dd = as_fraction(spec.risk_params.max_drawdown_pct);
    let cost_rate = (spec.cost_model.commission_bps
        + spec.cost_model.slippage_bps
        + spec.cost_model.spread_bps)
        / 10_000.0;
    let fixed_commission_return = if spec.starting_capital > 0.0 {
        spec.cost_model.commission_per_trade / spec.starting_capital
    } else {
        0.0
    };
    let financing_daily = spec.cost_model.financing_rate_annual / 252.0;

    let mut weights = vec![0.0f64; n];
    let mut gross_returns = vec![0.0f64; n];
    let mut net_returns = vec![0.0f64; n];
    let mut equity = vec![1.0f64; n];
    let mut gross_equity = vec![1.0f64; n];
    let mut peak = 1.0f64;
    let mut cooldown = 0usize;
    let mut total_cost = 0.0f64;

    let mut prev_w = 0.0f64;

    for t in 0..n {
        // Decide target weight from info available at bar t.
        let mut target = if gate[t] {
            sized_weight(returns, t, &spec.position_sizing, cap)
        } else {
            0.0
        };

        // Circuit breaker: if drawdown already breached, flatten + cooldown.
        let dd = if peak > 0.0 { (peak - equity[t]) / peak } else { 0.0 };
        if cooldown > 0 {
            target = 0.0;
            cooldown -= 1;
        } else if max_dd > 0.0 && dd >= max_dd {
            target = 0.0;
            cooldown = BREAKER_COOLDOWN;
        }

        weights[t] = target;

        // Turnover cost charged at t for moving prev_w -> target.
        let turnover = (target - prev_w).abs();
        let fixed = if turnover > 1e-9 { fixed_commission_return } else { 0.0 };
        let financing = target.max(1.0) - 1.0;
        let financing_cost = financing.max(0.0) * financing_daily;
        let cost = turnover * cost_rate + fixed + financing_cost;
        total_cost += cost.max(0.0);

        // t+1 execution: this weight earns next bar's return.
        if t + 1 < n {
            let pnl = target * returns[t + 1];
            gross_returns[t + 1] = pnl;
            let net = pnl - cost;
            net_returns[t + 1] = net;
            gross_equity[t + 1] = (gross_equity[t] * (1.0 + pnl)).max(1e-9);
            equity[t + 1] = (equity[t] * (1.0 + net)).max(1e-9);
            if equity[t + 1] > peak {
                peak = equity[t + 1];
            }
        } else {
            // Final bar: only the exit cost hits equity (no future return).
            gross_equity[t] = gross_equity[t].max(1e-9);
            equity[t] = (equity[t] * (1.0 - cost)).max(1e-9);
        }
        prev_w = target;
    }

    let trades = extract_trades(inputs, &weights, &net_returns);

    SimResult { gross_returns, net_returns, equity, gross_equity, weights, trades, total_cost }
}

/// Reconstruct trades from the realized weight path (entry when weight goes
/// 0→>0, exit when it returns to 0).
fn extract_trades(inputs: &EngineInputs, weights: &[f64], net_returns: &[f64]) -> Vec<Trade> {
    let n = weights.len();
    let mut trades = Vec::new();
    let mut open: Option<(usize, f64)> = None; // (entry_idx, compounded growth)

    for t in 0..n {
        let in_pos = weights[t] > 1e-9;
        match (&mut open, in_pos) {
            (None, true) => {
                open = Some((t, 1.0));
            }
            (Some((_, growth)), true) => {
                // Returns realized on bar t came from weight[t-1]; accumulate.
                if t < n {
                    *growth *= 1.0 + net_returns[t];
                }
            }
            (Some((entry_idx, growth)), false) => {
                let g = *growth * (1.0 + net_returns[t]);
                let entry_idx = *entry_idx;
                trades.push(make_trade(inputs, entry_idx, t, g - 1.0));
                open = None;
            }
            (None, false) => {}
        }
    }
    // Close any position still open at series end.
    if let Some((entry_idx, growth)) = open {
        trades.push(make_trade(inputs, entry_idx, n - 1, growth - 1.0));
    }
    trades
}

fn make_trade(inputs: &EngineInputs, entry_idx: usize, exit_idx: usize, pnl_pct: f64) -> Trade {
    let entry_ts = inputs.dates.get(entry_idx).cloned().unwrap_or_default();
    let exit_ts = inputs.dates.get(exit_idx).cloned().unwrap_or_default();
    let duration_days = day_diff(&entry_ts, &exit_ts);
    let regime_at_entry = inputs
        .regime
        .filtered_state
        .get(entry_idx)
        .copied()
        .unwrap_or(0);
    // Signals that were truthy at entry (best-effort, for the trade log).
    let signals_triggered: Vec<String> = inputs
        .signal_series
        .keys()
        .filter(|k| {
            inputs.signal_series[*k]
                .get(entry_idx)
                .map_or(false, |v| v.is_finite())
        })
        .cloned()
        .collect();
    Trade {
        entry_ts,
        exit_ts,
        pnl_pct,
        regime_at_entry,
        duration_days,
        signals_triggered,
    }
}

fn day_diff(a: &str, b: &str) -> f64 {
    match (
        NaiveDate::parse_from_str(a, "%Y-%m-%d"),
        NaiveDate::parse_from_str(b, "%Y-%m-%d"),
    ) {
        (Ok(d1), Ok(d2)) => (d2 - d1).num_days() as f64,
        _ => 0.0,
    }
}

// ─── Metrics assembly ────────────────────────────────────────────────────────────

fn aggregate(sim: &SimResult, _n: usize) -> AggregateMetrics {
    // Realized strategy returns start at index 1.
    let r: Vec<f64> = sim.net_returns.iter().skip(1).copied().collect();
    let m = metrics::Moments::from_slice(&r);
    let sharpe = metrics::lo_annualized_sharpe(&r, 0.0);
    let psr = metrics::probabilistic_sharpe(&r, 0.0, 0.0);
    // Multiple-testing: number of signals as a conservative trial count.
    let num_trials = sim.trades.len().max(1) + 1;
    let dsr = metrics::deflated_sharpe(&r, 0.0, num_trials, None);
    let sortino = metrics::annualized_sortino(&r, 0.0);
    let mdd = metrics::max_drawdown(&sim.equity);
    let cagr = metrics::cagr(&sim.equity);
    let calmar = if mdd > 1e-9 { cagr / mdd } else { 0.0 };
    let ann_vol = metrics::annual_volatility(&r);

    let (wins, losses, gross_win, gross_loss) = sim.trades.iter().fold(
        (0u32, 0u32, 0.0f64, 0.0f64),
        |(w, l, gw, gl), t| {
            if t.pnl_pct > 0.0 {
                (w + 1, l, gw + t.pnl_pct, gl)
            } else {
                (w, l + 1, gw, gl + t.pnl_pct.abs())
            }
        },
    );
    let total = wins + losses;
    let win_rate = if total > 0 { wins as f64 / total as f64 } else { 0.0 };
    let profit_factor = if gross_loss > 1e-12 {
        gross_win / gross_loss
    } else if gross_win > 0.0 {
        f64::INFINITY
    } else {
        0.0
    };
    let avg_dur = if total > 0 {
        sim.trades.iter().map(|t| t.duration_days).sum::<f64>() / total as f64
    } else {
        0.0
    };

    AggregateMetrics {
        sharpe_ratio: sharpe,
        deflated_sharpe_ratio: dsr,
        probabilistic_sharpe_ratio: psr,
        sortino_ratio: sortino,
        calmar_ratio: calmar,
        cagr,
        annual_volatility: ann_vol,
        max_drawdown: mdd,
        win_rate,
        profit_factor: if profit_factor.is_finite() { profit_factor } else { 0.0 },
        total_trades: total,
        avg_trade_duration_days: avg_dur,
        skewness: m.skewness,
        excess_kurtosis: m.excess_kurtosis,
    }
}

fn expectancy(sim: &SimResult, starting_capital: f64, max_drawdown: f64) -> ExpectancyMetrics {
    if sim.trades.is_empty() {
        return ExpectancyMetrics::default();
    }
    let wins: Vec<f64> = sim.trades.iter().filter(|t| t.pnl_pct > 0.0).map(|t| t.pnl_pct).collect();
    let losses: Vec<f64> = sim.trades.iter().filter(|t| t.pnl_pct <= 0.0).map(|t| t.pnl_pct.abs()).collect();
    let win_rate = wins.len() as f64 / sim.trades.len() as f64;
    let avg_win = if wins.is_empty() { 0.0 } else { wins.iter().sum::<f64>() / wins.len() as f64 };
    let avg_loss = if losses.is_empty() { 0.0 } else { losses.iter().sum::<f64>() / losses.len() as f64 };
    let expectancy_pct = win_rate * avg_win - (1.0 - win_rate) * avg_loss;
    let r_multiple_distribution: Vec<f64> = if avg_loss > 1e-12 {
        sim.trades.iter().map(|t| t.pnl_pct / avg_loss).collect()
    } else {
        Vec::new()
    };
    let sqn = if r_multiple_distribution.len() >= 2 {
        let m = metrics::Moments::from_slice(&r_multiple_distribution);
        if m.std_dev > 1e-12 {
            m.mean / m.std_dev * (r_multiple_distribution.len() as f64).sqrt()
        } else {
            0.0
        }
    } else {
        0.0
    };
    let mut current_losses = 0u32;
    let mut max_losses = 0u32;
    for t in &sim.trades {
        if t.pnl_pct <= 0.0 {
            current_losses += 1;
            max_losses = max_losses.max(current_losses);
        } else {
            current_losses = 0;
        }
    }
    let total_net_profit = sim.equity.last().copied().unwrap_or(1.0) - 1.0;
    ExpectancyMetrics {
        expectancy_per_trade: expectancy_pct * starting_capital,
        expectancy_per_dollar: if avg_loss > 1e-12 { expectancy_pct / avg_loss } else { 0.0 },
        r_multiple_distribution,
        system_quality_number: sqn,
        avg_win_loss_ratio: if avg_loss > 1e-12 { avg_win / avg_loss } else { 0.0 },
        largest_win_pct: wins.iter().copied().fold(0.0, f64::max),
        largest_loss_pct: losses.iter().copied().fold(0.0, f64::max),
        consecutive_losses_max: max_losses,
        recovery_factor: if max_drawdown > 1e-12 { total_net_profit / max_drawdown } else { 0.0 },
    }
}

fn transaction_cost_summary(sim: &SimResult) -> TransactionCostSummary {
    let gross_r: Vec<f64> = sim.gross_returns.iter().skip(1).copied().collect();
    let net_r: Vec<f64> = sim.net_returns.iter().skip(1).copied().collect();
    let gross_cagr = metrics::cagr(&sim.gross_equity);
    let net_cagr = metrics::cagr(&sim.equity);
    let gross_sharpe = metrics::lo_annualized_sharpe(&gross_r, 0.0);
    let net_sharpe = metrics::lo_annualized_sharpe(&net_r, 0.0);
    TransactionCostSummary {
        gross_cagr,
        net_cagr,
        gross_sharpe,
        net_sharpe,
        annual_return_drag: gross_cagr - net_cagr,
        sharpe_drag: gross_sharpe - net_sharpe,
        total_cost_pct: sim.total_cost,
    }
}

fn walk_forward(inputs: &EngineInputs, sim: &SimResult) -> Option<WalkForwardResults> {
    let n = sim.net_returns.len();
    if n < 252 * 3 {
        return None;
    }
    let cfg = WalkForwardConfig { n_windows: 5, train_pct: 0.70, test_pct: 0.30, anchored: true };
    let step = (n / cfg.n_windows as usize).max(1);
    let mut windows = Vec::new();
    for w in 1..=cfg.n_windows as usize {
        let test_start = w * step;
        if test_start + 20 >= n {
            break;
        }
        let test_end = ((w + 1) * step).min(n - 1);
        if test_end <= test_start + 20 {
            continue;
        }
        let train_start = 1usize;
        let train_end = test_start.saturating_sub(1);
        let train = &sim.net_returns[train_start..=train_end];
        let test = &sim.net_returns[test_start..=test_end];
        windows.push(WalkForwardWindow {
            train_start: inputs.dates.get(train_start).cloned().unwrap_or_default(),
            train_end: inputs.dates.get(train_end).cloned().unwrap_or_default(),
            test_start: inputs.dates.get(test_start).cloned().unwrap_or_default(),
            test_end: inputs.dates.get(test_end).cloned().unwrap_or_default(),
            insample_sharpe: metrics::lo_annualized_sharpe(train, 0.0),
            oos_sharpe: metrics::lo_annualized_sharpe(test, 0.0),
        });
    }
    if windows.is_empty() {
        return None;
    }
    let insample = windows.iter().map(|w| w.insample_sharpe).sum::<f64>() / windows.len() as f64;
    let oos = windows.iter().map(|w| w.oos_sharpe).sum::<f64>() / windows.len() as f64;
    let ratio = if insample.abs() > 1e-12 { oos / insample } else { 0.0 };
    let consistency =
        windows.iter().filter(|w| w.oos_sharpe > 0.0).count() as f64 / windows.len() as f64;
    let warning = if ratio < 0.5 {
        Some("Overfitting detected - this strategy may not perform as shown in live trading.".to_string())
    } else {
        None
    };
    Some(WalkForwardResults {
        config: cfg,
        windows,
        insample_sharpe: insample,
        oos_sharpe: oos,
        oos_vs_insample_ratio: ratio,
        consistency_score: consistency,
        warning,
    })
}

fn partition_by_regime(sim: &SimResult, regime: &RegimeLabels) -> RegimeMetrics {
    let n = sim.net_returns.len();
    let mut buckets: [Vec<f64>; 3] = [Vec::new(), Vec::new(), Vec::new()];
    // Return realized at bar t was decided at t-1; attribute to regime at t-1.
    for t in 1..n {
        let s = regime.filtered_state.get(t - 1).copied().unwrap_or(0) as usize;
        if s < 3 {
            buckets[s].push(sim.net_returns[t]);
        }
    }
    let part = |r: &[f64]| -> PartitionMetrics {
        if r.is_empty() {
            return PartitionMetrics::default();
        }
        let mut eq = Vec::with_capacity(r.len() + 1);
        let mut e = 1.0;
        eq.push(e);
        for &x in r {
            e *= 1.0 + x;
            eq.push(e);
        }
        let wins = r.iter().filter(|x| **x > 0.0).count();
        PartitionMetrics {
            sharpe_ratio: metrics::lo_annualized_sharpe(r, 0.0),
            max_drawdown: metrics::max_drawdown(&eq),
            win_rate: wins as f64 / r.len() as f64,
            avg_duration_days: 0.0,
            days_in_regime: r.len() as u32,
            annualized_return: metrics::Moments::from_slice(r).mean * 252.0,
        }
    };
    RegimeMetrics {
        risk_on: part(&buckets[0]),
        transitional: part(&buckets[1]),
        risk_off: part(&buckets[2]),
    }
}

/// Leave-one-out marginal Sharpe per signal.
fn attribution(
    inputs: &EngineInputs,
    _entry: &[bool],
    _exit: &[bool],
    full: &SimResult,
) -> Vec<SignalAttribution> {
    let n = inputs.returns.len();
    let full_sharpe = {
        let r: Vec<f64> = full.net_returns.iter().skip(1).copied().collect();
        metrics::lo_annualized_sharpe(&r, 0.0)
    };
    inputs
        .spec
        .signals
        .iter()
        .map(|sig| {
            let id = sig.signal_id.as_str();
            let entry_loo = eval_logic_skip(&inputs.spec.entry_logic, inputs.spec, &inputs.signal_series, n, Some(id));
            let exit_loo = eval_logic_skip(&inputs.spec.exit_logic, inputs.spec, &inputs.signal_series, n, Some(id));
            let gate = build_gate(&entry_loo, &exit_loo);
            let loo = simulate(inputs, &gate);
            let r: Vec<f64> = loo.net_returns.iter().skip(1).copied().collect();
            let loo_sharpe = metrics::lo_annualized_sharpe(&r, 0.0);
            let active_weight = avg_active_weight(inputs.signal_series.get(id), &full.weights);
            SignalAttribution {
                signal_id: id.to_string(),
                marginal_sharpe: full_sharpe - loo_sharpe,
                avg_active_weight: active_weight,
                trades_triggered: loo.trades.len() as u32,
            }
        })
        .collect()
}

fn avg_active_weight(series: Option<&Vec<f64>>, weights: &[f64]) -> f64 {
    let Some(s) = series else { return 0.0 };
    let mut sum = 0.0;
    let mut cnt = 0;
    for (i, &w) in weights.iter().enumerate() {
        if w > 1e-9 && s.get(i).map_or(false, |v| v.is_finite()) {
            sum += w;
            cnt += 1;
        }
    }
    if cnt > 0 {
        sum / cnt as f64
    } else {
        0.0
    }
}

// ─── Comparison baseline (12-1 time-series momentum) ─────────────────────────────

fn compare_to_baseline(inputs: &EngineInputs, enhanced: &SimResult) -> (ComparisonResults, Vec<f64>) {
    let n = inputs.returns.len();
    let gate = momentum_gate(inputs.asset_close, n);
    // Baseline uses the same cost model but a simple full-notional sizing.
    let baseline_spec = StrategySpec {
        position_sizing: PositionSizing::FixedFractional { fraction: 1.0 },
        ..clone_spec_for_baseline(inputs.spec)
    };
    let baseline_inputs = EngineInputs {
        spec: &baseline_spec,
        dates: inputs.dates,
        returns: inputs.returns,
        regime: inputs.regime,
        signal_series: HashMap::new(),
        asset_close: inputs.asset_close,
    };
    let baseline = simulate(&baseline_inputs, &gate);
    let baseline_equity = baseline.equity.clone();

    let baseline_metrics = aggregate(&baseline, n);
    let enhanced_metrics = aggregate(enhanced, n);
    let sharpe_delta = enhanced_metrics.sharpe_ratio - baseline_metrics.sharpe_ratio;
    let drawdown_reduction_pct = if baseline_metrics.max_drawdown > 1e-9 {
        (baseline_metrics.max_drawdown - enhanced_metrics.max_drawdown)
            / baseline_metrics.max_drawdown
            * 100.0
    } else {
        0.0
    };
    // Bounded composite: blends Sharpe improvement and drawdown reduction.
    let dd_frac = (drawdown_reduction_pct / 100.0).clamp(-1.0, 1.0);
    let signal_value_score =
        (0.5 + 0.25 * sharpe_delta.tanh() + 0.25 * dd_frac).clamp(0.0, 1.0);

    (ComparisonResults {
        baseline_metrics,
        enhanced_metrics,
        sharpe_delta,
        drawdown_reduction_pct,
        signal_value_score,
    }, baseline_equity)
}

fn clone_spec_for_baseline(spec: &StrategySpec) -> StrategySpec {
    StrategySpec {
        id: format!("{}__baseline", spec.id),
        name: format!("{} (12-1 momentum baseline)", spec.name),
        date_range: spec.date_range.clone(),
        signals: vec![],
        entry_logic: spec.entry_logic.clone(),
        exit_logic: spec.exit_logic.clone(),
        position_sizing: PositionSizing::FixedFractional { fraction: 1.0 },
        risk_params: spec.risk_params.clone(),
        comparison_mode: false,
        tier: spec.tier,
        cost_model: spec.cost_model.clone(),
        instrument: spec.instrument.clone(),
        starting_capital: spec.starting_capital,
    }
}

/// 12-1 momentum: long when price 12 months ago → 1 month ago rose.
fn momentum_gate(close: Option<&[f64]>, n: usize) -> Vec<bool> {
    let mut gate = vec![false; n];
    let Some(c) = close else { return gate };
    for t in 0..n {
        if t < MOM_LONG {
            continue;
        }
        let p_old = c[t - MOM_LONG];
        let p_recent = c[t - MOM_SKIP];
        if p_old.is_finite() && p_recent.is_finite() && p_old > 0.0 {
            gate[t] = p_recent / p_old - 1.0 > 0.0;
        }
    }
    gate
}

// ─── Dollar summary ──────────────────────────────────────────────────────────────

fn build_dollar_summary(
    capital: f64,
    enhanced_equity: &[f64],
    buy_hold_equity: &[f64],
    baseline_equity: Option<&[f64]>,
    dates: &[String],
) -> crate::models::DollarSummary {
    use crate::models::{DollarPoint, DollarSummary};
    let n = enhanced_equity.len().min(buy_hold_equity.len()).min(dates.len());
    let curve: Vec<DollarPoint> = (0..n)
        .map(|i| DollarPoint {
            timestamp: dates[i].clone(),
            enhanced: capital * enhanced_equity[i],
            buy_hold: capital * buy_hold_equity[i],
            baseline: baseline_equity.and_then(|b| b.get(i)).map(|v| capital * v),
        })
        .collect();
    let enhanced_final = curve.last().map(|p| p.enhanced).unwrap_or(capital);
    let buy_hold_final = curve.last().map(|p| p.buy_hold).unwrap_or(capital);
    let baseline_final = baseline_equity.and_then(|b| b.last()).map(|v| capital * v);
    DollarSummary { starting_capital: capital, enhanced_final, buy_hold_final, baseline_final, curve }
}

// ─── Equity curve ────────────────────────────────────────────────────────────────

fn build_equity_curve(inputs: &EngineInputs, sim: &SimResult) -> Vec<EquityPoint> {
    let n = sim.equity.len();
    let mut peak = f64::NEG_INFINITY;
    let mut out = Vec::with_capacity(n);
    for t in 0..n {
        let v = sim.equity[t];
        if v > peak {
            peak = v;
        }
        let dd = if peak > 0.0 { (v - peak) / peak } else { 0.0 };
        let probs = inputs
            .regime
            .filtered
            .get(t)
            .map(|p| {
                let mut a = [0.0; 3];
                for (i, x) in p.iter().take(3).enumerate() {
                    a[i] = *x;
                }
                a
            })
            .unwrap_or([0.0; 3]);
        out.push(EquityPoint {
            timestamp: inputs.dates.get(t).cloned().unwrap_or_default(),
            value: v,
            drawdown: dd,
            regime_state: inputs.regime.filtered_state.get(t).copied().unwrap_or(0),
            regime_probabilities: probs,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::regime::RegimeLabels;

    fn make_regime(n: usize) -> RegimeLabels {
        RegimeLabels {
            filtered: vec![vec![1.0, 0.0, 0.0]; n],
            filtered_state: vec![0u8; n],
            viterbi: vec![0u8; n],
        }
    }

    fn base_spec() -> StrategySpec {
        StrategySpec {
            id: "t".into(),
            name: "t".into(),
            date_range: DateRange { start_date: "2020-01-01".into(), end_date: "2020-12-31".into() },
            signals: vec![SignalConfig {
                signal_id: "sig".into(),
                signal_type: SignalType::MomentumFactor,
                threshold: 0.0,
                direction: Direction::Above,
                weight: 1.0,
            }],
            entry_logic: LogicExpression {
                operator: Operator::AND,
                conditions: vec![Condition { signal_id: "sig".into(), direction: Some(Direction::Above), threshold: Some(0.0) }],
            },
            exit_logic: LogicExpression {
                operator: Operator::AND,
                conditions: vec![Condition { signal_id: "sig".into(), direction: Some(Direction::Below), threshold: Some(0.0) }],
            },
            position_sizing: PositionSizing::FixedFractional { fraction: 1.0 },
            risk_params: RiskParams {
                max_drawdown_pct: 0.5,
                position_cap_pct: 1.0,
                rebalance_freq: RebalanceFreq::Daily,
                risk_per_trade_pct: 1.0,
                min_rr: 2.0,
            },
            comparison_mode: false,
            tier: UserTier::Pro,
            cost_model: CostModel { commission_bps: 1.0, slippage_bps: 2.0, ..CostModel::default() },
            instrument: "SPY".to_string(),
            starting_capital: 10_000.0,
        }
    }

    fn dates(n: usize) -> Vec<String> {
        (0..n)
            .map(|i| {
                let d = NaiveDate::from_ymd_opt(2020, 1, 1).unwrap() + chrono::Duration::days(i as i64);
                d.format("%Y-%m-%d").to_string()
            })
            .collect()
    }

    #[test]
    fn no_lookahead_position_earns_next_bar() {
        // Signal is on for one bar only at t=5; the position must earn the t=6 return.
        let n = 10;
        let mut sig = vec![-1.0; n];
        sig[5] = 1.0; // entry at t=5
        let mut returns = vec![0.0; n];
        returns[6] = 0.10; // 10% on the bar AFTER the signal
        let spec = base_spec();
        let regime = make_regime(n);
        let mut series = HashMap::new();
        series.insert("sig".to_string(), sig);
        let inputs = EngineInputs {
            spec: &spec,
            dates: &dates(n),
            returns: &returns,
            regime: &regime,
            signal_series: series,
            asset_close: None,
        };
        let res = run(&inputs);
        // Equity should have grown from the t=6 return (minus entry cost).
        assert!(res.equity_curve[6].value > 1.0, "position should capture next-bar return");
        // No return leaked into bar 5 (the signal bar itself).
        assert!((res.equity_curve[5].value - 1.0).abs() < 1e-6);
    }

    #[test]
    fn costs_reduce_returns() {
        let n = 20;
        let sig = vec![1.0; n]; // always long
        let returns = vec![0.0; n]; // flat market
        let mut spec = base_spec();
        spec.cost_model = CostModel { commission_bps: 50.0, slippage_bps: 50.0, ..CostModel::default() };
        let regime = make_regime(n);
        let mut series = HashMap::new();
        series.insert("sig".to_string(), sig);
        let inputs = EngineInputs {
            spec: &spec,
            dates: &dates(n),
            returns: &returns,
            regime: &regime,
            signal_series: series,
            asset_close: None,
        };
        let res = run(&inputs);
        // One entry => one turnover cost => equity below 1 in a flat market.
        assert!(res.equity_curve.last().unwrap().value < 1.0);
    }

    #[test]
    fn expectancy_computes_sqn_from_r_multiples() {
        let sim = SimResult {
            gross_returns: vec![0.0; 5],
            net_returns: vec![0.0; 5],
            equity: vec![1.0, 1.1, 1.05, 1.2, 1.15],
            gross_equity: vec![1.0, 1.1, 1.05, 1.2, 1.15],
            weights: vec![0.0; 5],
            total_cost: 0.0,
            trades: vec![
                Trade { entry_ts: "2020-01-01".into(), exit_ts: "2020-01-02".into(), pnl_pct: 0.10, regime_at_entry: 0, duration_days: 1.0, signals_triggered: vec![] },
                Trade { entry_ts: "2020-01-03".into(), exit_ts: "2020-01-04".into(), pnl_pct: -0.05, regime_at_entry: 0, duration_days: 1.0, signals_triggered: vec![] },
                Trade { entry_ts: "2020-01-05".into(), exit_ts: "2020-01-06".into(), pnl_pct: 0.15, regime_at_entry: 0, duration_days: 1.0, signals_triggered: vec![] },
            ],
        };
        let e = expectancy(&sim, 100_000.0, 0.10);
        assert!((e.expectancy_per_trade - 6_666.6667).abs() < 1.0);
        assert!(e.system_quality_number > 0.0);
        assert_eq!(e.consecutive_losses_max, 1);
    }

    #[test]
    fn circuit_breaker_flattens_on_drawdown() {
        let n = 30;
        let sig = vec![1.0; n];
        let mut returns = vec![0.0; n];
        // Big loss early to trip the 50% breaker.
        returns[2] = -0.6;
        let spec = base_spec();
        let regime = make_regime(n);
        let mut series = HashMap::new();
        series.insert("sig".to_string(), sig);
        let inputs = EngineInputs {
            spec: &spec,
            dates: &dates(n),
            returns: &returns,
            regime: &regime,
            signal_series: series,
            asset_close: None,
        };
        let res = run(&inputs);
        // After the breaker trips, subsequent positive moves shouldn't be captured
        // during cooldown; equity stays roughly at the post-crash level.
        let post = res.equity_curve[5].value;
        assert!(post < 0.5, "breaker should have flattened after the crash, got {post}");
    }
}
