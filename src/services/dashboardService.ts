/**
 * dashboardService.ts — normalized data adapter for Market Dashboard pages.
 *
 * Wraps existing gateway endpoints (market/quotes, macro/series, macro/fx)
 * into consistent typed schemas for each dashboard.  No new gateway routes
 * are required.  Intelligence classifications are computed client-side from
 * real data; no LLM calls.
 */

import { gatewayGet, ClientTTL } from './gatewayClient';
import { fetchQuotes } from './marketService';
import { fetchMacroSeries } from './macroService';
import type { BatchQuoteRow } from './marketService';

// ─── Core schema ─────────────────────────────────────────────────────────────

export interface DashboardQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change?: number;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  lastUpdated: number;
  ok: boolean;
}

export interface YieldPoint {
  term: string;
  termLabel: string;
  seriesId: string;
  value: number | null;
  fetchedAt: number | null;
}

export interface MacroDataPoint {
  ts: number;
  value: number;
}

export type RegimeClassification =
  | 'risk-on' | 'risk-off' | 'neutral'
  | 'inverted' | 'flat' | 'steepening' | 'normalizing'
  | 'bullish' | 'bearish' | 'consolidating'
  | 'strengthening' | 'weakening'
  | 'inflationary' | 'deflationary';

export interface IntelligenceSummary {
  regime: RegimeClassification;
  headline: string;
  note: string;
  signals: string[];
  caution?: string;
}

// ─── Symbol universes ─────────────────────────────────────────────────────────

export const WORLD_EQUITY_SYMBOLS: Array<{ symbol: string; name: string; group: 'us' | 'global' | 'developed' | 'emerging' }> = [
  { symbol: 'SPY',  name: 'S&P 500',          group: 'us' },
  { symbol: 'QQQ',  name: 'Nasdaq 100',        group: 'us' },
  { symbol: 'IWM',  name: 'Russell 2000',      group: 'us' },
  { symbol: 'DIA',  name: 'Dow Jones',         group: 'us' },
  { symbol: 'ACWI', name: 'All-World',         group: 'global' },
  { symbol: 'VT',   name: 'World Total',       group: 'global' },
  { symbol: 'EFA',  name: 'Developed ex-US',   group: 'developed' },
  { symbol: 'VEA',  name: 'Developed Mkts',    group: 'developed' },
  { symbol: 'EEM',  name: 'Emerging Markets',  group: 'emerging' },
  { symbol: 'VWO',  name: 'EM Vanguard',       group: 'emerging' },
  { symbol: 'EWJ',  name: 'Japan',             group: 'developed' },
  { symbol: 'EWG',  name: 'Germany',           group: 'developed' },
  { symbol: 'EWU',  name: 'UK',                group: 'developed' },
  { symbol: 'EWC',  name: 'Canada',            group: 'developed' },
  { symbol: 'FXI',  name: 'China',             group: 'emerging' },
  { symbol: 'EWZ',  name: 'Brazil',            group: 'emerging' },
];

export const SECTOR_ETF_SYMBOLS: Array<{ symbol: string; name: string; sector: string }> = [
  { symbol: 'XLK',  name: 'Technology',           sector: 'Technology' },
  { symbol: 'XLF',  name: 'Financials',            sector: 'Financials' },
  { symbol: 'XLV',  name: 'Healthcare',            sector: 'Healthcare' },
  { symbol: 'XLI',  name: 'Industrials',           sector: 'Industrials' },
  { symbol: 'XLE',  name: 'Energy',                sector: 'Energy' },
  { symbol: 'XLU',  name: 'Utilities',             sector: 'Utilities' },
  { symbol: 'XLRE', name: 'Real Estate',           sector: 'Real Estate' },
  { symbol: 'XLB',  name: 'Materials',             sector: 'Materials' },
  { symbol: 'XLC',  name: 'Communication Svcs',    sector: 'Communication' },
  { symbol: 'XLP',  name: 'Consumer Staples',      sector: 'Consumer Staples' },
  { symbol: 'XLY',  name: 'Consumer Discretionary',sector: 'Cons. Discret.' },
];

