import { gatewayGet } from './gatewayClient';
import type { ProviderId } from '../types';

export interface ProviderStatus {
  id: ProviderId;
  configured: boolean;
}

export async function fetchProviderHealth(): Promise<ProviderStatus[]> {
  const r = await gatewayGet<unknown>('/providers/health');

  // Gateway may return an array directly or wrap it as { providers: [...] }
  if (Array.isArray(r)) return r as ProviderStatus[];

  const obj = r as Record<string, unknown> | null | undefined;
  if (!obj) return [];

  if (Array.isArray(obj.providers)) return obj.providers as ProviderStatus[];

  // Fallback: providers returned as an id-keyed object { finnhub: { configured: true }, ... }
  if (obj.providers && typeof obj.providers === 'object' && !Array.isArray(obj.providers)) {
    return Object.entries(obj.providers as Record<string, unknown>).map(([id, v]) => ({
      id: id as ProviderId,
      configured: Boolean((v as Record<string, unknown>)?.configured ?? false),
    }));
  }

  return [];
}
