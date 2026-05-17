import { useSWR } from './useSWR';
import {
  fetchWorldEquityQuotes,
  fetchSectorQuotes,
  fetchCountryETFQuotes,
  fetchCommodityQuotes,
  fetchFXQuotes,
  fetchYieldCurve,
} from '../services/dashboardService';

export function useWorldEquity() {
  return useSWR(
    () => fetchWorldEquityQuotes(),
    [],
    { cacheKey: 'GET /dashboard/world-equity' },
  );
}

export function useSectorDashboard() {
  return useSWR(
    () => fetchSectorQuotes(),
    [],
    { cacheKey: 'GET /dashboard/us-sectors' },
  );
}

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
