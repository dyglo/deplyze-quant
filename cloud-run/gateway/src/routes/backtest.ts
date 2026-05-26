/**
 * /v1/backtest — proxy to the Rust backtest engine (deplyze-backtest-engine).
 *
 * The Rust service owns all execution. The gateway authenticates the user
 * (Firebase, via shared middleware), validates the StrategySpec with zod
 * (structurally mirroring the Rust `models.rs` contract), stamps the user tier
 * (hardcoded "Pro" in Sprint 1), and forwards with a service-to-service OIDC
 * token. The engine is deployed --no-allow-unauthenticated.
 *
 * Routes:
 *   GET  /backtest/signals   — signal catalog (proxied)
 *   POST /backtest/validate  — validate a spec without computing (proxied)
 *   POST /backtest/run       — run a backtest (validated + proxied)
 */

import { Router } from 'express';
import { z } from 'zod';
import { geminiGenerate } from '../services/gemini';

const router = Router();

const BACKTEST_ENGINE_URL = process.env.BACKTEST_ENGINE_URL ?? '';
const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL ?? '';

// Fetches a short-lived Google-signed OIDC token for service-to-service auth.
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
  } catch {
    /* local dev — no metadata server */
  }
  return '';
}

// ─── Zod schema — structural mirror of Rust models.rs StrategySpec ─────────────

const Direction = z.enum(['Above', 'Below', 'CrossUp', 'CrossDown']);
const SignalType = z.enum([
  'MacroRegime',
  'NarrativeScore',
  'YieldSpread',
  'VolatilityZScore',
  'MomentumFactor',
  'CarryFactor',
]);
const Operator = z.enum(['AND', 'OR']);
const RebalanceFreq = z.enum(['Daily', 'Weekly', 'Monthly', 'OnSignal']);

const SignalConfig = z.object({
  signal_id: z.string().min(1),
  signal_type: SignalType,
  threshold: z.number(),
  direction: Direction,
  weight: z.number(),
});

// Accept "signal_id" shorthand OR a full condition object (matches the Rust
// de_conditions deserializer).
const Condition = z.union([
  z.string().min(1),
  z.object({
    signal_id: z.string().min(1),
    direction: Direction.optional(),
    threshold: z.number().optional(),
  }),
]);

const LogicExpression = z.object({
  operator: Operator,
  conditions: z.array(Condition),
});

const PositionSizing = z.discriminatedUnion('method', [
  z.object({ method: z.literal('FixedFractional'), fraction: z.number().positive() }),
  z.object({ method: z.literal('Kelly'), kelly_fraction: z.number().optional() }),
  z.object({ method: z.literal('EqualWeight') }),
  z.object({ method: z.literal('VolTarget'), target_annual_vol: z.number().positive().optional() }),
]);

const RiskParams = z.object({
  max_drawdown_pct: z.number(),
  position_cap_pct: z.number(),
  rebalance_freq: RebalanceFreq,
  risk_per_trade_pct: z.number().optional(),
  min_rr: z.number().optional(),
});

const CostModel = z
  .object({
    commission_bps: z.number().optional(),
    slippage_bps: z.number().optional(),
  })
  .optional();

const StrategySpec = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  date_range: z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  signals: z.array(SignalConfig).min(1),
  entry_logic: LogicExpression,
  exit_logic: LogicExpression,
  position_sizing: PositionSizing,
  risk_params: RiskParams,
  comparison_mode: z.boolean().optional(),
  // tier is server-stamped; ignore any client value.
  cost_model: CostModel,
  // Instrument selects the per-instrument parquet in GCS.
  instrument: z.string().min(1).max(20).optional(),
  // Starting capital for the dollar P&L surface (cosmetic; does not affect ratios).
  starting_capital: z.number().positive().optional(),
});

// ─── Proxy helper ───────────────────────────────────────────────────────────────

async function proxy(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; json: unknown }> {
  const url = `${BACKTEST_ENGINE_URL}${path}`;
  const idToken = await getEngineIdToken(BACKTEST_ENGINE_URL);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  const resp = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await resp.json().catch(() => ({}));
  return { status: resp.status, json };
}

