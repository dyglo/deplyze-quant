/**
 * backtest.ts — typed client for the backtest engine (via the gateway proxy).
 *
 * Types mirror the Rust `models.rs` contract exactly (serde serializes enum
 * variants by name and `PositionSizing` as an internally-tagged `method`).
 *
 * `runBacktest` uses a longer client timeout than the shared gatewayPost (30s)
 * because a full regime-fit + simulation can take longer than a quote call.
 */

import { auth } from '../lib/firebase';
import { gatewayGet, gatewayPost, GatewayError, ClientTTL } from './gatewayClient';

// ─── Contract types (mirror Rust models.rs) ────────────────────────────────────

export type UserTier = 'Free' | 'Pro' | 'Institutional';
export type SignalType =
  | 'MacroRegime'
  | 'NarrativeScore'
  | 'YieldSpread'
  | 'VolatilityZScore'
  | 'MomentumFactor'
  | 'CarryFactor';
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
}

export interface CostModel {
  commission_bps?: number;
  slippage_bps?: number;
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

export interface BacktestResults {
  strategy_id: string;
  equity_curve: EquityPoint[];
  trade_log: Trade[];
  aggregate_metrics: AggregateMetrics;
  regime_metrics: RegimeMetrics;
  signal_attribution: SignalAttribution[];
  comparison?: ComparisonResults;
  bars: number;
  data_through: string;
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
  const user = auth.currentUser;
  if (!user) throw new GatewayError(401, 'Not signed in');
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  try {
    const res = await fetch('/api/v1/backtest/run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
      signal: controller.signal,
    });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      const message =
        typeof body === 'object' && body && 'message' in body
          ? String((body as { message: unknown }).message)
          : typeof body === 'object' && body && 'error' in body
            ? String((body as { error: unknown }).error)
            : res.statusText;
      throw new GatewayError(res.status, message, body);
    }
    return (await res.json()) as BacktestResults;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Backtest timed out. The engine may be cold-starting — please retry.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
