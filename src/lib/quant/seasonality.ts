/**
 * Calendar-based seasonality on bar series.
 *
 * All functions work in UTC to keep results stable across the user's timezone
 * — institutional research wants reproducibility over local convenience.
 *
 * Sample sizes are reported on every output. Callers should suppress signals
 * when n < ~12 for monthly or n < ~30 for weekday buckets to avoid spurious
 * "January is +3.2%!" from two observations.
 */

import type { OHLCVBar } from '../../types';
import { mean, stdev } from './primitives';

export interface SeasonalBucket {
  key: string;            // 'Jan' | 'Mon' | etc.
  n: number;
  meanReturn: number;     // average simple return in this bucket
  stdReturn: number;
  hitRate: number;        // fraction of bucket observations with positive return
}

function bucketStats(values: number[]): { meanReturn: number; stdReturn: number; hitRate: number } {
  if (!values.length) return { meanReturn: 0, stdReturn: 0, hitRate: 0 };
  const pos = values.filter(v => v > 0).length;
  return { meanReturn: mean(values), stdReturn: stdev(values), hitRate: pos / values.length };
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/** Monthly seasonality. Returns one bucket per calendar month. */
export function monthlySeasonality(bars: OHLCVBar[]): SeasonalBucket[] {
  if (bars.length < 2) return [];
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (a > 0 && b > 0) {
      const month = new Date(bars[i].ts).getUTCMonth();
      buckets[month].push(b / a - 1);
    }
  }
  return buckets.map((vals, i) => ({ key: MONTHS[i], n: vals.length, ...bucketStats(vals) }));
}

/** Day-of-week seasonality. Mon–Fri are the only buckets that typically matter. */
export function weekdaySeasonality(bars: OHLCVBar[]): SeasonalBucket[] {
  if (bars.length < 2) return [];
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (a > 0 && b > 0) {
      const dow = new Date(bars[i].ts).getUTCDay();
      buckets[dow].push(b / a - 1);
    }
  }
  return buckets.map((vals, i) => ({ key: DOW[i], n: vals.length, ...bucketStats(vals) }));
}

export interface SeasonalSignal {
  bucket: string;
  meanReturn: number;
  hitRate: number;
  n: number;
  significance: number;   // |meanReturn| / stdReturn  (t-stat proxy)
  direction: 'bullish' | 'bearish' | 'neutral';
}

/** Pick the buckets whose mean return is most extreme relative to its noise.
 *  Filters out buckets with n below `minObservations` to avoid small-sample noise. */
export function strongestSeasonalSignals(
  buckets: SeasonalBucket[],
  minObservations = 12,
  top = 3,
): SeasonalSignal[] {
  return buckets
    .filter(b => b.n >= minObservations && b.stdReturn > 0)
    .map<SeasonalSignal>(b => {
      const significance = Math.abs(b.meanReturn) / (b.stdReturn / Math.sqrt(b.n));
      let direction: SeasonalSignal['direction'];
      if (Math.abs(b.meanReturn) < 1e-5) direction = 'neutral';
      else direction = b.meanReturn > 0 ? 'bullish' : 'bearish';
      return {
        bucket: b.key,
        meanReturn: b.meanReturn,
        hitRate: b.hitRate,
        n: b.n,
        significance,
        direction,
      };
    })
    .sort((a, b) => b.significance - a.significance)
    .slice(0, top);
}