function ensureConfigured(res: import('express').Response): boolean {
  if (!BACKTEST_ENGINE_URL) {
    res.status(503).json({ error: 'Backtest engine not configured', code: 'ENGINE_UNCONFIGURED' });
    return false;
  }
  return true;
}

// ─── GET /backtest/signals ──────────────────────────────────────────────────────

router.get('/signals', async (_req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;
    const { status, json } = await proxy('GET', '/backtest/signals', undefined, 10_000);
    res.status(status).json(json);
  } catch (err) {
    next(err);
  }
});

// ─── POST /backtest/validate ──────────────────────────────────────────────────

router.post('/validate', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;
    const spec = StrategySpec.parse(req.body);
    const { status, json } = await proxy('POST', '/backtest/validate', { ...spec, tier: 'Pro' }, 15_000);
    res.status(status).json(json);
  } catch (err) {
    next(err);
  }
});

// ─── POST /backtest/run ─────────────────────────────────────────────────────────

router.post('/run', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;
    const spec = StrategySpec.parse(req.body);
    // Tier is server-authoritative — Sprint 1 stamps every user as Pro.
    const { status, json } = await proxy('POST', '/backtest/run', { ...spec, tier: 'Pro' }, 120_000);
    res.status(status).json(json);
  } catch (err) {
    next(err);
  }
});

// ─── POST /backtest/prepare-instrument ──────────────────────────────────────────
// Trigger on-demand per-instrument parquet build in quant-engine. The frontend
// calls this before /run when it detects the instrument has changed.

const PrepareBody = z.object({
  symbol: z.string().min(1).max(20),
  lookback_days: z.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post('/prepare-instrument', async (req, res, next) => {
  try {
    if (!QUANT_ENGINE_URL) {
      res.status(503).json({ error: 'Quant engine not configured', code: 'ENGINE_UNCONFIGURED' });
      return;
    }
    const { symbol, lookback_days, start_date, end_date } = PrepareBody.parse(req.body);
    const idToken = await getEngineIdToken(QUANT_ENGINE_URL);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
    const resp = await fetch(`${QUANT_ENGINE_URL}/pipelines/backtest/prepare-instrument`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ symbol: symbol.toUpperCase(), lookback_days, start_date, end_date }),
      signal: AbortSignal.timeout(300_000), // 5 min — provider fetch + GCS upload
    });
    const json = await resp.json().catch(() => ({}));
    res.status(resp.status).json(json);
  } catch (err) { next(err); }
});

// ─── helpers ────────────────────────────────────────────────────────────────────

function extractJson(s: string): unknown | null {
  const trimmed = s.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  try { return JSON.parse(candidate); } catch { /* fall through */ }
  const a = candidate.indexOf('{');
  const b = candidate.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(candidate.slice(a, b + 1)); } catch { return null; }
  }
  return null;
}

// ─── POST /backtest/resolve ──────────────────────────────────────────────────
// NLP → StrategySpec: converts a natural-language intent into a structured
// StrategySpec JSON. Follows the same geminiGenerate pattern as /historical-research/plan.

const ResolveBody = z.object({
  query: z.string().min(2).max(1000),
});

const SIGNAL_ID_MAP: Record<string, string> = {
  macro_regime: 'macro_regime_risk_on',
  yield_spread: 'yield_curve_10y2y',
  vol_zscore: 'realized_vol_z',
  momentum_12_1: 'ts_momentum_12_1',
};

function normalizeSignalId(signalId: string): string {
  return SIGNAL_ID_MAP[signalId] ?? signalId;
}

function normalizeSpec(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const spec = JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>;
  if (typeof spec.instrument === 'string') {
    const compact = spec.instrument.toUpperCase().replace(/[/-]/g, '');
    spec.instrument = compact === 'GOLD' || compact === 'XAU' ? 'XAUUSD' : compact;
  }
  if (Array.isArray(spec.signals)) {
    spec.signals = spec.signals.map((signal) => {
      if (!signal || typeof signal !== 'object') return signal;
      const next = { ...(signal as Record<string, unknown>) };
      if (typeof next.signal_id === 'string') next.signal_id = normalizeSignalId(next.signal_id);
      return next;
    });
  }
  for (const key of ['entry_logic', 'exit_logic']) {
    const logic = spec[key];
    if (!logic || typeof logic !== 'object') continue;
    const nextLogic = { ...(logic as Record<string, unknown>) };
    if (Array.isArray(nextLogic.conditions)) {
      nextLogic.conditions = nextLogic.conditions.map((condition) => {
        if (typeof condition === 'string') return normalizeSignalId(condition);
        if (!condition || typeof condition !== 'object') return condition;
        const next = { ...(condition as Record<string, unknown>) };
        if (typeof next.signal_id === 'string') next.signal_id = normalizeSignalId(next.signal_id);
        return next;
      });
    }
    spec[key] = nextLogic;
  }
  return spec;
}

async function resolveViaQuantEngine(query: string): Promise<unknown | null> {
  if (!QUANT_ENGINE_URL) return null;
  const idToken = await getEngineIdToken(QUANT_ENGINE_URL);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const resp = await fetch(`${QUANT_ENGINE_URL}/pipelines/backtest/resolve-intent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await resp.json().catch(() => ({}));
  if (resp.ok && json && typeof json === 'object' && 'spec' in json) {
    return (json as { spec: unknown }).spec;
  }
  const message =
    json && typeof json === 'object' && 'detail' in json
      ? JSON.stringify((json as { detail: unknown }).detail)
      : `status ${resp.status}`;
  console.warn('[backtest.resolve] quant resolver failed', { status: resp.status, message });
  return null;
}

const RESOLVE_SYSTEM = `
You are the Backtesting Strategy Planner for an institutional quantitative research terminal.
You convert a user's natural-language trading idea into a STRICT JSON StrategySpec that the
Deplyze backtest engine can execute directly. No prose, no markdown fences, no commentary — output ONE JSON object only.

StrategySpec schema:
{
  "id":   string,        // "strat_" + short kebab-case slug of the idea
  "name": string,        // human-readable name (< 60 chars)
  "instrument": string,  // uppercase ticker, e.g. "SPY", "QQQ", "GLD", "TLT", "USO", "IWM"
  "date_range": {
    "start_date": "YYYY-MM-DD",
    "end_date":   "YYYY-MM-DD"   // today if user doesn't specify
  },
  "signals": [           // 1..4 signals chosen from the available catalog below
    {
      "signal_id":   string,   // exact id from catalog
      "signal_type": string,   // exact type from catalog
      "threshold":   number,   // e.g. 0.0 for MacroRegime, 1.0 for VolatilityZScore z-score
      "direction":   "Above" | "Below" | "CrossUp" | "CrossDown",
      "weight":      number    // 0.0..1.0, sum of weights should be ≈ 1
    }
  ],
  "entry_logic": {
    "operator": "AND" | "OR",
    "conditions": [{ "signal_id": string, "direction": "Above"|"Below"|"CrossUp"|"CrossDown", "threshold": number }]
  },
  "exit_logic": {
    "operator": "AND" | "OR",
    "conditions": [{ "signal_id": string, "direction": "Above"|"Below"|"CrossUp"|"CrossDown", "threshold": number }]
  },
  "position_sizing": one of:
    { "method": "FixedFractional", "fraction": 0.95 }
    { "method": "Kelly", "kelly_fraction": 0.5 }
    { "method": "EqualWeight" }
    { "method": "VolTarget", "target_annual_vol": 0.10 },
  "risk_params": {
    "max_drawdown_pct": number,  // e.g. 0.20 for 20% drawdown stop
    "position_cap_pct": number,  // e.g. 1.0 for 100% max position
    "rebalance_freq":   "Daily" | "Weekly" | "Monthly" | "OnSignal",
    "risk_per_trade_pct": number,
    "min_rr": number
  },
  "comparison_mode": boolean,
  "cost_model": { "commission_bps": number, "slippage_bps": number }
}

Available signal catalog (use exact signal_id and signal_type):
- signal_id: "macro_regime_risk_on", signal_type: "MacroRegime",       threshold: 0 (Above=risk-on, Below=risk-off)
- signal_id: "yield_curve_10y2y",    signal_type: "YieldSpread",       threshold: 0 (CrossDown=inversion)
- signal_id: "yield_curve_10y3m",    signal_type: "YieldSpread",       threshold: 0 (CrossDown=inversion)
- signal_id: "realized_vol_z",       signal_type: "VolatilityZScore",  threshold: 1.0 (Below=low vol, Above=high vol)
- signal_id: "ts_momentum_12_1",     signal_type: "MomentumFactor",    threshold: 0 (Above=positive momentum)
- signal_id: "liquidity_composite",  signal_type: "MacroRegime",       threshold: 0
- signal_id: "inflation_persistence", signal_type: "MacroRegime",      threshold: 0

Rules:
- Exit conditions should be the logical inverse of entry (e.g. entry Above 0 → exit Below 0).
- Use "VolTarget" sizing for risk-aware ideas, "FixedFractional" for simple ideas.
- If the user mentions a specific instrument, use it; otherwise default to "SPY".
- If the user asks for comparison, set comparison_mode: true.
- Be conservative: max_drawdown_pct=0.20, position_cap_pct=1.0, commission_bps=1.0, slippage_bps=2.0 unless user specifies.
- Default date range: past 10 years from today.
`.trim();

router.post('/resolve', async (req, res, next) => {
  try {
    const { query } = ResolveBody.parse(req.body);
    const quantSpec = await resolveViaQuantEngine(query);
    if (quantSpec) {
      const spec = StrategySpec.parse(normalizeSpec(quantSpec));
      res.json({ spec });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const raw = await geminiGenerate({
      systemInstruction: RESOLVE_SYSTEM,
      prompt: `Today is ${today}.\n\nUser strategy idea: ${query}\n\nReturn the StrategySpec JSON now.`,
      temperature: 0.1,
    });
    console.info('[backtest.resolve] raw_llm_output', { sample: raw.slice(0, 2000) });
    const spec = extractJson(raw);
    if (!spec) {
      res.status(502).json({
        error: 'Resolver returned unparseable output',
        code: 'NLP_PARSE_FAILED',
        clarifying_question: 'Could you restate the instrument, time window, entry signal, and exit rule?',
      });
      return;
    }
    const parsed = StrategySpec.parse(normalizeSpec(spec));
    res.json({ spec: parsed });
  } catch (err) { next(err); }
});

// ─── POST /backtest/commentary ───────────────────────────────────────────────
// Given completed backtest results + the original query, produce a short
// institutional commentary. Follows the same pattern as /historical-research/reason.

const CommentaryBody = z.object({
  query: z.string().min(2).max(500),
  metrics: z.record(z.union([z.string(), z.number()])),
  context: z.string().max(2000).optional(),
});

const COMMENTARY_SYSTEM = `
You produce a short institutional backtesting commentary on quantitative strategy results.

Hard rules:
- 3 to 6 sentences. No headings, no bullets, no markdown.
- Reference ONLY the metrics you are given. Never introduce a number, ticker, or date
  not in the metrics object.
- Tone: calm, evidence-oriented, probabilistic. No "buy/sell" language. No guarantees.
  Prefer "historically", "over the tested window", "the strategy tended to", "regime-conditional".
- Address: Sharpe quality (is it statistically meaningful?), drawdown profile, regime
  performance differences (if provided), and the signal contribution narrative.
- If Deflated Sharpe < 0 or PSR < 0.5, note the strategy may not be robust.
- Conclude with a one-sentence forward-looking caution grounded in the regime context.
`.trim();

router.post('/commentary', async (req, res, next) => {
  try {
    const body = CommentaryBody.parse(req.body);
    const metricsLines = Object.entries(body.metrics)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const prompt = [
      `User strategy idea: ${body.query}`,
      body.context ? `Strategy context: ${body.context}` : '',
      'Backtest metrics:',
      metricsLines || '(none)',
      '',
      'Write the institutional commentary now.',
    ].filter(Boolean).join('\n');

    const narrative = await geminiGenerate({
      systemInstruction: COMMENTARY_SYSTEM,
      prompt,
      temperature: 0.2,
    });
    res.json({ narrative });
  } catch (err) { next(err); }
});

export default router;
