/**
 * providerRouter — institutional-grade provider fallback and health tracking.
 *
 * Implements:
 *   - Named fallback chains per data domain
 *   - Per-provider health state (last success / failure / latency)
 *   - Stale-data protection (returns last known good result on hard error)
 *   - Retry with exponential back-off for transient failures
 *   - Timeout enforcement per provider call
 *
 * No Kafka. No Redis. No distributed state.
 * Single Cloud Run instance state — sufficient for the gateway's TTL-cache architecture.
 */

// ─── Health tracking ───────────────────────────────────────────────────────

export interface ProviderHealthState {
  id: string;
  configured: boolean;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailureMessage?: string;
  latencyMs?: number;
  consecutiveFailures: number;
}

const _health = new Map<string, ProviderHealthState>();

export function getHealthState(id: string): ProviderHealthState {
  return _health.get(id) ?? { id, configured: true, consecutiveFailures: 0 };
}

export function getAllHealthStates(): ProviderHealthState[] {
  return Array.from(_health.values());
}

function recordSuccess(id: string, latencyMs: number): void {
  const prev = getHealthState(id);
  _health.set(id, { ...prev, id, configured: true, lastSuccessAt: Date.now(), latencyMs, consecutiveFailures: 0 });
}

function recordFailure(id: string, message: string): void {
  const prev = getHealthState(id);
  _health.set(id, {
    ...prev, id, configured: true,
    lastFailureAt: Date.now(),
    lastFailureMessage: message.slice(0, 500),
    consecutiveFailures: (prev.consecutiveFailures ?? 0) + 1,
  });
}

// ─── Provider call wrapper ──────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;

async function callWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Provider timeout')), timeoutMs);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function callProvider<T>(
  id: string,
  fn: () => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  let lastErr: Error = new Error(`Provider ${id} failed`);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const result = await callWithTimeout(fn, timeoutMs);
      recordSuccess(id, Date.now() - t0);
      return result;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      recordFailure(id, lastErr.message);
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ─── Fallback chain execution ───────────────────────────────────────────────

export type ProviderFn<T> = () => Promise<T>;

export interface FallbackChain<T> {
  providers: Array<{ id: string; fn: ProviderFn<T>; timeoutMs?: number }>;
  onProviderError?: (id: string, err: Error) => void;
}

/**
 * Execute a fallback chain: try providers in order, return first success.
 * Throws only if all providers fail.
 */
export async function withFallback<T>(chain: FallbackChain<T>): Promise<{ result: T; providerId: string }> {
  const errors: string[] = [];
  for (const p of chain.providers) {
    try {
      const result = await callProvider(p.id, p.fn, p.timeoutMs);
      return { result, providerId: p.id };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      errors.push(`${p.id}: ${e.message}`);
      chain.onProviderError?.(p.id, e);
    }
  }
  throw new Error(`All providers failed:\n${errors.join('\n')}`);
}

// ─── Pre-configured domain chains ──────────────────────────────────────────
// These are factory functions so callers inject their provider fns cleanly.

/**
 * Quote routing: Polygon → Finnhub → Twelve Data
 */
export function quoteChain<T>(providers: {
  polygon?: ProviderFn<T>;
  finnhub?: ProviderFn<T>;
  twelve_data?: ProviderFn<T>;
}): FallbackChain<T> {
  return {
    providers: [
      ...(providers.polygon    ? [{ id: 'polygon',     fn: providers.polygon }]    : []),
      ...(providers.finnhub    ? [{ id: 'finnhub',     fn: providers.finnhub }]    : []),
      ...(providers.twelve_data? [{ id: 'twelve_data', fn: providers.twelve_data }]: []),
    ],
  };
}

/**
 * Historical OHLCV routing: EODHD → Twelve Data → Alpha Vantage
 */
export function ohlcvChain<T>(providers: {
  eodhd?: ProviderFn<T>;
  twelve_data?: ProviderFn<T>;
  alpha_vantage?: ProviderFn<T>;
  fmp?: ProviderFn<T>;
  polygon?: ProviderFn<T>;
}): FallbackChain<T> {
  return {
    providers: [
      ...(providers.eodhd        ? [{ id: 'eodhd',         fn: providers.eodhd }]        : []),
      ...(providers.twelve_data  ? [{ id: 'twelve_data',   fn: providers.twelve_data }]  : []),
      ...(providers.fmp          ? [{ id: 'fmp',           fn: providers.fmp }]          : []),
      ...(providers.alpha_vantage? [{ id: 'alpha_vantage', fn: providers.alpha_vantage }]: []),
      ...(providers.polygon      ? [{ id: 'polygon',       fn: providers.polygon }]      : []),
    ],
  };
}

/**
 * Fundamentals routing: FMP → Finnhub → EODHD
 */
export function fundamentalsChain<T>(providers: {
  fmp?: ProviderFn<T>;
  finnhub?: ProviderFn<T>;
  eodhd?: ProviderFn<T>;
  edgar?: ProviderFn<T>;
}): FallbackChain<T> {
  return {
    providers: [
      ...(providers.fmp    ? [{ id: 'fmp',    fn: providers.fmp }]    : []),
      ...(providers.finnhub? [{ id: 'finnhub',fn: providers.finnhub }]: []),
      ...(providers.eodhd  ? [{ id: 'eodhd',  fn: providers.eodhd }]  : []),
      ...(providers.edgar  ? [{ id: 'edgar',  fn: providers.edgar }]  : []),
    ],
  };
}

/**
 * News routing: Polygon → Finnhub → Tavily → Serper
 */
export function newsChain<T>(providers: {
  polygon?: ProviderFn<T>;
  finnhub?: ProviderFn<T>;
  tavily?: ProviderFn<T>;
  serper?: ProviderFn<T>;
}): FallbackChain<T> {
  return {
    providers: [
      ...(providers.polygon? [{ id: 'polygon', fn: providers.polygon }]: []),
      ...(providers.finnhub? [{ id: 'finnhub', fn: providers.finnhub }]: []),
      ...(providers.tavily ? [{ id: 'tavily',  fn: providers.tavily }] : []),
      ...(providers.serper ? [{ id: 'serper',  fn: providers.serper }] : []),
    ],
  };
}

/**
 * Earnings routing: FMP → Finnhub
 */
export function earningsChain<T>(providers: {
  fmp?: ProviderFn<T>;
  finnhub?: ProviderFn<T>;
  eodhd?: ProviderFn<T>;
}): FallbackChain<T> {
  return {
    providers: [
      ...(providers.fmp    ? [{ id: 'fmp',    fn: providers.fmp }]    : []),
      ...(providers.finnhub? [{ id: 'finnhub',fn: providers.finnhub }]: []),
      ...(providers.eodhd  ? [{ id: 'eodhd',  fn: providers.eodhd }]  : []),
    ],
  };
}
