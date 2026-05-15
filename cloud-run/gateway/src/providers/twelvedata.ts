/**
 * Twelve Data adapter — OHLCV (equities, FX, indices, commodities), real-time
 * quotes, technical indicators.
 * Free tier: 800 req/day, 8/min.
 * Docs: https://twelvedata.com/docs
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://api.twelvedata.com';
function key() { return requireEnv('TWELVE_DATA_API_KEY'); }

// ─── Concurrency limiter ────────────────────────────────────────────────────
// Twelve Data free tier: 8 req/min. Cap outbound calls at 4 concurrent so a
// burst of 10 simultaneous panel requests never trips the rate limit.
let _active = 0;
const _queue: Array<() => void> = [];
const _MAX_CONCURRENT = 4;

function _acquire(): Promise<void> {
  if (_active < _MAX_CONCURRENT) { _active++; return Promise.resolve(); }
  return new Promise(resolve => _queue.push(resolve));
}

function _release(): void {
  _active--;
  const next = _queue.shift();
  if (next) { _active++; next(); }
}

async function _throttle<T>(fn: () => Promise<T>): Promise<T> {
  await _acquire();
  try { return await fn(); } finally { _release(); }
}

export type TdInterval =
  | '1min' | '5min' | '15min' | '30min' | '45min'
  | '1h' | '2h' | '4h' | '1day' | '1week' | '1month';

interface TdTimeSeriesResp {
  meta?: { symbol: string; interval: string; currency?: string; exchange?: string };
  values?: Array<{
    datetime: string;
    open: string; high: string; low: string; close: string; volume?: string;
  }>;
  status?: string;
  message?: string;
  code?: number;
}

export interface OHLCVBar {
  ts: number; open: number; high: number; low: number; close: number; volume: number;
}

export async function getTimeSeries(
  symbol: string,
  interval: TdInterval,
  outputsize = 200,
): Promise<OHLCVBar[]> {
  return _throttle(async () => {
    const params = new URLSearchParams({
      symbol, interval, outputsize: String(outputsize),
      apikey: key(), format: 'JSON', order: 'ASC',
    });
    const resp = await getJson<TdTimeSeriesResp>('twelve_data', `${BASE}/time_series?${params}`);
    if (resp.status === 'error') throw new Error(`Twelve Data: ${resp.message ?? 'error'}`);
    return (resp.values ?? []).map((v) => ({
      ts: Date.parse(v.datetime.length === 10 ? `${v.datetime}T00:00:00Z` : v.datetime + 'Z'),
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: Number(v.volume ?? 0),
    })).filter((b) => Number.isFinite(b.ts));
  });
}

interface TdQuoteResp {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  datetime?: string;
  timestamp?: number;
  open?: string; high?: string; low?: string; close?: string; volume?: string;
  previous_close?: string; change?: string; percent_change?: string;
  is_market_open?: boolean;
  status?: string; message?: string;
}

export interface TdQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  ts: number;
  isMarketOpen: boolean;
}

export async function getQuote(symbol: string): Promise<TdQuote> {
  return _throttle(async () => {
    const params = new URLSearchParams({ symbol, apikey: key() });
    const r = await getJson<TdQuoteResp>('twelve_data', `${BASE}/quote?${params}`);
    if (r.status === 'error') throw new Error(`Twelve Data: ${r.message ?? 'error'}`);
    return {
      symbol: r.symbol ?? symbol,
      price: Number(r.close),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      previousClose: Number(r.previous_close),
      change: Number(r.change),
      changePercent: Number(r.percent_change),
      ts: (r.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
      isMarketOpen: Boolean(r.is_market_open),
    };
  });
}

interface TdSymbolSearchResp {
  data?: Array<{ symbol: string; instrument_name: string; exchange: string; instrument_type: string; country: string; currency?: string }>;
}

export interface TdSymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  country: string;
  currency?: string;
}

export async function symbolSearch(query: string): Promise<TdSymbolMatch[]> {
  return _throttle(async () => {
    const params = new URLSearchParams({ symbol: query, apikey: key() });
    const r = await getJson<TdSymbolSearchResp>('twelve_data', `${BASE}/symbol_search?${params}`);
    return (r.data ?? []).map((d) => ({
      symbol: d.symbol,
      name: d.instrument_name,
      exchange: d.exchange,
      type: d.instrument_type,
      country: d.country,
      currency: d.currency,
    }));
  });
}
