/**
 * cache.ts — Firestore-backed TTL cache for provider responses.
 *
 * Free-tier provider limits are tight (Alpha Vantage 25 req/day, Finnhub
 * 60 req/min). The gateway caches every provider call by a deterministic key.
 *
 * Cache entries live in the `providerCache` collection, never read or written
 * by clients (locked down in firestore.rules).
 *
 * Two-layer lookup: an in-process Map fronts Firestore to avoid round-trips
 * for hot keys within a single Cloud Run instance. Firestore is the source of
 * truth across instances.
 */

import { db } from './firestoreAdmin';

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

export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const hot = memory.get(key);
  if (hot && hot.expiresAt > now) return hot.value as T;

  try {
    const snap = await db.collection('providerCache').doc(key).get();
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
  try {
    await db.collection('providerCache').doc(key).set(entry);
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
