/**
 * /v1/intelligence — V3 quant engine output routes.
 *
 * Exposes BigQuery-backed intelligence to the frontend.
 * All routes are auth-protected (via the shared router middleware).
 * BigQuery queries are bounded, paginated, and read-only.
 *
 * Routes:
 *   GET /timeline          — intelligence_timeline (latest events)
 *   GET /artifacts         — research_artifacts (paginated)
 *   GET /artifacts/:id     — single artifact by artifact_id
 *   GET /features/:symbol  — latest feature vector for a symbol
 *   GET /pipeline/runs     — recent model_runs (pipeline status)
 *   GET /relations         — latest relationship_features
 */

import { Router } from 'express';
import { z } from 'zod';
import { BigQuery } from '@google-cloud/bigquery';
import { withCache, TTL } from '../services/cache';

const router = Router();

// Lazy-init singleton BQ client — uses ADC in Cloud Run
let _bq: BigQuery | null = null;
function getBQ(): BigQuery {
  if (!_bq) {
    _bq = new BigQuery({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant',
      location: 'US',
    });
  }
  return _bq;
}

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant';

// ─── Helper: run a bounded BQ query safely ──────────────────────────────────

async function runQuery<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const bq = getBQ();
  const [rows] = await bq.query({
    query,
    params,
    location: 'US',
    maximumBytesBilled: String(50 * 1024 * 1024), // 50 MB cap per query
  });
  return rows as T[];
}

// ─── GET /intelligence/timeline ─────────────────────────────────────────────

const TimelineQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  symbol: z.string().optional(),
  severity: z.enum(['high', 'medium', 'low']).optional(),
});

