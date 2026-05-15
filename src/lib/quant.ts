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

// ─── Analytics V0.5 additions ───────────────────────────────────────────────

/** Downside deviation: RMS of returns falling below MAR. Semi-standard deviation used in Sortino. */
export function downsideDeviation(returns: number[], mar = 0): number {
  if (returns.length < 2) return 0;
  let sum = 0;
  for (const r of returns) {
    const shortfall = Math.min(r - mar, 0);
    sum += shortfall * shortfall;
  }
  return Math.sqrt(sum / returns.length);
}

/** Historical VaR at a given confidence level. Returns a positive loss fraction.
 *  e.g. confidence=0.95 → worst 5th-percentile daily loss. */
export function historicalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length < 10) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  return -sorted[Math.max(0, idx)];
}

/** Parametric VaR assuming normally distributed returns. Positive = loss. */
export function parametricVaR(returns: number[], confidence = 0.95): number {
  if (returns.length < 10) return 0;
  const m = mean(returns);
  const s = stdev(returns);
  const zMap: Record<number, number> = { 0.9: 1.282, 0.95: 1.645, 0.99: 2.326 };
  const z = zMap[confidence] ?? 1.645;
  return Math.max(0, -(m - z * s));
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

/** Rolling annualised volatility (%) from a log-return series. */
export function rollingAnnualisedVol(returns: number[], window: number, ppy = 252): number[] {
  return rollingStdev(returns, window).map((s) => s * Math.sqrt(ppy) * 100);
}

/** Rolling z-score: (value[t] − rolling_mean) / rolling_stdev — mean-reversion signal. */
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

/** Portfolio variance: wᵀΣw. */
export function portfolioVariance(weights: number[], covMatrix: number[][]): number {
  const n = weights.length;
  let v = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      v += weights[i] * weights[j] * (covMatrix[i]?.[j] ?? 0);
    }
  }
  return Math.max(0, v);
}

/** Annualised portfolio volatility (as fraction, not %). */
export function portfolioVol(weights: number[], covMatrix: number[][], periodsPerYear = 252): number {
  return Math.sqrt(portfolioVariance(weights, covMatrix) * periodsPerYear);
}

/** Marginal risk contributions summing to 1: RC_i = w_i * (Σw)_i / σ_p². */
export function riskContributions(weights: number[], covMatrix: number[][]): number[] {
  const n = weights.length;
  const variance = portfolioVariance(weights, covMatrix);
  if (variance <= 0) return weights.map(() => 1 / n);
  const sigmaW = weights.map((_, i) =>
    weights.reduce((s, wj, j) => s + (covMatrix[i]?.[j] ?? 0) * wj, 0),
  );
  return weights.map((wi, i) => (wi * sigmaW[i]) / variance);
}

/** Annualised portfolio return from aligned log-return series. */
export function portfolioAnnualisedReturn(returnSeries: number[][], weights: number[], periodsPerYear = 252): number {
  if (returnSeries.length === 0) return 0;
  const minLen = Math.min(...returnSeries.map((s) => s.length));
  if (minLen < 2) return 0;
  const aligned = returnSeries.map((s) => s.slice(-minLen));
  let totalLogReturn = 0;
  for (let t = 0; t < minLen; t++) {
    for (let i = 0; i < weights.length; i++) {
      totalLogReturn += weights[i] * (aligned[i][t] ?? 0);
    }
  }
  return Math.exp((totalLogReturn / minLen) * periodsPerYear) - 1;
}

/** Period-by-period weighted portfolio log returns (for equity curve). */
export function portfolioReturnSeries(returnSeries: number[][], weights: number[]): number[] {
  if (returnSeries.length === 0) return [];
  const minLen = Math.min(...returnSeries.map((s) => s.length));
  const aligned = returnSeries.map((s) => s.slice(-minLen));
  return Array.from({ length: minLen }, (_, t) =>
    weights.reduce((s, wi, i) => s + wi * (aligned[i][t] ?? 0), 0),
  );
}

/** Build an equity curve (starting at 1) from a log-return series. */
export function equityCurve(returns: number[]): number[] {
  let eq = 1;
  return [eq, ...returns.map((r) => { eq *= Math.exp(r); return eq; })];
}

// ─── Analytics V1.0 additions ────────────────────────────────────────────────

/** Rolling Sharpe ratio over a window of log-return periods. */
export function rollingSharpe(returns: number[], window: number, ppy = 252): number[] {
  if (returns.length < window) return [];
  const out: number[] = [];
  for (let i = window; i <= returns.length; i++) {
    out.push(sharpeRatio(returns.slice(i - window, i), 0, ppy));
  }
  return out;
}

