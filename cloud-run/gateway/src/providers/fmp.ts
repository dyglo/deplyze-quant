/**
 * Financial Modeling Prep (FMP) adapter — fundamentals, earnings, profiles,
 * key metrics, historical price data.
 * Docs: https://site.financialmodelingprep.com/developer/docs
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://financialmodelingprep.com/api';
const STABLE = 'https://financialmodelingprep.com/stable';
function key() { return requireEnv('FMP_API_KEY'); }

// ─── Quote ────────────────────────────────────────────────────────────────

export interface FmpQuote {
  symbol: string;
  name?: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
  volume: number;
  avgVolume: number;
  exchange: string;
  open: number;
  previousClose: number;
  eps?: number;
  pe?: number;
  earningsAnnouncement?: string;
  sharesOutstanding?: number;
  timestamp: number;
}

export async function getQuote(symbol: string): Promise<FmpQuote> {
  const url = `${BASE}/v3/quote/${encodeURIComponent(symbol)}?apikey=${key()}`;
  const r = await getJson<FmpQuote[]>('fmp', url);
  if (!r[0]) throw new Error(`FMP: no quote for ${symbol}`);
  return r[0];
}

// ─── Company Profile ──────────────────────────────────────────────────────

export interface FmpCompanyProfile {
  symbol: string;
  price: number;
  beta?: number;
  volAvg?: number;
  mktCap: number;
  lastDiv?: number;
  range?: string;
  changes?: number;
  companyName: string;
  currency: string;
  cik?: string;
  isin?: string;
  exchangeShortName?: string;
  industry?: string;
  website?: string;
  description?: string;
  ceo?: string;
  sector?: string;
  country?: string;
  fullTimeEmployees?: string;
  sharesOutstanding?: number;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  dcfDiff?: number;
  dcf?: number;
  image?: string;
  ipoDate?: string;
  defaultImage?: boolean;
  isEtf?: boolean;
  isActivelyTrading?: boolean;
}

export async function getProfile(symbol: string): Promise<FmpCompanyProfile> {
  const url = `${BASE}/v3/profile/${encodeURIComponent(symbol)}?apikey=${key()}`;
  const r = await getJson<FmpCompanyProfile[]>('fmp', url);
  if (!r[0]) throw new Error(`FMP: no profile for ${symbol}`);
  return r[0];
}

// ─── Earnings Surprises ────────────────────────────────────────────────────

export interface FmpEarningsSurprise {
  date: string;
  symbol: string;
  actualEarningResult: number;
  estimatedEarning: number;
}

export async function getEarningsSurprises(symbol: string, limit = 8): Promise<FmpEarningsSurprise[]> {
  const url = `${BASE}/v3/earnings-surprises/${encodeURIComponent(symbol)}?apikey=${key()}`;
  const r = await getJson<FmpEarningsSurprise[]>('fmp', url);
  return r.slice(0, limit);
}

// ─── Earnings Calendar ────────────────────────────────────────────────────

export interface FmpEarningsCalendarItem {
  date: string;
  symbol: string;
  eps?: number | null;
  epsActual?: number | null;
  epsEstimated: number | null;
  time: string;
  revenue?: number | null;
  revenueActual?: number | null;
  revenueEstimated: number | null;
  updatedFromDate?: string;
  lastUpdated?: string;
  fiscalDateEnding?: string;
}

export async function getEarningsCalendar(from: string, to: string): Promise<FmpEarningsCalendarItem[]> {
  const url = `${STABLE}/earnings-calendar?from=${from}&to=${to}&apikey=${key()}`;
  const r = await getJson<FmpEarningsCalendarItem[]>('fmp', url);
  return Array.isArray(r) ? r : [];
}

// ─── Key Metrics ──────────────────────────────────────────────────────────

export interface FmpKeyMetrics {
  date: string;
  symbol: string;
  period: string;
  revenuePerShare: number;
  netIncomePerShare: number;
  operatingCashFlowPerShare: number;
  freeCashFlowPerShare: number;
  cashPerShare: number;
  bookValuePerShare: number;
  tangibleBookValuePerShare: number;
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  priceToSalesRatio: number;
  pbRatio: number;
  evToSales: number;
  enterpriseValueOverEBITDA: number;
  earningsYield: number;
  freeCashFlowYield: number;
  debtToEquity: number;
  debtToAssets: number;
  netDebtToEBITDA: number;
  currentRatio: number;
  interestCoverage: number;
  dividendYield: number;
  payoutRatio: number;
  roic: number;
  roe: number;
}

export async function getKeyMetrics(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit = 4,
): Promise<FmpKeyMetrics[]> {
  const url = `${BASE}/v3/key-metrics/${encodeURIComponent(symbol)}?period=${period}&limit=${limit}&apikey=${key()}`;
  return getJson<FmpKeyMetrics[]>('fmp', url);
}

// ─── Income Statement ─────────────────────────────────────────────────────

export interface FmpIncomeStatement {
  date: string;
  symbol: string;
  period: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  grossProfitRatio: number;
  operatingIncome: number;
  operatingIncomeRatio: number;
  netIncome: number;
  netIncomeRatio: number;
  eps: number;
  epsdiluted: number;
  ebitda: number;
  researchAndDevelopmentExpenses: number;
  generalAndAdministrativeExpenses: number;
}

export async function getIncomeStatement(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit = 4,
): Promise<FmpIncomeStatement[]> {
  const url = `${BASE}/v3/income-statement/${encodeURIComponent(symbol)}?period=${period}&limit=${limit}&apikey=${key()}`;
  return getJson<FmpIncomeStatement[]>('fmp', url);
}

// ─── Historical Price (daily OHLCV) ───────────────────────────────────────

export interface FmpHistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  unadjustedVolume: number;
  change: number;
  changePercent: number;
  vwap: number;
  changeOverTime: number;
}

export async function getHistoricalPrice(
  symbol: string,
  from?: string,
  to?: string,
  limit = 500,
  signal?: AbortSignal,
): Promise<FmpHistoricalBar[]> {
  // Use stable endpoint — v3/historical-price-full is a legacy endpoint
  const params = new URLSearchParams({ symbol, apikey: key() });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `${STABLE}/historical-price-eod/full?${params}`;
  const r = await getJson<FmpHistoricalBar[]>('fmp', url, { signal });
  // Stable endpoint returns newest-first; reverse to ascending
  return (Array.isArray(r) ? r : []).slice(0, limit).reverse();
}

// ─── Market Movers ────────────────────────────────────────────────────────

export interface FmpMover {
  // Stable API fields
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changesPercentage: number;
}

export async function getGainers(): Promise<FmpMover[]> {
  // Use stable endpoint — v3/stock_market/gainers is a legacy endpoint
  const r = await getJson<FmpMover[]>('fmp', `${STABLE}/biggest-gainers?apikey=${key()}`);
  return Array.isArray(r) ? r : [];
}

export async function getLosers(): Promise<FmpMover[]> {
  // Use stable endpoint — v3/stock_market/losers is a legacy endpoint
  const r = await getJson<FmpMover[]>('fmp', `${STABLE}/biggest-losers?apikey=${key()}`);
  return Array.isArray(r) ? r : [];
}

export async function getMostActive(): Promise<FmpMover[]> {
  // Use stable endpoint — v3/stock_market/actives is a legacy endpoint
  const r = await getJson<FmpMover[]>('fmp', `${STABLE}/most-actives?apikey=${key()}`);
  return Array.isArray(r) ? r : [];
}

// ─── Stock Peers ─────────────────────────────────────────────────────────

export interface FmpPeersResult {
  symbol: string;
  peersList: string[];
}

export async function getStockPeers(symbol: string): Promise<string[]> {
  const url = `${BASE}/v4/stock_peers?symbol=${encodeURIComponent(symbol)}&apikey=${key()}`;
  const r = await getJson<FmpPeersResult[]>('fmp', url);
  return Array.isArray(r) && r[0]?.peersList ? r[0].peersList.slice(0, 8) : [];
}

export async function getQuoteBatch(symbols: string[]): Promise<FmpQuote[]> {
  if (!symbols.length) return [];
  const url = `${BASE}/v3/quote/${symbols.map(encodeURIComponent).join(',')}?apikey=${key()}`;
  const r = await getJson<FmpQuote[]>('fmp', url);
  return Array.isArray(r) ? r : [];
}

// ─── Analyst Recommendations ─────────────────────────────────────────────

export interface FmpAnalystRecommendation {
  date: string;
  symbol: string;
  analystRatingsbuy: number;
  analystRatingsHold: number;
  analystRatingsSell: number;
  analystRatingsStrongSell: number;
  analystRatingsStrongBuy: number;
}

export async function getAnalystRecommendations(
  symbol: string,
  limit = 1,
): Promise<FmpAnalystRecommendation[]> {
  const url = `${BASE}/v3/analyst-stock-recommendations/${encodeURIComponent(symbol)}?limit=${limit}&apikey=${key()}`;
  const r = await getJson<FmpAnalystRecommendation[]>('fmp', url);
  return Array.isArray(r) ? r : [];
}

// ─── Price Targets ────────────────────────────────────────────────────────

export interface FmpPriceTargetItem {
  symbol: string;
  publishedDate: string;
  priceTarget: number;
  adjPriceTarget: number;
  priceWhenPosted: number;
  analystName: string;
  analystCompany: string;
}

export async function getPriceTargets(
  symbol: string,
  limit = 20,
): Promise<FmpPriceTargetItem[]> {
  const url = `${BASE}/v4/price-target?symbol=${encodeURIComponent(symbol)}&apikey=${key()}`;
  const r = await getJson<FmpPriceTargetItem[]>('fmp', url);
  return Array.isArray(r) ? r.slice(0, limit) : [];
}

// ─── Analyst Upgrades / Downgrades ───────────────────────────────────────────

export interface FmpUpgradeDowngrade {
  symbol: string;
  publishedDate: string;
  newsURL: string;
  newsTitle?: string;
  newsPublisher?: string;
  newGrade: string;
  previousGrade: string;
  gradingCompany: string;
  action: string; // 'upgrade' | 'downgrade' | 'initiated' | 'maintained' | 'reiterated'
  priceWhenPosted?: number;
}

export async function getUpgradesDowngrades(
  symbol: string,
  limit = 20,
): Promise<FmpUpgradeDowngrade[]> {
  const url = `${BASE}/v4/upgrades-downgrades?symbol=${encodeURIComponent(symbol)}&apikey=${key()}`;
  const r = await getJson<FmpUpgradeDowngrade[]>('fmp', url);
  return Array.isArray(r) ? r.slice(0, limit) : [];
}

// ─── Institutional Holders ────────────────────────────────────────────────────

export interface FmpInstitutionalHolder {
  holder: string;
  shares: number;
  dateReported: string;
  change: number;
  weightPercent?: number;
}

export async function getInstitutionalHolders(
  symbol: string,
  limit = 10,
): Promise<FmpInstitutionalHolder[]> {
  const url = `${BASE}/v3/institutional-holder/${encodeURIComponent(symbol)}?apikey=${key()}`;
  const r = await getJson<FmpInstitutionalHolder[]>('fmp', url);
  return Array.isArray(r) ? r.slice(0, limit) : [];
}
