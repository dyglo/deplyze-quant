//! Wire contract between the gateway/frontend (JSON) and the Rust execution core.
//!
//! All three UI layers (template, composer, advanced JSON) compile down to
//! [`StrategySpec`]. The engine returns [`BacktestResults`]. These types are the
//! single source of truth for the data contract; the gateway's zod schema and the
//! quant-engine Pydantic mirror must stay structurally aligned with them.

use serde::{Deserialize, Serialize};

// ─── Enums ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UserTier {
    Free,
    Pro,
    Institutional,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SignalType {
    MacroRegime,
    NarrativeScore,
    YieldSpread,
    VolatilityZScore,
    MomentumFactor,
    CarryFactor,
    TrendFactor,
    MeanReversion,
    CrossAssetMomentum,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    Above,
    Below,
    CrossUp,
    CrossDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Operator {
    AND,
    OR,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RebalanceFreq {
    Daily,
    Weekly,
    Monthly,
    OnSignal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CombinationMethod {
    WeightedVote,
    ConfidenceWeighted,
    RegimeConditional,
}

// ─── Strategy spec ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub start_date: String, // YYYY-MM-DD
    pub end_date: String,   // YYYY-MM-DD
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalConfig {
    pub signal_id: String, // maps to a wide parquet feature column
    pub signal_type: SignalType,
    pub threshold: f64,
    pub direction: Direction,
    pub weight: f64, // 0.0..=1.0, normalized across signals
}

/// A single comparison of one signal against a threshold. The composer/templates
/// emit fully-specified conditions; legacy specs may reference a bare `signal_id`
/// (resolved against the strategy's `signals` list at validation time).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    pub signal_id: String,
    #[serde(default)]
    pub direction: Option<Direction>,
    #[serde(default)]
    pub threshold: Option<f64>,
}

/// AND/OR tree over signal conditions. Flat one-level tree in Sprint 1; the
/// `operator` combines all `conditions`. Nested trees are a Sprint 3 extension.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicExpression {
    pub operator: Operator,
    #[serde(deserialize_with = "de_conditions")]
    pub conditions: Vec<Condition>,
}

/// Accept either `["signal_id", ...]` (shorthand) or `[{signal_id,...}, ...]`.
fn de_conditions<'de, D>(d: D) -> Result<Vec<Condition>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        Id(String),
        Full(Condition),
    }
    let raw = Vec::<Raw>::deserialize(d)?;
    Ok(raw
        .into_iter()
        .map(|r| match r {
            Raw::Id(signal_id) => Condition { signal_id, direction: None, threshold: None },
            Raw::Full(c) => c,
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method")]
pub enum PositionSizing {
    /// Fixed fraction of equity at risk per position.
    FixedFractional { fraction: f64 },
    /// Fractional Kelly using estimated edge/variance (see engine.rs).
    Kelly {
        #[serde(default = "default_kelly_fraction")]
        kelly_fraction: f64,
    },
    /// Equal-weight allocation across active signals.
    EqualWeight,
    /// Target a constant annualized volatility (institutional default).
    VolTarget {
        #[serde(default = "default_vol_target")]
        target_annual_vol: f64,
    },
}

fn default_kelly_fraction() -> f64 {
    0.5
}
fn default_vol_target() -> f64 {
    0.10
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskParams {
    pub max_drawdown_pct: f64, // circuit breaker
    pub position_cap_pct: f64,
    pub rebalance_freq: RebalanceFreq,
    #[serde(default = "default_risk_per_trade")]
    pub risk_per_trade_pct: f64,
    #[serde(default = "default_min_rr")]
    pub min_rr: f64,
}

fn default_risk_per_trade() -> f64 {
    1.0
}
fn default_min_rr() -> f64 {
    2.0
}

/// Execution-cost assumptions. Defaults reflect liquid-futures/ETF round-trip
/// frictions; without these, reported Sharpe is fantasy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostModel {
    /// Commission per unit turnover, in basis points of notional traded.
    #[serde(default = "default_commission_bps")]
    pub commission_bps: f64,
    /// Half-spread + market-impact slippage, in bps of notional traded.
    #[serde(default = "default_slippage_bps")]
    pub slippage_bps: f64,
    /// Explicit bid-ask spread assumption, in basis points. Optional so older
    /// clients using commission_bps + slippage_bps keep their behavior.
    #[serde(default = "default_spread_bps")]
    pub spread_bps: f64,
    /// Fixed commission charged when turnover occurs. Converted into a return
    /// drag using starting_capital.
    #[serde(default = "default_commission_per_trade")]
    pub commission_per_trade: f64,
    /// Overnight financing rate for leveraged exposure. Long/flat Sprint 1
    /// books usually pay no financing unless target weight exceeds 1.0.
    #[serde(default = "default_financing_rate_annual")]
    pub financing_rate_annual: f64,
}

impl Default for CostModel {
    fn default() -> Self {
        Self {
            commission_bps: default_commission_bps(),
            slippage_bps: default_slippage_bps(),
            spread_bps: default_spread_bps(),
            commission_per_trade: default_commission_per_trade(),
            financing_rate_annual: default_financing_rate_annual(),
        }
    }
}

fn default_commission_bps() -> f64 {
    1.0
}
fn default_slippage_bps() -> f64 {
    2.0
}
fn default_spread_bps() -> f64 {
    0.0
}
fn default_commission_per_trade() -> f64 {
    0.0
}
fn default_financing_rate_annual() -> f64 {
    0.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategySpec {
    pub id: String,
    pub name: String,
    pub date_range: DateRange,
    pub signals: Vec<SignalConfig>,
    pub entry_logic: LogicExpression,
    pub exit_logic: LogicExpression,
    pub position_sizing: PositionSizing,
    pub risk_params: RiskParams,
    #[serde(default)]
    pub comparison_mode: bool,
    pub tier: UserTier,
    /// Optional; defaults applied when absent so older clients keep working.
    #[serde(default)]
    pub cost_model: CostModel,
    /// Instrument to backtest (selects the per-instrument parquet). Defaults to
    /// the legacy single-asset parquet when absent.
    #[serde(default = "default_instrument")]
    pub instrument: String,
    /// Starting capital for the dollar P&L curves (cosmetic only; does not
    /// affect any ratio or signal — all engine math is in fractional returns).
    #[serde(default = "default_starting_capital")]
    pub starting_capital: f64,
}

fn default_instrument() -> String {
    "SPY".to_string()
}
fn default_starting_capital() -> f64 {
    10_000.0
}

// ─── Dollar P&L curves ────────────────────────────────────────────────────────

/// One bar of the dollar-denominated equity curve.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DollarPoint {
    pub timestamp: String,
    pub enhanced: f64,
    pub buy_hold: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub baseline: Option<f64>,
}

/// Three-curve dollar P&L surface for the results hero cards and equity chart.
/// All values in dollars (starting_capital × fractional equity at each bar).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DollarSummary {
    pub starting_capital: f64,
    pub enhanced_final: f64,
    pub buy_hold_final: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub baseline_final: Option<f64>,
    pub curve: Vec<DollarPoint>,
}

// ─── Results ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquityPoint {
    pub timestamp: String,
    pub value: f64,
    pub drawdown: f64,
    pub regime_state: u8,
    pub regime_probabilities: [f64; 3], // [risk_on, transitional, risk_off]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub entry_ts: String,
    pub exit_ts: String,
    pub pnl_pct: f64,
    pub regime_at_entry: u8,
    pub duration_days: f64,
    pub signals_triggered: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AggregateMetrics {
    pub sharpe_ratio: f64,
    pub deflated_sharpe_ratio: f64,
    pub probabilistic_sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub calmar_ratio: f64,
    pub cagr: f64,
    pub annual_volatility: f64,
    pub max_drawdown: f64,
    pub win_rate: f64,
    pub profit_factor: f64,
    pub total_trades: u32,
    pub avg_trade_duration_days: f64,
    pub skewness: f64,
    pub excess_kurtosis: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PartitionMetrics {
    pub sharpe_ratio: f64,
    pub max_drawdown: f64,
    pub win_rate: f64,
    pub avg_duration_days: f64,
    pub days_in_regime: u32,
    pub annualized_return: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RegimeMetrics {
    pub risk_on: PartitionMetrics,
    pub transitional: PartitionMetrics,
    pub risk_off: PartitionMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalAttribution {
    pub signal_id: String,
    /// Marginal contribution to Sharpe (leave-one-out), institutional attribution.
    pub marginal_sharpe: f64,
    /// Average absolute weight while the signal was active.
    pub avg_active_weight: f64,
    pub trades_triggered: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonResults {
    pub baseline_metrics: AggregateMetrics,
    pub enhanced_metrics: AggregateMetrics,
    pub sharpe_delta: f64,
    pub drawdown_reduction_pct: f64,
    pub signal_value_score: f64, // 0.0..=1.0 composite of signal value-add
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExpectancyMetrics {
    pub expectancy_per_trade: f64,
    pub expectancy_per_dollar: f64,
    pub r_multiple_distribution: Vec<f64>,
    pub system_quality_number: f64,
    pub avg_win_loss_ratio: f64,
    pub largest_win_pct: f64,
    pub largest_loss_pct: f64,
    pub consecutive_losses_max: u32,
    pub recovery_factor: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WalkForwardConfig {
    pub n_windows: u32,
    pub train_pct: f64,
    pub test_pct: f64,
    pub anchored: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WalkForwardWindow {
    pub train_start: String,
    pub train_end: String,
    pub test_start: String,
    pub test_end: String,
    pub insample_sharpe: f64,
    pub oos_sharpe: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WalkForwardResults {
    pub config: WalkForwardConfig,
    pub windows: Vec<WalkForwardWindow>,
    pub insample_sharpe: f64,
    pub oos_sharpe: f64,
    pub oos_vs_insample_ratio: f64,
    pub consistency_score: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TransactionCostSummary {
    pub gross_cagr: f64,
    pub net_cagr: f64,
    pub gross_sharpe: f64,
    pub net_sharpe: f64,
    pub annual_return_drag: f64,
    pub sharpe_drag: f64,
    pub total_cost_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalConfidence {
    pub signal_id: String,
    pub avg_confidence_weight: f64,
    pub risk_on_weight: f64,
    pub transitional_weight: f64,
    pub risk_off_weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnsembleDiagnostics {
    pub combination_method: CombinationMethod,
    pub signals: Vec<SignalConfidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResults {
    pub strategy_id: String,
    pub equity_curve: Vec<EquityPoint>,
    pub trade_log: Vec<Trade>,
    pub aggregate_metrics: AggregateMetrics,
    pub regime_metrics: RegimeMetrics,
    pub signal_attribution: Vec<SignalAttribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comparison: Option<ComparisonResults>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dollar_summary: Option<DollarSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expectancy_metrics: Option<ExpectancyMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub walk_forward: Option<WalkForwardResults>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction_costs: Option<TransactionCostSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ensemble: Option<EnsembleDiagnostics>,
    pub bars: usize,
    pub data_through: String,
}

// ─── Validation result ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub tier_requirements: Vec<String>,
}

// ─── Signal library ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalMeta {
    pub signal_id: String,
    pub signal_type: SignalType,
    pub label: String,
    pub description: String,
    pub min_tier: UserTier,
    /// Underlying wide-parquet column(s) this signal reads.
    pub source_columns: Vec<String>,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalLibrary {
    pub signals: Vec<SignalMeta>,
}
