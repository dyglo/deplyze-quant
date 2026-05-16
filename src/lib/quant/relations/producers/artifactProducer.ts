/**
 * Artifact linkage producer — attaches workspace research artifacts to
 * the Relations Map. Any artifact whose `symbols` or `relatedSymbols`
 * intersect the loaded universe (focal / peers / benchmarks / macros)
 * gains an artifact node + `artifact-link` edges to each matching
 * instrument. Surfaces the user's own research as visible context.
 *
 * Strict-data policy: artifacts older than 365 days are skipped (still
 * counted in `skipped` so callers can see they were considered).
 * Strength is `artifact.significance` (already 0..1) so the visual
 * weight of the link tracks the artifact's analytical importance.
 */
import type { RelationsEdge, RelationsNode } from '../types';
import { edgeId, type Producer, type ProducerContext, type ProducerOutput } from './types';

const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_ARTIFACTS = 12;

export const artifactProducer: Producer = {
  id: 'artifact',
  run(ctx: ProducerContext): ProducerOutput {
    const nodes: RelationsNode[] = [];
    const edges: RelationsEdge[] = [];
    const skipped: ProducerOutput['skipped'] = [];

    if (!ctx.artifacts || ctx.artifacts.length === 0) {
      return { producer: 'artifact', nodes, edges, skipped };
    }

    const universe = new Set<string>([
      ctx.focal.symbol,
      ...Object.keys(ctx.peers),
      ...Object.keys(ctx.benchmarks),
      ...Object.keys(ctx.macros),
    ]);
    const cutoff = (ctx.asOfTs ?? Date.now()) - MAX_AGE_MS;
    const horizon = ctx.asOfTs ?? Date.now();

    // Filter + score artifacts: respect replay cutoff (no future
    // artifacts when replaying), drop expired, intersect with universe.
    const eligible = ctx.artifacts
      .filter((a) => a.ts <= horizon && a.ts >= cutoff)
      .map((a) => ({
        artifact: a,
        matches: collectSymbolMatches(a, universe),
      }))
      .filter((m) => m.matches.length > 0)
      .sort((a, b) => (b.artifact.significance ?? 0) - (a.artifact.significance ?? 0))
      .slice(0, MAX_ARTIFACTS);

    for (const { artifact, matches } of eligible) {
      const nodeId = `artifact:${artifact.id}`;
      nodes.push({
        id: nodeId,
        kind: 'artifact',
        label: shortLabel(artifact),
        meta: artifact.narrative?.slice(0, 90),
        cluster: 'artifacts',
        weight: clamp(artifact.significance ?? 0, 0, 1),
        asOf: artifact.ts,
      });
      for (const sym of matches) {
        edges.push({
          id: edgeId('artifact-link', nodeId, sym),
          kind: 'artifact-link',
          source: nodeId,
          target: sym,
          strength: clamp(artifact.significance ?? 0.5, 0, 1),
          producedBy: 'artifact',
          derivedAt: Date.now(),
        });
      }
    }

    // Report how many were considered but excluded.
    const excluded = ctx.artifacts.length - eligible.length;
    if (excluded > 0) {
      skipped.push({
        id: `artifacts:filtered`,
        reason: `${excluded} artifact(s) outside universe / horizon / age cutoff`,
      });
    }

    return { producer: 'artifact', nodes, edges, skipped };
  },
};

function collectSymbolMatches(a: { symbols: string[]; relatedSymbols?: string[] }, universe: Set<string>): string[] {
  const out = new Set<string>();
  for (const s of a.symbols) if (universe.has(s.toUpperCase())) out.add(s.toUpperCase());
  if (a.relatedSymbols) for (const s of a.relatedSymbols) if (universe.has(s.toUpperCase())) out.add(s.toUpperCase());
  return Array.from(out);
}

function shortLabel(a: { kind: string; symbols: string[] }): string {
  const tag = a.kind.replace(/_/g, ' ');
  const sym = a.symbols[0] ?? '';
  return sym ? `${sym} · ${tag}` : tag;
}

function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }
