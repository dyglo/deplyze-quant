/**
 * intelligenceTools.ts — server-side tools the Research Copilot can call.
 *
 * Each tool reads the SAME evidence the product already exposes (agent outputs,
 * cross-system reasoning, regime/risk, narrative exposure, historical analogs,
 * portfolio awareness) so Copilot answers are grounded in real, citable data
 * rather than the model's parametric memory.
 *
 * Every executor is read-only, parameterized, cost-guarded (maximum_bytes_billed
 * + job timeout) and returns a COMPACT, JSON-serialisable payload plus the
 * source table(s) for citation. Executors never throw — failures come back as
 * { ok: false, error } so the tool-use loop can continue.
 */

import { BigQuery, type Query } from '@google-cloud/bigquery';
import { Type } from '@google/genai';
import type { ToolDeclaration } from './gemini';

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant';
const ARTIFACTS_DS = process.env.BQ_DATASET_ARTIFACTS ?? 'artifacts';
const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? '';

let _bq: BigQuery | null = null;
function getBQ(): BigQuery {
  if (!_bq) _bq = new BigQuery({ projectId: PROJECT, location: 'US' });
  return _bq;
}

async function runQuery<T>(
  query: string,
  params: Record<string, unknown> = {},
  types: Record<string, string | string[]> = {},
): Promise<T[]> {
  const options: Query = {
    query,
    params,
    location: 'US',
    maximumBytesBilled: String(100 * 1024 * 1024), // 100 MB cap
    jobTimeoutMs: 15_000,                           // tool calls must stay snappy
  };
  if (Object.keys(types).length) options.types = types as Query['types'];
  const [rows] = await getBQ().query(options);
  return rows as T[];
}

function truncate(v: unknown, n = 600): unknown {
  return typeof v === 'string' && v.length > n ? `${v.slice(0, n)}…` : v;
}

function safeJson<T>(v: string | null): T | null {
  if (!v) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

async function engineIdToken(audience: string): Promise<string> {
  try {
    const resp = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3_000) },
    );
    if (resp.ok) return resp.text();
  } catch { /* local dev — no metadata server */ }
  return '';
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  sources?: string[];
}

// ─── Tool declarations (exposed to the model) ──────────────────────────────────

export const INTELLIGENCE_TOOLS: ToolDeclaration[] = [
  {
    name: 'get_agent_intelligence',
    description:
      'Recent background-agent intelligence (macro, regime, volatility, risk, liquidity, sentiment, cross-asset, opportunity, earnings). Use to ground claims about current market state. Optionally filter by domain, symbol, or minimum severity.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        domain: { type: Type.STRING, description: "e.g. 'macro','regime','volatility','risk','liquidity','sentiment','cross_asset','opportunity','earnings'" },
        symbol: { type: Type.STRING, description: 'Ticker the output must reference, e.g. AAPL' },
        severity: { type: Type.STRING, description: "Exact severity filter: 'high','medium','low','info'" },
        days: { type: Type.INTEGER, description: 'Lookback window in days (1-14, default 3)' },
        limit: { type: Type.INTEGER, description: 'Max rows (1-15, default 8)' },
      },
    },
  },
  {
    name: 'get_market_reasoning',
    description:
      'Latest multi-system synthesized reasoning artifacts — the cross-agent narrative of what the combined evidence implies. Use for a holistic market read.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: { type: Type.INTEGER, description: 'Lookback window in days (1-7, default 3)' },
        limit: { type: Type.INTEGER, description: 'Max rows (1-8, default 5)' },
      },
    },
  },
  {
    name: 'get_regime_and_risk',
    description:
      'The single latest composite market-regime transition and the latest risk-environment observation. Use for "what regime are we in" / "what is the risk backdrop" questions.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_narrative_exposure',
    description:
      'Active market narratives/themes that the given symbols are exposed to, with polarity and intensity. Use to explain thematic drivers behind a name or basket.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbols: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tickers, e.g. ["NVDA","AMD"]' },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_historical_analogs',
    description:
      'Historical periods whose macro/volatility conditions most resemble the present, computed by the quant engine. Use for "when has this happened before" questions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        lookback_years: { type: Type.INTEGER, description: 'Search window in years (3-20, default 10)' },
        top_k: { type: Type.INTEGER, description: 'Number of analogs (1-8, default 4)' },
      },
    },
  },
  {
    name: 'get_portfolio_context',
    description:
      'Latest portfolio-awareness snapshot for a portfolio_id: KPIs, risk decomposition, and narrative lines. Use only when the user references a specific portfolio and a portfolio_id is available in context.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        portfolio_id: { type: Type.STRING, description: 'The portfolio id from context' },
      },
      required: ['portfolio_id'],
    },
  },
];

