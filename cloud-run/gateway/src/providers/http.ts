/**
 * http.ts — small fetch wrapper used by every provider adapter.
 */

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(`[${provider}] ${status} ${message}`);
  }
}

export async function getJson<T>(
  provider: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }
    throw new ProviderError(provider, res.status, res.statusText, body);
  }

  return (await res.json()) as T;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
