/**
 * Scenario engine.
 *
 * Compose a small number of structural conditions (e.g. "volatility percentile
 * below 10%", "price above SMA50", "drawdown shallower than 5%") and walk the
 * bar history to find every index where the combined condition was true. Then
 * the forward-return engine projects what historically followed.
 *
 * The engine knows about a small vocabulary of metric-derived series and
 * comparators; it intentionally does not accept arbitrary callbacks so the
 * UI can render and persist scenario specs as plain JSON.
 *
 * Strict-data policy: when no historical match exists, returns an empty
 * match index list. UI surfaces this transparently.
 */

import type { OHLCVBar } from '../../types';
import { closes, logReturns } from './returns';
import { rollingMean, rollingStdev, mean, stdev, percentileRank } from './primitives';

export type ScenarioComparator = 'gt' | 'lt' | 'gte' | 'lte';

export type ScenarioMetric =
  | 'volatility_percentile'      // 21-bar realised vol percentile in rolling history
  | 'price_vs_sma50'             // close / SMA50 - 1
  | 'price_vs_sma200'            // close / SMA200 - 1
  | 'drawdown'                   // running drawdown from running peak
  | 'return_z'                   // 5-bar mean return z-score
  | 'trend_deviation_z'          // (close − SMA50) z-score on residuals
  | 'volume_z';                  // 21-bar volume z-score

export interface ScenarioCondition {
  metric: ScenarioMetric;
  comparator: ScenarioComparator;
  /** Threshold the metric is compared against. Units depend on the metric. */
  value: number;
  /** Optional label that the UI / artifact narrative will use. */
  label?: string;
}

export interface ScenarioMatchResult {
  /** Indices into the bar series where the joint condition was satisfied. */
  indices: number[];
  /** Per-condition coverage diagnostics (fraction of bars where the metric was defined). */
  coverage: Record<ScenarioMetric, number>;
}

const ROLL = 21;
const VOL_WIN = 21;

/** Build the per-bar metric series. Index i in the returned arrays
 *  corresponds to bars[i] — values may be NaN when the metric is undefined
 *  (e.g. SMA200 before bar 200). NaN values fail any comparator. */
function buildMetricSeries(bars: OHLCVBar[]): Record<ScenarioMetric, number[]> {
  const cl = closes(bars);
  const lr = logReturns(cl);
  const sma50 = rollingMean(cl, 50);
  const sma200 = rollingMean(cl, 200);
  const rollVol = rollingStdev(lr, VOL_WIN);

  const out: Record<ScenarioMetric, number[]> = {
    volatility_percentile: new Array(bars.length).fill(NaN),
    price_vs_sma50:        new Array(bars.length).fill(NaN),
    price_vs_sma200:       new Array(bars.length).fill(NaN),
    drawdown:              new Array(bars.length).fill(NaN),
    return_z:              new Array(bars.length).fill(NaN),
    trend_deviation_z:     new Array(bars.length).fill(NaN),
    volume_z:              new Array(bars.length).fill(NaN),
  };

  // Drawdown
  let peak = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    if (cl[i] > peak) peak = cl[i];
    out.drawdown[i] = peak > 0 ? cl[i] / peak - 1 : 0;
  }

  // SMA-derived series. rollingMean of window W has output length n - W + 1
  // and slot k corresponds to bars index (k + W - 1).
  for (let k = 0; k < sma50.length; k++) {
    const i = k + 50 - 1;
    if (sma50[k] > 0) out.price_vs_sma50[i] = cl[i] / sma50[k] - 1;
  }
  for (let k = 0; k < sma200.length; k++) {
    const i = k + 200 - 1;
    if (sma200[k] > 0) out.price_vs_sma200[i] = cl[i] / sma200[k] - 1;
  }

  // Volatility percentile — for index i (bars), pr = percentileRank of
  // rolling vol at i against rolling vol values up to and including i.
  // rollingStdev returns length lr.length - VOL_WIN + 1; slot k aligns to
  // returns index (k + VOL_WIN - 1) which is bars index (k + VOL_WIN).
  for (let k = VOL_WIN; k < rollVol.length; k++) {
    const i = k + VOL_WIN;
    if (i >= bars.length) break;
    const hist = rollVol.slice(0, k);
    out.volatility_percentile[i] = percentileRank(hist, rollVol[k]);
  }

  // Return z-score (5-bar mean vs rolling history)
  const rollingMeans5 = rollingMean(lr, 5);
  for (let k = ROLL; k < rollingMeans5.length; k++) {
    const i = k + 5;
    if (i >= bars.length) break;
    const hist = rollingMeans5.slice(0, k);
    const m = mean(hist), s = stdev(hist) || 1e-9;
    out.return_z[i] = (rollingMeans5[k] - m) / s;
  }

  // Trend deviation z
  if (sma50.length >= 30) {
    const alignedStart = 50 - 1;
    const dev: number[] = new Array(bars.length).fill(NaN);
    for (let k = 0; k < sma50.length; k++) {
      const i = k + alignedStart;
      dev[i] = cl[i] - sma50[k];
    }
    // Need expanding-window z-score (no lookahead).
    let runMean = 0; let runVar = 0; let n = 0;
    for (let i = 0; i < bars.length; i++) {
      const v = dev[i];
      if (!Number.isFinite(v)) continue;
      n += 1;
      const prevMean = runMean;
      runMean += (v - runMean) / n;
      runVar  += (v - prevMean) * (v - runMean);
      if (n >= 30) {
        const sd = Math.sqrt(runVar / Math.max(1, n - 1)) || 1e-9;
        out.trend_deviation_z[i] = (v - runMean) / sd;
      }
    }
  }

  // Volume z-score (21-bar rolling)
  const vols = bars.map(b => b.volume);
  for (let i = ROLL; i < bars.length; i++) {
    const win = vols.slice(i - ROLL, i);
    const m = mean(win) || 1e-9, s = stdev(win) || 1e-9;
    out.volume_z[i] = (vols[i] - m) / s;
  }

  return out;
}

