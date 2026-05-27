/**
 * valuationService.ts — relative valuation screen for the Market Home landing.
 *
 * There is no dedicated undervalued/overvalued gateway endpoint, so this derives
 * a *relative* valuation ranking client-side from real fundamental metrics
 * (P/E, P/B, EV/EBITDA, P/S) across a bounded mega-cap universe. Each metric is
 * percentile-ranked within the peer set (lower multiple = cheaper); the blended
 * cheapness score averages the available percentiles. This is a research signal,
 * not advice, and is explicitly relative to the tracked peer set.
 *
 * Bounded universe + 6h cache keep request fan-out modest and amortised.
 */

import { fetchFundamentalMetrics } from './fundamentalsService';
import type { FundamentalSnapshot } from '../lib/market-data/contracts';

const VALUATION_UNIVERSE: Array<{ symbol: string; name: string }> = [
  { symbol: 'AAPL',  name: 'Apple' },
  { symbol: 'MSFT',  name: 'Microsoft' },
  { symbol: 'NVDA',  name: 'NVIDIA' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN',  name: 'Amazon' },
  { symbol: 'META',  name: 'Meta Platforms' },
  { symbol: 'TSLA',  name: 'Tesla' },
  { symbol: 'JPM',   name: 'JPMorgan' },
  { symbol: 'V',     name: 'Visa' },
  { symbol: 'UNH',   name: 'UnitedHealth' },
  { symbol: 'XOM',   name: 'Exxon Mobil' },
  { symbol: 'COST',  name: 'Costco' },
];

const METRIC_KEYS = ['peRatio', 'pbRatio', 'evToEbitda', 'priceToSales'] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

export type ValuationLabel = 'undervalued' | 'fair' | 'overvalued';

export interface ValuationRow {
  symbol: string;
  name: string;
  /** 0 = cheapest in peer set, 1 = most expensive. */
  cheapnessScore: number;
  label: ValuationLabel;
  peRatio?: number;
  pbRatio?: number;
  evToEbitda?: number;
  priceToSales?: number;
  /** Fraction of the 4 metrics that were available (data completeness). */
  confidence: number;
}

export interface ValuationResult {
  undervalued: ValuationRow[];
  overvalued: ValuationRow[];
  /** Names where insufficient metrics were available to rank. */
  unrankedCount: number;
}

function percentileRanks(values: Array<number | undefined>): Array<number | undefined> {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => typeof x.v === 'number' && Number.isFinite(x.v) && x.v > 0);
  if (present.length < 2) return values.map(() => undefined);
  const sorted = [...present].sort((a, b) => a.v - b.v);
  const rankByIndex = new Map<number, number>();
  sorted.forEach((x, rank) => rankByIndex.set(x.i, rank / (sorted.length - 1)));
  return values.map((_, i) => rankByIndex.get(i));
}

export async function fetchValuationScreen(): Promise<ValuationResult> {
  const results = await Promise.allSettled(
    VALUATION_UNIVERSE.map((u) => fetchFundamentalMetrics(u.symbol, 'annual')),
  );

  const snapshots: Array<FundamentalSnapshot | null> = results.map((r) =>
    r.status === 'fulfilled' ? r.value.series[0] ?? null : null,
  );

  // Percentile-rank each metric across the universe.
  const ranksByMetric: Record<MetricKey, Array<number | undefined>> = {
    peRatio: percentileRanks(snapshots.map((s) => s?.peRatio)),
    pbRatio: percentileRanks(snapshots.map((s) => s?.pbRatio)),
    evToEbitda: percentileRanks(snapshots.map((s) => s?.evToEbitda)),
    priceToSales: percentileRanks(snapshots.map((s) => s?.priceToSales)),
  };

  const rows: ValuationRow[] = [];
  let unrankedCount = 0;

  VALUATION_UNIVERSE.forEach((u, i) => {
    const s = snapshots[i];
    const parts: number[] = [];
    for (const k of METRIC_KEYS) {
      const r = ranksByMetric[k][i];
      if (typeof r === 'number') parts.push(r);
    }
    if (parts.length < 2) { unrankedCount++; return; }
    const cheapnessScore = parts.reduce((a, b) => a + b, 0) / parts.length;
    const label: ValuationLabel =
      cheapnessScore <= 0.33 ? 'undervalued' : cheapnessScore >= 0.66 ? 'overvalued' : 'fair';
    rows.push({
      symbol: u.symbol,
      name: u.name,
      cheapnessScore,
      label,
      peRatio: s?.peRatio,
      pbRatio: s?.pbRatio,
      evToEbitda: s?.evToEbitda,
      priceToSales: s?.priceToSales,
      confidence: parts.length / METRIC_KEYS.length,
    });
  });

  const byCheap = [...rows].sort((a, b) => a.cheapnessScore - b.cheapnessScore);
  return {
    undervalued: byCheap.slice(0, 5),
    overvalued: byCheap.slice(-5).reverse(),
    unrankedCount,
  };
}
