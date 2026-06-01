import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cacheGet,
  cachePeek,
  isStale as cacheIsStale,
  type FreshnessStatus,
} from '../services/gatewayClient';

export interface SWRState<T> {
  data: T | null;
  isFetching: boolean;
  /** Back-compat alias for older call sites that destructure `loading`. */
  loading: boolean;
  error: Error | null;
  fetchedAt: number | null;
  isStale: boolean;
  status: FreshnessStatus;
  refresh: () => void;
}

interface LocalEntry<T = unknown> {
  data: T;
  fetchedAt: number;
}

const localCache = new Map<string, LocalEntry>();
const STORAGE_PREFIX = 'deplyze:swr:';

function readLocal<T>(key?: string): LocalEntry<T> | undefined {
  if (!key) return undefined;
  const hot = localCache.get(key) as LocalEntry<T> | undefined;
  if (hot) return hot;
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as LocalEntry<T>;
    if (!parsed || parsed.data == null || !Number.isFinite(parsed.fetchedAt)) return undefined;
    localCache.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function writeLocal<T>(key: string | undefined, data: T): void {
  if (!key) return;
  const entry: LocalEntry<T> = { data, fetchedAt: Date.now() };
  localCache.set(key, entry);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Session storage is best-effort. In-memory cache still preserves SPA navigation.
  }
}

/**
 * useSWR — stale-while-revalidate hook.
 *
 * If `cacheKey` is provided AND `gatewayClient`'s shared cache has an entry for
 * that key, the first render returns that cached value immediately (no
 * spinner). Then it kicks off a background revalidation. Errors do not clobber
 * a previously good value — they surface in `error` while `data` remains.
 */
export function useSWR<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  opts: { cacheKey?: string } = {},
): SWRState<T> {
  const localEntry = readLocal<T>(opts.cacheKey);
  const initialCached = opts.cacheKey ? cachePeek<T>(opts.cacheKey) ?? localEntry?.data ?? null : null;
  const initialEntry = opts.cacheKey ? cacheGet<T>(opts.cacheKey) : undefined;

  const [data, setData] = useState<T | null>(initialCached);
  const [error, setError] = useState<Error | null>(null);
  const [isFetching, setIsFetching] = useState(initialCached == null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(initialEntry?.fetchedAt ?? localEntry?.fetchedAt ?? null);
  const [status, setStatus] = useState<FreshnessStatus>(
    initialCached != null ? (initialEntry ? (cacheIsStale(initialEntry) ? 'stale' : 'cached') : 'stale') : 'live',
  );
  const [tick, setTick] = useState(0);

  const cancelled = useRef(false);
  const fetcherRef = useRef(fetcher);
  const dataRef = useRef<T | null>(initialCached);
  fetcherRef.current = fetcher;
  dataRef.current = data;

  useEffect(() => {
    cancelled.current = false;
    setIsFetching(true);
    setError(null);
    fetcherRef.current()
      .then((v) => {
        if (cancelled.current) return;
        setData(v);
        dataRef.current = v;
        setFetchedAt(Date.now());
        setStatus('live');
        setIsFetching(false);
        writeLocal(opts.cacheKey, v);
      })
      .catch((e: unknown) => {
        if (cancelled.current) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        setIsFetching(false);
        // Keep last good data; flag as stale if we had a cached value.
        if (dataRef.current != null) setStatus('stale');
        else setStatus('error');
      });
    return () => { cancelled.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // `loading` is true on the very first fetch (no data yet). Subsequent
  // background refetches surface via `isFetching` only, so pages with cached
  // data render immediately without a spinner.
  const loading = isFetching && data == null;

  return {
    data,
    isFetching,
    loading,
    error,
    fetchedAt,
    isStale: status === 'stale',
    status,
    refresh,
  };
}
