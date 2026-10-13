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

export async function fetchCommodityQuotes(): Promise<DashboardQuote[]> {
  const symbols = COMMODITY_SYMBOLS.map((s) => s.symbol);
  const nameMap = Object.fromEntries(COMMODITY_SYMBOLS.map((s) => [s.symbol, s.name]));
  const rows = await fetchQuotes(symbols);
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
