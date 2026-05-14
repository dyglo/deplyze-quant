import { gatewayGet, ClientTTL } from './gatewayClient';
import type { MacroSeries } from '../types';

export async function fetchMacroSeries(id: string): Promise<MacroSeries> {
  const r = await gatewayGet<{
    id: string; name: string; unit: string; frequency: string;
    points: Array<{ ts: number; value: number }>;
  }>(`/macro/series/${encodeURIComponent(id)}`, undefined, ClientTTL.macro_series);
  return { ...r, source: 'alpha_vantage' } as MacroSeries;
}

export async function listMacroSeries(): Promise<string[]> {
  const r = await gatewayGet<{ ids: string[] }>('/macro/series', undefined, ClientTTL.macro_series);
  return r.ids;
}

export async function fetchFxDaily(from: string, to: string) {
  return gatewayGet<{ from: string; to: string; bars: Array<{
    ts: number; open: number; high: number; low: number; close: number;
  }> }>('/macro/fx', { from, to }, ClientTTL.ohlcv_daily);
}
