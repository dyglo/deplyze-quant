/**
 * /v1/personalization — V5 Phase 1 event ingest + profile read.
 *
 * Routes (this PR — ingest only):
 *   POST /personalization/events      — batched behavioral events
 *   POST /personalization/feedback    — explicit feedback (relevance, mute)
 *   GET  /personalization/profile     — current user_profile_daily snapshot
 *
 * Routes that ship in PR4 (engine-backed):
 *   GET /personalization/briefing, /feed, /copilot-context, /watchlist
 *   POST /personalization/investigation
 *
 * Privacy:
 *   - All BQ rows stamp user_id_hash = sha256(uid || '|' || salt).
 *   - Raw Firebase UIDs are never written to BigQuery.
 *   - When PERSONALIZATION_ENABLED=false, every route returns 404. This is
 *     the rollback-safe default.
 */

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { BigQuery } from '@google-cloud/bigquery';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

import {
  hashUserId,
  isPersonalizationEnabled,
  uaClass,
  isValueAction,
  EVENT_TYPES,
  EVENT_CATEGORIES,
  type EventType,
} from '../lib/personalization';

const router = Router();

// ─── BigQuery client ──────────────────────────────────────────────────────────

let _bq: BigQuery | null = null;
function getBQ(): BigQuery {
  if (!_bq) {
    _bq = new BigQuery({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant',
      location: process.env.BIGQUERY_LOCATION ?? 'US',
    });
  }
  return _bq;
}

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant';
const RAW_APP_DS = process.env.BQ_DATASET_RAW_APP ?? 'raw_app';
const FEATURES_DS = process.env.BQ_DATASET_FEATURES ?? 'features';

// ─── Master flag gate ────────────────────────────────────────────────────────
// Every route in this router is short-circuited when the flag is off.

router.use((req, res, next) => {
  if (!isPersonalizationEnabled()) {
    res.status(404).json({ error: 'Not Found', code: 'PERSONALIZATION_DISABLED' });
    return;
  }
  next();
});

// ─── Per-user event ingest rate limit ────────────────────────────────────────
// UI emits impression events frequently; the default 60/min userRateLimiter
// applied in index.ts is too tight. Allow up to 600 events/min/user but cap
// batch size at 50 to keep BQ inserts bounded.

const eventIngestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.uid ?? req.ip ?? 'anon',
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      code: 'EVENT_INGEST_RATE_LIMIT',
      message: 'Slow down on event ingestion.',
    });
  },
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

const EventSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  event_category: z.enum(EVENT_CATEGORIES).optional(),
  session_id: z.string().min(1).max(64).optional(),
  entity_type: z.string().max(40).optional(),
  entity_id: z.string().max(120).optional(),
  artifact_id: z.string().max(80).optional(),
  symbol: z.string().max(20).optional(),
  portfolio_id: z.string().max(80).optional(),
  placement: z.string().max(60).optional(),
  channel: z.enum(['web', 'email', 'push']).optional(),
  duration_ms: z.number().int().min(0).max(86_400_000).optional(),
  dwell_ms: z.number().int().min(0).max(86_400_000).optional(),
  properties: z.record(z.unknown()).optional(),
  client_ts: z.string().datetime().optional(),
  app_version: z.string().max(40).optional(),
  experiment_arm: z.string().max(40).optional(),
});
type EventPayload = z.infer<typeof EventSchema>;

const EventsBatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(50),
});

