/**
 * logger.ts — structured JSON logging for the gateway.
 *
 * Cloud Run captures stdout/stderr into Cloud Logging. Emitting one JSON object
 * per line lets us filter by requestId / uid / route / provider / freshness /
 * reason instead of grepping free-text. Keep it dependency-free and cheap.
 *
 * Severity maps to Cloud Logging's `severity` field so DEBUG/INFO/WARN/ERROR
 * sort correctly in the Logs Explorer.
 */

import type { Request } from 'express';

type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export interface LogFields {
  /** logical event name, e.g. "earnings.calendar.degraded" */
  event: string;
  requestId?: string;
  uid?: string;
  orgId?: string;
  route?: string;
  provider?: string;
  /** which provider actually served the data, when a fallback chain ran */
  servedBy?: string;
  /** freshness tier of the response payload */
  freshness?: 'live' | 'cached' | 'stale' | 'degraded' | 'empty';
  /** short, human reason for a degraded / failed path */
  reason?: string;
  latencyMs?: number;
  [k: string]: unknown;
}

function emit(severity: Severity, fields: LogFields): void {
  const line = JSON.stringify({
    severity,
    time: new Date().toISOString(),
    ...fields,
  });
  if (severity === 'ERROR') console.error(line);
  else if (severity === 'WARNING') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (fields: LogFields) => emit('INFO', fields),
  warn: (fields: LogFields) => emit('WARNING', fields),
  error: (fields: LogFields) => emit('ERROR', fields),
  debug: (fields: LogFields) => emit('DEBUG', fields),
};

/**
 * Pull the identity/trace context a request already carries so route handlers
 * can log it without re-plumbing. `uid`/`email` are attached by the auth
 * middleware; `requestId` by the requestId middleware.
 */
export function reqContext(req: Request): Pick<LogFields, 'requestId' | 'uid' | 'route'> {
  return {
    requestId: (req as { requestId?: string }).requestId,
    uid: (req as { uid?: string }).uid,
    route: req.originalUrl,
  };
}
