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

const router = Router();

const BACKTEST_ENGINE_URL = process.env.BACKTEST_ENGINE_URL ?? '';

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

export default router;
