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
    // Read body once as text, then attempt JSON parse — avoids "Body has already been read"
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    throw new ProviderError(provider, res.status, res.statusText, body);
  }

  return (await res.json()) as T;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
