/**
 * Historical context layer (Wave F).
 *
 * Adapts the existing `quant/analog` engine into the drawer's
 * `HistoricalPayload`: top analog episodes + a percentile-rank line for the
 * current move vs the trailing window. Strict-real-data: returns null when
 * the bar history is insufficient, never fabricates analog episodes.
 */
import type { OHLCVBar } from '../../types';
import { findHistoricalAnalogs } from '../quant/analog';
import type { HistoricalPayload, HistoricalAnalog } from '../../components/intelligence-drawer';

export interface BuildHistoricalOptions {
  /** Window length in bars for the analog engine. Default 60. */
  window?: number;
  /** Top-K analog matches to surface. Default 3. */
  topK?: number;
  /** Lookback for percentile rank of the latest day return. Default 252. */
  percentileLookback?: number;
}

export function buildHistoricalPayload(
  bars: OHLCVBar[] | null | undefined,
  options: BuildHistoricalOptions = {},
): HistoricalPayload | null {
  if (!bars || bars.length < 30) return null;

  const window = options.window ?? 60;
  const topK = options.topK ?? 3;
  const lookback = options.percentileLookback ?? 252;

  const matches = findHistoricalAnalogs(bars, { window, topK });

  // Percentile rank of the latest single-day return within a lookback window.
  // Useful as the "is today extreme?" gauge in the drawer.
  let percentile: number | undefined;
  let percentileLabel: string | undefined;
  if (bars.length >= 5) {
    const cl = bars.map((b) => b.close);
    const lastRet = (cl[cl.length - 1] - cl[cl.length - 2]) / cl[cl.length - 2];
    const slice = cl.slice(-Math.min(lookback, cl.length));
    const returns: number[] = [];
    for (let i = 1; i < slice.length; i++) {
      returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
    }
    if (returns.length > 0) {
      const rank = returns.filter((r) => r <= lastRet).length / returns.length;
      percentile = rank;
      const direction = lastRet >= 0 ? 'gain' : 'decline';
      percentileLabel = `Today's ${direction} vs ${returns.length}-day history`;
    }
  }

  const analogs: HistoricalAnalog[] = matches.map((m) => ({
    label: m.label,
    windowLabel: `${formatDate(m.windowStart)} → ${formatDate(m.windowEnd)}`,
    similarity: m.similarity,
    note: describeFingerprint(m.fingerprint),
  }));

  if (analogs.length === 0 && percentile == null) return null;

  return {
    percentile,
    percentileLabel,
    analogs,
    note: analogs.length === 0
      ? 'Limited history for analog matching.'
      : undefined,
  };
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function describeFingerprint(fp: { realisedVol: number; trendSlope: number; meanReturn: number }): string {
  const vol = (fp.realisedVol * 100).toFixed(0);
  const trend = fp.trendSlope > 0.0008 ? 'uptrending'
    : fp.trendSlope < -0.0008 ? 'downtrending'
    : 'range-bound';
  const meanDir = fp.meanReturn > 0 ? 'positive' : 'negative';
  return `Realised vol ~${vol}% · ${trend} · ${meanDir} drift`;
}
