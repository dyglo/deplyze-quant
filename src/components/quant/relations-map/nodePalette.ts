/**
 * Theme-aware palette for Relations Map nodes + edges.
 *
 * Reads from the Deplyze design tokens (`--primary`, `--chart-1..5`,
 * `--muted-foreground`, …) at call-time so the graph adapts on theme toggle
 * without re-mounting sigma. Edge colour follows kind + sign of strength so
 * a single glance communicates whether a relationship is supportive, inverse,
 * or transmissive.
 */
import type { NodeKind, EdgeKind } from '../../../lib/quant/relations/types';

const cssVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

export function nodeColor(kind: NodeKind): string {
  switch (kind) {
    case 'company':      return cssVar('--chart-1', '#c15f3c');
    case 'etf':          return cssVar('--chart-2', '#6b8a6a');
    case 'index':
    case 'benchmark':    return cssVar('--primary', '#c15f3c');
    case 'sector':       return cssVar('--chart-3', '#b08a3e');
    case 'currency':     return cssVar('--chart-4', '#7a8aa6');
    case 'commodity':    return cssVar('--chart-5', '#a08068');
    case 'treasury':
    case 'macro':        return cssVar('--chart-4', '#7a8aa6');
    case 'vol-regime':   return cssVar('--destructive', '#b85c3c');
    case 'artifact':     return cssVar('--primary', '#c15f3c');
    case 'theme':        return cssVar('--chart-3', '#b08a3e');
    case 'earnings':     return cssVar('--chart-1', '#c15f3c');
    case 'news-cluster': return cssVar('--muted-foreground', '#8b8b8b');
    default:             return cssVar('--muted-foreground', '#8b8b8b');
  }
}

export function nodeSize(kind: NodeKind, weight?: number): number {
  const base =
    kind === 'benchmark' || kind === 'index' ? 14 :
    kind === 'theme' || kind === 'vol-regime' ? 12 :
    kind === 'macro' || kind === 'treasury' ? 10 :
    kind === 'company' || kind === 'etf' || kind === 'commodity' ? 9 :
    8;
  const w = weight ?? 0;
  return base + Math.min(6, Math.max(0, w * 6));
}

/**
 * Edge color combines kind + sign. Inverse / transmission kinds always render
 * in the destructive tone; correlation respects the sign of `strength`.
 */
export function edgeColor(kind: EdgeKind, strength: number): string {
  const positive = cssVar('--chart-2', '#6b8a6a');
  const negative = cssVar('--destructive', '#b85c3c');
  const neutral  = cssVar('--muted-foreground', '#8b8b8b');
  const supplier = cssVar('--chart-3', '#b08a3e');
  const macro    = cssVar('--chart-4', '#7a8aa6');
  const theme    = cssVar('--chart-1', '#c15f3c');

  switch (kind) {
    case 'inverse-correlation':
    case 'volatility-transmission':
      return negative;
    case 'correlation':
      return strength >= 0 ? positive : negative;
    case 'supplier':
    case 'customer':
      return supplier;
    case 'macro-dependency':
    case 'regime':
      return macro;
    case 'thematic':
    case 'earnings-influence':
    case 'sector-dependency':
    case 'benchmark-dependency':
      return theme;
    case 'artifact-link':
    case 'historical':
      return neutral;
    default:
      return neutral;
  }
}

/** Edge width scales with absolute strength (capped). */
export function edgeWidth(strength: number): number {
  const a = Math.min(1, Math.abs(strength));
  return 0.4 + a * 2.2;
}
