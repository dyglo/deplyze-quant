/**
 * cors.ts — Safe CORS policy for the Deplyze Quant Gateway.
 *
 * Only allows requests from configured frontends and local dev. Override the
 * default list with ALLOWED_ORIGINS env var (comma-separated).
 */

import cors from 'cors';
import type { CorsOptions } from 'cors';
import type { Request, Response, NextFunction } from 'express';

const DEFAULT_ORIGINS = [
  'https://deplyze-quant.web.app',
  'https://deplyze-quant.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

function getAllowedOrigins(): Set<string> {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return new Set(
      envOrigins
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    );
  }
  return new Set(DEFAULT_ORIGINS);
}

const allowedOrigins = getAllowedOrigins();

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" is not allowed.`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
};

const corsMiddleware = cors(corsOptions);

export function applyCors(req: Request, res: Response, next: NextFunction): void {
  corsMiddleware(req, res, next);
}
