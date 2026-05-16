/**
 * Statistical extremes engine.
 *
 * Surfaces historically extreme states across multiple metrics so the
 * Historical Intelligence Terminal can answer "is this current reading
 * extreme by historical standards, and what did markets do after similar
 * extremes?" — without ever framing the answer as a buy/sell signal.
 *
 * Metrics:
 *   • return z-score (rolling)
 *   • realised volatility percentile (rolling)
 *   • price deviation from moving average (rolling z-score on residuals)
 *   • drawdown percentile (vs historical drawdown distribution)
 *   • forward-return percentile context (NOT a forward signal — historical positioning)
 *   • volume z-score (rolling)
 *
 * Strict-data policy: returns null when history is insufficient.
 */

import type { OHLCVBar } from '../../types';
import { closes, logReturns } from './returns';
import { rollingMean, rollingStdev, mean, stdev, percentileRank } from './primitives';
import { maxDrawdown } from './risk';

export type ExtremeMetric =
  | 'return_z'
  | 'volatility_pct'
  | 'trend_deviation_z'
  | 'drawdown_pct'
  | 'volume_z'
  | 'price_z';

export type ExtremeDirection = 'positive' | 'negative' | 'neutral';

export interface ExtremeReading {
  metric: ExtremeMetric;
  /** Latest raw value of the metric. */
  value: number;
  /** Standardised score ∈ ℝ. Sign communicates direction. */
  score: number;
  /** Percentile rank of the latest value within its own history (0..1). */
  percentileRank: number;
  /** Direction of extremity. */
  direction: ExtremeDirection;
  /** Magnitude of extremity, 0..1. Extreme tails (≥ |2σ| or |pct − 0.5| ≥ 0.45) → near 1. */
  magnitude: number;
  /** Human-readable phrase. */
  description: string;
}

export interface ExtremesSnapshot {
  ts: number;
  symbol: string;
  readings: ExtremeReading[];
  /** Composite extremity ∈ 0..1 — average magnitude across reported metrics. */
  composite: number;
}

const ROLL_WINDOW = 21;
const VOL_WINDOW = 21;
const TREND_WINDOW = 50;

function direction(score: number, threshold = 1): ExtremeDirection {
  if (score >= threshold) return 'positive';
  if (score <= -threshold) return 'negative';
  return 'neutral';
}

function magnitudeFromZ(score: number): number {
  // Saturates at |z| = 3.
  return Math.max(0, Math.min(1, Math.abs(score) / 3));
}

function magnitudeFromPct(p: number): number {
  // 0 or 1 are most extreme; 0.5 is normal.
  return Math.max(0, Math.min(1, Math.abs(p - 0.5) * 2));
}

function describePct(p: number, label: string, units: string): string {
  const pct = (p * 100).toFixed(0);
  return `${label} at the ${pct}th percentile${units ? ` (${units})` : ''}.`;
}

function describeZ(z: number, label: string): string {
  const dir = z >= 0 ? 'above' : 'below';
  return `${label} ${Math.abs(z).toFixed(2)}σ ${dir} rolling mean.`;
}

