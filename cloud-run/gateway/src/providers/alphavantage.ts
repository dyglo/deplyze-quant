/**
 * Alpha Vantage adapter — macro time-series (CPI, FED rate, treasury yields,
 * GDP, unemployment, inflation expectations, real GDP per capita).
 * Free tier: 25 requests / day. Cache aggressively.
 * Docs: https://www.alphavantage.co/documentation/
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://www.alphavantage.co/query';
function key() { return requireEnv('ALPHA_VANTAGE_API_KEY'); }

interface AvSeriesResponse {
  name?: string;
  interval?: string;
  unit?: string;
  data?: Array<{ date: string; value: string }>;
  // Error responses:
  Note?: string;
  Information?: string;
  'Error Message'?: string;
}

export interface MacroPoint {
  ts: number;
  value: number;
}

export interface MacroSeriesResult {
  id: string;
  name: string;
  unit: string;
  frequency: string;
  points: MacroPoint[];
}

function toPoints(resp: AvSeriesResponse): MacroPoint[] {
  if (!resp.data) return [];
  return resp.data
    .filter((d) => d.value !== '.' && d.value != null)
    .map((d) => ({ ts: Date.parse(d.date), value: Number(d.value) }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value))
    .sort((a, b) => a.ts - b.ts);
}

function ensureOk(resp: AvSeriesResponse) {
  if (resp['Error Message'] || resp.Note || resp.Information) {
    throw new Error(`Alpha Vantage: ${resp['Error Message'] ?? resp.Note ?? resp.Information}`);
  }
}

const SERIES = {
  CPI:        { fn: 'CPI', interval: 'monthly', name: 'Consumer Price Index', unit: 'index' },
  INFLATION:  { fn: 'INFLATION', interval: undefined, name: 'US Inflation (annual)', unit: '%' },
  FEDFUNDS:   { fn: 'FEDERAL_FUNDS_RATE', interval: 'monthly', name: 'Federal Funds Rate', unit: '%' },
  DGS10:      { fn: 'TREASURY_YIELD', interval: 'monthly', maturity: '10year', name: '10Y Treasury Yield', unit: '%' },
  DGS2:       { fn: 'TREASURY_YIELD', interval: 'monthly', maturity: '2year', name: '2Y Treasury Yield', unit: '%' },
  DGS3M:      { fn: 'TREASURY_YIELD', interval: 'monthly', maturity: '3month', name: '3M Treasury Yield', unit: '%' },
  GDP:        { fn: 'REAL_GDP', interval: 'quarterly', name: 'Real GDP', unit: 'B USD' },
  UNEMP:      { fn: 'UNEMPLOYMENT', interval: undefined, name: 'Unemployment Rate', unit: '%' },
  RETAILSALES:{ fn: 'RETAIL_SALES', interval: undefined, name: 'Retail Sales', unit: 'M USD' },
} as const;

export type MacroSeriesId = keyof typeof SERIES;

export async function getMacroSeries(id: MacroSeriesId): Promise<MacroSeriesResult> {
  const spec = SERIES[id];
  if (!spec) throw new Error(`Unknown macro series: ${id}`);

  const params = new URLSearchParams({ function: spec.fn, apikey: key() });
  if (spec.interval) params.set('interval', spec.interval);
  if ('maturity' in spec && spec.maturity) params.set('maturity', spec.maturity);

  const resp = await getJson<AvSeriesResponse>('alpha_vantage', `${BASE}?${params}`);
  ensureOk(resp);
  return {
    id,
    name: spec.name,
    unit: spec.unit,
    frequency: spec.interval ?? 'annual',
    points: toPoints(resp),
  };
}

export const MACRO_SERIES_IDS = Object.keys(SERIES) as MacroSeriesId[];

// ─── FX historical daily ────────────────────────────────────────────────────

export interface AvFxBar { ts: number; open: number; high: number; low: number; close: number; }

export async function getFxDaily(from: string, to: string): Promise<AvFxBar[]> {
  const params = new URLSearchParams({
    function: 'FX_DAILY',
    from_symbol: from,
    to_symbol: to,
    outputsize: 'compact',
    apikey: key(),
  });
  type Resp = { 'Time Series FX (Daily)'?: Record<string, Record<string, string>> } & AvSeriesResponse;
  const resp = await getJson<Resp>('alpha_vantage', `${BASE}?${params}`);
  ensureOk(resp);
  const series = resp['Time Series FX (Daily)'] ?? {};
  return Object.entries(series)
    .map(([date, vals]) => ({
      ts: Date.parse(date),
      open: Number(vals['1. open']),
      high: Number(vals['2. high']),
      low:  Number(vals['3. low']),
      close: Number(vals['4. close']),
    }))
    .filter((b) => Number.isFinite(b.ts))
    .sort((a, b) => a.ts - b.ts);
}
