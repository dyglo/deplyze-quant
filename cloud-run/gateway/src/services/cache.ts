/**
 * cache.ts — TTL cache for provider responses.
 *
 * Free-tier provider limits are tight (Alpha Vantage 25 req/day, Finnhub
 * 60 req/min). The gateway caches every provider call by a deterministic key.
 *
 * Three layers, in order:
 *   1. In-process Map (L1)      — hot keys within a single Cloud Run instance.
 *   2. Redis (L2, shared)       — cross-instance source of truth when REDIS_HOST
 *                                 is configured (Memorystore via VPC).
 *   3. Firestore `providerCache` — fallback ONLY when Redis is unavailable
 *                                 (local dev, or a Redis outage), so the
 *                                 cross-instance quota shield survives a Redis
 *                                 blip. Locked to server-only in firestore.rules.
 *
 * When Redis is healthy, Firestore is not touched — this is the deliberate
 * reduction of Firestore-as-cache. Every layer is fail-open: a backend error
 * degrades to the next layer (and ultimately the loader), never an exception.
 */

import { createHash } from 'crypto';
import { db } from './firestoreAdmin';
import { isRedisEnabled, redisGetJSON, redisSetJSON } from './redis';

// Namespacing keeps cache keys from colliding with rate-limiter keys in Redis.
const REDIS_PREFIX = 'cache:';

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // unix ms
}

const memory = new Map<string, CacheEntry>();
const MEMORY_MAX = 500;

function memorySet<T>(key: string, entry: CacheEntry<T>) {
  if (memory.size >= MEMORY_MAX) {
    // Drop oldest insertion (Map iteration order is insertion order).
    const firstKey = memory.keys().next().value;
    if (firstKey) memory.delete(firstKey);
  }
  memory.set(key, entry);
}

/** Hashes a key to be a safe Firestore document ID (no slashes allowed). */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const hot = memory.get(key);
  if (hot && hot.expiresAt > now) return hot.value as T;

  // L2: Redis (primary cross-instance layer when configured). The full entry
  // (value + expiresAt) is stored so the L1 mirror keeps the real expiry.
  if (isRedisEnabled()) {
    const entry = (await redisGetJSON(REDIS_PREFIX + key)) as CacheEntry<T> | null;
    if (entry && entry.expiresAt > now) {
      memorySet(key, entry);
      return entry.value;
    }
    return null; // Redis healthy + miss → don't fall back to Firestore.
  }

  // L3: Firestore fallback (Redis not configured or hard-failed).
  try {
    const docId = hashKey(key);
    const snap = await db.collection('providerCache').doc(docId).get();
    if (!snap.exists) return null;
    const entry = snap.data() as CacheEntry<T>;
    if (entry.expiresAt <= now) return null;
    memorySet(key, entry);
    return entry.value;
  } catch (err) {
    console.warn('[cache] read failed', key, err);
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
  memorySet(key, entry);

  if (isRedisEnabled()) {
    const ok = await redisSetJSON(REDIS_PREFIX + key, entry, Math.ceil(ttlMs / 1000));
    if (ok) return; // wrote to the shared layer; skip Firestore.
  }

  // Firestore fallback (Redis not configured, or the Redis write failed).
  try {
    const docId = hashKey(key);
    await db.collection('providerCache').doc(docId).set(entry);
  } catch (err) {
    console.warn('[cache] write failed', key, err);
  }
}

/**
 * withCache — fetch-through wrapper. Computes key, returns cached value if
 * fresh, otherwise calls loader() and persists the result.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  await cacheSet(key, value, ttlMs);
  return value;
}

export const TTL = {
  quote: 60_000,                  // 1 min
  ohlcv_intraday: 5 * 60_000,     // 5 min
  ohlcv_daily: 6 * 60 * 60_000,   // 6 h
  news: 5 * 60_000,               // 5 min
  fundamentals: 24 * 60 * 60_000, // 1 day
  macro_series: 6 * 60 * 60_000,  // 6 h (slow-moving series)
  web_search: 60 * 60_000,        // 1 h
  synthesis: 30 * 60_000,         // 30 min (Gemini is not free)
} as const;
