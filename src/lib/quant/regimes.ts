/**
 * Market regime classification.
 *
 * Fuses volatility state, trend stability, momentum persistence, and (when a
 * benchmark return series is supplied) risk-on/off alignment into an
 * institutional-style composite regime with confidence + narrative.
 *
 * Strict-data policy: returns `null` if the input bar series is too short to
 * produce statistically meaningful state. No synthetic fallbacks.
 */

import type { OHLCVBar } from '../../types';
import { closes, logReturns } from './returns';
import { volatilityRegime, type VolatilityRegime } from './volatility';
import { trendLabel, trendStability, momentumPersistence } from './momentum';
import { mean, stdev } from './primitives';
import { beta, hitRatio } from './benchmark';

export type TrendRegime = 'strong-up' | 'up' | 'range' | 'down' | 'strong-down';
export type RiskRegime = 'risk-on' | 'risk-off' | 'neutral';

export interface MarketRegime {
  asOf: number;
  symbol: string;
  trend: TrendRegime;
  trendStability: number;          // 0..1
  momentumPersistence: number;     // 0..1
  volatility: VolatilityRegime;
  // Cross-asset context (only populated when benchmarkReturns provided)
  beta?: number;
  riskAlignment?: number;          // -1..1
  riskRegime?: RiskRegime;
  // Composite
  label: string;
  description: string;
  confidence: number;              // 0..1
  tags: string[];
}

function mapTrendLabel(t: ReturnType<typeof trendLabel>['label']): TrendRegime {
  switch (t) {
    case 'strong-up':   return 'strong-up';
    case 'up':          return 'up';
    case 'strong-down': return 'strong-down';
    case 'down':        return 'down';
    default:            return 'range';
  }
}

function buildLabel(
  trend: TrendRegime,
  vol: VolatilityRegime,
  momPersist: number,
  riskRegime?: RiskRegime,
): string {
  const directional =
    trend === 'strong-up' || trend === 'up' ? 'trending up' :
    trend === 'strong-down' || trend === 'down' ? 'trending down' :
    'range-bound';
  const volPhrase =
    vol.state === 'compressed' ? 'compressed volatility' :
    vol.state === 'low' ? 'low realised volatility' :
    vol.state === 'elevated' ? 'elevated volatility' :
    vol.state === 'expanded' ? 'expanded volatility' :
    'normal volatility';
  const momPhrase =
    momPersist > 0.7 ? 'elevated momentum persistence' :
    momPersist < 0.4 ? 'weak momentum persistence' :
    'moderate momentum persistence';
  const riskPhrase = riskRegime && riskRegime !== 'neutral' ? `${riskRegime} ` : '';
  return `${riskPhrase}${directional} regime with ${momPhrase} and ${volPhrase}`;
}

function buildDescription(r: MarketRegime): string {
  const parts: string[] = [];
  parts.push(`${r.symbol}: ${r.label}.`);
  parts.push(
    `Volatility at the ${Math.round(r.volatility.percentileRank * 100)}th percentile of its rolling history, ` +
    `${r.volatility.trend}.`
  );
  parts.push(`Trend stability ${(r.trendStability * 100).toFixed(0)}%, momentum persistence ${(r.momentumPersistence * 100).toFixed(0)}%.`);
  if (r.beta != null && r.riskAlignment != null) {
    parts.push(`Beta vs benchmark ${r.beta.toFixed(2)}; risk alignment ${r.riskAlignment.toFixed(2)}.`);
  }
  return parts.join(' ');
}

/** Classify the current market regime for a symbol from its bar series.
 *
 *  @param bars              daily (or any-tf) OHLCV bars, oldest → newest
 *  @param opts.symbol       symbol label for the output (default 'series')
 *  @param opts.benchmarkReturns  aligned log-return series of a benchmark
 *                                (e.g. SPY). When supplied, beta and
 *                                risk-on/off are populated.
 *  @param opts.ppy          periods per year for vol annualisation
 *
 *  @returns MarketRegime or null when bars too short
 */
