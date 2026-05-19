/**
 * useAgentReasoning — hooks for V4 Phase 2 reasoning surfaces.
 *
 * Covers: multi-system reasoning, historical analogs, portfolio vulnerability,
 * and narrative exposure. All hooks are visibility-aware and cache data.
 */

import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  fetchReasoningOutputs,
  fetchHistoricalAnalog,
  fetchPortfolioVulnerability,
  fetchNarrativeExposure,
  type AnalogResult,
  type VulnerabilityResult,
  type NarrativeExposureResult,
  type HoldingInput,
} from '../services/reasoningService';
import type { AgentOutput } from '../types/agents';

const POLL_MS = 8 * 60_000;

function useVisibility(): boolean {
  const [vis, setVis] = useState(!document.hidden);
  useEffect(() => {
    const h = () => setVis(!document.hidden);
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);
  return vis;
}

// ─── Multi-system reasoning ───────────────────────────────────────────────────

export function useReasoningOutputs() {
  const [data, setData] = useState<AgentOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visible = useVisibility();

  const fetch = useCallback(async () => {
    try {
      const rows = await fetchReasoningOutputs();
      setData(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    if (!visible) return;
    const id = setInterval(fetch, POLL_MS);
    return () => clearInterval(id);
  }, [fetch, visible]);

  return { data, loading, error, refetch: fetch };
}

// ─── Historical analogs ───────────────────────────────────────────────────────

export function useHistoricalAnalog(opts: { lookback_years?: number; top_k?: number } = {}) {
  const [data, setData] = useState<AnalogResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optsKey = JSON.stringify(opts);

  const fetch = useCallback(async () => {
    try {
      const result = await fetchHistoricalAnalog(opts);
      setData(result);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsKey]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Portfolio vulnerability ──────────────────────────────────────────────────

export function usePortfolioVulnerability(
  holdings: HoldingInput[],
  portfolioId?: string,
) {
  const [data, setData] = useState<VulnerabilityResult | null>(null);
  const [loading, setLoading] = useState(holdings.length > 0);
  const [error, setError] = useState<string | null>(null);
  const holdingsKey = JSON.stringify(holdings.map(h => ({ s: h.symbol, w: h.weight })));

  const fetch = useCallback(async () => {
    if (!holdings.length) { setLoading(false); return; }
    try {
      const result = await fetchPortfolioVulnerability(holdings, portfolioId);
      setData(result);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingsKey, portfolioId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Narrative exposure ───────────────────────────────────────────────────────

export function useNarrativeExposure(
  symbols: string[],
  weights?: Record<string, number>,
) {
  const [data, setData] = useState<NarrativeExposureResult | null>(null);
  const [loading, setLoading] = useState(symbols.length > 0);
  const [error, setError] = useState<string | null>(null);
  const symKey = symbols.slice().sort().join(',');

  const fetch = useCallback(async () => {
    if (!symbols.length) { setLoading(false); return; }
    try {
      const result = await fetchNarrativeExposure(symbols, weights);
      setData(result);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symKey]);

  useEffect(() => { fetch(); }, [fetch]);

  // Top theme by portfolio weight
  const topTheme = useMemo(
    () => data?.exposures?.[0] ?? null,
    [data],
  );

  return { data, topTheme, loading, error, refetch: fetch };
}
