/**
 * redis.ts — shared, fail-open Redis client for the gateway.
 *
 * One lazily-initialised ioredis connection backs both the cross-instance cache
 * (services/cache.ts) and the shared rate limiter (middleware/rateLimiter.ts).
 *
 * Fail-open by construction: if REDIS_HOST is unset (local dev) or Redis becomes
 * unreachable, every helper returns a miss / no-op and callers fall through to
 * their degraded path (loader, Firestore fallback, or "allow the request").
 * Errors are never thrown to callers. Short timeouts keep a Redis blip from
 * adding latency to the request path.
 */

import Redis from 'ioredis';

let _client: Redis | null = null;
let _initFailed = false;

/** True when Redis is configured and has not hard-failed this process. */
export function isRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_HOST) && !_initFailed;
}

export function getRedisClient(): Redis | null {
  if (_initFailed) return null;
  if (_client) return _client;

  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT ?? '6379', 10);
  if (!host) return null;

  try {
    _client = new Redis({
      host,
      port,
      connectTimeout: 2_000,
      commandTimeout: 1_000,     // never let a Redis stall add >1s to a request
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    _client.on('error', (err: Error) => {
      // Suppress noisy repeated errors and stop trying for this process; a fresh
      // Cloud Run instance will retry the connection on its next cold start.
      console.warn('[redis] connection error:', err.message);
      _initFailed = true;
      _client?.disconnect();
      _client = null;
    });

    return _client;
  } catch {
    _initFailed = true;
    return null;
  }
}

export async function redisGetJSON(key: string): Promise<unknown | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Returns true if the value was written, false on miss/failure (fail-open). */
export async function redisSetJSON(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    await client.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSeconds));
    return true;
  } catch {
    return false;
  }
}
