/**
 * useScreener.ts — React hooks for the institutional market screener.
 *
 * Polling strategy:
 *  - Active tab, market open:  30s
 *  - Active tab, market closed: 5 min
 *  - Page hidden (document.hidden): paused
 *  - Manual refresh always available
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchScreenerRows,
  fetchMarketPulse,
  fetchHeatmapData,
  fetchExtendedHeatmapData,
  getMarketStatus,
  type DiscoveryTab,
  type ScreenerRow,
  type MarketPulseData,
  type HeatmapSector,
} from '../services/screenerService';

// ─── Visibility-aware polling ─────────────────────────────────────────────────

function usePolling(
  fn: () => Promise<void>,
  getInterval: () => number,
  deps: ReadonlyArray<unknown> = [],
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [tick, setTick] = useState(0);

  const trigger = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;

    const run = async () => {
      if (document.hidden) {
        // Don't run if tab is hidden — reschedule when visible again
        return;
      }
      await fnRef.current();
      timerId = setTimeout(run, getInterval());
    };

    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onVisible);

    run();

    return () => {
      clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return trigger;
}

function getPollingInterval(): number {
  const status = getMarketStatus();
  return status === 'open' ? 30_000 : 5 * 60_000;
}

// ─── useMarketPulse ───────────────────────────────────────────────────────────

export interface PulseState {
  data: MarketPulseData | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useMarketPulse(): PulseState {
  const [data, setData] = useState<MarketPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await fetchMarketPulse();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = usePolling(fetch, getPollingInterval, []);

  return { data, loading, error, refresh };
}

// ─── useScreenerRows ──────────────────────────────────────────────────────────

export interface ScreenerState {
  data: ScreenerRow[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useScreenerRows(tab: DiscoveryTab, pinnedSymbols: string[] = []): ScreenerState {
  const [data, setData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pinnedKey = pinnedSymbols.join(',');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchScreenerRows(tab, pinnedSymbols);
      setData(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pinnedKey]);

  const refresh = usePolling(fetch, getPollingInterval, [tab, pinnedKey]);

  // Reset data when tab changes to avoid flash of stale content
  useEffect(() => {
    setData([]);
    setLoading(true);
    setError(null);
  }, [tab]);

  return { data, loading, error, refresh };
}

// ─── useHeatmapData ───────────────────────────────────────────────────────────

export interface HeatmapState {
  data: HeatmapSector[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useHeatmapData(): HeatmapState {
  const [data, setData] = useState<HeatmapSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await fetchHeatmapData();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Heatmap refreshes slower — every 2x the normal interval
  const refresh = usePolling(fetch, () => getPollingInterval() * 2, []);

  return { data, loading, error, refresh };
}

// ─── useExtendedHeatmapData ───────────────────────────────────────────────────

export function useExtendedHeatmapData(): HeatmapState {
  const [data, setData] = useState<HeatmapSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      const result = await fetchExtendedHeatmapData();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = usePolling(fetch, () => getPollingInterval() * 2, []);

  return { data, loading, error, refresh };
}

// ─── useMarketMovers (added to hook layer for useMarket compatibility) ─────────

export { useMarketPulse as default };
