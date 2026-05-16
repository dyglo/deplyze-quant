/**
 * Benchmark-dependency producer — beta + R² of focal vs. each benchmark.
 * Strength combines |beta| (60%) with R² (40%) so a high-beta noisy fit
 * doesn't dominate a moderate-beta tight fit.
 */
import { alignClosesByTs, pearson } from '../../correlation';
import { beta } from '../../benchmark';
import { logReturns } from '../../returns';
import type { RelationsEdge } from '../types';
import { edgeId, sliceAsOf, type Producer, type ProducerContext, type ProducerOutput } from './types';

const MIN_OVERLAP = 30;

export const benchmarkProducer: Producer = {
  id: 'benchmark',
  run(ctx: ProducerContext): ProducerOutput {
    const edges: RelationsEdge[] = [];
    const skipped: ProducerOutput['skipped'] = [];

    const focalBars = sliceAsOf(ctx.focal.bars, ctx.asOfTs);
    for (const [bench, benchBarsRaw] of Object.entries(ctx.benchmarks)) {
      const benchBars = sliceAsOf(benchBarsRaw, ctx.asOfTs);
      const aligned = alignClosesByTs(focalBars, benchBars);
      if (aligned.ts.length < MIN_OVERLAP) {
        skipped.push({ id: `bench:${ctx.focal.symbol}-${bench}`, reason: 'insufficient overlap' });
        continue;
      }
      const a = logReturns(aligned.a);
      const b = logReturns(aligned.b);
      const n = Math.min(a.length, b.length, ctx.windowDays);
      if (n < MIN_OVERLAP) {
        skipped.push({ id: `bench:${ctx.focal.symbol}-${bench}`, reason: 'insufficient returns' });
        continue;
      }
      const aSlice = a.slice(-n);
      const bSlice = b.slice(-n);
      const beta_ = beta(aSlice, bSlice);
      const r = pearson(aSlice, bSlice);
      if (!Number.isFinite(beta_) || !Number.isFinite(r)) {
        skipped.push({ id: `bench:${ctx.focal.symbol}-${bench}`, reason: 'beta undefined' });
        continue;
      }
      const r2 = r * r;
      const strength = Math.min(1, Math.abs(beta_) * 0.6 + r2 * 0.4);
      edges.push({
        id: edgeId('benchmark-dependency', ctx.focal.symbol, bench),
        kind: 'benchmark-dependency',
        source: ctx.focal.symbol,
        target: bench,
        strength,
        producedBy: 'benchmark',
        windowDays: n,
        derivedAt: Date.now(),
      });
    }
    return { producer: 'benchmark', nodes: [], edges, skipped };
  },
};
