/**
 * Correlation producer — emits correlation / inverse-correlation edges
 * over the user-selected window, with optional trend label derived from
 * correlationDrift against a longer baseline.
 */
import { alignClosesByTs, correlationDrift, pearson } from '../../correlation';
import { logReturns } from '../../returns';
import type { RelationsEdge } from '../types';
import { edgeId, sliceAsOf, type Producer, type ProducerContext, type ProducerOutput } from './types';

const MIN_OVERLAP = 30;
const BASELINE_WINDOW = 126;

export const correlationProducer: Producer = {
  id: 'correlation',
  run(ctx: ProducerContext): ProducerOutput {
    const edges: RelationsEdge[] = [];
    const skipped: ProducerOutput['skipped'] = [];

    const all: Array<[string, typeof ctx.focal.bars]> = [
      ...Object.entries(ctx.peers),
      ...Object.entries(ctx.benchmarks),
      ...Object.entries(ctx.macros),
    ];

    const focalBars = sliceAsOf(ctx.focal.bars, ctx.asOfTs);
    for (const [otherSym, otherBarsRaw] of all) {
      const otherBars = sliceAsOf(otherBarsRaw, ctx.asOfTs);
      const aligned = alignClosesByTs(focalBars, otherBars);
      if (aligned.ts.length < MIN_OVERLAP) {
        skipped.push({ id: `corr:${ctx.focal.symbol}-${otherSym}`, reason: 'insufficient overlap' });
        continue;
      }
      const a = logReturns(aligned.a);
      const b = logReturns(aligned.b);
      const n = Math.min(a.length, b.length);
      if (n < MIN_OVERLAP) {
        skipped.push({ id: `corr:${ctx.focal.symbol}-${otherSym}`, reason: 'insufficient returns' });
        continue;
      }
      const recent = Math.min(ctx.windowDays, n);
      const r = pearson(a.slice(-recent), b.slice(-recent));
      if (!Number.isFinite(r)) {
        skipped.push({ id: `corr:${ctx.focal.symbol}-${otherSym}`, reason: 'pearson undefined' });
        continue;
      }

      let baseline: number | undefined;
      let zScore: number | undefined;
      let trend: RelationsEdge['trend'];
      if (n >= recent + BASELINE_WINDOW) {
        const drift = correlationDrift(a, b, recent, BASELINE_WINDOW);
        if (drift) {
          baseline = drift.historical;
          zScore = drift.zScore;
          trend = mapTrend(drift.state, drift.delta, baseline);
        }
      }

      const kind: RelationsEdge['kind'] = r >= 0 ? 'correlation' : 'inverse-correlation';
      edges.push({
        id: edgeId(kind, ctx.focal.symbol, otherSym),
        kind,
        source: ctx.focal.symbol,
        target: otherSym,
        strength: clamp(r, -1, 1),
        baseline,
        zScore,
        trend,
        producedBy: 'correlation',
        windowDays: recent,
        derivedAt: Date.now(),
      });
    }
    return { producer: 'correlation', nodes: [], edges, skipped };
  },
};

function mapTrend(state: string, delta: number, baseline: number): RelationsEdge['trend'] {
  if (baseline !== 0 && Math.sign(baseline) !== Math.sign(baseline + delta)) return 'flipped';
  if (state === 'breakdown')  return 'flipped';
  if (state === 'tightening') return baseline >= 0 ? 'strengthening' : 'weakening';
  if (state === 'loosening')  return baseline >= 0 ? 'weakening' : 'strengthening';
  return 'stable';
}
function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }
