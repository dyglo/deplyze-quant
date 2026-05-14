/**
 * quant.ts — small numerical primitives used across the research UI.
 *
 * Kept dependency-free and pure so they can run on any cached bar series in
 * the browser. No lookahead, no in-place mutation.
 */

import type { OHLCVBar } from '../types';

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

/** Annualised volatility from a series of log returns. periodsPerYear:
 *  252 for daily bars (default), 52 for weekly, 12 for monthly. */
export function annualisedVol(lr: number[], periodsPerYear = 252): number {
  return stdev(lr) * Math.sqrt(periodsPerYear);
}

/** Max drawdown of an equity curve (built from cumulative log returns).
 *  Returns the worst peak-to-trough decline as a positive fraction (e.g. 0.23). */
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
