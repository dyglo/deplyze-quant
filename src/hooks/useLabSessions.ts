import { useCallback, useEffect, useState } from 'react';
import { subscribeToLabSessions, saveLabSession, deleteLabSession } from '../services/labSessionService';
import type { LabSession } from '../types';

export function useLabSessions(workspaceId: string | null, projectId: string | null) {
  const [sessions, setSessions] = useState<LabSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !projectId) { setSessions([]); setLoading(false); return; }
    setLoading(true);
    return subscribeToLabSessions(workspaceId, projectId, (next) => {
      setSessions(next);
      setLoading(false);
    });
  }, [workspaceId, projectId]);

  const save = useCallback(
    (payload: Omit<LabSession, 'id' | 'createdAt'>) => {
      if (!workspaceId || !projectId) return Promise.resolve('');
      return saveLabSession(workspaceId, projectId, payload);
    },
    [workspaceId, projectId],
  );

  const remove = useCallback(
    (sessionId: string) => {
      if (!workspaceId || !projectId) return Promise.resolve();
      return deleteLabSession(workspaceId, projectId, sessionId);
    },
    [workspaceId, projectId],
  );

  return { sessions, loading, save, remove };
}
