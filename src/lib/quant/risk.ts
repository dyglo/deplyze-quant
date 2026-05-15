/**
 * Risk metrics — drawdown, VaR, Sharpe/Sortino/Calmar, rolling Sharpe & beta.
 */

import { mean, stdev } from './primitives';

/** Max drawdown of an equity curve. Returns the worst peak-to-trough decline
 *  as a positive fraction (e.g. 0.23). */
export function maxDrawdown(values: number[]): { mdd: number; peakIdx: number; troughIdx: number } {
  if (values.length < 2) return { mdd: 0, peakIdx: 0, troughIdx: 0 };
  let peak = values[0];
  let peakIdx = 0;
  let mdd = 0;
  let troughIdx = 0;
  let currentPeakIdx = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > peak) { peak = v; currentPeakIdx = i; }
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > mdd) { mdd = dd; peakIdx = currentPeakIdx; troughIdx = i; }
  }
  return { mdd, peakIdx, troughIdx };
}

/** All distinct drawdown periods: array of { start, trough, end, depth }. */
export function drawdownPeriods(curve: number[]): Array<{
  start: number; trough: number; end: number; depth: number;
}> {
  const periods: Array<{ start: number; trough: number; end: number; depth: number }> = [];
  let inDD = false, peakVal = curve[0] ?? 1, peakIdx = 0, troughVal = curve[0] ?? 1, troughIdx = 0;
  for (let i = 1; i < curve.length; i++) {
    const v = curve[i];
    if (!inDD) {
      if (v > peakVal) { peakVal = v; peakIdx = i; }
      else if (v < peakVal) { inDD = true; troughVal = v; troughIdx = i; }
    } else {
      if (v < troughVal) { troughVal = v; troughIdx = i; }
      else if (v >= peakVal) {
        const depth = peakVal > 0 ? (peakVal - troughVal) / peakVal : 0;
        if (depth > 0.01) periods.push({ start: peakIdx, trough: troughIdx, end: i, depth });
        inDD = false; peakVal = v; peakIdx = i;
      }
    }
  }
  if (inDD) {
    const depth = peakVal > 0 ? (peakVal - troughVal) / peakVal : 0;
    if (depth > 0.01) periods.push({ start: peakIdx, trough: troughIdx, end: curve.length - 1, depth });
  }
  return periods;
}

export interface DrawdownProfile {
  current: { depth: number; daysInDrawdown: number; recovered: boolean };
  worst: { depth: number; durationBars: number; recoveryBars: number | null };
  averageDepth: number;
  averageDurationBars: number;
  averageRecoveryBars: number | null;
  count: number;
}

/** Summary statistics across all drawdown periods plus the current state. */
export function drawdownProfile(curve: number[]): DrawdownProfile {
  const periods = drawdownPeriods(curve);
  const last = curve[curve.length - 1] ?? 0;
  let runningPeak = curve[0] ?? 0;
  let peakIdx = 0;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i] > runningPeak) { runningPeak = curve[i]; peakIdx = i; }
  }
  const currentDepth = runningPeak > 0 ? (runningPeak - last) / runningPeak : 0;
  const daysInDrawdown = curve.length - 1 - peakIdx;
  const recovered = currentDepth < 0.001;

  if (!periods.length) {
    return {
      current: { depth: currentDepth, daysInDrawdown, recovered },
      worst: { depth: currentDepth, durationBars: daysInDrawdown, recoveryBars: null },
      averageDepth: currentDepth,
      averageDurationBars: daysInDrawdown,
      averageRecoveryBars: null,
      count: 0,
    };
  }
  const depths = periods.map(p => p.depth);
  const durations = periods.map(p => p.trough - p.start);
  const recoveries = periods.map(p => p.end - p.trough);
  const worst = periods.reduce((a, b) => (b.depth > a.depth ? b : a));
  return {
    current: { depth: currentDepth, daysInDrawdown, recovered },
    worst: {
      depth: worst.depth,
      durationBars: worst.trough - worst.start,
      recoveryBars: worst.end > worst.trough ? worst.end - worst.trough : null,
    },
    averageDepth: mean(depths),
    averageDurationBars: mean(durations),
    averageRecoveryBars: recoveries.length ? mean(recoveries) : null,
    count: periods.length,
  };
}

