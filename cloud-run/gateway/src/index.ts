/**
 * Deplyze Quant Gateway — authenticated API for the research terminal.
 *
 * All /v1 routes require a valid Firebase ID token. Provider API keys
 * (Finnhub, Alpha Vantage, Twelve Data, Tavily, Serper, Gemini) are read
 * server-side from env / Secret Manager and never exposed to the browser.
 *
 * Required env vars:
 *   FIREBASE_PROJECT_ID
 *   GEMINI_API_KEY
 *   FINNHUB_API_KEY
 *   ALPHA_VANTAGE_API_KEY
 *   TWELVE_DATA_API_KEY
 *   TAVILY_API_KEY
 *   SERPER_API_KEY
 *   ALLOWED_ORIGINS       (comma-separated, optional)
 *   PORT                  (defaults to 8080)
 */

// Load .env.local when running locally (cwd = cloud-run/gateway or repo root).
// In Cloud Run, env vars come from the runtime, so this is a no-op.
import * as fs from 'fs';
import * as path from 'path';
(() => {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../../.env.local'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      // Strip inline comments after value (only when value isn't quoted).
      const hash = v.indexOf(' #');
      if (hash >= 0) v = v.slice(0, hash).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
    console.log(`[Gateway] Loaded ${p}`);
    break;
  }
})();

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { initializeApp, getApps } from 'firebase-admin/app';
import { applyCors } from './middleware/cors';
import { requestId } from './middleware/requestId';
import { rateLimiter, userRateLimiter } from './middleware/rateLimiter';
import { authenticate } from './middleware/auth';

import marketRouter from './routes/market';
import macroRouter from './routes/macro';
import researchRouter from './routes/research';
import copilotRouter from './routes/copilot';
import instrumentsRouter from './routes/instruments';
import providersRouter from './routes/providers';
import briefingsRouter from './routes/briefings';

// ─── Firebase Admin init (idempotent) ──────────────────────────────────────

if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

// ─── Validate required env vars on startup ─────────────────────────────────

const REQUIRED = [
  'FIREBASE_PROJECT_ID',
  'GEMINI_API_KEY',
  'FINNHUB_API_KEY',
  'ALPHA_VANTAGE_API_KEY',
  'TWELVE_DATA_API_KEY',
  'TAVILY_API_KEY',
  'SERPER_API_KEY',
] as const;

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[Gateway] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ─── App setup ─────────────────────────────────────────────────────────────

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(requestId);
app.use(applyCors);
app.use(express.json({ limit: '2mb' }));
app.use(rateLimiter);

// Unauthenticated health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'deplyze-quant-gateway' });
});

// All /v1 routes require a verified Firebase ID token + per-user rate limit.
app.use('/v1', authenticate, userRateLimiter);
app.use('/v1/market', marketRouter);
app.use('/v1/macro', macroRouter);
app.use('/v1/research', researchRouter);
app.use('/v1/copilot', copilotRouter);
app.use('/v1/instruments', instrumentsRouter);
app.use('/v1/providers', providersRouter);
app.use('/v1/briefings', briefingsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', code: 'NOT_FOUND' });
});

app.use((err: Error & { issues?: unknown }, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[Gateway] [${req.requestId}]`, err);
  applyCors(req, res, () => {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Bad Request', code: 'VALIDATION_ERROR', issues: err.issues });
      return;
    }
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });
});

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Gateway] Listening on port ${PORT}`);
  console.log(`[Gateway] Firebase project: ${process.env.FIREBASE_PROJECT_ID}`);
});

export default app;
