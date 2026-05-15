/**
 * Benchmark-relative performance measures.
 */

import { mean, stdev } from './primitives';

/** OLS beta of asset returns vs benchmark returns. */
export function beta(assetReturns: number[], benchReturns: number[]): number {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n < 2) return 1;
  const a = assetReturns.slice(-n), b = benchReturns.slice(-n);
  const ma = mean(a), mb = mean(b);
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const db = b[i] - mb;
    cov += (a[i] - ma) * db;
    varB += db * db;
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

/** Hit ratio: fraction of periods where the asset out-returned the benchmark. */
export function hitRatio(assetReturns: number[], benchReturns: number[]): number {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n === 0) return 0;
  let wins = 0;
  for (let i = 0; i < n; i++) if (assetReturns[i] > benchReturns[i]) wins++;
  return wins / n;
}

/** Up/down capture: average asset return when benchmark is up / down,
 *  divided by the corresponding average benchmark return. */
export function captureRatios(
  assetReturns: number[],
  benchReturns: number[],
): { up: number; down: number } {
  const n = Math.min(assetReturns.length, benchReturns.length);
  let upA = 0, upB = 0, upN = 0;
  let dnA = 0, dnB = 0, dnN = 0;
  for (let i = 0; i < n; i++) {
    if (benchReturns[i] > 0) { upA += assetReturns[i]; upB += benchReturns[i]; upN++; }
    else if (benchReturns[i] < 0) { dnA += assetReturns[i]; dnB += benchReturns[i]; dnN++; }
  }
  const up = upN === 0 || upB === 0 ? 0 : (upA / upN) / (upB / upN);
  const down = dnN === 0 || dnB === 0 ? 0 : (dnA / dnN) / (dnB / dnN);
  return { up, down };
}
