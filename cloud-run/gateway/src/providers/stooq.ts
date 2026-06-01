/**
 * Stooq adapter — no-key daily OHLCV fallback for US equities and ETFs.
 *
 * Stooq is not used for live quotes. It is a last-resort historical daily
 * source so production charts can degrade to cached/delayed bars when paid
 * providers are quota-limited.
 */

import { getText } from './http';
import type { OHLCVBar } from './twelvedata';

export function isConfigured(): boolean {
  // Stooq's daily CSV endpoint is usable without a key. Some deployments may
  // provide STOOQ_API_KEY, but lack of that optional key must not disable this
  // no-key historical fallback.
  return true;
}

function fmtDate(date: string): string {
  return date.replaceAll('-', '');
}

function toStooqSymbol(symbol: string): string | null {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)) return null;
  return `${s.replaceAll('.', '-').toLowerCase()}.us`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export async function getDailyBars(
  symbol: string,
  from: string,
  to: string,
  limit: number,
  signal?: AbortSignal,
): Promise<OHLCVBar[]> {
  const stooqSymbol = toStooqSymbol(symbol);
  if (!stooqSymbol) throw new Error(`Stooq: unsupported symbol ${symbol}`);
  const apiKey = process.env.STOOQ_API_KEY;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${fmtDate(from)}&d2=${fmtDate(to)}&i=d${apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : ''}`;
  const csv = await getText('stooq', url, { signal });
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || /^no data/i.test(lines[0])) throw new Error('Stooq: empty response');

  const bars = lines.slice(1).map((line) => {
    const [date, open, high, low, close, volume] = parseCsvLine(line);
    return {
      ts: Date.parse(date),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    };
  }).filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close));

  if (!bars.length) throw new Error('Stooq: no valid bars');
  return bars.slice(-limit);
}