// ─── Executors ─────────────────────────────────────────────────────────────────

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

async function getAgentIntelligence(args: Record<string, unknown>): Promise<ToolResult> {
  const days = clampInt(args.days, 1, 14, 3);
  const limit = clampInt(args.limit, 1, 15, 8);
  const wheres = ['DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)', 'is_test = FALSE'];
  const params: Record<string, unknown> = { days, lim: limit };
  const types: Record<string, string | string[]> = { days: 'INT64', lim: 'INT64' };
  if (typeof args.domain === 'string' && args.domain) { wheres.push('domain = @domain'); params.domain = args.domain; types.domain = 'STRING'; }
  if (typeof args.severity === 'string' && args.severity) { wheres.push('severity = @severity'); params.severity = args.severity; types.severity = 'STRING'; }
  if (typeof args.symbol === 'string' && args.symbol) { wheres.push('@symbol IN UNNEST(symbols)'); params.symbol = args.symbol.toUpperCase(); types.symbol = 'STRING'; }
  const rows = await runQuery<Record<string, unknown>>(`
    SELECT agent_id, domain, artifact_type, title, summary, severity, confidence,
           symbols, observation_date
    FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
    WHERE ${wheres.join(' AND ')}
    ORDER BY generated_at DESC
    LIMIT @lim
  `, params, types);
  return { ok: true, data: rows.map((r) => ({ ...r, summary: truncate(r.summary) })), sources: ['artifacts.agent_outputs'] };
}

async function getMarketReasoning(args: Record<string, unknown>): Promise<ToolResult> {
  const days = clampInt(args.days, 1, 7, 3);
  const limit = clampInt(args.limit, 1, 8, 5);
  const rows = await runQuery<Record<string, unknown>>(`
    SELECT title, summary, body, confidence, severity, observation_date
    FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
    WHERE artifact_type = 'multi_system_reasoning'
      AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
      AND is_test = FALSE
    ORDER BY generated_at DESC
    LIMIT @lim
  `, { days, lim: limit }, { days: 'INT64', lim: 'INT64' });
  return {
    ok: true,
    data: rows.map((r) => ({ ...r, summary: truncate(r.summary), body: truncate(r.body, 1200) })),
    sources: ['artifacts.agent_outputs'],
  };
}

async function getRegimeAndRisk(): Promise<ToolResult> {
  const rows = await runQuery<Record<string, unknown>>(`
    SELECT artifact_type, title, summary, body, confidence, severity, observation_date
    FROM \`${PROJECT}.${ARTIFACTS_DS}.agent_outputs\`
    WHERE agent_id IN ('regime_agent', 'risk_agent')
      AND artifact_type IN ('regime_transition', 'risk_observation')
      AND DATE(observation_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      AND is_test = FALSE
    QUALIFY ROW_NUMBER() OVER (PARTITION BY artifact_type ORDER BY generated_at DESC) = 1
  `);
  return {
    ok: true,
    data: rows.map((r) => ({ ...r, summary: truncate(r.summary), body: truncate(r.body, 1200) })),
    sources: ['artifacts.agent_outputs'],
  };
}

