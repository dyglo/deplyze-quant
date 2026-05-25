//! End-to-end validation: parquet bytes → loader → HMM → engine → results.
//!
//! These tests exercise the *whole* compute path on synthetic-but-structurally
//! realistic data (the same wide schema the Python export produces), which the
//! per-module unit tests do not. They also assert the engine's reported metrics
//! are self-consistent with the equity curve it returns — catching the class of
//! bug where a metric is wired to the wrong series.
//!
//! Synthetic data is used only because this environment has no BigQuery access;
//! it proves the plumbing and the metric wiring, not the economic content.

use std::collections::HashMap;
use std::sync::Arc;

use arrow::array::{ArrayRef, Float64Array, StringArray};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::record_batch::RecordBatch;
use bytes::Bytes;
use chrono::{Duration, NaiveDate};
use parquet::arrow::arrow_writer::ArrowWriter;

use crate::engine::{self, EngineInputs};
use crate::loader::{self, MarketData};
use crate::metrics;
use crate::models::*;
use crate::regime::{HmmConfig, RegimeModel};
use crate::strategy;

// ─── Synthetic wide dataset (matches the export contract) ──────────────────────

fn synth(n: usize) -> (Vec<String>, Vec<(String, Vec<f64>)>) {
    let start = NaiveDate::from_ymd_opt(2016, 1, 1).unwrap();
    let mut dates = Vec::with_capacity(n);
    let mut close = Vec::with_capacity(n);
    let mut ret = Vec::with_capacity(n);
    let (mut p, mut prev) = (100.0f64, 100.0f64);
    let (mut dgs10, mut dgs2, mut walcl) = (Vec::new(), Vec::new(), Vec::new());
    let (mut rrp, mut m2, mut dxy) = (Vec::new(), Vec::new(), Vec::new());
    let (mut cpi, mut pce, mut tie) = (Vec::new(), Vec::new(), Vec::new());

    for i in 0..n {
        let t = i as f64;
        // A deliberate drawdown window so max-drawdown is non-trivial.
        let drawdown = if i > n / 3 && i < n / 3 + 45 {
            -0.005
        } else {
            0.0
        };
        let r = 0.0004 + (t * 0.02).sin() * 0.003 + drawdown;
        p *= 1.0 + r;
        close.push(p);
        ret.push(if i == 0 { 0.0 } else { p / prev - 1.0 });
        prev = p;
        dates.push(
            (start + Duration::days(i as i64))
                .format("%Y-%m-%d")
                .to_string(),
        );

        dgs10.push(2.5 + (t * 0.01).sin() * 0.6);
        dgs2.push(2.0 + (t * 0.013).cos() * 0.5);
        walcl.push(8_000_000.0 + t * 120.0 + (t * 0.05).sin() * 5_000.0);
        rrp.push(1_000_000.0 + (t * 0.03).cos() * 50_000.0);
        m2.push(20_000_000.0 + t * 60.0);
        dxy.push(100.0 + (t * 0.02).sin() * 3.0);
        cpi.push(260.0 + t * 0.02);
        pce.push(110.0 + t * 0.01);
        tie.push(2.2 + (t * 0.015).sin() * 0.25);
    }

    let cols = vec![
        ("asset_close".to_string(), close),
        ("asset_return".to_string(), ret),
        ("DGS10".to_string(), dgs10),
        ("DGS2".to_string(), dgs2),
        ("WALCL".to_string(), walcl),
        ("RRPONTSYD".to_string(), rrp),
        ("M2SL".to_string(), m2),
        ("DTWEXBGS".to_string(), dxy),
        ("CPILFESL".to_string(), cpi),
        ("PCEPILFE".to_string(), pce),
        ("T10YIE".to_string(), tie),
    ];
    (dates, cols)
}

fn to_parquet(dates: &[String], cols: &[(String, Vec<f64>)]) -> Bytes {
    let mut fields = vec![Field::new("date", DataType::Utf8, false)];
    let mut arrays: Vec<ArrayRef> = vec![Arc::new(StringArray::from_iter_values(
        dates.iter().map(|s| s.as_str()),
    ))];
    for (name, vals) in cols {
        fields.push(Field::new(name, DataType::Float64, true));
        arrays.push(Arc::new(Float64Array::from(vals.clone())));
    }
    let schema = Arc::new(Schema::new(fields));
    let batch = RecordBatch::try_new(schema.clone(), arrays).expect("record batch");
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut w = ArrowWriter::try_new(&mut buf, schema, None).expect("writer");
        w.write(&batch).expect("write");
        w.close().expect("close");
    }
    Bytes::from(buf)
}

