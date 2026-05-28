import { gatewayGet } from './gatewayClient';
import type { OHLCVBar, Quote } from '../types';

export interface InstrumentProfile {
  name?: string;
  sector?: string;
  industry?: string;
  country?: string;
  exchange?: string;
  currency?: string;
  marketCap?: number;
  ceo?: string;
  employees?: number;
  description?: string;
  website?: string;
  logo?: string;
  ipoDate?: string;
  sharesOutstanding?: number;
  // legacy Finnhub names kept for backward-compat
  finnhubIndustry?: string;
  marketCapitalization?: number;
  weburl?: string;
}

export interface InstrumentFundamentals {
  peRatio?: number;
  pbRatio?: number;
  evToEbitda?: number;
  debtToEquity?: number;
  roe?: number;
  roic?: number;
  dividendYield?: number;
  eps?: number;
  revenueGrowthYoY?: number;
  earningsGrowthYoY?: number;
  operatingMargin?: number;
  netMargin?: number;
  beta?: number;
  week52High?: number;
  week52Low?: number;
  ma50?: number;
  ma200?: number;
  bookValuePerShare?: number;
}

export interface EarningsRecord {
  date: string;
  epsActual?: number;
  epsEstimate?: number;
  surprisePct?: number;
}

export interface InstrumentIntelligence {
  symbol: string;
  asOf: number;
  quote: Quote;
  profile: InstrumentProfile | null;
  fundamentals: InstrumentFundamentals | null;
  /** Legacy field kept for backward compat — prefer fundamentals */
  basicFinancials?: { metric?: Record<string, number | string> } | null;
  recentBars: OHLCVBar[];
  news: Array<{
    id: string;
    headline: string;
    summary?: string;
    url: string;
    source: string;
    publishedAt: number;
  }>;
  earnings: EarningsRecord[];
  narrative: string;
}

export async function fetchInstrumentIntelligence(symbol: string): Promise<InstrumentIntelligence> {
  return gatewayGet<InstrumentIntelligence>(
    `/instruments/${encodeURIComponent(symbol)}/intelligence`,
  );
}

export interface FinancialPeriod {
  date: string;
  period?: string;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  ebitda?: number;
}

export async function fetchFinancials(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
): Promise<{ series: FinancialPeriod[] }> {
  return gatewayGet<{ series: FinancialPeriod[] }>(
    `/fundamentals/${encodeURIComponent(symbol)}/financials?period=${period}`,
  );
}

export interface AnalystRatings {
  recommendations: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    date?: string;
  } | null;
  priceTargets: {
    high?: number;
    low?: number;
    avg?: number;
    count: number;
    recent: Array<{
      date: string;
      target: number;
      analyst: string;
      company: string;
      action?: string;
      rating?: string;
      previousRating?: string;
    }>;
  };
}

export async function fetchAnalystRatings(symbol: string): Promise<AnalystRatings> {
  return gatewayGet<AnalystRatings>(
    `/fundamentals/${encodeURIComponent(symbol)}/analyst`,
  );
}

export interface PeerQuote {
  symbol: string;
  name?: string;
  price: number;
  changePercent: number;
  marketCap?: number;
  pe?: number;
  volume?: number;
}

export async function fetchPeers(symbol: string): Promise<{ peers: PeerQuote[] }> {
  return gatewayGet<{ peers: PeerQuote[] }>(
    `/fundamentals/${encodeURIComponent(symbol)}/peers`,
  );
}

export interface OwnershipHolder {
  name: string;
  shares: number;
  dateReported: string;
  change: number;
  weightPercent?: number;
}

export interface OwnershipData {
  holders: OwnershipHolder[];
}

export async function fetchOwnership(symbol: string): Promise<OwnershipData> {
  return gatewayGet<OwnershipData>(
    `/fundamentals/${encodeURIComponent(symbol)}/ownership`,
  );
}
