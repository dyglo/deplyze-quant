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
 *
 * V2 providers (optional — routes degrade gracefully when absent):
 *   POLYGON_API_KEY
 *   FMP_API_KEY
 *   EODHD_API_KEY
 *   FRED_API_KEY          (free key at fred.stlouisfed.org — macro fallback)
 *   SEC_EDGAR_USER_AGENT  ("AppName contact@email.com" format)
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
import fundamentalsRouter from './routes/fundamentals';
import earningsRouter from './routes/earnings';
import edgarRouter from './routes/edgar';
import intelligenceRouter from './routes/intelligence';
import v3p2Router from './routes/v3p2';
import agentsRouter from './routes/agents';
import personalizationRouter from './routes/personalization';
import portfolioAwarenessRouter from './routes/portfolioAwareness';
import historicalResearchRouter from './routes/historicalResearch';

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

// V2 optional providers — warn but don't block startup.
const V2_OPTIONAL = ['POLYGON_API_KEY', 'FMP_API_KEY', 'EODHD_API_KEY', 'SEC_EDGAR_USER_AGENT', 'FRED_API_KEY'];
const missingOptional = V2_OPTIONAL.filter((k) => !process.env[k]);
if (missingOptional.length > 0) {
  console.warn(`[Gateway] V2 optional providers not configured: ${missingOptional.join(', ')} — these routes will use fallback providers.`);
}

// ─── App setup ─────────────────────────────────────────────────────────────

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(requestId);

// Trace incoming requests for production debugging
app.use((req, _res, next) => {
  console.log(`[Gateway] [${req.requestId}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(applyCors);
app.use(express.json({ limit: '2mb' }));
app.use(rateLimiter);

// Unauthenticated health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'deplyze-quant-gateway' });
});

// All /v1 routes require a verified Firebase ID token + per-user rate limit.
// Support both /v1 and /api/v1 (prod proxy via Firebase Hosting)
const router = express.Router();
router.use(authenticate, userRateLimiter);
router.use('/market', marketRouter);
router.use('/macro', macroRouter);
router.use('/research', researchRouter);
router.use('/copilot', copilotRouter);
router.use('/instruments', instrumentsRouter);
router.use('/providers', providersRouter);
router.use('/briefings', briefingsRouter);
router.use('/fundamentals', fundamentalsRouter);
router.use('/earnings', earningsRouter);
router.use('/edgar', edgarRouter);
router.use('/intelligence', intelligenceRouter);
router.use('/agents', agentsRouter);
router.use('/personalization', personalizationRouter);
router.use('/portfolio-awareness', portfolioAwarenessRouter);
router.use('/historical-research', historicalResearchRouter);
// V3 Phase 2 routes — multi-prefix (/macro/regimes, /filings/*, /narratives/*,
// /research/macro-observations, /relations/context, /briefings/latest).
// Mounted last so the established /macro and /briefings routers handle their
// existing sub-paths first; v3p2Router fills in the new V3P2 ones.
router.use('/', v3p2Router);

// Mount router on both paths to handle local dev (/v1) and prod proxy (/api/v1)
app.use(['/v1', '/api/v1'], router);

app.use((req, res) => {
  console.warn(`[Gateway] [${req.requestId}] 404 Not Found: ${req.method} ${req.originalUrl}`);
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
