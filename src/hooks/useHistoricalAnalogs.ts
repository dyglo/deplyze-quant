/**
 * useHistoricalAnalogs — find the historical windows whose fingerprint
 * most closely matches the latest N bars of `symbol`.
 *
 * Pulls a long history (default 10 years of daily bars) so the analog engine
 * has a meaningful pool of candidate windows. Returns an empty match list
 * when history is insufficient — never fabricated matches.
 */

import { useMemo } from 'react';
import { useOHLCV } from './useMarket';
import { findHistoricalAnalogs, type AnalogMatch, type FindAnalogsOptions } from '../lib/quant';

export interface HistoricalAnalogsResult {
  loading: boolean;
  ready: boolean;
  matches: AnalogMatch[];
  barCount: number;
}

const HISTORY_BARS = 2520;       // ~10 years of daily trading bars
const MIN_BARS_FOR_ANALOG = 180; // 3 × default window

export function useHistoricalAnalogs(
  symbol: string | null,
  options: FindAnalogsOptions = {},
): HistoricalAnalogsResult {
  const ohlcv = useOHLCV(symbol, '1day', HISTORY_BARS);
  const bars = ohlcv.data?.bars ?? [];

  return useMemo<HistoricalAnalogsResult>(() => {
    if (!symbol || ohlcv.loading) {
      return { loading: ohlcv.loading, ready: false, matches: [], barCount: bars.length };
    }
    if (bars.length < MIN_BARS_FOR_ANALOG) {
      return { loading: false, ready: false, matches: [], barCount: bars.length };
    }
    const matches = findHistoricalAnalogs(bars, options);
    return { loading: false, ready: matches.length > 0, matches, barCount: bars.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, ohlcv.loading, bars, options.window, options.step, options.topK, options.minGap]);
}
