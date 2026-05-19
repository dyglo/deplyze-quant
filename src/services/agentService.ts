/**
 * agentService.ts — typed client for the V4 Agents gateway routes.
 *
 * Wraps /v1/agents/outputs, /v1/agents/portfolio/:pid,
 * /v1/agents/registry, /v1/agents/status,
 * /v1/agents/regime, /v1/agents/risk.
 */

import { gatewayGet, ClientTTL } from './gatewayClient';
import type {
  AgentOutput,
  AgentRegistryEntry,
  AgentStatusEntry,
  AgentDomain,
  AgentSeverity,
  CompositeRegime,
  RiskEnvironment,
} from '../types/agents';

const AGENT_TTL = 5 * 60_000;   // 5 min — outputs are generated hourly at fastest
const REGIME_TTL = 10 * 60_000; // 10 min — regime rarely changes intraday

// ─── Agent outputs ────────────────────────────────────────────────────────────

export interface FetchOutputsOpts {
  domain?: AgentDomain;
  severity?: AgentSeverity;
  artifact_type?: string;
  symbol?: string;
  placement?: string;
  days?: number;
  limit?: number;
}

export async function fetchAgentOutputs(opts: FetchOutputsOpts = {}): Promise<AgentOutput[]> {
  const r = await gatewayGet<{ outputs: AgentOutput[]; count: number }>(
    '/agents/outputs',
    {
      domain: opts.domain ?? null,
      severity: opts.severity ?? null,
      artifact_type: opts.artifact_type ?? null,
      symbol: opts.symbol ?? null,
      placement: opts.placement ?? null,
      days: opts.days ?? 2,
      limit: opts.limit ?? 50,
    },
    AGENT_TTL,
  );
  return r.outputs ?? [];
}

export async function fetchAgentOutputsByDomain(
  domain: AgentDomain,
  opts: { days?: number; limit?: number } = {},
): Promise<AgentOutput[]> {
  const r = await gatewayGet<{ outputs: AgentOutput[]; domain: string; count: number }>(
    `/agents/outputs/${domain}`,
    { days: opts.days ?? 3, limit: opts.limit ?? 10 },
    AGENT_TTL,
  );
  return r.outputs ?? [];
}

// ─── Portfolio intelligence ───────────────────────────────────────────────────

export async function fetchPortfolioAgentOutputs(
  portfolioId: string,
  opts: { days?: number; limit?: number } = {},
): Promise<AgentOutput[]> {
  const r = await gatewayGet<{ outputs: AgentOutput[]; portfolio_id: string; count: number }>(
    `/agents/portfolio/${portfolioId}`,
    { days: opts.days ?? 3, limit: opts.limit ?? 40 },
    AGENT_TTL,
  );
  return r.outputs ?? [];
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export async function fetchAgentRegistry(): Promise<AgentRegistryEntry[]> {
  const r = await gatewayGet<{ agents: AgentRegistryEntry[]; count: number }>(
    '/agents/registry',
    undefined,
    ClientTTL.ohlcv_daily, // static — cache aggressively
  );
  return r.agents ?? [];
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function fetchAgentStatus(): Promise<AgentStatusEntry[]> {
  const r = await gatewayGet<{ status: AgentStatusEntry[]; date: string }>(
    '/agents/status',
    undefined,
    AGENT_TTL,
  );
  return r.status ?? [];
}

// ─── Regime ──────────────────────────────────────────────────────────────────

export async function fetchCompositeRegime(): Promise<AgentOutput | null> {
  const r = await gatewayGet<{ regime: AgentOutput | null }>(
    '/agents/regime',
    undefined,
    REGIME_TTL,
  );
  return r.regime ?? null;
}

// ─── Risk environment ─────────────────────────────────────────────────────────

export async function fetchRiskEnvironment(): Promise<AgentOutput | null> {
  const r = await gatewayGet<{ risk: AgentOutput | null }>(
    '/agents/risk',
    undefined,
    REGIME_TTL,
  );
  return r.risk ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the composite regime string from a regime AgentOutput's evidence blob.
 */
export function extractRegimeLabel(output: AgentOutput | null): string | null {
  if (!output?.evidence) return null;
  const ev = output.evidence as Record<string, unknown>;
  return (ev.composite_regime as string) ?? null;
}

/**
 * Extract the risk level string from a risk AgentOutput's evidence blob.
 */
export function extractRiskLevel(output: AgentOutput | null): string | null {
  if (!output?.evidence) return null;
  const ev = output.evidence as Record<string, unknown>;
  return (ev.risk_level as string) ?? null;
}