export const COUNTRY_ETF_SYMBOLS: Array<{ symbol: string; name: string; region: 'developed' | 'emerging'; country: string }> = [
  { symbol: 'EWJ',  name: 'Japan',          region: 'developed', country: 'JP' },
  { symbol: 'EWG',  name: 'Germany',        region: 'developed', country: 'DE' },
  { symbol: 'EWU',  name: 'United Kingdom', region: 'developed', country: 'UK' },
  { symbol: 'EWC',  name: 'Canada',         region: 'developed', country: 'CA' },
  { symbol: 'EWA',  name: 'Australia',      region: 'developed', country: 'AU' },
  { symbol: 'EWL',  name: 'Switzerland',    region: 'developed', country: 'CH' },
  { symbol: 'EWD',  name: 'Sweden',         region: 'developed', country: 'SE' },
  { symbol: 'EWT',  name: 'Taiwan',         region: 'emerging',  country: 'TW' },
  { symbol: 'EWY',  name: 'South Korea',    region: 'emerging',  country: 'KR' },
  { symbol: 'FXI',  name: 'China',          region: 'emerging',  country: 'CN' },
  { symbol: 'EWZ',  name: 'Brazil',         region: 'emerging',  country: 'BR' },
  { symbol: 'INDA', name: 'India',          region: 'emerging',  country: 'IN' },
  { symbol: 'EWW',  name: 'Mexico',         region: 'emerging',  country: 'MX' },
  { symbol: 'EWS',  name: 'Singapore',      region: 'emerging',  country: 'SG' },
];

export const YIELD_SERIES: Array<{ id: string; term: string; termLabel: string }> = [
  { id: 'DGS3MO', term: '3M',  termLabel: '3-Month' },
  { id: 'DGS2',   term: '2Y',  termLabel: '2-Year' },
  { id: 'DGS5',   term: '5Y',  termLabel: '5-Year' },
  { id: 'DGS10',  term: '10Y', termLabel: '10-Year' },
  { id: 'DGS30',  term: '30Y', termLabel: '30-Year' },
  { id: 'T10Y2Y', term: 'Spread', termLabel: '10Y–2Y Spread' },
  { id: 'T5YIE',  term: 'BEI5Y', termLabel: '5Y Breakeven' },
];

export const COMMODITY_SYMBOLS: Array<{ symbol: string; name: string; category: 'energy' | 'metals' | 'agriculture' }> = [
  { symbol: 'WTI/USD', name: 'Crude Oil (WTI)',  category: 'energy' },
  { symbol: 'BCO/USD', name: 'Brent Crude',       category: 'energy' },
  { symbol: 'NG/USD',  name: 'Natural Gas',        category: 'energy' },
  { symbol: 'XAU/USD', name: 'Gold',              category: 'metals' },
  { symbol: 'XAG/USD', name: 'Silver',            category: 'metals' },
  { symbol: 'HG/USD',  name: 'Copper',            category: 'metals' },
];

