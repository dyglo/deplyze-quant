/**
 * personalizationService.ts — typed client for V5 personalization routes.
 *
 * Backend: gateway `/v1/personalization/*` (see PR2 + PR4).
 * Frontend: consumed by `src/hooks/usePersonalization.ts`.
 *
 * Feed cache TTLs stay short (60s) so dismissals and reads refresh promptly.
 */

import {
  gatewayGet,
  gatewayPost,
  gatewayPatch,
} from './gatewayClient';

export interface ComponentScores {
  portfolio_impact: number;
  watchlist_match: number;
  investigation_continuation: number;
  regime_urgency: number;
  confidence: number;
  novelty: number;
  recency: number;
  source_quality: number;
}

export interface RankedItem {
  artifact_id: string;
  kind: 'agent_output' | 'macro' | 'narrative' | 'analog' | 'relationship' | string;
  title?: string | null;
  summary?: string | null;
  base_score: number;
  component_scores?: Partial<ComponentScores>;
  reason_codes: string[];
  confidence?: number | null;
  severity?: 'high' | 'medium' | 'low' | 'info' | null;
  symbols?: string[];
}

export interface Investigation {
  investigation_id: string;
  title: string;
  thesis?: string | null;
  status: 'active' | 'paused' | 'resolved' | 'archived';
  created_at: string;
  updated_at: string;
  last_resurfaced_at?: string | null;
  symbols: string[];
  themes: string[];
  pinned_artifact_ids: string[];
  copilot_thread_ids: string[];
  saved_briefing_ids: string[];
  unresolved_questions: string[];
  continuation_score?: number | null;
  evidence_overlap_count?: number | null;
  tags: string[];
}

export interface CopilotContext {
  profile_summary: {
    regime_style?: string | null;
    preferred_depth?: string | null;
    risk_posture?: string | null;
    watchlist_symbols?: string[];
    portfolio_symbols?: string[];
  };
  active_investigations: Array<{
    id: string;
    title?: string | null;
    thesis?: string | null;
    symbols: string[];
    unresolved_questions: string[];
  }>;
  top_evidence: RankedItem[];
  /** Resolved awareness tone for this user (depth + posture). Optional — absent
   *  when the personalization profile has not yet been built. */
  awareness_tone?: {
    depth: 'concise' | 'standard' | 'deep';
    posture: 'defensive' | 'neutral' | 'aggressive';
  } | null;
  /** Narrative lines from the most recent portfolio awareness snapshot
   *  (keyed by section: hero, returnDecomposition, riskDecomposition, …).
   *  Optional — absent when no snapshot is available or portfolio_id was not
   *  provided. Not injected verbatim; Copilot uses this for context only. */
  latest_awareness_narrative?: Record<string, string[]> | null;
}

export async function fetchFeed(limit = 20): Promise<{ items: RankedItem[]; ranker_version?: string }> {
  try {
    const res = await gatewayGet<{ items: RankedItem[]; ranker_version?: string }>(
      '/personalization/feed',
      { limit },
      60_000,
    );
    return res ?? { items: [] };
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 404 || e?.status === 503) return { items: [] };
    throw err;
  }
}

export async function fetchCopilotContext(portfolioId?: string | null): Promise<CopilotContext | null> {
  try {
    const params = portfolioId ? { portfolio_id: portfolioId } : undefined;
    return await gatewayGet<CopilotContext>('/personalization/copilot-context', params, 2 * 60_000);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 404 || e?.status === 503) return null;
    throw err;
  }
}

export async function fetchWatchlistIntelligence(): Promise<{ items: RankedItem[]; note?: string }> {
  try {
    return await gatewayGet<{ items: RankedItem[]; note?: string }>(
      '/personalization/watchlist',
      undefined,
      90_000,
    );
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 404 || e?.status === 503) return { items: [] };
    throw err;
  }
}

// ─── Investigation memory ────────────────────────────────────────────────────

export async function listInvestigations(status: 'active' | 'paused' | 'resolved' | 'archived' = 'active'): Promise<Investigation[]> {
  try {
    const res = await gatewayGet<{ investigations: Investigation[] }>(
      '/personalization/investigation',
      { status },
      60_000,
    );
    return res?.investigations ?? [];
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 404 || e?.status === 503) return [];
    throw err;
  }
}

export async function createInvestigation(input: {
  title: string;
  thesis?: string;
  symbols?: string[];
  themes?: string[];
  tags?: string[];
  unresolved_questions?: string[];
}): Promise<Investigation> {
  return gatewayPost<Investigation>('/personalization/investigation', input);
}

export async function patchInvestigation(
  id: string,
  patch: Partial<{
    title: string;
    thesis: string;
    status: 'active' | 'paused' | 'resolved' | 'archived';
    symbols: string[];
    themes: string[];
    pinned_artifact_ids: string[];
    copilot_thread_ids: string[];
    saved_briefing_ids: string[];
    unresolved_questions: string[];
    related_macro_events: string[];
    related_analog_artifact_ids: string[];
    tags: string[];
  }>,
): Promise<Investigation> {
  return gatewayPatch<Investigation>(`/personalization/investigation/${encodeURIComponent(id)}`, { patch });
}
