/**
 * requireFullAccount.ts — block anonymous (guest) sessions from personalized
 * and workspace-writing routes.
 *
 * Must run AFTER `authenticate`, which sets `req.isAnonymous` from the verified
 * token. Guests carry a valid Firebase ID token (so they pass `authenticate`
 * and can read public data), but personalization, portfolio, agent, email and
 * historical-research persistence are full-account features. Those routers mount
 * this middleware so a guest receives a clear 403 instead of a confusing
 * downstream failure.
 */

import type { Request, Response, NextFunction } from 'express';

export function requireFullAccount(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.isAnonymous) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'GUEST_FORBIDDEN',
      message: 'Create a free account to unlock personalized intelligence.',
    });
    return;
  }
  next();
}
