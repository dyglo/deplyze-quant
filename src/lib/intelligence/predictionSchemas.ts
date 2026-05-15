/**
 * Prediction and model output schemas.
 *
 * These schemas prepare the platform for institutional model outputs without
 * generating fake predictions. They define the data contracts that will be
 * populated when real model pipelines are connected.
 *
 * Architecture:
 *   PredictionArtifact     — a model's output at a point in time
 *   ModelOutputRecord      — raw model outputs keyed by model
 *   BenchmarkComparison    — compare a model against a baseline
 *   ExplainabilityRecord   — SHAP-style feature attributions
 *   IntelligenceTimeline   — ordered research events for historical recall
 */

import type { PredictionHorizon, ConfidenceLevel, ModelOutputType } from '../../types';

// ─── Core prediction contract ──────────────────────────────────────────────

export interface FeatureContribution {
  name: string;
  value: number;
  contribution: number;      // -1..1 (positive = supports prediction)
  direction: 'positive' | 'negative' | 'neutral';
  importance: number;        // absolute importance rank 0..1
}

export interface PredictionOutcome {
  actualValue?: string | number;
  resolvedAt?: number;
  error?: number;
  relativeError?: number;
  accuracy?: number;         // for classification outputs
  notes?: string;
}

export interface PredictionRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  // Model identity
  modelId: string;
  modelVersion?: string;
  modelName?: string;
  // Scope
  outputType: ModelOutputType;
  symbol?: string;
  symbols?: string[];
  // Temporal
  horizon: PredictionHorizon;
  generatedAt: number;       // unix ms
  validUntil?: number;
  // Prediction
  prediction: string | number;
  predictionLabel?: string;  // human-readable form
  confidence: number;        // 0..1
  confidenceLevel: ConfidenceLevel;
  confidenceInterval?: [number, number];
  // Explainability
  features?: FeatureContribution[];
  explanation?: string;
  methodology?: string;
  assumptions?: string[];
  // Benchmark
  benchmarkPrediction?: string | number;
  benchmarkModelId?: string;
  // Outcome (populated after horizon elapses)
  outcome?: PredictionOutcome;
  // Metadata
  tags?: string[];
  source: 'model' | 'agent' | 'research';
  createdBy?: string;
  updatedAt?: number;
}

// ─── Model registry entry ──────────────────────────────────────────────────

export type ModelStatus = 'active' | 'inactive' | 'experimental' | 'deprecated' | 'planned';

export interface ModelRegistryEntry {
  id: string;
  name: string;
  description: string;
  outputType: ModelOutputType;
  horizon?: PredictionHorizon;
  supportedAssets?: string[];  // ['equity', 'fx', 'crypto'] or specific symbols
  status: ModelStatus;
  version?: string;
  lastRunAt?: number;
  predictionCount?: number;
  accuracyMetrics?: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1?: number;
    mse?: number;
    mae?: number;
    informationCoefficient?: number;
    hitRate?: number;
  };
  features?: string[];
  createdAt: number;
}

// ─── Benchmark comparison ──────────────────────────────────────────────────

export interface BenchmarkComparison {
  modelId: string;
  benchmarkId: string;         // 'buy_and_hold' | 'equal_weight' | another modelId
  symbol?: string;
  windowDays: number;
  // Model performance
  modelAccuracy?: number;
  modelHitRate?: number;
  modelSharpe?: number;
  modelReturn?: number;
  // Benchmark performance
  benchmarkAccuracy?: number;
  benchmarkHitRate?: number;
  benchmarkSharpe?: number;
  benchmarkReturn?: number;
  // Relative
  informationRatio?: number;
  skillScore?: number;        // model accuracy / benchmark accuracy - 1
  asOf: number;
}

// ─── Explainability record ────────────────────────────────────────────────

export interface ExplainabilityRecord {
  predictionId: string;
  modelId: string;
  symbol?: string;
  ts: number;
  features: FeatureContribution[];
  topFeatures: string[];      // top 5 feature names by |contribution|
  explanation: string;        // AI-generated narrative
  confidence: number;
  methodology: 'shap' | 'lime' | 'gradient' | 'attention' | 'custom';
}

// ─── Intelligence timeline memory ─────────────────────────────────────────

export type TimelineEventKind =
  | 'prediction'
  | 'regime_change'
  | 'volatility_spike'
  | 'earnings_surprise'
  | 'anomaly_detected'
  | 'correlation_breakdown'
  | 'model_output'
  | 'research_note'
  | 'briefing'
  | 'copilot_insight';

export interface IntelligenceTimelineEvent {
  id: string;
  kind: TimelineEventKind;
  ts: number;                 // unix ms — when the event occurred
  recordedAt: number;         // unix ms — when it was recorded
  title: string;
  summary?: string;
  symbols?: string[];
  confidence?: number;
  significance?: number;      // 0..1 — how significant is this event
  tags?: string[];
  sourceId?: string;          // linked artifact / prediction / briefing ID
  metadata?: Record<string, unknown>;
}

// ─── Research memory ──────────────────────────────────────────────────────

export interface ResearchMemoryEntry {
  id: string;
  workspaceId: string;
  projectId?: string;
  kind: 'hypothesis' | 'finding' | 'note' | 'signal' | 'risk';
  content: string;
  symbols?: string[];
  tags?: string[];
  confidence?: number;
  expiresAt?: number;         // unix ms — when this memory becomes stale
  linkedArtifactIds?: string[];
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
}

// ─── Model output normalisation utilities ──────────────────────────────────

export function normaliseConfidence(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'very-high';
  if (score >= 0.70) return 'high';
  if (score >= 0.50) return 'medium';
  return 'low';
}

export function confidenceLevelScore(level: ConfidenceLevel): number {
  const map: Record<ConfidenceLevel, number> = {
    'low': 0.35,
    'medium': 0.60,
    'high': 0.80,
    'very-high': 0.92,
  };
  return map[level];
}

export function horizonToDays(horizon: PredictionHorizon): number {
  const map: Record<PredictionHorizon, number> = {
    '1d': 1, '5d': 5, '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365,
  };
  return map[horizon];
}
