/**
 * V3 Phase 2 — Narrative theme producer (Wave I).
 *
 * Adds one theme node per active narrative theme and `thematic` edges to each
 * related symbol the narrative engine emitted (via narrative_memory).
 *
 * Strength = lifetime_score. Themes older than 180 days without recent
 * activity are dropped (reported in `skipped`).
 */
import type { RelationsEdge, RelationsNode } from '../types';
import { edgeId, type Producer, type ProducerContext, type ProducerOutput } from './types';

const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_THEMES = 20;

export const narrativeProducer: Producer = {
  id: 'narrative',
  run(ctx: ProducerContext): ProducerOutput {
    const nodes: RelationsNode[] = [];
    const edges: RelationsEdge[] = [];
    const skipped: ProducerOutput['skipped'] = [];

    if (!ctx.narratives || ctx.narratives.length === 0) {
      return { producer: 'narrative', nodes, edges, skipped };
    }

    const universe = new Set<string>([
      ctx.focal.symbol.toUpperCase(),
      ...Object.keys(ctx.peers).map((s) => s.toUpperCase()),
    ]);
    const horizon = ctx.asOfTs ?? Date.now();
    const cutoff = horizon - MAX_AGE_MS;

    const eligible = ctx.narratives
      .filter((n) => n.lastSeenTs <= horizon && n.lastSeenTs >= cutoff)
      .sort((a, b) => (b.lifetimeScore ?? 0) - (a.lifetimeScore ?? 0))
      .slice(0, MAX_THEMES);

    const excluded = ctx.narratives.length - eligible.length;
    if (excluded > 0) {
      skipped.push({
        id: 'narratives:filtered',
        reason: `${excluded} theme(s) outside horizon / age cutoff`,
      });
    }

    const now = Date.now();
    for (const n of eligible) {
      const nodeId = `theme:${n.themeId}`;
      nodes.push({
        id: nodeId,
        kind: 'theme',
        label: n.themeLabel,
        meta: `Lifetime ${(n.lifetimeScore * 100).toFixed(0)}%`,
        cluster: 'themes',
        weight: n.lifetimeScore,
        asOf: n.lastSeenTs,
      });

      const matched = n.relatedSymbols
        .map((s) => s.toUpperCase())
        .filter((s) => universe.has(s));
      if (matched.length === 0) {
        skipped.push({ id: `theme:${n.themeId}:fanout`, reason: 'no universe symbols in theme related_symbols' });
        continue;
      }
      for (const sym of matched) {
        edges.push({
          id: edgeId('thematic', nodeId, sym),
          kind: 'thematic',
          source: nodeId,
          target: sym,
          strength: n.lifetimeScore,
          producedBy: 'narrative',
          derivedAt: now,
        });
      }
    }

    return { producer: 'narrative', nodes, edges, skipped };
  },
};
