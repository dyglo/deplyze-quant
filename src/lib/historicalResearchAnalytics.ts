/**
 * historicalResearchAnalytics — pure, dependency-light analytics computed
 * over the asset series the hook has already retrieved.
 *
 * Every function here takes deterministic inputs and produces deterministic
 * outputs. The hook calls `computeRichAnalytics` once after retrieval and
 * stores the result on the investigation; the widgets render from it.
 *
 * Math is written inline (mean, std, skew, kurtosis, drawdown, etc.) rather
 * than reaching into `lib/quant/` because the quant package mixes simple vs
 * log return conventions across helpers — easier to be explicit here.
 */

import type { OHLCVBar } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PerformanceRow {
  symbol: string;
  totalReturn: number;        // end/start − 1
  cagr: number;               // annualised geometric
  annVol: number;             // stdev(daily returns) × √252
  sharpe: number;             // (mean return × 252) / annVol
  sortino: number;            // (mean return × 252) / (downside std × √252)
  maxDrawdown: number;        // negative number
  calmar: number;             // cagr / |maxDD|
  skew: number;
  kurtosis: number;           // excess kurtosis
  startTs: number;
  endTs: number;
  startClose: number;
  endClose: number;
  bars: number;
}

export interface DrawdownPoint { ts: number; dd: number }
export interface DrawdownSeries {
  symbol: string;
  series: DrawdownPoint[];
  deepest: {
    dd: number;
    peakTs: number;
    troughTs: number;
    recoveredTs: number | null;
    durationDays: number;
    drawdownDays: number;     // peak → trough
  };
  current: number;            // current drawdown from running peak (negative or 0)
}

export interface AnnualReturnsRow {
  year: number;
  perAsset: Record<string, number | null>;
}

export interface DistributionBucket { low: number; high: number; mid: number; count: number }
export interface ReturnDistribution {
  symbol: string;
  mean: number;
  std: number;
  skew: number;
  kurtosis: number;
  min: number;
  max: number;
  buckets: DistributionBucket[];
  total: number;
}

export interface RollingVolPoint { ts: number; vol: number }
export interface RollingVolSeries { symbol: string; series: RollingVolPoint[] }

export interface CorrelationMatrixResult {
  symbols: string[];
  matrix: number[][];
  asOf: number;
  sampleSize: number;
}

export interface RichAnalytics {
  performance: PerformanceRow[];
  drawdowns: DrawdownSeries[];
  annualReturns: AnnualReturnsRow[];
  distributions: ReturnDistribution[];
  rollingVols: RollingVolSeries[];
  corrMatrix: CorrelationMatrixResult | null;
}

// ─── Regime metrics ───────────────────────────────────────────────────────

export interface RegimeSpec {
  label: string;
  start: string;        // YYYY-MM-DD
  end: string;          // YYYY-MM-DD
  hypothesis?: string;
}

export interface RegimeAssetMetric {
  symbol: string;
  totalReturn: number;        // null when too few bars
  cagr: number;
  annVol: number;
  sharpe: number;
  maxDrawdown: number;
  bars: number;
}

export interface RegimeMetrics {
  spec: RegimeSpec;
  startTs: number;
  endTs: number;
  bars: number;
  perAsset: RegimeAssetMetric[];
  pairwiseCorrelations: { a: string; b: string; r: number }[];   // daily-return Pearson
  /** True when the regime window had insufficient overlap with available data. */
  insufficient: boolean;
}

export function computeRegimeMetrics(
  series: { symbol: string; bars: OHLCVBar[] }[],
  regimes: RegimeSpec[],
): RegimeMetrics[] {
  if (!regimes.length || !series.length) return [];
  return regimes.map((spec) => computeOneRegime(series, spec));
}

