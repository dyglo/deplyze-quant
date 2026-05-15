import { gatewayGet, ClientTTL } from './gatewayClient';
import type { OHLCVBar, Quote, Timeframe } from '../types';

export async function fetchQuote(symbol: string): Promise<Quote> {
  return gatewayGet<Quote>(`/market/quote/${encodeURIComponent(symbol)}`, undefined, ClientTTL.quote);
}

export interface BatchQuoteRow {
  symbol: string;
  ok: boolean;
  data?: Quote;
  error?: string;
}
export async function fetchQuotes(symbols: string[]): Promise<BatchQuoteRow[]> {
  const r = await gatewayGet<{ quotes: BatchQuoteRow[] }>(
    '/market/quotes',
    { symbols: symbols.join(',') },
    ClientTTL.quote,
  );
  return r.quotes;
}

export async function fetchOHLCV(
  symbol: string,
  interval: Timeframe = '1day',
  outputsize = 200,
): Promise<{ symbol: string; interval: Timeframe; bars: OHLCVBar[] }> {
  const ttl = interval === '1day' || interval === '1week' || interval === '1month'
    ? ClientTTL.ohlcv_daily : ClientTTL.ohlcv_intraday;
  return gatewayGet(`/market/ohlcv/${encodeURIComponent(symbol)}`, { interval, outputsize }, ttl);
}

export interface GatewayNewsItem {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: number;
  image?: string;
  symbols?: string[];
}
export async function fetchNews(opts: {
  symbol?: string;
  category?: 'general' | 'forex' | 'crypto' | 'merger';
  limit?: number;
} = {}): Promise<GatewayNewsItem[]> {
  const r = await gatewayGet<{ items: GatewayNewsItem[] }>('/market/news', opts, ClientTTL.news);
  return r.items;
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  country: string;
  currency?: string;
}
export async function symbolSearch(q: string): Promise<SymbolMatch[]> {
  const r = await gatewayGet<{ matches: SymbolMatch[] }>('/market/search', { q }, ClientTTL.search);
  return r.matches;
}

export async function fetchHeadlines(q = 'global markets'): Promise<Array<{
  title: string; link: string; snippet: string; source: string; date?: string;
}>> {
  const r = await gatewayGet<{ items: Array<{ title: string; link: string; snippet: string; source: string; date?: string }> }>(
    '/market/headlines', { q }, ClientTTL.headlines,
  );
  return r.items;
}

export interface MarketMoverItem {
  ticker?: string;
  symbol?: string;
  name?: string;
  price: number;
  change: number;
  changesPercentage?: number;
  changePercent?: number;
  companyName?: string;
}

export type MoverType = 'gainers' | 'losers' | 'active';

export async function fetchMarketMovers(type: MoverType = 'gainers'): Promise<MarketMoverItem[]> {
  const r = await gatewayGet<{ type: string; movers: MarketMoverItem[] }>(
    '/market/movers', { type }, ClientTTL.quote * 5,
  );
  return r.movers ?? [];
}
