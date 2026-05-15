/**
 * Cross-asset intelligence orchestrator.
 *
 * Composes the correlation + drift primitives from [[correlation]] into
 * basket-level outputs: a pairwise correlation matrix snapshot plus a
 * dependency-shift report flagging the pairs whose recent correlation has
 * diverged most sharply from its baseline.
 *
 * Strict-data policy: pairs without enough overlapping history are silently
 * skipped, not back-filled. The output reports which pairs were skipped so
 * callers can render explicit "insufficient" states.
 */

import type { OHLCVBar } from '../../types';
import { alignClosesByTs, correlationMatrix, correlationDrift, pearson, type CorrelationDrift } from './correlation';
import { logReturns } from './returns';

export interface CrossAssetBasket {
  /** Symbol → bar series. All series should share the same timeframe. */
  bars: Record<string, OHLCVBar[]>;
}

export interface CrossAssetMatrixSnapshot {
  symbols: string[];
  matrix: number[][];        // NxN Pearson correlation of log returns
  asOf: number;              // most-recent shared timestamp
  sampleSize: number;        // bars used per pair
}

export interface DependencyShiftReport {
  pair: [string, string];
  current: number;
  historical: number;
  delta: number;
  zScore: number;
  state: CorrelationDrift['state'];
}

export interface CrossAssetIntelligence {
  matrix: CrossAssetMatrixSnapshot | null;
  shifts: DependencyShiftReport[];      // sorted by |zScore| desc
  skippedPairs: Array<{ pair: [string, string]; reason: string }>;
}

/** Snapshot Pearson-correlation matrix on overlapping log returns. */
export function crossAssetMatrix(basket: CrossAssetBasket, minBars = 60): CrossAssetMatrixSnapshot | null {
  const symbols = Object.keys(basket.bars).filter(s => (basket.bars[s]?.length ?? 0) >= minBars);
  if (symbols.length < 2) return null;

  // Align all series on the intersection of timestamps via a reference symbol.
  // For N symbols, repeated pairwise alignment is N(N-1)/2 — acceptable for
  // realistic basket sizes (≤ ~20).
  const seriesByPair = new Map<string, { a: number[]; b: number[] }>();
  let minPairLen = Infinity;
  let mostRecentTs = 0;
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i; j < symbols.length; j++) {
      if (i === j) continue;
      const aligned = alignClosesByTs(basket.bars[symbols[i]], basket.bars[symbols[j]]);
      const a = logReturns(aligned.a);
      const b = logReturns(aligned.b);
      const n = Math.min(a.length, b.length);
      if (n < minBars) continue;
      seriesByPair.set(`${symbols[i]}|${symbols[j]}`, { a: a.slice(-n), b: b.slice(-n) });
      if (n < minPairLen) minPairLen = n;
      if (aligned.ts.length) mostRecentTs = Math.max(mostRecentTs, aligned.ts[aligned.ts.length - 1]);
    }
  }
  if (!Number.isFinite(minPairLen)) return null;

  const matrix: number[][] = Array.from({ length: symbols.length }, () => new Array(symbols.length).fill(0));
  for (let i = 0; i < symbols.length; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < symbols.length; j++) {
      const key = `${symbols[i]}|${symbols[j]}`;
      const s = seriesByPair.get(key);
      if (!s) { matrix[i][j] = matrix[j][i] = NaN; continue; }
      const r = pearson(s.a, s.b);
      matrix[i][j] = matrix[j][i] = r;
    }
  }

  return { symbols, matrix, asOf: mostRecentTs, sampleSize: minPairLen };
}

/** Build a full cross-asset intelligence report: matrix + sorted dependency
 *  shifts (most extreme |z| first). */
export function crossAssetIntelligence(
  basket: CrossAssetBasket,
  opts: { recentWindow?: number; baselineWindow?: number; minBars?: number } = {},
): CrossAssetIntelligence {
  const minBars = opts.minBars ?? 60;
  const recentWindow = opts.recentWindow ?? 21;
  const baselineWindow = opts.baselineWindow ?? 126;
  const symbols = Object.keys(basket.bars);
  const skipped: CrossAssetIntelligence['skippedPairs'] = [];

  const matrix = crossAssetMatrix(basket, minBars);

  const shifts: DependencyShiftReport[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const a = basket.bars[symbols[i]];
      const b = basket.bars[symbols[j]];
      if (!a || !b) { skipped.push({ pair: [symbols[i], symbols[j]], reason: 'missing series' }); continue; }
      const aligned = alignClosesByTs(a, b);
      if (aligned.ts.length < baselineWindow + recentWindow + 5) {
        skipped.push({ pair: [symbols[i], symbols[j]], reason: 'insufficient overlap' });
        continue;
      }
      const aLR = logReturns(aligned.a);
      const bLR = logReturns(aligned.b);
      const drift = correlationDrift(aLR, bLR, recentWindow, baselineWindow);
      if (!drift) {
        skipped.push({ pair: [symbols[i], symbols[j]], reason: 'drift unresolved' });
        continue;
      }
      shifts.push({
        pair: [symbols[i], symbols[j]],
        current: drift.current,
        historical: drift.historical,
        delta: drift.delta,
        zScore: drift.zScore,
        state: drift.state,
      });
    }
  }

  shifts.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  return { matrix, shifts, skippedPairs: skipped };
}

// Re-export correlationMatrix for callers that just want the raw primitive.
export { correlationMatrix };