function computeOneRegime(
  series: { symbol: string; bars: OHLCVBar[] }[],
  spec: RegimeSpec,
): RegimeMetrics {
  const startTs = Date.parse(spec.start + 'T00:00:00Z');
  const endTs   = Date.parse(spec.end   + 'T23:59:59Z');

  const slices = series.map((s) => ({
    symbol: s.symbol,
    bars: s.bars.filter((b) => b.ts >= startTs && b.ts <= endTs),
  }));

  const perAsset: RegimeAssetMetric[] = slices.map((s) => {
    if (s.bars.length < 5) {
      return {
        symbol: s.symbol, totalReturn: 0, cagr: 0, annVol: 0, sharpe: 0,
        maxDrawdown: 0, bars: s.bars.length,
      };
    }
    const closes = s.bars.map((b) => b.close);
    const returns = simpleReturns(closes);
    const total = closes[closes.length - 1] / closes[0] - 1;
    const years = s.bars.length / PERIODS_PER_YEAR;
    const cagr = years > 0 ? Math.pow(1 + total, 1 / years) - 1 : 0;
    const annVol = stddev(returns) * Math.sqrt(PERIODS_PER_YEAR);
    const annMean = mean(returns) * PERIODS_PER_YEAR;
    const sharpe = annVol > 0 ? annMean / annVol : 0;
    let peak = -Infinity, mdd = 0;
    for (const c of closes) {
      if (c > peak) peak = c;
      const dd = peak > 0 ? c / peak - 1 : 0;
      if (dd < mdd) mdd = dd;
    }
    return {
      symbol: s.symbol,
      totalReturn: total, cagr, annVol, sharpe,
      maxDrawdown: mdd, bars: s.bars.length,
    };
  });

  // Pairwise correlations (daily returns, aligned on common ts).
  const pairs: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < slices.length; i++) {
    for (let j = i + 1; j < slices.length; j++) {
      const a = slices[i], b = slices[j];
      if (a.bars.length < 5 || b.bars.length < 5) continue;
      const tsB = new Set(b.bars.map((x) => x.ts));
      const aligned = a.bars.filter((x) => tsB.has(x.ts));
      const bMap = new Map(b.bars.map((x) => [x.ts, x.close]));
      const bAligned = aligned.map((x) => bMap.get(x.ts) as number);
      const retA = simpleReturns(aligned.map((x) => x.close));
      const retB = simpleReturns(bAligned);
      if (retA.length < 5) continue;
      pairs.push({ a: a.symbol, b: b.symbol, r: pearson(retA, retB) });
    }
  }

  const totalBars = slices.reduce((s, x) => s + x.bars.length, 0);
  const insufficient = totalBars === 0 || slices.every((s) => s.bars.length < 5);

  return {
    spec,
    startTs, endTs,
    bars: totalBars,
    perAsset, pairwiseCorrelations: pairs,
    insufficient,
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────

const ROLL_VOL_WINDOW = 60;
const DIST_BUCKETS = 30;
const PERIODS_PER_YEAR = 252;

export function computeRichAnalytics(
  series: { symbol: string; bars: OHLCVBar[] }[],
): RichAnalytics {
  const performance = series.map((s) => computePerformanceRow(s.symbol, s.bars));
  const drawdowns   = series.map((s) => computeDrawdown(s.symbol, s.bars));
  const annualReturns = computeAnnualReturns(series);
  const distributions = series.map((s) => computeDistribution(s.symbol, s.bars));
  const rollingVols   = series.map((s) => computeRollingVol(s.symbol, s.bars));
  const corrMatrix    = series.length >= 3 ? computeCorrelationMatrix(series) : null;
  return { performance, drawdowns, annualReturns, distributions, rollingVols, corrMatrix };
}

// ─── Performance row ──────────────────────────────────────────────────────

function computePerformanceRow(symbol: string, bars: OHLCVBar[]): PerformanceRow {
  if (bars.length < 2) return emptyPerf(symbol, bars);
  const closes = bars.map((b) => b.close);
  const returns = simpleReturns(closes);

  const startClose = closes[0];
  const endClose = closes[closes.length - 1];
  const totalReturn = endClose / startClose - 1;
  const years = bars.length / PERIODS_PER_YEAR;
  const cagr = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;

  const meanR = mean(returns);
  const stdR = stddev(returns);
  const annVol = stdR * Math.sqrt(PERIODS_PER_YEAR);
  const annMean = meanR * PERIODS_PER_YEAR;
  const sharpe = annVol > 0 ? annMean / annVol : 0;

  const dnReturns = returns.filter((r) => r < 0);
  const dnStd = stddev(dnReturns) * Math.sqrt(PERIODS_PER_YEAR);
  const sortino = dnStd > 0 ? annMean / dnStd : 0;

  // Max drawdown
  let peak = -Infinity;
  let mdd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = c / peak - 1;
      if (dd < mdd) mdd = dd;
    }
  }
  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;

  return {
    symbol,
    totalReturn, cagr, annVol, sharpe, sortino,
    maxDrawdown: mdd, calmar,
    skew: skewness(returns),
    kurtosis: excessKurtosis(returns),
    startTs: bars[0].ts,
    endTs: bars[bars.length - 1].ts,
    startClose, endClose,
    bars: bars.length,
  };
}

