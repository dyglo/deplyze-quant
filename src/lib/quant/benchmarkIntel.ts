/**
 * Benchmark intelligence — institutional summary of an asset's relationship
 * to a reference benchmark (SPY, QQQ, an index, etc).
 *
 * Builds on the primitives in [[benchmark]] and [[risk]] to produce a single
 * reviewer-friendly object: beta, alpha, tracking error, info ratio, hit
 * ratio, capture ratios, and rolling-beta drift so the UI can flag when an
 * asset is *changing* its relationship to the benchmark, not just describe
 * its long-run beta.
 *
 * Strict-data policy: returns `null` when overlap is < 60 bars. Rolling-beta
 * drift requires ≥ 2 × window.
 */

import type { OHLCVBar } from '../../types';
import { alignClosesByTs } from './correlation';
import { logReturns } from './returns';
import { mean } from './primitives';
import {
  beta,
  jensensAlpha,
  trackingError,
  informationRatio,
  hitRatio,
  captureRatios,
} from './benchmark';
import { rollingBeta } from './risk';

export interface BenchmarkIntelligence {
  benchmark: string;
  symbol: string;
  asOf: number;
  sampleSize: number;
  beta: number;
  alphaAnnualised: number;
  trackingError: number;
  informationRatio: number;
  hitRatio: number;
  upCapture: number;
  downCapture: number;
  rollingBeta: number[];
  betaDrift: {
    current: number;
    historicalMean: number;
    delta: number;
  } | null;
  /** True when |betaDrift.delta| exceeds 0.25 — a meaningful structural shift. */
  betaShiftFlagged: boolean;
}

const PPY = 252;

export function buildBenchmarkIntelligence(
  assetBars: OHLCVBar[],
  benchBars: OHLCVBar[],
  opts: { symbol?: string; benchmark?: string; rollingWindow?: number } = {},
): BenchmarkIntelligence | null {
  const aligned = alignClosesByTs(assetBars, benchBars);
  if (aligned.ts.length < 60) return null;
  const aLR = logReturns(aligned.a);
  const bLR = logReturns(aligned.b);
  const n = Math.min(aLR.length, bLR.length);
  if (n < 60) return null;

  const a = aLR.slice(-n), b = bLR.slice(-n);
  const annAsset = Math.exp(mean(a) * PPY) - 1;
  const annBench = Math.exp(mean(b) * PPY) - 1;
  const bVal = beta(a, b);
  const te = trackingError(a, b, PPY);
  const rolling = rollingBeta(a, b, opts.rollingWindow ?? 60);
  const cur = rolling.length ? rolling[rolling.length - 1] : bVal;
  const histMean = rolling.length > 5 ? mean(rolling.slice(0, -1)) : bVal;
  const drift = rolling.length > 5
    ? { current: cur, historicalMean: histMean, delta: cur - histMean }
    : null;

  const cap = captureRatios(a, b);

  return {
    benchmark: opts.benchmark ?? 'benchmark',
    symbol: opts.symbol ?? 'series',
    asOf: aligned.ts[aligned.ts.length - 1],
    sampleSize: n,
    beta: bVal,
    alphaAnnualised: jensensAlpha(annAsset, annBench, bVal, 0),
    trackingError: te,
    informationRatio: informationRatio(annAsset, annBench, te),
    hitRatio: hitRatio(a, b),
    upCapture: cap.up,
    downCapture: cap.down,
    rollingBeta: rolling,
    betaDrift: drift,
    betaShiftFlagged: !!(drift && Math.abs(drift.delta) > 0.25),
  };
}
