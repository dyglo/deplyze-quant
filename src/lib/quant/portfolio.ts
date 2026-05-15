/**
 * Portfolio mathematics — variance, risk contributions, Monte Carlo, frontier.
 */

import { mean, stdev } from './primitives';
import { covarianceMatrix } from './correlation';

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

/** Monte Carlo simulation of future paths. Returns percentile series at P10/P25/P50/P75/P90. */
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
