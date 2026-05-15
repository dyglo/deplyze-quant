import { fetchProviderHealth } from '../services/providerService';
import { useSWR } from './useSWR';

// Note: no cacheKey here — fetchProviderHealth() transforms the raw gateway
// response into ProviderStatus[], so sharing the raw gatewayClient cache key
// would poison the initial state with the un-processed object shape.
export function useProviderHealth() {
  return useSWR(() => fetchProviderHealth(), []);
}