/** Downside deviation: RMS of returns falling below MAR. Semi-standard deviation
 *  used in Sortino. */
export function downsideDeviation(returns: number[], mar = 0): number {
  if (returns.length < 2) return 0;
  let sum = 0;
  for (const r of returns) {
    const shortfall = Math.min(r - mar, 0);
    sum += shortfall * shortfall;
  }
  return Math.sqrt(sum / returns.length);
}

/** Historical VaR at a given confidence level. Returns a positive loss fraction. */
export function historicalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length < 10) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  return -sorted[Math.max(0, idx)];
}

/** Parametric VaR assuming normally distributed returns. */
export function parametricVaR(returns: number[], confidence = 0.95): number {
  if (returns.length < 10) return 0;
  const m = mean(returns);
  const s = stdev(returns);
  const zMap: Record<number, number> = { 0.9: 1.282, 0.95: 1.645, 0.99: 2.326 };
  const z = zMap[confidence] ?? 1.645;
  return Math.max(0, -(m - z * s));
}

/** Conditional VaR (a.k.a. Expected Shortfall): mean of returns in the tail
 *  beyond historical VaR. Returns a positive loss fraction. */
export function conditionalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length < 10) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.floor((1 - confidence) * sorted.length));
  const tail = sorted.slice(0, cutoff);
  return -mean(tail);
}

/** Annualised Sharpe ratio from log returns. */
export function sharpeRatio(returns: number[], riskFreePerPeriod = 0, periodsPerYear = 252): number {
  if (returns.length < 2) return 0;
  const excess = returns.map((r) => r - riskFreePerPeriod);
  const m = mean(excess);
  const s = stdev(excess);
  return s === 0 ? 0 : (m / s) * Math.sqrt(periodsPerYear);
}

/** Annualised Sortino ratio — only penalises returns below MAR. */
export function sortinoRatio(returns: number[], mar = 0, periodsPerYear = 252): number {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  const dd = downsideDeviation(returns, mar);
  if (dd === 0) return m > mar ? Infinity : 0;
  return ((m - mar) / dd) * Math.sqrt(periodsPerYear);
}

/** Calmar ratio: annualised return / max drawdown magnitude. */
export function calmarRatio(annualisedReturn: number, mddFraction: number): number {
  return mddFraction <= 0 ? 0 : annualisedReturn / mddFraction;
}

/** Rolling Sharpe ratio over a window of log-return periods. */
export function rollingSharpe(returns: number[], window: number, ppy = 252): number[] {
  if (returns.length < window) return [];
  const out: number[] = [];
  for (let i = window; i <= returns.length; i++) {
    out.push(sharpeRatio(returns.slice(i - window, i), 0, ppy));
  }
  return out;
}

/** Rolling OLS beta of asset vs benchmark. Both arrays must align in time. */
export function rollingBeta(assetReturns: number[], benchReturns: number[], window = 60): number[] {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n < window) return [];
  const a = assetReturns.slice(-n), b = benchReturns.slice(-n);
  const out: number[] = [];
  for (let i = window; i <= n; i++) {
    const aw = a.slice(i - window, i);
    const bw = b.slice(i - window, i);
    const mb = mean(bw), ma = mean(aw);
    let cov = 0, varB = 0;
    for (let k = 0; k < window; k++) {
      const db = bw[k] - mb;
      cov += (aw[k] - ma) * db;
      varB += db * db;
    }
    out.push(varB === 0 ? 1 : cov / varB);
  }
  return out;
}
