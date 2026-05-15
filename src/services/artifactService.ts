/**
 * artifactService — Firestore reads and writes for agent-generated intelligence artifacts
 * and institutional briefings. Supports both client-side writes and server-side writes
 * (gateway / agents via Admin SDK).
 *
 * In Phase 1 these collections are empty until the agentic layer (Phase 5)
 * starts producing artifacts. UI components handle the empty-state path.
 */

import {
  collection, query, orderBy, limit, onSnapshot, Unsubscribe,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs, getDoc, where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { IntelligenceArtifact, Briefing, LabSession, CopilotInsight, Quote } from '../types';

function normalizeTimestamps(obj: Record<string, unknown>): Record<string, unknown> {
  // Firestore Timestamps → unix ms so the UI can treat them uniformly.
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
      obj[k] = (v as { toMillis: () => number }).toMillis();
    }
  }
  return obj;
}

function map<T>(docs: { id: string; data: () => Record<string, unknown> }[]): T[] {
  return docs.map((d) => ({ id: d.id, ...normalizeTimestamps(d.data()) }) as T);
}

export function subscribeToArtifacts(
  workspaceId: string,
  projectId: string,
  callback: (items: IntelligenceArtifact[]) => void,
  max = 50,
): Unsubscribe {
  const q = query(
    collection(db, 'workspaces', workspaceId, 'projects', projectId, 'artifacts'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (snap) =>
    callback(map<IntelligenceArtifact>(snap.docs as { id: string; data: () => Record<string, unknown> }[])),
  );
}

export function subscribeToBriefings(
  workspaceId: string,
  projectId: string,
  callback: (items: Briefing[]) => void,
  max = 30,
): Unsubscribe {
  const q = query(
    collection(db, 'workspaces', workspaceId, 'projects', projectId, 'briefings'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (snap) =>
    callback(map<Briefing>(snap.docs as { id: string; data: () => Record<string, unknown> }[])),
  );
}

export async function getArtifact(
  workspaceId: string,
  projectId: string,
  artifactId: string,
): Promise<IntelligenceArtifact | null> {
  const snap = await getDoc(
    doc(db, 'workspaces', workspaceId, 'projects', projectId, 'artifacts', artifactId),
  );
  if (!snap.exists()) return null;
  return { id: snap.id, ...normalizeTimestamps(snap.data() as Record<string, unknown>) } as IntelligenceArtifact;
}

// ─── Write operations ────────────────────────────────────────────────────────

export async function createArtifact(
  workspaceId: string,
  projectId: string,
  payload: Omit<IntelligenceArtifact, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(
    collection(db, 'workspaces', workspaceId, 'projects', projectId, 'artifacts'),
    { ...payload, source: 'user', createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
  );
  return ref.id;
}

export async function updateArtifact(
  workspaceId: string,
  projectId: string,
  artifactId: string,
  updates: Partial<Omit<IntelligenceArtifact, 'id' | 'workspaceId' | 'projectId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(
    doc(db, 'workspaces', workspaceId, 'projects', projectId, 'artifacts', artifactId),
    { ...updates, updatedAt: serverTimestamp() },
  );
}

export async function deleteArtifact(
  workspaceId: string,
  projectId: string,
  artifactId: string,
): Promise<void> {
  await deleteDoc(
    doc(db, 'workspaces', workspaceId, 'projects', projectId, 'artifacts', artifactId),
  );
}

export function saveArtifact(workspaceId: string, projectId: string, artifactId: string): Promise<void> {
  return updateArtifact(workspaceId, projectId, artifactId, { saved: true } as Partial<IntelligenceArtifact>);
}

export function unsaveArtifact(workspaceId: string, projectId: string, artifactId: string): Promise<void> {
  return updateArtifact(workspaceId, projectId, artifactId, { saved: false } as Partial<IntelligenceArtifact>);
}

// ─── Related intelligence query ──────────────────────────────────────────────

export async function listRelatedArtifacts(
  workspaceId: string,
  projectId: string,
  symbols: string[],
  excludeId: string,
  max = 3,
): Promise<IntelligenceArtifact[]> {
  if (!symbols.length) return [];
  const q = query(
    collection(db, 'workspaces', workspaceId, 'projects', projectId, 'artifacts'),
    where('symbols', 'array-contains-any', symbols.slice(0, 10)),
    orderBy('createdAt', 'desc'),
    limit(max + 1),
  );
  const snap = await getDocs(q);
  return map<IntelligenceArtifact>(snap.docs as { id: string; data: () => Record<string, unknown> }[])
    .filter(a => a.id !== excludeId)
    .slice(0, max);
}

// ─── Factory functions ───────────────────────────────────────────────────────

interface InstrumentAnalytics {
  vol: number;
  ret60: number;
  mdd: number;
}

export function createArtifactFromBriefing(
  workspaceId: string,
  projectId: string,
  briefing: Briefing,
  uid: string,
): Promise<string> {
  return createArtifact(workspaceId, projectId, {
    workspaceId,
    projectId,
    artifactType: 'briefing',
    category: 'macro',
    title: briefing.title,
    summary: briefing.summary,
    body: briefing.body,
    narrative: briefing.summary,
    symbols: briefing.symbols,
    tags: [briefing.kind],
    confidence: briefing.sourceCoverage ? Math.min(briefing.sourceCoverage / 5, 1) : 0.5,
    confidenceScore: briefing.sourceCoverage ? Math.min(briefing.sourceCoverage / 5, 1) : 0.5,
    completenessScore: briefing.dataCompleteness ?? 0.5,
    significance: 0.5,
    evidence: [],
    createdBy: uid,
  });
}

export function createArtifactFromQuantLab(
  workspaceId: string,
  projectId: string,
  session: LabSession,
  uid: string,
): Promise<string> {
  const summaryLines = Object.entries(session.summary)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');
  const body = `## Quant Lab Session: ${session.name}\n\n**Panel:** ${session.panel} · **Symbols:** ${session.symbols.join(', ')} · **Timeframe:** ${session.timeframe}\n\n| Metric | Value |\n|--------|-------|\n${summaryLines}`;
  return createArtifact(workspaceId, projectId, {
    workspaceId,
    projectId,
    artifactType: 'quant_lab_analysis',
    category: 'risk',
    title: session.name,
    narrative: Object.entries(session.summary).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · '),
    body,
    symbols: session.symbols,
    tags: [session.panel],
    confidence: 0.9,
    confidenceScore: 0.9,
    completenessScore: 1,
    significance: 0.6,
    evidence: Object.entries(session.summary).map(([k, v]) => ({ label: k, value: v, source: 'derived' as const })),
    createdBy: uid,
  });
}

export function createArtifactFromCopilot(
  workspaceId: string,
  projectId: string,
  insight: CopilotInsight,
  uid: string,
): Promise<string> {
  const truncatedTitle = insight.content.length > 80
    ? insight.content.slice(0, 80) + '…'
    : insight.content;
  return createArtifact(workspaceId, projectId, {
    workspaceId,
    projectId,
    artifactType: 'copilot_insight',
    category: 'sentiment',
    title: truncatedTitle,
    narrative: insight.content.slice(0, 200),
    body: insight.content,
    symbols: insight.symbols ?? [],
    tags: ['copilot'],
    confidence: 0.7,
    confidenceScore: 0.7,
    completenessScore: 0.7,
    significance: 0.5,
    evidence: [],
    createdBy: uid,
  });
}

export function createInstrumentSnapshot(
  workspaceId: string,
  projectId: string,
  symbol: string,
  quote: Quote,
  analytics: InstrumentAnalytics,
  narrative: string,
  uid: string,
): Promise<string> {
  return createArtifact(workspaceId, projectId, {
    workspaceId,
    projectId,
    artifactType: 'instrument_snapshot',
    category: 'volatility',
    title: `${symbol} Snapshot`,
    narrative: narrative.slice(0, 300) || `${symbol} instrument snapshot`,
    body: narrative,
    symbols: [symbol],
    tags: ['snapshot'],
    confidence: 0.85,
    confidenceScore: 0.85,
    completenessScore: 0.9,
    significance: 0.6,
    evidence: [
      { label: 'Price', value: quote.price, source: 'derived' as const },
      { label: 'Change %', value: quote.changePercent.toFixed(2), source: 'derived' as const },
      { label: 'Ann. Volatility', value: `${analytics.vol.toFixed(1)}%`, source: 'derived' as const },
      { label: '60d Return', value: `${analytics.ret60.toFixed(1)}%`, source: 'derived' as const },
      { label: 'Max Drawdown', value: `${analytics.mdd.toFixed(1)}%`, source: 'derived' as const },
    ],
    createdBy: uid,
  });
}

export function createMacroShiftArtifact(
  workspaceId: string,
  projectId: string,
  activeSeries: string[],
  narrative: string,
  uid: string,
): Promise<string> {
  return createArtifact(workspaceId, projectId, {
    workspaceId,
    projectId,
    artifactType: 'macro_shift',
    category: 'macro',
    title: 'Macro Context Snapshot',
    narrative: narrative.slice(0, 300) || 'Macro context snapshot',
    body: narrative,
    symbols: [],
    relatedMacroIndicators: activeSeries,
    tags: ['macro'],
    confidence: 0.7,
    confidenceScore: 0.7,
    significance: 0.7,
    evidence: activeSeries.map(s => ({ label: s, value: 'active', source: 'derived' as const })),
    createdBy: uid,
  });
}
