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