async function getNarrativeExposure(args: Record<string, unknown>): Promise<ToolResult> {
  const raw = Array.isArray(args.symbols) ? args.symbols : [];
  const symbols = raw.map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 25);
  if (!symbols.length) return { ok: false, error: 'symbols is required (non-empty array of tickers)' };
  const rows = await runQuery<Record<string, unknown>>(`
    SELECT m.theme_id, m.theme_label, m.polarity_mean, m.intensity_mean, m.lifetime_score,
           ARRAY(SELECT s FROM UNNEST(m.related_symbols) s WHERE s IN UNNEST(@symbols)) AS matching_symbols
    FROM \`${PROJECT}.research.narrative_memory\` m
    WHERE TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_seen_at, DAY) <= 30
      AND m.theme_label IS NOT NULL
      AND EXISTS (SELECT 1 FROM UNNEST(m.related_symbols) rs WHERE rs IN UNNEST(@symbols))
    QUALIFY ROW_NUMBER() OVER (PARTITION BY m.theme_id ORDER BY m.last_seen_at DESC) = 1
    ORDER BY m.lifetime_score DESC
    LIMIT 15
  `, { symbols }, { symbols: ['STRING'] });
  return { ok: true, data: rows, sources: ['research.narrative_memory'] };
}

async function getHistoricalAnalogs(args: Record<string, unknown>): Promise<ToolResult> {
  if (!QUANT_ENGINE_URL) return { ok: false, error: 'historical analog engine not configured' };
  const lookback = clampInt(args.lookback_years, 3, 20, 10);
  const topK = clampInt(args.top_k, 1, 8, 4);
  try {
    const token = await engineIdToken(QUANT_ENGINE_URL);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(
      `${QUANT_ENGINE_URL}/agents/analog?lookback_years=${lookback}&top_k=${topK}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!resp.ok) return { ok: false, error: `quant-engine ${resp.status}` };
    return { ok: true, data: await resp.json(), sources: ['quant-engine:/agents/analog'] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function getPortfolioContext(args: Record<string, unknown>): Promise<ToolResult> {
  const pid = typeof args.portfolio_id === 'string' ? args.portfolio_id : '';
  if (!pid) return { ok: false, error: 'portfolio_id is required' };
  const rows = await runQuery<Record<string, string | null>>(`
    SELECT snapshot_date,
           TO_JSON_STRING(kpis) AS kpis,
           TO_JSON_STRING(risk_decomposition) AS risk_decomposition,
           TO_JSON_STRING(narrative_lines) AS narrative_lines
    FROM \`${PROJECT}.${ARTIFACTS_DS}.portfolio_awareness_synthesis\`
    WHERE portfolio_id = @pid
      AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    ORDER BY snapshot_date DESC, generated_at DESC
    LIMIT 1
  `, { pid }, { pid: 'STRING' });
  if (!rows.length) return { ok: false, error: 'no recent snapshot for this portfolio' };
  const r = rows[0];
  return {
    ok: true,
    data: {
      snapshot_date: r.snapshot_date,
      kpis: safeJson(r.kpis),
      risk_decomposition: safeJson(r.risk_decomposition),
      narrative_lines: safeJson(r.narrative_lines),
    },
    sources: ['artifacts.portfolio_awareness_synthesis'],
  };
}

const EXECUTORS: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
  get_agent_intelligence: getAgentIntelligence,
  get_market_reasoning: getMarketReasoning,
  get_regime_and_risk: getRegimeAndRisk,
  get_narrative_exposure: getNarrativeExposure,
  get_historical_analogs: getHistoricalAnalogs,
  get_portfolio_context: getPortfolioContext,
};

/** Run a tool by name. Never throws — returns { ok:false, error } on failure. */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const fn = EXECUTORS[name];
  if (!fn) return { ok: false, error: `unknown tool: ${name}` };
  try {
    return await fn(args ?? {});
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