fn md_from(dates: Vec<String>, cols: Vec<(String, Vec<f64>)>) -> MarketData {
    let n = dates.len();
    let mut columns = HashMap::new();
    for (k, v) in cols {
        columns.insert(k, v);
    }
    MarketData { dates, columns, n }
}

fn macro_spec(comparison: bool) -> StrategySpec {
    StrategySpec {
        id: "e2e".into(),
        name: "E2E".into(),
        date_range: DateRange {
            start_date: "2016-01-01".into(),
            end_date: "2099-01-01".into(),
        },
        signals: vec![SignalConfig {
            signal_id: "macro_regime_risk_on".into(),
            signal_type: SignalType::MacroRegime,
            threshold: 0.5,
            direction: Direction::Above,
            weight: 1.0,
        }],
        entry_logic: LogicExpression {
            operator: Operator::AND,
            conditions: vec![Condition {
                signal_id: "macro_regime_risk_on".into(),
                direction: Some(Direction::Above),
                threshold: Some(0.5),
            }],
        },
        exit_logic: LogicExpression {
            operator: Operator::OR,
            conditions: vec![Condition {
                signal_id: "macro_regime_risk_on".into(),
                direction: Some(Direction::Below),
                threshold: Some(0.5),
            }],
        },
        position_sizing: PositionSizing::VolTarget {
            target_annual_vol: 0.1,
        },
        risk_params: RiskParams {
            max_drawdown_pct: 25.0,
            position_cap_pct: 100.0,
            rebalance_freq: RebalanceFreq::Daily,
            risk_per_trade_pct: 1.0,
            min_rr: 2.0,
        },
        comparison_mode: comparison,
        tier: UserTier::Pro,
        cost_model: CostModel {
            commission_bps: 1.0,
            slippage_bps: 2.0,
        },
    }
}

