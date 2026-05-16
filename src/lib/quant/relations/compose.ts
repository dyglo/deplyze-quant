/**
 * Compose a Relations Map snapshot from multiple producers.
 *
 * Merging rules:
 *   - Nodes deduped by id; later producers may *augment* fields but
 *     cannot change a node's kind once set.
 *   - Edges deduped on `edgeId(kind, source, target)`. First producer
 *     to emit a given edge wins — order in `producers` controls priority.
 *   - Edges referencing unknown nodes are dropped + reported.
 *   - Clusters are synthesized from collected `node.cluster` ids so the
 *     layout layer has something to render.
 */
import { correlationProducer } from './producers/correlationProducer';
import { benchmarkProducer } from './producers/benchmarkProducer';
import { volTransmissionProducer } from './producers/volTransmissionProducer';
import { sectorPeerProducer } from './producers/sectorPeerProducer';
import { artifactProducer } from './producers/artifactProducer';
import type { Producer, ProducerContext, ProducerOutput } from './producers/types';
import type { RelationsCluster, RelationsEdge, RelationsGraphSnapshot, RelationsNode } from './types';

/** Structural producers first so derived edges attach to known nodes.
 *  Artifact producer runs last so its `artifact-link` edges only attach
 *  to instrument nodes already emitted by upstream producers. */
export const DEFAULT_PRODUCERS: Producer[] = [
  sectorPeerProducer,
  correlationProducer,
  benchmarkProducer,
  volTransmissionProducer,
  artifactProducer,
];

export function composeRelationsGraph(
  ctx: ProducerContext,
  producers: Producer[] = DEFAULT_PRODUCERS,
): RelationsGraphSnapshot {
  const nodesById = new Map<string, RelationsNode>();
  const edgesById = new Map<string, RelationsEdge>();
  const skipped: Array<{ id: string; reason: string }> = [];
  let mostRecent = 0;

  for (const p of producers) {
    let out: ProducerOutput;
    try { out = p.run(ctx); }
    catch (e) {
      skipped.push({ id: `producer:${p.id}`, reason: `producer threw: ${(e as Error).message}` });
      continue;
    }
    for (const n of out.nodes) {
      if (!nodesById.has(n.id)) nodesById.set(n.id, n);
      else {
        const existing = nodesById.get(n.id)!;
        nodesById.set(n.id, {
          ...existing,
          meta:    existing.meta    ?? n.meta,
          cluster: existing.cluster ?? n.cluster,
          sector:  existing.sector  ?? n.sector,
          weight:  Math.max(existing.weight ?? 0, n.weight ?? 0),
        });
      }
    }
    for (const e of out.edges) {
      if (!edgesById.has(e.id)) edgesById.set(e.id, e);
      mostRecent = Math.max(mostRecent, e.derivedAt);
    }
    skipped.push(...out.skipped);
  }

  const validNodeIds = new Set(nodesById.keys());
  for (const [id, e] of Array.from(edgesById.entries())) {
    if (!validNodeIds.has(e.source) || !validNodeIds.has(e.target)) {
      edgesById.delete(id);
      skipped.push({ id, reason: 'endpoint not in graph' });
    }
  }

  const clusterMap = new Map<string, RelationsCluster>();
  for (const n of nodesById.values()) {
    if (!n.cluster) continue;
    const c = clusterMap.get(n.cluster) ?? {
      id: n.cluster,
      label: clusterLabel(n.cluster),
      nodeIds: [],
    };
    c.nodeIds.push(n.id);
    clusterMap.set(n.cluster, c);
  }

  return {
    nodes: Array.from(nodesById.values()),
    edges: Array.from(edgesById.values()),
    clusters: Array.from(clusterMap.values()),
    windowDays: ctx.windowDays,
    asOf: mostRecent || Date.now(),
    skipped,
  };
}

function clusterLabel(id: string): string {
  if (id.startsWith('sector:'))   return id.slice('sector:'.length);
  if (id.startsWith('industry:')) return id.slice('industry:'.length);
  if (id === 'benchmarks')        return 'Benchmarks';
  if (id === 'macro')             return 'Macro proxies';
  return id;
}
