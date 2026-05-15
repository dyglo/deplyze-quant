/**
 * Momentum and trend characterisation.
 */

import { logReturns } from './returns';
import { mean, sma, stdev } from './primitives';

/** Slope of OLS y = a + b*t over an evenly-spaced index axis. Returns the
 *  per-step slope; multiply by length for total expected drift. */
export function trendSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(values);
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - mx, dy = values[i] - my;
    num += dx * dy; denom += dx * dx;
  }
  return denom === 0 ? 0 : num / denom;
}

/** Quick natural-language trend summary suitable for tiles & briefs. */
export function trendLabel(closesArr: number[]): {
  label: 'strong-up' | 'up' | 'flat' | 'down' | 'strong-down' | 'insufficient';
  pctPerDay: number;
} {
  if (closesArr.length < 10) return { label: 'insufficient', pctPerDay: 0 };
  const lr = logReturns(closesArr);
  const total = lr.reduce((a, b) => a + b, 0);
  const pctPerDay = (Math.exp(total / lr.length) - 1) * 100;
  const abs = Math.abs(pctPerDay);
  let label: 'strong-up' | 'up' | 'flat' | 'down' | 'strong-down';
  if (abs < 0.05) label = 'flat';
  else if (pctPerDay > 0.25) label = 'strong-up';
  else if (pctPerDay > 0)    label = 'up';
  else if (pctPerDay < -0.25) label = 'strong-down';
  else                        label = 'down';
  return { label, pctPerDay };
}

export type SmaCrossState = 'bullish' | 'bearish' | 'neutral' | 'insufficient';

/** SMA crossover analysis. fast < slow required. */
export function smaCross(
  values: number[],
  fast = 20,
  slow = 50,
): { state: SmaCrossState; fastSma: number[]; slowSma: number[]; lastFast: number; lastSlow: number } {
  if (values.length < slow || fast >= slow) {
    return { state: 'insufficient', fastSma: [], slowSma: [], lastFast: 0, lastSlow: 0 };
  }
  const fastSma = sma(values, fast);
  const slowSma = sma(values, slow);
  const lastFast = fastSma[fastSma.length - 1];
  const lastSlow = slowSma[slowSma.length - 1];
  const diff = (lastFast - lastSlow) / lastSlow;
  const state: SmaCrossState = Math.abs(diff) < 0.001 ? 'neutral' : lastFast > lastSlow ? 'bullish' : 'bearish';
  return { state, fastSma, slowSma, lastFast, lastSlow };
}

/** Rolling N-period momentum as compounded simple return over the window. */
export function rollingMomentum(closes: number[], window: number): number[] {
  if (closes.length < window + 1) return [];
  const out: number[] = [];
  for (let i = window; i < closes.length; i++) {
    const a = closes[i - window], b = closes[i];
    if (a > 0) out.push(b / a - 1);
  }
  return out;
}

/** Momentum persistence: fraction of overlapping windows that share the sign
 *  of the most recent momentum reading. Range [0, 1] — higher = more persistent. */
export function momentumPersistence(closes: number[], window = 21, lookback = 60): number {
  const mom = rollingMomentum(closes, window);
  if (mom.length < 5) return 0;
  const tail = mom.slice(-Math.min(lookback, mom.length));
  const lastSign = Math.sign(tail[tail.length - 1]);
  if (lastSign === 0) return 0;
  let agree = 0;
  for (const v of tail) if (Math.sign(v) === lastSign) agree++;
  return agree / tail.length;
}

/** Trend stability: 1 − (stdev of rolling slopes / mean |slope|). Bounded [0,1].
 *  Near 1 = directional drift dominates noise; near 0 = whippy / choppy. */
export function trendStability(closes: number[], window = 21, lookback = 60): number {
  if (closes.length < window + 5) return 0;
  const slopes: number[] = [];
  const end = Math.min(closes.length, window + lookback);
  for (let i = window; i <= end; i++) {
    slopes.push(trendSlope(closes.slice(i - window, i)));
  }
  if (slopes.length < 3) return 0;
  const meanAbs = mean(slopes.map(Math.abs));
  const sd = stdev(slopes);
  if (meanAbs === 0) return 0;
  return Math.max(0, Math.min(1, 1 - sd / (meanAbs + sd)));
}
