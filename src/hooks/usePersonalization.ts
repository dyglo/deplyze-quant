/**
 * V5 personalization hooks.
 *
 * - useMorningBriefing()   — Morning Terminal homepage data
 * - useUserProfile()       — current user_profile_daily snapshot
 * - usePersonalizedFeed()  — ranked intelligence feed (PR6 wires this in)
 * - useCopilotContext()    — Copilot grounding payload (PR7 wires it in)
 * - useWatchlistIntel()    — watchlist-overlap candidates
 * - useInvestigations()    — list active investigations + create helper
 *
 * All hooks fail soft: 404 (flag off) or 503 (engine misconfigured) return
 * empty/null data instead of throwing. UI surfaces should render a calm
 * empty state in those cases.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  fetchBriefing,
  fetchCopilotContext,
  fetchFeed,
  fetchProfile,
  fetchWatchlistIntelligence,
  listInvestigations,
  createInvestigation,
  patchInvestigation,
  type CopilotContext,
  type Investigation,
  type PersonalizedBriefing,
  type RankedItem,
  type UserProfile,
} from '../services/personalizationService';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function useAsyncResource<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await loader();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: run };
}

export function useUserProfile(): AsyncState<UserProfile> {
  return useAsyncResource<UserProfile>(async () => {
    const p = await fetchProfile();
    return p as UserProfile;
  }, []);
}

export function useMorningBriefing(): AsyncState<PersonalizedBriefing> {
  return useAsyncResource<PersonalizedBriefing>(async () => {
    const b = await fetchBriefing();
    return b as PersonalizedBriefing;
  }, []);
}

export function usePersonalizedFeed(limit = 20): AsyncState<{ items: RankedItem[]; ranker_version?: string }> {
  return useAsyncResource(async () => fetchFeed(limit), [limit]);
}

export function useCopilotContext(portfolioId?: string | null): AsyncState<CopilotContext> {
  return useAsyncResource<CopilotContext>(
    async () => {
      const c = await fetchCopilotContext(portfolioId);
      return c as CopilotContext;
    },
    [portfolioId ?? null],
  );
}

export function useWatchlistIntel(): AsyncState<{ items: RankedItem[]; note?: string }> {
  return useAsyncResource(async () => fetchWatchlistIntelligence(), []);
}

export interface InvestigationsApi {
  data: Investigation[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  create: (input: Parameters<typeof createInvestigation>[0]) => Promise<Investigation>;
  patch: typeof patchInvestigation;
}

export function useInvestigations(status: 'active' | 'paused' | 'resolved' | 'archived' = 'active'): InvestigationsApi {
  const [data, setData] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listInvestigations(status));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: Parameters<typeof createInvestigation>[0]) => {
      const created = await createInvestigation(input);
      await refetch();
      return created;
    },
    [refetch],
  );

  return { data, loading, error, refetch, create, patch: patchInvestigation };
}
