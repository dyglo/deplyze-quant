/**
 * Portfolio ledger — pure, dependency-free per-transaction primitives.
 *
 * These are the building blocks the PR2 transaction engine sequences to fold a
 * ledger into holding snapshots, cash balances and realised P&L. Keeping them
 * pure (no Firestore, no React) makes the institutional math unit-testable in
 * isolation.
 *
 * Sign convention (single source of truth across the system):
 *   - buys / adds         → cash DECREASES (negative cashImpact)
 *   - trims / sells / closes → cash INCREASES (positive cashImpact)
 *   - fees & slippage always reduce net cash (cost more on entry, receive less on exit)
 *   - cash_adjust         → signed deposit(+)/withdrawal(-) handled by the engine, not here
 */

import type { TransactionAction } from './schemas';

const REDUCING_ACTIONS: ReadonlySet<TransactionAction> = new Set<TransactionAction>([
  'trim',
  'sell',
  'close',
]);
const INCREASING_ACTIONS: ReadonlySet<TransactionAction> = new Set<TransactionAction>([
  'buy',
  'add',
]);

export function isReducingAction(action: TransactionAction): boolean {
  return REDUCING_ACTIONS.has(action);
}

export function isIncreasingAction(action: TransactionAction): boolean {
  return INCREASING_ACTIONS.has(action);
}

/** Notional value of a transaction leg. Always >= 0. */
export function grossValue(quantity: number, price: number): number {
  return quantity * price;
}

/**
 * Signed effect on simulated cash for a single transaction.
 * Entries (buy/add) cost cash plus frictions → negative.
 * Exits (trim/sell/close) return cash minus frictions → positive.
 * cash_adjust is not a position leg and returns 0 here (the engine applies its
 * own signed amount).
 */
export function signedCashImpact(
  action: TransactionAction,
  quantity: number,
  price: number,
  fees = 0,
  slippage = 0,
): number {
  const frictions = fees + slippage;
  const gross = grossValue(quantity, price);
  if (isIncreasingAction(action)) {
    return -(gross + frictions);
  }
  if (isReducingAction(action)) {
    return gross - frictions;
  }
  return 0;
}

/** Shares purchasable for a dollar amount at a given price. */
export function sharesFromDollars(dollars: number, price: number): number {
  if (price <= 0) return 0;
  return dollars / price;
}

/** Dollar value of a share quantity at a given price. */
export function dollarsFromShares(shares: number, price: number): number {
  return shares * price;
}

/** Portfolio weight 0–1 of a position value against total value. */
export function weight(positionValue: number, totalValue: number): number {
  if (totalValue <= 0) return 0;
  return positionValue / totalValue;
}

/**
 * Average-cost basis after increasing a position.
 * Returns the new blended per-unit cost. Reductions never change avg cost.
 */
export function updatedAvgCost(
  prevQty: number,
  prevAvgCost: number,
  addQty: number,
  addPrice: number,
): number {
  const totalQty = prevQty + addQty;
  if (totalQty <= 0) return 0;
  const prevCost = prevQty * prevAvgCost;
  const addCost = addQty * addPrice;
  return (prevCost + addCost) / totalQty;
}

/**
 * Realised P&L when reducing a position by `reduceQty` at `exitPrice`,
 * given the position's average cost. Positive = gain.
 */
export function realizedPnlOnReduce(
  reduceQty: number,
  exitPrice: number,
  avgCost: number,
): number {
  return reduceQty * (exitPrice - avgCost);
}

// ─── Validation ────────────────────────────────────────────────────────────────

export interface TransactionInput {
  action: TransactionAction;
  quantity: number;
  price: number;
  fees?: number;
  slippage?: number;
  /** Currently-held quantity, when known — enables oversell guards. */
  currentQuantity?: number;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Guards transaction input before it reaches the ledger. Action-aware:
 * reducing actions can't exceed the held quantity when one is supplied, and a
 * `close` must clear the whole position.
 */
export function validateTransactionInput(input: TransactionInput): ValidationResult {
  const { action, quantity, price, fees, slippage, currentQuantity } = input;

  if (!isFiniteNumber(quantity)) return { ok: false, error: 'Quantity must be a finite number.' };
  if (!isFiniteNumber(price)) return { ok: false, error: 'Price must be a finite number.' };
  if (fees != null && (!isFiniteNumber(fees) || fees < 0)) {
    return { ok: false, error: 'Fees must be a non-negative number.' };
  }
  if (slippage != null && (!isFiniteNumber(slippage) || slippage < 0)) {
    return { ok: false, error: 'Slippage must be a non-negative number.' };
  }

  if (action === 'cash_adjust') {
    // Cash adjustments carry no position leg; quantity must be zero.
    if (quantity !== 0) return { ok: false, error: 'Cash adjustments must have zero quantity.' };
    return { ok: true };
  }

  if (quantity <= 0) return { ok: false, error: 'Quantity must be greater than zero.' };
  if (price <= 0) return { ok: false, error: 'Price must be greater than zero.' };

  if (isReducingAction(action) && currentQuantity != null) {
    if (!isFiniteNumber(currentQuantity) || currentQuantity <= 0) {
      return { ok: false, error: 'No open position to reduce.' };
    }
    if (quantity > currentQuantity + 1e-9) {
      return { ok: false, error: 'Cannot reduce more than the held quantity.' };
    }
    if (action === 'close' && quantity < currentQuantity - 1e-9) {
      return { ok: false, error: 'A close must exit the entire position.' };
    }
  }

  return { ok: true };
}
