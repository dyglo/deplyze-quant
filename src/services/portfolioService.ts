/**
 * Portfolio Intelligence — Firestore persistence layer.
 *
 * Collection structure:
 *   portfolios/{portfolioId}
 *   portfolios/{portfolioId}/holdings/{holdingId}
 *   portfolioIntelligence/{observationId}
 *   intelligenceWatchlists/{watchlistId}
 *
 * All writes are workspace + uid scoped. No execution fields.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  Portfolio,
  Holding,
  PortfolioIntelligenceObservation,
  IntelligenceWatchlist,
} from '../lib/portfolio/schemas';
import { DEFAULT_BENCHMARK_ID } from '../lib/portfolio/benchmarks';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tsNow(): number {
  return Date.now();
}

function fromFirestore<T>(snap: import('firebase/firestore').DocumentSnapshot): T | null {
  if (!snap.exists()) return null;
  const data = snap.data()!;
  const convertObj = (obj: Record<string, unknown>): Record<string, unknown> => {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => {
        if (v instanceof Timestamp) return [k, v.toMillis()];
        if (Array.isArray(v)) return [k, v.map(i => (i instanceof Timestamp ? i.toMillis() : i))];
        return [k, v];
      })
    );
  };
  return { id: snap.id, ...convertObj(data) } as T;
}

// ─── Portfolios ───────────────────────────────────────────────────────────────

export async function createPortfolio(
  uid: string,
  workspaceId: string,
  params: {
    name: string;
    description?: string;
    type?: Portfolio['type'];
    currency?: string;
    benchmarkId?: string;
    isWatchlist?: boolean;
    tags?: string[];
  }
): Promise<string> {
  const ref = await addDoc(collection(db, 'portfolios'), {
    uid,
    workspaceId,
    name: params.name,
    description: params.description ?? '',
    type: params.type ?? 'long-only',
    status: 'active',
    currency: params.currency ?? 'USD',
    benchmarkId: params.benchmarkId ?? DEFAULT_BENCHMARK_ID,
    additionalBenchmarkIds: [],
    isWatchlist: params.isWatchlist ?? false,
    tags: params.tags ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getPortfolio(portfolioId: string): Promise<Portfolio | null> {
  const snap = await getDoc(doc(db, 'portfolios', portfolioId));
  return fromFirestore<Portfolio>(snap);
}

export async function updatePortfolio(
  portfolioId: string,
  updates: Partial<Omit<Portfolio, 'id' | 'uid' | 'workspaceId' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'portfolios', portfolioId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function archivePortfolio(portfolioId: string): Promise<void> {
  await updateDoc(doc(db, 'portfolios', portfolioId), {
    status: 'archived',
    updatedAt: serverTimestamp(),
  });
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  // Delete holdings subcollection first
  const holdingsSnap = await getDocs(collection(db, 'portfolios', portfolioId, 'holdings'));
  for (const d of holdingsSnap.docs) {
    await deleteDoc(d.ref);
  }
  await deleteDoc(doc(db, 'portfolios', portfolioId));
}

/** Real-time subscription — workspace-scoped, active portfolios only. */
export function subscribeToPortfolios(
  uid: string,
  workspaceId: string,
  cb: (portfolios: Portfolio[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'portfolios'),
    where('uid', '==', uid),
    where('workspaceId', '==', workspaceId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const portfolios: Portfolio[] = snap.docs.map((d) => {
        const data = d.data();
        const convert = (v: unknown): unknown => {
          if (v instanceof Timestamp) return v.toMillis();
          return v;
        };
        return {
          id: d.id,
          ...data,
          createdAt: convert(data.createdAt) as number,
          updatedAt: convert(data.updatedAt) as number,
        } as Portfolio;
      });
      cb(portfolios);
    },
    (err) => {
      console.error('[portfolioService] subscribeToPortfolios error:', err.message);
      cb([]);
    },
  );
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export async function addHolding(
  portfolioId: string,
  workspaceId: string,
  params: {
    symbol: string;
    name: string;
    assetClass: Holding['assetClass'];
    weight?: number;
    quantity?: number;
    costBasis?: number;
    currency?: string;
    sector?: string;
    region?: string;
    country?: string;
    conviction?: Holding['conviction'];
    tags?: string[];
    notes?: string;
  }
): Promise<string> {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'holdings'), {
    portfolioId,
    workspaceId,
    symbol: params.symbol.toUpperCase(),
    name: params.name,
    assetClass: params.assetClass,
    weight: params.weight ?? null,
    quantity: params.quantity ?? null,
    costBasis: params.costBasis ?? null,
    currency: params.currency ?? 'USD',
    sector: params.sector ?? null,
    region: params.region ?? null,
    country: params.country ?? null,
    conviction: params.conviction ?? 'medium',
    tags: params.tags ?? [],
    notes: params.notes ?? '',
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateHolding(
  portfolioId: string,
  holdingId: string,
  updates: Partial<Omit<Holding, 'id' | 'portfolioId' | 'workspaceId' | 'addedAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'portfolios', portfolioId, 'holdings', holdingId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function removeHolding(portfolioId: string, holdingId: string): Promise<void> {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'holdings', holdingId));
}

export async function getHoldings(portfolioId: string): Promise<Holding[]> {
  const snap = await getDocs(
    query(collection(db, 'portfolios', portfolioId, 'holdings'), orderBy('addedAt', 'asc'))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : (v as number) ?? tsNow());
    return {
      id: d.id,
      ...data,
      addedAt: toMs(data.addedAt),
      updatedAt: toMs(data.updatedAt),
    } as Holding;
  });
}

