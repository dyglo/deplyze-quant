import { useCallback, useEffect, useState } from 'react';
import { subscribeToCopilotInsights, saveCopilotInsight, deleteCopilotInsight } from '../services/insightService';
import type { CopilotInsight } from '../types';

export function useInsights(workspaceId: string | null, projectId: string | null) {
  const [insights, setInsights] = useState<CopilotInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !projectId) { setInsights([]); setLoading(false); return; }
    setLoading(true);
    return subscribeToCopilotInsights(workspaceId, projectId, (next) => {
      setInsights(next);
      setLoading(false);
    });
  }, [workspaceId, projectId]);

  const save = useCallback(
    (payload: Omit<CopilotInsight, 'id' | 'createdAt'>) => {
      if (!workspaceId || !projectId) return Promise.resolve('');
      return saveCopilotInsight(workspaceId, projectId, payload);
    },
    [workspaceId, projectId],
  );

  const remove = useCallback(
    (insightId: string) => {
      if (!workspaceId || !projectId) return Promise.resolve();
      return deleteCopilotInsight(workspaceId, projectId, insightId);
    },
    [workspaceId, projectId],
  );

  return { insights, loading, save, remove };
}
