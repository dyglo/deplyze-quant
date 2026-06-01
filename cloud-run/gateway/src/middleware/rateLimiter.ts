/**
 * rateLimiter.ts — shared, fail-open rate limiting middleware.
 *
 * Two tiers:
 *   1. Global IP-based limiter   (before auth) — 600 req/min per IP
 *   2. Per-UID limiter           (after auth)  — 300 req/min per user
 *
 * Backed by Redis (Memorystore) when REDIS_HOST is configured, so limits are
 * shared across Cloud Run instances instead of being counted per-instance by an
 * in-memory store (which let the effective limit scale with instance count).
 * When Redis is absent or unreachable the store fails open — requests are
 * allowed and the limiter falls back to express-rate-limit's in-memory store
 * (local dev) — so a Redis outage can never lock users out.
 */

import rateLimit, { type Store, type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { isRedisEnabled, getRedisClient } from '../services/redis';

interface RateInfo {
  totalHits: number;
  resetTime: Date;
}

/**
 * Fixed-window Redis store. INCR the key, set the window TTL on first hit, and
 * report the count. Any Redis failure returns a "first hit" so the limiter
 * treats the request as under-limit (fail-open).
 */
class RedisFailOpenStore implements Store {
  private windowMs = 60_000;
  private readonly keyPrefix: string;

  constructor(prefix: string) {
    this.keyPrefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<RateInfo> {
    const failOpen: RateInfo = { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    const client = getRedisClient();
    if (!client) return failOpen;
    try {
      const k = this.keyPrefix + key;
      const count = await client.incr(k);
      if (count === 1) await client.pexpire(k, this.windowMs);
      const pttl = await client.pttl(k);
      const resetMs = pttl > 0 ? pttl : this.windowMs;
      return { totalHits: count, resetTime: new Date(Date.now() + resetMs) };
    } catch {
      return failOpen;
    }
  }

  async decrement(key: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      await client.decr(this.keyPrefix + key);
    } catch {
      /* fail-open */
    }
  }

  async resetKey(key: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      await client.del(this.keyPrefix + key);
    } catch {
      /* fail-open */
    }
  }
}

// undefined → express-rate-limit uses its default in-memory store (local dev).
function makeStore(prefix: string): Store | undefined {
  return isRedisEnabled() ? new RedisFailOpenStore(prefix) : undefined;
}

// ─── Global IP-based limiter ───────────────────────────────────────────────

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 600,                    // 600 requests per IP per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: makeStore('rl:ip:'),
  keyGenerator: (req: Request) => {
    // Respect Cloud Run forwarded IP
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip ?? 'unknown';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down.',
    });
  },
});

// ─── Per-authenticated-user limiter ───────────────────────────────────────

export const userRateLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 300,                     // 300 requests per user per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: makeStore('rl:uid:'),
  keyGenerator: (req: Request) => {
    // req.uid is set by the auth middleware
    return req.uid ?? req.ip ?? 'anon';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      code: 'USER_RATE_LIMIT_EXCEEDED',
      message: 'You are sending too many requests. Please wait a moment.',
    });
  },
  skip: (req: Request) => !req.uid, // Skip if not yet authenticated
});

// ─── Guest (anonymous) limiter ─────────────────────────────────────────────
// Layered on top of the per-user limiter for anonymous sessions only. Guests
// can browse public surfaces but at a tighter budget than full accounts, so a
// single anonymous token can't be used to scrape the data APIs. Keyed by uid
// (each guest gets a distinct anonymous uid). Full accounts are skipped.

export const guestRateLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 120,                     // 120 requests per guest per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: makeStore('rl:guest:'),
  keyGenerator: (req: Request) => req.uid ?? req.ip ?? 'guest',
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      code: 'GUEST_RATE_LIMIT_EXCEEDED',
      message: 'Guest request limit reached. Create a free workspace for a higher limit.',
    });
  },
  skip: (req: Request) => !req.isAnonymous, // Only applies to anonymous guests
});
