import { fetchInstrumentIntelligence } from '../services/instrumentService';
import { useSWR } from './useSWR';

export function useInstrumentIntelligence(symbol: string | null) {
  return useSWR(
    () => (symbol ? fetchInstrumentIntelligence(symbol) : Promise.resolve(null)),
    [symbol],
    { cacheKey: symbol ? `GET /instruments/${encodeURIComponent(symbol)}/intelligence` : undefined },
  );
}
