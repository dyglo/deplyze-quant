/**
 * Trade-ticket math — pure helpers that power the buy/sell ticket previews
 * (cost, buying power, resulting weight, proceeds). Simulated capital only; no
 * execution. Unit-tested. Reuses ledger/holdingMath for shared primitives.
 */

import { grossValue, realizedPnlOnReduce } from './ledger';

/** Total cost of a buy including optional frictions. */
export function estimatedCost(quantity: number, price: number, fees = 0, slippage = 0): number {
  return grossValue(quantity, price) + fees + slippage;
}

/** Cash left after a buy. May go negative (warn-but-allow). */
export function remainingCash(availableCash: number, cost: number): number {
  return availableCash - cost;
}

/** Fraction (0–1+) of available cash a buy consumes. >1 means it exceeds cash. */
export function pctOfBuyingPower(cost: number, availableCash: number): number {
  if (availableCash <= 0) return cost > 0 ? Infinity : 0;
  return cost / availableCash;
}

/** Whole/fractional shares affordable with the available cash at a price. */
export function maxAffordableShares(availableCash: number, price: number): number {
  if (price <= 0 || availableCash <= 0) return 0;
  return availableCash / price;
}

/** Gross proceeds from a reduce, before frictions. */
export function estimatedProceeds(quantity: number, price: number): number {
  return grossValue(quantity, price);
}

/** Realised P&L a reduce would book at the given price vs average cost. */
export function estimatedRealizedPnl(quantity: number, price: number, avgCost: number): number {
  return realizedPnlOnReduce(quantity, price, avgCost);
}

/**
 * Estimated weight of a position value against total portfolio NAV.
 * On a buy, NAV is ~unchanged (cash converts to position), so the new position's
 * weight ≈ positionValue / nav. Returns 0 when NAV is unknown/non-positive.
 */
export function resultingWeight(positionValue: number, nav: number): number {
  if (nav <= 0) return 0;
  return positionValue / nav;
}
