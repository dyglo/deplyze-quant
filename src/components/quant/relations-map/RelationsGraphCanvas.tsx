import React, { useEffect, useMemo, useRef } from 'react';
import Graph from 'graphology';
import { circular } from 'graphology-layout';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import type { RelationsGraphSnapshot, RelationsNode, RelationsEdge } from '../../../lib/quant/relations/types';
import { nodeColor, nodeSize, edgeColor, edgeWidth } from './nodePalette';

interface Props {
  snapshot: RelationsGraphSnapshot;
  hoveredNodeId?: string | null;
  selectedNodeId?: string | null;
  onHoverNode?: (id: string | null) => void;
  onSelectNode?: (id: string | null) => void;
}

/**
 * Mounts a sigma renderer over a graphology graph for the snapshot.
 * Layout: circular seed → ForceAtlas2 (50 iterations, scaled). We do not
 * mutate the snapshot — node x/y are computed locally on each rebuild.
 *
 * Re-renders are cheap: identity of `snapshot` controls full rebuilds;
 * hover/select changes update sigma reducers without rebuilding the graph.
 */
export const RelationsGraphCanvas: React.FC<Props> = ({
  snapshot,
  hoveredNodeId,
  selectedNodeId,
  onHoverNode,
  onSelectNode,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const hoverRef = useRef<string | null>(null);
  const selectRef = useRef<string | null>(null);

  // Build the graph whenever the snapshot identity changes.
  const graph = useMemo(() => {
    const g = new Graph({ multi: false, allowSelfLoops: false, type: 'undirected' });
    for (const n of snapshot.nodes) addNode(g, n);
    for (const e of snapshot.edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
      if (e.source === e.target) continue;
      if (g.hasEdge(e.source, e.target)) continue;
      g.addEdgeWithKey(e.id, e.source, e.target, {
        size: edgeWidth(e.strength),
        color: edgeColor(e.kind, e.strength),
        label: edgeKindLabel(e.kind),
        kind: e.kind,
        strength: e.strength,
        zScore: e.zScore,
      });
    }
    circular.assign(g, { scale: 100 });
    if (g.order > 0) {
      try {
        forceAtlas2.assign(g, {
          iterations: 80,
          settings: {
            gravity: 1.2,
            scalingRatio: 8,
            slowDown: 4,
            barnesHutOptimize: g.order > 80,
            strongGravityMode: true,
          },
        });
      } catch {
        /* FA2 occasionally fails on near-degenerate graphs — fall back to circular. */
      }
    }
    return g;
  }, [snapshot]);

  // Sigma mount / teardown bound to the graph identity.
  useEffect(() => {
    if (!hostRef.current) return;
    graphRef.current = graph;
    const sigma = new Sigma(graph, hostRef.current, {
      renderEdgeLabels: false,
      defaultEdgeType: 'line',
      labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
      labelSize: 11,
      labelWeight: '500',
      labelColor: { attribute: 'labelColor', color: getCssVar('--foreground', '#1a1a1a') },
      minCameraRatio: 0.2,
      maxCameraRatio: 4,
    });
    sigmaRef.current = sigma;

    sigma.setSetting('nodeReducer', (id, data) => {
      const d = { ...data } as Record<string, unknown> & { hidden?: boolean; color?: string; size?: number; label?: string };
      const hov = hoverRef.current;
      const sel = selectRef.current;
      if (hov && hov !== id && !graph.hasEdge(hov, id) && !graph.hasEdge(id, hov)) {
        d.color = fade(String(data.color ?? '#8b8b8b'), 0.18);
        d.label = '';
      }
      if (sel && sel !== id && !graph.hasEdge(sel, id) && !graph.hasEdge(id, sel)) {
        d.color = fade(String(data.color ?? '#8b8b8b'), 0.12);
      }
      if (sel === id || hov === id) {
        d.size = (typeof data.size === 'number' ? data.size : 8) * 1.18;
      }
      return d as Record<string, unknown>;
    });

    sigma.setSetting('edgeReducer', (id, data) => {
      const d = { ...data } as Record<string, unknown> & { hidden?: boolean; color?: string; size?: number };
      const hov = hoverRef.current;
      const sel = selectRef.current;
      const [s, t] = graph.extremities(id);
      const focus = hov ?? sel;
      if (focus && focus !== s && focus !== t) {
        d.color = fade(String(data.color ?? '#8b8b8b'), 0.08);
      } else if (focus) {
        d.size = (typeof data.size === 'number' ? data.size : 1) * 1.6;
      }
      return d as Record<string, unknown>;
    });

    const handleEnter = ({ node }: { node: string }) => { hoverRef.current = node; onHoverNode?.(node); sigma.refresh(); };
    const handleLeave = () => { hoverRef.current = null; onHoverNode?.(null); sigma.refresh(); };
    const handleClick = ({ node }: { node: string }) => { selectRef.current = node; onSelectNode?.(node); sigma.refresh(); };
    const handleStageClick = () => { selectRef.current = null; onSelectNode?.(null); sigma.refresh(); };

    sigma.on('enterNode', handleEnter);
    sigma.on('leaveNode', handleLeave);
    sigma.on('clickNode', handleClick);
    sigma.on('clickStage', handleStageClick);

    return () => {
      sigma.removeAllListeners();
      sigma.kill();
      sigmaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Sync external hover/select into sigma reducers.
  useEffect(() => {
    hoverRef.current = hoveredNodeId ?? null;
    sigmaRef.current?.refresh();
  }, [hoveredNodeId]);
  useEffect(() => {
    selectRef.current = selectedNodeId ?? null;
    sigmaRef.current?.refresh();
  }, [selectedNodeId]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="Relations Map graph"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 520,
        background:
          'radial-gradient(ellipse at center, color-mix(in srgb, var(--muted) 35%, transparent) 0%, transparent 70%), var(--card)',
        borderRadius: 10,
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};

function addNode(g: Graph, n: RelationsNode) {
  if (g.hasNode(n.id)) return;
  g.addNode(n.id, {
    label: n.label,
    kind: n.kind,
    cluster: n.cluster,
    sector: n.sector,
    meta: n.meta,
    size: nodeSize(n.kind, n.weight),
    color: nodeColor(n.kind),
    x: Math.random(),
    y: Math.random(),
  });
}

function edgeKindLabel(k: RelationsEdge['kind']): string {
  switch (k) {
    case 'correlation': return 'correlation';
    case 'inverse-correlation': return 'inverse';
    case 'supplier': return 'supplier';
    case 'customer': return 'customer';
    case 'benchmark-dependency': return 'benchmark';
    case 'sector-dependency': return 'sector';
    case 'volatility-transmission': return 'vol transmit';
    case 'macro-dependency': return 'macro';
    case 'earnings-influence': return 'earnings';
    case 'thematic': return 'thematic';
    case 'artifact-link': return 'artifact';
    case 'historical': return 'historical';
    case 'regime': return 'regime';
  }
}

function getCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function fade(hexOrRgb: string, alpha: number): string {
  return `color-mix(in srgb, ${hexOrRgb} ${Math.round(alpha * 100)}%, transparent)`;
}
