/**
 * semanticPalette — the single source of truth for semantic color in the UI.
 *
 * Every color here resolves to the design-token system in `index.css`
 * (the warm Claude-inspired palette + the gain/loss pair + severity ramp),
 * so it stays theme-aware (light/dark) and on-brand. Components must import
 * from here instead of hardcoding hexes like #22c55e / #ef4444 / #6366f1.
 *
 * Values are CSS custom-property references; they work in inline styles and
 * in recharts SVG props (fill/stroke) alike.
 */

// ─── Performance (gain / loss) ──────────────────────────────────────────────
export const PERF = {
  gain: 'var(--ds-gain)',
  loss: 'var(--ds-loss)',
  gainMuted: 'var(--ds-gain-muted)',
  lossMuted: 'var(--ds-loss-muted)',
} as const;

/** Returns the gain or loss color for a signed value (0 counts as gain/flat). */
export function perfColor(value: number): string {
  return value < 0 ? PERF.loss : PERF.gain;
}

// ─── Warning / gold (matches .ds-dot-warning / .ds-sev-medium) ───────────────
export const WARNING = '#C9A227';
export const WARNING_BG = 'rgba(201,162,39,0.10)';

// ─── Severity ramp ──────────────────────────────────────────────────────────
export type Severity = 'high' | 'medium' | 'low' | 'info';

export const SEVERITY: Record<Severity, { color: string; bg: string; label: string }> = {
  high:   { color: 'var(--ds-loss)',  bg: 'var(--ds-loss-muted)', label: 'HIGH' },
  medium: { color: WARNING,           bg: WARNING_BG,             label: 'MED' },
  low:    { color: 'var(--chart-2)',  bg: 'rgba(120,140,93,0.10)', label: 'LOW' },
  info:   { color: 'var(--chart-3)',  bg: 'rgba(106,155,204,0.10)', label: 'INFO' },
};

export function severityConfig(sev: string | null | undefined) {
  return SEVERITY[(sev as Severity) in SEVERITY ? (sev as Severity) : 'info'];
}

// ─── Domain accents ─────────────────────────────────────────────────────────
// Calm, restrained mapping — institutional feeds differentiate by tone, not by
// a rainbow of saturated hues. Domains share a small palette-derived set.
export function domainAccent(domain: string): string {
  switch (domain) {
    case 'macro':
    case 'regime':
    case 'opportunity':
      return 'var(--primary)';      // terracotta
    case 'risk':
    case 'volatility':
      return 'var(--ds-loss)';      // brick red
    case 'liquidity':
    case 'earnings':
      return 'var(--chart-2)';      // olive
    case 'cross_asset':
    case 'sentiment':
      return 'var(--chart-3)';      // slate-blue
    default:
      return 'var(--muted-foreground)';
  }
}

// ─── Categorical palette (donuts, multi-series) ─────────────────────────────
// Distinct but palette-consistent slices. Cycles for long category lists.
export const CATEGORICAL: string[] = [
  'var(--chart-1)',   // terracotta
  'var(--chart-2)',   // olive
  'var(--chart-3)',   // slate-blue
  WARNING,            // gold
  'var(--chart-4)',   // taupe
  'var(--chart-5)',   // ink
  'var(--ds-loss)',   // brick red
  'var(--ds-gain)',   // gain green
];

export function categoricalColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length];
}

// ─── Rating ramp (diverging sell → buy) ─────────────────────────────────────
// Warm, on-palette diverging scale for analyst-rating / technical-signal views.
export const RATING = {
  strongSell: 'var(--ds-loss)',
  sell:       '#B85C2A',          // burnt orange (matches .ds-sev-high)
  neutral:    WARNING,            // gold
  buy:        'var(--chart-2)',   // olive
  strongBuy:  'var(--ds-gain)',
} as const;

/** Diverging gradient string for rating/score bars (sell → buy). */
export const RATING_GRADIENT =
  `linear-gradient(to right, ${RATING.strongSell} 0%, ${RATING.sell} 25%, ${RATING.neutral} 50%, ${RATING.buy} 75%, ${RATING.strongBuy} 100%)`;
