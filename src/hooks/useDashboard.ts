import { useSWR } from './useSWR';
import {
  fetchCommodityQuotes,
  fetchYieldCurve,
} from '../services/dashboardService';

export function useCommodityDashboard() {
  return useSWR(
    () => fetchCommodityQuotes(),
    [],
    { cacheKey: 'GET /dashboard/commodities' },
  );
}

export function useYieldCurve() {
  return useSWR(
    () => fetchYieldCurve(),
    [],
    { cacheKey: 'GET /dashboard/yield-curve' },
  );
}
