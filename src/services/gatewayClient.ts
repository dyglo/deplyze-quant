/**
 * gatewayClient.ts — typed JSON client for the Deplyze Quant gateway.
 *
 * Requests do not create an authenticated session or attach credentials. In dev the call goes to `/api/v1/...` which Vite proxies
 * to a locally-running gateway (see vite.config.ts). In prod the same `/api`
 * path is mapped to the deployed gateway by Firebase Hosting rewrites or a
 * Cloud Run reverse proxy.
 *
 * Adds:
 *   - In-memory TTL cache (per cacheKey)
 *   - In-flight request deduplication
 *   - Freshness metadata via gatewayGetMeta()
 */


const PREFIX = '/api/v1';
const FETCH_TIMEOUT_MS = 30_000;

export class GatewayError extends Error {
  public code?: string;

  constructor(public status: number, message: string, public body?: unknown) {
    super(sanitizeGatewayMessage(status, message, body));
    this.name = 'GatewayError';
    if (typeof body === 'object' && body && 'code' in body) {
      this.code = String((body as { code: unknown }).code);
    }
  }
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeGatewayMessage(status: number, message: string, body?: unknown): string {
  const raw = String(message || '');
  const fromBody = typeof body === 'object' && body && 'message' in body
    ? String((body as { message: unknown }).message)
    : raw;
  const cleaned = stripHtml(fromBody || raw);
  if (status === 401) return 'The data service requires authorization.';
  if (status === 403) return 'You do not have permission to access this data.';
  if (status === 404) return 'The requested data endpoint was not found.';
  if (status === 429) return 'The data service is rate limited. Retrying later may succeed.';
  if (status >= 500) return 'The data service is temporarily unavailable.';
  return cleaned || `Request failed with status ${status}`;
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;
function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Read the body exactly ONCE. Calling res.json() consumes the stream even
    // when parsing fails, so a follow-up res.text() would throw "body stream
    // already read" — masking the real error. Read text, then try to parse.
    const raw = await res.text().catch(() => '');
    let body: unknown = raw;
    if (raw) { try { body = JSON.parse(raw); } catch { /* keep raw text */ } }
    const message = typeof body === 'object' && body && 'error' in body
      ? String((body as { error: unknown }).error)
      : (raw || res.statusText);
    throw new GatewayError(res.status, message, body);
  }
  return (await res.json()) as T;
}

// ─── Cache + dedup ─────────────────────────────────────────────────────────

export type FreshnessStatus = 'live' | 'cached' | 'stale' | 'error';

interface CacheEntry<T = unknown> {
  data: T;
  fetchedAt: number;       // unix ms
  ttlMs: number;           // freshness budget; cached past this is "stale"
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** TTLs (ms) — match gateway-side cache cadence broadly. */
export const ClientTTL = {
  quote: 30_000,
  ohlcv_daily: 6 * 60 * 60_000,
  ohlcv_intraday: 60_000,
  news: 5 * 60_000,
  headlines: 5 * 60_000,
  search: 6 * 60 * 60_000,
  macro_series: 6 * 60 * 60_000,
  research: 30 * 60_000,
  providers: 60_000,
  default: 60_000,
} as const;

export function cacheGet<T>(key: string): CacheEntry<T> | undefined {
  return cache.get(key) as CacheEntry<T> | undefined;
}

export function cachePeek<T>(key: string): T | undefined {
  return cacheGet<T>(key)?.data;
}

export function isStale(entry: CacheEntry | undefined): boolean {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > entry.ttlMs;
}

export function cacheInvalidate(prefix?: string): void {
  if (!prefix) { cache.clear(); return; }
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

function cacheKeyFor(path: string, params?: QueryParams): string {
  return `GET ${path}${buildQuery(params)}`;
}

export interface FetchMeta {
  fetchedAt: number;
  status: FreshnessStatus;
  source: 'network' | 'cache';
}

export interface FetchResult<T> {
  data: T;
  meta: FetchMeta;
}

/**
 * GET with cache+dedup. Returns network value when possible; on network failure
 * with a cached value present, returns the cached value tagged 'stale'.
 */
export async function gatewayGet<T>(
  path: string,
  params?: QueryParams,
  ttlMs: number = ClientTTL.default,
): Promise<T> {
  const r = await gatewayGetMeta<T>(path, params, ttlMs);
  return r.data;
}

export async function gatewayGetMeta<T>(
  path: string,
  params?: QueryParams,
  ttlMs: number = ClientTTL.default,
): Promise<FetchResult<T>> {
  const key = cacheKeyFor(path, params);
  const existing = cacheGet<T>(key);

  // Dedup in-flight identical requests
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    try {
      const data = await pending;
      return { data, meta: { fetchedAt: Date.now(), status: 'live', source: 'network' } };
    } catch (e) {
      if (existing) {
        return {
          data: existing.data,
          meta: { fetchedAt: existing.fetchedAt, status: 'stale', source: 'cache' },
        };
      }
      throw e;
    }
  }

  const exec = (async (): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${PREFIX}${path}${buildQuery(params)}`, {
        signal: controller.signal,
      });
      const data = await handle<T>(res);
      cache.set(key, { data, fetchedAt: Date.now(), ttlMs });
      return data;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Request timed out. The server may be starting up — please try again.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight.set(key, exec as Promise<unknown>);
  try {
    const data = await exec;
    return { data, meta: { fetchedAt: Date.now(), status: 'live', source: 'network' } };
  } catch (e) {
    if (existing) {
      // Network failed but we have something cached — degrade gracefully.
      return {
        data: existing.data,
        meta: { fetchedAt: existing.fetchedAt, status: 'stale', source: 'cache' },
      };
    }
    throw e;
  } finally {
    inflight.delete(key);
  }
}

export async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  return gatewayPostWithTimeout<T>(path, body, FETCH_TIMEOUT_MS);
}

export async function gatewayPostWithTimeout<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PREFIX}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return handle<T>(res);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out. The server may be starting up — please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function gatewayPatch<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${PREFIX}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return handle<T>(res);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out. The server may be starting up — please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget POST — used by telemetry to avoid blocking UI on event
 * ingest. Errors are swallowed (logged once via console.warn). Returns void.
 */
export async function gatewayBeacon(path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${PREFIX}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (err) {
    // Telemetry must never break the UI. Swallow.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[gatewayBeacon] failed', err);
    }
  }
}
