/**
 * Technical indicator computations for the Instrument page.
 *
 * All functions are pure, operate on close-price arrays (or OHLCVBar[]),
 * and return null / empty when input is insufficient.
 *
 * Conventions: no lookahead, values computed on the final bar only.
 */

import type { OHLCVBar } from '../../types';
import { sma } from './primitives';

// ─── EMA ─────────────────────────────────────────────────────────────────────

/** Exponential moving average. Returns full series. */
export function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  // seed with SMA of first `period` values
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function lastEma(values: number[], period: number): number | null {
  const series = ema(values, period);
  return series.length ? series[series.length - 1] : null;
}

// ─── RSI ─────────────────────────────────────────────────────────────────────

export interface RSIResult {
  value: number;        // 0–100
  signal: 'buy' | 'neutral' | 'sell';
}

/** Wilder RSI(14). Returns null if insufficient data. */
export function rsi(closes: number[], period = 14): RSIResult | null {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return { value: 100, signal: 'sell' };
  const rs = avgGain / avgLoss;
  const value = 100 - 100 / (1 + rs);
  const signal: RSIResult['signal'] = value > 70 ? 'sell' : value < 30 ? 'buy' : 'neutral';
  return { value, signal };
}

// ─── MACD ─────────────────────────────────────────────────────────────────────

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  crossSignal: 'buy' | 'neutral' | 'sell';
}

/** MACD(12, 26, 9). Returns null if insufficient data. */
export function macd(closes: number[], fast = 12, slow = 26, signal = 9): MACDResult | null {
  if (closes.length < slow + signal) return null;
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  // Align: slowEma starts at index slow-1, fastEma at fast-1
  const macdLine: number[] = [];
  const offset = slow - fast;
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  const signalLine = ema(macdLine, signal);
  if (!signalLine.length) return null;
  const macdVal = macdLine[macdLine.length - 1];
  const signalVal = signalLine[signalLine.length - 1];
  const hist = macdVal - signalVal;
  const prevHist = macdLine.length > signal ? (macdLine[macdLine.length - 2] - (signalLine[signalLine.length - 2] ?? signalVal)) : 0;
  const crossSignal: MACDResult['crossSignal'] =
    hist > 0 && prevHist <= 0 ? 'buy' :
    hist < 0 && prevHist >= 0 ? 'sell' :
    hist > 0 ? 'buy' :
    hist < 0 ? 'sell' : 'neutral';
  return { macd: macdVal, signal: signalVal, histogram: hist, crossSignal };
}

// ─── Stochastic %K/%D ────────────────────────────────────────────────────────

export interface StochasticResult {
  k: number;  // 0–100
  d: number;
  signal: 'buy' | 'neutral' | 'sell';
}

/** Stochastic Oscillator (14,3,3). */
export function stochastic(bars: OHLCVBar[], kPeriod = 14, dPeriod = 3): StochasticResult | null {
  if (bars.length < kPeriod + dPeriod) return null;
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    const window = bars.slice(i - kPeriod + 1, i + 1);
    const low = Math.min(...window.map(b => b.low));
    const high = Math.max(...window.map(b => b.high));
    const c = bars[i].close;
    kValues.push(high === low ? 50 : ((c - low) / (high - low)) * 100);
  }
  // Smooth %K with dPeriod SMA
  const kSmoothed = sma(kValues, 3);
  const dLine = sma(kSmoothed, dPeriod);
  if (!kSmoothed.length || !dLine.length) return null;
  const k = kSmoothed[kSmoothed.length - 1];
  const d = dLine[dLine.length - 1];
  const signal: StochasticResult['signal'] =
    k > 80 && d > 80 ? 'sell' :
    k < 20 && d < 20 ? 'buy' :
    k > d ? 'buy' : k < d ? 'sell' : 'neutral';
  return { k, d, signal };
}

// ─── Bollinger Bands ─────────────────────────────────────────────────────────

export interface BBResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number;  // 0 = at lower, 1 = at upper
  signal: 'buy' | 'neutral' | 'sell';
}

export function bollingerBands(closes: number[], period = 20, multiplier = 2): BBResult | null {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  const middle = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + multiplier * std;
  const lower = middle - multiplier * std;
  const current = closes[closes.length - 1];
  const bandwidth = std === 0 ? 0 : (upper - lower) / middle;
  const percentB = upper === lower ? 0.5 : (current - lower) / (upper - lower);
  const signal: BBResult['signal'] =
    current > upper ? 'sell' :
    current < lower ? 'buy' : 'neutral';
  return { upper, middle, lower, bandwidth, percentB, signal };
}

// ─── Williams %R ─────────────────────────────────────────────────────────────

export interface WilliamsRResult {
  value: number;  // -100 to 0
  signal: 'buy' | 'neutral' | 'sell';
}

export function williamsR(bars: OHLCVBar[], period = 14): WilliamsRResult | null {
  if (bars.length < period) return null;
  const window = bars.slice(-period);
  const high = Math.max(...window.map(b => b.high));
  const low = Math.min(...window.map(b => b.low));
  const close = bars[bars.length - 1].close;
  const value = high === low ? -50 : ((high - close) / (high - low)) * -100;
  const signal: WilliamsRResult['signal'] = value > -20 ? 'sell' : value < -80 ? 'buy' : 'neutral';
  return { value, signal };
}

// ─── SMA signal ──────────────────────────────────────────────────────────────

export interface SMASignal {
  period: number;
  value: number;
  signal: 'buy' | 'neutral' | 'sell';
}

export function smaSignals(closes: number[], periods: number[]): SMASignal[] {
  const current = closes[closes.length - 1];
  return periods.flatMap((p) => {
    const series = sma(closes, p);
    if (!series.length) return [];
    const value = series[series.length - 1];
    const diff = (current - value) / value;
    const signal: SMASignal['signal'] = Math.abs(diff) < 0.001 ? 'neutral' : current > value ? 'buy' : 'sell';
    return [{ period: p, value, signal }];
  });
}

// ─── EMA signal ──────────────────────────────────────────────────────────────

export interface EMASignal {
  period: number;
  value: number;
  signal: 'buy' | 'neutral' | 'sell';
}

export function emaSignals(closes: number[], periods: number[]): EMASignal[] {
  const current = closes[closes.length - 1];
  return periods.flatMap((p) => {
    const val = lastEma(closes, p);
    if (val == null) return [];
    const diff = (current - val) / val;
    const signal: EMASignal['signal'] = Math.abs(diff) < 0.001 ? 'neutral' : current > val ? 'buy' : 'sell';
    return [{ period: p, value: val, signal }];
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export type TechSignal = 'buy' | 'neutral' | 'sell';

export interface TechnicalSummary {
  buy: number;
  neutral: number;
  sell: number;
  overall: TechSignal;
}

export function summariseSignals(signals: TechSignal[]): TechnicalSummary {
  const buy = signals.filter(s => s === 'buy').length;
  const sell = signals.filter(s => s === 'sell').length;
  const neutral = signals.filter(s => s === 'neutral').length;
  const overall: TechSignal = buy > sell + neutral / 2 ? 'buy' : sell > buy + neutral / 2 ? 'sell' : 'neutral';
  return { buy, neutral, sell, overall };
}
