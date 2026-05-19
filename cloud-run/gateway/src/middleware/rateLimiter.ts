/**
 * rateLimiter.ts — In-process rate limiting middleware
 *
 * Two tiers:
 *   1. Global IP-based limiter: 200 req/min (unauthenticated guard)
 *   2. Per-UID limiter applied after auth: 60 req/min per authenticated user
 *
 * Uses express-rate-limit with in-memory store (suitable for single-instance Cloud Run).
 * For multi-instance deployments, swap MemoryStore for Redis.
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

// ─── Global IP-based limiter ───────────────────────────────────────────────

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 600,                    // 600 requests per IP per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
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
