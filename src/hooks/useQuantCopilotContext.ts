/**
 * useQuantCopilotContext — fetch 2y of OHLCV for the active symbol and
 * build a Copilot-ready quant snapshot string from it.
 *
 * The snapshot is `null` while loading, or when history is insufficient.
 * Callers should compose it into their existing system-message snapshot.
 */

import { useMemo } from 'react';
import { useOHLCV } from './useMarket';
import { quantSnapshotForSymbol } from '../lib/quant';

const HISTORY_BARS = 504;
const MIN_BARS = 280;

export interface QuantCopilotContext {
  loading: boolean;
  ready: boolean;
  snapshot: string | null;
  barCount: number;
}

export function useQuantCopilotContext(symbol: string | null): QuantCopilotContext {
  const ohlcv = useOHLCV(symbol, '1day', HISTORY_BARS);
  const bars = ohlcv.data?.bars ?? [];

  return useMemo<QuantCopilotContext>(() => {
    if (!symbol || ohlcv.loading) {
      return { loading: ohlcv.loading, ready: false, snapshot: null, barCount: bars.length };
    }
    if (bars.length < MIN_BARS) {
      return { loading: false, ready: false, snapshot: null, barCount: bars.length };
    }
    const snapshot = quantSnapshotForSymbol(symbol, bars);
    return { loading: false, ready: snapshot !== null, snapshot, barCount: bars.length };
  }, [symbol, ohlcv.loading, bars]);
}
