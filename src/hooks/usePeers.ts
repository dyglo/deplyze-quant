import { fetchPeers } from '../services/instrumentService';
import { useSWR } from './useSWR';

export function usePeers(symbol: string | null) {
  return useSWR(
    () => (symbol ? fetchPeers(symbol) : Promise.resolve(null)),
    [symbol],
    { cacheKey: symbol ? `GET /fundamentals/${encodeURIComponent(symbol)}/peers` : undefined },
  );
}
