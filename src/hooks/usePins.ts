import { useWorkspace } from '../components/WorkspaceContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribeToPins, pinArtifact, unpinArtifact } from '../services/pinService';
import type { ArtifactPin } from '../types';

export function usePins(workspaceId: string | null, projectId: string | null) {
  const { userId } = useWorkspace();
  const [pins, setPins] = useState<ArtifactPin[]>([]);

  useEffect(() => {
    if (!workspaceId || !projectId) { setPins([]); return; }
    return subscribeToPins(workspaceId, projectId, setPins);
  }, [workspaceId, projectId]);

  const pinMap = useMemo(
    () => new Map(pins.map((p) => [p.id, p])),
    [pins],
  );

  const pin = useCallback(
    (artifactId: string, tags?: string[], note?: string) => {
      if (!workspaceId || !projectId || !userId) return Promise.resolve();
      return pinArtifact(workspaceId, projectId, artifactId, userId, tags, note);
    },
    [workspaceId, projectId, userId],
  );

  const unpin = useCallback(
    (artifactId: string) => {
      if (!workspaceId || !projectId) return Promise.resolve();
      return unpinArtifact(workspaceId, projectId, artifactId);
    },
    [workspaceId, projectId],
  );

  const isPinned = useCallback(
    (artifactId: string) => pinMap.has(artifactId),
    [pinMap],
  );

  return { pins, pinMap, isPinned, pin, unpin };
}
