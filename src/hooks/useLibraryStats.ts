import { useMemo } from 'react';
import type { IntelligenceArtifact, ArtifactType } from '../types';

const TYPE_COLORS: Record<string, string> = {
  briefing:           'var(--chart-3)',
  quant_lab_analysis: 'var(--chart-2)',
  copilot_insight:    'var(--chart-4)',
  instrument_snapshot:'var(--chart-1)',
  macro_shift:        '#4e6eaf',
  market_note:        '#9e7e3a',
  volatility_anomaly: '#8b5cf6',
  correlation_breakdown: '#06b6d4',
  sentiment_cluster:  '#f59e0b',
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? 'var(--muted-foreground)';
}

export interface ActivityBar {
  date: string;
  [key: string]: number | string;
}

export interface LibraryStats {
  total: number;
  thisWeek: number;
  topSymbol: string | null;
  avgConfidence: number | null;
  activityBars: ActivityBar[];
  symbolCoverage: { symbol: string; count: number }[];
  typeBreakdown: { name: string; value: number; color: string }[];
  qualityTrend: { date: string; confidence: number | null; completeness: number | null }[];
  activeTypes: string[];
}

function toMs(ts: number | { toMillis: () => number }): number {
  if (typeof ts === 'number') return ts;
  return ts.toMillis();
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function useLibraryStats(artifacts: IntelligenceArtifact[]): LibraryStats {
  return useMemo(() => {
    if (!artifacts.length) {
      return {
        total: 0, thisWeek: 0, topSymbol: null, avgConfidence: null,
        activityBars: [], symbolCoverage: [], typeBreakdown: [], qualityTrend: [],
        activeTypes: [],
      };
    }

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // ── KPI stats ────────────────────────────────────────────────
    const total = artifacts.length;
    const thisWeek = artifacts.filter(a => toMs(a.createdAt as any) > weekAgo).length;

    const symbolCount = new Map<string, number>();
    for (const a of artifacts) {
      for (const s of a.symbols ?? []) symbolCount.set(s, (symbolCount.get(s) ?? 0) + 1);
    }
    const topSymbol = symbolCount.size
      ? [...symbolCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    const scores = artifacts
      .map(a => a.confidenceScore ?? a.confidence)
      .filter((v): v is number => v != null && !isNaN(v));
    const avgConfidence = scores.length
      ? scores.reduce((s, v) => s + v, 0) / scores.length
      : null;

    // ── Activity bars (last 30 days) ─────────────────────────────
    const days = 30;
    const dayMs = 24 * 60 * 60 * 1000;
    const dayMap = new Map<string, Record<string, number>>();
    for (let i = days - 1; i >= 0; i--) {
      const d = shortDate(now - i * dayMs);
      dayMap.set(d, {});
    }
    for (const a of artifacts) {
      const ms = toMs(a.createdAt as any);
      if (now - ms > days * dayMs) continue;
      const d = shortDate(ms);
      const type = a.artifactType ?? 'unknown';
      if (dayMap.has(d)) {
        const entry = dayMap.get(d)!;
        entry[type] = (entry[type] ?? 0) + 1;
      }
    }
    const activityBars: ActivityBar[] = [...dayMap.entries()].map(([date, counts]) => ({ date, ...counts }));

    // ── Symbol coverage (top 8) ──────────────────────────────────
    const symbolCoverage = [...symbolCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([symbol, count]) => ({ symbol, count }));

    // ── Type breakdown ───────────────────────────────────────────
    const typeCount = new Map<string, number>();
    for (const a of artifacts) {
      const t = a.artifactType ?? 'unknown';
      typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
    }
    const typeBreakdown = [...typeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value, color: typeColor(name) }));

    const activeTypes = [...new Set(artifacts.map(a => a.artifactType ?? 'unknown'))];

    // ── Quality trend (last 20 artifacts by date) ────────────────
    const sorted = [...artifacts].sort((a, b) => toMs(b.createdAt as any) - toMs(a.createdAt as any));
    const qualityTrend = sorted.slice(0, 20).reverse().map(a => ({
      date: shortDate(toMs(a.createdAt as any)),
      confidence: a.confidenceScore ?? a.confidence ?? null,
      completeness: a.completenessScore ?? null,
    }));

    return {
      total, thisWeek, topSymbol, avgConfidence,
      activityBars, symbolCoverage, typeBreakdown, qualityTrend, activeTypes,
    };
  }, [artifacts]);
}