/// Mirrors `main::compute` (minus the date slice): the production compute path.
fn run_pipeline(mut md: MarketData, spec: &StrategySpec) -> BacktestResults {
    let feats = loader::build_hmm_features(&md).expect("features");
    // Inject the engine's causal feature columns into the signal namespace,
    // exactly as the service does.
    for (j, name) in feats.feature_names.iter().enumerate() {
        let col: Vec<f64> = feats.features.iter().map(|v| v[j]).collect();
        md.columns.entry(name.clone()).or_insert(col);
    }
    let cfg = HmmConfig {
        risk_feature_index: feats.risk_feature_index,
        higher_is_risk_off: true,
        ..HmmConfig::default()
    };
    let model = RegimeModel::fit(&feats.features, &cfg);
    let regime = model.decode(&feats.features);

    let returns = md.asset_returns().expect("returns");
    let signal_series = strategy::resolve_signal_series(spec, &md, &regime).expect("signals");
    let asset_close = md.asset_close();
    let inputs = EngineInputs {
        spec,
        dates: &md.dates,
        returns: &returns,
        regime: &regime,
        signal_series,
        asset_close,
    };
    engine::run(&inputs)
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

#[test]
fn parse_wide_parquet_roundtrips_columns_and_dates() {
    let (dates, cols) = synth(120);
    let bytes = to_parquet(&dates, &cols);
    let md = loader::parse_wide_parquet(bytes).expect("parse");
    assert_eq!(md.n, 120);
    assert_eq!(md.dates[0], "2016-01-01");
    assert!(md.has("asset_close"));
    assert!(md.has("DGS10") && md.has("WALCL") && md.has("T10YIE"));
    // A known value survives the round-trip.
    assert!((md.column("asset_close").unwrap()[0] - 100.0 * 1.0004f64).abs() < 1.0);
}

#[test]
fn end_to_end_from_parquet_is_coherent() {
    let (dates, cols) = synth(800);
    let bytes = to_parquet(&dates, &cols);
    let md = loader::parse_wide_parquet(bytes).expect("parse");
    assert_eq!(md.n, 800);

    let spec = macro_spec(true);
    assert!(strategy::validate(&spec).valid, "spec should validate");

    let r = run_pipeline(md, &spec);

    // Shape.
    assert_eq!(r.bars, 800);
    assert_eq!(r.equity_curve.len(), r.bars);
    assert_eq!(r.trade_log.len() as u32, r.aggregate_metrics.total_trades);

    // All headline metrics are finite numbers.
    let m = &r.aggregate_metrics;
    for v in [
        m.sharpe_ratio,
        m.deflated_sharpe_ratio,
        m.probabilistic_sharpe_ratio,
        m.sortino_ratio,
        m.calmar_ratio,
        m.cagr,
        m.annual_volatility,
        m.max_drawdown,
        m.win_rate,
        m.profit_factor,
    ] {
        assert!(v.is_finite(), "metric not finite: {v}");
    }

    // BLdP invariant on real engine output: 0 <= DSR <= PSR <= 1.
    assert!((0.0..=1.0).contains(&m.deflated_sharpe_ratio));
    assert!((0.0..=1.0).contains(&m.probabilistic_sharpe_ratio));
    assert!(
        m.deflated_sharpe_ratio <= m.probabilistic_sharpe_ratio + 1e-9,
        "DSR must be <= PSR"
    );

    // Metric self-consistency: recompute from the returned equity curve.
    let eq: Vec<f64> = r.equity_curve.iter().map(|p| p.value).collect();
    assert!(
        (m.max_drawdown - metrics::max_drawdown(&eq)).abs() < 1e-9,
        "max_drawdown not consistent with equity curve"
    );
    assert!(
        (m.cagr - metrics::cagr(&eq)).abs() < 1e-9,
        "cagr not consistent with equity curve"
    );
    assert!(
        m.max_drawdown > 0.0,
        "synthetic series has a drawdown window; maxDD should be > 0"
    );

    // Regime accounting.
    let days = r.regime_metrics.risk_on.days_in_regime
        + r.regime_metrics.transitional.days_in_regime
        + r.regime_metrics.risk_off.days_in_regime;
    assert!(
        (days as usize) <= r.bars && days > 0,
        "regime day counts implausible: {days}"
    );

    // Filtered regime posteriors are normalized at every bar.
    for p in &r.equity_curve {
        let s: f64 = p.regime_probabilities.iter().sum();
        assert!((s - 1.0).abs() < 1e-6, "regime posterior sums to {s}");
    }

    // Comparison present and bounded.
    let c = r.comparison.as_ref().expect("comparison requested");
    assert!(c.sharpe_delta.is_finite());
    assert!((0.0..=1.0).contains(&c.signal_value_score));
}

#[test]
fn handles_flat_returns_without_panic() {
    let (dates, mut cols) = synth(220);
    for (name, v) in cols.iter_mut() {
        if name == "asset_close" {
            for x in v.iter_mut() {
                *x = 100.0;
            }
        }
        if name == "asset_return" {
            for x in v.iter_mut() {
                *x = 0.0;
            }
        }
    }
    let r = run_pipeline(md_from(dates, cols), &macro_spec(false));
    assert_eq!(r.equity_curve.len(), 220);
    assert!(r.aggregate_metrics.cagr.is_finite());
    assert!(r.aggregate_metrics.sharpe_ratio.is_finite());
}

#[test]
fn handles_nan_macro_column() {
    let (dates, mut cols) = synth(220);
    for (name, v) in cols.iter_mut() {
        if name == "WALCL" {
            for x in v.iter_mut() {
                *x = f64::NAN;
            }
        }
    }
    let r = run_pipeline(md_from(dates, cols), &macro_spec(false));
    assert_eq!(r.equity_curve.len(), 220);
    assert!(r.aggregate_metrics.sharpe_ratio.is_finite());
}

#[test]
fn handles_short_window() {
    let (dates, cols) = synth(70);
    let r = run_pipeline(md_from(dates, cols), &macro_spec(false));
    assert_eq!(r.bars, 70);
    assert!(r.aggregate_metrics.max_drawdown.is_finite());
}
