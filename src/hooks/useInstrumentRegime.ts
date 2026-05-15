/**
 * useInstrumentRegime — compute a MarketRegime + recent anomalies for a symbol
 * from a longer history window than the drawer's 90-day chart provides.
 *
 * Pulls 2 years of daily bars (504) so the volatility regime classifier has
 * enough history to produce statistically meaningful state. Returns null
 * while data is loading or when history is insufficient.
 */

import { useMemo } from 'react';
import { useOHLCV } from './useMarket';
import {
  classifyMarketRegime,
  detectReturnAnomalies,
  detectVolumeAnomalies,
  detectVolatilityEvent,
  type MarketRegime,
  type AnomalyEventArtifact,
  type VolatilityEventArtifact,
} from '../lib/quant';

export interface InstrumentRegimeResult {
  loading: boolean;
  ready: boolean;
  insufficient: boolean;
  regime: MarketRegime | null;
  volatilityEvent: VolatilityEventArtifact | null;
  returnAnomalies: AnomalyEventArtifact[];
  volumeAnomalies: AnomalyEventArtifact[];
  barCount: number;
}

const HISTORY_BARS = 504; // ~2 years of trading days
const MIN_BARS = 280;     // matches classifyMarketRegime's hard floor

export function useInstrumentRegime(symbol: string | null): InstrumentRegimeResult {
  const ohlcv = useOHLCV(symbol, '1day', HISTORY_BARS);
  const bars = ohlcv.data?.bars ?? [];

  return useMemo<InstrumentRegimeResult>(() => {
    if (!symbol || ohlcv.loading) {
      return {
        loading: ohlcv.loading,
        ready: false,
        insufficient: false,
        regime: null,
        volatilityEvent: null,
        returnAnomalies: [],
        volumeAnomalies: [],
        barCount: bars.length,
      };
    }
    if (bars.length < MIN_BARS) {
      return {
        loading: false,
        ready: false,
        insufficient: true,
        regime: null,
        volatilityEvent: null,
        returnAnomalies: [],
        volumeAnomalies: [],
        barCount: bars.length,
      };
    }
    const regime = classifyMarketRegime(bars, { symbol });
    const volatilityEvent = detectVolatilityEvent(bars, symbol);
    const returnAnomalies = detectReturnAnomalies(bars, symbol, { maxArtifacts: 5 });
    const volumeAnomalies = detectVolumeAnomalies(bars, symbol, { maxArtifacts: 5 });
    return {
      loading: false,
      ready: regime !== null,
      insufficient: regime === null,
      regime,
      volatilityEvent,
      returnAnomalies,
      volumeAnomalies,
      barCount: bars.length,
    };
  }, [symbol, ohlcv.loading, bars]);
}
