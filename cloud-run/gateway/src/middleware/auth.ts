/**
 * auth.ts — Firebase ID Token verification middleware
 *
 * Extracts "Authorization: Bearer <idToken>" from every request.
 * Verifies the token with Firebase Admin SDK.
 * Attaches req.uid and req.email to the request context.
 *
 * Returns 401 on missing or invalid token.
 * Returns 403 if the token is valid but revoked.
 */

import type { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';

// Extend Express request type to carry verified Firebase identity
declare global {
  namespace Express {
    interface Request {
      uid: string;
      email: string | undefined;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      code: 'MISSING_TOKEN',
      message: 'Authorization: Bearer <idToken> header is required.',
    });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  try {
    // In production, we check if the token has been revoked (requires network call).
    // In development, we skip this to avoid issues with local Google Cloud credentials (ADC).
    const checkRevoked = process.env.NODE_ENV === 'production';
    const decoded = await getAuth().verifyIdToken(idToken, checkRevoked);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };

    if (error.code === 'auth/id-token-revoked') {
      res.status(403).json({
        error: 'Forbidden',
        code: 'TOKEN_REVOKED',
        message: 'Token has been revoked. Please sign in again.',
      });
      return;
    }

    if (
      error.code === 'auth/id-token-expired' ||
      error.code === 'auth/argument-error' ||
      error.code === 'auth/invalid-id-token'
    ) {
      res.status(401).json({
        error: 'Unauthorized',
        code: 'INVALID_TOKEN',
        message: 'Token is invalid or expired.',
      });
      return;
    }

    console.error('[Auth] Token verification failed:', error);
    res.status(401).json({
      error: 'Unauthorized',
      code: 'AUTH_ERROR',
    });
  }
}
