import React, { useMemo } from 'react';

/**
 * Sparkline — minimal inline SVG line chart for tile-sized contexts.
 * No axis, no labels. Auto-scales to its container width via viewBox.
 */
export const Sparkline: React.FC<{
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}> = ({ values, width = 120, height = 36, color, fill, strokeWidth = 1.5 }) => {
  const path = useMemo(() => {
    if (!values.length) return { line: '', area: '', up: true };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : width;
    const pts = values.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const area = `${line} L${(pts[pts.length - 1][0]).toFixed(2)},${height} L0,${height} Z`;
    return { line, area, up: values[values.length - 1] >= values[0] };
  }, [values, width, height]);

  if (!values.length) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 9, opacity: 0.5 }}>
        no data
      </div>
    );
  }

  const stroke = color ?? (path.up ? '#4E6040' : 'var(--primary)');
  const areaFill = fill ?? `color-mix(in srgb, ${stroke} 14%, transparent)`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={path.area} fill={areaFill} stroke="none" />
      <path d={path.line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};
