/**
 * Correlation, covariance, and dependency-shift detection.
 */

import type { OHLCVBar } from '../../types';
import { mean, stdev } from './primitives';

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const xs = x.slice(-n), ys = y.slice(-n);
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

/** Rolling Pearson correlation. Returns an array of length max(0, n - window + 1). */
export function rollingPearson(x: number[], y: number[], window: number): number[] {
  const n = Math.min(x.length, y.length);
  if (n < window) return [];
  const out: number[] = [];
  for (let i = window; i <= n; i++) {
    out.push(pearson(x.slice(i - window, i), y.slice(i - window, i)));
  }
  return out;
}

/** Build a value-aligned series for two symbols whose bars may not share
 *  every timestamp — keeps only timestamps present in both. */
export function alignClosesByTs(
  a: OHLCVBar[],
  b: OHLCVBar[],
): { ts: number[]; a: number[]; b: number[] } {
  const mb = new Map(b.map((x) => [x.ts, x.close] as const));
  const ts: number[] = [], ca: number[] = [], cb: number[] = [];
  for (const bar of a) {
    const m = mb.get(bar.ts);
    if (m != null) { ts.push(bar.ts); ca.push(bar.close); cb.push(m); }
  }
  return { ts, a: ca, b: cb };
}

/** Interpret a Pearson coefficient for the relationship drawer. */
export function interpretCorrelation(r: number): { strength: string; direction: string; phrase: string } {
  const abs = Math.abs(r);
  let strength = 'weak';
  if (abs > 0.7) strength = 'very strong';
  else if (abs > 0.5) strength = 'strong';
  else if (abs > 0.3) strength = 'moderate';
  else if (abs > 0.15) strength = 'mild';
  else strength = 'negligible';
  const direction = r > 0 ? 'positive' : r < 0 ? 'negative' : 'neutral';
  const phrase = r === 0
    ? 'Returns show no linear relationship in this window.'
    : `${strength} ${direction} co-movement — pairs tend to move ${r > 0 ? 'together' : 'opposite each other'} in this window.`;
  return { strength, direction, phrase };
}

/** Full NxN covariance matrix from N aligned log-return series. */
export function covarianceMatrix(returnSeries: number[][]): number[][] {
  const n = returnSeries.length;
  if (n === 0) return [];
  const minLen = Math.min(...returnSeries.map((s) => s.length));
  const aligned = returnSeries.map((s) => s.slice(-minLen));
  const means = aligned.map(mean);
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < minLen; k++) {
        s += (aligned[i][k] - means[i]) * (aligned[j][k] - means[j]);
      }
      cov[i][j] = cov[j][i] = minLen > 1 ? s / (minLen - 1) : 0;
    }
  }
  return cov;
}

/** Pairwise correlation matrix from N aligned log-return series. */
export function correlationMatrix(returnSeries: number[][]): number[][] {
  const n = returnSeries.length;
  if (n === 0) return [];
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    out[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = pearson(returnSeries[i], returnSeries[j]);
      out[i][j] = out[j][i] = r;
    }
  }
  return out;
}

export interface CorrelationDrift {
  current: number;
  historical: number;
  delta: number;            // current − historical
  zScore: number;           // (current − historical) / stdev(rolling)
  state: 'stable' | 'tightening' | 'loosening' | 'breakdown';
  rolling: number[];        // the underlying rolling-correlation series
}

/** Detect a dependency shift between two return series.
 *
 *  `recentWindow` is the local correlation; `baselineWindow` is the longer
 *  baseline. A breakdown is flagged when the absolute z-score of the recent
 *  correlation exceeds 2 against the rolling-correlation distribution. */
export function correlationDrift(
  x: number[],
  y: number[],
  recentWindow = 21,
  baselineWindow = 126,
): CorrelationDrift | null {
  if (x.length < baselineWindow + recentWindow || y.length < baselineWindow + recentWindow) return null;
  const rolling = rollingPearson(x, y, recentWindow);
  if (rolling.length < 30) return null;

  const current = rolling[rolling.length - 1];
  const historicalSlice = rolling.slice(-baselineWindow, -1);
  const historical = mean(historicalSlice);
  const sd = stdev(historicalSlice);
  const z = sd === 0 ? 0 : (current - historical) / sd;
  const delta = current - historical;

  let state: CorrelationDrift['state'];
  if (Math.abs(z) > 2.5) state = 'breakdown';
  else if (delta > 0.1) state = 'tightening';
  else if (delta < -0.1) state = 'loosening';
  else state = 'stable';

  return { current, historical, delta, zScore: z, state, rolling };
}
