/**
 * savedHistoricalResearchService — Firestore CRUD for "saved" Historical
 * Research investigations.
 *
 * Path: users/{uid}/workspaces/{wid}/historical_research/{id}
 *
 * The document stores the full ResearchResult shape (the same JSON the page
 * already keeps in sessionStorage for the RecentRail). That makes hydration
 * trivial — loading a saved investigation is identical to reading one from
 * sessionStorage. Follow-up Q&A turns live inside the same document.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ResearchResult } from '../hooks/useHistoricalResearch';

const COLLECTION = 'historical_research';

export interface SavedInvestigationMeta {
  id: string;
  query: string;
  intent: string;
  assets: string[];
  lookbackYears: number;
  completedAt: number;
  savedAt: number;
  followupCount: number;
}

interface SavedDoc {
  query: string;
  result: ResearchResult;
  completedAt: number;
  savedAt: Timestamp | number;
  intent: string;
  assets: string[];
  lookbackYears: number;
  followupCount: number;
}

function colRef(uid: string) {
  return collection(db, 'users', uid, COLLECTION);
}

function docRef(uid: string, id: string) {
  return doc(db, 'users', uid, COLLECTION, id);
}

export async function saveInvestigation(
  uid: string,
  id: string,
  result: ResearchResult,
): Promise<void> {
  const payload: SavedDoc = {
    query: result.query,
    result,
    completedAt: result.completedAt,
    savedAt: serverTimestamp() as unknown as Timestamp,
    intent: result.plan.intent,
    assets: result.plan.assets,
    lookbackYears: result.plan.timeframe.lookbackYears,
    followupCount: result.followups?.length ?? 0,
  };
  await setDoc(docRef(uid, id), payload, { merge: true });
}

export async function loadInvestigation(
  uid: string,
  id: string,
): Promise<ResearchResult | null> {
  const snap = await getDoc(docRef(uid, id));
  if (!snap.exists()) return null;
  const d = snap.data() as SavedDoc;
  return d.result ?? null;
}

export async function deleteInvestigation(uid: string, id: string): Promise<void> {
  await deleteDoc(docRef(uid, id));
}

export async function listSavedInvestigations(
  uid: string,
  max = 20,
): Promise<SavedInvestigationMeta[]> {
  const q = query(colRef(uid), orderBy('completedAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((s) => {
    const d = s.data() as SavedDoc;
    const savedAtMs =
      typeof d.savedAt === 'number'
        ? d.savedAt
        : (d.savedAt as Timestamp)?.toMillis?.() ?? Date.now();
    return {
      id: s.id,
      query: d.query ?? d.result?.query ?? '(untitled)',
      intent: d.intent ?? d.result?.plan?.intent ?? 'single_asset_history',
      assets: d.assets ?? d.result?.plan?.assets ?? [],
      lookbackYears: d.lookbackYears ?? d.result?.plan?.timeframe?.lookbackYears ?? 10,
      completedAt: d.completedAt ?? d.result?.completedAt ?? 0,
      savedAt: savedAtMs,
      followupCount: d.followupCount ?? d.result?.followups?.length ?? 0,
    };
  });
}
