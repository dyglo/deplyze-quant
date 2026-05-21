/**
 * historicalResearchService — client for /v1/historical-research.
 *
 * The gateway turns a natural-language query into a ResearchPlan and, after the
 * frontend has computed observations from real OHLCV, returns grounded narrative
 * commentary. Numbers come from the frontend; the LLM only writes prose.
 */

import { gatewayPost } from './gatewayClient';

export type ResearchIntent =
  | 'compare'
  | 'regime_behavior'
  | 'relationship'
  | 'single_asset_history'
  | 'anomaly_search';

export type ResearchComparison =
  | 'normalized'
  | 'rolling_correlation'
  | 'relative_strength'
  | 'drawdown';

export type ResearchOverlay =
  | 'inflation_regime'
  | 'rate_cycle'
  | 'recession'
  | 'volatility_regime';

export interface ResearchPlan {
  intent: ResearchIntent;
  assets: string[];
  benchmark: string | null;
  timeframe: {
    start: string | null;
    end: string | null;
    lookbackYears: number;
  };
  comparisons: ResearchComparison[];
  overlays: ResearchOverlay[];
  reasoning_focus: string;
}

export interface ResearchObservation {
  label: string;
  value: string | number;
  period?: string;
}

export async function planResearch(query: string): Promise<ResearchPlan> {
  const r = await gatewayPost<{ plan: ResearchPlan }>('/historical-research/plan', { query });
  return normalizePlan(r.plan);
}

export async function reasonOverObservations(opts: {
  query: string;
  plan: ResearchPlan;
  observations: ResearchObservation[];
}): Promise<string> {
  const r = await gatewayPost<{ narrative: string }>('/historical-research/reason', opts);
  return r.narrative.trim();
}

function normalizePlan(p: ResearchPlan): ResearchPlan {
  return {
    intent: p.intent ?? 'single_asset_history',
    assets: (p.assets ?? []).map((s) => String(s).toUpperCase()).filter(Boolean).slice(0, 5),
    benchmark: p.benchmark ? String(p.benchmark).toUpperCase() : null,
    timeframe: {
      start: p.timeframe?.start ?? null,
      end: p.timeframe?.end ?? null,
      lookbackYears: clamp(p.timeframe?.lookbackYears ?? 10, 1, 30),
    },
    comparisons: Array.isArray(p.comparisons) ? p.comparisons : [],
    overlays: Array.isArray(p.overlays) ? p.overlays : [],
    reasoning_focus: p.reasoning_focus ?? '',
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number(n) || lo));
}
