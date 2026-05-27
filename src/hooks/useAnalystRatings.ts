import { fetchAnalystRatings } from '../services/instrumentService';
import { useSWR } from './useSWR';

export function useAnalystRatings(symbol: string | null) {
  return useSWR(
    () => (symbol ? fetchAnalystRatings(symbol) : Promise.resolve(null)),
    [symbol],
    { cacheKey: symbol ? `GET /fundamentals/${encodeURIComponent(symbol)}/analyst` : undefined },
  );
}
