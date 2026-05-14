/**
 * artifactService — Firestore reads for agent-generated intelligence artifacts
 * and institutional briefings. Writes are server-side only (gateway / agents
 * via Admin SDK), so this module is read-only.
 *
 * In Phase 1 these collections are empty until the agentic layer (Phase 5)
 * starts producing artifacts. UI components handle the empty-state path.
 */

import {
  collection, query, orderBy, limit, onSnapshot, Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { IntelligenceArtifact, Briefing } from '../types';

function normalizeTimestamps(obj: Record<string, unknown>): Record<string, unknown> {
  // Firestore Timestamps → unix ms so the UI can treat them uniformly.
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
      obj[k] = (v as { toMillis: () => number }).toMillis();
    }
  }
  return obj;
}

function map<T>(docs: { id: string; data: () => Record<string, unknown> }[]): T[] {
  return docs.map((d) => ({ id: d.id, ...normalizeTimestamps(d.data()) }) as T);
}

export function subscribeToArtifacts(
  workspaceId: string,
  projectId: string,
  callback: (items: IntelligenceArtifact[]) => void,
  max = 50,
): Unsubscribe {
  const q = query(
    collection(db, 'workspaces', workspaceId, 'projects', projectId, 'artifacts'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (snap) =>
    callback(map<IntelligenceArtifact>(snap.docs as { id: string; data: () => Record<string, unknown> }[])),
  );
}

export function subscribeToBriefings(
  workspaceId: string,
  projectId: string,
  callback: (items: Briefing[]) => void,
  max = 30,
): Unsubscribe {
  const q = query(
    collection(db, 'workspaces', workspaceId, 'projects', projectId, 'briefings'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (snap) =>
    callback(map<Briefing>(snap.docs as { id: string; data: () => Record<string, unknown> }[])),
  );
}
