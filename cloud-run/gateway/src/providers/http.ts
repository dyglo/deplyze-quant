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
  timeoutMs = Number(process.env.PROVIDER_HTTP_TIMEOUT_MS ?? 8_000),
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = init?.signal;
  const abort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener('abort', abort, { once: true });
  }

  const res = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  }).finally(() => {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abort);
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

export async function getText(
  provider: string,
  url: string,
  init?: RequestInit,
  timeoutMs = Number(process.env.PROVIDER_HTTP_TIMEOUT_MS ?? 8_000),
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = init?.signal;
  const abort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener('abort', abort, { once: true });
  }

  const res = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      Accept: 'text/csv,text/plain,*/*',
      ...(init?.headers ?? {}),
    },
  }).finally(() => {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abort);
  });

  const text = await res.text();
  if (!res.ok) {
    throw new ProviderError(provider, res.status, res.statusText, text.slice(0, 500));
  }

  return text;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