export const FX_SYMBOLS: Array<{ from: string; to: string; label: string; pair: string; group: 'g10' | 'em' | 'dxy' }> = [
  { from: 'UUP',     to: '',      label: 'DXY (proxy)', pair: 'UUP',     group: 'dxy' },
  { from: 'EUR',     to: 'USD',   label: 'EUR/USD',     pair: 'EUR/USD', group: 'g10' },
  { from: 'GBP',     to: 'USD',   label: 'GBP/USD',     pair: 'GBP/USD', group: 'g10' },
  { from: 'USD',     to: 'JPY',   label: 'USD/JPY',     pair: 'USD/JPY', group: 'g10' },
  { from: 'USD',     to: 'CHF',   label: 'USD/CHF',     pair: 'USD/CHF', group: 'g10' },
  { from: 'AUD',     to: 'USD',   label: 'AUD/USD',     pair: 'AUD/USD', group: 'g10' },
  { from: 'USD',     to: 'CAD',   label: 'USD/CAD',     pair: 'USD/CAD', group: 'g10' },
  { from: 'NZD',     to: 'USD',   label: 'NZD/USD',     pair: 'NZD/USD', group: 'g10' },
];

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeRow(row: BatchQuoteRow, nameMap?: Record<string, string>): DashboardQuote {
  if (!row.ok || !row.data) {
    return {
      symbol: row.symbol, name: nameMap?.[row.symbol] ?? row.symbol,
      price: 0, changePercent: 0, lastUpdated: Date.now(), ok: false,
    };
  }
  return {
    symbol: row.symbol,
    name: nameMap?.[row.symbol] ?? row.symbol,
    price: row.data.price ?? 0,
    changePercent: row.data.changePercent ?? 0,
    change: row.data.change,
    high: row.data.high,
    low: row.data.low,
    open: row.data.open,
    previousClose: row.data.previousClose,
    lastUpdated: Date.now(),
    ok: true,
  };
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchWorldEquityQuotes(): Promise<DashboardQuote[]> {
  const symbols = WORLD_EQUITY_SYMBOLS.map((s) => s.symbol);
  const nameMap = Object.fromEntries(WORLD_EQUITY_SYMBOLS.map((s) => [s.symbol, s.name]));
  const rows = await fetchQuotes(symbols);
  return rows.map((r) => normalizeRow(r, nameMap));
}

export async function fetchSectorQuotes(): Promise<DashboardQuote[]> {
  const symbols = SECTOR_ETF_SYMBOLS.map((s) => s.symbol);
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));
  const rows = await fetchQuotes(['SPY', ...symbols]);
  return rows.map((r) => normalizeRow(r, nameMap));
}

export async function fetchCountryETFQuotes(): Promise<DashboardQuote[]> {
  const symbols = COUNTRY_ETF_SYMBOLS.map((s) => s.symbol);
  const nameMap = Object.fromEntries(COUNTRY_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));
  const rows = await fetchQuotes(symbols);
  return rows.map((r) => normalizeRow(r, nameMap));
}

export async function fetchCommodityQuotes(): Promise<DashboardQuote[]> {
  const symbols = COMMODITY_SYMBOLS.map((s) => s.symbol);
  const nameMap = Object.fromEntries(COMMODITY_SYMBOLS.map((s) => [s.symbol, s.name]));
  const rows = await fetchQuotes(symbols);
  return rows.map((r) => normalizeRow(r, nameMap));
}

export async function fetchFXQuotes(): Promise<DashboardQuote[]> {
  const quoteSymbols = FX_SYMBOLS.map((f) => f.pair);
  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  const rows = await fetchQuotes(quoteSymbols);
  return rows.map((r) => normalizeRow(r, nameMap));
}

export interface YieldCurveData {
  points: YieldPoint[];
  history: Record<string, MacroDataPoint[]>;
  spread10y2y: number | null;
  curveState: 'inverted' | 'flat' | 'normal' | 'steep';
}

export async function fetchYieldCurve(): Promise<YieldCurveData> {
  const results = await Promise.allSettled(
    YIELD_SERIES.map(async (s) => {
      const data = await fetchMacroSeries(s.id);
      return { id: s.id, data };
    }),
  );

  const points: YieldPoint[] = [];
  const history: Record<string, MacroDataPoint[]> = {};

  for (let i = 0; i < YIELD_SERIES.length; i++) {
    const meta = YIELD_SERIES[i];
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.data?.points?.length) {
      const latest = r.value.data.points[r.value.data.points.length - 1];
      points.push({
        term: meta.term,
        termLabel: meta.termLabel,
        seriesId: meta.id,
        value: latest.value,
        fetchedAt: Date.now(),
      });
      history[meta.id] = r.value.data.points.map((p) => ({ ts: p.ts, value: p.value }));
    } else {
      points.push({ term: meta.term, termLabel: meta.termLabel, seriesId: meta.id, value: null, fetchedAt: null });
    }
  }

  const spreadPt = points.find((p) => p.seriesId === 'T10Y2Y');
  const spread = spreadPt?.value ?? null;

  let curveState: YieldCurveData['curveState'] = 'normal';
  if (spread !== null) {
    if (spread < -0.5) curveState = 'inverted';
    else if (spread < 0.25) curveState = 'flat';
    else if (spread > 1.5) curveState = 'steep';
  }

  return { points, history, spread10y2y: spread, curveState };
}

