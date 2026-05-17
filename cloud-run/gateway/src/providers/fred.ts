/**
 * FRED (Federal Reserve Economic Data) adapter — free macro time-series.
 * St. Louis Fed, no daily request cap (120 req/min).
 * API key is FREE at https://fred.stlouisfed.org/docs/api/api_key.html
 * Docs: https://fred.stlouisfed.org/docs/api/fred/
 *
 * Used as a fallback when Alpha Vantage exhausts its 25 req/day free quota.
 */

import { getJson } from './http';
import type { MacroSeriesResult } from './alphavantage';

const BASE = 'https://api.stlouisfed.org/fred';

function key(): string | null {
  return process.env['FRED_API_KEY'] ?? null;
}

// ─── Series ID mapping ────────────────────────────────────────────────────
// Maps our internal macro series IDs → FRED series IDs + metadata.

interface FredSeriesSpec {
  fredId: string;
  name: string;
  unit: string;
  frequency: string;
}

const FRED_SERIES: Record<string, FredSeriesSpec> = {
  CPI:         { fredId: 'CPIAUCSL',  name: 'Consumer Price Index',      unit: 'index',  frequency: 'monthly' },
  INFLATION:   { fredId: 'CPIAUCSL',  name: 'US Inflation (annual)',      unit: '%',      frequency: 'annual'  },
  FEDFUNDS:    { fredId: 'FEDFUNDS',  name: 'Federal Funds Rate',         unit: '%',      frequency: 'monthly' },
  DGS2:        { fredId: 'DGS2',      name: '2Y Treasury Yield',          unit: '%',      frequency: 'daily'   },
  DGS3M:       { fredId: 'DGS3MO',   name: '3M Treasury Yield',          unit: '%',      frequency: 'daily'   },
  DGS5:        { fredId: 'DGS5',      name: '5Y Treasury Yield',          unit: '%',      frequency: 'daily'   },
  DGS10:       { fredId: 'DGS10',     name: '10Y Treasury Yield',         unit: '%',      frequency: 'daily'   },
  DGS20:       { fredId: 'DGS20',     name: '20Y Treasury Yield',         unit: '%',      frequency: 'daily'   },
  DGS30:       { fredId: 'DGS30',     name: '30Y Treasury Yield',         unit: '%',      frequency: 'daily'   },
  T5YIE:       { fredId: 'T5YIE',     name: '5Y Breakeven Inflation',     unit: '%',      frequency: 'daily'   },
  UNRATE:      { fredId: 'UNRATE',    name: 'Unemployment Rate',          unit: '%',      frequency: 'monthly' },
  UNEMP:       { fredId: 'UNRATE',    name: 'Unemployment Rate',          unit: '%',      frequency: 'monthly' },
  GDP:         { fredId: 'GDPC1',     name: 'Real GDP',                   unit: 'B USD',  frequency: 'quarterly' },
  RETAILSALES: { fredId: 'RSAFS',     name: 'Retail Sales',               unit: 'M USD',  frequency: 'monthly' },
};

interface FredObsResp {
  observations?: Array<{ date: string; value: string }>;
  error_code?: number;
  error_message?: string;
}

export async function getMacroSeries(id: string): Promise<MacroSeriesResult> {
  const k = key();
  if (!k) throw new Error('FRED: FRED_API_KEY env var not set');

  const spec = FRED_SERIES[id.toUpperCase()];
  if (!spec) throw new Error(`FRED: unknown series id "${id}"`);

  const params = new URLSearchParams({
    series_id: spec.fredId,
    api_key: k,
    file_type: 'json',
    sort_order: 'asc',
    observation_start: '1990-01-01',
  });

  const resp = await getJson<FredObsResp>('fred', `${BASE}/series/observations?${params}`);

  if (resp.error_code) {
    throw new Error(`FRED: ${resp.error_message ?? `error ${resp.error_code}`}`);
  }

  const rawPoints = (resp.observations ?? [])
    .filter((o) => o.value !== '.' && o.value !== '')
    .map((o) => ({ ts: Date.parse(o.date), value: Number(o.value) }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value));

  // For INFLATION, compute year-over-year % change from CPIAUCSL
  let points = rawPoints;
  if (id.toUpperCase() === 'INFLATION' && rawPoints.length > 12) {
    points = rawPoints.slice(12).map((p, i) => ({
      ts: p.ts,
      value: ((p.value - rawPoints[i].value) / rawPoints[i].value) * 100,
    })).filter((p) => Number.isFinite(p.value));
  }

  return {
    id,
    name: spec.name,
    unit: spec.unit,
    frequency: spec.frequency,
    points,
  };
}

export function isSupported(id: string): boolean {
  return id.toUpperCase() in FRED_SERIES;
}
