/**
 * Position display math — pure helpers for rendering a holding's live economics
 * (market value, unrealised P&L, allocation drift) from its reconciled snapshot
 * plus a current market price. Kept pure and unit-testable; no data fetching.
 */

/** Current market value of a position. */
export function marketValue(quantity: number, lastPrice: number): number {
  return quantity * lastPrice;
}

/** Cost basis value of a position (quantity × average cost). */
export function costValue(quantity: number, avgCost: number): number {
  return quantity * avgCost;
}

/** Unrealised P&L of an open position at the current price. */
export function unrealizedPnl(quantity: number, lastPrice: number, avgCost: number): number {
  return quantity * (lastPrice - avgCost);
}

/** Unrealised P&L as a fraction of cost basis (0.1 = +10%). */
export function unrealizedPnlPct(lastPrice: number, avgCost: number): number {
  if (avgCost <= 0) return 0;
  return (lastPrice - avgCost) / avgCost;
}

/**
 * Allocation drift: signed difference between current and target weight.
 * Positive = overweight vs target, negative = underweight.
 */
export function allocationDrift(currentWeight: number, targetWeight: number): number {
  return currentWeight - targetWeight;
}
