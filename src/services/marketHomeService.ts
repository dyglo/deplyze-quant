/**
 * marketHomeService.ts — data adapter for the post-auth Market Home landing page.
 *
 * Aggregates existing gateway endpoints (market/quotes, market/movers,
 * market/news, market/headlines) into snapshot tables grouped by asset class.
 * No new gateway routes are required. Each asset class maps to a real symbol
 * universe drawn from the existing dashboard / screener universes.
 */

import { fetchQuotes, type BatchQuoteRow } from './marketService';

export type SnapshotAssetClass =
  | 'indices' | 'stocks' | 'commodities' | 'currencies' | 'etfs' | 'bonds' | 'crypto';

export interface SnapshotRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  ok: boolean;
}

export interface AssetClassMeta {
  id: SnapshotAssetClass;
  label: string;
  /** Deep-link into an existing route for "view more", when one exists. */
  viewMore?: string;
}

interface UniverseEntry { symbol: string; name: string }

const UNIVERSE: Record<SnapshotAssetClass, UniverseEntry[]> = {
  indices: [
    { symbol: 'SPY',  name: 'S&P 500 ETF' },
    { symbol: 'QQQ',  name: 'Nasdaq 100 ETF' },
    { symbol: 'DIA',  name: 'Dow Jones ETF' },
    { symbol: 'IWM',  name: 'Russell 2000 ETF' },
    { symbol: 'ACWI', name: 'MSCI All-World' },
    { symbol: 'EFA',  name: 'Developed ex-US' },
    { symbol: 'EEM',  name: 'Emerging Markets' },
    { symbol: 'EWJ',  name: 'Japan' },
  ],
  stocks: [
    { symbol: 'AAPL',  name: 'Apple' },
    { symbol: 'MSFT',  name: 'Microsoft' },
    { symbol: 'NVDA',  name: 'NVIDIA' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'AMZN',  name: 'Amazon' },
    { symbol: 'META',  name: 'Meta Platforms' },
    { symbol: 'TSLA',  name: 'Tesla' },
    { symbol: 'JPM',   name: 'JPMorgan' },
  ],
  commodities: [
    { symbol: 'XAU/USD', name: 'Gold' },
    { symbol: 'XAG/USD', name: 'Silver' },
    { symbol: 'WTI/USD', name: 'Crude Oil (WTI)' },
    { symbol: 'BCO/USD', name: 'Brent Crude' },
    { symbol: 'NG/USD',  name: 'Natural Gas' },
    { symbol: 'HG/USD',  name: 'Copper' },
  ],
  currencies: [
    { symbol: 'EUR/USD', name: 'Euro / Dollar' },
    { symbol: 'USD/JPY', name: 'Dollar / Yen' },
    { symbol: 'GBP/USD', name: 'Pound / Dollar' },
    { symbol: 'AUD/USD', name: 'Aussie / Dollar' },
    { symbol: 'USD/CHF', name: 'Dollar / Franc' },
    { symbol: 'USD/CAD', name: 'Dollar / Loonie' },
  ],
  etfs: [
    { symbol: 'XLK',  name: 'Technology' },
    { symbol: 'XLF',  name: 'Financials' },
    { symbol: 'XLE',  name: 'Energy' },
    { symbol: 'XLV',  name: 'Healthcare' },
    { symbol: 'GLD',  name: 'Gold Trust' },
    { symbol: 'TLT',  name: '20Y+ Treasuries' },
    { symbol: 'HYG',  name: 'High Yield Credit' },
    { symbol: 'LQD',  name: 'IG Credit' },
  ],
  bonds: [
    { symbol: 'SHY', name: '1–3Y Treasuries' },
    { symbol: 'IEF', name: '7–10Y Treasuries' },
    { symbol: 'TLT', name: '20Y+ Treasuries' },
    { symbol: 'TIP', name: 'TIPS (Inflation-Linked)' },
    { symbol: 'LQD', name: 'Investment Grade' },
    { symbol: 'HYG', name: 'High Yield' },
  ],
  crypto: [
    { symbol: 'BTC/USD', name: 'Bitcoin' },
    { symbol: 'ETH/USD', name: 'Ethereum' },
    { symbol: 'SOL/USD', name: 'Solana' },
    { symbol: 'XRP/USD', name: 'XRP' },
    { symbol: 'ADA/USD', name: 'Cardano' },
    { symbol: 'AVAX/USD', name: 'Avalanche' },
  ],
};

export const SNAPSHOT_ASSET_CLASSES: AssetClassMeta[] = [
  { id: 'indices',     label: 'Indices',     viewMore: '/market/world-equity' },
  { id: 'stocks',      label: 'Stocks' },
  { id: 'commodities', label: 'Commodities', viewMore: '/market/commodities' },
  { id: 'currencies',  label: 'Currencies',  viewMore: '/market/fx-liquidity' },
  { id: 'etfs',        label: 'ETFs' },
  { id: 'bonds',       label: 'Bonds',       viewMore: '/market/global-yields' },
  { id: 'crypto',      label: 'Crypto' },
];

function normalize(row: BatchQuoteRow, nameMap: Record<string, string>): SnapshotRow {
  const name = nameMap[row.symbol] ?? row.symbol;
  if (!row.ok || !row.data) {
    return { symbol: row.symbol, name, price: 0, change: 0, changePercent: 0, ok: false };
  }
  return {
    symbol: row.symbol,
    name,
    price: row.data.price ?? 0,
    change: row.data.change ?? 0,
    changePercent: row.data.changePercent ?? 0,
    ok: true,
  };
}

