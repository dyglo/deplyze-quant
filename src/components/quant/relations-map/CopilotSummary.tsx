import React from 'react';
import { Sparkles } from 'lucide-react';
import type { RelationsGraphSnapshot, RelationsNode, RelationsEdge } from '../../../lib/quant/relations/types';

interface Props {
  snapshot: RelationsGraphSnapshot;
  node: RelationsNode;
}

/**
 * Local-derived narrative summary for a node — no API call. Reads the
 * node's neighbour groups and writes 2–3 sentences describing what the
 * graph says about the node's relationship structure right now. Surfaces
 * the strongest correlation, the dominant benchmark dependency, and any
 * flagged trend (strengthening / weakening / flipped).
 *
 * Kept local-only so the drawer stays instant; if a richer LLM-backed
 * summary becomes available later, this component is the natural mount
 * point.
 */
export const CopilotSummary: React.FC<Props> = ({ snapshot, node }) => {
  const summary = buildSummary(snapshot, node);
  if (!summary) return null;

  return (
    <section style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: 12,
      borderRadius: 8,
      border: '1px solid var(--border)',
      background: 'color-mix(in srgb, var(--primary) 5%, var(--card))',
    }}>
      <span style={{
        width: 22, height: 22, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
        color: 'var(--primary)',
      }}>
        <Sparkles size={12} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--primary)',
        }}>
          Deplyze Assistant summary
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--foreground)' }}>
          {summary}
        </p>
      </div>
    </section>
  );
};

function buildSummary(snapshot: RelationsGraphSnapshot, node: RelationsNode): string | null {
  const groups = collectNeighbours(snapshot, node.id);
  const allEdges = Object.values(groups).flat();
  if (allEdges.length === 0) return null;

  const strongest = allEdges.reduce((acc, e) =>
    Math.abs(e.edge.strength) > Math.abs(acc.edge.strength) ? e : acc, allEdges[0]);
  const benchmarkEdge = (groups['benchmark-dependency'] ?? [])[0];
  const volEdge = (groups['volatility-transmission'] ?? [])[0];
  const flippedOrShifted = allEdges.filter(({ edge }) =>
    edge.trend === 'flipped' || edge.trend === 'strengthening' || edge.trend === 'weakening',
  );

  const parts: string[] = [];

  const peerCount = (groups['thematic']?.length ?? 0) + (groups['correlation']?.length ?? 0);
  parts.push(
    `${node.label} has ${allEdges.length} live relationship${allEdges.length === 1 ? '' : 's'} in the ${snapshot.windowDays}-day window` +
    (peerCount > 0 ? `, including ${peerCount} peer-cluster link${peerCount === 1 ? '' : 's'}.` : '.'),
  );

  parts.push(
    `Strongest tie is to ${strongest.edge.target === node.id ? strongest.edge.source : strongest.edge.target} ` +
    `(${describeKind(strongest.edge.kind)}, ${formatStrength(strongest.edge.strength)}).`,
  );

  if (benchmarkEdge) {
    const bench = benchmarkEdge.edge.target === node.id ? benchmarkEdge.edge.source : benchmarkEdge.edge.target;
    parts.push(`Benchmark dependency dominated by ${bench} (composite β/R² ${benchmarkEdge.edge.strength.toFixed(2)}).`);
  }
  if (volEdge) {
    const other = volEdge.edge.target === node.id ? volEdge.edge.source : volEdge.edge.target;
    parts.push(`Volatility tracks ${other} (|returns| ρ ${volEdge.edge.strength.toFixed(2)}).`);
  }
  if (flippedOrShifted.length > 0) {
    const f = flippedOrShifted[0];
    const other = f.edge.target === node.id ? f.edge.source : f.edge.target;
    parts.push(
      `Recent shift: relationship with ${other} is ${f.edge.trend}` +
      (typeof f.edge.zScore === 'number' ? ` (z = ${f.edge.zScore.toFixed(1)})` : '') + '.',
    );
  }

  return parts.join(' ');
}

interface NeighbourItem { edge: RelationsEdge; node: RelationsNode | null }

function collectNeighbours(snapshot: RelationsGraphSnapshot, id: string): Record<string, NeighbourItem[]> {
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const groups: Record<string, NeighbourItem[]> = {};
  for (const e of snapshot.edges) {
    let otherId: string | null = null;
    if (e.source === id) otherId = e.target;
    else if (e.target === id) otherId = e.source;
    if (!otherId) continue;
    (groups[e.kind] ??= []).push({ edge: e, node: byId.get(otherId) ?? null });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => Math.abs(b.edge.strength) - Math.abs(a.edge.strength));
  }
  return groups;
}

function describeKind(k: RelationsEdge['kind']): string {
  switch (k) {
    case 'correlation':              return 'correlation';
    case 'inverse-correlation':      return 'inverse correlation';
    case 'benchmark-dependency':     return 'benchmark dependency';
    case 'sector-dependency':        return 'sector dependency';
    case 'volatility-transmission':  return 'volatility transmission';
    case 'macro-dependency':         return 'macro link';
    case 'thematic':                 return 'thematic peer';
    case 'supplier':                 return 'supplier link';
    case 'customer':                 return 'customer link';
    case 'artifact-link':            return 'research artifact';
    case 'historical':               return 'historical analog';
    case 'regime':                   return 'regime link';
    case 'earnings-influence':       return 'earnings influence';
  }
}

function formatStrength(v: number): string { return (v >= 0 ? '+' : '') + v.toFixed(2); }