// ─── Intelligence classifiers ─────────────────────────────────────────────────

export function classifyWorldEquity(quotes: DashboardQuote[]): IntelligenceSummary {
  const ok = quotes.filter((q) => q.ok);
  if (!ok.length) return { regime: 'neutral', headline: 'Insufficient data', note: 'Provider data unavailable.', signals: [] };

  const avgChange = ok.reduce((s, q) => s + q.changePercent, 0) / ok.length;
  const spy = quotes.find((q) => q.symbol === 'SPY');
  const eem = quotes.find((q) => q.symbol === 'EEM');
  const efa = quotes.find((q) => q.symbol === 'EFA');

  const signals: string[] = [];
  let regime: RegimeClassification = 'neutral';

  if (avgChange > 0.5) {
    regime = 'risk-on';
    signals.push('Broad advance across global equity indices');
  } else if (avgChange < -0.5) {
    regime = 'risk-off';
    signals.push('Broad decline across global equity indices');
  }

  if (spy && spy.changePercent > 0.5) signals.push('US large-cap leading');
  if (eem && eem.changePercent < -1) signals.push('Emerging market pressure elevated');
  if (efa && efa.changePercent > spy!.changePercent + 0.5) signals.push('International outperforming US');

  const gainers = ok.filter((q) => q.changePercent > 0).length;
  const breadthPct = Math.round((gainers / ok.length) * 100);
  signals.push(`${breadthPct}% of tracked indices advancing`);

  const headline = regime === 'risk-on'
    ? 'Global Risk-On — Broad Equity Advance'
    : regime === 'risk-off'
    ? 'Global Risk-Off — Broad Equity Decline'
    : 'Global Equities Mixed — Selective Leadership';

  return {
    regime,
    headline,
    note: `Avg change across ${ok.length} tracked indices: ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`,
    signals,
  };
}

export function classifySectors(quotes: DashboardQuote[]): IntelligenceSummary {
  const sectorQuotes = quotes.filter((q) => q.symbol !== 'SPY' && q.ok);
  const spy = quotes.find((q) => q.symbol === 'SPY');
  if (!sectorQuotes.length) return { regime: 'neutral', headline: 'Insufficient sector data', note: '', signals: [] };

  const sorted = [...sectorQuotes].sort((a, b) => b.changePercent - a.changePercent);
  const top3 = sorted.slice(0, 3).map((q) => q.name || q.symbol);
  const bot3 = sorted.slice(-3).map((q) => q.name || q.symbol);

  const offensiveSectors = ['XLK', 'XLY', 'XLC', 'XLF'];
  const defensiveSectors = ['XLU', 'XLP', 'XLV'];
  const offAvg = sectorQuotes.filter((q) => offensiveSectors.includes(q.symbol)).reduce((s, q) => s + q.changePercent, 0) / offensiveSectors.length;
  const defAvg = sectorQuotes.filter((q) => defensiveSectors.includes(q.symbol)).reduce((s, q) => s + q.changePercent, 0) / defensiveSectors.length;

  const regime: RegimeClassification = offAvg > defAvg + 0.3 ? 'risk-on' : defAvg > offAvg + 0.3 ? 'risk-off' : 'neutral';
  const signals = [
    `Leaders: ${top3.join(', ')}`,
    `Laggards: ${bot3.join(', ')}`,
    `Offensive avg: ${offAvg >= 0 ? '+' : ''}${offAvg.toFixed(2)}% | Defensive avg: ${defAvg >= 0 ? '+' : ''}${defAvg.toFixed(2)}%`,
  ];
  if (spy) signals.push(`SPY benchmark: ${spy.changePercent >= 0 ? '+' : ''}${spy.changePercent.toFixed(2)}%`);

  return {
    regime,
    headline: regime === 'risk-on'
      ? 'Offensive Rotation — Cyclicals Leading'
      : regime === 'risk-off'
      ? 'Defensive Rotation — Staples & Utilities Leading'
      : 'Balanced Sector Distribution',
    note: `${sectorQuotes.length} sector ETFs analysed vs SPY benchmark`,
    signals,
  };
}

