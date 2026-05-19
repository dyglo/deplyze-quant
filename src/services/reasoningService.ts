/**
 * reasoningService.ts — typed clients for V4 Phase 2 reasoning endpoints.
 *
 * Wraps:
 *   GET  /v1/agents/reasoning         — multi-system synthesised reasoning
 *   GET  /v1/agents/analog            — historical analog search
 *   POST /v1/agents/vulnerability     — portfolio regime vulnerability
 *   GET  /v1/agents/narrative-exposure — narrative theme exposure by symbols
 */

import { gatewayGet, gatewayPost } from './gatewayClient';
import type { AgentOutput } from '../types/agents';

const REASONING_TTL = 8 * 60_000;   // 8 min
const ANALOG_TTL    = 30 * 60_000;  // 30 min — analogs rarely change intraday
const VULN_TTL      = 10 * 60_000;  // 10 min

// ─── Reasoning ────────────────────────────────────────────────────────────────

export async function fetchReasoningOutputs(): Promise<AgentOutput[]> {
  const r = await gatewayGet<{ reasoning: AgentOutput[]; count: number }>(
    '/agents/reasoning',
    undefined,
    REASONING_TTL,
  );
  return r.reasoning ?? [];
}

// ─── Historical analog ────────────────────────────────────────────────────────

export interface AnalogPeriod {
  date: string;
  similarity_score: number;
  distance: number;
  regime_label: string;
  feature_vector: {
    growth_zscore: number;
    liquidity_zscore: number;
    inflation_zscore: number;
    rates_zscore: number;
    vol_percentile: number;
  };
  context_note: string;
}

export interface AnalogResult {
  analogs: AnalogPeriod[];
  current_day: string | null;
  current_vector: AnalogPeriod['feature_vector'] | null;
  history_days: number;
  data_quality: 'full' | 'partial' | 'insufficient' | 'unavailable';
  data_quality_note?: string;
  source_tables: string[];
  generated_at: string;
  error?: string;
}

export async function fetchHistoricalAnalog(opts: {
  lookback_years?: number;
  top_k?: number;
} = {}): Promise<AnalogResult> {
  return gatewayGet<AnalogResult>(
    '/agents/analog',
    {
      lookback_years: opts.lookback_years ?? 10,
      top_k: opts.top_k ?? 4,
    },
    ANALOG_TTL,
  );
}

// ─── Portfolio vulnerability ──────────────────────────────────────────────────

export interface VulnerabilityDimension {
  score: number;
  label: 'high_risk' | 'moderate_risk' | 'neutral' | 'resilient';
  active: boolean;
  regime_state: string;
  top_contributors: string[];
}

export interface VulnerabilityResult {
  portfolio_id: string | null;
  composite_regime: string;
  composite_vulnerability_score: number;
  composite_label: 'high_risk' | 'moderate_risk' | 'neutral' | 'resilient';
  active_stress_dimensions: number;
  confidence: number;
  dimensions: Record<string, VulnerabilityDimension>;
  regime_context: Record<string, string>;
  safety_note: string;
  source_tables: string[];
  generated_at: string;
  error?: string;
}

export interface HoldingInput {
  symbol: string;
  weight: number;
  asset_class?: string;
}

export async function fetchPortfolioVulnerability(
  holdings: HoldingInput[],
  portfolioId?: string,
): Promise<VulnerabilityResult | null> {
  if (!holdings.length) return null;
  return gatewayPost<VulnerabilityResult>(
    '/agents/vulnerability',
    { holdings, portfolio_id: portfolioId ?? null },
  );
}

// ─── Narrative exposure ───────────────────────────────────────────────────────

export interface NarrativeExposure {
  theme_id: string;
  theme_label: string;
  portfolio_weight: number;
  matching_symbols: string[];
  polarity_label: 'positive' | 'negative' | 'neutral';
  polarity_score: number;
  intensity: number;
  emergence_score: number;
  mentions_7d: number;
  lifetime_score: number;
  tags: string[];
  last_seen: string;
}

export interface NarrativeExposureResult {
  exposures: NarrativeExposure[];
  symbols_analysed: string[];
  themes_matched: number;
  themes_scanned: number;
  data_quality: 'full' | 'unavailable';
  source_tables: string[];
  generated_at: string;
  error?: string;
}

export async function fetchNarrativeExposure(
  symbols: string[],
  weights?: Record<string, number>,
): Promise<NarrativeExposureResult> {
  const symbolParam = symbols.join(',');
  const weightParam = weights
    ? symbols.map(s => weights[s] ?? 0).join(',')
    : undefined;
  return gatewayGet<NarrativeExposureResult>(
    '/agents/narrative-exposure',
    { symbols: symbolParam, weights: weightParam ?? null },
    REASONING_TTL,
  );
}