/** OLS beta of asset returns vs benchmark returns. */
export function beta(assetReturns: number[], benchReturns: number[]): number {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n < 2) return 1;
  const a = assetReturns.slice(-n), b = benchReturns.slice(-n);
  const mb = mean(b);
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - mean(a)) * (b[i] - mb);
    varB += (b[i] - mb) ** 2;
  }
  return varB === 0 ? 1 : cov / varB;
}

/** Jensen's alpha (annualised): asset_return − (rf + β × (bench_return − rf)). */
export function jensensAlpha(
  assetAnnReturn: number,
  benchAnnReturn: number,
  b: number,
  rf = 0,
): number {
  return assetAnnReturn - (rf + b * (benchAnnReturn - rf));
}

/** Tracking error: annualised stdev of (asset − benchmark) excess returns. */
export function trackingError(assetReturns: number[], benchReturns: number[], ppy = 252): number {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n < 2) return 0;
  const excess = Array.from({ length: n }, (_, i) => assetReturns[i] - benchReturns[i]);
  return stdev(excess) * Math.sqrt(ppy);
}

/** Information ratio: (asset_return − bench_return) / tracking_error. */
export function informationRatio(
  assetAnnReturn: number,
  benchAnnReturn: number,
  te: number,
): number {
  return te === 0 ? 0 : (assetAnnReturn - benchAnnReturn) / te;
}

/** Rebase a price series to 100 at index 0. */
export function rebase100(values: number[]): number[] {
  if (!values.length || values[0] === 0) return values;
  const base = values[0];
  return values.map(v => (v / base) * 100);
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

/** Monte Carlo simulation of future paths. Returns percentile series at P10/P25/P50/P75/P90.
 *  paths: number of simulations, horizon: number of periods forward. */
export function monteCarloPaths(
  returns: number[],
  horizon = 252,
  paths = 500,
): { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] } {
  if (returns.length < 2) {
    const z = new Array(horizon + 1).fill(1);
    return { p10: z, p25: z, p50: z, p75: z, p90: z };
  }
  const m = mean(returns);
  const s = stdev(returns);
  // Box-Muller RNG
  function randNorm(): number {
    const u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  }
  const allPaths: number[][] = [];
  for (let p = 0; p < paths; p++) {
    let v = 1;
    const path = [v];
    for (let t = 0; t < horizon; t++) {
      v *= Math.exp(m + s * randNorm());
      path.push(v);
    }
    allPaths.push(path);
  }
  // Compute percentiles at each time step
  const result = { p10: [], p25: [], p50: [], p75: [], p90: [] } as Record<string, number[]>;
  for (let t = 0; t <= horizon; t++) {
    const col = allPaths.map(p => p[t]).sort((a, b) => a - b);
    const pick = (q: number) => col[Math.floor(q * (col.length - 1))];
    result.p10.push(pick(0.10));
    result.p25.push(pick(0.25));
    result.p50.push(pick(0.50));
    result.p75.push(pick(0.75));
    result.p90.push(pick(0.90));
  }
  return result as { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] };
}

/** Efficient frontier: simulate N random weight combinations, return { vol, ret, sharpe }[]. */
export function efficientFrontierPoints(
  returnSeries: number[][],
  n = 200,
  ppy = 252,
): Array<{ vol: number; ret: number; sharpe: number; weights: number[] }> {
  const k = returnSeries.length;
  if (k < 2) return [];
  const cov = covarianceMatrix(returnSeries);
  const annReturns = returnSeries.map(lr =>
    lr.length >= 2 ? (Math.exp(mean(lr) * ppy) - 1) : 0
  );
  const points: Array<{ vol: number; ret: number; sharpe: number; weights: number[] }> = [];
  for (let i = 0; i < n; i++) {
    // Random Dirichlet weights
    const raw = Array.from({ length: k }, () => -Math.log(Math.random() + 1e-10));
    const sum = raw.reduce((a, b) => a + b, 0);
    const w = raw.map(v => v / sum);
    const vol = portfolioVol(w, cov, ppy);
    const ret = w.reduce((s, wi, j) => s + wi * annReturns[j], 0);
    const sharpe = vol > 0 ? ret / vol : 0;
    points.push({ vol: vol * 100, ret: ret * 100, sharpe, weights: w });
  }
  return points;
}
