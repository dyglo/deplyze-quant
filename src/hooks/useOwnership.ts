import { fetchOwnership } from '../services/instrumentService';
import { useSWR } from './useSWR';

export function useOwnership(symbol: string | null) {
  return useSWR(
    () => (symbol ? fetchOwnership(symbol) : Promise.resolve(null)),
    [symbol],
    { cacheKey: symbol ? `GET /fundamentals/${encodeURIComponent(symbol)}/ownership` : undefined },
  );
}
