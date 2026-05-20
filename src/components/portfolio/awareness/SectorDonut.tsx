/**
 * SectorDonut — calm institutional SVG donut showing sector allocation.
 *
 * Pure SVG, no recharts. One slice per sector, ordered by weight desc.
 * Center shows the count of sectors. Slices have hairline separators.
 * No tooltips — the legend rows beside it carry the labels.
 */

import React, { useMemo } from 'react';

export interface SectorSlice {
  label: string;
  weight: number;        // 0..1
  contribution?: number; // optional — used for legend
}

interface Props {
  slices: SectorSlice[];
  size?: number;
}

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#6366f1',
  '#14b8a6',
  '#ec4899',
  '#f59e0b',
  '#84cc16',
  '#0ea5e9',
  '#a855f7',
];

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle - Math.PI / 2), cy + r * Math.sin(angle - Math.PI / 2)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, rOuter, start);
  const [x2, y2] = polar(cx, cy, rOuter, end);
  const [x3, y3] = polar(cx, cy, rInner, end);
  const [x4, y4] = polar(cx, cy, rInner, start);
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export const SectorDonut: React.FC<Props> = ({ slices, size = 180 }) => {
  const view = useMemo(() => {
    const total = slices.reduce((s, x) => s + Math.max(0, x.weight), 0);
    if (total <= 0 || slices.length === 0) return null;
    const cx = size / 2;
    const cy = size / 2;
    const rOuter = size / 2 - 4;
    const rInner = rOuter * 0.62;
    let acc = 0;
    const paths = slices.map((s, i) => {
      const start = (acc / total) * Math.PI * 2;
      acc += Math.max(0, s.weight);
      const end = (acc / total) * Math.PI * 2;
      return {
        d: arcPath(cx, cy, rOuter, rInner, start, end),
        color: PALETTE[i % PALETTE.length],
        label: s.label,
        pct: (s.weight / total) * 100,
      };
    });
    return { cx, cy, rOuter, rInner, paths, total };
  }, [slices, size]);

  if (!view) {
    return (
      <div style={{
        width: size, height: size,
        borderRadius: '50%',
        border: '1px dashed var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--muted-foreground)', fontSize: 10, textAlign: 'center', padding: 12,
      }}>
        No sector data
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Sector allocation donut">
      {view.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="var(--background)" strokeWidth={1} />
      ))}
      {/* Center label */}
      <g style={{ pointerEvents: 'none' }}>
        <text
          x={view.cx} y={view.cy - 2}
          textAnchor="middle" dominantBaseline="central"
          fontSize={11} fontWeight={700}
          fill="var(--foreground)"
        >
          {view.paths.length}
        </text>
        <text
          x={view.cx} y={view.cy + 14}
          textAnchor="middle" dominantBaseline="central"
          fontSize={8} fontWeight={700}
          fill="var(--muted-foreground)"
          letterSpacing={1.5}
        >
          SECTORS
        </text>
      </g>
    </svg>
  );
};

export { PALETTE as SECTOR_PALETTE };
