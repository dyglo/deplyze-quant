/**
 * V3 Phase 2 — SEC filings producer (Wave I).
 *
 * Attaches recent material filings (8-K, 10-K, 10-Q) to the Relations Map as
 * filing nodes with `earnings-influence` edges into the corresponding symbol.
 * Filings older than 365 days are dropped (still reported in `skipped`).
 *
 * Edge strength = filing.novelty ?? base-by-form (8-K rates higher than 10-Q
 * because 8-Ks are event-driven). The visual weight tracks how *new* the
 * disclosure is, not how *important* the company is — that's the symbol
 * node's concern.
 */
import type { RelationsEdge, RelationsNode } from '../types';
import { edgeId, type Producer, type ProducerContext, type ProducerOutput } from './types';

const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_FILINGS = 15;

const FORM_BASE_STRENGTH: Record<string, number> = {
  '8-K':     0.75,  // material event
  '10-K':    0.65,  // annual
  '10-Q':    0.55,  // quarterly
  '20-F':    0.65,
  'DEF 14A': 0.50,
  'SC 13D':  0.70,
  'SC 13G':  0.55,
  '13F-HR':  0.40,
  'S-1':     0.60,
  'S-3':     0.45,
  'S-4':     0.55,
  '4':       0.35,  // insider trade
};

export const filingsProducer: Producer = {
  id: 'filings',
  run(ctx: ProducerContext): ProducerOutput {
    const nodes: RelationsNode[] = [];
    const edges: RelationsEdge[] = [];
    const skipped: ProducerOutput['skipped'] = [];

    if (!ctx.filings || ctx.filings.length === 0) {
      return { producer: 'filings', nodes, edges, skipped };
    }

    const universe = new Set<string>([
      ctx.focal.symbol.toUpperCase(),
      ...Object.keys(ctx.peers).map((s) => s.toUpperCase()),
    ]);
    const horizon = ctx.asOfTs ?? Date.now();
    const cutoff = horizon - MAX_AGE_MS;

    const eligible = ctx.filings
      .filter((f) => f.ts <= horizon && f.ts >= cutoff)
      .filter((f) => universe.has(f.symbol.toUpperCase()))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_FILINGS);

    const excluded = ctx.filings.length - eligible.length;
    if (excluded > 0) {
      skipped.push({
        id: 'filings:filtered',
        reason: `${excluded} filing(s) outside universe / horizon / age cutoff`,
      });
    }

    const now = Date.now();
    for (const f of eligible) {
      const nodeId = `filing:${f.id}`;
      const target = f.symbol.toUpperCase();
      const baseline = FORM_BASE_STRENGTH[f.formType] ?? 0.5;
      const strength = clamp(f.novelty ?? baseline, 0, 1);

      nodes.push({
        id: nodeId,
        kind: 'news-cluster',         // reuse news-cluster styling for filings
        label: `${target} · ${f.formType}`,
        meta: f.title?.slice(0, 90),
        cluster: 'filings',
        weight: strength,
        asOf: f.ts,
      });
      edges.push({
        id: edgeId('earnings-influence', nodeId, target),
        kind: 'earnings-influence',
        source: nodeId,
        target,
        strength,
        producedBy: 'filings',
        derivedAt: now,
      });
    }

    return { producer: 'filings', nodes, edges, skipped };
  },
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
