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

// ─── FX / Crypto quote helpers ──────────────────────────────────────────────

// Maps our internal XX/YY format to Finnhub's OANDA format for FX pairs.
const FX_TO_OANDA: Record<string, string> = {
  'EUR/USD': 'OANDA:EUR_USD', 'GBP/USD': 'OANDA:GBP_USD',
  'USD/JPY': 'OANDA:USD_JPY', 'AUD/USD': 'OANDA:AUD_USD',
  'USD/CAD': 'OANDA:USD_CAD', 'USD/CHF': 'OANDA:USD_CHF',
  'NZD/USD': 'OANDA:NZD_USD', 'EUR/GBP': 'OANDA:EUR_GBP',
  'EUR/JPY': 'OANDA:EUR_JPY', 'GBP/JPY': 'OANDA:GBP_JPY',
  'XAU/USD': 'OANDA:XAU_USD', 'XAG/USD': 'OANDA:XAG_USD',
};

// Maps our internal XX/YY crypto format to Binance quote symbols on Finnhub.
const CRYPTO_TO_BINANCE: Record<string, string> = {
  'BTC/USD': 'BINANCE:BTCUSDT', 'ETH/USD': 'BINANCE:ETHUSDT',
  'SOL/USD': 'BINANCE:SOLUSDT', 'BNB/USD': 'BINANCE:BNBUSDT',
  'XRP/USD': 'BINANCE:XRPUSDT', 'ADA/USD': 'BINANCE:ADAUSDT',
  'DOGE/USD': 'BINANCE:DOGEUSDT', 'AVAX/USD': 'BINANCE:AVAXUSDT',
  'MATIC/USD': 'BINANCE:MATICUSDT',
};

/**
 * Returns a Finnhub-compatible symbol for FX or crypto pairs, or null if
 * the pair is not supported (e.g. commodities like WTI/USD).
 */
export function toFinnhubCrossAssetSymbol(symbol: string): string | null {
  return FX_TO_OANDA[symbol] ?? CRYPTO_TO_BINANCE[symbol] ?? null;
}

export async function getCrossAssetQuote(symbol: string): Promise<FinnhubQuote> {
  const fhSym = toFinnhubCrossAssetSymbol(symbol);
  if (!fhSym) throw new Error(`Finnhub: no mapping for cross-asset symbol ${symbol}`);
  const url = `${BASE}/quote?symbol=${encodeURIComponent(fhSym)}&token=${key()}`;
  const q = await getJson<FinnhubQuote>('finnhub', url);
  // Finnhub returns all-zeros for invalid symbols — treat as no data
  if (q.c === 0 && q.pc === 0) throw new Error(`Finnhub: no data for ${fhSym}`);
  return q;
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

// ─── Earnings calendar ──────────────────────────────────────────────────────
// Fallback for /v1/earnings/calendar when FMP is unavailable / quota-limited.
// Docs: https://finnhub.io/docs/api/earnings-calendar

export interface FinnhubEarningsCalendarItem {
  date: string;
  symbol: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  hour?: string;          // "bmo" | "amc" | "dmh"
  quarter?: number;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
  year?: number;
}

export async function getEarningsCalendar(from: string, to: string): Promise<FinnhubEarningsCalendarItem[]> {
  const url = `${BASE}/calendar/earnings?from=${from}&to=${to}&token=${key()}`;
  const r = await getJson<{ earningsCalendar?: FinnhubEarningsCalendarItem[] }>('finnhub', url);
  return Array.isArray(r.earningsCalendar) ? r.earningsCalendar : [];
}