const FeedbackSchema = z.object({
  kind: z.enum(['relevance', 'dismiss_category', 'mute']),
  artifact_id: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  signal: z.enum(['less_like_this', 'more_like_this', 'mute', 'unmute']).optional(),
  reason: z.string().max(400).optional(),
  properties: z.record(z.unknown()).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function toBQRow(uid: string, ev: EventPayload, req: Request): Record<string, unknown> {
  const ingestedAt = new Date();
  const userIdHash = hashUserId(uid);
  const eventType = ev.event_type as EventType;

  return {
    event_id: uuidv4(),
    user_id_hash: userIdHash,
    session_id: ev.session_id ?? null,
    event_type: eventType,
    event_category: ev.event_category ?? null,
    value_action: isValueAction(eventType),
    entity_type: ev.entity_type ?? null,
    entity_id: ev.entity_id ?? null,
    artifact_id: ev.artifact_id ?? null,
    symbol: ev.symbol ?? null,
    portfolio_id: ev.portfolio_id ?? null,
    placement: ev.placement ?? null,
    channel: ev.channel ?? 'web',
    duration_ms: ev.duration_ms ?? null,
    dwell_ms: ev.dwell_ms ?? null,
    properties: ev.properties ? JSON.stringify(ev.properties) : null,
    client_ts: ev.client_ts ?? null,
    ingested_at: ingestedAt.toISOString(),
    event_date: todayDate(ingestedAt),
    app_version: ev.app_version ?? null,
    user_agent_class: uaClass(req.headers['user-agent']),
    experiment_arm: ev.experiment_arm ?? null,
  };
}

async function insertEvents(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const table = getBQ().dataset(RAW_APP_DS).table('user_events');
  // skipInvalidRows=false: we want hard failures on schema mismatches so we
  // notice malformed client payloads instead of silently dropping rows.
  await table.insert(rows, {
    skipInvalidRows: false,
    ignoreUnknownValues: false,
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /v1/personalization/events
 * Body: { events: EventPayload[] }
 * Auth: Firebase ID token (req.uid set by upstream auth middleware).
 */
router.post('/events', eventIngestLimiter, async (req, res, next) => {
  try {
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const parsed = EventsBatchSchema.parse(req.body);
    const rows = parsed.events.map((ev) => toBQRow(req.uid, ev, req));
    await insertEvents(rows);
    res.status(202).json({ accepted: rows.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/personalization/feedback
 * Body: FeedbackSchema
 *
 * Stored in raw_app.user_events with event_type ∈ {feedback_relevance,
 * feedback_dismiss_category, feedback_mute} so retention analytics can
 * treat feedback the same as any other behavioral signal.
 */
router.post('/feedback', async (req, res, next) => {
  try {
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const parsed = FeedbackSchema.parse(req.body);
    const eventType =
      parsed.kind === 'relevance'
        ? 'feedback_relevance'
        : parsed.kind === 'dismiss_category'
        ? 'feedback_dismiss_category'
        : 'feedback_mute';
    const row = toBQRow(
      req.uid,
      {
        event_type: eventType as EventType,
        event_category: 'feed',
        artifact_id: parsed.artifact_id,
        properties: {
          signal: parsed.signal,
          category: parsed.category,
          reason: parsed.reason,
          ...(parsed.properties ?? {}),
        },
      },
      req,
    );
    await insertEvents([row]);
    res.status(202).json({ accepted: 1 });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/personalization/profile
 * Returns the latest user_profile_daily snapshot for the caller.
 * Returns 204 No Content if no snapshot has been built yet (PR3 builds them).
 */
router.get('/profile', async (req, res, next) => {
  try {
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const userIdHash = hashUserId(req.uid);
    const query = `
      SELECT
        snapshot_date,
        portfolio_identity,
        macro_sensitivity,
        narrative_affinity,
        sector_focus,
        regime_style,
        preferred_depth,
        risk_posture,
        workflow_signature,
        temporal_engagement,
        active_investigation_ids,
        watchlist_symbols,
        portfolio_symbols,
        fatigue_signals,
        profile_version,
        builder_version,
        generated_at
      FROM \`${PROJECT}.${FEATURES_DS}.user_profile_daily\`
      WHERE user_id_hash = @uid_hash
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;
    const [rows] = await getBQ().query({
      query,
      params: { uid_hash: userIdHash },
      location: process.env.BIGQUERY_LOCATION ?? 'US',
      maximumBytesBilled: String(50 * 1024 * 1024),
    });
    if (!rows || rows.length === 0) {
      res.status(204).end();
      return;
    }
    res.json({ profile: rows[0] });
  } catch (err: unknown) {
    // First-deploy case: features.user_profile_daily exists but has no rows
    // for this user, OR the table was just provisioned and is not yet queried
    // by the engine. Treat "not found" gracefully.
    const e = err as { code?: number; message?: string };
    if (e?.code === 404 || /Not found/i.test(e?.message ?? '')) {
      res.status(204).end();
      return;
    }
    next(err);
  }
});

// ─── PR4: engine-proxied read routes ─────────────────────────────────────────
// These routes hash req.uid and forward to the quant-engine, which holds the
// ranker, profile, and investigation memory logic. The gateway is the only
// component that ever sees the raw Firebase UID.

const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? '';
const ENGINE_TIMEOUT_MS = 25_000;

function ensureEngine(res: Response): boolean {
  if (!QUANT_ENGINE_URL) {
    res.status(503).json({
      error: 'Personalization engine not configured',
      code: 'ENGINE_UNAVAILABLE',
    });
    return false;
  }
  return true;
}

// Fetches a short-lived Google-signed OIDC token so Cloud Run IAM accepts
// service-to-service calls from the gateway to the quant-engine.
async function getEngineIdToken(): Promise<string> {
  try {
    // On Cloud Run the metadata server is always available.
    const metaUrl =
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity` +
      `?audience=${encodeURIComponent(QUANT_ENGINE_URL)}`;
    const resp = await fetch(metaUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(3_000),
    });
    if (resp.ok) return resp.text();
  } catch { /* fall through to empty token in dev */ }
  return '';
}

async function callEngine(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  init: { query?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, v);
  }
  const url = `${QUANT_ENGINE_URL}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
  const idToken = await getEngineIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  const response = await fetch(url, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

/**
 * GET /v1/personalization/briefing
 * Returns the latest personalized briefing for the authenticated user.
 */
router.get('/briefing', async (req, res, next) => {
  try {
    if (!ensureEngine(res)) return;
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const userIdHash = hashUserId(req.uid);
    const result = await callEngine('GET', '/personalization/briefing', {
      query: { user_id_hash: userIdHash },
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/personalization/feed?limit=20
 * Personalized intelligence feed for the authenticated user.
 */
router.get('/feed', async (req, res, next) => {
  try {
    if (!ensureEngine(res)) return;
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const userIdHash = hashUserId(req.uid);
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === 'string' && /^\d+$/.test(limitRaw)
        ? Math.min(Math.max(parseInt(limitRaw, 10), 1), 50)
        : 20;
    const result = await callEngine('GET', '/personalization/feed', {
      query: { user_id_hash: userIdHash, limit: String(limit) },
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/personalization/copilot-context
 * Compact grounding payload for the Research Copilot (PR7 consumes it).
 */
router.get('/copilot-context', async (req, res, next) => {
  try {
    if (!ensureEngine(res)) return;
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const userIdHash = hashUserId(req.uid);
    const result = await callEngine('GET', '/personalization/copilot-context', {
      query: { user_id_hash: userIdHash },
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/personalization/watchlist
 * Watchlist-aware intelligence — candidates that overlap the user's watchlist.
 */
router.get('/watchlist', async (req, res, next) => {
  try {
    if (!ensureEngine(res)) return;
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const userIdHash = hashUserId(req.uid);
    const result = await callEngine('GET', '/personalization/watchlist', {
      query: { user_id_hash: userIdHash },
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

// ─── Investigation memory CRUD ───────────────────────────────────────────────

const InvestigationCreateSchema = z.object({
  title: z.string().min(1).max(200),
  thesis: z.string().max(2000).optional(),
  symbols: z.array(z.string().max(20)).max(50).optional(),
  themes: z.array(z.string().max(40)).max(40).optional(),
  tags: z.array(z.string().max(40)).max(40).optional(),
  unresolved_questions: z.array(z.string().max(500)).max(20).optional(),
});

const InvestigationPatchSchema = z.object({
  patch: z.record(z.unknown()),
});

/**
 * POST /v1/personalization/investigation — create a new investigation.
 * GET  /v1/personalization/investigation?status=active — list for the user.
 * PATCH /v1/personalization/investigation/:id — partial update.
 */
router.post('/investigation', async (req, res, next) => {
  try {
    if (!ensureEngine(res)) return;
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const parsed = InvestigationCreateSchema.parse(req.body);
    const userIdHash = hashUserId(req.uid);
    const result = await callEngine('POST', '/personalization/investigation', {
      body: { user_id_hash: userIdHash, ...parsed },
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

router.get('/investigation', async (req, res, next) => {
  try {
    if (!ensureEngine(res)) return;
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const userIdHash = hashUserId(req.uid);
    const status = typeof req.query.status === 'string' ? req.query.status : 'active';
    const result = await callEngine('GET', '/personalization/investigation', {
      query: { user_id_hash: userIdHash, status },
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

router.patch('/investigation/:id', async (req, res, next) => {
  try {
    if (!ensureEngine(res)) return;
    if (!req.uid) {
      res.status(401).json({ error: 'Unauthorized', code: 'MISSING_UID' });
      return;
    }
    const parsed = InvestigationPatchSchema.parse(req.body);
    const userIdHash = hashUserId(req.uid);
    const result = await callEngine('PATCH', `/personalization/investigation/${encodeURIComponent(req.params.id)}`, {
      body: { user_id_hash: userIdHash, patch: parsed.patch },
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

export default router;
