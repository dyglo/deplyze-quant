import React from 'react';
import type { RadialCategory } from './radialLayout';

interface Props {
  categories: RadialCategory[];
  /** Spotlight mode dims non-matching wedges. */
  highlightCategoryId?: string | null;
}

/**
 * Translucent wedge backdrops sitting behind the sigma canvas, one per
 * radial category. The wedges are drawn as SVG ring-segments so the
 * institutional clustering reads at-a-glance even when no edges are
 * being highlighted. Dotted boundary arcs separate adjacent categories
 * Bloomberg-style without copying its colour palette.
 *
 * Each backdrop spans the inner & outer radius implied by its
 * category radius (centered around it ± padding). All shapes use
 * theme-aware colour mixes so light/dark themes both look clean.
 */
export const ClusterBackdrop: React.FC<Props> = ({ categories, highlightCategoryId }) => {
  // SVG viewBox covers a [-VB, VB] square; layout was authored in
  // approximately the same coordinate space (focal at origin, max
  // radius ~460). We expand to 600 to leave breathing room.
  const VB = 600;

  return (
    <svg
      viewBox={`-${VB} -${VB} ${VB * 2} ${VB * 2}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.95,
      }}
    >
      {categories.map((c) => {
        const dim = highlightCategoryId && highlightCategoryId !== c.id;
        const innerR = Math.max(70, c.radius - 110);
        const outerR = c.radius + 110;
        const startAngle = c.angle - c.spread - 0.06;
        const endAngle   = c.angle + c.spread + 0.06;
        const path = wedgePath(innerR, outerR, startAngle, endAngle);
        return (
          <g key={c.id} style={{ opacity: dim ? 0.18 : 1 }}>
            <path
              d={path}
              fill="color-mix(in srgb, var(--muted-foreground) 6%, transparent)"
              stroke="color-mix(in srgb, var(--border) 55%, transparent)"
              strokeWidth={1}
              strokeDasharray="3 5"
            />
          </g>
        );
      })}
      {/* Inner protected halo around the focal node. */}
      <circle r={64} fill="color-mix(in srgb, var(--background) 80%, transparent)" stroke="color-mix(in srgb, var(--border) 50%, transparent)" strokeWidth={1} />
    </svg>
  );
};

/** Build a ring-segment (annulus wedge) SVG path. Angles in radians. */
function wedgePath(rIn: number, rOut: number, a0: number, a1: number): string {
  const p1 = polar(rOut, a0);
  const p2 = polar(rOut, a1);
  const p3 = polar(rIn,  a1);
  const p4 = polar(rIn,  a0);
  const largeOuter = a1 - a0 > Math.PI ? 1 : 0;
  const largeInner = a1 - a0 > Math.PI ? 1 : 0;
  // Outer arc forward, line to inner end, inner arc backward, close.
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOut} ${rOut} 0 ${largeOuter} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rIn} ${rIn} 0 ${largeInner} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

function polar(r: number, theta: number): { x: number; y: number } {
  return { x: Math.cos(theta) * r, y: Math.sin(theta) * r };
}
