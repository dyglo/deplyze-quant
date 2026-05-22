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

/**
 * A named historical regime the planner extracted from the user's question
 * (e.g. "2015–2018 gradual hikes", "COVID shock", "ZIRP era"). When present,
 * the frontend slices retrieved price history per regime and computes
 * per-regime metrics so the answer addresses the user's actual question.
 */
export interface ResearchRegime {
  label: string;              // human-readable, e.g. "2022–2023 aggressive hikes"
  start: string;              // YYYY-MM-DD
  end: string;                // YYYY-MM-DD
  hypothesis?: string;        // optional one-line driver, e.g. "Fed lift-off + QT"
}

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
  /** Named windows to slice the analysis into. Empty when no regimes were named. */
  regimes: ResearchRegime[];
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

/**
 * Ask a follow-up question against an existing investigation. Sends the full
 * observation set plus the prior narrative so the model can answer any question
 * grounded in the completed analysis.
 */
export async function askFollowup(opts: {
  question: string;
  query: string;
  plan: ResearchPlan;
  observations: ResearchObservation[];
  narrative?: string;
  priorTurns?: { question: string; answer: string }[];
}): Promise<string> {
  const r = await gatewayPost<{ answer: string }>('/historical-research/followup-ask', opts);
  return r.answer.trim();
}

/**
 * Ask the planner to re-derive a ResearchPlan when the user's follow-up
 * requires fresh data (e.g. "now add TLT" or "extend back to 2000"). The
 * frontend then re-runs the pipeline with that plan.
 */
export async function refineFollowup(opts: {
  question: string;
  query: string;
  plan: ResearchPlan;
}): Promise<ResearchPlan> {
  const r = await gatewayPost<{ plan: ResearchPlan }>('/historical-research/followup-refine', opts);
  return normalizePlan(r.plan);
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
    regimes: normalizeRegimes((p as unknown as { regimes?: unknown }).regimes),
  };
}

function normalizeRegimes(input: unknown): ResearchRegime[] {
  if (!Array.isArray(input)) return [];
  const out: ResearchRegime[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<ResearchRegime>;
    const start = typeof r.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.start) ? r.start : null;
    const end   = typeof r.end   === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.end)   ? r.end   : null;
    if (!start || !end) continue;
    if (Date.parse(end) <= Date.parse(start)) continue;
    out.push({
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 80) : `${start.slice(0, 4)}–${end.slice(0, 4)}`,
      start,
      end,
      hypothesis: typeof r.hypothesis === 'string' ? r.hypothesis.slice(0, 200) : undefined,
    });
    if (out.length >= 6) break;
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number(n) || lo));
}
