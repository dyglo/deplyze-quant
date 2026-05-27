import { fetchFinancials } from '../services/instrumentService';
import { useSWR } from './useSWR';

export function useInstrumentFinancials(
  symbol: string | null,
  period: 'annual' | 'quarter' = 'annual',
) {
  return useSWR(
    () => (symbol ? fetchFinancials(symbol, period) : Promise.resolve(null)),
    [symbol, period],
    { cacheKey: symbol ? `GET /fundamentals/${encodeURIComponent(symbol)}/financials?period=${period}` : undefined },
  );
}
