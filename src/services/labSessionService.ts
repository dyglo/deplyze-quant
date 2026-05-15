import {
  collection, doc, addDoc, deleteDoc, onSnapshot, query,
  orderBy, limit, serverTimestamp, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LabSession } from '../types';

const col = (wid: string, pid: string) =>
  collection(db, 'workspaces', wid, 'projects', pid, 'labSessions');

export function subscribeToLabSessions(
  workspaceId: string,
  projectId: string,
  callback: (sessions: LabSession[]) => void,
  max = 30,
): Unsubscribe {
  const q = query(col(workspaceId, projectId), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) =>
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() ?? d.data().createdAt,
      } as LabSession)),
    ),
  );
}

export async function saveLabSession(
  workspaceId: string,
  projectId: string,
  payload: Omit<LabSession, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(col(workspaceId, projectId), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteLabSession(
  workspaceId: string,
  projectId: string,
  sessionId: string,
): Promise<void> {
  await deleteDoc(doc(col(workspaceId, projectId), sessionId));
}
