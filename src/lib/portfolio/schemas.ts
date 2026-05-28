/**
 * Portfolio Intelligence Workspace — core domain schemas.
 *
 * Design principles:
 * - Workspace-scoped: all documents carry workspaceId + uid
 * - Execution-free: no buy/sell signals, no order fields
 * - Weight-optional: holdings are valid without quantities (watchlist mode)
 * - Intelligence-ready: schemas are prepared for artifact/overlay attachment
 * - Backward-safe: all new fields are optional to avoid breaking migrations
 */

import type { AssetClass } from '../../types';

// ─── Portfolio ───────────────────────────────────────────────────────────────

export type PortfolioType =
  | 'long-only'
  | 'long-short'
  | 'thematic'
  | 'factor'
  | 'macro'
  | 'mixed';

export type PortfolioStatus = 'active' | 'archived';

/** Coarse risk-tolerance label for the portfolio (UI/intelligence framing only). */
export type PortfolioRiskProfile = 'conservative' | 'balanced' | 'growth' | 'aggressive';

export interface Portfolio {
  id: string;
  uid: string;
  workspaceId: string;

  name: string;
  description?: string;
  type: PortfolioType;
  status: PortfolioStatus;
  currency: string;           // 'USD' default

  /** Canonical benchmark symbol, e.g. 'SPY', 'QQQ', 'IWB' */
  benchmarkId?: string;
  /** Additional benchmarks for multi-benchmark comparison */
  additionalBenchmarkIds?: string[];

  /** True = watchlist mode (weights & quantities not required) */
  isWatchlist: boolean;

  /**
   * Total capital allocated to this portfolio in USD.
   * Optional — when set, enables dollar P&L estimates across all views.
   * Not a broker value; used only for intelligence estimates.
   */
  totalValue?: number;

  /**
   * Simulated capital model. All values are simulated — never broker balances.
   * - startingCapital: capital the portfolio was funded with.
   * - cashBalance: uninvested simulated cash (mutated by the PR2 transaction engine).
   * - realizedPnl: cumulative realised P&L across closed/trimmed positions.
   * All optional so existing portfolios remain valid without migration.
   */
  startingCapital?: number;
  cashBalance?: number;
  realizedPnl?: number;

  /** Coarse risk-tolerance label (intelligence/UI framing only). */
  riskProfile?: PortfolioRiskProfile;

  tags?: string[];
  notes?: string;

  createdAt: number;          // unix ms
  updatedAt: number;          // unix ms
}

// ─── Holding ─────────────────────────────────────────────────────────────────

export type HoldingConviction = 'low' | 'medium' | 'high' | 'highest';

/** Lifecycle state. Closed positions are retained for history, not deleted. */
export type HoldingStatus = 'active' | 'closed';

export interface Holding {
  id: string;
  portfolioId: string;
  workspaceId: string;

  symbol: string;
  name: string;
  assetClass: AssetClass;

  /** Portfolio weight 0–1. Derived or manual. Absent for watchlists. */
  weight?: number;
  /** Raw quantity. Optional — not required for intelligence. */
  quantity?: number;
  /** Average cost basis per unit. Optional. */
  costBasis?: number;
  /** ISO currency string e.g. 'USD' */
  currency?: string;

  sector?: string;
  industry?: string;
  region?: string;
  country?: string;

  conviction?: HoldingConviction;
  tags?: string[];
  notes?: string;

  /**
   * Lifecycle state. Absent on legacy docs — treated as 'active' at read-time.
   * Closed positions remain stored so transaction/performance history survives.
   */
  status?: HoldingStatus;
  /** Purchase / first-entry date (unix ms). */
  entryDate?: number;
  /** Target allocation 0–1, for allocation-drift analytics. */
  targetWeight?: number;
  /** Cumulative realised P&L on this position (trims/sells/closes). */
  realizedPnl?: number;
  /** When the position was closed (unix ms). Set alongside status='closed'. */
  closedAt?: number;
  /** Investment thesis — distinct from operational `notes`. */
  thesis?: string;

  addedAt: number;            // unix ms
  updatedAt?: number;         // unix ms
}

// ─── Transaction Ledger ────────────────────────────────────────────────────────

/**
 * Portfolio actions. Execution-free / simulated — these record intent against
 * simulated capital, not broker orders.
 * - buy:   open a new position
 * - add:   increase an existing position
 * - trim:  reduce part of a position
 * - sell:  reduce a position (alias of trim for partial exits)
 * - close: fully exit a position
 * - cash_adjust: deposit/withdraw simulated cash (no symbol position change)
 */
export type TransactionAction = 'buy' | 'add' | 'trim' | 'sell' | 'close' | 'cash_adjust';

export interface Transaction {
  id: string;
  portfolioId: string;
  workspaceId: string;
  uid: string;

  symbol: string;
  action: TransactionAction;

  /** Units transacted (>= 0). Zero only valid for cash_adjust. */
  quantity: number;
  /** Per-unit price at transaction time. */
  price: number;
  /** quantity * price (always >= 0). */
  grossValue: number;

