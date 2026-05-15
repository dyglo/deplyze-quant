/**
 * Anomaly detection — institutional surface for unusual price, volume, and
 * dependency events. Each detector returns artifacts built via the
 * constructors from [[artifacts]], ready for persistence or timeline display.
 *
 * Strict-data policy: every detector skips bars without enough lookback to
 * compute a stable z-score / percentile. Nothing is fabricated.
 */

import type { OHLCVBar, ProviderId } from '../../types';
import { closes, logReturns } from './returns';
import { mean, stdev } from './primitives';
import { volatilityRegime, type VolState } from './volatility';
import { correlationDrift } from './correlation';
import {
  makeAnomalyEvent,
  makeVolatilityEvent,
  makeCorrelationBreakdown,
  makeRegimeTransition,
  type AnomalyEventArtifact,
  type VolatilityEventArtifact,
  type CorrelationBreakdownArtifact,
  type RegimeTransitionArtifact,
} from './artifacts';

export interface AnomalyDetectionConfig {
  /** |z-score| threshold for return anomalies. Default 2.5 (~1% of normal-tail). */
  returnZThreshold?: number;
  /** |z-score| threshold for volume anomalies. Default 3.0. */
  volumeZThreshold?: number;
  /** Rolling window for z-score baseline. Default 60 bars. */
  windowSize?: number;
  /** Limit on artifacts emitted per detector run. Most-recent first. */
  maxArtifacts?: number;
  /** Workspace / project IDs to stamp onto produced artifacts. */
  workspaceId?: string;
  projectId?: string;
  /** Provider lineage for produced artifacts. Defaults to ['derived']. */
  providerLineage?: ProviderId[];
}

const DEFAULTS: Required<Pick<AnomalyDetectionConfig,
  'returnZThreshold' | 'volumeZThreshold' | 'windowSize' | 'maxArtifacts'>> = {
  returnZThreshold: 2.5,
  volumeZThreshold: 3.0,
  windowSize: 60,
  maxArtifacts: 20,
};

function ctxFor(symbol: string, ts: number, cfg: AnomalyDetectionConfig) {
  return {
    symbols: [symbol],
    ts,
    workspaceId: cfg.workspaceId,
    projectId: cfg.projectId,
    providerLineage: cfg.providerLineage,
  };
}

/** Return-magnitude anomaly: per-bar log return is unusually large vs its
 *  rolling-window distribution. */
export function detectReturnAnomalies(
  bars: OHLCVBar[],
  symbol: string,
  config: AnomalyDetectionConfig = {},
): AnomalyEventArtifact[] {
  const cfg = { ...DEFAULTS, ...config };
  if (bars.length < cfg.windowSize + 2) return [];
  const cl = closes(bars);
  const lr = logReturns(cl);
  const out: AnomalyEventArtifact[] = [];
  for (let i = cfg.windowSize; i < lr.length; i++) {
    const window = lr.slice(i - cfg.windowSize, i);
    const s = stdev(window);
    if (s === 0) continue;
    const z = (lr[i] - mean(window)) / s;
    if (Math.abs(z) >= cfg.returnZThreshold) {
      // bars index: lr index i corresponds to bars index i+1 (logReturns drops first bar)
      const ts = bars[i + 1]?.ts ?? bars[bars.length - 1].ts;
      out.push(makeAnomalyEvent(
        ctxFor(symbol, ts, cfg),
        { metric: 'return_zscore', value: lr[i], zScore: z },
      ));
    }
  }
  // most-recent first, capped
  return out.reverse().slice(0, cfg.maxArtifacts);
}

/** Volume-magnitude anomaly: bar volume is unusually large vs its
 *  rolling-window distribution. */
