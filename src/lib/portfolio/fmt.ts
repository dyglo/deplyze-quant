/** Shared number formatting for Portfolio Intelligence pages. */

export function fmtPct(v: number, sign = true): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return sign && v >= 0 ? `+${s}%` : `${s}%`;
}

export function fmtUSD(v: number): string {
  if (!isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '+';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtValue(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/**
 * Returns "−14.82% / −$74.1K" when totalValue is set,
 * or "−14.82%" alone when it is not.
 */
export function fmtBoth(fraction: number, totalValue: number | undefined, sign = true): string {
  const pct = fmtPct(fraction, sign);
  if (totalValue == null) return pct;
  return `${pct} / ${fmtUSD(fraction * totalValue)}`;
}
