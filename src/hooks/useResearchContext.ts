import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspace } from '../components/WorkspaceContext';
import { useArtifacts, useBriefings } from './useArtifacts';
import { usePins } from './usePins';
import type { IntelligenceArtifact, Briefing } from '../types';

export interface ResearchContext {
  route: string;
  activeSymbol: string | null;
  recentArtifacts: IntelligenceArtifact[]; // last 5 by createdAt desc
  pinnedArtifacts: IntelligenceArtifact[]; // artifacts where isPinned(a.id) is true
  latestBriefings: Briefing[]; // last 3 by createdAt desc
}

export function useResearchContext(activeSymbol?: string | null): ResearchContext {
  const location = useLocation();
  const { currentWorkspace, currentProject } = useWorkspace();
  const artifacts = useArtifacts(currentWorkspace?.id || null, currentProject?.id || null);
  const briefings = useBriefings(currentWorkspace?.id || null, currentProject?.id || null);
  const { isPinned } = usePins(currentWorkspace?.id || null, currentProject?.id || null);

  const normalizedActiveSymbol = activeSymbol ?? null;

  return useMemo(() => {
    // Helper to convert Firestore Timestamp or number to milliseconds
    const getTimestampMillis = (ts: any): number => {
      if (!ts) return 0;
      return (ts as any)?.toMillis?.() ?? Number(ts);
    };

    // Sort artifacts by createdAt descending, take first 5
    const recentArtifacts = [...artifacts.items]
      .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt))
      .slice(0, 5);

    // Filter artifacts where isPinned is true
    const pinnedArtifacts = artifacts.items.filter(a => isPinned(a.id));

    // Sort briefings by createdAt descending, take first 3
    const latestBriefings = [...briefings.items]
      .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt))
      .slice(0, 3);

    return {
      route: location.pathname,
      activeSymbol: normalizedActiveSymbol,
      recentArtifacts,
      pinnedArtifacts,
      latestBriefings,
    };
  }, [artifacts.items, briefings.items, isPinned, normalizedActiveSymbol, location.pathname]);
}
