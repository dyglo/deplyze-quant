/**
 * fundamentalsService — company profiles, key metrics, and EDGAR fundamentals.
 * Normalised to frontend contracts; never exposes raw provider formats.
 */

import { gatewayGet, ClientTTL } from './gatewayClient';
import type { CompanyProfileContract, FundamentalSnapshot, EdgarFundamentalsSnapshot } from '../lib/market-data/contracts';

// ─── Company profile ───────────────────────────────────────────────────────

export async function fetchCompanyProfile(symbol: string): Promise<CompanyProfileContract> {
  return gatewayGet<CompanyProfileContract>(
    `/fundamentals/${encodeURIComponent(symbol)}/profile`,
    undefined,
    ClientTTL.ohlcv_daily,
  );
}

// ─── Key metrics ──────────────────────────────────────────────────────────

export interface MetricsResponse {
  series: FundamentalSnapshot[];
  providerId: string;
}

export async function fetchFundamentalMetrics(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
): Promise<MetricsResponse> {
  return gatewayGet<MetricsResponse>(
    `/fundamentals/${encodeURIComponent(symbol)}/metrics`,
    { period },
    ClientTTL.ohlcv_daily,
  );
}

// ─── EDGAR XBRL snapshot ──────────────────────────────────────────────────

export async function fetchEdgarSnapshot(symbol: string): Promise<EdgarFundamentalsSnapshot> {
  return gatewayGet<EdgarFundamentalsSnapshot>(
    `/fundamentals/${encodeURIComponent(symbol)}/edgar`,
    undefined,
    ClientTTL.ohlcv_daily,
  );
}

// ─── Composite intelligence bundle ────────────────────────────────────────

export interface CompanyIntelligenceBundle {
  profile: CompanyProfileContract | null;
  latestMetrics: FundamentalSnapshot | null;
  historicalMetrics: FundamentalSnapshot[];
  edgar: EdgarFundamentalsSnapshot | null;
  fetchedAt: number;
}

export async function fetchCompanyIntelligence(symbol: string): Promise<CompanyIntelligenceBundle> {
  const [profileResult, metricsResult, edgarResult] = await Promise.allSettled([
    fetchCompanyProfile(symbol),
    fetchFundamentalMetrics(symbol, 'annual'),
    fetchEdgarSnapshot(symbol),
  ]);

  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : null;
  const edgar = edgarResult.status === 'fulfilled' ? edgarResult.value : null;

  return {
    profile,
    latestMetrics: metrics?.series[0] ?? null,
    historicalMetrics: metrics?.series ?? [],
    edgar,
    fetchedAt: Date.now(),
  };
}
