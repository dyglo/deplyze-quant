import { useEffect, useState } from 'react';
import { subscribeToArtifacts, subscribeToBriefings } from '../services/artifactService';
import type { Briefing, IntelligenceArtifact } from '../types';

export function useArtifacts(workspaceId: string | null, projectId: string | null) {
  const [items, setItems] = useState<IntelligenceArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !projectId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeToArtifacts(workspaceId, projectId, (next) => {
      setItems(next);
      setLoading(false);
    });
    return unsub;
  }, [workspaceId, projectId]);

  return { items, loading };
}

export function useBriefings(workspaceId: string | null, projectId: string | null) {
  const [items, setItems] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !projectId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeToBriefings(workspaceId, projectId, (next) => {
      setItems(next);
      setLoading(false);
    });
    return unsub;
  }, [workspaceId, projectId]);

  return { items, loading };
}
