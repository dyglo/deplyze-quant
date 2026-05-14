import { fetchQuote, fetchQuotes, fetchOHLCV, fetchNews, fetchHeadlines, symbolSearch } from '../services/marketService';
import { useSWR } from './useSWR';
import type { Timeframe } from '../types';

export function useQuote(symbol: string | null) {
  return useSWR(
    () => (symbol ? fetchQuote(symbol) : Promise.resolve(null)),
    [symbol],
    { cacheKey: symbol ? `GET /market/quote/${encodeURIComponent(symbol)}` : undefined },
  );
}

export function useBatchQuotes(symbols: string[]) {
  const key = symbols.join(',');
  return useSWR(
    () => (symbols.length ? fetchQuotes(symbols) : Promise.resolve([])),
    [key],
    { cacheKey: symbols.length ? `GET /market/quotes?symbols=${key}` : undefined },
  );
}

export function useOHLCV(symbol: string | null, interval: Timeframe = '1day', outputsize = 200) {
  return useSWR(
    () => (symbol ? fetchOHLCV(symbol, interval, outputsize) : Promise.resolve(null)),
    [symbol, interval, outputsize],
    {
      cacheKey: symbol
        ? `GET /market/ohlcv/${encodeURIComponent(symbol)}?interval=${interval}&outputsize=${outputsize}`
        : undefined,
    },
  );
}

export function useNews(opts: { symbol?: string; category?: 'general'|'forex'|'crypto'|'merger'; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.symbol) params.set('symbol', opts.symbol);
  if (opts.category) params.set('category', opts.category);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const key = JSON.stringify(opts);
  return useSWR(
    () => fetchNews(opts),
    [key],
    { cacheKey: `GET /market/news${qs ? `?${qs}` : ''}` },
  );
}

export function useHeadlines(q?: string) {
  const query = q ?? 'global markets';
  return useSWR(
    () => fetchHeadlines(query),
    [query],
    { cacheKey: `GET /market/headlines?q=${encodeURIComponent(query)}` },
  );
}

export function useSymbolSearch(q: string) {
  return useSWR(
    () => (q && q.length >= 1 ? symbolSearch(q) : Promise.resolve([])),
    [q],
    { cacheKey: q ? `GET /market/search?q=${encodeURIComponent(q)}` : undefined },
  );
}
