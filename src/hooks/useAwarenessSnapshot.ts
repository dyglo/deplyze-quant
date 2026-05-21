/**
 * useAwarenessSnapshot — read + write hook for the V5 P3 backend
 * Portfolio Awareness Synthesis store.
 *
 *   const { snapshot, loading, snapshotting, error, refresh, persist } =
 *     useAwarenessSnapshot(portfolioId);
 *
 * - `snapshot`: most recent backend-cached snapshot for this portfolio,
 *   or null when none exists within the window or the backend is
 *   unreachable.
 * - `persist(payload)`: posts a fresh snapshot. The page wires this to a
 *   manual "Snapshot now" affordance (and could later auto-snapshot on a
 *   timer). Idempotent on the day — repeated calls overwrite.
 *
 * Failure-soft: the hook never throws. UI surfaces should fall back to
 * client-side computation when `snapshot` is null.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLatestSnapshot,
  postSnapshot,
  type AwarenessSnapshot,
  type AwarenessSnapshotPayload,
} from '../services/portfolioAwarenessService';

export interface UseAwarenessSnapshotResult {
  snapshot: AwarenessSnapshot | null;
  loading: boolean;
  snapshotting: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  persist: (payload: AwarenessSnapshotPayload) => Promise<AwarenessSnapshot | null>;
}

export function useAwarenessSnapshot(portfolioId: string | null | undefined): UseAwarenessSnapshotResult {
  const [snapshot, setSnapshot] = useState<AwarenessSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(!!portfolioId);
  const [snapshotting, setSnapshotting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (!portfolioId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLatestSnapshot(portfolioId);
      if (!cancelledRef.current) setSnapshot(result);
    } catch (err) {
      if (!cancelledRef.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    cancelledRef.current = false;
    void load();
    return () => { cancelledRef.current = true; };
  }, [load]);

  const persist = useCallback(async (payload: AwarenessSnapshotPayload): Promise<AwarenessSnapshot | null> => {
    if (!portfolioId) return null;
    setSnapshotting(true);
    setError(null);
    try {
      await postSnapshot(portfolioId, payload);
      // Re-read to get the canonical row (server-generated artifact_id, etc.)
      const result = await fetchLatestSnapshot(portfolioId);
      if (!cancelledRef.current) setSnapshot(result);
      return result;
    } catch (err) {
      if (!cancelledRef.current) setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    } finally {
      if (!cancelledRef.current) setSnapshotting(false);
    }
  }, [portfolioId]);

  return { snapshot, loading, snapshotting, error, refresh: load, persist };
}