export function computeExtremesSnapshot(
  bars: OHLCVBar[],
  opts: { symbol?: string } = {},
): ExtremesSnapshot | null {
  if (bars.length < Math.max(ROLL_WINDOW, VOL_WINDOW, TREND_WINDOW) + 30) return null;

  const symbol = opts.symbol ?? 'series';
  const cl = closes(bars);
  const lr = logReturns(cl);
  const ts = bars[bars.length - 1].ts;
  const readings: ExtremeReading[] = [];

  // ─── return_z: rolling z-score of the latest log return ──────────────────
  {
    const recent = lr.slice(-(ROLL_WINDOW + 1));
    if (recent.length >= ROLL_WINDOW + 1) {
      const hist = recent.slice(0, ROLL_WINDOW);
      const v = recent[recent.length - 1];
      const m = mean(hist);
      const s = stdev(hist) || 1e-9;
      const z = (v - m) / s;
      const pr = percentileRank(hist, v);
      readings.push({
        metric: 'return_z',
        value: v,
        score: z,
        percentileRank: pr,
        direction: direction(z),
        magnitude: magnitudeFromZ(z),
        description: describeZ(z, 'Latest 1-bar return'),
      });
    }
  }

  // ─── volatility_pct: realised vol percentile vs full rolling history ─────
  {
    const rolling = rollingStdev(lr, VOL_WINDOW);
    if (rolling.length >= 30) {
      const v = rolling[rolling.length - 1];
      const pr = percentileRank(rolling, v);
      readings.push({
        metric: 'volatility_pct',
        value: v,
        score: (pr - 0.5) * 2,
        percentileRank: pr,
        direction: pr >= 0.8 ? 'positive' : pr <= 0.2 ? 'negative' : 'neutral',
        magnitude: magnitudeFromPct(pr),
        description: describePct(pr, `${VOL_WINDOW}-bar realised vol`, 'rolling history'),
      });
    }
  }

  // ─── trend_deviation_z: z-score of (close − SMA50) ───────────────────────
  {
    const sma = rollingMean(cl, TREND_WINDOW);
    if (sma.length >= 30) {
      const aligned = cl.slice(cl.length - sma.length);
      const dev = aligned.map((c, i) => c - sma[i]);
      const m = mean(dev);
      const s = stdev(dev) || 1e-9;
      const v = dev[dev.length - 1];
      const z = (v - m) / s;
      const pr = percentileRank(dev, v);
      readings.push({
        metric: 'trend_deviation_z',
        value: v,
        score: z,
        percentileRank: pr,
        direction: direction(z),
        magnitude: magnitudeFromZ(z),
        description: describeZ(z, `Close vs SMA${TREND_WINDOW}`),
      });
    }
  }

  // ─── drawdown_pct: current running drawdown vs historical drawdown distrib
  {
    // running drawdown series from price
    const dd: number[] = [];
    let peak = -Infinity;
    for (const c of cl) {
      if (c > peak) peak = c;
      dd.push(peak > 0 ? c / peak - 1 : 0);
    }
    if (dd.length >= 60) {
      const v = dd[dd.length - 1];          // ≤ 0
      const pr = percentileRank(dd, v);     // smaller = deeper drawdown
      // Severity is high near the bottom of the distribution.
      const severity = 1 - pr;
      readings.push({
        metric: 'drawdown_pct',
        value: v,
        score: -severity * 3,               // negative side, magnitude 0..3
        percentileRank: pr,
        direction: severity > 0.6 ? 'negative' : 'neutral',
        magnitude: magnitudeFromPct(pr),
        description: `Current drawdown ${(v * 100).toFixed(1)}% — historically severe ${(severity * 100).toFixed(0)}% of the time.`,
      });
    }
  }

  // ─── volume_z: z-score of latest volume vs rolling 21-bar baseline ───────
  {
    const vols = bars.map(b => b.volume).filter(v => v >= 0);
    if (vols.length >= ROLL_WINDOW + 1) {
      const hist = vols.slice(-ROLL_WINDOW - 1, -1);
      const v = vols[vols.length - 1];
      const m = mean(hist) || 1e-9;
      const s = stdev(hist) || 1e-9;
      const z = (v - m) / s;
      const pr = percentileRank(hist, v);
      readings.push({
        metric: 'volume_z',
        value: v,
        score: z,
        percentileRank: pr,
        direction: direction(z, 1.5),
        magnitude: magnitudeFromZ(z),
        description: describeZ(z, 'Latest volume'),
      });
    }
  }

  // ─── price_z: rolling z-score of close on its own history ────────────────
  {
    const tail = cl.slice(-ROLL_WINDOW * 3);
    if (tail.length >= ROLL_WINDOW) {
      const m = mean(tail);
      const s = stdev(tail) || 1e-9;
      const v = tail[tail.length - 1];
      const z = (v - m) / s;
      const pr = percentileRank(tail, v);
      readings.push({
        metric: 'price_z',
        value: v,
        score: z,
        percentileRank: pr,
        direction: direction(z),
        magnitude: magnitudeFromZ(z),
        description: describeZ(z, `Close vs ${tail.length}-bar window`),
      });
    }
  }

  if (!readings.length) return null;

  const composite = mean(readings.map(r => r.magnitude));
  // Symbolic reference to keep tree-shaking aware that maxDrawdown is part of the
  // intended risk surface for future tab body (Wave D).
  void maxDrawdown;

  return { ts, symbol, readings, composite };
}

