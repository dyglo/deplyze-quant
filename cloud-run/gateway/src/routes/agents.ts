/**
 * /v1/agents — V4 Agentic Intelligence Layer gateway routes.
 *
 * Exposes agent outputs from artifacts.agent_outputs to the frontend.
 * All routes are auth-protected (via the shared router middleware in index.ts).
 * Queries are bounded (maximumBytesBilled) and cached.
 *
 * Routes:
 *   GET /agents/outputs            — recent agent outputs (filterable)
 *   GET /agents/outputs/:domain    — outputs for a specific intelligence domain
 *   GET /agents/portfolio/:pid     — portfolio-aware outputs (macro+regime+risk + portfolio-id match)
 *   GET /agents/registry           — static agent registry (client-side reference)
 *   GET /agents/status             — today's run summary per agent
 *   GET /agents/regime             — latest composite regime (from regime_agent)
 *   GET /agents/risk               — latest risk environment observation
 */

import { Router } from 'express';
import { z } from 'zod';
import { BigQuery } from '@google-cloud/bigquery';
import { withCache, TTL } from '../services/cache';

const router = Router();

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
const ARTIFACTS_DS = process.env.BQ_DATASET_ARTIFACTS ?? 'artifacts';

async function runQuery<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const bq = getBQ();
  const [rows] = await bq.query({
    query,
    params,
    location: 'US',
    maximumBytesBilled: String(100 * 1024 * 1024), // 100 MB cap
  });
  return rows as T[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentOutputRow {
  artifact_id: string;
  agent_id: string;
  domain: string;
  artifact_type: string;
  title: string | null;
  summary: string | null;
  body: string | null;
  confidence: number | null;
  severity: string | null;
  symbols: string[];
  portfolio_id: string | null;
  evidence: unknown;
  source_tables: string[];
  generated_at: { value: string } | string;
  observation_date: { value: string } | string;
  recommended_placements: string[];
  tags: string[];
  lineage_id: string | null;
}

// ─── GET /agents/outputs ──────────────────────────────────────────────────────

const OutputsQuery = z.object({
  domain: z.string().optional(),
  severity: z.enum(['high', 'medium', 'low', 'info']).optional(),
  artifact_type: z.string().optional(),
  symbol: z.string().optional(),
  placement: z.string().optional(),
  days: z.coerce.number().int().min(1).max(30).default(2),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get('/outputs', async (req, res, next) => {
  try {
    const q = OutputsQuery.parse(req.query);
    const cacheKey = `agents:outputs:${JSON.stringify(q)}`;
    const rows = await withCache<AgentOutputRow[]>(cacheKey, TTL.quote * 5, async () => {
      const wheres: string[] = [
        `DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${q.days} DAY)`,
        `is_test = FALSE`,
      ];
      if (q.domain) wheres.push(`domain = '${q.domain}'`);
      if (q.severity) wheres.push(`severity = '${q.severity}'`);
      if (q.artifact_type) wheres.push(`artifact_type = '${q.artifact_type}'`);
      if (q.symbol) wheres.push(`'${q.symbol}' IN UNNEST(symbols)`);
      if (q.placement) wheres.push(`'${q.placement}' IN UNNEST(recommended_placements)`);

      return runQuery<AgentOutputRow>(`
        SELECT
          artifact_id, agent_id, domain, artifact_type,
          title, summary, body, confidence, severity,
          symbols, portfolio_id, evidence,
          source_tables, generated_at, observation_date,
          recommended_placements, tags, lineage_id
        FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
        WHERE ${wheres.join(' AND ')}
        ORDER BY generated_at DESC
        LIMIT ${q.limit}
      `);
    });
    res.json({ outputs: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agents/outputs/:domain ─────────────────────────────────────────────

router.get('/outputs/:domain', async (req, res, next) => {
  try {
    const domain = req.params.domain;
    const limit = z.coerce.number().int().min(1).max(50).default(10).parse(req.query.limit);
    const days = z.coerce.number().int().min(1).max(14).default(3).parse(req.query.days);
    const cacheKey = `agents:domain:${domain}:${limit}:${days}`;
    const rows = await withCache<AgentOutputRow[]>(cacheKey, TTL.quote * 5, () =>
      runQuery<AgentOutputRow>(`
        SELECT
          artifact_id, agent_id, domain, artifact_type,
          title, summary, body, confidence, severity,
          symbols, portfolio_id, evidence,
          source_tables, generated_at, observation_date,
          recommended_placements, tags
        FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
        WHERE domain = '${domain}'
          AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT ${limit}
      `),
    );
    res.json({ outputs: rows, domain, count: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agents/portfolio/:portfolioId ───────────────────────────────────────

router.get('/portfolio/:portfolioId', async (req, res, next) => {
  try {
    const pid = req.params.portfolioId;
    const days = z.coerce.number().int().min(1).max(14).default(3).parse(req.query.days);
    const limit = z.coerce.number().int().min(1).max(100).default(40).parse(req.query.limit);
    const cacheKey = `agents:portfolio:${pid}:${days}`;
    const rows = await withCache<AgentOutputRow[]>(cacheKey, TTL.quote * 3, () =>
      runQuery<AgentOutputRow>(`
        SELECT
          artifact_id, agent_id, domain, artifact_type,
          title, summary, body, confidence, severity,
          symbols, portfolio_id, evidence,
          source_tables, generated_at, observation_date,
          recommended_placements, tags
        FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
        WHERE (
            portfolio_id = '${pid}'
            OR domain IN ('macro', 'regime', 'risk', 'liquidity')
          )
          AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT ${limit}
      `),
    );
    res.json({ outputs: rows, portfolio_id: pid, count: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agents/registry ────────────────────────────────────────────────────

const STATIC_REGISTRY = [
  { agent_id: 'macro_agent',       domain: 'macro',        trigger_type: 'scheduled', cadence: '09:45 ET weekdays', affected_pages: ['MacroRegimeDesk','IntelligenceTerminal','ResearchCopilot','PortfolioOverview','RiskRegimeFit'] },
  { agent_id: 'sentiment_agent',   domain: 'sentiment',    trigger_type: 'scheduled', cadence: 'Every 3 hours',     affected_pages: ['IntelligenceTerminal','ResearchCopilot','Briefings','InstrumentIntelligence'] },
  { agent_id: 'volatility_agent',  domain: 'volatility',   trigger_type: 'scheduled', cadence: '16:30 ET weekdays', affected_pages: ['IntelligenceTerminal','RiskRegimeFit','InstrumentIntelligence','ResearchCopilot'] },
  { agent_id: 'cross_asset_agent', domain: 'cross_asset',  trigger_type: 'scheduled', cadence: '17:00 ET weekdays', affected_pages: ['IntelligenceTerminal','ResearchCopilot','ExposureAnalysis','RelationsMap'] },
  { agent_id: 'liquidity_agent',   domain: 'liquidity',    trigger_type: 'scheduled', cadence: '10:00 ET weekdays', affected_pages: ['MacroRegimeDesk','IntelligenceTerminal','ResearchCopilot','RiskRegimeFit'] },
  { agent_id: 'regime_agent',      domain: 'regime',       trigger_type: 'scheduled', cadence: '10:15 ET weekdays', affected_pages: ['MacroRegimeDesk','RiskRegimeFit','PortfolioOverview','ResearchCopilot','ScenarioStress'] },
  { agent_id: 'opportunity_agent', domain: 'opportunity',  trigger_type: 'scheduled', cadence: '16:45 ET weekdays', affected_pages: ['IntelligenceTerminal','InstrumentIntelligence','ResearchCopilot'] },
  { agent_id: 'earnings_agent',    domain: 'earnings',     trigger_type: 'scheduled', cadence: '06:30 ET weekdays', affected_pages: ['IntelligenceTerminal','ResearchCopilot','Briefings'] },
  { agent_id: 'risk_agent',        domain: 'risk',         trigger_type: 'scheduled', cadence: '17:30 ET weekdays', affected_pages: ['RiskRegimeFit','ScenarioStress','PortfolioOverview','ResearchCopilot'] },
  { agent_id: 'research_copilot',  domain: 'research',     trigger_type: 'on_demand', cadence: 'On demand',         affected_pages: ['ResearchCopilot'] },
];

router.get('/registry', (_req, res) => {
  res.json({ agents: STATIC_REGISTRY, count: STATIC_REGISTRY.length });
});

// ─── GET /agents/status ───────────────────────────────────────────────────────

router.get('/status', async (req, res, next) => {
  try {
    const rows = await withCache<unknown[]>('agents:status:today', TTL.quote * 6, () =>
      runQuery<unknown>(`
        SELECT
          agent_id, domain,
          COUNT(*) AS output_count,
          MAX(generated_at) AS last_generated,
          COUNTIF(severity = 'high') AS high_severity_count
        FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
        WHERE DATE(observation_date) = CURRENT_DATE()
          AND is_test = FALSE
        GROUP BY agent_id, domain
        ORDER BY agent_id
      `),
    );
    res.json({ status: rows, date: new Date().toISOString().slice(0, 10) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agents/regime ──────────────────────────────────────────────────────

router.get('/regime', async (_req, res, next) => {
  try {
    const rows = await withCache<AgentOutputRow[]>('agents:regime:latest', TTL.quote * 8, () =>
      runQuery<AgentOutputRow>(`
        SELECT
          artifact_id, agent_id, domain, artifact_type,
          title, summary, body, confidence, severity,
          evidence, generated_at, observation_date, tags
        FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
        WHERE agent_id = 'regime_agent'
          AND artifact_type = 'regime_transition'
          AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT 1
      `),
    );
    res.json({ regime: rows[0] ?? null });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agents/risk ────────────────────────────────────────────────────────

router.get('/risk', async (_req, res, next) => {
  try {
    const rows = await withCache<AgentOutputRow[]>('agents:risk:latest', TTL.quote * 8, () =>
      runQuery<AgentOutputRow>(`
        SELECT
          artifact_id, agent_id, domain, artifact_type,
          title, summary, body, confidence, severity,
          evidence, generated_at, observation_date, tags
        FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
        WHERE agent_id = 'risk_agent'
          AND artifact_type = 'risk_observation'
          AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
          AND is_test = FALSE
        ORDER BY generated_at DESC
        LIMIT 1
      `),
    );
    res.json({ risk: rows[0] ?? null });
  } catch (err) {
    next(err);
  }
});

export default router;
