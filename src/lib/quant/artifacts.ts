/**
 * Quant artifact constructors.
 *
 * Every important quantitative event in the platform should be expressible as
 * a `QuantArtifact` — a structured, persistable, AI-narratable record with:
 *   • timestamps and the symbols it concerns
 *   • a numeric confidence (0..1) and confidence level
 *   • the statistical evidence that produced it
 *   • a generated narrative for UI / Copilot consumption
 *   • tags for filtering and provider lineage for auditability
 *
 * Artifacts are intentionally side-effect-free: constructors compute and shape
 * the record but do not persist. Storage lives in the warehouse / Firestore
 * layer and is wired up in later waves.
 */

import type { ProviderId, ConfidenceLevel } from '../../types';
import type { IntelligenceTimelineEvent, TimelineEventKind } from '../intelligence/predictionSchemas';
import { normaliseConfidence } from '../intelligence/predictionSchemas';
import type { VolatilityRegime, VolState } from './volatility';
import type { CorrelationDrift } from './correlation';
import type { SeasonalSignal } from './seasonality';

// ─── Common shape ──────────────────────────────────────────────────────────

export type QuantArtifactKind =
  | 'volatility_event'
  | 'regime_transition'
  | 'anomaly_event'
  | 'correlation_breakdown'
  | 'seasonal_signal'
  | 'historical_analog'
  | 'benchmark_shift'
  | 'macro_alignment_change';

export interface ArtifactEvidence {
  /** Free-form numeric supporting metrics, e.g. { realisedVol: 0.13, percentileRank: 0.07 }. */
  metrics: Record<string, number>;
  /** Optional time windows that contributed, e.g. { window: 21, lookbackDays: 252 }. */
  windows?: Record<string, number>;
  /** Statistical test outputs / z-scores / p-value proxies if any. */
  statistics?: Record<string, number>;
}

export interface QuantArtifactBase {
  id: string;
  kind: QuantArtifactKind;
  ts: number;                         // event time (unix ms)
  recordedAt: number;                 // construction time (unix ms)
  symbols: string[];
  relatedSymbols?: string[];
  confidence: number;                 // 0..1
  confidenceLevel: ConfidenceLevel;
  significance: number;               // 0..1
  evidence: ArtifactEvidence;
  narrative: string;                  // generated, human-readable explanation
  tags: string[];
  providerLineage: ProviderId[];      // which providers' data backed this artifact
  workspaceId?: string;
  projectId?: string;
}

// ─── Discriminated artifact subtypes ───────────────────────────────────────

export interface VolatilityEventArtifact extends QuantArtifactBase {
  kind: 'volatility_event';
  payload: {
    state: VolState;
    realisedVol: number;
    percentileRank: number;
    trend: VolatilityRegime['trend'];
  };
}

export interface RegimeTransitionArtifact extends QuantArtifactBase {
  kind: 'regime_transition';
  payload: {
    fromState: string;
    toState: string;
    durationBars: number | null;
  };
}

export interface AnomalyEventArtifact extends QuantArtifactBase {
  kind: 'anomaly_event';
  payload: {
    metric: string;                   // e.g. 'return_zscore' | 'volume_zscore'
    value: number;
    zScore: number;
    direction: 'positive' | 'negative';
  };
}

export interface CorrelationBreakdownArtifact extends QuantArtifactBase {
  kind: 'correlation_breakdown';
  payload: {
    pair: [string, string];
    currentCorrelation: number;
    historicalCorrelation: number;
    delta: number;
    zScore: number;
    state: CorrelationDrift['state'];
  };
}

export interface SeasonalSignalArtifact extends QuantArtifactBase {
  kind: 'seasonal_signal';
  payload: SeasonalSignal & { bucketKind: 'month' | 'weekday' };
}

export interface HistoricalAnalogArtifact extends QuantArtifactBase {
  kind: 'historical_analog';
  payload: {
    matches: Array<{
      label: string;                  // e.g. 'October 2022'
      similarity: number;             // 0..1
      windowStart: number;            // unix ms
      windowEnd: number;              // unix ms
    }>;
  };
}

export interface BenchmarkShiftArtifact extends QuantArtifactBase {
  kind: 'benchmark_shift';
  payload: {
    benchmark: string;
    metric: 'beta' | 'tracking_error' | 'information_ratio' | 'hit_ratio';
    previous: number;
    current: number;
    delta: number;
  };
}

