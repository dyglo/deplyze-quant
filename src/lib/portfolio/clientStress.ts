/**
 * Client-side per-holding stress.
 *
 * Computes a per-holding stress histogram purely from market-data derived
 * features that the frontend already has via `usePortfolioPerformance`.
 * Used as a fallback (and an always-on overlay) when the backend
 * `/agents/vulnerability` pipeline has not yet produced a result for the
 * current portfolio.
 *
 * Five dimensions are evaluated for each holding:
 *
 *   1. Volatility       — annualised realised vol of the holding curve
 *                         above a high-vol threshold.
 *   2. Drawdown         — peak-to-trough drawdown beyond a stress threshold.
 *   3. Concentration    — effective weight materially above the equal-weight
 *                         benchmark for this portfolio.
 *   4. Underperformance — cumulative return materially negative.
 *   5. Recent weakness  — last-21-day return below the portfolio cross-section
 *                         median by a wide margin.
 *
 * Each flagged dimension contributes a normalised severity score to the
 * holding's `intensity`. The number of flagged dimensions becomes `count`.
 * These are the same fields the existing `EmergingRiskCluster` consumes.
 *
 * Everything in this module is pure and deterministic given the inputs.
 */

export interface HoldingPricePoint { ts: number; value: number }
export interface HoldingCurveInput {
  symbol: string;
  data: HoldingPricePoint[];
  totalReturn: number;
}

export type ClientStressDimension =
  | 'volatility'
  | 'drawdown'
  | 'concentration'
  | 'underperformance'
  | 'recent_weakness';

export const CLIENT_STRESS_DIM_LABEL: Record<ClientStressDimension, string> = {
  volatility:       'Volatility',
  drawdown:         'Drawdown',
  concentration:    'Concentration',
  underperformance: 'Underperformance',
  recent_weakness:  'Recent Weakness',
};

export interface ClientHoldingStress {
  symbol: string;
  weight: number;
  intensity: number;
  count: number;
  dimensions: string[];
}

export interface ClientStressDimensionSummary {
  key: ClientStressDimension;
  label: string;
  description: string;
  flaggedSymbols: string[];
  /** Mean severity across all flagged holdings, 0..1 */
  meanSeverity: number;
}

export interface ClientStressResult {
  rows: ClientHoldingStress[];
  dimensions: ClientStressDimensionSummary[];
  /** True if at least one holding curve had enough points to compute returns. */
  hasUsableData: boolean;
}

// ─── Math helpers ────────────────────────────────────────────────────────────

const TRADING_DAYS = 252;

function logReturnsFromValues(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

function annualisedVol(logRets: number[]): number {
  if (logRets.length < 5) return 0;
  const mean = logRets.reduce((s, r) => s + r, 0) / logRets.length;
  const sse = logRets.reduce((s, r) => s + (r - mean) ** 2, 0);
  const variance = sse / Math.max(1, logRets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS);
}

function maxDrawdownFromValues(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0];
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < mdd) mdd = dd;
    }
  }
  return mdd; // negative fraction
}

