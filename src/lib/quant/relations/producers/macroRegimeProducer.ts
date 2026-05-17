/**
 * V3 Phase 2 — Macro regime producer (Wave I).
 *
 * Adds one macro-regime node per active regime kind (liquidity / inflation /
 * rates / growth) and `macro-dependency` edges to every target symbol the
 * regime classifier flagged as affected.
 *
 * Strength = regime.confidence. We don't manufacture targets here — the
 * gateway passes them in based on the macro engine's curated regime→asset
 * mapping. If `targets` is empty for a regime we still emit the node (so
 * the Relations Map UI can show "regime active, no specific symbol link")
 * and report the empty fan-out via `skipped`.
 */
import type { RelationsEdge, RelationsNode } from '../types';
import { edgeId, type Producer, type ProducerContext, type ProducerOutput } from './types';

export const macroRegimeProducer: Producer = {
  id: 'macro-regime',
  run(ctx: ProducerContext): ProducerOutput {
    const nodes: RelationsNode[] = [];
    const edges: RelationsEdge[] = [];
    const skipped: ProducerOutput['skipped'] = [];

    if (!ctx.macroRegimes || ctx.macroRegimes.length === 0) {
      return { producer: 'macro-regime', nodes, edges, skipped };
    }

    const universe = new Set<string>([
      ctx.focal.symbol.toUpperCase(),
      ...Object.keys(ctx.peers).map((s) => s.toUpperCase()),
      ...Object.keys(ctx.benchmarks).map((s) => s.toUpperCase()),
      ...Object.keys(ctx.macros).map((s) => s.toUpperCase()),
    ]);
    const horizon = ctx.asOfTs ?? Date.now();
    const now = Date.now();

    for (const r of ctx.macroRegimes) {
      if (r.ts > horizon) {
        skipped.push({ id: `macro:${r.kind}:future`, reason: 'regime ts beyond replay horizon' });
        continue;
      }
      const nodeId = `macro-regime:${r.kind}`;
      nodes.push({
        id: nodeId,
        kind: 'macro',
        label: `${humanize(r.kind)}: ${r.label}`,
        meta: `Confidence ${(r.confidence * 100).toFixed(0)}%`,
        cluster: 'macro',
        weight: r.confidence,
        asOf: r.ts,
      });

      const matched = r.targets
        .map((t) => t.toUpperCase())
        .filter((t) => universe.has(t));
      if (matched.length === 0) {
        skipped.push({ id: `macro:${r.kind}:fanout`, reason: 'no universe symbols in regime targets' });
        continue;
      }
      for (const t of matched) {
        edges.push({
          id: edgeId('macro-dependency', nodeId, t),
          kind: 'macro-dependency',
          source: nodeId,
          target: t,
          strength: r.confidence,
          producedBy: 'macro-regime',
          derivedAt: now,
        });
      }
    }

    return { producer: 'macro-regime', nodes, edges, skipped };
  },
};

function humanize(k: string): string {
  return k.replace('_regime', '').replace(/\b\w/g, (c) => c.toUpperCase());
}
