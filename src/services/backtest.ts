/**
 * backtest.ts — typed client for the backtest engine (via the gateway proxy).
 *
 * Types mirror the Rust `models.rs` contract exactly (serde serializes enum
 * variants by name and `PositionSizing` as an internally-tagged `method`).
 *
 * `runBacktest` uses a longer client timeout than the shared gatewayPost (30s)
 * because a full regime-fit + simulation can take longer than a quote call.
 */

import { gatewayGet, gatewayPost, gatewayPostWithTimeout, GatewayError, ClientTTL } from './gatewayClient';

// ─── Contract types (mirror Rust models.rs) ────────────────────────────────────

export type UserTier = 'Free' | 'Pro' | 'Institutional';
export type SignalType =
  | 'MacroRegime'
  | 'NarrativeScore'
  | 'YieldSpread'
  | 'VolatilityZScore'
  | 'MomentumFactor'
  | 'CarryFactor'
  | 'TrendFactor'
  | 'MeanReversion'
  | 'CrossAssetMomentum';
export type Direction = 'Above' | 'Below' | 'CrossUp' | 'CrossDown';
export type Operator = 'AND' | 'OR';
export type RebalanceFreq = 'Daily' | 'Weekly' | 'Monthly' | 'OnSignal';

export interface DateRange {
  start_date: string;
  end_date: string;
}

export interface SignalConfig {
  signal_id: string;
  signal_type: SignalType;
  threshold: number;
  direction: Direction;
  weight: number;
}

export interface Condition {
  signal_id: string;
  direction?: Direction;
  threshold?: number;
}

export interface LogicExpression {
  operator: Operator;
  conditions: Condition[];
}

export type PositionSizing =
  | { method: 'FixedFractional'; fraction: number }
  | { method: 'Kelly'; kelly_fraction?: number }
  | { method: 'EqualWeight' }
  | { method: 'VolTarget'; target_annual_vol?: number };

export interface RiskParams {
  max_drawdown_pct: number;
  position_cap_pct: number;
  rebalance_freq: RebalanceFreq;
  risk_per_trade_pct?: number;
  min_rr?: number;
  min_holding_period_bars?: number;
  signal_confirmation_bars?: number;
  exit_confirmation_bars?: number;
  cooldown_bars?: number;
  entry_score_threshold?: number;
  exit_score_threshold?: number;
  min_weight_change_pct?: number;
}

export interface CostModel {
  commission_bps?: number;
  slippage_bps?: number;
  spread_bps?: number;
  commission_per_trade?: number;
  financing_rate_annual?: number;
}

export interface StrategySpec {
  id: string;
  name: string;
  date_range: DateRange;
  signals: SignalConfig[];
  entry_logic: LogicExpression;
  exit_logic: LogicExpression;
  position_sizing: PositionSizing;
  risk_params: RiskParams;
  comparison_mode?: boolean;
  tier?: UserTier; // server-stamped; optional on the client
  cost_model?: CostModel;
  instrument?: string;
  starting_capital?: number;
}

export interface EquityPoint {
  timestamp: string;
  value: number;
  drawdown: number;
  regime_state: number;
  regime_probabilities: [number, number, number];
}

export interface Trade {
  entry_ts: string;
  exit_ts: string;
  pnl_pct: number;
  regime_at_entry: number;
  duration_days: number;
  signals_triggered: string[];
}

export interface AggregateMetrics {
  sharpe_ratio: number;
  deflated_sharpe_ratio: number;
  probabilistic_sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  cagr: number;
  annual_volatility: number;
  max_drawdown: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  avg_trade_duration_days: number;
  skewness: number;
  excess_kurtosis: number;
}

export interface PartitionMetrics {
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  avg_duration_days: number;
  days_in_regime: number;
  annualized_return: number;
}

export interface RegimeMetrics {
  risk_on: PartitionMetrics;
  transitional: PartitionMetrics;
  risk_off: PartitionMetrics;
}

export interface SignalAttribution {
  signal_id: string;
  marginal_sharpe: number;
  avg_active_weight: number;
  trades_triggered: number;
}

export interface ComparisonResults {
  baseline_metrics: AggregateMetrics;
  enhanced_metrics: AggregateMetrics;
  sharpe_delta: number;
  drawdown_reduction_pct: number;
  signal_value_score: number;
}

export interface DollarPoint {
  timestamp: string;
  enhanced: number;
  buy_hold: number;
  baseline?: number;
}

export interface DollarSummary {
  starting_capital: number;
  enhanced_final: number;
  buy_hold_final: number;
  baseline_final?: number;
  curve: DollarPoint[];
}

export interface ExpectancyMetrics {
  expectancy_per_trade: number;
  expectancy_per_dollar: number;
  r_multiple_distribution: number[];
  system_quality_number: number;
  avg_win_loss_ratio: number;
  largest_win_pct: number;
  largest_loss_pct: number;
  consecutive_losses_max: number;
  recovery_factor: number;
}

export interface WalkForwardWindow {
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  insample_sharpe: number;
  oos_sharpe: number;
}

export interface WalkForwardResults {
  config: { n_windows: number; train_pct: number; test_pct: number; anchored: boolean };
  windows: WalkForwardWindow[];
  insample_sharpe: number;
  oos_sharpe: number;
  oos_vs_insample_ratio: number;
  consistency_score: number;
  warning?: string;
}

export interface TransactionCostSummary {
  gross_cagr: number;
  net_cagr: number;
  gross_sharpe: number;
  net_sharpe: number;
  annual_return_drag: number;
  sharpe_drag: number;
  total_cost_pct: number;
}

