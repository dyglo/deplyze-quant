/**
 * useDashboardNarratives — fetches the active narrative themes from the
 * gateway and filters by symbol universe. Themes whose `related_symbols`
 * intersect the dashboard's symbols are surfaced.
 *
 * Strict-real-data: returns empty silently when the gateway has no themes
 * or when offline. Empty states are handled by the UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchNarrativeMemory, type NarrativeMemoryRow } from '../services/v3p2Service';

export interface DashboardNarrative {
  themeId: string;
  label: string;
  /** lifetime_score from the warehouse, kept on a 0..1 scale where possible. */
  strength: number;
  /** Polarity (negative = bearish, positive = bullish, null = neutral). */
  polarity: number | null;
  symbols: string[];
  /** Hours since last seen, for recency UI. */
  lastSeenHoursAgo: number | null;
}

export interface UseDashboardNarrativesReturn {
  narratives: DashboardNarrative[];
  loading: boolean;
  error: string | null;
}

const MAX_PER_DASHBOARD = 6;

function parseTs(raw: NarrativeMemoryRow['last_seen_at']): number | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === 'object' && 'value' in raw && raw.value) {
    const t = Date.parse(raw.value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function normaliseScore(raw: number): number {
  // lifetime_score is unbounded in the warehouse; squash to 0..1 via tanh
  // so the UI can render strength chips consistently.
  return Math.tanh(Math.max(0, raw) / 5);
}

export function useDashboardNarratives(symbolSet: string[] | null): UseDashboardNarrativesReturn {
  const [rows, setRows] = useState<NarrativeMemoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchNarrativeMemory({ limit: 100, min_lifetime: 0 })
      .then((items) => {
        if (cancelled) return;
        setRows(items);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setRows([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo<DashboardNarrative[]>(() => {
    if (!rows) return [];
    const allow = symbolSet && symbolSet.length > 0
      ? new Set(symbolSet.map((s) => s.toUpperCase()))
      : null;

    const matching = rows.filter((r) => {
      if (!allow) return true;
      const related = r.related_symbols ?? [];
      return related.some((s) => allow.has(s.toUpperCase()));
    });

    return matching
      .sort((a, b) => b.lifetime_score - a.lifetime_score)
      .slice(0, MAX_PER_DASHBOARD)
      .map((r): DashboardNarrative => {
        const ts = parseTs(r.last_seen_at);
        return {
          themeId: r.theme_id,
          label: r.theme_label,
          strength: normaliseScore(r.lifetime_score),
          polarity: r.polarity_mean,
          symbols: r.related_symbols ?? [],
          lastSeenHoursAgo: ts != null ? (Date.now() - ts) / 3_600_000 : null,
        };
      });
  }, [rows, symbolSet]);

  return { narratives: filtered, loading, error };
}
