import React, { useEffect, useState } from 'react';
import type Sigma from 'sigma';
import type Graph from 'graphology';
import type { RelationsGraphSnapshot, RelationsNode } from '../../../lib/quant/relations/types';
import { nodeColor } from './nodePalette';
import { SPOTLIGHT_KINDS, type SpotlightMode } from './OverlayControls';

interface Props {
  sigma: Sigma | null;
  graph: Graph | null;
  snapshot: RelationsGraphSnapshot;
  focalId: string | null;
  hoveredId: string | null;
  selectedId: string | null;
  spotlight?: SpotlightMode;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onInspect?: (id: string) => void;
}

/**
 * DOM overlay of institutional "node cards" laid on top of the sigma
 * canvas. Each card is positioned by translating the node's graph
 * coordinates through `sigma.graphToViewport`, then re-positioning on
 * every camera update so panning and zooming stay in sync.
 *
 * Sigma underneath renders edges only; node fill is set to transparent
 * via the reducer in RelationsGraphCanvas. The cards inherit the
 * Deplyze design system and visually reinterpret the Bloomberg
 * labelled-box pattern without copying its colour palette.
 */
export const NodeCardOverlay: React.FC<Props> = ({
  sigma,
  graph,
  snapshot,
  focalId,
  hoveredId,
  selectedId,
  spotlight = 'none',
  onSelect,
  onHover,
  onInspect,
}) => {
  const [, force] = useState(0);

  // Re-render on camera moves so cards track pan / zoom.
  useEffect(() => {
    if (!sigma) return;
    const tick = () => force((v) => v + 1);
    const cam = sigma.getCamera();
    cam.on('updated', tick);
    sigma.on('afterRender', tick);
    return () => {
      cam.removeListener('updated', tick);
      sigma.removeListener('afterRender', tick);
    };
  }, [sigma]);

  if (!sigma || !graph) return null;

  const focus = hoveredId ?? selectedId;
  // Pre-compute the set of node ids touched by a spotlight-matching edge,
  // so non-participating cards can dim alongside their edges.
  const spotKinds = SPOTLIGHT_KINDS[spotlight];
  const spotlightActive = spotKinds.length > 0;
  const spotlightNodeIds = new Set<string>();
  if (spotlightActive) {
    for (const e of snapshot.edges) {
      if (spotKinds.includes(e.kind)) {
        spotlightNodeIds.add(e.source);
        spotlightNodeIds.add(e.target);
      }
    }
    if (focalId) spotlightNodeIds.add(focalId);
  }
  const cameraRatio = sigma.getCamera().getState().ratio;
  // Scale card font + padding with zoom, clamped to a usable range.
  const zoom = Math.max(0.4, Math.min(1.6, 1 / cameraRatio));

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {snapshot.nodes.map((n) => {
        if (!graph.hasNode(n.id)) return null;
        const { x, y } = graph.getNodeAttributes(n.id) as { x: number; y: number };
        const vp = sigma.graphToViewport({ x, y });
        const isFocal = n.id === focalId;
        const isFocus = focus === n.id;
        const dimByFocus = focus && focus !== n.id
          && !graph.hasEdge(focus, n.id)
          && !graph.hasEdge(n.id, focus);
        const dimBySpotlight = spotlightActive && !spotlightNodeIds.has(n.id);
        const dim = !!(dimByFocus || dimBySpotlight);
        return (
          <NodeCard
            key={n.id}
            node={n}
            x={vp.x}
            y={vp.y}
            zoom={zoom}
            isFocal={isFocal}
            isFocus={isFocus}
            dim={!!dim}
            onClick={(shift) => {
              if (shift && onInspect) onInspect(n.id);
              else onSelect(n.id);
            }}
            onMouseEnter={() => onHover(n.id)}
            onMouseLeave={() => onHover(null)}
            onInspect={onInspect ? () => onInspect(n.id) : undefined}
          />
        );
      })}
    </div>
  );
};

interface CardProps {
  node: RelationsNode;
  x: number;
  y: number;
  zoom: number;
  isFocal: boolean;
  isFocus: boolean;
  dim: boolean;
  onClick: (shiftKey: boolean) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onInspect?: () => void;
}

const NodeCard: React.FC<CardProps> = ({
  node, x, y, zoom, isFocal, isFocus, dim, onClick, onMouseEnter, onMouseLeave, onInspect,
}) => {
  const accent = nodeColor(node.kind);
  // Focal node gets a larger, primary-coloured card. Companies/ETFs
  // get standard cards; macro / vol / theme get accent stripes only.
  const w = (isFocal ? 138 : 96) * zoom;
  const h = (isFocal ? 60 : 40) * zoom;
  const fontPrimary = (isFocal ? 13 : 11) * zoom;
  const fontMeta = 9 * zoom;
  // 0.55 keeps dimmed cards legible in dark mode; 0.32 made them
  // effectively invisible against a dark --card background.
  const opacity = dim ? 0.55 : 1;

  return (
    <button
      onClick={(e) => onClick(e.shiftKey)}
      onDoubleClick={(e) => { e.preventDefault(); onInspect?.(); }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        width: w,
        height: h,
        padding: 0,
        border: `1px solid ${isFocal
          ? 'var(--primary)'
          : isFocus
            ? 'color-mix(in srgb, var(--primary) 40%, var(--border))'
            : 'color-mix(in srgb, var(--border) 90%, var(--foreground))'}`,
        background: isFocal
          ? 'color-mix(in srgb, var(--primary) 9%, var(--card))'
          : isFocus
            ? 'color-mix(in srgb, var(--primary) 5%, var(--card))'
            : 'var(--card)',
        boxShadow: isFocal
          ? '0 6px 18px color-mix(in srgb, var(--primary) 22%, transparent), 0 1px 4px color-mix(in srgb, var(--foreground) 15%, transparent)'
          : isFocus
            ? '0 2px 10px color-mix(in srgb, var(--foreground) 16%, transparent)'
            : '0 1px 4px color-mix(in srgb, var(--foreground) 12%, transparent)',
        borderRadius: 6 * zoom,
        cursor: 'pointer',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
        opacity,
        transition: 'opacity 120ms linear',
        textAlign: 'left',
      }}
      title={`${node.label}${node.meta ? ' — ' + node.meta : ''}`}
    >
      {/* Accent stripe — kind-coloured. */}
      <span style={{
        width: 3 * zoom,
        background: accent,
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: `${4 * zoom}px ${8 * zoom}px`,
        minWidth: 0,
      }}>
        <span style={{
          fontSize: fontPrimary,
          fontWeight: isFocal ? 700 : 600,
          color: 'var(--foreground)',
          letterSpacing: '-0.005em',
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>{node.label}</span>
        {(node.meta || isFocal) && (
          <span style={{
            fontSize: fontMeta,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginTop: 1 * zoom,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {node.meta ?? KIND_SHORT[node.kind]}
          </span>
        )}
      </span>
    </button>
  );
};

const KIND_SHORT: Record<RelationsNode['kind'], string> = {
  'company':      'Company',
  'etf':          'ETF',
  'index':        'Index',
  'sector':       'Sector',
  'currency':     'FX',
  'commodity':    'Commodity',
  'treasury':    'Rates',
  'macro':        'Macro',
  'vol-regime':   'Vol',
  'artifact':     'Artifact',
  'benchmark':    'Benchmark',
  'theme':        'Theme',
  'earnings':     'Earnings',
  'news-cluster': 'News',
};
