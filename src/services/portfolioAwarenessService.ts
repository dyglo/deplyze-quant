/**
 * portfolioAwarenessService — typed client for the V5 P3 backend
 * Portfolio Awareness Synthesis routes mounted under
 * `/v1/portfolio-awareness/*`.
 *
 *   POST /portfolio-awareness/:pid/snapshot  → write a snapshot
 *   GET  /portfolio-awareness/:pid/latest    → read most recent snapshot
 *
 * Failure-soft: 404 (no snapshot yet) and 503 (engine not configured)
 * return null instead of throwing, so the UI can fall back to client
 * composition without a popup.
 */

import { GatewayError, gatewayGet, gatewayPost } from './gatewayClient';

export interface AwarenessKpis {
  totalReturn?: number;
  benchmarkTotalReturn?: number;
  annVol?: number;
  sharpe?: number;
  maxDrawdown?: number;
  [k: string]: unknown;
}

export interface AwarenessContributors {
  top?: Array<{ symbol: string; weight: number; contribution: number }>;
  bottom?: Array<{ symbol: string; weight: number; contribution: number }>;
  [k: string]: unknown;
}

export interface AwarenessSectorBreakdown {
  sectors?: Array<{
    sector: string;
    weight: number;
    sectorReturn?: number;
    contribution?: number;
    members?: number;
    vol?: number;
  }>;
  [k: string]: unknown;
}

export interface AwarenessRiskDecomposition {
  hhi?: number;
  stressedCount?: number;
  holdingStress?: Array<{
    symbol: string;
    weight: number;
    intensity: number;
    count: number;
    dimensions: string[];
  }>;
  sectorRisk?: Array<{
    sector: string;
    weight: number;
    contribPct: number;
  }>;
  [k: string]: unknown;
}

export interface AwarenessMonitorProbe {
  id: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  rationale: string;
  evidence: Array<{ label: string; value: string }>;
  symbols?: string[];
}

export interface AwarenessSnapshot {
  artifact_id: string;
  portfolio_id: string;
  snapshot_date: string;
  generated_at: string;
  benchmark_id: string | null;
  kpis: AwarenessKpis | null;
  contributors: AwarenessContributors | null;
  sector_breakdown: AwarenessSectorBreakdown | null;
  risk_decomposition: AwarenessRiskDecomposition | null;
  monitor_probes: AwarenessMonitorProbe[] | null;
  narrative_lines: Record<string, string[]> | null;
  holding_symbols: string[];
  source_tables: string[];
  lineage_id: string;
}

export interface AwarenessSnapshotPayload {
  benchmark_id?: string;
  uid?: string;
  workspace_id?: string;
  kpis: AwarenessKpis;
  contributors: AwarenessContributors;
  sector_breakdown: AwarenessSectorBreakdown;
  risk_decomposition: AwarenessRiskDecomposition;
  monitor_probes: AwarenessMonitorProbe[];
  narrative_lines: Record<string, string[]>;
  holding_symbols: string[];
  source_tables?: string[];
  is_test?: boolean;
}

const SNAPSHOT_TTL_MS = 60_000;

export async function fetchLatestSnapshot(
  portfolioId: string,
  maxAgeDays = 7,
): Promise<AwarenessSnapshot | null> {
  try {
    return await gatewayGet<AwarenessSnapshot>(
      `/portfolio-awareness/${encodeURIComponent(portfolioId)}/latest`,
      { max_age_days: maxAgeDays },
      SNAPSHOT_TTL_MS,
    );
  } catch (err) {
    if (err instanceof GatewayError && (err.status === 404 || err.status === 503)) {
      return null;
    }
    throw err;
  }
}

export async function postSnapshot(
  portfolioId: string,
  payload: AwarenessSnapshotPayload,
): Promise<{
  ok: boolean;
  artifact_id: string;
  portfolio_id: string;
  snapshot_date: string;
  lineage_id: string;
  generated_at: string;
}> {
  return gatewayPost(
    `/portfolio-awareness/${encodeURIComponent(portfolioId)}/snapshot`,
    payload,
  );
}