export function classifyYieldCurve(data: YieldCurveData): IntelligenceSummary {
  const { curveState, spread10y2y } = data;
  const spreadStr = spread10y2y !== null ? `${spread10y2y >= 0 ? '+' : ''}${spread10y2y.toFixed(2)}%` : 'N/A';

  const regimeMap: Record<YieldCurveData['curveState'], RegimeClassification> = {
    inverted: 'inverted', flat: 'flat', normal: 'neutral', steep: 'steepening',
  };
  const regime = regimeMap[curveState];

  const headlineMap: Record<YieldCurveData['curveState'], string> = {
    inverted: 'Yield Curve Inverted — Recession Indicator Active',
    flat: 'Yield Curve Flat — Transition Zone',
    normal: 'Yield Curve Normal — Positive Slope',
    steep: 'Yield Curve Steep — Growth Regime Signal',
  };

  return {
    regime,
    headline: headlineMap[curveState],
    note: `10Y–2Y spread: ${spreadStr}`,
    signals: [
      `Curve state: ${curveState}`,
      `10Y–2Y: ${spreadStr}`,
      ...(curveState === 'inverted' ? ['Historical inversion precedes recession 12–18 months on average'] : []),
    ],
    caution: curveState === 'inverted' ? 'Curve inversion is a lagging signal; confirm with credit spreads and labour data' : undefined,
  };
}

export function classifyCommodities(quotes: DashboardQuote[]): IntelligenceSummary {
  const ok = quotes.filter((q) => q.ok);
  if (!ok.length) return { regime: 'neutral', headline: 'Insufficient commodity data', note: '', signals: [] };

  const gold = ok.find((q) => q.symbol === 'XAU/USD');
  const wti = ok.find((q) => q.symbol === 'WTI/USD');
  const copper = ok.find((q) => q.symbol === 'HG/USD');

  const avgChange = ok.reduce((s, q) => s + q.changePercent, 0) / ok.length;
  const signals: string[] = [];
  let regime: RegimeClassification = 'neutral';

  if (gold && gold.changePercent > 0.5) signals.push('Gold advancing — safe-haven demand elevated');
  if (wti && Math.abs(wti.changePercent) > 1.5) signals.push(`Energy ${wti.changePercent > 0 ? 'rallying' : 'under pressure'}`);
  if (copper && copper.changePercent > 0.5) signals.push('Copper rising — cyclical demand signal');

  if (avgChange > 0.5) { regime = 'inflationary'; }
  else if (avgChange < -0.5) { regime = 'deflationary'; }

  return {
    regime,
    headline: regime === 'inflationary'
      ? 'Commodity Pressure Rising — Inflationary Backdrop'
      : regime === 'deflationary'
      ? 'Commodity Weakness — Disinflationary Signal'
      : 'Commodities Mixed — No Clear Directional Bias',
    note: `Avg change across ${ok.length} tracked commodities: ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`,
    signals,
  };
}

export function classifyFX(quotes: DashboardQuote[]): IntelligenceSummary {
  const dxy = quotes.find((q) => q.symbol === 'UUP');
  const ok = quotes.filter((q) => q.ok && q.symbol !== 'UUP');

  const signals: string[] = [];
  let regime: RegimeClassification = 'neutral';

  if (dxy?.ok) {
    if (dxy.changePercent > 0.3) {
      regime = 'strengthening';
      signals.push('Dollar strengthening — risk-off / tightening bias');
    } else if (dxy.changePercent < -0.3) {
      regime = 'weakening';
      signals.push('Dollar weakening — risk-on / easing bias');
    }
    signals.push(`DXY proxy (UUP): ${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%`);
  }

  const pairs = ok.map((q) => `${q.symbol}: ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`);
  if (pairs.length) signals.push(`G10 pairs: ${pairs.slice(0, 3).join(' · ')}`);

  return {
    regime,
    headline: regime === 'strengthening'
      ? 'Dollar Strength — Risk-Off / Tightening Bias'
      : regime === 'weakening'
      ? 'Dollar Weakness — Risk-On / Easing Bias'
      : 'FX Market Stable — Dollar Directionless',
    note: `${ok.length} G10 pairs tracked`,
    signals,
  };
}
