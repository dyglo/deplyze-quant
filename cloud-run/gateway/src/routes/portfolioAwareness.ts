/**
 * /v1/portfolio-awareness — gateway routes for the Portfolio Awareness
 * Synthesis snapshot store.
 *
 * Routes:
 *   POST /portfolio-awareness/:portfolioId/snapshot
 *        Body: SynthesisPayloadIn (no portfolio_id; taken from path).
 *        Proxies to quant-engine for write; on success returns the
 *        artifact + snapshot_date.
 *
 *   GET  /portfolio-awareness/:portfolioId/latest
 *        Returns the most recent snapshot within max_age_days (default 7).
 *        Reads directly from BigQuery (no quant-engine hop) so the page
 *        loads fast.
 *
 * Auth: protected by the shared router middleware in index.ts.
 */

import { Router } from 'express';
import { BigQuery } from '@google-cloud/bigquery';

const router = Router();

const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? '';
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant';
const ARTIFACTS_DS = process.env.BQ_DATASET_ARTIFACTS ?? 'artifacts';
const TABLE = 'portfolio_awareness_synthesis';

let _bq: BigQuery | null = null;
function getBQ(): BigQuery {
  if (!_bq) {
    _bq = new BigQuery({
      projectId: PROJECT,
      location: 'US',
    });
  }
  return _bq;
}

async function getEngineIdToken(audience: string): Promise<string> {
  try {
    const metaUrl =
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity` +
      `?audience=${encodeURIComponent(audience)}`;
    const resp = await fetch(metaUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(3_000),
    });
    if (resp.ok) return resp.text();
  } catch { /* local dev — no metadata server */ }
  return '';
}

// ─── POST /portfolio-awareness/:pid/snapshot ────────────────────────────────

router.post('/:portfolioId/snapshot', async (req, res, next) => {
  try {
    const pid = String(req.params.portfolioId ?? '');
    if (!pid) return res.status(400).json({ error: 'portfolioId required' });

    if (!QUANT_ENGINE_URL) {
      return res.status(503).json({ error: 'Portfolio awareness engine not configured' });
    }

    const idToken = await getEngineIdToken(QUANT_ENGINE_URL);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

    const url = `${QUANT_ENGINE_URL}/portfolio-awareness/${encodeURIComponent(pid)}/snapshot`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `quant-engine: ${text || response.statusText}` });
    }
    res.json(await response.json());
  } catch (err) {
    next(err);
  }
});

// ─── GET /portfolio-awareness/:pid/latest ───────────────────────────────────
// Reads directly from BigQuery for low latency (page load critical path).

interface SnapshotRow {
  artifact_id: string;
  portfolio_id: string;
  snapshot_date: { value: string } | string;
  generated_at: { value: string } | string;
  benchmark_id: string | null;
  kpis: string | null;
  contributors: string | null;
  sector_breakdown: string | null;
  risk_decomposition: string | null;
  monitor_probes: string | null;
  narrative_lines: string | null;
  holding_symbols: string[] | null;
  source_tables: string[] | null;
  lineage_id: string;
}

function unwrapDate(v: { value: string } | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.value;
}

function safeJson<T>(v: string | null): T | null {
  if (!v) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

router.get('/:portfolioId/latest', async (req, res, next) => {
  try {
    const pid = String(req.params.portfolioId ?? '');
    if (!pid) return res.status(400).json({ error: 'portfolioId required' });
    const maxAgeDays = Math.max(1, Math.min(90, Number(req.query.max_age_days ?? 7) || 7));

    const bq = getBQ();
    const query = `
      SELECT
        artifact_id, portfolio_id, snapshot_date, generated_at, benchmark_id,
        TO_JSON_STRING(kpis) AS kpis,
        TO_JSON_STRING(contributors) AS contributors,
        TO_JSON_STRING(sector_breakdown) AS sector_breakdown,
        TO_JSON_STRING(risk_decomposition) AS risk_decomposition,
        TO_JSON_STRING(monitor_probes) AS monitor_probes,
        TO_JSON_STRING(narrative_lines) AS narrative_lines,
        holding_symbols, source_tables, lineage_id
      FROM \`${PROJECT}.${ARTIFACTS_DS}.${TABLE}\`
      WHERE portfolio_id = @portfolio_id
        AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @max_age_days DAY)
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT 1
    `;
    const [rows] = await bq.query({
      query,
      params: { portfolio_id: pid, max_age_days: maxAgeDays },
      location: 'US',
      maximumBytesBilled: String(50 * 1024 * 1024),
    });

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'No snapshot in window' });
    }

    const r = rows[0] as SnapshotRow;
    res.json({
      artifact_id: r.artifact_id,
      portfolio_id: r.portfolio_id,
      snapshot_date: unwrapDate(r.snapshot_date),
      generated_at: unwrapDate(r.generated_at),
      benchmark_id: r.benchmark_id,
      kpis: safeJson(r.kpis),
      contributors: safeJson(r.contributors),
      sector_breakdown: safeJson(r.sector_breakdown),
      risk_decomposition: safeJson(r.risk_decomposition),
      monitor_probes: safeJson(r.monitor_probes),
      narrative_lines: safeJson(r.narrative_lines),
      holding_symbols: r.holding_symbols ?? [],
      source_tables: r.source_tables ?? [],
      lineage_id: r.lineage_id,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
