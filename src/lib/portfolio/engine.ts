/**
 * Portfolio transaction engine — pure ledger folding.
 *
 * Folds a transaction ledger into reconciled position state: quantity, average
 * cost, realised P&L and lifecycle status. The Firestore service layer
 * (portfolioService) writes a transaction then calls these to recompute the
 * holding snapshot + portfolio cash. Kept pure so the institutional math is
 * unit-testable without a database.
 *
 * Convention: reductions never change average cost; realised P&L is booked
 * against the average cost at the moment of the reduction. A position that
 * reaches zero quantity is marked 'closed' (retained for history) and can be
 * re-opened by a later buy.
 */

import type { HoldingStatus, TransactionAction } from './schemas';
import {
  isIncreasingAction,
  isReducingAction,
  updatedAvgCost,
  realizedPnlOnReduce,
} from './ledger';

/** Minimal transaction shape the engine needs (full Transaction satisfies it). */
export interface TxLike {
  symbol: string;
  action: TransactionAction;
  quantity: number;
  price: number;
  /** Signed cash effect; defaults to 0 when absent (engine never recomputes it). */
  cashImpact?: number;
  ts?: number;
}

export interface PositionState {
  symbol: string;
  quantity: number;
  /** Average cost per unit of the currently-open position. 0 when flat. */
  avgCost: number;
  /** Cumulative realised P&L booked on reductions. */
  realizedPnl: number;
  status: HoldingStatus;
  /** First time the position was opened from flat (unix ms). */
  firstEntryTs?: number;
  /** Last transaction timestamp touching this symbol (unix ms). */
  lastTxTs?: number;
  /** When the position last went flat (unix ms). Cleared on re-open. */
  closedAt?: number;
}

const QTY_EPSILON = 1e-9;

function emptyPosition(symbol: string): PositionState {
  return { symbol, quantity: 0, avgCost: 0, realizedPnl: 0, status: 'active' };
}

/** Apply a single transaction to a running position state (returns a new state). */
export function applyTransaction(state: PositionState, tx: TxLike): PositionState {
  const next: PositionState = { ...state };
  next.lastTxTs = tx.ts ?? next.lastTxTs;

  if (isIncreasingAction(tx.action)) {
    if (next.quantity <= QTY_EPSILON) {
      // Opening (or re-opening) from flat.
      next.firstEntryTs = tx.ts ?? next.firstEntryTs;
      next.closedAt = undefined;
      next.status = 'active';
    }
    next.avgCost = updatedAvgCost(next.quantity, next.avgCost, tx.quantity, tx.price);
    next.quantity = next.quantity + tx.quantity;
    return next;
  }

  if (isReducingAction(tx.action)) {
    const reduceQty = Math.min(tx.quantity, next.quantity);
    next.realizedPnl = next.realizedPnl + realizedPnlOnReduce(reduceQty, tx.price, next.avgCost);
    next.quantity = Math.max(0, next.quantity - tx.quantity);
    if (next.quantity <= QTY_EPSILON) {
      next.quantity = 0;
      next.avgCost = 0;
      next.status = 'closed';
      next.closedAt = tx.ts ?? next.closedAt;
    }
    return next;
  }

  // cash_adjust and any other non-position action: no position change.
  return next;
}

/** Fold all transactions for a single symbol into a final position state. */
export function foldPosition(symbol: string, txs: TxLike[]): PositionState {
  const ordered = [...txs]
    .filter((t) => t.symbol === symbol && t.action !== 'cash_adjust')
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return ordered.reduce(applyTransaction, emptyPosition(symbol));
}

/** Fold a full ledger into per-symbol position states (cash_adjust excluded). */
export function reconcilePositions(txs: TxLike[]): Map<string, PositionState> {
  const symbols = new Set<string>();
  for (const t of txs) {
    if (t.action !== 'cash_adjust' && t.symbol) symbols.add(t.symbol);
  }
  const out = new Map<string, PositionState>();
  for (const sym of symbols) {
    out.set(sym, foldPosition(sym, txs));
  }
  return out;
}

/** Net signed cash effect across the whole ledger (includes cash_adjust). */
export function netCashImpact(txs: TxLike[]): number {
  return txs.reduce((sum, t) => sum + (t.cashImpact ?? 0), 0);
}

/** Total realised P&L across all positions in the ledger. */
export function totalRealizedPnl(txs: TxLike[]): number {
  let total = 0;
  for (const pos of reconcilePositions(txs).values()) total += pos.realizedPnl;
  return total;
}

/**
 * Cash balance derived from funded capital and the ledger. Authoritative when
 * startingCapital is known: cash = startingCapital + Σ cashImpact.
 */
export function derivedCashBalance(startingCapital: number, txs: TxLike[]): number {
  return startingCapital + netCashImpact(txs);
}