function recentReturn(values: number[], window = 21): number {
  if (values.length < window + 1) return 0;
  const a = values[values.length - window - 1];
  const b = values[values.length - 1];
  if (a <= 0 || b <= 0) return 0;
  return Math.log(b / a);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Severity normaliser. Maps an excess value above `threshold` into 0..1
 * where 1 corresponds to twice the threshold above the floor.
 */
function severity(excess: number, scale: number): number {
  if (!isFinite(excess) || excess <= 0) return 0;
  return Math.min(1, excess / scale);
}

// ─── Thresholds (institutional defaults) ─────────────────────────────────────

const VOL_THRESHOLD = 0.35;            // 35% annualised
const VOL_SCALE     = 0.25;            // +25%pts above threshold = severity 1
const DD_THRESHOLD  = -0.20;           // -20% drawdown
const DD_SCALE      = 0.30;            // -30%pts below threshold = severity 1
const UNDER_THRESHOLD = -0.10;         // -10% cumulative return
const UNDER_SCALE     = 0.30;
const RECENT_GAP      = 0.08;          // 8% below median recent return

// ─── Engine ──────────────────────────────────────────────────────────────────

export function computeClientStress(
  holdings: { symbol: string }[],
  effectiveWeights: Record<string, number>,
  curves: HoldingCurveInput[],
): ClientStressResult {
  const curveMap = new Map<string, HoldingCurveInput>(curves.map(c => [c.symbol, c]));

  // Equal-weight baseline for the concentration check.
  const n = Math.max(1, holdings.length);
  const equal = 1 / n;
  const concentrationThreshold = Math.max(0.10, equal * 1.5);
  const concentrationScale = Math.max(0.10, equal * 1.5);

  // Pre-compute per-holding features.
  interface Feature {
    symbol: string;
    weight: number;
    vol: number;
    mdd: number;
    totalReturn: number;
    recent21: number;
  }
  const features: Feature[] = holdings.map(h => {
    const w = effectiveWeights[h.symbol] ?? 0;
    const c = curveMap.get(h.symbol);
    if (!c || c.data.length < 22) {
      return {
        symbol: h.symbol,
        weight: w,
        vol: 0,
        mdd: 0,
        totalReturn: c?.totalReturn ?? 0,
        recent21: 0,
      };
    }
    const values = c.data.map(p => p.value).filter(v => isFinite(v) && v > 0);
    const lr = logReturnsFromValues(values);
    return {
      symbol: h.symbol,
      weight: w,
      vol: annualisedVol(lr),
      mdd: maxDrawdownFromValues(values),
      totalReturn: c.totalReturn ?? 0,
      recent21: recentReturn(values, 21),
    };
  });

  const hasUsableData = features.some(f => f.vol > 0 || f.mdd < 0 || f.totalReturn !== 0);
  const recentMedian = median(features.map(f => f.recent21).filter(r => r !== 0));

  // Track flagged symbols per dimension for the summary block.
  const flagged: Record<ClientStressDimension, { symbol: string; severity: number }[]> = {
    volatility: [], drawdown: [], concentration: [], underperformance: [], recent_weakness: [],
  };

  const rows: ClientHoldingStress[] = features.map(f => {
    const dims: string[] = [];
    let intensity = 0;

    // 1. Volatility
    if (f.vol > VOL_THRESHOLD) {
      const s = severity(f.vol - VOL_THRESHOLD, VOL_SCALE);
      dims.push(CLIENT_STRESS_DIM_LABEL.volatility);
      intensity += s;
      flagged.volatility.push({ symbol: f.symbol, severity: s });
    }
    // 2. Drawdown — note: mdd is negative; we flag when mdd < threshold
    if (f.mdd < DD_THRESHOLD) {
      const s = severity(DD_THRESHOLD - f.mdd, DD_SCALE);
      dims.push(CLIENT_STRESS_DIM_LABEL.drawdown);
      intensity += s;
      flagged.drawdown.push({ symbol: f.symbol, severity: s });
    }
    // 3. Concentration
    if (f.weight > concentrationThreshold) {
      const s = severity(f.weight - concentrationThreshold, concentrationScale);
      dims.push(CLIENT_STRESS_DIM_LABEL.concentration);
      intensity += s;
      flagged.concentration.push({ symbol: f.symbol, severity: s });
    }
    // 4. Underperformance
    if (f.totalReturn < UNDER_THRESHOLD) {
      const s = severity(UNDER_THRESHOLD - f.totalReturn, UNDER_SCALE);
      dims.push(CLIENT_STRESS_DIM_LABEL.underperformance);
      intensity += s;
      flagged.underperformance.push({ symbol: f.symbol, severity: s });
    }
    // 5. Recent weakness
    if (recentMedian !== 0 && (recentMedian - f.recent21) > RECENT_GAP) {
      const s = severity(recentMedian - f.recent21 - RECENT_GAP, 0.10);
      dims.push(CLIENT_STRESS_DIM_LABEL.recent_weakness);
      intensity += s;
      flagged.recent_weakness.push({ symbol: f.symbol, severity: s });
    }

    return {
      symbol: f.symbol,
      weight: f.weight,
      intensity,
      count: dims.length,
      dimensions: dims,
    };
  }).sort((a, b) => b.intensity - a.intensity);

  const dimensionSummaries: ClientStressDimensionSummary[] = (Object.keys(flagged) as ClientStressDimension[]).map(k => {
    const entries = flagged[k];
    const mean = entries.length > 0
      ? entries.reduce((s, e) => s + e.severity, 0) / entries.length
      : 0;
    return {
      key: k,
      label: CLIENT_STRESS_DIM_LABEL[k],
      description: describe(k),
      flaggedSymbols: entries.map(e => e.symbol),
      meanSeverity: mean,
    };
  });

  return { rows, dimensions: dimensionSummaries, hasUsableData };
}

function describe(d: ClientStressDimension): string {
  switch (d) {
    case 'volatility':       return `Annualised realised vol above ${(VOL_THRESHOLD * 100).toFixed(0)}%`;
    case 'drawdown':         return `Peak-to-trough drawdown beyond ${(DD_THRESHOLD * 100).toFixed(0)}%`;
    case 'concentration':    return `Effective weight materially above equal-weight baseline`;
    case 'underperformance': return `Cumulative return below ${(UNDER_THRESHOLD * 100).toFixed(0)}%`;
    case 'recent_weakness':  return `21-day return lagging the portfolio median by > ${(RECENT_GAP * 100).toFixed(0)}%`;
  }
}