export function subscribeToHoldings(
  portfolioId: string,
  cb: (holdings: Holding[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'portfolios', portfolioId, 'holdings'),
    orderBy('addedAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const holdings: Holding[] = snap.docs.map((d) => {
        const data = d.data();
        const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : (v as number) ?? tsNow());
        return {
          id: d.id,
          ...data,
          addedAt: toMs(data.addedAt),
          updatedAt: toMs(data.updatedAt),
        } as Holding;
      });
      cb(holdings);
    },
    (err) => {
      console.error('[portfolioService] subscribeToHoldings error:', err.message);
      cb([]);
    },
  );
}

// ─── Portfolio Intelligence Observations ──────────────────────────────────────

export async function addPortfolioObservation(
  params: Omit<PortfolioIntelligenceObservation, 'id' | 'createdAt' | 'acknowledged'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'portfolioIntelligence'), {
    ...params,
    acknowledged: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function acknowledgeObservation(observationId: string): Promise<void> {
  await updateDoc(doc(db, 'portfolioIntelligence', observationId), { acknowledged: true });
}

export function subscribeToPortfolioObservations(
  portfolioId: string,
  cb: (observations: PortfolioIntelligenceObservation[]) => void,
  limit = 20
): Unsubscribe {
  const q = query(
    collection(db, 'portfolioIntelligence'),
    where('portfolioId', '==', portfolioId),
    where('acknowledged', '==', false),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
    const observations: PortfolioIntelligenceObservation[] = snap.docs.slice(0, limit).map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt ?? tsNow()),
      } as PortfolioIntelligenceObservation;
    });
    cb(observations);
    },
    (err) => {
      console.error('[portfolioService] subscribeToPortfolioObservations error:', err.message);
      cb([]);
    },
  );
}

// ─── Intelligence Watchlists ──────────────────────────────────────────────────

export async function createWatchlist(
  uid: string,
  workspaceId: string,
  params: { name: string; description?: string; symbols?: string[]; tags?: string[] }
): Promise<string> {
  const ref = await addDoc(collection(db, 'intelligenceWatchlists'), {
    uid,
    workspaceId,
    name: params.name,
    description: params.description ?? '',
    symbols: params.symbols ?? [],
    tags: params.tags ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWatchlist(
  watchlistId: string,
  updates: Partial<Omit<IntelligenceWatchlist, 'id' | 'uid' | 'workspaceId' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'intelligenceWatchlists', watchlistId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWatchlist(watchlistId: string): Promise<void> {
  await deleteDoc(doc(db, 'intelligenceWatchlists', watchlistId));
}

export function subscribeToWatchlists(
  uid: string,
  workspaceId: string,
  cb: (watchlists: IntelligenceWatchlist[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'intelligenceWatchlists'),
    where('uid', '==', uid),
    where('workspaceId', '==', workspaceId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const watchlists: IntelligenceWatchlist[] = snap.docs.map((d) => {
      const data = d.data();
      const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : (v as number) ?? tsNow());
      return {
        id: d.id,
        ...data,
        createdAt: toMs(data.createdAt),
        updatedAt: toMs(data.updatedAt),
      } as IntelligenceWatchlist;
    });
    cb(watchlists);
  });
}

/** Promote a watchlist to a portfolio (copies symbols as holdings). */
export async function promoteWatchlistToPortfolio(
  uid: string,
  workspaceId: string,
  watchlistId: string,
  watchlistName: string,
  symbols: Array<{ symbol: string; name: string }>
): Promise<string> {
  const portfolioId = await createPortfolio(uid, workspaceId, {
    name: watchlistName,
    type: 'long-only',
    isWatchlist: false,
    tags: ['from-watchlist'],
  });

  for (const s of symbols) {
    await addHolding(portfolioId, workspaceId, {
      symbol: s.symbol,
      name: s.name,
      assetClass: 'equity',
    });
  }

  // Link watchlist → portfolio
  await updateDoc(doc(db, 'intelligenceWatchlists', watchlistId), {
    targetPortfolioId: portfolioId,
    updatedAt: serverTimestamp(),
  });

  return portfolioId;
}
