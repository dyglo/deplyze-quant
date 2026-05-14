import { gatewayGet } from './gatewayClient';
import type { ProviderId } from '../types';

export interface ProviderStatus {
  id: ProviderId;
  configured: boolean;
}

export async function fetchProviderHealth(): Promise<ProviderStatus[]> {
  const r = await gatewayGet<{ providers: ProviderStatus[] }>('/providers/health');
  return r.providers;
}
