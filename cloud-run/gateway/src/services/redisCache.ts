/**
 * redisCache.ts — thin compatibility shim over the shared Redis client.
 *
 * The connection logic now lives in services/redis.ts (shared by the cache and
 * the rate limiter). This module is retained only so existing callers (the
 * personalized briefing route) keep their import path. Prefer importing from
 * services/redis.ts directly in new code.
 */

import { redisGetJSON, redisSetJSON } from './redis';

export async function redisCacheGet(key: string): Promise<unknown | null> {
  return redisGetJSON(key);
}

export async function redisCacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await redisSetJSON(key, value, ttlSeconds);
}