export interface SignalConfidence {
  signal_id: string;
  avg_confidence_weight: number;
  risk_on_weight: number;
  transitional_weight: number;
  risk_off_weight: number;
}

export interface EnsembleDiagnostics {
  combination_method: 'WeightedVote' | 'ConfidenceWeighted' | 'RegimeConditional';
  signals: SignalConfidence[];
}

export interface BacktestResults {
  strategy_id: string;
  equity_curve: EquityPoint[];
  trade_log: Trade[];
  aggregate_metrics: AggregateMetrics;
  regime_metrics: RegimeMetrics;
  signal_attribution: SignalAttribution[];
  comparison?: ComparisonResults;
  dollar_summary?: DollarSummary;
  expectancy_metrics?: ExpectancyMetrics;
  walk_forward?: WalkForwardResults;
  transaction_costs?: TransactionCostSummary;
  ensemble?: EnsembleDiagnostics;
  bars: number;
  data_through: string;
}

export type ImprovementCategory =
  | 'RegimeFilter'
  | 'SignalRemoval'
  | 'Rebalance'
  | 'PositionSizing'
  | 'Overfitting'
  | 'ExecutionControls'
  | 'AbandonStrategy';

export interface ImprovementActionPatch {
  type:
    | 'remove_signal'
    | 'add_or_update_signal'
    | 'set_rebalance_freq'
    | 'set_position_sizing'
    | 'set_execution_controls';
  signal_id?: string;
  signal?: SignalConfig;
  entry_operator?: Operator;
  exit_operator?: Operator;
  value?: RebalanceFreq;
  method?: PositionSizing['method'];
  kelly_fraction?: number;
  target_annual_vol?: number;
  rebalance_freq?: RebalanceFreq;
  min_holding_period_bars?: number;
  signal_confirmation_bars?: number;
  exit_confirmation_bars?: number;
  cooldown_bars?: number;
  entry_score_threshold?: number;
  exit_score_threshold?: number;
  min_weight_change_pct?: number;
}

export interface ImprovementSuggestion {
  rank: number;
  category: ImprovementCategory;
  title: string;
  explanation: string;
  expected_impact: string;
  action: string;
  action_patch?: ImprovementActionPatch;
}

export interface ImprovementResponse {
  result_id: string;
  verdict: string;
  suggestions: ImprovementSuggestion[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tier_requirements: string[];
}

export interface SignalMeta {
  signal_id: string;
  signal_type: SignalType;
  label: string;
  description: string;
  min_tier: UserTier;
  source_columns: string[];
  unit: string;
}

export interface SignalLibrary {
  signals: SignalMeta[];
}

// ─── Client calls ───────────────────────────────────────────────────────────────

export function getSignalLibrary(): Promise<SignalLibrary> {
  return gatewayGet<SignalLibrary>('/backtest/signals', undefined, ClientTTL.research);
}

export function validateStrategy(spec: StrategySpec): Promise<ValidationResult> {
  return gatewayPost<ValidationResult>('/backtest/validate', spec);
}

const RUN_TIMEOUT_MS = 150_000;

/** Run a backtest. Uses a longer timeout than the shared POST helper. */
export async function runBacktest(spec: StrategySpec): Promise<BacktestResults> {
  try {
    return await gatewayPostWithTimeout<BacktestResults>('/backtest/run', spec, RUN_TIMEOUT_MS);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Backtest timed out. The engine may be cold-starting — please retry.');
    }
    if (e instanceof GatewayError) throw e;
    throw e;
  }
}

// ─── NLP + preparation client calls ────────────────────────────────────────────

/** Convert a natural-language strategy idea into a StrategySpec. */
export function resolveIntent(query: string): Promise<{ spec: StrategySpec }> {
  return gatewayPost<{ spec: StrategySpec }>('/backtest/resolve', { query });
}

/** Generate institutional commentary for completed backtest results. */
export function requestCommentary(opts: {
  query: string;
  metrics: Record<string, string | number>;
  context?: string;
}): Promise<{ narrative: string }> {
  return gatewayPost<{ narrative: string }>('/backtest/commentary', {
    ...opts,
    query: compactForCommentary(opts.query, 1500),
    context: opts.context ? compactForCommentary(opts.context, 2000) : undefined,
  });
}

function compactForCommentary(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 24)).trim()} ... [truncated]`;
}

export function requestImprovements(result: BacktestResults): Promise<ImprovementResponse> {
  return gatewayPost<ImprovementResponse>('/backtest/suggest-improvements', result);
}

/** Trigger per-instrument parquet preparation in quant-engine before running. */
export function prepareInstrument(
  symbol: string,
  dateRange?: DateRange,
): Promise<{ status: string; rows?: number; gcs_uri?: string; cache_gcs_uri?: string }> {
  return gatewayPost<{ status: string; rows?: number; gcs_uri?: string; cache_gcs_uri?: string }>(
    '/backtest/prepare-instrument',
    {
      symbol: symbol.toUpperCase(),
      start_date: dateRange?.start_date,
      end_date: dateRange?.end_date,
    },
  );
}

// ─── Regime display helpers ─────────────────────────────────────────────────────

export const REGIME_LABELS = ['Risk-On', 'Transitional', 'Risk-Off'] as const;

export function regimeColor(state: number): string {
  // 0 risk-on (gain/olive), 1 transitional (design gold), 2 risk-off (loss/brick).
  switch (state) {
    case 0:
      return 'var(--ds-gain)';
    case 2:
      return 'var(--ds-loss)';
    default:
      return '#C9A227';
  }
}
