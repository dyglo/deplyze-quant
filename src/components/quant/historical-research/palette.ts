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

// Muted institutional palette. Each tone sits in the mid-lightness band so no
// series visually dominates when 4+ are overlaid, and the colours echo the
// design-system accents already used in the rest of the workspace (slate-blue,
// olive, tan, plum) rather than competing with them.
export const SERIES_PALETTE: readonly string[] = [
  '#5B6B8E', // Slate blue
  '#A04848', // Brick
  '#4E6040', // Olive
  '#A87C4F', // Tan
  '#A05A2E', // Rust
  '#7A5D9E', // Heather violet
  '#3F7570', // Pine teal
  '#8E5B7E', // Plum
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
