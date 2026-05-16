/**
 * Volatility-transmission producer — correlation of |log-returns|.
 * Captures cross-series volatility comovement even when directional
 * correlation is weak. Only emits above 0.35 to keep signal high.
 */
import { alignClosesByTs, pearson } from '../../correlation';
import { logReturns } from '../../returns';
import type { RelationsEdge } from '../types';
import { edgeId, type Producer, type ProducerContext, type ProducerOutput } from './types';

const MIN_OVERLAP = 30;
const EMIT_THRESHOLD = 0.35;

export const volTransmissionProducer: Producer = {
  id: 'volatility-transmission',
  run(ctx: ProducerContext): ProducerOutput {
    const edges: RelationsEdge[] = [];
    const skipped: ProducerOutput['skipped'] = [];

    const all: Array<[string, typeof ctx.focal.bars]> = [
      ...Object.entries(ctx.peers),
      ...Object.entries(ctx.benchmarks),
      ...Object.entries(ctx.macros),
    ];

    for (const [otherSym, otherBars] of all) {
      const aligned = alignClosesByTs(ctx.focal.bars, otherBars);
      if (aligned.ts.length < MIN_OVERLAP) {
        skipped.push({ id: `vol:${ctx.focal.symbol}-${otherSym}`, reason: 'insufficient overlap' });
        continue;
      }
      const a = logReturns(aligned.a).map(Math.abs);
      const b = logReturns(aligned.b).map(Math.abs);
      const n = Math.min(a.length, b.length, ctx.windowDays);
      if (n < MIN_OVERLAP) {
        skipped.push({ id: `vol:${ctx.focal.symbol}-${otherSym}`, reason: 'insufficient |returns|' });
        continue;
      }
      const r = pearson(a.slice(-n), b.slice(-n));
      if (!Number.isFinite(r) || r < EMIT_THRESHOLD) {
        skipped.push({ id: `vol:${ctx.focal.symbol}-${otherSym}`, reason: r < EMIT_THRESHOLD ? 'below threshold' : 'undefined' });
        continue;
      }
      edges.push({
        id: edgeId('volatility-transmission', ctx.focal.symbol, otherSym),
        kind: 'volatility-transmission',
        source: ctx.focal.symbol,
        target: otherSym,
        strength: Math.min(1, r),
        producedBy: 'volatility-transmission',
        windowDays: n,
        derivedAt: Date.now(),
      });
    }
    return { producer: 'volatility-transmission', nodes: [], edges, skipped };
  },
};
