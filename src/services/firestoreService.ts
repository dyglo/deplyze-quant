/**
 * firestoreService.ts — client-side Firestore access for Deplyze Quant.
 *
 * Scope: users, organizations (≡ workspaces in PRD vocabulary), and sites
 * (≡ projects in PRD vocabulary). The legacy collection names are kept for
 * backwards-compatibility with the existing AuthProvider/WorkspaceContext
 * code paths; the PRD-aligned `workspaces/{wid}/projects/{pid}/...`
 * subcollections (artifacts, briefings, watchlists, agentRuns) are written
 * by the gateway via Admin SDK and read here through dedicated services.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Organization, Site, UserProfile } from '../types';

function withId<T>(id: string, data: DocumentData): T {
  return { id, ...data } as T;
}

// ─── Users ────────────────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? withId<UserProfile>(snap.id, snap.data()) : null;
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  await setDoc(doc(db, 'users', profile.uid), profile, { merge: true });
}

// ─── Organizations (≡ workspaces) ─────────────────────────────────────────

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, 'organizations', orgId));
  return snap.exists() ? withId<Organization>(snap.id, snap.data()) : null;
}

export async function createOrganization(
  data: Omit<Organization, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'organizations'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateOrganization(
  orgId: string,
  data: Partial<Organization>,
): Promise<void> {
  await updateDoc(doc(db, 'organizations', orgId), data as DocumentData);
}

// ─── Sites (≡ projects) ───────────────────────────────────────────────────

export async function getSitesByOrg(orgId: string): Promise<Site[]> {
  const q = query(
    collection(db, 'sites'),
    where('orgId', '==', orgId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => withId<Site>(d.id, d.data()));
}

export async function createSite(data: Omit<Site, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'sites'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeToSites(
  orgId: string,
  callback: (sites: Site[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'sites'),
    where('orgId', '==', orgId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => withId<Site>(d.id, d.data()))),
  );
}
