/**
 * projectService.ts — Firestore service for Projects (sites/locations)
 *
 * Collection: /workspaces/{workspaceId}/projects/{projectId}
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  Unsubscribe,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Project } from '../types';

function withId<T>(id: string, data: DocumentData): T {
  return { id, ...data } as T;
}

function projectsCol() {
  return collection(db, 'sites');
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function getProject(
  workspaceId: string,
  projectId: string
): Promise<Project | null> {
  const snap = await getDoc(doc(db, 'sites', projectId));
  return snap.exists() ? withId<Project>(snap.id, snap.data()) : null;
}

export async function getProjects(workspaceId: string): Promise<Project[]> {
  const q = query(
    projectsCol(),
    where('orgId', '==', workspaceId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => withId<Project>(d.id, d.data()));
}

export async function getActiveProjects(workspaceId: string): Promise<Project[]> {
  const q = query(
    projectsCol(),
    where('orgId', '==', workspaceId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => withId<Project>(d.id, d.data()));
}

export async function createProject(
  workspaceId: string,
  data: Omit<Project, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(projectsCol(), {
    ...data,
    orgId: workspaceId,
    workspaceId, // keep for compat
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  data: Partial<Project>
): Promise<void> {
  await updateDoc(doc(db, 'sites', projectId), {
    ...data,
    updatedAt: serverTimestamp(),
  } as DocumentData);
}

export async function archiveProject(
  workspaceId: string,
  projectId: string
): Promise<void> {
  await updateProject(workspaceId, projectId, { status: 'archived' });
}

export async function deleteProject(
  workspaceId: string,
  projectId: string
): Promise<void> {
  await deleteDoc(doc(db, 'sites', projectId));
}

// ─── Realtime ──────────────────────────────────────────────────────────────

export function subscribeToProjects(
  workspaceId: string,
  callback: (projects: Project[]) => void
): Unsubscribe {
  const q = query(
    projectsCol(),
    where('orgId', '==', workspaceId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => withId<Project>(d.id, d.data())))
  );
}