  /** Optional frictions, default 0. Always reduce net cash received / increase cost. */
  fees?: number;
  slippage?: number;

  /** Signed effect on simulated cash: negative for buys/adds, positive for exits. */
  cashImpact: number;

  note?: string;
  thesis?: string;
  /** Intelligence/artifact ids that informed this action. */
  linkedArtifactIds?: string[];

  ts: number;                 // unix ms — when the transaction occurred
}

// ─── Benchmark Registry ───────────────────────────────────────────────────────

export type BenchmarkCategory =
  | 'broad-market'
  | 'sector'
  | 'thematic'
  | 'factor'
  | 'fixed-income'
  | 'commodity'
  | 'custom';

export interface BenchmarkDefinition {
  id: string;                 // canonical symbol
  name: string;               // display name
  description?: string;
  category: BenchmarkCategory;
  currency: string;
  provider?: string;
}

// ─── Exposure Snapshot ────────────────────────────────────────────────────────

export interface ExposureBreakdown {
  label: string;
  weight: number;             // 0–1
  count: number;
}

export interface PortfolioExposureSnapshot {
  portfolioId: string;
  ts: number;                 // unix ms — when computed
  holdingsCount: number;

  bySector: ExposureBreakdown[];
  byRegion: ExposureBreakdown[];
  byAssetClass: ExposureBreakdown[];
  byConviction: ExposureBreakdown[];

  /** Top-5 holdings by weight */
  topConcentrations: Array<{ symbol: string; weight: number }>;
  /** Herfindahl-Hirschman Index for concentration */
  hhiConcentration: number;   // 0–1; higher = more concentrated
}

// ─── Performance Metrics Snapshot ─────────────────────────────────────────────

export interface PortfolioMetricsSnapshot {
  portfolioId: string;
  ts: number;                 // unix ms

  /** All returns are annualised fractions (0.12 = 12%) */
  annReturn?: number;
  annVol?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  calmarRatio?: number;
  maxDrawdown?: number;       // negative fraction
  maxDrawdownDuration?: number; // days

  /** Benchmark-relative */
  benchmarkId?: string;
  alpha?: number;
  beta?: number;
  trackingError?: number;
  informationRatio?: number;
  upCaptureRatio?: number;
  downCaptureRatio?: number;
}

// ─── Portfolio Intelligence Observation ──────────────────────────────────────

export type PortfolioIntelligenceKind =
  | 'concentration_warning'
  | 'correlation_shift'
  | 'regime_alignment'
  | 'volatility_anomaly'
  | 'benchmark_divergence'
  | 'narrative_exposure'
  | 'macro_sensitivity'
  | 'liquidity_sensitivity'
  | 'drawdown_clustering'
  | 'breadth_deterioration'
  | 'factor_rotation';

export type IntelligenceSeverity = 'info' | 'low' | 'medium' | 'high';

export interface PortfolioIntelligenceObservation {
  id: string;
  portfolioId: string;
  workspaceId: string;

  kind: PortfolioIntelligenceKind;
  severity: IntelligenceSeverity;
  title: string;
  narrative: string;

  /** Symbols directly referenced by this observation */
  symbols?: string[];
  /** Macro indicators referenced */
  macroIndicators?: string[];
  /** Benchmark symbols referenced */
  benchmarks?: string[];

  /** Quantitative evidence */
  evidence?: Array<{ label: string; value: string | number }>;

  createdAt: number;          // unix ms
  expiresAt?: number;         // unix ms — auto-expire stale observations
  acknowledged?: boolean;
}

// ─── Watchlist (standalone, portfolio-linkable) ───────────────────────────────

export interface IntelligenceWatchlist {
  id: string;
  uid: string;
  workspaceId: string;

  name: string;
  description?: string;
  symbols: string[];

  /** If set, this watchlist was created from a portfolio */
  sourcePortfolioId?: string;
  /** If set, this watchlist was promoted to a portfolio */
  targetPortfolioId?: string;

  tags?: string[];
  createdAt: number;          // unix ms
  updatedAt: number;          // unix ms
}

// ─── Scenario Definition ──────────────────────────────────────────────────────

export type ScenarioKind =
  | 'inflation_shock'
  | 'liquidity_tightening'
  | 'recession'
  | 'volatility_spike'
  | 'commodity_expansion'
  | 'ai_momentum_unwind'
  | 'growth_value_rotation'
  | 'credit_stress'
  | 'dollar_strength'
  | 'custom';

export interface ScenarioDefinition {
  id: string;
  kind: ScenarioKind;
  name: string;
  description: string;
  /** Historical analog periods (start/end unix ms) */
  analogs?: Array<{ label: string; from: number; to: number }>;
  /** Expected factor tilts under this scenario */
  factorTilts?: Record<string, number>; // factor → directional tilt -1..1
}

// ─── Portfolio Context (runtime state, not persisted) ─────────────────────────

export interface PortfolioContext {
  portfolio: Portfolio;
  holdings: Holding[];
  exposure?: PortfolioExposureSnapshot;
  metrics?: PortfolioMetricsSnapshot;
  observations: PortfolioIntelligenceObservation[];
}