router.get('/timeline', async (req, res, next) => {
  try {
    const { limit, symbol, severity } = TimelineQuery.parse(req.query);
    const cacheKey = `intel:timeline:${symbol ?? 'all'}:${severity ?? 'all'}:${limit}`;

    const rows = await withCache(cacheKey, TTL.quote * 2, async () => {
      let where = '';
      const params: Record<string, unknown> = { limit };
      if (symbol) { where += ` AND symbol = @symbol`; params.symbol = symbol.toUpperCase(); }
      if (severity) { where += ` AND severity = @severity`; params.severity = severity; }

      return runQuery(`
        SELECT
          id, symbol, event_type, title, summary,
          related_symbols, artifact_id, severity, tags,
          confidence, observation_time, created_at
        FROM \`${PROJECT}.research.intelligence_timeline\`
        WHERE TRUE ${where}
        ORDER BY observation_time DESC
        LIMIT @limit
      `, params);
    });

    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /intelligence/artifacts ────────────────────────────────────────────

const ArtifactsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  symbol: z.string().optional(),
  type: z.string().optional(),
  min_confidence: z.coerce.number().min(0).max(1).default(0),
});

router.get('/artifacts', async (req, res, next) => {
  try {
    const { limit, symbol, type, min_confidence } = ArtifactsQuery.parse(req.query);
    const cacheKey = `intel:artifacts:${symbol ?? 'all'}:${type ?? 'all'}:${limit}`;

    const rows = await withCache(cacheKey, TTL.quote * 5, async () => {
      let where = `WHERE is_test IS FALSE AND confidence >= @min_confidence`;
      const params: Record<string, unknown> = { limit, min_confidence };
      if (symbol) { where += ` AND symbol = @symbol`; params.symbol = symbol.toUpperCase(); }
      if (type) { where += ` AND artifact_type = @artifact_type`; params.artifact_type = type; }

      return runQuery(`
        SELECT
          artifact_id, artifact_type, title, summary,
          symbol, related_symbols, confidence, severity,
          evidence, metrics, source_tables, lineage_id, created_at
        FROM \`${PROJECT}.artifacts.research_artifacts\`
        ${where}
        ORDER BY created_at DESC
        LIMIT @limit
      `, params);
    });

    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /intelligence/artifacts/:id ────────────────────────────────────────

router.get('/artifacts/:id', async (req, res, next) => {
  try {
    const artifactId = req.params.id;
    if (!artifactId || artifactId.length > 64) {
      res.status(400).json({ error: 'Invalid artifact ID' });
      return;
    }
    const cacheKey = `intel:artifact:${artifactId}`;
    const rows = await withCache(cacheKey, TTL.ohlcv_daily, () =>
      runQuery(`
        SELECT *
        FROM \`${PROJECT}.artifacts.research_artifacts\`
        WHERE artifact_id = @id
        LIMIT 1
      `, { id: artifactId })
    );
    if (!rows.length) { res.status(404).json({ error: 'Artifact not found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ─── GET /intelligence/features/:symbol ─────────────────────────────────────

router.get('/features/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `intel:features:${symbol}`;

    const [returns, vol, momentum, anomaly, regime] = await withCache(cacheKey, TTL.quote * 5, async () =>
      Promise.all([
        runQuery(`SELECT * FROM \`${PROJECT}.features.returns_features\` WHERE symbol = @s ORDER BY observation_time DESC LIMIT 1`, { s: symbol }),
        runQuery(`SELECT * FROM \`${PROJECT}.features.volatility_features\` WHERE symbol = @s ORDER BY observation_time DESC LIMIT 1`, { s: symbol }),
        runQuery(`SELECT * FROM \`${PROJECT}.features.momentum_features\` WHERE symbol = @s ORDER BY observation_time DESC LIMIT 1`, { s: symbol }),
        runQuery(`SELECT * FROM \`${PROJECT}.features.anomaly_features\` WHERE symbol = @s ORDER BY observation_time DESC LIMIT 1`, { s: symbol }),
        runQuery(`SELECT * FROM \`${PROJECT}.features.regime_features\` WHERE symbol = @s ORDER BY observation_time DESC LIMIT 1`, { s: symbol }),
      ])
    );

    res.json({
      symbol,
      returns: returns[0] ?? null,
      volatility: vol[0] ?? null,
      momentum: momentum[0] ?? null,
      anomaly: anomaly[0] ?? null,
      regime: regime[0] ?? null,
    });
  } catch (err) { next(err); }
});

// ─── GET /intelligence/pipeline/runs ────────────────────────────────────────

const RunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

router.get('/pipeline/runs', async (req, res, next) => {
  try {
    const { limit } = RunsQuery.parse(req.query);
    const cacheKey = `intel:runs:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote, () =>
      runQuery(`
        SELECT
          run_id, pipeline_name, status, started_at, completed_at,
          duration_seconds, records_ingested, records_processed,
          artifacts_generated, error_count, created_at
        FROM \`${PROJECT}.model_outputs.model_runs\`
        ORDER BY started_at DESC
        LIMIT @limit
      `, { limit })
    );
    res.json({ runs: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /intelligence/relations ────────────────────────────────────────────

const RelationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  symbol: z.string().optional(),
  min_strength: z.coerce.number().min(0).max(1).default(0),
});

router.get('/relations', async (req, res, next) => {
  try {
    const { limit, symbol, min_strength } = RelationsQuery.parse(req.query);
    const cacheKey = `intel:relations:${symbol ?? 'all'}:${min_strength}:${limit}`;

    const rows = await withCache(cacheKey, TTL.ohlcv_daily, async () => {
      let where = `WHERE strength >= @min_strength`;
      const params: Record<string, unknown> = { limit, min_strength };
      if (symbol) {
        where += ` AND (entity_a = @symbol OR entity_b = @symbol)`;
        params.symbol = symbol.toUpperCase();
      }
      return runQuery(`
        SELECT
          entity_a, entity_b, relationship_type,
          strength, direction, window_days, observation_time
        FROM \`${PROJECT}.features.relationship_features\`
        ${where}
        ORDER BY strength DESC
        LIMIT @limit
      `, params);
    });

    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /intelligence/warehouse/status ─────────────────────────────────────

router.get('/warehouse/status', async (req, res, next) => {
  try {
    const cacheKey = 'intel:warehouse:status';
    const status = await withCache(cacheKey, TTL.ohlcv_daily, async () => {
      const tables = [
        { dataset: 'raw_api', table: 'ohlcv_raw' },
        { dataset: 'cleaned', table: 'ohlcv_cleaned' },
        { dataset: 'features', table: 'returns_features' },
        { dataset: 'artifacts', table: 'research_artifacts' },
        { dataset: 'research', table: 'intelligence_timeline' },
        { dataset: 'model_outputs', table: 'model_runs' },
      ];

      const counts = await Promise.all(
        tables.map(async ({ dataset, table }) => {
          try {
            const rows = await runQuery<{ row_count: bigint }>(
              `SELECT COUNT(*) as row_count FROM \`${PROJECT}.${dataset}.${table}\` LIMIT 1`
            );
            return { table: `${dataset}.${table}`, row_count: Number(rows[0]?.row_count ?? 0), ok: true };
          } catch {
            return { table: `${dataset}.${table}`, row_count: 0, ok: false };
          }
        })
      );

      return { tables: counts, checked_at: new Date().toISOString() };
    });

    res.json(status);
  } catch (err) { next(err); }
});

export default router;