/** Return the historical bar indices where a metric crossed an absolute
 *  z-score or percentile-tail threshold. Used by the forward-return engine
 *  to evaluate "what happened after similar extremes". */
export function extremeConditionIndices(
  bars: OHLCVBar[],
  metric: ExtremeMetric,
  threshold: number,
): number[] {
  if (bars.length < ROLL_WINDOW + 5) return [];
  const cl = closes(bars);
  const lr = logReturns(cl);

  const out: number[] = [];
  switch (metric) {
    case 'return_z': {
      // Trigger at index i when (lr[i] − mean(lr[i-W..i])) / std exceeds threshold.
      for (let i = ROLL_WINDOW; i < lr.length; i++) {
        const win = lr.slice(i - ROLL_WINDOW, i);
        const m = mean(win); const s = stdev(win) || 1e-9;
        const z = (lr[i] - m) / s;
        if (Math.abs(z) >= threshold) out.push(i + 1); // +1: bars index is one ahead of returns
      }
      return out;
    }
    case 'volatility_pct': {
      const rolling = rollingStdev(lr, VOL_WINDOW);
      // rolling[k] corresponds to lr index (k + VOL_WINDOW - 1) ⇒ bars index (k + VOL_WINDOW)
      for (let k = 30; k < rolling.length; k++) {
        const hist = rolling.slice(0, k);
        const pr = percentileRank(hist, rolling[k]);
        if (pr >= threshold || pr <= 1 - threshold) out.push(k + VOL_WINDOW);
      }
      return out;
    }
    case 'trend_deviation_z': {
      const sma = rollingMean(cl, TREND_WINDOW);
      const aligned = cl.slice(cl.length - sma.length);
      const dev = aligned.map((c, i) => c - sma[i]);
      // dev[k] aligns with bars index (k + TREND_WINDOW - 1)
      for (let k = ROLL_WINDOW; k < dev.length; k++) {
        const hist = dev.slice(0, k);
        const m = mean(hist); const s = stdev(hist) || 1e-9;
        const z = (dev[k] - m) / s;
        if (Math.abs(z) >= threshold) out.push(k + TREND_WINDOW - 1);
      }
      return out;
    }
    case 'drawdown_pct': {
      const dd: number[] = [];
      let peak = -Infinity;
      for (const c of cl) {
        if (c > peak) peak = c;
        dd.push(peak > 0 ? c / peak - 1 : 0);
      }
      for (let i = 60; i < dd.length; i++) {
        const hist = dd.slice(0, i);
        const pr = percentileRank(hist, dd[i]);
        if (pr <= 1 - threshold) out.push(i);
      }
      return out;
    }
    case 'volume_z': {
      const vols = bars.map(b => b.volume);
      for (let i = ROLL_WINDOW; i < vols.length; i++) {
        const win = vols.slice(i - ROLL_WINDOW, i);
        const m = mean(win) || 1e-9;
        const s = stdev(win) || 1e-9;
        const z = (vols[i] - m) / s;
        if (Math.abs(z) >= threshold) out.push(i);
      }
      return out;
    }
    case 'price_z': {
      for (let i = ROLL_WINDOW; i < cl.length; i++) {
        const win = cl.slice(i - ROLL_WINDOW, i);
        const m = mean(win); const s = stdev(win) || 1e-9;
        const z = (cl[i] - m) / s;
        if (Math.abs(z) >= threshold) out.push(i);
      }
      return out;
    }
  }
}
