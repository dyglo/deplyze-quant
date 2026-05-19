/**
 * useAgentIntelligence — hooks for V4 agent output data.
 *
 * All hooks are visibility-aware (pause when tab is hidden) and
 * cache data across re-renders. They never auto-trigger or push notifications
 * — they simply expose agent outputs as React state.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  fetchAgentOutputs,
  fetchAgentOutputsByDomain,
  fetchPortfolioAgentOutputs,
  fetchCompositeRegime,
  fetchRiskEnvironment,
  fetchAgentStatus,
  extractRegimeLabel,
  extractRiskLevel,
  type FetchOutputsOpts,
} from '../services/agentService';
import type { AgentOutput, AgentDomain, AgentStatusEntry, AgentSeverity } from '../types/agents';

const POLL_MS = 5 * 60_000;  // 5-minute polling interval (agent outputs rarely change faster)

function useVisibility(): boolean {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const h = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);
  return visible;
}

// ─── General agent outputs hook ───────────────────────────────────────────────

export function useAgentOutputs(opts: FetchOutputsOpts = {}) {
  const [data, setData] = useState<AgentOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visible = useVisibility();
  const optsKey = JSON.stringify(opts);

  const fetch = useCallback(async () => {
    try {
      const rows = await fetchAgentOutputs(opts);
      setData(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsKey]);

  useEffect(() => {
    fetch();
    if (!visible) return;
    const id = setInterval(fetch, POLL_MS);
    return () => clearInterval(id);
  }, [fetch, visible]);

  return { data, loading, error, refetch: fetch };
}

// ─── Domain-specific outputs hook ─────────────────────────────────────────────

export function useAgentDomain(domain: AgentDomain, opts: { days?: number; limit?: number } = {}) {
  const [data, setData] = useState<AgentOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visible = useVisibility();

  const fetch = useCallback(async () => {
    try {
      const rows = await fetchAgentOutputsByDomain(domain, opts);
      setData(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, opts.days, opts.limit]);

  useEffect(() => {
    fetch();
    if (!visible) return;
    const id = setInterval(fetch, POLL_MS);
    return () => clearInterval(id);
  }, [fetch, visible]);

  return { data, loading, error, refetch: fetch };
}

// ─── Portfolio-aware agent outputs ────────────────────────────────────────────

export function usePortfolioAgentOutputs(
  portfolioId: string | null | undefined,
  opts: { days?: number; limit?: number } = {},
) {
  const [data, setData] = useState<AgentOutput[]>([]);
  const [loading, setLoading] = useState(!!portfolioId);
  const [error, setError] = useState<string | null>(null);
  const visible = useVisibility();

  const fetch = useCallback(async () => {
    if (!portfolioId) { setLoading(false); return; }
    try {
      const rows = await fetchPortfolioAgentOutputs(portfolioId, opts);
      setData(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId, opts.days, opts.limit]);

  useEffect(() => {
    fetch();
    if (!visible) return;
    const id = setInterval(fetch, POLL_MS);
    return () => clearInterval(id);
  }, [fetch, visible]);

  return { data, loading, error, refetch: fetch };
}

// ─── Composite regime hook ────────────────────────────────────────────────────

export function useCompositeRegime() {
  const [data, setData] = useState<AgentOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visible = useVisibility();

  const fetch = useCallback(async () => {
    try {
      const r = await fetchCompositeRegime();
      setData(r);
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
    const id = setInterval(fetch, POLL_MS * 2);
    return () => clearInterval(id);
  }, [fetch, visible]);

  const regimeLabel = extractRegimeLabel(data);
  return { data, regimeLabel, loading, error, refetch: fetch };
}

// ─── Risk environment hook ────────────────────────────────────────────────────

export function useRiskEnvironment() {
  const [data, setData] = useState<AgentOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visible = useVisibility();

  const fetch = useCallback(async () => {
    try {
      const r = await fetchRiskEnvironment();
      setData(r);
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
    const id = setInterval(fetch, POLL_MS * 2);
    return () => clearInterval(id);
  }, [fetch, visible]);

  const riskLevel = extractRiskLevel(data);
  return { data, riskLevel, loading, error, refetch: fetch };
}

// ─── Agent status hook ────────────────────────────────────────────────────────

export function useAgentStatus() {
  const [data, setData] = useState<AgentStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const rows = await fetchAgentStatus();
      setData(rows);
    } catch {
      // status is optional — fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, refetch: fetch };
}
