/**
 * Finnhub adapter — equities quotes, fundamentals, market news.
 * Free tier: 60 req/min.
 * Docs: https://finnhub.io/docs/api
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://finnhub.io/api/v1';

function key() {
  return requireEnv('FINNHUB_API_KEY');
}

export interface FinnhubQuote {
  c: number;  // current
  d: number;  // change
  dp: number; // percent
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // previous close
  t: number;  // unix seconds
}

export async function getQuote(symbol: string): Promise<FinnhubQuote> {
  const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${key()}`;
  return getJson<FinnhubQuote>('finnhub', url);
}

export interface FinnhubNewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image?: string;
  datetime: number; // unix seconds
  category?: string;
  related?: string;
}

export async function getCompanyNews(
  symbol: string,
  fromISO: string,
  toISO: string,
): Promise<FinnhubNewsItem[]> {
  const url = `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromISO}&to=${toISO}&token=${key()}`;
  return getJson<FinnhubNewsItem[]>('finnhub', url);
}

export async function getMarketNews(category = 'general'): Promise<FinnhubNewsItem[]> {
  const url = `${BASE}/news?category=${encodeURIComponent(category)}&token=${key()}`;
  return getJson<FinnhubNewsItem[]>('finnhub', url);
}

export interface FinnhubCompanyProfile {
  country?: string;
  currency?: string;
  exchange?: string;
  ipo?: string;
  marketCapitalization?: number;
  name?: string;
  phone?: string;
  shareOutstanding?: number;
  ticker?: string;
  weburl?: string;
  logo?: string;
  finnhubIndustry?: string;
}

export async function getCompanyProfile(symbol: string): Promise<FinnhubCompanyProfile> {
  const url = `${BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key()}`;
  return getJson<FinnhubCompanyProfile>('finnhub', url);
}

export interface FinnhubBasicFinancials {
  metric?: Record<string, number | string>;
  series?: Record<string, unknown>;
}

export async function getBasicFinancials(symbol: string): Promise<FinnhubBasicFinancials> {
  const url = `${BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key()}`;
  return getJson<FinnhubBasicFinancials>('finnhub', url);
}
