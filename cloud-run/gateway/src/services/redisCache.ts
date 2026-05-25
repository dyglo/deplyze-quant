/**
 * redisCache.ts — fail-open Redis cache for the personalized briefing route.
 *
 * Connection is established lazily on first call. If REDIS_HOST is not set
 * (local dev) or if Redis is unreachable, every operation returns null and
 * the caller falls through to the quant-engine. Errors are never thrown.
 */

import Redis from 'ioredis';

let _client: Redis | null = null;
let _initFailed = false;

function getClient(): Redis | null {
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
      commandTimeout: 1_000,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
    });

    _client.on('error', (err: Error) => {
      // Suppress noisy repeated errors; mark init as failed so we stop trying.
      console.warn('[redisCache] connection error:', err.message);
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

export async function redisCacheGet(key: string): Promise<unknown | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function redisCacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSeconds));
  } catch {
    // fail-open: cache miss on next request is acceptable
  }
}
