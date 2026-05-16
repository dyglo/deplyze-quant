/**
 * Relations Map — Phase 4.
 *
 * Institutional relationship-intelligence surface that replaces the legacy
 * Cross-Asset Matrix. Wave A delivers the page chrome, graph engine mount
 * (sigma + graphology), seed ontology, contextual side panel, and filter
 * shell. Subsequent waves layer real-data engines (correlation, volatility
 * transmission, supplier graph, benchmark dependency, macro alignment),
 * clustering overlays, historical replay, and artifact integration.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import {
  RelationsGraphCanvas,
  RelationsSidePanel,
  RelationsFilterBar,
} from '../components/quant/relations-map';
import { buildSeedRelationsGraph } from '../lib/quant/relations';
import type { EdgeKind, NodeKind, RelationsGraphSnapshot, RelationsNode } from '../lib/quant/relations/types';

const ALL_EDGE_KINDS: EdgeKind[] = [
  'correlation', 'inverse-correlation', 'supplier', 'customer',
  'benchmark-dependency', 'sector-dependency', 'volatility-transmission',
  'macro-dependency', 'earnings-influence', 'thematic',
  'artifact-link', 'historical', 'regime',
];

export const RelationsMap: React.FC = () => {
  const baseSnapshot = useMemo<RelationsGraphSnapshot>(() => buildSeedRelationsGraph(), []);
  const [windowDays, setWindowDays] = useState(63);
  const [edgeKinds, setEdgeKinds] = useState<Set<EdgeKind>>(() => new Set(ALL_EDGE_KINDS));
  const [nodeKinds, setNodeKinds] = useState<Set<NodeKind>>(() => new Set());
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const toggleEdgeKind = useCallback((k: EdgeKind) => {
    setEdgeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const toggleNodeKind = useCallback((k: NodeKind) => {
    setNodeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const filteredSnapshot = useMemo<RelationsGraphSnapshot>(() => {
    const q = query.trim().toLowerCase();
    let nodes = baseSnapshot.nodes;
    if (q) {
      const matchIds = new Set(
        baseSnapshot.nodes
          .filter((n) =>
            n.label.toLowerCase().includes(q) ||
            n.id.toLowerCase().includes(q) ||
            (n.meta?.toLowerCase().includes(q) ?? false))
          .map((n) => n.id),
      );
      // Expand by 1-hop neighbours of matches so context survives the filter.
      const expanded = new Set(matchIds);
      for (const e of baseSnapshot.edges) {
        if (matchIds.has(e.source)) expanded.add(e.target);
        if (matchIds.has(e.target)) expanded.add(e.source);
      }
      nodes = baseSnapshot.nodes.filter((n) => expanded.has(n.id));
    }
    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges = baseSnapshot.edges.filter((e) =>
      edgeKinds.has(e.kind) && visibleIds.has(e.source) && visibleIds.has(e.target),
    );
    return { ...baseSnapshot, nodes, edges, windowDays };
  }, [baseSnapshot, query, edgeKinds, windowDays]);

  const selectedNode = useMemo<RelationsNode | null>(() =>
    selected ? filteredSnapshot.nodes.find((n) => n.id === selected) ?? null : null,
    [selected, filteredSnapshot.nodes],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Relations Map"
        subtitle="Institutional relationship intelligence — explore how instruments, sectors, benchmarks, macro indicators, and volatility regimes influence one another. Click any node to drill into its neighbourhood."
        actions={
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
            border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', background: 'var(--muted)',
          }}>
            Phase 4 · Wave A
          </span>
        }
      />

      <RelationsFilterBar
        windowDays={windowDays}
        onWindowDaysChange={setWindowDays}
        edgeKinds={edgeKinds}
        onToggleEdgeKind={toggleEdgeKind}
        nodeKinds={nodeKinds}
        onToggleNodeKind={toggleNodeKind}
        query={query}
        onQueryChange={setQuery}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 320px',
        gap: 14,
        alignItems: 'stretch',
        minHeight: 600,
      }}>
        <section style={{
          position: 'relative',
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--card)',
          overflow: 'hidden',
        }}>
          <RelationsGraphCanvas
            snapshot={filteredSnapshot}
            hoveredNodeId={hovered}
            selectedNodeId={selected}
            onHoverNode={setHovered}
            onSelectNode={setSelected}
          />
          <div style={{
            position: 'absolute', left: 12, bottom: 12, right: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            pointerEvents: 'none',
          }}>
            <span className="ds-caption" style={{
              color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--card) 80%, transparent)',
              padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', pointerEvents: 'auto',
            }}>
              {filteredSnapshot.nodes.length} nodes · {filteredSnapshot.edges.length} edges · seed ontology
            </span>
            <span className="ds-caption" style={{
              color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--card) 80%, transparent)',
              padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', pointerEvents: 'auto',
            }}>
              scroll to zoom · drag to pan · click node to inspect
            </span>
          </div>
        </section>

        <RelationsSidePanel
          snapshot={filteredSnapshot}
          selectedNode={selectedNode}
          onClose={() => setSelected(null)}
          onNavigateNode={setSelected}
        />
      </div>

      <p className="ds-caption" style={{ marginTop: 14, color: 'var(--muted-foreground)', maxWidth: 760 }}>
        Wave A renders the institutional ontology with a seed of well-known macro relationships. Subsequent waves
        replace seed edges with engine-derived strengths (rolling correlations, volatility transmission, benchmark
        beta, supplier graphs), add cluster overlays, historical replay, and artifact linkage.
      </p>

      <Disclaimer />
    </div>
  );
};
