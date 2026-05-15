import {
  collection, doc, addDoc, deleteDoc, onSnapshot, query,
  orderBy, limit, serverTimestamp, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CopilotInsight } from '../types';

const col = (wid: string, pid: string) =>
  collection(db, 'workspaces', wid, 'projects', pid, 'copilotInsights');

export function subscribeToCopilotInsights(
  workspaceId: string,
  projectId: string,
  callback: (insights: CopilotInsight[]) => void,
  max = 20,
): Unsubscribe {
  const q = query(col(workspaceId, projectId), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) =>
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() ?? d.data().createdAt,
      } as CopilotInsight)),
    ),
  );
}

export async function saveCopilotInsight(
  workspaceId: string,
  projectId: string,
  payload: Omit<CopilotInsight, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(col(workspaceId, projectId), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteCopilotInsight(
  workspaceId: string,
  projectId: string,
  insightId: string,
): Promise<void> {
  await deleteDoc(doc(col(workspaceId, projectId), insightId));
}
