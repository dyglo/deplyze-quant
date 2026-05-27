export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) < 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${fmtPrice(n)}`;
}

/** Olive gain / terracotta loss palette, matching the design tokens. */
export function deltaColor(pct: number): string {
  if (!Number.isFinite(pct) || pct === 0) return 'var(--muted-foreground)';
  return pct > 0 ? '#4E6040' : 'var(--primary)';
}
