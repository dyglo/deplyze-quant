/**
 * Shared deterministic palette mapping regime keys → colors.
 *
 * Visual Capitalist's sector-stream chart works because each sector keeps
 * the same color throughout the timeline. We mirror that: any regime key
 * (e.g. "up|compressed|risk-on") maps to a stable color via a small hash,
 * so the RegimeRibbon and PriceWithRegime background bands always agree.
 */

const PALETTE = [
  'var(--chart-2)',     // sage
  'var(--chart-3)',     // blue
  'var(--chart-1)',     // terracotta
  '#C7884A',            // amber
  '#4E6040',            // forest
  'var(--chart-4)',     // taupe
];

export function paletteForRegime(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}