export interface MacroAlignmentChangeArtifact extends QuantArtifactBase {
  kind: 'macro_alignment_change';
  payload: {
    regime: string;
    alignmentScore: number;           // -1..1
    previousScore: number;
    drivers: string[];                // e.g. ['DXY rising', 'real yields up']
  };
}

export type QuantArtifact =
  | VolatilityEventArtifact
  | RegimeTransitionArtifact
  | AnomalyEventArtifact
  | CorrelationBreakdownArtifact
  | SeasonalSignalArtifact
  | HistoricalAnalogArtifact
  | BenchmarkShiftArtifact
  | MacroAlignmentChangeArtifact;

// ─── ID helper ─────────────────────────────────────────────────────────────

function makeId(kind: QuantArtifactKind, ts: number, symbols: string[]): string {
  const sym = symbols.join('-').slice(0, 32) || 'multi';
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}:${sym}:${ts}:${rand}`;
}

// ─── Confidence helpers ────────────────────────────────────────────────────

/** Clamp a raw confidence-like score into [0, 1]. */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// ─── Constructors ──────────────────────────────────────────────────────────

export interface ArtifactContext {
  symbols: string[];
  relatedSymbols?: string[];
  ts?: number;
  workspaceId?: string;
  projectId?: string;
  providerLineage?: ProviderId[];
  tags?: string[];
}

export function makeVolatilityEvent(
  ctx: ArtifactContext,
  regime: VolatilityRegime,
): VolatilityEventArtifact {
  const ts = ctx.ts ?? Date.now();
  // Significance: how extreme is the percentile within the [0,1] band, weighted by trend strength.
  const extremeness = Math.max(regime.percentileRank, 1 - regime.percentileRank) * 2 - 1; // 0..1
  const trendBonus = regime.trend === 'stable' ? 0 : 0.15;
  const significance = clamp01(extremeness + trendBonus);
  const confidence = clamp01(0.5 + Math.abs(regime.zScore) / 6);

  const sym = ctx.symbols[0] ?? 'index';
  const pctLabel = `${Math.round(regime.percentileRank * 100)}th percentile`;
  const trendLabel = regime.trend === 'expanding'
    ? 'with vol expanding'
    : regime.trend === 'compressing'
      ? 'with vol compressing'
      : 'with vol stable';
  const narrative =
    `${sym} realised volatility (${(regime.realisedVol * 100).toFixed(1)}%) sits in the ` +
    `${pctLabel} of its rolling-window history ${trendLabel}. ` +
    `State: ${regime.state}.`;

  return {
    id: makeId('volatility_event', ts, ctx.symbols),
    kind: 'volatility_event',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.symbols,
    relatedSymbols: ctx.relatedSymbols,
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: {
      metrics: {
        realisedVol: regime.realisedVol,
        percentileRank: regime.percentileRank,
        ratio: regime.ratio,
      },
      statistics: { zScore: regime.zScore },
    },
    narrative,
    tags: ['volatility', regime.state, regime.trend, ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload: {
      state: regime.state,
      realisedVol: regime.realisedVol,
      percentileRank: regime.percentileRank,
      trend: regime.trend,
    },
  };
}

export function makeRegimeTransition(
  ctx: ArtifactContext,
  fromState: string,
  toState: string,
  opts: { durationBars?: number; confidence?: number; metrics?: Record<string, number> } = {},
): RegimeTransitionArtifact {
  const ts = ctx.ts ?? Date.now();
  const confidence = clamp01(opts.confidence ?? 0.65);
  const significance = fromState === toState ? 0.2 : 0.75;
  const narrative =
    `Regime transition detected for ${ctx.symbols.join(', ') || 'index'}: ` +
    `${fromState} → ${toState}` +
    (opts.durationBars ? ` after ${opts.durationBars} bars in the prior state.` : '.');
  return {
    id: makeId('regime_transition', ts, ctx.symbols),
    kind: 'regime_transition',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.symbols,
    relatedSymbols: ctx.relatedSymbols,
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: { metrics: opts.metrics ?? {} },
    narrative,
    tags: ['regime', 'transition', fromState, toState, ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload: { fromState, toState, durationBars: opts.durationBars ?? null },
  };
}

export function makeAnomalyEvent(
  ctx: ArtifactContext,
  opts: { metric: string; value: number; zScore: number },
): AnomalyEventArtifact {
  const ts = ctx.ts ?? Date.now();
  const absZ = Math.abs(opts.zScore);
  const confidence = clamp01(0.45 + absZ / 8);
  const significance = clamp01(absZ / 5);
  const direction: 'positive' | 'negative' = opts.zScore >= 0 ? 'positive' : 'negative';
  const sym = ctx.symbols[0] ?? 'series';
  const narrative =
    `Anomalous ${opts.metric} reading on ${sym}: value ${opts.value.toFixed(4)}, ` +
    `z-score ${opts.zScore.toFixed(2)} (${direction}-tail).`;
  return {
    id: makeId('anomaly_event', ts, ctx.symbols),
    kind: 'anomaly_event',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.symbols,
    relatedSymbols: ctx.relatedSymbols,
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: {
      metrics: { value: opts.value },
      statistics: { zScore: opts.zScore },
    },
    narrative,
    tags: ['anomaly', opts.metric, direction, ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload: { metric: opts.metric, value: opts.value, zScore: opts.zScore, direction },
  };
}

export function makeCorrelationBreakdown(
  ctx: ArtifactContext & { pair: [string, string] },
  drift: CorrelationDrift,
): CorrelationBreakdownArtifact {
  const ts = ctx.ts ?? Date.now();
  const confidence = clamp01(0.5 + Math.abs(drift.zScore) / 6);
  const significance = clamp01(Math.abs(drift.zScore) / 4);
  const narrative =
    `${ctx.pair[0]}↔${ctx.pair[1]} correlation shifted from ` +
    `${drift.historical.toFixed(2)} to ${drift.current.toFixed(2)} ` +
    `(Δ ${drift.delta.toFixed(2)}, z ${drift.zScore.toFixed(2)}). State: ${drift.state}.`;
  return {
    id: makeId('correlation_breakdown', ts, ctx.pair),
    kind: 'correlation_breakdown',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.pair,
    relatedSymbols: ctx.relatedSymbols,
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: {
      metrics: { current: drift.current, historical: drift.historical, delta: drift.delta },
      statistics: { zScore: drift.zScore },
    },
    narrative,
    tags: ['correlation', drift.state, ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload: {
      pair: ctx.pair,
      currentCorrelation: drift.current,
      historicalCorrelation: drift.historical,
      delta: drift.delta,
      zScore: drift.zScore,
      state: drift.state,
    },
  };
}

export function makeSeasonalSignal(
  ctx: ArtifactContext,
  signal: SeasonalSignal,
  bucketKind: 'month' | 'weekday',
): SeasonalSignalArtifact {
  const ts = ctx.ts ?? Date.now();
  const confidence = clamp01(Math.min(0.9, signal.significance / 4));
  const significance = clamp01(signal.significance / 5);
  const narrative =
    `${ctx.symbols[0] ?? 'series'} shows a ${signal.direction} seasonal tendency in ${signal.bucket}: ` +
    `mean ${(signal.meanReturn * 100).toFixed(2)}% per period over ${signal.n} observations ` +
    `(hit rate ${(signal.hitRate * 100).toFixed(0)}%, t≈${signal.significance.toFixed(2)}).`;
  return {
    id: makeId('seasonal_signal', ts, ctx.symbols),
    kind: 'seasonal_signal',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.symbols,
    relatedSymbols: ctx.relatedSymbols,
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: {
      metrics: { meanReturn: signal.meanReturn, hitRate: signal.hitRate },
      statistics: { tStat: signal.significance, n: signal.n },
    },
    narrative,
    tags: ['seasonality', bucketKind, signal.direction, ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload: { ...signal, bucketKind },
  };
}

export function makeHistoricalAnalog(
  ctx: ArtifactContext,
  matches: HistoricalAnalogArtifact['payload']['matches'],
  opts: { confidence?: number } = {},
): HistoricalAnalogArtifact {
  const ts = ctx.ts ?? Date.now();
  const topSim = matches[0]?.similarity ?? 0;
  const confidence = clamp01(opts.confidence ?? topSim);
  const significance = clamp01(topSim);
  const narrative = matches.length
    ? `Closest historical analogs: ${matches.slice(0, 3).map(m => `${m.label} (${Math.round(m.similarity * 100)}%)`).join(', ')}.`
    : 'No sufficiently similar historical windows identified.';
  return {
    id: makeId('historical_analog', ts, ctx.symbols),
    kind: 'historical_analog',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.symbols,
    relatedSymbols: ctx.relatedSymbols,
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: { metrics: { topSimilarity: topSim, matchCount: matches.length } },
    narrative,
    tags: ['historical-analog', ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload: { matches },
  };
}

export function makeBenchmarkShift(
  ctx: ArtifactContext,
  payload: BenchmarkShiftArtifact['payload'],
  opts: { confidence?: number } = {},
): BenchmarkShiftArtifact {
  const ts = ctx.ts ?? Date.now();
  const confidence = clamp01(opts.confidence ?? 0.6);
  const denom = Math.max(Math.abs(payload.previous), 1e-6);
  const significance = clamp01(Math.abs(payload.delta) / denom);
  const narrative =
    `${ctx.symbols[0] ?? 'series'} ${payload.metric.replace('_', ' ')} vs ${payload.benchmark} ` +
    `moved from ${payload.previous.toFixed(3)} to ${payload.current.toFixed(3)} ` +
    `(Δ ${payload.delta.toFixed(3)}).`;
  return {
    id: makeId('benchmark_shift', ts, ctx.symbols),
    kind: 'benchmark_shift',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.symbols,
    relatedSymbols: [payload.benchmark, ...(ctx.relatedSymbols ?? [])],
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: {
      metrics: { previous: payload.previous, current: payload.current, delta: payload.delta },
    },
    narrative,
    tags: ['benchmark', payload.metric, ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload,
  };
}

export function makeMacroAlignmentChange(
  ctx: ArtifactContext,
  payload: MacroAlignmentChangeArtifact['payload'],
  opts: { confidence?: number } = {},
): MacroAlignmentChangeArtifact {
  const ts = ctx.ts ?? Date.now();
  const confidence = clamp01(opts.confidence ?? 0.6);
  const significance = clamp01(Math.abs(payload.alignmentScore - payload.previousScore));
  const driverList = payload.drivers.length ? ` Drivers: ${payload.drivers.join('; ')}.` : '';
  const narrative =
    `${payload.regime} macro alignment shifted from ${payload.previousScore.toFixed(2)} to ` +
    `${payload.alignmentScore.toFixed(2)}.${driverList}`;
  return {
    id: makeId('macro_alignment_change', ts, ctx.symbols),
    kind: 'macro_alignment_change',
    ts,
    recordedAt: Date.now(),
    symbols: ctx.symbols,
    relatedSymbols: ctx.relatedSymbols,
    confidence,
    confidenceLevel: normaliseConfidence(confidence),
    significance,
    evidence: {
      metrics: {
        alignmentScore: payload.alignmentScore,
        previousScore: payload.previousScore,
        delta: payload.alignmentScore - payload.previousScore,
      },
    },
    narrative,
    tags: ['macro', 'alignment', payload.regime, ...(ctx.tags ?? [])],
    providerLineage: ctx.providerLineage ?? ['derived'],
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    payload,
  };
}

// ─── Timeline projection ───────────────────────────────────────────────────

const KIND_TO_TIMELINE: Record<QuantArtifactKind, TimelineEventKind> = {
  volatility_event: 'volatility_spike',
  regime_transition: 'regime_change',
  anomaly_event: 'anomaly_detected',
  correlation_breakdown: 'correlation_breakdown',
  seasonal_signal: 'research_note',
  historical_analog: 'research_note',
  benchmark_shift: 'model_output',
  macro_alignment_change: 'regime_change',
};

/** Project an artifact onto the shared intelligence timeline format used by
 *  research memory, briefings, and Copilot. */
export function artifactToTimelineEvent(a: QuantArtifact): IntelligenceTimelineEvent {
  return {
    id: a.id,
    kind: KIND_TO_TIMELINE[a.kind],
    ts: a.ts,
    recordedAt: a.recordedAt,
    title: a.narrative.split('. ')[0],
    summary: a.narrative,
    symbols: a.symbols,
    confidence: a.confidence,
    significance: a.significance,
    tags: a.tags,
    sourceId: a.id,
    metadata: {
      artifactKind: a.kind,
      evidence: a.evidence,
      providerLineage: a.providerLineage,
    },
  };
}
