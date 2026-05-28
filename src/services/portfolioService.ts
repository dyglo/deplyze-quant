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
  Transaction,
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
    additionalBenchmarkIds?: string[];
    isWatchlist?: boolean;
    tags?: string[];
    startingCapital?: number;
    cashBalance?: number;
    riskProfile?: Portfolio['riskProfile'];
  }
): Promise<string> {
  // Cash defaults to the funded capital when capital is set but cash is omitted.
  const cashBalance =
    params.cashBalance ?? (params.startingCapital != null ? params.startingCapital : null);

  const ref = await addDoc(collection(db, 'portfolios'), {
    uid,
    workspaceId,
    name: params.name,
    description: params.description ?? '',
    type: params.type ?? 'long-only',
    status: 'active',
    currency: params.currency ?? 'USD',
    benchmarkId: params.benchmarkId ?? DEFAULT_BENCHMARK_ID,
    additionalBenchmarkIds: params.additionalBenchmarkIds ?? [],
    isWatchlist: params.isWatchlist ?? false,
    tags: params.tags ?? [],
    startingCapital: params.startingCapital ?? null,
    cashBalance,
    realizedPnl: 0,
    riskProfile: params.riskProfile ?? null,
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
  // Delete subcollections first (holdings + transaction ledger)
  const holdingsSnap = await getDocs(collection(db, 'portfolios', portfolioId, 'holdings'));
  for (const d of holdingsSnap.docs) {
    await deleteDoc(d.ref);
  }
  const txSnap = await getDocs(collection(db, 'portfolios', portfolioId, 'transactions'));
  for (const d of txSnap.docs) {
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
  // Single-field where only — no composite index required.
  // workspaceId filter and sort applied client-side.
  const q = query(
    collection(db, 'portfolios'),
    where('uid', '==', uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const portfolios: Portfolio[] = snap.docs
        .map((d) => {
          const data = d.data();
          const convert = (v: unknown): unknown => (v instanceof Timestamp ? v.toMillis() : v);
          return {
            id: d.id,
            ...data,
            createdAt: convert(data.createdAt) as number,
            updatedAt: convert(data.updatedAt) as number,
          } as Portfolio;
        })
        .filter(p => p.workspaceId === workspaceId && (p as any).status !== 'archived')
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
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
    status?: Holding['status'];
    entryDate?: number;
    targetWeight?: number;
    realizedPnl?: number;
    thesis?: string;
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
    status: params.status ?? 'active',
    entryDate: params.entryDate ?? null,
    targetWeight: params.targetWeight ?? null,
    realizedPnl: params.realizedPnl ?? 0,
    thesis: params.thesis ?? '',
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
      status: data.status ?? 'active',
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
          status: data.status ?? 'active',
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

// ─── Transaction Ledger ────────────────────────────────────────────────────────
// Storage layer only — the PR2 transaction engine consumes these writes to fold
// holdings and mutate cash. Stored at portfolios/{portfolioId}/transactions/{txId}.

export async function addTransaction(
  portfolioId: string,
  workspaceId: string,
  uid: string,
  params: {
    symbol: string;
    action: Transaction['action'];
    quantity: number;
    price: number;
    grossValue: number;
    cashImpact: number;
    fees?: number;
    slippage?: number;
    note?: string;
    thesis?: string;
    linkedArtifactIds?: string[];
    ts?: number;
  }
): Promise<string> {
  const ref = await addDoc(collection(db, 'portfolios', portfolioId, 'transactions'), {
    portfolioId,
    workspaceId,
    uid,
    symbol: params.symbol.toUpperCase(),
    action: params.action,
    quantity: params.quantity,
    price: params.price,
    grossValue: params.grossValue,
    cashImpact: params.cashImpact,
    fees: params.fees ?? 0,
    slippage: params.slippage ?? 0,
    note: params.note ?? '',
    thesis: params.thesis ?? '',
    linkedArtifactIds: params.linkedArtifactIds ?? [],
    ts: params.ts ?? Date.now(),
  });
  return ref.id;
}

export async function getTransactions(portfolioId: string): Promise<Transaction[]> {
  const snap = await getDocs(
    query(collection(db, 'portfolios', portfolioId, 'transactions'), orderBy('ts', 'asc'))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : (v as number) ?? tsNow());
    return { id: d.id, ...data, ts: toMs(data.ts) } as Transaction;
  });
}

export function subscribeToTransactions(
  portfolioId: string,
  cb: (transactions: Transaction[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'portfolios', portfolioId, 'transactions'),
    orderBy('ts', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const transactions: Transaction[] = snap.docs.map((d) => {
        const data = d.data();
        const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : (v as number) ?? tsNow());
        return { id: d.id, ...data, ts: toMs(data.ts) } as Transaction;
      });
      cb(transactions);
    },
    (err) => {
      console.error('[portfolioService] subscribeToTransactions error:', err.message);
      cb([]);
    },
  );
}

/** Delete a ledger entry — for corrections only. PR2 re-reconciles after this. */
export async function deleteTransaction(portfolioId: string, txId: string): Promise<void> {
  await deleteDoc(doc(db, 'portfolios', portfolioId, 'transactions', txId));
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
  // Single-field where only — no composite index required.
  // acknowledged filter and sort applied client-side.
  const q = query(
    collection(db, 'portfolioIntelligence'),
    where('portfolioId', '==', portfolioId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const observations: PortfolioIntelligenceObservation[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt ?? tsNow()),
          } as PortfolioIntelligenceObservation;
        })
        .filter(o => !o.acknowledged)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
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

// ─── Custom Stress Scenarios ──────────────────────────────────────────────────

export interface CustomScenario {
  id: string;
  uid: string;
  workspaceId: string;
  label: string;
  period: string;
  description: string;
  shocks: {
    equity:     number;
    bonds:      number;
    gold:       number;
    oil:        number;
    crypto:     number;
    realestate: number;
    highyield:  number;
    financials: number;
    vix:        number;
  };
  regime: {
    correlationStress:  number;
    liquidityStress:    number;
    volMultiplier:      number;
    recoveryDays:       number;
    forcedDeleveraging: boolean;
  };
  createdAt: number;
}

export async function saveCustomScenario(
  uid: string,
  workspaceId: string,
  params: Omit<CustomScenario, 'id' | 'uid' | 'workspaceId' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'customScenarios'), {
    uid,
    workspaceId,
    ...params,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCustomScenario(
  id: string,
  params: Omit<CustomScenario, 'id' | 'uid' | 'workspaceId' | 'createdAt'>
): Promise<void> {
  await updateDoc(doc(db, 'customScenarios', id), { ...params });
}

export async function deleteCustomScenario(id: string): Promise<void> {
  await deleteDoc(doc(db, 'customScenarios', id));
}

export function subscribeToCustomScenarios(
  uid: string,
  workspaceId: string,
  cb: (scenarios: CustomScenario[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'customScenarios'),
    where('uid', '==', uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const scenarios: CustomScenario[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt ?? Date.now()),
          } as CustomScenario;
        })
        .filter(s => s.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt - a.createdAt);
      cb(scenarios);
    },
    (err) => {
      console.error('[portfolioService] subscribeToCustomScenarios error:', err.message);
      cb([]);
    },
  );
}
