import { useMemo } from 'react';
import { useArtifacts, useBriefings } from './useArtifacts';
import { useLabSessions } from './useLabSessions';
import { useInsights } from './useInsights';
import type { TimelineEvent } from '../types';

export function useTimeline(workspaceId: string | null, projectId: string | null) {
  const artifacts = useArtifacts(workspaceId, projectId);
  const briefings = useBriefings(workspaceId, projectId);
  const { sessions, loading: sessionsLoading } = useLabSessions(workspaceId, projectId);
  const { insights, loading: insightsLoading } = useInsights(workspaceId, projectId);

  const events = useMemo<TimelineEvent[]>(() => {
    const all: TimelineEvent[] = [
      ...artifacts.items.map((a) => ({ kind: 'artifact' as const, id: a.id, createdAt: a.createdAt, data: a })),
      ...briefings.items.map((b) => ({ kind: 'briefing' as const, id: b.id, createdAt: b.createdAt, data: b })),
      ...sessions.map((s) => ({ kind: 'labSession' as const, id: s.id, createdAt: s.createdAt, data: s })),
      ...insights.map((i) => ({ kind: 'insight' as const, id: i.id, createdAt: i.createdAt, data: i })),
    ];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }, [artifacts.items, briefings.items, sessions, insights]);

  const loading = artifacts.loading || briefings.loading || sessionsLoading || insightsLoading;

  return { events, loading };
}
