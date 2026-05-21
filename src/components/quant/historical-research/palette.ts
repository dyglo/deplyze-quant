/**
 * Series palette for Historical Research widgets.
 *
 * Eight institutional-but-distinct colors, chosen for legibility when 4+ series
 * are overlaid (normalized chart, drawdown, rolling vol, etc.). Balanced
 * lightness so no single series dominates the visual hierarchy.
 *
 * Theme variables (`var(--primary)`, accents) are reserved for chrome
 * (buttons, KPI deltas, recession bands); never used as a series color.
 */

export const SERIES_PALETTE: readonly string[] = [
  '#2563EB', // Blue
  '#DC2626', // Red
  '#16A34A', // Green
  '#F59E0B', // Amber
  '#EA580C', // Orange
  '#8B5CF6', // Violet
  '#0D9488', // Teal
  '#DB2777', // Pink
] as const;

/** Pick a stable color by series index. Wraps if there are more series than colors. */
export function seriesColor(i: number): string {
  return SERIES_PALETTE[i % SERIES_PALETTE.length];
}

/**
 * Translucent (rgba with alpha) variant of a hex color, used for area-chart
 * gradients and category-tinted overlays.
 */
export function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
