import { fetchMacroSeries, fetchFxDaily, listMacroSeries } from '../services/macroService';
import { useSWR } from './useSWR';

export function useMacroSeries(id: string | null) {
  return useSWR(
    () => (id ? fetchMacroSeries(id) : Promise.resolve(null)),
    [id],
    { cacheKey: id ? `GET /macro/series/${encodeURIComponent(id)}` : undefined },
  );
}

export function useFxDaily(from: string | null, to: string | null) {
  return useSWR(
    () => (from && to ? fetchFxDaily(from, to) : Promise.resolve(null)),
    [from, to],
    {
      cacheKey: from && to ? `GET /macro/fx?from=${from}&to=${to}` : undefined,
    },
  );
}

export function useMacroSeriesList() {
  return useSWR(() => listMacroSeries(), [], { cacheKey: 'GET /macro/series' });
}
