/**
 * Awareness attribution — computes contribution by holding / sector / region
 * from already-cached portfolio performance hook output. Pure functions; no
 * new data fetches. Outputs are consumed by `DriverDecomposition`.
 *
 * Method:
 *   - Each holding has an effective weight and a total log-return over the
 *     selected window. Contribution ≈ weight × totalReturn (linear approx).
 *   - Grouping rolls contributions up by category (sector/region).
 */

import type { Holding } from './schemas';

export interface HoldingCurveLike {
  symbol: string;
  totalReturn: number;
}

export interface ContributionRow {
  key: string;            // symbol / sector / region label
  label: string;
  weight: number;         // sum of weights for this group (0..1)
  contribution: number;   // weighted return contribution (decimal, e.g. 0.013 = +1.3pp)
  count: number;          // number of holdings in this group
  symbols?: string[];     // for hover/expand
}

function safeWeight(w: number | undefined): number {
  return typeof w === 'number' && isFinite(w) && w > 0 ? w : 0;
}

function safeReturn(r: number | undefined): number {
  return typeof r === 'number' && isFinite(r) ? r : 0;
}

/** Per-holding contribution = effectiveWeight × totalReturn (linear, decimal). */
export function contributionByHolding(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  curves: HoldingCurveLike[],
): ContributionRow[] {
  const curveMap = new Map(curves.map(c => [c.symbol, c.totalReturn]));
  const rows: ContributionRow[] = holdings.map(h => {
    const w = safeWeight(effectiveWeights[h.symbol]);
    const r = safeReturn(curveMap.get(h.symbol));
    return {
      key: h.symbol,
      label: h.symbol,
      weight: w,
      contribution: w * r,
      count: 1,
      symbols: [h.symbol],
    };
  });
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return rows;
}

function groupBy(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  curves: HoldingCurveLike[],
  classify: (h: Holding) => string,
): ContributionRow[] {
  const curveMap = new Map(curves.map(c => [c.symbol, c.totalReturn]));
  const groups = new Map<string, ContributionRow>();
  for (const h of holdings) {
    const label = classify(h) || '—';
    const w = safeWeight(effectiveWeights[h.symbol]);
    const r = safeReturn(curveMap.get(h.symbol));
    const c = w * r;
    const existing = groups.get(label);
    if (existing) {
      existing.weight += w;
      existing.contribution += c;
      existing.count += 1;
      existing.symbols!.push(h.symbol);
    } else {
      groups.set(label, {
        key: label,
        label,
        weight: w,
        contribution: c,
        count: 1,
        symbols: [h.symbol],
      });
    }
  }
  const rows = Array.from(groups.values());
  rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return rows;
}

export function contributionBySector(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  curves: HoldingCurveLike[],
): ContributionRow[] {
  return groupBy(holdings, effectiveWeights, curves, h => h.sector ?? 'Unclassified');
}

export function contributionByRegion(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  curves: HoldingCurveLike[],
): ContributionRow[] {
  return groupBy(holdings, effectiveWeights, curves, h => h.region ?? h.country ?? 'Unclassified');
}

export function contributionByAssetClass(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  curves: HoldingCurveLike[],
): ContributionRow[] {
  return groupBy(holdings, effectiveWeights, curves, h => String(h.assetClass ?? 'unspecified'));
}

/** Sum of absolute contributions — useful for normalising the bar chart axis. */
export function totalAbsContribution(rows: ContributionRow[]): number {
  return rows.reduce((s, r) => s + Math.abs(r.contribution), 0);
}
