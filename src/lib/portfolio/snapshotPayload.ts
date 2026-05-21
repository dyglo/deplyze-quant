/**
 * snapshotPayload — assembles the frontend's current awareness state into
 * the wire-format consumed by POST /v1/portfolio-awareness/:pid/snapshot.
 *
 * Everything here is already computed by the page; this module just
 * marshals it. Keeping the assembly here (and not inside the page
 * component) makes the contract testable and stable.
 */

import type { PositionMetrics } from './holdingAnalytics';
import type { ContributionRow } from './awarenessAttribution';
import type { ClientStressDimensionSummary } from './clientStress';
import type {
  AwarenessSnapshotPayload,
  AwarenessMonitorProbe,
} from '../../services/portfolioAwarenessService';

type MonitorProbe = AwarenessMonitorProbe;

export interface BuildSnapshotInput {
  benchmarkId?: string;
  uid?: string;
  workspaceId?: string;

  // KPIs already produced by usePortfolioPerformance
  totalReturn: number;
  benchmarkTotalReturn?: number;
  annVol?: number;
  sharpe?: number;
  maxDrawdown?: number;

  positions: PositionMetrics[];
  contributorsTop: ContributionRow[];
  contributorsBottom: ContributionRow[];
  sectorRows: Array<{
    sector: string;
    weight: number;
    sectorReturn?: number;
    contribution?: number;
    members?: number;
    vol?: number;
  }>;

  // Risk
  hhi: number;
  stressedCount: number;
  holdingStress: Array<{
    symbol: string;
    weight: number;
    intensity: number;
    count: number;
    dimensions: string[];
  }>;
  sectorRisk: Array<{ sector: string; weight: number; contribPct: number }>;
  clientStressDimensions: ClientStressDimensionSummary[];

  // Monitor
  monitorProbes: MonitorProbe[];

  // Per-section narrative text
  narrativeLines: Record<string, string[]>;

  isTest?: boolean;
}

function trimContrib(rows: ContributionRow[], n: number) {
  return rows.slice(0, n).map(r => ({
    symbol: r.key,
    weight: r.weight,
    contribution: r.contribution,
  }));
}

export function buildSnapshotPayload(input: BuildSnapshotInput): AwarenessSnapshotPayload {
  const holdingSymbols = Array.from(new Set(input.positions.map(p => p.symbol)));
  return {
    benchmark_id: input.benchmarkId,
    uid: input.uid,
    workspace_id: input.workspaceId,

    kpis: {
      totalReturn: input.totalReturn,
      benchmarkTotalReturn: input.benchmarkTotalReturn,
      activeReturn:
        input.benchmarkTotalReturn != null
          ? input.totalReturn - input.benchmarkTotalReturn
          : undefined,
      annVol: input.annVol,
      sharpe: input.sharpe,
      maxDrawdown: input.maxDrawdown,
      holdings: input.positions.length,
    },

    contributors: {
      top: trimContrib(input.contributorsTop, 8),
      bottom: trimContrib(input.contributorsBottom, 6),
    },

    sector_breakdown: {
      sectors: input.sectorRows.slice(0, 12).map(r => ({
        sector: r.sector,
        weight: r.weight,
        sectorReturn: r.sectorReturn,
        contribution: r.contribution,
        members: r.members,
        vol: r.vol,
      })),
    },

    risk_decomposition: {
      hhi: input.hhi,
      stressedCount: input.stressedCount,
      holdingStress: input.holdingStress.slice(0, 12),
      sectorRisk: input.sectorRisk.slice(0, 10),
      stressDimensions: input.clientStressDimensions.map(d => ({
        key: d.key,
        label: d.label,
        description: d.description,
        flagged: d.flaggedSymbols.length,
        meanSeverity: d.meanSeverity,
      })),
    },

    monitor_probes: input.monitorProbes.map(p => ({
      id: p.id,
      category: p.category,
      severity: p.severity,
      title: p.title,
      rationale: p.rationale,
      evidence: p.evidence,
      symbols: p.symbols,
    })),

    narrative_lines: input.narrativeLines,

    holding_symbols: holdingSymbols,
    source_tables: [
      'marketdata.ohlcv',
      'firestore.portfolios',
      'firestore.holdings',
    ],
    is_test: input.isTest,
  };
}
