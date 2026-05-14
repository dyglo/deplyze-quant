/**
 * workspaceService.ts — Firestore service for Workspaces and Workspace Members
 *
 * Collections:
 *   /workspaces/{workspaceId}
 *   /workspaces/{workspaceId}/members/{userId}
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  Unsubscribe,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../types';

function withId<T>(id: string, data: DocumentData): T {
  return { id, ...data } as T;
}

// ─── Workspaces ────────────────────────────────────────────────────────────

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const snap = await getDoc(doc(db, 'workspaces', workspaceId));
  return snap.exists() ? withId<Workspace>(snap.id, snap.data()) : null;
}

export async function createWorkspace(
  data: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'workspaces'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWorkspace(
  workspaceId: string,
  data: Partial<Workspace>
): Promise<void> {
  await updateDoc(doc(db, 'workspaces', workspaceId), {
    ...data,
    updatedAt: serverTimestamp(),
  } as DocumentData);
}

/** Fetch all workspaces where the given user is a member. */
export async function getWorkspacesForUser(uid: string): Promise<Workspace[]> {
  // Query the memberships sub-collection across all workspaces is not possible in
  // client SDK without a collection group query. We use collectionGroup here.
  const { collectionGroup } = await import('firebase/firestore');
  const q = query(
    collectionGroup(db, 'members'),
    where('uid', '==', uid)
  );
  const snap = await getDocs(q);
  const workspaceIds = snap.docs.map((d) => d.ref.parent.parent!.id);

  // Batch-fetch workspace documents (deduplicated)
  const unique = [...new Set(workspaceIds)];
  const results = await Promise.all(unique.map((id) => getWorkspace(id)));
  return results.filter((w): w is Workspace => w !== null);
}

export function subscribeToWorkspace(
  workspaceId: string,
  callback: (workspace: Workspace | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'workspaces', workspaceId), (snap) => {
    callback(snap.exists() ? withId<Workspace>(snap.id, snap.data()) : null);
  });
}

// ─── Members ───────────────────────────────────────────────────────────────

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const snap = await getDocs(collection(db, 'workspaces', workspaceId, 'members'));
  return snap.docs.map((d) => withId<WorkspaceMember>(d.id, d.data()));
}

export function subscribeToMembers(
  workspaceId: string,
  callback: (members: WorkspaceMember[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'workspaces', workspaceId, 'members'),
    (snap) => callback(snap.docs.map((d) => withId<WorkspaceMember>(d.id, d.data())))
  );
}

export async function upsertMember(
  workspaceId: string,
  member: WorkspaceMember
): Promise<void> {
  await setDoc(
    doc(db, 'workspaces', workspaceId, 'members', member.uid),
    { ...member, joinedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function updateMemberRole(
  workspaceId: string,
  uid: string,
  role: WorkspaceRole
): Promise<void> {
  await updateDoc(doc(db, 'workspaces', workspaceId, 'members', uid), { role });
}

export async function removeMember(workspaceId: string, uid: string): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'workspaces', workspaceId, 'members', uid));
}
