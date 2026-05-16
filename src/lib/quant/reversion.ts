/**
 * Mean-reversion vs momentum decomposition.
 *
 * Produces a probabilistic decomposition of the current structural state into
 * three bands — mean-reversion likely / momentum-persistence likely /
 * indeterminate — based on:
 *   • short-window rolling z-score (overextension signal)
 *   • trend stability and momentum persistence
 *   • volatility-adjusted distance from trend
 *   • recent autocorrelation of returns
 *
 * Output is probabilistic, never a buy/sell. The terminal frames it as
 * "historical structure favored ___ X% of the time" in the UI.
 *
 * Strict-data policy: returns null when history is insufficient.
 */

import type { OHLCVBar } from '../../types';
import { closes, logReturns } from './returns';
import { mean, stdev, rollingMean, rollingStdev, percentileRank, autocorrelation } from './primitives';
import { trendStability, momentumPersistence } from './momentum';

export interface ReversionProfile {
  asOf: number;
  symbol: string;
  /** Probability the structure favours mean reversion (0..1). */
  reversionProb: number;
  /** Probability the structure favours momentum continuation (0..1). */
  continuationProb: number;
  /** Residual ambiguity. reversion + continuation + ambiguity = 1. */
  ambiguityProb: number;
  /** Latest 5-bar return z-score. */
  shortTermZ: number;
  /** Latest close vs SMA50 z-score on residuals. */
  trendDeviationZ: number;
  /** Vol-adjusted distance from 20-bar mean. */
  volAdjDistance: number;
  /** Momentum persistence (0..1). */
  persistence: number;
  /** Trend stability (0..1). */
  stability: number;
  /** Lag-1 return autocorrelation. Positive favours momentum; negative favours reversion. */
  ac1: number;
  /** One-sentence narrative summary. */
  narrative: string;
  /** 0..1 confidence in the decomposition based on history adequacy + signal coherence. */
  confidence: number;
}

const SHORT_WIN = 5;
const TREND_WIN = 50;
const VOL_WIN = 20;
const MIN_BARS = 200;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function softmax3(a: number, b: number, c: number): [number, number, number] {
  const m = Math.max(a, b, c);
  const ea = Math.exp(a - m), eb = Math.exp(b - m), ec = Math.exp(c - m);
  const s = ea + eb + ec;
  return [ea / s, eb / s, ec / s];
}

export function reversionProfile(
  bars: OHLCVBar[],
  opts: { symbol?: string } = {},
): ReversionProfile | null {
  if (bars.length < MIN_BARS) return null;
  const symbol = opts.symbol ?? 'series';
  const cl = closes(bars);
  const lr = logReturns(cl);
  if (lr.length < MIN_BARS - 1) return null;

  // Short-term return z-score: latest SHORT_WIN-bar mean return relative to
  // its rolling history.
  const recent = lr.slice(-SHORT_WIN);
  const recentMean = mean(recent);
  // Rolling 5-bar means over history to z-score the latest.
  const rollingMeans = rollingMean(lr, SHORT_WIN);
  const histMean = mean(rollingMeans);
  const histStd = stdev(rollingMeans) || 1e-9;
  const shortTermZ = (recentMean - histMean) / histStd;

  // Trend deviation z-score (close − SMA50, scaled by stdev of residuals).
  const sma = rollingMean(cl, TREND_WIN);
  const aligned = cl.slice(cl.length - sma.length);
  const dev = aligned.map((c, i) => c - sma[i]);
  const m = mean(dev), s = stdev(dev) || 1e-9;
  const trendDeviationZ = (dev[dev.length - 1] - m) / s;

  // Vol-adjusted distance from 20-bar mean.
  const tail = cl.slice(-VOL_WIN);
  const baseMean = mean(tail);
  const lrTail = lr.slice(-VOL_WIN);
  const sigma = stdev(lrTail) || 1e-9;
  const volAdjDistance = baseMean > 0 ? (cl[cl.length - 1] / baseMean - 1) / sigma : 0;

  // Momentum / stability
  const persistence = momentumPersistence(cl, 21, 60);
  const stability = trendStability(cl, 21, 60);

  // Autocorrelation lag-1 on returns
  const ac1 = autocorrelation(lr.slice(-Math.min(252, lr.length)), 1);

  // ─── Probability decomposition ──────────────────────────────────────────
  // Logit-style scoring:
  //   Reversion ↑ when |shortTermZ|, |trendDeviationZ| are high and ac1 is negative.
  //   Continuation ↑ when persistence/stability are high, ac1 > 0,
  //                       vol-adjusted distance is moderate, dev not extreme.
  const overextension = Math.min(2, Math.abs(shortTermZ)) + Math.min(2, Math.abs(trendDeviationZ));
  const revScore =
    0.9 * overextension +
    1.2 * Math.max(0, -ac1 * 4) +                          // ac1 = -0.25 → contributes 1.2
    0.4 * (1 - stability);
  const contScore =
    1.2 * persistence * 2 +                                 // persistence in [0,1]
    1.0 * stability * 2 +
    0.8 * Math.max(0, ac1 * 4) +
    0.3 * Math.max(0, 1 - Math.abs(trendDeviationZ));       // moderate trend, not exhausted
  const ambScore = 0.8;                                     // baseline ambiguity term

  const [revP, contP, ambP] = softmax3(revScore, contScore, ambScore);

  // Confidence: sample adequacy × signal coherence (one branch dominating).
  const sampleAdequacy = Math.min(1, bars.length / 504);
  const coherence = Math.max(revP, contP, ambP); // 0.33..1
  const confidence = clamp01(0.4 + 0.35 * sampleAdequacy + 0.25 * (coherence - 0.33) * 1.5);

  // Narrative
  const dominant = revP >= contP && revP >= ambP ? 'mean-reversion'
                 : contP >= ambP ? 'momentum continuation'
                 : 'indeterminate';
  const pctDom = (Math.max(revP, contP, ambP) * 100).toFixed(0);
  const ext = Math.abs(trendDeviationZ) >= 2 ? ' Trend deviation is statistically extreme.'
            : Math.abs(trendDeviationZ) >= 1 ? ' Trend deviation is mildly stretched.'
            : '';
  const acPhrase = ac1 > 0.1 ? ' Recent returns show positive serial correlation.'
                 : ac1 < -0.1 ? ' Recent returns show negative serial correlation.'
                 : '';
  const narrative =
    `${symbol}: structure historically favoured ${dominant} ${pctDom}% of the time in similar regimes` +
    `${ext}${acPhrase} (persistence ${(persistence * 100).toFixed(0)}%, stability ${(stability * 100).toFixed(0)}%).`;

  // Symbolic reference (vol percentile used by future tab UI)
  void percentileRank;

  return {
    asOf: bars[bars.length - 1].ts,
    symbol,
    reversionProb: revP,
    continuationProb: contP,
    ambiguityProb: ambP,
    shortTermZ,
    trendDeviationZ,
    volAdjDistance,
    persistence,
    stability,
    ac1,
    narrative,
    confidence,
  };
}
