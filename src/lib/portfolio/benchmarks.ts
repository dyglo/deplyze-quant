/**
 * Benchmark registry — canonical benchmark definitions for portfolio comparison.
 * Fully customizable: users can add any tradeable symbol as a benchmark.
 */

import type { BenchmarkDefinition } from './schemas';

export const BENCHMARK_REGISTRY: BenchmarkDefinition[] = [
  // ── Broad Market ─────────────────────────────────────────────────────────
  { id: 'SPY',  name: 'S&P 500',              description: 'SPDR S&P 500 ETF — broad US large cap',          category: 'broad-market',  currency: 'USD' },
  { id: 'QQQ',  name: 'NASDAQ-100',           description: 'Invesco QQQ — mega-cap tech / growth',           category: 'broad-market',  currency: 'USD' },
  { id: 'IWB',  name: 'Russell 1000',         description: 'iShares Russell 1000 — top 1000 US equities',    category: 'broad-market',  currency: 'USD' },
  { id: 'IWM',  name: 'Russell 2000',         description: 'iShares Russell 2000 — US small cap',            category: 'broad-market',  currency: 'USD' },
  { id: 'VTI',  name: 'Total US Market',      description: 'Vanguard Total Stock Market — all US cap sizes', category: 'broad-market',  currency: 'USD' },
  { id: 'VT',   name: 'Total World Market',   description: 'Vanguard Total World Stock ETF',                 category: 'broad-market',  currency: 'USD' },
  { id: 'EFA',  name: 'MSCI EAFE',            description: 'iShares MSCI EAFE — developed ex-US',            category: 'broad-market',  currency: 'USD' },
  { id: 'EEM',  name: 'MSCI Emerging Markets',description: 'iShares MSCI EM — emerging markets',             category: 'broad-market',  currency: 'USD' },
  { id: 'DIA',  name: 'Dow Jones Industrial', description: 'SPDR DJIA — 30 large US industrials',            category: 'broad-market',  currency: 'USD' },

  // ── Sector ───────────────────────────────────────────────────────────────
  { id: 'XLK',  name: 'Technology',           description: 'SPDR Technology Select Sector',                  category: 'sector',        currency: 'USD' },
  { id: 'XLF',  name: 'Financials',           description: 'SPDR Financial Select Sector',                   category: 'sector',        currency: 'USD' },
  { id: 'XLV',  name: 'Healthcare',           description: 'SPDR Health Care Select Sector',                 category: 'sector',        currency: 'USD' },
  { id: 'XLE',  name: 'Energy',               description: 'SPDR Energy Select Sector',                      category: 'sector',        currency: 'USD' },
  { id: 'XLI',  name: 'Industrials',          description: 'SPDR Industrial Select Sector',                  category: 'sector',        currency: 'USD' },
  { id: 'XLC',  name: 'Communication Services',description: 'SPDR Communication Services Sector',            category: 'sector',        currency: 'USD' },
  { id: 'XLY',  name: 'Consumer Discretionary',description: 'SPDR Consumer Discretionary Sector',            category: 'sector',        currency: 'USD' },
  { id: 'XLP',  name: 'Consumer Staples',     description: 'SPDR Consumer Staples Sector',                   category: 'sector',        currency: 'USD' },
  { id: 'XLRE', name: 'Real Estate',          description: 'SPDR Real Estate Select Sector',                 category: 'sector',        currency: 'USD' },
  { id: 'XLB',  name: 'Materials',            description: 'SPDR Materials Select Sector',                   category: 'sector',        currency: 'USD' },
  { id: 'XLU',  name: 'Utilities',            description: 'SPDR Utilities Select Sector',                   category: 'sector',        currency: 'USD' },

  // ── Thematic ─────────────────────────────────────────────────────────────
  { id: 'ARKK', name: 'ARK Innovation',       description: 'ARK Innovation ETF — disruptive growth',         category: 'thematic',      currency: 'USD' },
  { id: 'SOXX', name: 'Semiconductors',       description: 'iShares Semiconductor ETF',                      category: 'thematic',      currency: 'USD' },
  { id: 'CIBR', name: 'Cybersecurity',        description: 'First Trust Cybersecurity ETF',                  category: 'thematic',      currency: 'USD' },
  { id: 'AIQ',  name: 'AI & Big Data',        description: 'Global X AI & Big Data ETF',                     category: 'thematic',      currency: 'USD' },
  { id: 'ICLN', name: 'Clean Energy',         description: 'iShares Global Clean Energy ETF',                category: 'thematic',      currency: 'USD' },
  { id: 'JETS', name: 'Airlines',             description: 'US Global Jets ETF',                             category: 'thematic',      currency: 'USD' },

  // ── Factor ───────────────────────────────────────────────────────────────
  { id: 'MTUM', name: 'US Momentum',          description: 'iShares MSCI USA Momentum Factor ETF',           category: 'factor',        currency: 'USD' },
  { id: 'VLUE', name: 'US Value',             description: 'iShares MSCI USA Value Factor ETF',              category: 'factor',        currency: 'USD' },
  { id: 'QUAL', name: 'US Quality',           description: 'iShares MSCI USA Quality Factor ETF',            category: 'factor',        currency: 'USD' },
  { id: 'USMV', name: 'US Min Volatility',    description: 'iShares MSCI USA Min Volatility Factor ETF',     category: 'factor',        currency: 'USD' },
  { id: 'SIZE', name: 'US Size Factor',       description: 'iShares MSCI USA Size Factor ETF',               category: 'factor',        currency: 'USD' },

  // ── Fixed Income ─────────────────────────────────────────────────────────
  { id: 'AGG',  name: 'US Aggregate Bond',    description: 'iShares Core US Aggregate Bond ETF',             category: 'fixed-income',  currency: 'USD' },
  { id: 'TLT',  name: 'Long Treasury',        description: 'iShares 20+ Year Treasury Bond ETF',             category: 'fixed-income',  currency: 'USD' },
  { id: 'HYG',  name: 'High Yield Corporate', description: 'iShares iBoxx High Yield Corporate Bond ETF',    category: 'fixed-income',  currency: 'USD' },
  { id: 'LQD',  name: 'IG Corporate Bond',    description: 'iShares iBoxx Investment Grade Corporate Bond',  category: 'fixed-income',  currency: 'USD' },
  { id: 'TIP',  name: 'TIPS',                 description: 'iShares TIPS Bond ETF — inflation-linked',       category: 'fixed-income',  currency: 'USD' },

  // ── Commodity ────────────────────────────────────────────────────────────
  { id: 'GLD',  name: 'Gold',                 description: 'SPDR Gold Shares',                               category: 'commodity',     currency: 'USD' },
  { id: 'USO',  name: 'Crude Oil',            description: 'United States Oil Fund',                         category: 'commodity',     currency: 'USD' },
  { id: 'DBC',  name: 'Broad Commodities',    description: 'Invesco DB Commodity Index Tracking Fund',       category: 'commodity',     currency: 'USD' },
];

export const BENCHMARK_MAP = new Map(BENCHMARK_REGISTRY.map(b => [b.id, b]));

export function getBenchmark(id: string): BenchmarkDefinition | undefined {
  return BENCHMARK_MAP.get(id);
}

export function getBenchmarksByCategory(category: BenchmarkDefinition['category']): BenchmarkDefinition[] {
  return BENCHMARK_REGISTRY.filter(b => b.category === category);
}

/** Default benchmark shown when user creates a new portfolio. */
export const DEFAULT_BENCHMARK_ID = 'SPY';
