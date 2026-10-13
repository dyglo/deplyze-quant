/**
 * Return transformations on price series.
 *
 * All functions are pure and skip invalid (non-positive) prices to avoid
 * Infinity / NaN poisoning downstream rolling statistics.
 */

import type { OHLCVBar } from '../../types';

export function closes(bars: OHLCVBar[]): number[] {
  return bars.map((b) => b.close);
}

/** Simple period-over-period returns (skips zero/negative inputs). */
export function simpleReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i];
    if (a > 0 && b > 0) out.push(b / a - 1);
  }
  return out;
}

/** Log returns. Used for vol/correlation since they're additive. */
export function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

/** Cumulative simple-return series (compounded). */
export function cumulativeReturns(simple: number[]): number[] {
  const out: number[] = [];
  let eq = 1;
  for (const r of simple) { eq *= (1 + r); out.push(eq - 1); }
  return out;
}

/** Rebase a price series to 100 at index 0. */
export function rebase100(values: number[]): number[] {
  if (!values.length || values[0] === 0) return values;
  const base = values[0];
  return values.map(v => (v / base) * 100);
}
