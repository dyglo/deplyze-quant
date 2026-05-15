/**
 * Polygon.io adapter — institutional-grade market data.
 * REST: quotes, aggregates, ticker details, news, financials.
 * Supports WebSocket preparation (auth token provisioning).
 *
 * Rate limits depend on tier; free Polygon starter has limited endpoints.
 * Docs: https://polygon.io/docs/
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://api.polygon.io';
function key() { return requireEnv('POLYGON_API_KEY'); }

// ─── Snapshot (real-time quote) ────────────────────────────────────────────

export interface PolygonDayAgg {
  o: number; h: number; l: number; c: number; v: number; vw: number;
}

export interface PolygonSnapshot {
  ticker: string;
  day: PolygonDayAgg;
  lastTrade?: { p: number; s: number; t: number };
  lastQuote?: { P: number; S: number; p: number; s: number; t: number };
  min?: PolygonDayAgg;
  prevDay: PolygonDayAgg;
  todaysChange: number;
  todaysChangePerc: number;
  updated: number; // nanoseconds
}

export async function getSnapshot(symbol: string): Promise<PolygonSnapshot> {
  const url = `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${key()}`;
  const r = await getJson<{ results: PolygonSnapshot; status: string }>('polygon', url);
  if (!r.results) throw new Error(`Polygon: no snapshot for ${symbol}`);
  return r.results;
}

// ─── Aggregates (OHLCV) ────────────────────────────────────────────────────

export interface PolygonAgg {
  t: number;   // open timestamp, unix ms
  o: number; h: number; l: number; c: number;
  v: number;   // volume
  vw: number;  // volume-weighted average price
  n?: number;  // number of transactions
}

export type PolygonTimespan = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export async function getAggs(params: {
  symbol: string;
  multiplier: number;
  timespan: PolygonTimespan;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  adjusted?: boolean;
  limit?: number;
}): Promise<PolygonAgg[]> {
  const { symbol, multiplier, timespan, from, to, adjusted = true, limit = 500 } = params;
  const qs = new URLSearchParams({
    adjusted: String(adjusted),
    sort: 'asc',
    limit: String(limit),
    apiKey: key(),
  });
  const url = `${BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${from}/${to}?${qs}`;
  const r = await getJson<{ results?: PolygonAgg[]; status: string; resultsCount?: number; count?: number }>('polygon', url);
  return r.results ?? [];
}

// ─── Ticker Details (reference) ────────────────────────────────────────────

export interface PolygonTickerDetails {
  ticker: string;
  name?: string;
  market?: string;
  locale?: string;
  primary_exchange?: string;
  type?: string;
  active?: boolean;
  currency_name?: string;
  cik?: string;
  composite_figi?: string;
  market_cap?: number;
  description?: string;
  sic_code?: string;
  sic_description?: string;
  total_employees?: number;
  list_date?: string;
  homepage_url?: string;
  phone_number?: string;
  address?: {
    address1?: string; city?: string; state?: string; postal_code?: string;
  };
  branding?: { logo_url?: string; icon_url?: string };
}

export async function getTickerDetails(symbol: string): Promise<PolygonTickerDetails> {
  const url = `${BASE}/v3/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${key()}`;
  const r = await getJson<{ results: PolygonTickerDetails; status: string }>('polygon', url);
  if (!r.results) throw new Error(`Polygon: no details for ${symbol}`);
  return r.results;
}

// ─── News ─────────────────────────────────────────────────────────────────

export interface PolygonNewsArticle {
  id: string;
  publisher: { name: string; homepage_url?: string; logo_url?: string };
  title: string;
  author?: string;
  published_utc: string;
  article_url: string;
  tickers?: string[];
  description?: string;
  keywords?: string[];
  image_url?: string;
}

export async function getNews(opts: {
  symbol?: string;
  limit?: number;
  publishedUtcGte?: string;
}): Promise<PolygonNewsArticle[]> {
  const qs = new URLSearchParams({ order: 'desc', sort: 'published_utc', apiKey: key() });
  if (opts.symbol) qs.set('ticker', opts.symbol);
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.publishedUtcGte) qs.set('published_utc.gte', opts.publishedUtcGte);
  const r = await getJson<{ results?: PolygonNewsArticle[]; status: string }>('polygon', `${BASE}/v2/reference/news?${qs}`);
  return r.results ?? [];
}

// ─── Previous Close ────────────────────────────────────────────────────────

export interface PolygonPrevClose {
  T: string;  // ticker
  o: number; h: number; l: number; c: number; v: number; vw: number; t: number;
}

export async function getPrevClose(symbol: string): Promise<PolygonPrevClose | null> {
  const url = `${BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?adjusted=true&apiKey=${key()}`;
  const r = await getJson<{ results?: PolygonPrevClose[]; status: string }>('polygon', url);
  return r.results?.[0] ?? null;
}

// ─── WebSocket token provisioning ─────────────────────────────────────────
// The frontend never receives the raw API key; instead the gateway issues
// a read-only connection reference. For Polygon this is simply the key itself
// (Polygon authenticates via the ACTION message post-connect), but the gateway
// can mediate this without leaking the key to the client by returning a
// scoped structure the frontend WebSocket layer understands.

export interface PolygonWsRef {
  endpoint: string;
  cluster: 'stocks' | 'crypto' | 'forex' | 'options';
  apiKey: string; // returned only server-to-server; never expose to browser
}

export function getWsRef(cluster: PolygonWsRef['cluster'] = 'stocks'): PolygonWsRef {
  return {
    endpoint: `wss://socket.polygon.io/${cluster}`,
    cluster,
    apiKey: key(),
  };
}
