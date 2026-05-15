/**
 * Historical analog engine.
 *
 * For a target window of bars, find historical windows whose quantitative
 * "fingerprint" most closely resembles the current state. Fingerprints are
 * fixed-length feature vectors derived from realised volatility, momentum,
 * trend, and (optionally) macro context.
 *
 * Similarity is cosine on the normalised feature vector. Non-overlap and
 * lookback gap are enforced so the current window is never "matched" to
 * itself or near-neighbours.
 *
 * Strict-data policy: returns an empty match list when history is shorter
 * than 2 × window — no padded or imaginary windows.
 */

import type { OHLCVBar } from '../../types';
import { closes, logReturns } from './returns';
import { mean, stdev } from './primitives';
import { trendSlope } from './momentum';
import { realisedVol } from './volatility';

export interface AnalogFingerprint {
  realisedVol: number;
  meanReturn: number;
  trendSlope: number;
  skewness: number;
  rangeCompression: number;   // (max − min) / mean(|close|)
  volOfVol: number;
}

export interface AnalogMatch {
  label: string;
  windowStart: number;        // unix ms
  windowEnd: number;
  similarity: number;         // 0..1
  fingerprint: AnalogFingerprint;
}

function fingerprintFromBars(bars: OHLCVBar[], ppy = 252): AnalogFingerprint | null {
  if (bars.length < 10) return null;
  const cl = closes(bars);
  const lr = logReturns(cl);
  if (lr.length < 5) return null;
  const m = mean(lr);
  const sLr = stdev(lr);
  const maxC = Math.max(...cl);
  const minC = Math.min(...cl);
  const meanAbs = mean(cl.map(Math.abs)) || 1;
  // vol-of-vol: stdev of trailing realised vol on a half-window
  const half = Math.max(5, Math.floor(lr.length / 4));
  const subVols: number[] = [];
  for (let i = half; i <= lr.length; i++) {
    subVols.push(stdev(lr.slice(i - half, i)));
  }
  return {
    realisedVol: sLr * Math.sqrt(ppy),
    meanReturn: m,
    trendSlope: trendSlope(cl),
    skewness: skewProxy(lr),
    rangeCompression: (maxC - minC) / meanAbs,
    volOfVol: stdev(subVols),
  };
}

/** Cheap skew proxy avoiding the import of distributionStats's full pipeline. */
function skewProxy(xs: number[]): number {
  if (xs.length < 3) return 0;
  const m = mean(xs);
  const s = stdev(xs);
  if (s === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - m) / s) ** 3;
  return sum / xs.length;
}

function vectorise(fp: AnalogFingerprint): number[] {
  return [
    fp.realisedVol,
    fp.meanReturn * 252,         // annualise to keep magnitude on parity
    fp.trendSlope * 100,
    fp.skewness,
    fp.rangeCompression,
    fp.volOfVol * 252,
  ];
}

/** Normalise vectors element-wise to z-scores using a population of vectors. */
function normalisePopulation(vectors: number[][]): {
  norm: number[][];
  apply: (v: number[]) => number[];
} {
  if (!vectors.length) return { norm: [], apply: (v) => v };
  const dim = vectors[0].length;
  const means: number[] = [], sds: number[] = [];
  for (let d = 0; d < dim; d++) {
    const col = vectors.map(v => v[d]);
    means.push(mean(col));
    sds.push(stdev(col) || 1);
  }
  const norm = vectors.map(v => v.map((x, d) => (x - means[d]) / sds[d]));
  const apply = (v: number[]) => v.map((x, d) => (x - means[d]) / sds[d]);
  return { norm, apply };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return (na === 0 || nb === 0) ? 0 : dot / Math.sqrt(na * nb);
}

/** Map cosine [-1, 1] → similarity score [0, 1]. */
function score(cos: number): number {
  return Math.max(0, Math.min(1, (cos + 1) / 2));
}

function monthYearLabel(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export interface FindAnalogsOptions {
  /** Window length in bars (default 60 ≈ 3 trading months). */
  window?: number;
  /** Step between historical candidate windows in bars (default 21 ≈ monthly). */
  step?: number;
  /** Number of top matches to return (default 5). */
  topK?: number;
  /** Minimum gap in bars between target and any candidate window (default 2 × window). */
  minGap?: number;
  /** Annualisation factor (default 252). */
  ppy?: number;
}

/** Find historical windows whose fingerprint best matches the most recent
 *  `window` bars of the input series. */
export function findHistoricalAnalogs(
  bars: OHLCVBar[],
  options: FindAnalogsOptions = {},
): AnalogMatch[] {
  const window = options.window ?? 60;
  const step = options.step ?? 21;
  const topK = options.topK ?? 5;
  const minGap = options.minGap ?? window * 2;
  const ppy = options.ppy ?? 252;

  if (bars.length < window * 3) return []; // need target + meaningful history

  const targetSlice = bars.slice(-window);
  const targetFp = fingerprintFromBars(targetSlice, ppy);
  if (!targetFp) return [];

  // Build candidate windows from history (excluding the trailing minGap bars).
  const lastUsableEnd = bars.length - minGap;
  const candidates: Array<{ start: number; end: number; fp: AnalogFingerprint }> = [];
  for (let end = window; end <= lastUsableEnd; end += step) {
    const slice = bars.slice(end - window, end);
    const fp = fingerprintFromBars(slice, ppy);
    if (fp) candidates.push({ start: end - window, end, fp });
  }
  if (!candidates.length) return [];

  // Normalise the candidate population, then transform the target into the
  // same space so cosine similarity sees comparable magnitudes.
  const candidateVectors = candidates.map(c => vectorise(c.fp));
  const { norm, apply } = normalisePopulation(candidateVectors);
  const targetVec = apply(vectorise(targetFp));

  const ranked = candidates
    .map((c, i) => ({
      label: monthYearLabel(bars[c.end - 1].ts),
      windowStart: bars[c.start].ts,
      windowEnd: bars[c.end - 1].ts,
      similarity: score(cosine(norm[i], targetVec)),
      fingerprint: c.fp,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  // Suppress near-duplicate windows (within 1 step of each other) so the
  // top-K list shows distinct historical regimes, not adjacent samples.
  const out: AnalogMatch[] = [];
  const stepMs = step * 24 * 60 * 60 * 1000;
  for (const m of ranked) {
    if (out.length >= topK) break;
    if (out.some(o => Math.abs(o.windowEnd - m.windowEnd) < stepMs * 0.9)) continue;
    out.push(m);
  }
  return out;
}
