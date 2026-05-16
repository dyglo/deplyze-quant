import React, { useEffect, useMemo, useRef, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { RelationsGraphSnapshot, RelationsNode, RelationsEdge } from '../../../lib/quant/relations/types';
import { edgeColor, edgeWidth } from './nodePalette';
import { applyRadialLayout, defaultCategories, type RadialCategory } from './radialLayout';
import { NodeCardOverlay } from './NodeCardOverlay';
import { ClusterBackdrop } from './ClusterBackdrop';
import { SPOTLIGHT_KINDS, type SpotlightMode } from './OverlayControls';

interface Props {
  snapshot: RelationsGraphSnapshot;
  focalId?: string | null;
  hoveredNodeId?: string | null;
  selectedNodeId?: string | null;
  spotlight?: SpotlightMode;
  strengthThreshold?: number;
  onHoverNode?: (id: string | null) => void;
  onSelectNode?: (id: string | null) => void;
  onInspectNode?: (id: string) => void;
}

/**
 * Sigma renders the EDGES of the relationship graph; institutional
 * "node cards" are layered as a DOM overlay (see NodeCardOverlay) on
 * top so each node displays its full label + meta in a labelled box,
 * reinterpreting the Bloomberg relationship-map pattern in the Deplyze
 * design system. Sigma's own node fill is set transparent — sigma still
 * owns layout, hit-testing, and edge rendering.
 */
export const RelationsGraphCanvas: React.FC<Props> = ({
  snapshot,
  focalId,
  hoveredNodeId,
  selectedNodeId,
  spotlight = 'none',
  strengthThreshold = 0,
  onHoverNode,
  onSelectNode,
  onInspectNode,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [sigmaInst, setSigmaInst] = useState<Sigma | null>(null);
  const hoverRef = useRef<string | null>(null);
  const selectRef = useRef<string | null>(null);
  const spotlightRef = useRef<SpotlightMode>(spotlight);
  const thresholdRef = useRef<number>(strengthThreshold);
  const categories = useRef<RadialCategory[]>(defaultCategories()).current;

  // Sync spotlight + threshold into refs so edgeReducer sees fresh values
  // without rebuilding the graph. Refresh forces reducers to re-run.
  useEffect(() => { spotlightRef.current = spotlight; sigmaRef.current?.refresh(); }, [spotlight]);
  useEffect(() => { thresholdRef.current = strengthThreshold; sigmaRef.current?.refresh(); }, [strengthThreshold]);

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

  useEffect(() => {
    if (!hostRef.current) return;
    const sigma = new Sigma(graph, hostRef.current, {
      renderEdgeLabels: false,
      defaultEdgeType: 'line',
      // Disable sigma's own node labels — DOM cards carry them.
      renderLabels: false,
      labelGridCellSize: 70,
      labelRenderedSizeThreshold: 1e9,
      minCameraRatio: 0.3,
      maxCameraRatio: 3,
    });
    sigmaRef.current = sigma;
    setSigmaInst(sigma);

    sigma.setSetting('nodeReducer', (_id, data) => {
      // Render nodes as invisible anchors — cards do the visuals.
      return { ...data, color: 'rgba(0,0,0,0)', size: 1 } as Record<string, unknown>;
    });

    sigma.setSetting('edgeReducer', (id, data) => {
      const d = { ...data } as Record<string, unknown> & { color?: string; size?: number; hidden?: boolean };
      const focusId = hoverRef.current ?? selectRef.current;
      const kind = data.kind as string | undefined;
      const strength = typeof data.strength === 'number' ? data.strength : 0;
      const spot = spotlightRef.current;
      const thresh = thresholdRef.current;

      // Hide edges below strength threshold.
      if (Math.abs(strength) < thresh) { d.hidden = true; return d as Record<string, unknown>; }

      // Spotlight dimming: edges outside the selected family fade.
      const spotKinds = SPOTLIGHT_KINDS[spot];
      const inSpotlight = spotKinds.length === 0 || (kind && spotKinds.includes(kind as never));
      if (!inSpotlight) {
        d.color = fade(String(data.color ?? '#8b8b8b'), 0.07);
      }

      if (focusId) {
        const [s, t] = graph.extremities(id);
        if (focusId !== s && focusId !== t) {
          d.color = fade(String(data.color ?? '#8b8b8b'), 0.06);
        } else {
          d.size = (typeof data.size === 'number' ? data.size : 1) * 1.55;
        }
      }
      return d as Record<string, unknown>;
    });

    const handleStageClick = () => { selectRef.current = null; onSelectNode?.(null); sigma.refresh(); };
    sigma.on('clickStage', handleStageClick);

    return () => {
      sigma.removeAllListeners();
      sigma.kill();
      sigmaRef.current = null;
      setSigmaInst(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Sync hover/select into sigma reducers so edges respond.
  useEffect(() => {
    hoverRef.current = hoveredNodeId ?? null;
    sigmaRef.current?.refresh();
  }, [hoveredNodeId]);
  useEffect(() => {
    selectRef.current = selectedNodeId ?? null;
    sigmaRef.current?.refresh();
  }, [selectedNodeId]);

  // Map active spotlight onto the matching backdrop wedge id, if any.
  const highlightCategoryId = spotlightToCategory(spotlight);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 540 }}>
      <ClusterBackdrop categories={categories} highlightCategoryId={highlightCategoryId} />
      <div
        ref={hostRef}
        role="img"
        aria-label="Relations Map graph"
        style={{
          width: '100%',
          height: '100%',
          minHeight: 540,
          background: 'transparent',
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
        }}
      />
      <NodeCardOverlay
        sigma={sigmaInst}
        graph={graph}
        snapshot={snapshot}
        focalId={focalUsed ?? null}
        hoveredId={hoveredNodeId ?? null}
        selectedId={selectedNodeId ?? null}
        spotlight={spotlight}
        onSelect={(id) => onSelectNode?.(id)}
        onHover={(id) => onHoverNode?.(id)}
        onInspect={(id) => onInspectNode?.(id)}
      />
      <CategoryOverlay categories={categories} />
    </div>
  );
};

const CategoryOverlay: React.FC<{ categories: RadialCategory[] }> = ({ categories }) => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {categories.map((c) => (
      <span
        key={c.id}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) rotate(${c.angle}rad) translateX(46%) rotate(${-c.angle}rad)`,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          background: 'color-mix(in srgb, var(--card) 88%, transparent)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '3px 9px',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(2px)',
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
    // size only used by sigma for hit-testing; cards do visuals.
    size: 8,
    color: 'rgba(0,0,0,0)',
    x: 0,
    y: 0,
  });
}

function fade(hexOrRgb: string, alpha: number): string {
  return `color-mix(in srgb, ${hexOrRgb} ${Math.round(alpha * 100)}%, transparent)`;
}

/** Map a spotlight selection to the backdrop wedge that should stay lit. */
function spotlightToCategory(spot: SpotlightMode): string | null {
  switch (spot) {
    case 'benchmark':   return 'benchmarks';
    case 'volatility':  return 'volatility';
    case 'macro':       return 'macro';
    case 'sector':      return 'sector';
    case 'inverse':
    case 'correlation':
    case 'none':
    default:
      return null;
  }
}

export type { RelationsEdge };