function emptyPerf(symbol: string, bars: OHLCVBar[]): PerformanceRow {
  return {
    symbol,
    totalReturn: 0, cagr: 0, annVol: 0, sharpe: 0, sortino: 0,
    maxDrawdown: 0, calmar: 0, skew: 0, kurtosis: 0,
    startTs: bars[0]?.ts ?? 0, endTs: bars[bars.length - 1]?.ts ?? 0,
    startClose: bars[0]?.close ?? 0, endClose: bars[bars.length - 1]?.close ?? 0,
    bars: bars.length,
  };
}

// ─── Drawdown series ──────────────────────────────────────────────────────

function computeDrawdown(symbol: string, bars: OHLCVBar[]): DrawdownSeries {
  const series: DrawdownPoint[] = [];
  let peak = -Infinity;
  let peakIdx = 0;
  let troughIdx = 0;
  let deepest = 0;
  let deepestPeakIdx = 0;

  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].close;
    if (c > peak) { peak = c; peakIdx = i; }
    const dd = peak > 0 ? c / peak - 1 : 0;
    series.push({ ts: bars[i].ts, dd });
    if (dd < deepest) {
      deepest = dd;
      troughIdx = i;
      deepestPeakIdx = peakIdx;
    }
  }

  // Recovery: first index after trough where close >= deepest peak's close
  let recoveredTs: number | null = null;
  if (bars.length > troughIdx + 1) {
    const peakClose = bars[deepestPeakIdx].close;
    for (let i = troughIdx + 1; i < bars.length; i++) {
      if (bars[i].close >= peakClose) { recoveredTs = bars[i].ts; break; }
    }
  }

  const peakTs = bars[deepestPeakIdx]?.ts ?? 0;
  const troughTs = bars[troughIdx]?.ts ?? 0;
  const durationDays = recoveredTs
    ? Math.round((recoveredTs - peakTs) / 86400_000)
    : Math.round((bars[bars.length - 1].ts - peakTs) / 86400_000);
  const drawdownDays = Math.round((troughTs - peakTs) / 86400_000);

  return {
    symbol,
    series,
    deepest: { dd: deepest, peakTs, troughTs, recoveredTs, durationDays, drawdownDays },
    current: series.length ? series[series.length - 1].dd : 0,
  };
}

// ─── Annual returns ───────────────────────────────────────────────────────

function computeAnnualReturns(series: { symbol: string; bars: OHLCVBar[] }[]): AnnualReturnsRow[] {
  // Map (year → symbol → return), then convert.
  const grid = new Map<number, Map<string, number>>();
  for (const { symbol, bars } of series) {
    const byYear = bucketByYear(bars);
    for (const [year, yearBars] of byYear) {
      if (yearBars.length < 2) continue;
      const ret = yearBars[yearBars.length - 1].close / yearBars[0].close - 1;
      let row = grid.get(year);
      if (!row) { row = new Map(); grid.set(year, row); }
      row.set(symbol, ret);
    }
  }
  const symbols = series.map((s) => s.symbol);
  const years = Array.from(grid.keys()).sort((a, b) => a - b);
  return years.map((year) => {
    const row = grid.get(year)!;
    const perAsset: Record<string, number | null> = {};
    for (const s of symbols) perAsset[s] = row.has(s) ? row.get(s)! : null;
    return { year, perAsset };
  });
}

function bucketByYear(bars: OHLCVBar[]): Map<number, OHLCVBar[]> {
  const out = new Map<number, OHLCVBar[]>();
  for (const b of bars) {
    const y = new Date(b.ts).getUTCFullYear();
    let row = out.get(y);
    if (!row) { row = []; out.set(y, row); }
    row.push(b);
  }
  return out;
}

// ─── Distribution ─────────────────────────────────────────────────────────

