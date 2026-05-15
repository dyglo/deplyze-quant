import { gatewayGet } from './gatewayClient';
import type { ProviderId } from '../types';
import type { ProviderHealthReport } from '../lib/market-data/contracts';

export interface ProviderStatus {
  id: ProviderId | string;
  configured: boolean;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailureMessage?: string;
  latencyMs?: number;
  consecutiveFailures?: number;
}

export async function fetchProviderHealth(): Promise<ProviderStatus[]> {
  const r = await gatewayGet<unknown>('/providers/health');

  // Gateway may return an array directly or wrap it as { providers: [...] }
  if (Array.isArray(r)) return r as ProviderStatus[];

  const obj = r as Record<string, unknown> | null | undefined;
  if (!obj) return [];

  if (Array.isArray(obj.providers)) return obj.providers as ProviderStatus[];

  if (obj.providers && typeof obj.providers === 'object' && !Array.isArray(obj.providers)) {
    return Object.entries(obj.providers as Record<string, unknown>).map(([id, v]) => ({
      id: id as ProviderId,
      configured: Boolean((v as Record<string, unknown>)?.configured ?? false),
      lastSuccessAt: (v as Record<string, unknown>)?.lastSuccessAt as number | undefined,
      lastFailureAt: (v as Record<string, unknown>)?.lastFailureAt as number | undefined,
      lastFailureMessage: (v as Record<string, unknown>)?.lastFailureMessage as string | undefined,
      latencyMs: (v as Record<string, unknown>)?.latencyMs as number | undefined,
      consecutiveFailures: (v as Record<string, unknown>)?.consecutiveFailures as number | undefined,
    }));
  }

  return [];
}

export async function fetchProviderHealthReport(): Promise<ProviderHealthReport> {
  const r = await gatewayGet<{
    providers: ProviderStatus[];
    routing?: Record<string, string[]>;
  }>('/providers/health');

  return {
    providers: Array.isArray(r.providers) ? r.providers : [],
    routing: r.routing ?? {},
    asOf: Date.now(),
  };
}