function compare(a: number, cmp: ScenarioComparator, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  switch (cmp) {
    case 'gt':  return a >  b;
    case 'gte': return a >= b;
    case 'lt':  return a <  b;
    case 'lte': return a <= b;
  }
}

/** Evaluate a scenario over a bar series and return matching indices.
 *  Conditions are AND-combined. */
export function findScenarioMatches(
  bars: OHLCVBar[],
  conditions: ScenarioCondition[],
): ScenarioMatchResult {
  const empty: ScenarioMatchResult = {
    indices: [],
    coverage: {
      volatility_percentile: 0, price_vs_sma50: 0, price_vs_sma200: 0,
      drawdown: 0, return_z: 0, trend_deviation_z: 0, volume_z: 0,
    },
  };
  if (!bars.length || !conditions.length) return empty;

  const series = buildMetricSeries(bars);
  const indices: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    let ok = true;
    for (const c of conditions) {
      const v = series[c.metric][i];
      if (!compare(v, c.comparator, c.value)) { ok = false; break; }
    }
    if (ok) indices.push(i);
  }

  const coverage: Record<ScenarioMetric, number> = {
    volatility_percentile: 0, price_vs_sma50: 0, price_vs_sma200: 0,
    drawdown: 0, return_z: 0, trend_deviation_z: 0, volume_z: 0,
  };
  (Object.keys(series) as ScenarioMetric[]).forEach((m) => {
    const arr = series[m];
    let defined = 0;
    for (const v of arr) if (Number.isFinite(v)) defined++;
    coverage[m] = arr.length ? defined / arr.length : 0;
  });

  return { indices, coverage };
}

/** Render a condition into a human-readable phrase. */
export function describeCondition(c: ScenarioCondition): string {
  if (c.label) return c.label;
  const cmp = c.comparator === 'gt' ? '>'
            : c.comparator === 'gte' ? '≥'
            : c.comparator === 'lt' ? '<' : '≤';
  switch (c.metric) {
    case 'volatility_percentile':
      return `21-bar realised vol percentile ${cmp} ${(c.value * 100).toFixed(0)}%`;
    case 'price_vs_sma50':
      return `price vs SMA50 ${cmp} ${(c.value * 100).toFixed(1)}%`;
    case 'price_vs_sma200':
      return `price vs SMA200 ${cmp} ${(c.value * 100).toFixed(1)}%`;
    case 'drawdown':
      return `drawdown ${cmp} ${(c.value * 100).toFixed(1)}%`;
    case 'return_z':
      return `5-bar return z-score ${cmp} ${c.value.toFixed(2)}`;
    case 'trend_deviation_z':
      return `trend deviation z-score ${cmp} ${c.value.toFixed(2)}`;
    case 'volume_z':
      return `21-bar volume z-score ${cmp} ${c.value.toFixed(2)}`;
  }
}
