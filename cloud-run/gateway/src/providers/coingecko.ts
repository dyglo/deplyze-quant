/**
 * CoinGecko adapter — free crypto OHLCV data, no API key required.
 * Free tier: ~10-30 req/min (public endpoints).
 * Docs: https://www.coingecko.com/api/documentation
 *
 * Used as the primary source for crypto OHLCV sparklines on the
 * Intelligence Terminal and InstrumentIntelligence pages.
 */

import { getJson } from './http';

const BASE = 'https://api.coingecko.com/api/v3';

// Maps our internal XX/YY symbol format → CoinGecko coin IDs.
const CRYPTO_ID_MAP: Record<string, string> = {
  'BTC/USD':   'bitcoin',
  'ETH/USD':   'ethereum',
  'SOL/USD':   'solana',
  'BNB/USD':   'binancecoin',
  'XRP/USD':   'ripple',
  'ADA/USD':   'cardano',
  'DOGE/USD':  'dogecoin',
  'AVAX/USD':  'avalanche-2',
  'MATIC/USD': 'matic-network',
  'DOT/USD':   'polkadot',
  'LINK/USD':  'chainlink',
  'UNI/USD':   'uniswap',
};

export interface OHLCVBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function isCryptoSupported(symbol: string): boolean {
  return symbol.toUpperCase() in CRYPTO_ID_MAP;
}

/**
 * Fetch OHLCV bars for a crypto pair from CoinGecko.
 * CoinGecko's /ohlc endpoint returns [timestamp, open, high, low, close].
 * Days: 1=48 bars (30min), 7=168 bars, 14=336 bars, 30=720, 90=90 daily, 180=180 daily, 365=365 daily
 */
export async function getCryptoOhlcvBars(
  symbol: string,
  outputsize = 60,
): Promise<OHLCVBar[]> {
  const coinId = CRYPTO_ID_MAP[symbol.toUpperCase()];
  if (!coinId) throw new Error(`CoinGecko: no mapping for symbol "${symbol}"`);

  // Choose days param based on outputsize
  let days: number;
  if (outputsize <= 48) days = 1;
  else if (outputsize <= 90) days = 90;
  else if (outputsize <= 180) days = 180;
  else days = 365;

  const url = `${BASE}/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`;
  const raw = await getJson<Array<[number, number, number, number, number]>>('coingecko', url);

  if (!Array.isArray(raw)) throw new Error('CoinGecko: unexpected response format');

  const bars: OHLCVBar[] = raw.map(([ts, open, high, low, close]) => ({
    ts, open, high, low, close, volume: 0,
  }));

  return bars.slice(-outputsize);
}