export async function fetchSnapshot(assetClass: SnapshotAssetClass): Promise<SnapshotRow[]> {
  const universe = UNIVERSE[assetClass];
  const nameMap = Object.fromEntries(universe.map((u) => [u.symbol, u.name]));
  const rows = await fetchQuotes(universe.map((u) => u.symbol));
  // Preserve universe ordering rather than provider response ordering.
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  return universe.map((u) =>
    normalize(bySymbol.get(u.symbol) ?? { symbol: u.symbol, ok: false }, nameMap),
  );
}

/** Symbols used by the compact hero market rail. */
export const HERO_RAIL_SYMBOLS: UniverseEntry[] = [
  { symbol: 'SPY',     name: 'S&P 500' },
  { symbol: 'QQQ',     name: 'Nasdaq 100' },
  { symbol: 'DIA',     name: 'Dow Jones' },
  { symbol: 'TLT',     name: '20Y+ Treasuries' },
  { symbol: 'XAU/USD', name: 'Gold' },
  { symbol: 'WTI/USD', name: 'Crude Oil' },
  { symbol: 'EUR/USD', name: 'EUR/USD' },
  { symbol: 'BTC/USD', name: 'Bitcoin' },
];

export async function fetchHeroRail(): Promise<SnapshotRow[]> {
  const nameMap = Object.fromEntries(HERO_RAIL_SYMBOLS.map((u) => [u.symbol, u.name]));
  const rows = await fetchQuotes(HERO_RAIL_SYMBOLS.map((u) => u.symbol));
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  return HERO_RAIL_SYMBOLS.map((u) =>
    normalize(bySymbol.get(u.symbol) ?? { symbol: u.symbol, ok: false }, nameMap),
  );
}

// ─── Ticker tape ────────────────────────────────────────────────────────────────

export const TICKER_SYMBOLS: UniverseEntry[] = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'Nasdaq 100' },
  { symbol: 'DIA', name: 'Dow Jones' },
  { symbol: 'IWM', name: 'Russell 2000' },
  { symbol: 'TLT', name: '20Y+ Treasuries' },
  { symbol: 'UUP', name: 'US Dollar' },
  { symbol: 'XAU/USD', name: 'Gold' },
  { symbol: 'XAG/USD', name: 'Silver' },
  { symbol: 'WTI/USD', name: 'Crude Oil' },
  { symbol: 'EUR/USD', name: 'EUR/USD' },
  { symbol: 'USD/JPY', name: 'USD/JPY' },
  { symbol: 'BTC/USD', name: 'Bitcoin' },
  { symbol: 'ETH/USD', name: 'Ethereum' },
];

export async function fetchTicker(): Promise<SnapshotRow[]> {
  const nameMap = Object.fromEntries(TICKER_SYMBOLS.map((u) => [u.symbol, u.name]));
  const rows = await fetchQuotes(TICKER_SYMBOLS.map((u) => u.symbol));
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  return TICKER_SYMBOLS.map((u) =>
    normalize(bySymbol.get(u.symbol) ?? { symbol: u.symbol, ok: false }, nameMap),
  );
}

// ─── World indices (flagged) ───────────────────────────────────────────────────
// Country-flagged index proxies (ETFs), mirroring the reference's World Indices
// table. ISO-2 country codes drive flag emoji rendering.

export interface FlaggedRow extends SnapshotRow { country?: string }

// ETF proxies — the real-time quote chain serves ETFs reliably but not raw
// index levels, so names say "ETF" to avoid implying the index value (e.g. SPY
// ~745, not the S&P 500 index ~7,500). The chart uses true index symbols.
export const WORLD_INDICES: Array<{ symbol: string; name: string; country: string }> = [
  { symbol: 'DIA',  name: 'Dow Jones ETF',     country: 'US' },
  { symbol: 'SPY',  name: 'S&P 500 ETF',        country: 'US' },
  { symbol: 'QQQ',  name: 'Nasdaq 100 ETF',     country: 'US' },
  { symbol: 'IWM',  name: 'Russell 2000 ETF',   country: 'US' },
  { symbol: 'EWG',  name: 'DAX (Germany)',      country: 'DE' },
  { symbol: 'EWU',  name: 'FTSE (UK)',          country: 'GB' },
  { symbol: 'EWJ',  name: 'Nikkei (Japan)',     country: 'JP' },
  { symbol: 'FXI',  name: 'China Large-Cap',    country: 'CN' },
  { symbol: 'EWA',  name: 'ASX (Australia)',    country: 'AU' },
  { symbol: 'EWC',  name: 'TSX (Canada)',       country: 'CA' },
];

export const LEADING_STOCKS = UNIVERSE.stocks;

export async function fetchWorldIndices(): Promise<FlaggedRow[]> {
  const nameMap = Object.fromEntries(WORLD_INDICES.map((u) => [u.symbol, u.name]));
  const countryMap = Object.fromEntries(WORLD_INDICES.map((u) => [u.symbol, u.country]));
  const rows = await fetchQuotes(WORLD_INDICES.map((u) => u.symbol));
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  return WORLD_INDICES.map((u) => ({
    ...normalize(bySymbol.get(u.symbol) ?? { symbol: u.symbol, ok: false }, nameMap),
    country: countryMap[u.symbol],
  }));
}
