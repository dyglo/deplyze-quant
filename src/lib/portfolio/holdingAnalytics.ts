/**
 * holdingAnalytics — pure analytics over per-holding price curves.
 *
 * Used by the Bloomberg-style data tables in the Portfolio Awareness
 * Workspace (PositionActivity, PerformanceDistribution, CorrelationProfile).
 * Every function is deterministic given its inputs; no I/O.
 */

import type { HoldingCurveInput } from './clientStress';

export interface Curve {
  symbol: string;
  data: { ts: number; value: number }[];
  totalReturn: number;
}

// ─── Return helpers ──────────────────────────────────────────────────────────

export function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

export function periodLogReturn(values: number[], window: number): number {
  if (values.length < window + 1) return 0;
  const a = values[values.length - window - 1];
  const b = values[values.length - 1];
  if (a <= 0 || b <= 0) return 0;
  return Math.log(b / a);
}

/** Convert log return to simple decimal return (e^r − 1). */
export function expDec(r: number): number {
  if (!isFinite(r)) return 0;
  return Math.exp(r) - 1;
}

export function annualisedVol(rets: number[], days = 252): number {
  if (rets.length < 5) return 0;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const sse = rets.reduce((s, r) => s + (r - mean) ** 2, 0);
  return Math.sqrt(sse / Math.max(1, rets.length - 1)) * Math.sqrt(days);
}

/** Beta from OLS of holding returns onto benchmark returns. */
export function betaTo(holdingRets: number[], benchmarkRets: number[]): number {
  const n = Math.min(holdingRets.length, benchmarkRets.length);
  if (n < 5) return 0;
  const h = holdingRets.slice(-n);
  const b = benchmarkRets.slice(-n);
  const meanH = h.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (h[i] - meanH) * (b[i] - meanB);
    varB += (b[i] - meanB) ** 2;
  }
  return varB > 0 ? cov / varB : 0;
}

/** Pearson correlation between two return series, tail-aligned. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const meanA = ax.reduce((s, x) => s + x, 0) / n;
  const meanB = bx.reduce((s, x) => s + x, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = ax[i] - meanA;
    const db = bx[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? cov / denom : 0;
}

export function maxDrawdownFromValues(values: number[]): number {
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
  return mdd;
}

// ─── Per-holding multi-period analytics ──────────────────────────────────────

export interface PositionMetrics {
  symbol: string;
  weight: number;
  values: number[];
  logRets: number[];
  ret5: number;
  ret21: number;
  ret63: number;
  retFull: number;
  vol: number;
  mdd: number;
  beta: number;
  corrToBenchmark: number;
  contribution: number;
}

export function computePositionMetrics(
  symbols: string[],
  weights: Record<string, number>,
  curves: HoldingCurveInput[],
  benchRets: number[],
): PositionMetrics[] {
  const curveMap = new Map(curves.map(c => [c.symbol, c]));

  return symbols.map(symbol => {
    const c = curveMap.get(symbol);
    const w = weights[symbol] ?? 0;
    if (!c || c.data.length < 5) {
      return {
        symbol, weight: w, values: [], logRets: [],
        ret5: 0, ret21: 0, ret63: 0, retFull: 0,
        vol: 0, mdd: 0, beta: 0, corrToBenchmark: 0, contribution: 0,
      };
    }
    const values = c.data.map(p => p.value).filter(v => v > 0 && isFinite(v));
    const lr = logReturns(values);
    const ret5    = expDec(periodLogReturn(values, 5));
    const ret21   = expDec(periodLogReturn(values, 21));
    const ret63   = expDec(periodLogReturn(values, 63));
    const retFull = isFinite(c.totalReturn) ? c.totalReturn : expDec(lr.reduce((s, r) => s + r, 0));
    return {
      symbol,
      weight: w,
      values,
      logRets: lr,
      ret5,
      ret21,
      ret63,
      retFull,
      vol: annualisedVol(lr),
      mdd: maxDrawdownFromValues(values),
      beta: benchRets.length ? betaTo(lr, benchRets) : 0,
      corrToBenchmark: benchRets.length ? correlation(lr, benchRets) : 0,
      contribution: w * retFull,
    };
  });
}