function computeDistribution(symbol: string, bars: OHLCVBar[]): ReturnDistribution {
  const closes = bars.map((b) => b.close);
  const returns = simpleReturns(closes);
  if (returns.length === 0) {
    return { symbol, mean: 0, std: 0, skew: 0, kurtosis: 0, min: 0, max: 0, buckets: [], total: 0 };
  }
  const m = mean(returns);
  const s = stddev(returns);
  const lo = Math.min(...returns);
  const hi = Math.max(...returns);
  if (hi === lo) {
    return { symbol, mean: m, std: s, skew: 0, kurtosis: 0, min: lo, max: hi, buckets: [], total: returns.length };
  }
  const width = (hi - lo) / DIST_BUCKETS;
  const buckets: DistributionBucket[] = Array.from({ length: DIST_BUCKETS }, (_, i) => ({
    low:  lo + i * width,
    high: lo + (i + 1) * width,
    mid:  lo + (i + 0.5) * width,
    count: 0,
  }));
  for (const r of returns) {
    const idx = Math.min(DIST_BUCKETS - 1, Math.max(0, Math.floor((r - lo) / width)));
    buckets[idx].count++;
  }
  return {
    symbol,
    mean: m,
    std: s,
    skew: skewness(returns),
    kurtosis: excessKurtosis(returns),
    min: lo, max: hi,
    buckets,
    total: returns.length,
  };
}

// ─── Rolling volatility ───────────────────────────────────────────────────

function computeRollingVol(symbol: string, bars: OHLCVBar[]): RollingVolSeries {
  const closes = bars.map((b) => b.close);
  const returns = simpleReturns(closes);
  if (returns.length < ROLL_VOL_WINDOW + 1) return { symbol, series: [] };
  const series: RollingVolPoint[] = [];
  for (let i = ROLL_VOL_WINDOW; i <= returns.length; i++) {
    const window = returns.slice(i - ROLL_VOL_WINDOW, i);
    const sd = stddev(window);
    series.push({
      ts: bars[i].ts ?? bars[bars.length - 1].ts,
      vol: sd * Math.sqrt(PERIODS_PER_YEAR),
    });
  }
  return { symbol, series };
}

// ─── Correlation matrix ───────────────────────────────────────────────────

function computeCorrelationMatrix(series: { symbol: string; bars: OHLCVBar[] }[]): CorrelationMatrixResult {
  // Build a common timestamp index: intersection of bar timestamps across all assets.
  const tsSets = series.map((s) => new Set(s.bars.map((b) => b.ts)));
  // Use the smallest set as candidate; filter against the rest.
  const smallest = tsSets.reduce((a, b) => (a.size <= b.size ? a : b), tsSets[0]);
  const commonTs: number[] = [];
  for (const ts of smallest) {
    if (tsSets.every((s) => s.has(ts))) commonTs.push(ts);
  }
  commonTs.sort((a, b) => a - b);

  // For each asset, build close series aligned to commonTs.
  const closesByAsset = series.map((s) => {
    const map = new Map(s.bars.map((b) => [b.ts, b.close]));
    return commonTs.map((ts) => map.get(ts) as number);
  });
  const returnsByAsset = closesByAsset.map(simpleReturns);

  const symbols = series.map((s) => s.symbol);
  const n = symbols.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const r = i === j ? 1 : pearson(returnsByAsset[i], returnsByAsset[j]);
      matrix[i][j] = r;
      matrix[j][i] = r;
    }
  }
  return {
    symbols,
    matrix,
    asOf: commonTs[commonTs.length - 1] ?? Date.now(),
    sampleSize: returnsByAsset[0]?.length ?? 0,
  };
}

// ─── Math primitives ──────────────────────────────────────────────────────

function simpleReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    out.push(prev > 0 ? values[i] / prev - 1 : 0);
  }
  return out;
}

function mean(x: number[]): number {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0;
}

function stddev(x: number[]): number {
  if (x.length < 2) return 0;
  const m = mean(x);
  const variance = x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1);
  return Math.sqrt(variance);
}

function skewness(x: number[]): number {
  if (x.length < 3) return 0;
  const m = mean(x);
  const s = stddev(x);
  if (s === 0) return 0;
  const n = x.length;
  let sum = 0;
  for (const v of x) sum += ((v - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * sum;
}

function excessKurtosis(x: number[]): number {
  if (x.length < 4) return 0;
  const m = mean(x);
  const s = stddev(x);
  if (s === 0) return 0;
  const n = x.length;
  let sum = 0;
  for (const v of x) sum += ((v - m) / s) ** 4;
  const num = n * (n + 1) * sum;
  const denom = (n - 1) * (n - 2) * (n - 3);
  const correction = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return num / denom - correction;
}

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 0 ? num / denom : 0;
}
