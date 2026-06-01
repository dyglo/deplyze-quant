/**
 * useHistoricalIntelligence — single hook driving the Historical Intelligence
 * Terminal page. Pulls a long bar history for a symbol + benchmark and
 * exposes the engines (analogs, regime, extremes, reversion, forward
 * distributions, scenarios) precomputed where it is cheap to do so.
 *
 * Strict-real-data: every field is `null` / `[]` when the underlying bars
 * are insufficient. The page renders empty-state messaging in that case.
 */

import { useMemo } from 'react';
import { useOHLCV } from './useMarket';
import {
  computeExtremesSnapshot,
  type ExtremesSnapshot,
  reversionProfile,
  type ReversionProfile,
  classifyMarketRegime,
  type MarketRegime,
  findHistoricalAnalogs,
  type AnalogMatch,
  logReturns,
  closes,
  forwardReturnDistributions,
  type ForwardReturnDistribution,
  DEFAULT_HORIZONS,
} from '../lib/quant';

export type LookbackKey = '1Y' | '3Y' | '5Y' | '10Y' | '20Y';

const LOOKBACK_BARS: Record<LookbackKey, number> = {
  '1Y':  252,
  '3Y':  756,
  '5Y':  1260,
  '10Y': 2520,
  '20Y': 5000,
};

const MIN_BARS = 220;

export interface HistoricalIntelligenceBundle {
  loading: boolean;
  ready: boolean;
  barCount: number;
  benchmarkBarCount: number;
  symbol: string;
  benchmark: string;
  lookback: LookbackKey;
  extremes: ExtremesSnapshot | null;
  reversion: ReversionProfile | null;
  regime: MarketRegime | null;
  analogs: AnalogMatch[];
  /** Unconditional forward-return distributions (baseline). */
  baselineForward: ForwardReturnDistribution[];
}

export function useHistoricalIntelligence(
  symbol: string | null,
  benchmark: string | null,
  lookback: LookbackKey,
): HistoricalIntelligenceBundle {
  const bars = LOOKBACK_BARS[lookback];
  const primary = useOHLCV(symbol, '1day', bars);
  const bench = useOHLCV(benchmark, '1day', bars);

  return useMemo<HistoricalIntelligenceBundle>(() => {
    const primaryBars = primary.data?.bars ?? [];
    const benchBars = bench.data?.bars ?? [];

    if (!symbol || primary.loading || (benchmark && bench.loading)) {
      return {
        loading: true,
        ready: false,
        barCount: primaryBars.length,
        benchmarkBarCount: benchBars.length,
        symbol: symbol ?? '',
        benchmark: benchmark ?? '',
        lookback,
        extremes: null,
        reversion: null,
        regime: null,
        analogs: [],
        baselineForward: [],
      };
    }

    if (primaryBars.length < MIN_BARS) {
      return {
        loading: false,
        ready: false,
        barCount: primaryBars.length,
        benchmarkBarCount: benchBars.length,
        symbol: symbol,
        benchmark: benchmark ?? '',
        lookback,
        extremes: null,
        reversion: null,
        regime: null,
        analogs: [],
        baselineForward: [],
      };
    }

    const extremes = computeExtremesSnapshot(primaryBars, { symbol });
    const reversion = reversionProfile(primaryBars, { symbol });
    const benchReturns = benchBars.length ? logReturns(closes(benchBars)) : undefined;
    const regime = classifyMarketRegime(primaryBars, { symbol, benchmarkReturns: benchReturns });
    const analogs = findHistoricalAnalogs(primaryBars, { topK: 5, window: 60 });
    const baselineForward = forwardReturnDistributions(primaryBars, indicesAll(primaryBars.length), DEFAULT_HORIZONS);

    return {
      loading: false,
      ready: true,
      barCount: primaryBars.length,
      benchmarkBarCount: benchBars.length,
      symbol,
      benchmark: benchmark ?? '',
      lookback,
      extremes,
      reversion,
      regime,
      analogs,
      baselineForward,
    };
  }, [symbol, benchmark, lookback, primary.loading, primary.data, bench.loading, bench.data]);
}

function indicesAll(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i);
  return out;
}
