/**
 * V4 Agent Intelligence types — TypeScript contracts for agent outputs.
 * These mirror the Python AgentOutput schema and the gateway AgentOutputRow shape.
 */

export type AgentDomain =
  | 'macro'
  | 'sentiment'
  | 'volatility'
  | 'cross_asset'
  | 'liquidity'
  | 'regime'
  | 'opportunity'
  | 'earnings'
  | 'risk'
  | 'research';

export type AgentSeverity = 'high' | 'medium' | 'low' | 'info';

export type AgentTriggerType = 'scheduled' | 'event' | 'on_demand';

// ─── Agent output (from artifacts.agent_outputs) ──────────────────────────────

export interface AgentOutput {
  artifact_id: string;
  agent_id: string;
  domain: AgentDomain;
  artifact_type: string;
  title: string | null;
  summary: string | null;
  body: string | null;
  confidence: number | null;
  severity: AgentSeverity | null;
  symbols: string[];
  portfolio_id: string | null;
  evidence: Record<string, unknown> | null;
  source_tables: string[];
  generated_at: string;
  observation_date: string;
  recommended_placements: string[];
  tags: string[];
  lineage_id: string | null;
}

// ─── Registry entry (from /agents/registry) ───────────────────────────────────

export interface AgentRegistryEntry {
  agent_id: string;
  domain: AgentDomain;
  trigger_type: AgentTriggerType;
  cadence: string;
  affected_pages: string[];
}

// ─── Status entry (from /agents/status) ──────────────────────────────────────

export interface AgentStatusEntry {
  agent_id: string;
  domain: AgentDomain;
  output_count: number;
  last_generated: string | null;
  high_severity_count: number;
}

// ─── Composite regime (from /agents/regime) ───────────────────────────────────

export interface CompositeRegime {
  regime: string;           // "risk-on" | "risk-off" | "transition" | "stagflation" | etc.
  confidence: number;
  severity: AgentSeverity;
  evidence: Record<string, unknown>;
  generated_at: string;
}

// ─── Risk environment (from /agents/risk) ─────────────────────────────────────

export interface RiskEnvironment {
  risk_level: string;       // "benign" | "moderate" | "cautionary" | "elevated"
  composite_score: number;
  domain_scores: Record<string, number>;
  high_domains: string[];
  confidence: number;
  severity: AgentSeverity;
  generated_at: string;
}

// ─── Domain display metadata (UI-only) ────────────────────────────────────────

export const AGENT_DOMAIN_LABELS: Record<AgentDomain, string> = {
  macro: 'Macro',
  sentiment: 'Sentiment',
  volatility: 'Volatility',
  cross_asset: 'Cross-Asset',
  liquidity: 'Liquidity',
  regime: 'Regime',
  opportunity: 'Opportunity',
  earnings: 'Earnings',
  risk: 'Risk',
  research: 'Research',
};

export const AGENT_SEVERITY_ORDER: Record<AgentSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};
