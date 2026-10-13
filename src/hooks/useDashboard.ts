import { useSWR } from './useSWR';
import {
  fetchCommodityQuotes,
  fetchFXQuotes,
  fetchYieldCurve,
} from '../services/dashboardService';

export function useCommodityDashboard() {
  return useSWR(
    () => fetchCommodityQuotes(),
    [],
    { cacheKey: 'GET /dashboard/commodities' },
  );
}

export function useFXDashboard() {
  return useSWR(
    () => fetchFXQuotes(),
    [],
    { cacheKey: 'GET /dashboard/fx' },
  );
}

export function useYieldCurve() {
  return useSWR(
    () => fetchYieldCurve(),
    [],
    { cacheKey: 'GET /dashboard/yield-curve' },
  );
}
