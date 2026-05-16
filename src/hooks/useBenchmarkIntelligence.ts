/**
 * useBenchmarkIntelligence — pull aligned 2-year histories for an asset and
 * a benchmark, then compute the institutional benchmark-intelligence
 * package (beta, alpha, tracking error, info ratio, hit ratio, capture,
 * rolling beta + drift).
 *
 * Returns `null` snapshot when overlap is insufficient — the panel renders
 * an explicit insufficient state rather than fabricated numbers.
 */

import { useMemo } from 'react';
import { useOHLCV } from './useMarket';
import { buildBenchmarkIntelligence, type BenchmarkIntelligence } from '../lib/quant';

const HISTORY_BARS = 504;

export interface BenchmarkIntelligenceResult {
  loading: boolean;
  ready: boolean;
  insufficient: boolean;
  snapshot: BenchmarkIntelligence | null;
  benchmark: string;
}

export function useBenchmarkIntelligence(
  symbol: string | null,
  benchmark: string = 'SPY',
): BenchmarkIntelligenceResult {
  const asset = useOHLCV(symbol, '1day', HISTORY_BARS);
  // Skip benchmark fetch when asset symbol equals benchmark (degenerate case).
  const sameAsBench = symbol === benchmark;
  const bench = useOHLCV(sameAsBench ? null : benchmark, '1day', HISTORY_BARS);

  return useMemo<BenchmarkIntelligenceResult>(() => {
    if (!symbol || sameAsBench) {
      return { loading: false, ready: false, insufficient: true, snapshot: null, benchmark };
    }
    const loading = asset.loading || bench.loading;
    if (loading) {
      return { loading, ready: false, insufficient: false, snapshot: null, benchmark };
    }
    const assetBars = asset.data?.bars ?? [];
    const benchBars = bench.data?.bars ?? [];
    if (!assetBars.length || !benchBars.length) {
      return { loading: false, ready: false, insufficient: true, snapshot: null, benchmark };
    }
    const snapshot = buildBenchmarkIntelligence(assetBars, benchBars, { symbol, benchmark });
    return {
      loading: false,
      ready: snapshot !== null,
      insufficient: snapshot === null,
      snapshot,
      benchmark,
    };
  }, [symbol, benchmark, sameAsBench, asset.loading, bench.loading, asset.data, bench.data]);
}
