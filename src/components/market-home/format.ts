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

/** Normalize BigQuery-style `{ value }` timestamps or plain strings. */
export function tsValue(v: { value: string } | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.value;
}

export function fmtDayLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Best-effort country for a symbol, for flag rendering. Pairs (BTC/USD, EUR/USD,
 * XAU/USD) have no single country → null. Our equity/ETF universes are US-listed.
 */
export function symbolCountry(symbol: string): string | null {
  if (!symbol || symbol.includes('/')) return null;
  return 'US';
}

/** Strip common markdown emphasis/inline markers so summaries read as plain text. */
export function stripMarkdown(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold (underscore)
    .replace(/`([^`]+)`/g, '$1')        // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/[*_`#>]/g, '')            // stray markers
    .replace(/\s+/g, ' ')
    .trim();
}

export function relTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
