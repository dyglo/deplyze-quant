/**
 * Institutional market data contracts.
 *
 * The frontend and intelligence systems NEVER depend on raw provider response
 * formats. All provider outputs are normalised through these contracts at the
 * gateway boundary. Frontend code imports from here, not from provider-specific
 * types.
 */

import type { ProviderId } from '../../../types';

// ─── Core data contracts ───────────────────────────────────────────────────

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume?: number;
  ts: number;             // unix ms
  isMarketOpen?: boolean;
  source: ProviderId;
}

export interface HistoricalCandle {
  ts: number;             // bar open time, unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface MarketSnapshot {
  symbol: string;
  asOf: number;
  quote: MarketQuote;
  candles: HistoricalCandle[];
  periodReturn?: number;  // % change over candle period
  annualisedVol?: number; // 20-day realised vol, annualised
  source: ProviderId;
}

// ─── Company intelligence contracts ───────────────────────────────────────

export interface CompanyProfileContract {
  symbol: string;
  name: string;
  sector?: string;
  industry?: string;
  country?: string;
  exchange?: string;
  currency?: string;
  marketCap?: number;
  beta?: number;
  cik?: string;
  isin?: string;
  ceo?: string;
  employees?: number;
  description?: string;
  website?: string;
  logo?: string;
  ipoDate?: string;
  isEtf?: boolean;
  source: ProviderId;
  fetchedAt: number;
}

export interface FundamentalSnapshot {
  symbol: string;
  date: string;
  period?: string;
  // Valuation
  peRatio?: number;
  pbRatio?: number;
  evToEbitda?: number;
  priceToSales?: number;
  // Profitability
  roe?: number;
  roic?: number;
  operatingMargin?: number;
  netMargin?: number;
  // Growth
  revenueGrowthYoY?: number;
  earningsGrowthYoY?: number;
  // Financial health
  debtToEquity?: number;
  currentRatio?: number;
  dividendYield?: number;
  // Raw financials
  revenue?: number;
  netIncome?: number;
  ebitda?: number;
  eps?: number;
  marketCap?: number;
  // Technical levels
  beta?: number;
  week52High?: number;
  week52Low?: number;
  ma50?: number;
  ma200?: number;
  source: ProviderId;
  fetchedAt: number;
}

// ─── Earnings contracts ────────────────────────────────────────────────────

export interface EarningsEvent {
  date: string;
  symbol: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  surpriseAbs?: number | null;
  surprisePct?: number | null;
  revenue?: number | null;
  revenueEstimate?: number | null;
  time?: string;                    // 'BMO' | 'AMC' | 'TNS'
  fiscalDateEnding?: string;
}

export interface EarningsCalendar {
  from: string;
  to: string;
  events: EarningsEvent[];
  source: ProviderId;
  fetchedAt: number;
  /** True when every provider failed and the gateway returned an empty,
   *  freshness-tagged payload instead of erroring. */
  degraded?: boolean;
}

// ─── News contracts ────────────────────────────────────────────────────────

export interface MarketNewsItem {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: number;    // unix ms
  image?: string;
  symbols?: string[];
  sentiment?: number;     // -1..1 (future: AI-scored)
  keywords?: string[];
}

// ─── Market structure contracts ────────────────────────────────────────────

export interface MarketMover {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface VolatilityState {
  symbol: string;
  asOf: number;
  realisedVol20d: number;     // annualised %
  realisedVol60d?: number;
  impliedVol?: number;        // from options market if available
  volRegime: 'compressed' | 'normal' | 'elevated' | 'stressed';
  volPercentile?: number;     // historical percentile 0-100
}

export interface CorrelationSnapshot {
  ts: number;
  windowDays: number;
  symbols: string[];
  matrix: number[][];         // [i][j] correlation between symbols[i] and symbols[j]
}

// ─── SEC EDGAR contracts ──────────────────────────────────────────────────

export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;               // '10-K' | '10-Q' | '8-K' | etc.
  description: string;
  viewUrl: string;
}

export interface EdgarFundamentalsSnapshot {
  symbol: string;
  cik: number;
  entityName: string;
  asOf: string;
  revenue?: number;
  netIncome?: number;
  eps?: number;
  ebitda?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  stockholdersEquity?: number;
  cashAndEquivalents?: number;
  operatingCashFlow?: number;
  capitalExpenditures?: number;
  freeCashFlow?: number;
  fiscalYear?: number;
  fiscalPeriod?: string;
}

// ─── Provider health contract ──────────────────────────────────────────────

export interface ProviderHealthStatus {
  id: string;
  configured: boolean;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailureMessage?: string;
  latencyMs?: number;
  consecutiveFailures?: number;
}

export interface ProviderHealthReport {
  providers: ProviderHealthStatus[];
  routing: Record<string, string[]>;
  asOf: number;
}

// ─── WebSocket streaming contracts ────────────────────────────────────────

export type WsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface LiveQuoteTick {
  symbol: string;
  price: number;
  size?: number;
  ts: number;                 // unix ms
  provider: 'polygon';
}

export interface LiveAggregateTick {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  ts: number;                 // bar start time, unix ms
  accumulated_volume?: number;
  provider: 'polygon';
}
