import React, { useEffect, useMemo, useRef } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { RelationsGraphSnapshot, RelationsNode, RelationsEdge } from '../../../lib/quant/relations/types';
import { nodeColor, nodeSize, edgeColor, edgeWidth } from './nodePalette';
import { applyRadialLayout, defaultCategories, type RadialCategory } from './radialLayout';

interface Props {
  snapshot: RelationsGraphSnapshot;
  /** Which node should be treated as the focal hub (centred). */
  focalId?: string | null;
  hoveredNodeId?: string | null;
  selectedNodeId?: string | null;
  onHoverNode?: (id: string | null) => void;
  onSelectNode?: (id: string | null) => void;
}

/**
 * Sigma renderer over a graphology graph laid out radially.
 *
 * Layout: focal at origin, sibling categories assigned to angular wedges
 * (Benchmarks top, Sector ETFs upper-right, Peers lower-right, Vol bottom,
 * Macro lower-left, Themes left). No force simulation, no perpetual refresh.
 *
 * Interaction: hover dims non-neighbours and surfaces the node to the
 * side panel via `onHoverNode`. Click selects; click on empty stage clears.
 */
export const RelationsGraphCanvas: React.FC<Props> = ({
  snapshot,
  focalId,
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
  const categoriesRef = useRef<RadialCategory[]>(defaultCategories());

  // Build the graph + layout when the snapshot identity changes.
  const { graph, focalUsed } = useMemo(() => {
    const g = new Graph({ multi: false, allowSelfLoops: false, type: 'undirected' });
    for (const n of snapshot.nodes) addNode(g, n);
    for (const e of snapshot.edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
      if (e.source === e.target) continue;
      if (g.hasEdge(e.source, e.target)) continue;
      g.addEdgeWithKey(e.id, e.source, e.target, {
        size: edgeWidth(e.strength),
        color: edgeColor(e.kind, e.strength),
        label: '',
        kind: e.kind,
        strength: e.strength,
        zScore: e.zScore,
      });
    }
    const assignment = applyRadialLayout(g, snapshot, { focalId: focalId ?? undefined });
    return { graph: g, focalUsed: assignment.focalId };
  }, [snapshot, focalId]);

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
      labelColor: { color: getCssVar('--foreground', '#1a1a1a') },
      labelGridCellSize: 70,
      labelRenderedSizeThreshold: 4,
      minCameraRatio: 0.3,
      maxCameraRatio: 3,
    });
    sigmaRef.current = sigma;

    sigma.setSetting('nodeReducer', (id, data) => {
      const d = { ...data } as Record<string, unknown> & { color?: string; size?: number; label?: string };
      const focusId = hoverRef.current ?? selectRef.current;
      if (focusId && focusId !== id && !graph.hasEdge(focusId, id) && !graph.hasEdge(id, focusId)) {
        d.color = fade(String(data.color ?? '#8b8b8b'), 0.22);
      }
      if (id === focalUsed) {
        d.size = (typeof data.size === 'number' ? data.size : 8) * 1.35;
      } else if (focusId === id) {
        d.size = (typeof data.size === 'number' ? data.size : 8) * 1.18;
      }
      return d as Record<string, unknown>;
    });

    sigma.setSetting('edgeReducer', (id, data) => {
      const d = { ...data } as Record<string, unknown> & { color?: string; size?: number; hidden?: boolean };
      const focusId = hoverRef.current ?? selectRef.current;
      if (focusId) {
        const [s, t] = graph.extremities(id);
        if (focusId !== s && focusId !== t) {
          d.color = fade(String(data.color ?? '#8b8b8b'), 0.08);
        } else {
          d.size = (typeof data.size === 'number' ? data.size : 1) * 1.5;
        }
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

  useEffect(() => {
    hoverRef.current = hoveredNodeId ?? null;
    sigmaRef.current?.refresh();
  }, [hoveredNodeId]);
  useEffect(() => {
    selectRef.current = selectedNodeId ?? null;
    sigmaRef.current?.refresh();
  }, [selectedNodeId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 540 }}>
      <div
        ref={hostRef}
        role="img"
        aria-label="Relations Map graph"
        style={{
          width: '100%',
          height: '100%',
          minHeight: 540,
          background:
            'radial-gradient(ellipse at center, color-mix(in srgb, var(--muted) 35%, transparent) 0%, transparent 70%), var(--card)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      />
      <CategoryOverlay categories={categoriesRef.current} />
    </div>
  );
};

/**
 * Renders the Bloomberg-style category labels around the perimeter.
 * Each label sits at the same angle as its category wedge so the user
 * can scan "Benchmarks / Peers / Macro" at a glance.
 */
const CategoryOverlay: React.FC<{ categories: RadialCategory[] }> = ({ categories }) => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {categories.map((c) => (
      <span
        key={c.id}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          // Use angular positioning at fixed visual radius (50% of half-min-side).
          transform: `translate(-50%, -50%) rotate(${c.angle}rad) translateX(46%) rotate(${-c.angle}rad)`,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          background: 'color-mix(in srgb, var(--card) 86%, transparent)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
        }}
      >
        {c.label}
      </span>
    ))}
  </div>
);

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
    x: 0,
    y: 0,
  });
}

function getCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function fade(hexOrRgb: string, alpha: number): string {
  return `color-mix(in srgb, ${hexOrRgb} ${Math.round(alpha * 100)}%, transparent)`;
}

// Re-export edge kind helper so existing consumers keep working.
export type { RelationsEdge };
