/**
 * Yahoo Finance chart adapter — no-key fallback for public index OHLCV.
 *
 * This is intentionally narrow: only the headline index symbols used by Market
 * Home charts. It keeps charts populated when paid providers hit daily quotas.
 */

import { getJson } from './http';
import type { OHLCVBar } from './twelvedata';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const YAHOO_INDEX_SYMBOLS: Record<string, string> = {
  SPX: '^GSPC',
  NDX: '^NDX',
  DJI: '^DJI',
};

function toYahooSymbol(symbol: string): string | null {
  return YAHOO_INDEX_SYMBOLS[symbol.trim().toUpperCase()] ?? null;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

export function isIndexSupported(symbol: string): boolean {
  return Boolean(toYahooSymbol(symbol));
}

export async function getIndexDailyBars(
  symbol: string,
  outputsize: number,
  signal?: AbortSignal,
): Promise<OHLCVBar[]> {
  const yahooSymbol = toYahooSymbol(symbol);
  if (!yahooSymbol) throw new Error(`Yahoo: unsupported index symbol ${symbol}`);

  const range = outputsize <= 22 ? '1mo'
    : outputsize <= 66 ? '3mo'
      : outputsize <= 130 ? '6mo'
        : '1y';
  const url = `${BASE}/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d`;
  const resp = await getJson<YahooChartResponse>('yahoo', url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const error = resp.chart?.error;
  if (error) throw new Error(`Yahoo: ${error.description ?? error.code ?? 'chart error'}`);

  const result = resp.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps.length || !quote) throw new Error('Yahoo: empty response');

  const bars = timestamps.map((ts, i) => ({
    ts: ts * 1000,
    open: Number(quote.open?.[i] ?? quote.close?.[i]),
    high: Number(quote.high?.[i] ?? quote.close?.[i]),
    low: Number(quote.low?.[i] ?? quote.close?.[i]),
    close: Number(quote.close?.[i]),
    volume: Number(quote.volume?.[i] ?? 0),
  })).filter((b) =>
    Number.isFinite(b.ts) &&
    Number.isFinite(b.open) &&
    Number.isFinite(b.high) &&
    Number.isFinite(b.low) &&
    Number.isFinite(b.close),
  );

  if (!bars.length) throw new Error('Yahoo: no valid bars');
  return bars.slice(-outputsize);
}
