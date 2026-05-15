import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ArtifactPin } from '../types';

const col = (wid: string, pid: string) =>
  collection(db, 'workspaces', wid, 'projects', pid, 'pins');

export function subscribeToPins(
  workspaceId: string,
  projectId: string,
  callback: (pins: ArtifactPin[]) => void,
): Unsubscribe {
  return onSnapshot(query(col(workspaceId, projectId)), (snap) =>
    callback(snap.docs.map((d) => d.data() as ArtifactPin)),
  );
}

export async function pinArtifact(
  workspaceId: string,
  projectId: string,
  artifactId: string,
  uid: string,
  tags?: string[],
  note?: string,
): Promise<void> {
  const pin: ArtifactPin = {
    id: artifactId,
    workspaceId,
    projectId,
    pinnedBy: uid,
    pinnedAt: Date.now(),
    ...(tags?.length ? { tags } : {}),
    ...(note ? { note } : {}),
  };
  await setDoc(doc(col(workspaceId, projectId), artifactId), pin);
}

export async function unpinArtifact(
  workspaceId: string,
  projectId: string,
  artifactId: string,
): Promise<void> {
  await deleteDoc(doc(col(workspaceId, projectId), artifactId));
}