export function detectVolumeAnomalies(
  bars: OHLCVBar[],
  symbol: string,
  config: AnomalyDetectionConfig = {},
): AnomalyEventArtifact[] {
  const cfg = { ...DEFAULTS, ...config };
  if (bars.length < cfg.windowSize + 2) return [];
  const vol = bars.map(b => b.volume);
  // Reject series with no volume data (FX / some indices).
  const nonZero = vol.filter(v => v > 0).length;
  if (nonZero < cfg.windowSize) return [];
  const out: AnomalyEventArtifact[] = [];
  for (let i = cfg.windowSize; i < vol.length; i++) {
    const window = vol.slice(i - cfg.windowSize, i);
    const s = stdev(window);
    if (s === 0) continue;
    const z = (vol[i] - mean(window)) / s;
    if (Math.abs(z) >= cfg.volumeZThreshold) {
      out.push(makeAnomalyEvent(
        ctxFor(symbol, bars[i].ts, cfg),
        { metric: 'volume_zscore', value: vol[i], zScore: z },
      ));
    }
  }
  return out.reverse().slice(0, cfg.maxArtifacts);
}

/** Volatility-state event: emit an artifact when the *current* vol regime is
 *  in an extreme percentile or in a transitioning trend. One artifact, not
 *  a historical scan — callers run this on each fresh evaluation. */
export function detectVolatilityEvent(
  bars: OHLCVBar[],
  symbol: string,
  config: AnomalyDetectionConfig = {},
): VolatilityEventArtifact | null {
  if (bars.length < 280) return null;
  const lr = logReturns(closes(bars));
  const reg = volatilityRegime(lr);
  if (!reg) return null;
  // Only emit when meaningful: extreme percentile OR active trend.
  const extreme = reg.percentileRank < 0.1 || reg.percentileRank > 0.9;
  const trending = reg.trend !== 'stable';
  if (!extreme && !trending) return null;
  return makeVolatilityEvent(
    ctxFor(symbol, bars[bars.length - 1].ts, config),
    reg,
  );
}

/** Correlation-breakdown wrapper: produces an artifact when the dependency
 *  shift between two return series crosses the configured threshold. */
export function detectCorrelationBreakdown(
  aBars: OHLCVBar[],
  bBars: OHLCVBar[],
  symbols: [string, string],
  config: AnomalyDetectionConfig & { recentWindow?: number; baselineWindow?: number } = {},
): CorrelationBreakdownArtifact | null {
  const aLR = logReturns(closes(aBars));
  const bLR = logReturns(closes(bBars));
  const drift = correlationDrift(
    aLR,
    bLR,
    config.recentWindow ?? 21,
    config.baselineWindow ?? 126,
  );
  if (!drift) return null;
  if (drift.state === 'stable') return null;
  const ts = Math.min(
    aBars[aBars.length - 1]?.ts ?? Date.now(),
    bBars[bBars.length - 1]?.ts ?? Date.now(),
  );
  return makeCorrelationBreakdown(
    {
      pair: symbols,
      symbols: [symbols[0], symbols[1]],
      ts,
      workspaceId: config.workspaceId,
      projectId: config.projectId,
      providerLineage: config.providerLineage,
    },
    drift,
  );
}

/** Emit a regime-transition artifact when the volatility state changes
 *  between two evaluation points. Callers track `previousState` themselves;
 *  this is a pure constructor over the diff. */
export function makeVolStateTransition(
  symbol: string,
  previous: VolState,
  current: VolState,
  ts: number,
  durationBars?: number,
  config: AnomalyDetectionConfig = {},
): RegimeTransitionArtifact | null {
  if (previous === current) return null;
  return makeRegimeTransition(
    ctxFor(symbol, ts, config),
    `vol-${previous}`,
    `vol-${current}`,
    {
      durationBars,
      confidence: 0.7,
      metrics: {},
    },
  );
}

/** Convenience: run all single-series detectors at once and return a sorted
 *  (most-recent-first) flat list of artifacts. */
export function detectAllAnomalies(
  bars: OHLCVBar[],
  symbol: string,
  config: AnomalyDetectionConfig = {},
): Array<AnomalyEventArtifact | VolatilityEventArtifact> {
  const events: Array<AnomalyEventArtifact | VolatilityEventArtifact> = [];
  events.push(...detectReturnAnomalies(bars, symbol, config));
  events.push(...detectVolumeAnomalies(bars, symbol, config));
  const volEvt = detectVolatilityEvent(bars, symbol, config);
  if (volEvt) events.push(volEvt);
  return events.sort((a, b) => b.ts - a.ts).slice(0, config.maxArtifacts ?? 20);
}