export function classifyMarketRegime(
  bars: OHLCVBar[],
  opts: { symbol?: string; benchmarkReturns?: number[]; ppy?: number } = {},
): MarketRegime | null {
  if (bars.length < 280) return null; // need long-window vol history
  const symbol = opts.symbol ?? 'series';
  const ppy = opts.ppy ?? 252;
  const cl = closes(bars);
  const lr = logReturns(cl);
  const vol = volatilityRegime(lr, 21, 252, ppy);
  if (!vol) return null;

  const tl = trendLabel(cl.slice(-60));
  const trend = mapTrendLabel(tl.label);
  const stab = trendStability(cl, 21, 60);
  const persist = momentumPersistence(cl, 21, 60);

  let b: number | undefined;
  let riskAlignment: number | undefined;
  let riskRegime: RiskRegime | undefined;
  if (opts.benchmarkReturns && opts.benchmarkReturns.length > 30) {
    const n = Math.min(lr.length, opts.benchmarkReturns.length);
    const aLr = lr.slice(-n);
    const bLr = opts.benchmarkReturns.slice(-n);
    b = beta(aLr, bLr);
    const hr = hitRatio(aLr, bLr);
    // Risk alignment: blends co-movement direction and outperformance frequency
    const benchTrendUp = mean(bLr.slice(-21)) > 0;
    const ourTrendUp   = mean(aLr.slice(-21)) > 0;
    // Map into -1..1
    const sameDir = benchTrendUp === ourTrendUp ? 1 : -1;
    const magnitude = (Math.abs(b) > 0.2 ? 1 : 0.5) * (hr - 0.5) * 2;
    riskAlignment = Math.max(-1, Math.min(1, sameDir * 0.5 + magnitude));
    if (benchTrendUp && b > 0.4) riskRegime = 'risk-on';
    else if (!benchTrendUp && b > 0.4) riskRegime = 'risk-off';
    else if (Math.abs(b) < 0.3) riskRegime = 'neutral';
    else riskRegime = benchTrendUp ? 'risk-on' : 'risk-off';
  }

  // Confidence: blend of stability + history length adequacy + |vol zscore| sanity bound.
  const sampleAdequacy = Math.min(1, bars.length / 504);  // 2 years saturates
  const baseConf = 0.4 + 0.3 * stab + 0.2 * sampleAdequacy + 0.1 * Math.min(1, Math.abs(vol.zScore) / 3);
  const confidence = Math.max(0, Math.min(1, baseConf));

  const asOf = bars[bars.length - 1].ts;
  const label = buildLabel(trend, vol, persist, riskRegime);

  const tags = [
    'regime',
    trend,
    `vol-${vol.state}`,
    `vol-${vol.trend}`,
    ...(riskRegime ? [riskRegime] : []),
  ];

  const partial: MarketRegime = {
    asOf,
    symbol,
    trend,
    trendStability: stab,
    momentumPersistence: persist,
    volatility: vol,
    beta: b,
    riskAlignment,
    riskRegime,
    label,
    description: '',
    confidence,
    tags,
  };
  partial.description = buildDescription(partial);
  return partial;
}

/** Compare two regime states and return a stable identity key for transition
 *  detection. Trend × vol-state × risk-regime form the composite state. */
export function regimeStateKey(r: MarketRegime): string {
  return [r.trend, r.volatility.state, r.riskRegime ?? 'na'].join('|');
}

/** Did the composite regime state change between two snapshots?
 *  Vol-trend transitions ('compressing' → 'expanding') alone are reported
 *  separately by the volatility-event constructor; this fn captures the
 *  bigger structural state shifts. */
export function regimeChanged(prev: MarketRegime, curr: MarketRegime): boolean {
  return regimeStateKey(prev) !== regimeStateKey(curr);
}

// Re-export the volatility regime helpers callers will commonly want alongside.
export { stdev, mean };
