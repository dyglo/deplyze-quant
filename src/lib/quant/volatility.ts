/**
 * Volatility family — realised, rolling, ATR, percentile-rank, regime detection.
 *
 * All volatilities default to daily-bar conventions (252 periods/year).
 * Set `ppy` explicitly when feeding weekly/intraday series.
 */

import type { OHLCVBar } from '../../types';
import { mean, percentile, percentileRank, rollingStdev, stdev, autocorrelation } from './primitives';

/** Annualised volatility from a series of log returns. */
export function annualisedVol(lr: number[], periodsPerYear = 252): number {
  return stdev(lr) * Math.sqrt(periodsPerYear);
}

/** Rolling annualised volatility (%) from a log-return series. */
export function rollingAnnualisedVol(returns: number[], window: number, ppy = 252): number[] {
  return rollingStdev(returns, window).map((s) => s * Math.sqrt(ppy) * 100);
}

/** Realised volatility over the last `window` log returns (annualised, fractional). */
export function realisedVol(returns: number[], window: number, ppy = 252): number {
  if (returns.length < window) return 0;
  return stdev(returns.slice(-window)) * Math.sqrt(ppy);
}

/** Average True Range over `window` bars (Wilder smoothing not used — simple mean
 *  for transparency; tests downstream don't rely on EMA quirks). */
export function atr(bars: OHLCVBar[], window = 14): number[] {
  if (bars.length < 2) return [];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1];
    tr.push(Math.max(
      b.high - b.low,
      Math.abs(b.high - p.close),
      Math.abs(b.low - p.close),
    ));
  }
  if (tr.length < window) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < window; i++) sum += tr[i];
  out.push(sum / window);
  for (let i = window; i < tr.length; i++) {
    sum += tr[i] - tr[i - window];
    out.push(sum / window);
  }
  return out;
}

/** Percentile rank (0..1) of the latest ATR within its own history. */
export function atrPercentileRank(bars: OHLCVBar[], window = 14): number {
  const series = atr(bars, window);
  if (series.length < 2) return 0;
  const last = series[series.length - 1];
  return percentileRank(series, last);
}

export type VolState = 'compressed' | 'low' | 'normal' | 'elevated' | 'expanded';

export interface VolatilityRegime {
  state: VolState;
  realisedVol: number;          // last-window annualised vol (fractional)
  percentileRank: number;       // 0..1 vs own history
  ratio: number;                // short-vol / long-vol
  zScore: number;               // vs long-window distribution
  trend: 'expanding' | 'compressing' | 'stable';
}

/** Classify the current volatility regime from a log-return series.
 *
 *  Uses two timescales — short (default 21) and long (default 252) — to detect
 *  expansion / compression, then ranks the current short-window vol against the
 *  rolling-vol history for a percentile-aware state. */
export function volatilityRegime(
  returns: number[],
  shortWindow = 21,
  longWindow = 252,
  ppy = 252,
): VolatilityRegime | null {
  if (returns.length < longWindow + shortWindow) return null;

  const shortVol = realisedVol(returns, shortWindow, ppy);
  const longVol = realisedVol(returns.slice(0, -shortWindow), longWindow, ppy);
  const history = rollingStdev(returns, shortWindow).map(s => s * Math.sqrt(ppy));
  if (history.length < 30) return null;

  const rank = percentileRank(history, shortVol);
  const ratio = longVol === 0 ? 1 : shortVol / longVol;
  const histMean = mean(history);
  const histStd = stdev(history);
  const z = histStd === 0 ? 0 : (shortVol - histMean) / histStd;

  let state: VolState;
  if (rank < 0.1) state = 'compressed';
  else if (rank < 0.3) state = 'low';
  else if (rank < 0.7) state = 'normal';
  else if (rank < 0.9) state = 'elevated';
  else state = 'expanded';

  let trend: VolatilityRegime['trend'];
  if (ratio > 1.15) trend = 'expanding';
  else if (ratio < 0.85) trend = 'compressing';
  else trend = 'stable';

  return { state, realisedVol: shortVol, percentileRank: rank, ratio, zScore: z, trend };
}

/** Volatility clustering proxy: autocorrelation of squared log returns at lag 1.
 *  Positive values (≈ 0.1–0.4) indicate the GARCH-style clustering that's the
 *  hallmark of fat-tailed regimes. */
export function volatilityClustering(returns: number[]): number {
  if (returns.length < 10) return 0;
  const squared = returns.map(r => r * r);
  return autocorrelation(squared, 1);
}

/** Compute volatility percentile rank for an arbitrary realised-vol point
 *  against a longer history of rolling vols. */
export function volPercentile(history: number[], current: number): number {
  return percentileRank(history, current);
}

/** Convenience: "lowest 7% / highest 12%" style description from rank. */
export function describeVolPercentile(rank: number): string {
  const pct = Math.round(rank * 100);
  if (pct <= 10) return `lowest ${pct}% of historical observations`;
  if (pct <= 25) return `bottom quartile (${pct}th percentile)`;
  if (pct < 50)  return `below median (${pct}th percentile)`;
  if (pct === 50) return `at the historical median`;
  if (pct < 75)  return `above median (${pct}th percentile)`;
  if (pct < 90)  return `top quartile (${pct}th percentile)`;
  return `highest ${100 - pct}% of historical observations`;
}

// Re-export percentile from primitives for convenience at this layer.
export { percentile, percentileRank };
