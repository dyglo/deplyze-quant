/**
 * requestId.ts — Adds a unique X-Request-ID to every response.
 *
 * If the client sends an X-Request-ID header, that value is echoed back
 * (useful for client-side request tracing). Otherwise a new UUID v4 is generated.
 * The ID is also attached to req for use in logging.
 */

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers['x-request-id'];
  const id = typeof existing === 'string' && existing.length > 0
    ? existing
    : uuidv4();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}
