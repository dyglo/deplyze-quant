/**
 * useDashboardArtifacts — subscribes to the current workspace/project's
 * IntelligenceArtifact stream and returns only artifacts whose `symbols`
 * intersect the supplied symbol set. Designed for dashboard pages so each
 * dashboard surfaces just the artifacts relevant to its universe.
 *
 * Strict-real-data: returns an empty list when no workspace is selected or
 * when no artifacts have been produced yet (the agentic producer layer
 * fills the warehouse in Phase 5; UI must handle empty gracefully).
 */
import { useMemo } from 'react';
import { useArtifacts } from './useArtifacts';
import { useWorkspace } from '../components/WorkspaceContext';
import type { IntelligenceArtifact } from '../types';

export interface UseDashboardArtifactsReturn {
  artifacts: IntelligenceArtifact[];
  loading: boolean;
  /** True when there is no workspace context. */
  unavailable: boolean;
}

export function useDashboardArtifacts(symbolSet: string[] | null): UseDashboardArtifactsReturn {
  const { currentWorkspace, currentProject } = useWorkspace();
  const { items, loading } = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);

  const filtered = useMemo(() => {
    if (!symbolSet || symbolSet.length === 0) return items;
    const allow = new Set(symbolSet.map((s) => s.toUpperCase()));
    return items.filter((a) => {
      if (!a.symbols || a.symbols.length === 0) return false;
      return a.symbols.some((s) => allow.has(s.toUpperCase()));
    });
  }, [items, symbolSet]);

  return {
    artifacts: filtered,
    loading,
    unavailable: !currentWorkspace || !currentProject,
  };
}
