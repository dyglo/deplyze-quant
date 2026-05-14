import { fetchProviderHealth } from '../services/providerService';
import { useSWR } from './useSWR';

export function useProviderHealth() {
  return useSWR(() => fetchProviderHealth(), [], { cacheKey: 'GET /providers/health' });
}
