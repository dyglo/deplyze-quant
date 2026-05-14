import { gatewayGet } from './gatewayClient';
import type { OHLCVBar, Quote } from '../types';

export interface InstrumentIntelligence {
  symbol: string;
  asOf: number;
  quote: Quote;
  profile: {
    name?: string;
    finnhubIndustry?: string;
    marketCapitalization?: number;
    exchange?: string;
    currency?: string;
    weburl?: string;
    logo?: string;
    country?: string;
  } | null;
  basicFinancials: { metric?: Record<string, number | string> } | null;
  recentBars: OHLCVBar[];
  news: Array<{
    id: string;
    headline: string;
    summary?: string;
    url: string;
    source: string;
    publishedAt: number;
  }>;
  narrative: string;
}

export async function fetchInstrumentIntelligence(symbol: string): Promise<InstrumentIntelligence> {
  return gatewayGet<InstrumentIntelligence>(
    `/instruments/${encodeURIComponent(symbol)}/intelligence`,
  );
}
