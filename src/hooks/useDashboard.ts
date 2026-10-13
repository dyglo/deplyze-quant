import { useSWR } from './useSWR';
import {
  fetchCountryETFQuotes,
  fetchCommodityQuotes,
  fetchFXQuotes,
  fetchYieldCurve,
} from '../services/dashboardService';

export function useCountryETFs() {
  return useSWR(
    () => fetchCountryETFQuotes(),
    [],
    { cacheKey: 'GET /dashboard/countries' },
  );
}

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
