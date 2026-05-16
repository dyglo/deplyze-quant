/**
 * quantArtifactService — persist QuantArtifact records (Wave A) into the
 * existing Firestore artifacts collection so regime, anomaly, correlation,
 * and analog events accumulate as durable research memory alongside the
 * V1 artifact stream.
 *
 * Strategy: project each QuantArtifact onto the IntelligenceArtifact shape
 * already understood by the warehouse, related-intelligence panel, and the
 * artifact drawer. The discriminated payload survives in the `body`
 * markdown and in the `evidence` array so the original structured data is
 * never lost.
 */

import { createArtifact } from './artifactService';
import type { IntelligenceArtifact, ArtifactType, ArtifactCategory } from '../types';
import type { QuantArtifact, QuantArtifactKind } from '../lib/quant';

/** Map a Wave-A QuantArtifactKind onto the IntelligenceArtifact category
 *  used by the warehouse and related-intelligence filters. */
const KIND_TO_CATEGORY: Record<QuantArtifactKind, ArtifactCategory> = {
  volatility_event: 'volatility',
  regime_transition: 'regime',
  anomaly_event: 'anomaly',
  correlation_breakdown: 'correlation',
  seasonal_signal: 'opportunity',
  historical_analog: 'regime',
  benchmark_shift: 'risk',
  macro_alignment_change: 'macro',
};

/** Map onto the V2 ArtifactType literal — only the closest matches; falls
 *  back to 'market_note' for kinds without a precise existing literal. */
const KIND_TO_TYPE: Record<QuantArtifactKind, ArtifactType> = {
  volatility_event: 'volatility_anomaly',
  regime_transition: 'macro_shift',
  anomaly_event: 'volatility_anomaly',
  correlation_breakdown: 'correlation_breakdown',
  seasonal_signal: 'market_note',
  historical_analog: 'market_note',
  benchmark_shift: 'market_note',
  macro_alignment_change: 'macro_shift',
};

function buildBody(a: QuantArtifact): string {
  const lines: string[] = [];
  lines.push(`## ${a.narrative}`);
  lines.push('');
  lines.push(`**Kind:** \`${a.kind}\` · **Confidence:** ${(a.confidence * 100).toFixed(0)}% · **Significance:** ${(a.significance * 100).toFixed(0)}%`);
  if (a.symbols.length) lines.push(`**Symbols:** ${a.symbols.join(', ')}`);
  if (a.relatedSymbols?.length) lines.push(`**Related:** ${a.relatedSymbols.join(', ')}`);
  const metricEntries = Object.entries(a.evidence.metrics ?? {});
  if (metricEntries.length) {
    lines.push('');
    lines.push('### Evidence — metrics');
    lines.push('| Metric | Value |');
    lines.push('|---|---|');
    for (const [k, v] of metricEntries) lines.push(`| ${k} | ${Number(v).toFixed(4)} |`);
  }
  const statEntries = Object.entries(a.evidence.statistics ?? {});
  if (statEntries.length) {
    lines.push('');
    lines.push('### Evidence — statistics');
    lines.push('| Statistic | Value |');
    lines.push('|---|---|');
    for (const [k, v] of statEntries) lines.push(`| ${k} | ${Number(v).toFixed(4)} |`);
  }
  return lines.join('\n');
}

function buildEvidence(a: QuantArtifact): IntelligenceArtifact['evidence'] {
  const out: IntelligenceArtifact['evidence'] = [];
  for (const [k, v] of Object.entries(a.evidence.metrics ?? {})) {
    out.push({ label: k, value: Number(v.toFixed(4)), source: 'derived' });
  }
  for (const [k, v] of Object.entries(a.evidence.statistics ?? {})) {
    out.push({ label: k, value: Number(v.toFixed(4)), source: 'derived' });
  }
  return out;
}

/** Strip undefined values — Firestore rejects them. */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

/** Persist a single QuantArtifact to Firestore. Returns the new doc ID. */
export async function persistQuantArtifact(
  workspaceId: string,
  projectId: string,
  artifact: QuantArtifact,
  createdBy: string,
): Promise<string> {
  const payload: Omit<IntelligenceArtifact, 'id' | 'createdAt' | 'updatedAt'> = pruneUndefined({
    workspaceId,
    projectId,
    category: KIND_TO_CATEGORY[artifact.kind],
    artifactType: KIND_TO_TYPE[artifact.kind],
    title: artifact.narrative.split('. ')[0].slice(0, 140),
    narrative: artifact.narrative,
    summary: artifact.narrative,
    body: buildBody(artifact),
    symbols: artifact.symbols,
    relatedSymbols: artifact.relatedSymbols,
    confidence: artifact.confidence,
    confidenceScore: artifact.confidence,
    completenessScore: 1,
    significance: artifact.significance,
    evidence: buildEvidence(artifact),
    tags: ['quant-engine', artifact.kind, ...artifact.tags],
    relatedProviders: artifact.providerLineage,
    createdBy,
  });
  return createArtifact(workspaceId, projectId, payload);
}

/** Persist a batch. Returns the IDs of successfully written artifacts; any
 *  failures are swallowed per-item so a single bad doc doesn't sink the run. */
export async function persistQuantArtifacts(
  workspaceId: string,
  projectId: string,
  artifacts: QuantArtifact[],
  createdBy: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const a of artifacts) {
    try {
      ids.push(await persistQuantArtifact(workspaceId, projectId, a, createdBy));
    } catch (e) {
      console.error('persistQuantArtifact failed for', a.id, e);
    }
  }
  return ids;
}

export { KIND_TO_CATEGORY as quantArtifactCategoryMap, KIND_TO_TYPE as quantArtifactTypeMap };
