/**
 * Forward-return analytics.
 *
 * Given a bar series and a set of "condition" indices (events where some
 * trigger was satisfied), compute the distribution of forward returns over
 * one or more horizons. Strictly no lookahead: a forward return at horizon h
 * from index i uses prices i and i+h only — it is dropped if i+h would
 * exceed the series.
 *
 * Outputs are distribution shapes useful for institutional reasoning:
 * mean / median / win rate / downside probability / max-adverse-excursion /
 * confidence range (interquartile + 90% band).
 *
 * Strict-data policy: empty input → empty output; never synthetic.
 */

import type { OHLCVBar } from '../../types';
import { closes } from './returns';
import { mean, percentile, stdev } from './primitives';

/** Standard horizons used across the Historical Intelligence Terminal. */
export const DEFAULT_HORIZONS = [1, 5, 10, 20, 60] as const;
export type Horizon = number;

export interface ForwardReturnSample {
  /** Source bar index that triggered the sample. */
  index: number;
  /** Bar timestamp at the trigger. */
  ts: number;
  /** Horizon in bars. */
  horizon: Horizon;
  /** Forward simple return between bar i and bar i+horizon. */
  ret: number;
  /** Max adverse excursion (worst close-to-close drawdown between i+1..i+h). */
  mae: number;
  /** Max favourable excursion (best close-to-close gain between i+1..i+h). */
  mfe: number;
}

export interface ForwardReturnDistribution {
  horizon: Horizon;
  n: number;
  mean: number;
  median: number;
  stdev: number;
  winRate: number;              // fraction of samples with ret > 0
  downsideProbability: number;  // fraction with ret < 0
  meanMaeAbs: number;           // average |MAE| (positive number)
  worstMae: number;             // worst (most-negative) MAE in the sample
  /** 5th / 25th / 75th / 95th percentile bands of forward return. */
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  /** Raw samples in chronological order. */
  samples: ForwardReturnSample[];
}

/** Per-index forward returns for a single horizon.
 *
 *  Only indices `i` with `i + horizon < bars.length` produce a sample, so the
 *  outcome is always observable in the series — no synthesised future. */
export function buildForwardReturnSamples(
  bars: OHLCVBar[],
  conditionIndices: number[],
  horizon: Horizon,
): ForwardReturnSample[] {
  if (horizon < 1 || !bars.length) return [];
  const cl = closes(bars);
  const out: ForwardReturnSample[] = [];
  for (const i of conditionIndices) {
    const j = i + horizon;
    if (j >= bars.length || i < 0) continue;
    const p0 = cl[i];
    const pj = cl[j];
    if (!(p0 > 0) || !(pj > 0)) continue;
    let mae = 0;
    let mfe = 0;
    for (let k = i + 1; k <= j; k++) {
      const r = cl[k] / p0 - 1;
      if (r < mae) mae = r;
      if (r > mfe) mfe = r;
    }
    out.push({
      index: i,
      ts: bars[i].ts,
      horizon,
      ret: pj / p0 - 1,
      mae,
      mfe,
    });
  }
  return out;
}

/** Aggregate a forward-return sample list into a distribution descriptor. */
export function summariseForwardReturns(
  samples: ForwardReturnSample[],
  horizon: Horizon,
): ForwardReturnDistribution {
  if (!samples.length) {
    return {
      horizon, n: 0,
      mean: 0, median: 0, stdev: 0,
      winRate: 0, downsideProbability: 0,
      meanMaeAbs: 0, worstMae: 0,
      p05: 0, p25: 0, p75: 0, p95: 0,
      samples: [],
    };
  }
  const rets = samples.map(s => s.ret);
  const maes = samples.map(s => s.mae);
  const wins = rets.filter(r => r > 0).length;
  const downs = rets.filter(r => r < 0).length;
  const sorted = [...rets].sort((a, b) => a - b);
  return {
    horizon,
    n: samples.length,
    mean: mean(rets),
    median: percentile(sorted, 0.5),
    stdev: stdev(rets),
    winRate: wins / rets.length,
    downsideProbability: downs / rets.length,
    meanMaeAbs: mean(maes.map(Math.abs)),
    worstMae: Math.min(...maes),
    p05: percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    samples,
  };
}

/** Convenience: distributions across a set of horizons. */
export function forwardReturnDistributions(
  bars: OHLCVBar[],
  conditionIndices: number[],
  horizons: readonly Horizon[] = DEFAULT_HORIZONS,
): ForwardReturnDistribution[] {
  return horizons
    .filter(h => h >= 1)
    .map(h => summariseForwardReturns(buildForwardReturnSamples(bars, conditionIndices, h), h));
}

/** Unconditional forward-return distribution: every valid index becomes a
 *  trigger. Useful as a baseline against conditional samples. */
export function unconditionalForwardDistributions(
  bars: OHLCVBar[],
  horizons: readonly Horizon[] = DEFAULT_HORIZONS,
): ForwardReturnDistribution[] {
  const all: number[] = [];
  for (let i = 0; i < bars.length; i++) all.push(i);
  return forwardReturnDistributions(bars, all, horizons);
}

/** Confidence proxy from sample size + dispersion:
 *  high when n is large and stdev/|mean| is small (signal-to-noise).
 *  Returns 0..1. */
export function distributionConfidence(d: ForwardReturnDistribution): number {
  if (d.n === 0) return 0;
  const sizeScore = Math.min(1, d.n / 60);              // 60+ samples saturates
  const dispersion = d.stdev || 1e-9;
  const snr = Math.abs(d.mean) / dispersion;            // signal-to-noise
  const snrScore = Math.min(1, snr * 4);                // small means are realistic
  const tailSym = 1 - Math.min(1, Math.abs((d.p75 + d.p25) / 2 - d.median) / Math.max(d.stdev, 1e-6));
  return Math.max(0, Math.min(1, 0.5 * sizeScore + 0.3 * snrScore + 0.2 * tailSym));
}
