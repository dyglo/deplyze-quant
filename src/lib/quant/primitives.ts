/**
 * Statistical primitives — pure, dependency-free, no lookahead.
 *
 * Everything here operates on raw number[] series. Domain wrappers
 * (returns, vol, risk, etc.) live in sibling modules and import from here.
 */

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/** Linear-interpolated quantile of a sample. `q` in [0,1]. */
export function percentile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  if (xs.length === 1) return xs[0];
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = Math.min(Math.max(q, 0), 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Fraction of historical observations ≤ `value`. Returns 0..1.
 *  Used for "current vol is in the lowest 7% of history" style intelligence. */
export function percentileRank(history: number[], value: number): number {
  if (!history.length) return 0;
  let below = 0;
  for (const x of history) if (x <= value) below++;
  return below / history.length;
}

/** Sample skewness (Fisher-Pearson). */
export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  const s = stdev(xs);
  if (s === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * sum;
}

/** Excess kurtosis (sample, unbiased). Normal distribution → 0. */
export function excessKurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  const s = stdev(xs);
  if (s === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - m) / s) ** 4;
  const a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const b = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return a * sum - b;
}

export interface DistributionStats {
  n: number;
  mean: number;
  stdev: number;
  min: number;
  max: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  excessKurtosis: number;
}

export function distributionStats(xs: number[]): DistributionStats {
  if (!xs.length) {
    return { n: 0, mean: 0, stdev: 0, min: 0, max: 0, median: 0, q1: 0, q3: 0, iqr: 0, skewness: 0, excessKurtosis: 0 };
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  return {
    n: xs.length,
    mean: mean(xs),
    stdev: stdev(xs),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: percentile(sorted, 0.5),
    q1,
    q3,
    iqr: q3 - q1,
    skewness: skewness(xs),
    excessKurtosis: excessKurtosis(xs),
  };
}

/** Simple moving average. Returns array of length max(0, n − window + 1). */
export function sma(values: number[], window: number): number[] {
  if (values.length < window || window < 1) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < window; i++) sum += values[i];
  out.push(sum / window);
  for (let i = window; i < values.length; i++) {
    sum += values[i] - values[i - window];
    out.push(sum / window);
  }
  return out;
}

/** Rolling mean (alias of sma). */
export function rollingMean(values: number[], window: number): number[] {
  return sma(values, window);
}

/** Rolling sample stdev. Returns array of length max(0, n − window + 1). */
export function rollingStdev(values: number[], window: number): number[] {
  if (values.length < window || window < 2) return [];
  const out: number[] = [];
  for (let i = window; i <= values.length; i++) {
    out.push(stdev(values.slice(i - window, i)));
  }
  return out;
}

/** Rolling z-score: (value[t] − rolling_mean) / rolling_stdev. Mean-reversion signal. */
export function rollingZScore(values: number[], window: number): number[] {
  if (values.length < window || window < 2) return [];
  const out: number[] = [];
  for (let i = window; i <= values.length; i++) {
    const slice = values.slice(i - window, i);
    const m = mean(slice);
    const s = stdev(slice);
    out.push(s === 0 ? 0 : (values[i - 1] - m) / s);
  }
  return out;
}

/** Z-score of a single value vs a sample. */
export function zScore(history: number[], value: number): number {
  const s = stdev(history);
  if (s === 0) return 0;
  return (value - mean(history)) / s;
}

/** Lag-k autocorrelation. */
export function autocorrelation(xs: number[], lag = 1): number {
  const n = xs.length;
  if (n < lag + 2) return 0;
  const m = mean(xs);
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i] - m;
    denom += d * d;
    if (i + lag < n) num += d * (xs[i + lag] - m);
  }
  return denom === 0 ? 0 : num / denom;
}
