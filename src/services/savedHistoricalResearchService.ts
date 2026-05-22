/**
 * savedHistoricalResearchService — Firestore CRUD for "saved" Historical
 * Research investigations.
 *
 * Path: users/{uid}/historical_research/{id}
 *
 * Only lightweight metadata is persisted — raw timeseries arrays are stripped
 * before writing so the document stays well under Firestore's 1 MiB limit.
 * Follow-up Q&A turns live inside the same document.
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
// Firestore hard limit is 1 048 487 bytes; guard at 800 KB to stay safe.
const FIRESTORE_SAFE_BYTES = 800_000;

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
  resultJson: string;          // slim ResearchResult — no raw timeseries
  completedAt: number;
  savedAt: Timestamp | number;
  intent: string;
  assets: string[];
  lookbackYears: number;
  followupCount: number;
  schemaVersion: number;
}

const SCHEMA_VERSION = 2;

/**
 * Strip every large timeseries array from a ResearchResult so the serialized
 * payload fits within Firestore's document size limit.
 *
 * Kept (scalars / small arrays):
 *   query, plan, drawdowns, totals, observations, narrative, dataWindow,
 *   totalElapsedMs, completedAt, followups,
 *   analytics.performance, analytics.annualReturns, analytics.distributions,
 *   analytics.corrMatrix, analytics.drawdowns[].deepest / .current,
 *   regimeMetrics (no series — only scalar metrics per regime/asset)
 *
 * Stripped (raw timeseries):
 *   assets[].bars, assets[].normalized,
 *   rollingCorrelations[].series,
 *   analytics.drawdowns[].series,
 *   analytics.rollingVols[].series,
 *   steps (progress trace)
 */
function slimForFirestore(result: ResearchResult): Partial<ResearchResult> {
  return {
    query: result.query,
    plan: result.plan,
    drawdowns: result.drawdowns,
    totals: result.totals,
    observations: result.observations,
    narrative: result.narrative,
    dataWindow: result.dataWindow,
    totalElapsedMs: result.totalElapsedMs,
    completedAt: result.completedAt,
    followups: result.followups,
    // Keep symbol list; drop raw OHLCV bars and normalized series.
    assets: result.assets?.map(({ symbol }) => ({
      symbol,
      bars: [],
      normalized: [],
    })),
    // Keep overall correlation scalar; drop per-day rolling series.
    rollingCorrelations: result.rollingCorrelations?.map(
      ({ a, b, window, overall }) => ({ a, b, window, overall, series: [] }),
    ),
    // Keep scalar analytics; drop per-day drawdown / vol series.
    analytics: result.analytics
      ? {
          performance: result.analytics.performance,
          annualReturns: result.analytics.annualReturns,
          distributions: result.analytics.distributions,
          corrMatrix: result.analytics.corrMatrix,
          drawdowns: result.analytics.drawdowns?.map(
            ({ symbol, deepest, current }) => ({
              symbol,
              deepest,
              current,
              series: [],
            }),
          ),
          rollingVols: result.analytics.rollingVols?.map(({ symbol }) => ({
            symbol,
            series: [],
          })),
        }
      : undefined,
    // regimeMetrics has no series — keep as-is.
    regimeMetrics: result.regimeMetrics,
    // steps is a progress trace only useful during the live run — drop it.
    steps: [],
  };
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
  const slim = slimForFirestore(result);
  const resultJson = JSON.stringify(slim);

  if (resultJson.length > FIRESTORE_SAFE_BYTES) {
    throw new Error(
      `Research record is too large to save (${resultJson.length} bytes). ` +
        'Try a shorter timeframe or fewer assets.',
    );
  }

  const payload: SavedDoc = {
    query: result.query,
    resultJson,
    completedAt: result.completedAt,
    savedAt: serverTimestamp() as unknown as Timestamp,
    intent: result.plan.intent,
    assets: result.plan.assets,
    lookbackYears: result.plan.timeframe.lookbackYears,
    followupCount: result.followups?.length ?? 0,
    schemaVersion: SCHEMA_VERSION,
  };
  await setDoc(docRef(uid, id), payload, { merge: true });
}

export async function loadInvestigation(
  uid: string,
  id: string,
): Promise<ResearchResult | null> {
  const snap = await getDoc(docRef(uid, id));
  if (!snap.exists()) return null;
  const d = snap.data() as Partial<SavedDoc> & { result?: ResearchResult };
  if (d.resultJson) {
    try { return JSON.parse(d.resultJson) as ResearchResult; } catch { return null; }
  }
  // Back-compat: pre-schemaVersion docs stored the result as a nested object.
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
    const d = s.data() as Partial<SavedDoc> & { result?: ResearchResult };
    const savedAtMs =
      typeof d.savedAt === 'number'
        ? d.savedAt
        : (d.savedAt as Timestamp | undefined)?.toMillis?.() ?? Date.now();
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
