/**
 * earningsService — earnings surprises, calendar, and consensus estimates.
 * Normalised to frontend contracts.
 */

import { gatewayGet, ClientTTL } from './gatewayClient';
import type { EarningsEvent, EarningsCalendar } from '../lib/market-data/contracts';

// ─── Earnings surprises ────────────────────────────────────────────────────

export interface EarningsSurprisesResponse {
  symbol: string;
  surprises: EarningsEvent[];
  providerId: string;
}

export async function fetchEarningsSurprises(
  symbol: string,
  limit = 8,
): Promise<EarningsSurprisesResponse> {
  return gatewayGet<EarningsSurprisesResponse>(
    `/earnings/${encodeURIComponent(symbol)}/surprises`,
    { limit },
    ClientTTL.ohlcv_daily,
  );
}

// ─── Earnings calendar ─────────────────────────────────────────────────────

export async function fetchEarningsCalendar(
  from?: string,
  to?: string,
): Promise<EarningsCalendar> {
  const today = new Date();
  const defaultFrom = from ?? today.toISOString().slice(0, 10);
  const defaultTo = to ?? new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  const r = await gatewayGet<{
    from: string; to: string;
    events: EarningsEvent[];
    providerId: string;
  }>('/earnings/calendar', { from: defaultFrom, to: defaultTo }, ClientTTL.news);

  return {
    from: r.from,
    to: r.to,
    events: r.events,
    source: r.providerId as EarningsCalendar['source'],
    fetchedAt: Date.now(),
  };
}

// ─── Earnings quality analysis ────────────────────────────────────────────
// Derives institutional-quality signals from historical earnings beats/misses.

export interface EarningsQualityAnalysis {
  symbol: string;
  beatCount: number;
  missCount: number;
  beatRate: number;           // 0..1
  avgSurprisePct: number;     // average % surprise (positive = beats)
  consistencyScore: number;   // 0..1 — how consistent the beats are
  trend: 'improving' | 'stable' | 'deteriorating' | 'insufficient_data';
  lastFour: EarningsEvent[];
}

export function analyseEarningsQuality(events: EarningsEvent[]): EarningsQualityAnalysis | null {
  if (events.length < 2) return null;

  const withData = events.filter(
    (e) => e.epsActual != null && e.epsEstimate != null,
  );
  if (!withData.length) return null;

  const beats = withData.filter((e) => (e.epsActual ?? 0) >= (e.epsEstimate ?? 0));
  const beatRate = beats.length / withData.length;
  const avgSurprisePct =
    withData.reduce((sum, e) => sum + (e.surprisePct ?? 0), 0) / withData.length;

  // Consistency: std dev of surprise %
  const mean = avgSurprisePct;
  const variance =
    withData.reduce((sum, e) => sum + ((e.surprisePct ?? 0) - mean) ** 2, 0) / withData.length;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = Math.max(0, 1 - stdDev / 20); // normalise; 20% std dev = 0 consistency

  // Trend: compare last 2 vs prior events
  let trend: EarningsQualityAnalysis['trend'] = 'stable';
  if (withData.length >= 4) {
    const recentAvg = (withData.slice(0, 2).reduce((s, e) => s + (e.surprisePct ?? 0), 0)) / 2;
    const priorAvg  = (withData.slice(2, 4).reduce((s, e) => s + (e.surprisePct ?? 0), 0)) / 2;
    if (recentAvg > priorAvg + 3) trend = 'improving';
    else if (recentAvg < priorAvg - 3) trend = 'deteriorating';
  } else {
    trend = 'insufficient_data';
  }

  return {
    symbol: withData[0].symbol,
    beatCount: beats.length,
    missCount: withData.length - beats.length,
    beatRate,
    avgSurprisePct,
    consistencyScore,
    trend,
    lastFour: withData.slice(0, 4),
  };
}
