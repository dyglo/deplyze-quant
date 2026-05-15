/**
 * EOD Historical Data (EODHD) adapter — institutional-grade historical OHLCV,
 * fundamentals, and macro data across equities, FX, commodities, indices.
 * Docs: https://eodhd.com/financial-apis/
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://eodhd.com/api';
function key() { return requireEnv('EODHD_API_KEY'); }

// ─── Symbol normalisation ─────────────────────────────────────────────────
// EODHD uses {SYMBOL}.{EXCHANGE} format.

const FX_PAIRS = new Set([
  'EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD',
  'EURGBP','EURJPY','GBPJPY','USDMXN','USDSGD','USDHKD',
  'XAUUSD','XAGUSD', // gold and silver spot
]);
const CRYPTO_PREFIXES = ['BTC','ETH','SOL','ADA','XRP','LTC','BNB','DOGE','AVAX','MATIC'];
const INDEX_SYMBOLS = new Map([
  ['SPX','GSPC.INDX'],['SPY','SPY.US'],['QQQ','QQQ.US'],
  ['VIX','VIX.INDX'],['DJI','DJI.INDX'],['NDX','NDX.INDX'],
]);
// Commodity overrides that need a specific EODHD ticker
const COMMODITY_MAP = new Map([
  ['WTIUSD','WTICO.COMM'],['WTIOIL','WTICO.COMM'],['CRUDEOIL','WTICO.COMM'],
  ['NGAS','NG.COMM'],['COPPER','HG.COMM'],
]);

export function toEodhdTicker(symbol: string): string {
  if (symbol.includes('.')) return symbol;
  // Normalise slash-format pairs: EUR/USD → EURUSD, BTC/USD → BTCUSD
  const upper = symbol.toUpperCase().replace('/', '');
  const indexAlias = INDEX_SYMBOLS.get(upper);
  if (indexAlias) return indexAlias;
  const commodityAlias = COMMODITY_MAP.get(upper);
  if (commodityAlias) return commodityAlias;
  if (FX_PAIRS.has(upper)) return `${upper}.FOREX`;
  if (CRYPTO_PREFIXES.some((p) => upper.startsWith(p))) return `${upper}.CC`;
  return `${upper}.US`;
}

// ─── End-of-Day Bars ─────────────────────────────────────────────────────

export interface EodhdBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

export async function getHistoricalBars(
  symbol: string,
  opts: { from?: string; to?: string; period?: 'd' | 'w' | 'm' } = {},
): Promise<EodhdBar[]> {
  const { from, to, period = 'd' } = opts;
  const ticker = toEodhdTicker(symbol);
  let url = `${BASE}/eod/${encodeURIComponent(ticker)}?api_token=${key()}&fmt=json&period=${period}`;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;
  return getJson<EodhdBar[]>('eodhd', url);
}

// ─── Fundamentals ─────────────────────────────────────────────────────────

export interface EodhdFundamentalsGeneral {
  Code?: string;
  Name?: string;
  Exchange?: string;
  CurrencyCode?: string;
  CountryName?: string;
  ISIN?: string;
  Sector?: string;
  Industry?: string;
  Description?: string;
  FullTimeEmployees?: number;
  WebURL?: string;
  LogoURL?: string;
  IPODate?: string;
  GicSector?: string;
  GicIndustry?: string;
  CEO?: string;
  Type?: string;
}

export interface EodhdHighlights {
  MarketCapitalization?: number;
  MarketCapitalizationMln?: number;
  EBITDA?: number;
  PERatio?: number;
  PEGRatio?: number;
  WallStreetTargetPrice?: number;
  BookValue?: number;
  DividendShare?: number;
  DividendYield?: number;
  EarningsShare?: number;
  EPSEstimateCurrentYear?: number;
  EPSEstimateNextYear?: number;
  MostRecentQuarter?: string;
  ProfitMargin?: number;
  OperatingMarginTTM?: number;
  ReturnOnAssetsTTM?: number;
  ReturnOnEquityTTM?: number;
  RevenueTTM?: number;
  RevenuePerShareTTM?: number;
  QuarterlyRevenueGrowthYOY?: number;
  GrossProfitTTM?: number;
  DilutedEpsTTM?: number;
  QuarterlyEarningsGrowthYOY?: number;
}

export interface EodhdValuation {
  TrailingPE?: number;
  ForwardPE?: number;
  PriceSalesTTM?: number;
  PriceBookMRQ?: number;
  EnterpriseValue?: number;
  EnterpriseValueRevenue?: number;
  EnterpriseValueEbitda?: number;
}

export interface EodhdTechnicals {
  Beta?: number;
  '52WeekHigh'?: number;
  '52WeekLow'?: number;
  '50DayMA'?: number;
  '200DayMA'?: number;
  SharesShort?: number;
  ShortRatio?: number;
  ShortPercent?: number;
}

export interface EodhdFundamentals {
  General?: EodhdFundamentalsGeneral;
  Highlights?: EodhdHighlights;
  Valuation?: EodhdValuation;
  Technicals?: EodhdTechnicals;
  Earnings?: {
    History?: Record<string, {
      date: string;
      epsActual?: number;
      epsEstimate?: number;
      epsDifference?: number;
      surprisePercent?: number;
    }>;
    Trend?: Record<string, {
      date: string;
      period: string;
      growth?: number;
      earningsEstimateAvg?: number;
    }>;
  };
}

export async function getFundamentals(symbol: string): Promise<EodhdFundamentals> {
  const ticker = toEodhdTicker(symbol);
  const url = `${BASE}/fundamentals/${encodeURIComponent(ticker)}?api_token=${key()}&fmt=json`;
  return getJson<EodhdFundamentals>('eodhd', url);
}

// ─── Macro / Economic Indicators ─────────────────────────────────────────
// EODHD macro indicators use country code format.

export interface EodhdMacroPoint { date: string; value: number; }

export async function getMacroIndicator(
  country: string,
  indicator: string,
): Promise<EodhdMacroPoint[]> {
  const url = `${BASE}/macro-indicator/${encodeURIComponent(country)}?indicator=${encodeURIComponent(indicator)}&api_token=${key()}&fmt=json`;
  return getJson<EodhdMacroPoint[]>('eodhd', url);
}
