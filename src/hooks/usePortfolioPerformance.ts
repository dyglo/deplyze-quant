/**
 * usePortfolioPerformance — fetches OHLCV for holdings + benchmark,
 * then runs the quant engine to produce portfolio visualizations.
 */

import { useState, useEffect, useRef } from 'react';
import { fetchOHLCV } from '../services/marketService';
import {
  logReturns,
  rebase100,
  cumulativeLogReturns,
} from '../lib/quant/returns';
import { rollingAnnualisedVol } from '../lib/quant/volatility';
import { maxDrawdown as computeMaxDrawdown } from '../lib/quant/risk';
import { portfolioReturnSeries } from '../lib/quant/portfolio';
import type { OHLCVBar } from '../types';

export interface PortfolioPerformanceSeries {
  ts: number;
  portfolio: number;        // rebased to 100
  benchmark: number;        // rebased to 100
}

export interface PortfolioVolSeries {
  ts: number;
  vol: number;              // annualised, as %
  benchmarkVol?: number;
}

export interface DrawdownSeries {
  ts: number;
  drawdown: number;         // negative fraction (-0.23 = -23%)
  benchmarkDrawdown?: number;
}

export interface PortfolioPerformanceResult {
  performanceSeries: PortfolioPerformanceSeries[];
  volSeries: PortfolioVolSeries[];
  drawdownSeries: DrawdownSeries[];
  maxDrawdown: number;
  annReturn: number;        // fraction
  annVol: number;           // fraction
  totalReturn: number;      // fraction
  sharpe: number;
  benchmarkTotalReturn: number;
  loading: boolean;
  error: string | null;
}

const EMPTY: PortfolioPerformanceResult = {
  performanceSeries: [],
  volSeries: [],
  drawdownSeries: [],
  maxDrawdown: 0,
  annReturn: 0,
  annVol: 0,
  totalReturn: 0,
  sharpe: 0,
  benchmarkTotalReturn: 0,
  loading: false,
  error: null,
};

function closes(bars: OHLCVBar[]): number[] {
  return bars.map(b => b.close);
}

function timestamps(bars: OHLCVBar[]): number[] {
  return bars.map(b => b.ts);
}

/** Align multiple close series to the shortest common length (tail-aligned). */
function alignSeries(arrays: number[][]): number[][] {
  const minLen = Math.min(...arrays.map(a => a.length));
  return arrays.map(a => a.slice(-minLen));
}

export function usePortfolioPerformance(
  symbols: string[],
  weights: Record<string, number>,
  benchmarkId: string,
  windowDays = 252,
): PortfolioPerformanceResult {
  const [result, setResult] = useState<PortfolioPerformanceResult>(EMPTY);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    if (symbols.length === 0) {
      setResult(EMPTY);
      return;
    }

    abortRef.current = false;
    setResult(prev => ({ ...prev, loading: true, error: null }));

    const run = async () => {
      try {
        // Fetch all symbols + benchmark in parallel
        const toFetch = [...new Set([...symbols, benchmarkId])];
        const responses = await Promise.allSettled(
          toFetch.map(sym => fetchOHLCV(sym, '1day', windowDays))
        );

        if (abortRef.current) return;

        const barMap: Record<string, OHLCVBar[]> = {};
        toFetch.forEach((sym, i) => {
          const r = responses[i];
          if (r.status === 'fulfilled' && r.value.bars.length >= 10) {
            barMap[sym] = r.value.bars;
          }
        });

        const validSymbols = symbols.filter(s => barMap[s]);
        if (validSymbols.length === 0) {
          setResult({ ...EMPTY, error: 'Insufficient historical data for holdings.' });
          return;
        }

        // Align all series
        const allSeries = validSymbols.map(s => closes(barMap[s]));
        const [aligned, benchAligned] = (() => {
          const bm = barMap[benchmarkId];
          if (!bm) return [alignSeries(allSeries), null];
          const all = alignSeries([...allSeries, closes(bm)]);
          return [all.slice(0, -1), all[all.length - 1]];
        })();

        // Use longest available timestamp source
        const refBars = barMap[validSymbols[0]];
        const refTs = timestamps(refBars).slice(-aligned[0].length);

        // Compute log returns per holding
        const logReturnSeries = aligned.map(s => logReturns(s));

        // Effective weights for valid symbols only
        const totalW = validSymbols.reduce((s, sym) => s + (weights[sym] ?? 0), 0);
        const effectiveW = validSymbols.map(sym =>
          totalW > 0 ? (weights[sym] ?? 0) / totalW : 1 / validSymbols.length
        );

        // Portfolio log return series
        const portLogReturns = portfolioReturnSeries(logReturnSeries, effectiveW);
        const portCurve = rebase100(cumulativeLogReturns(portLogReturns));

        // Benchmark curve
        const bmLogReturns = benchAligned ? logReturns(benchAligned) : portLogReturns.map(() => 0);
        const bmCurve = benchAligned ? rebase100(cumulativeLogReturns(bmLogReturns)) : portCurve.map(() => 100);

        // Align curve lengths
        const len = Math.min(portCurve.length, bmCurve.length, refTs.length);
        const tSlice = refTs.slice(-len);
        const pSlice = portCurve.slice(-len);
        const bSlice = bmCurve.slice(-len);

        // Performance series
        const performanceSeries: PortfolioPerformanceSeries[] = tSlice.map((ts, i) => ({
          ts,
          portfolio: pSlice[i] ?? 100,
          benchmark: bSlice[i] ?? 100,
        }));

        // Rolling volatility (21-day window) — rollingAnnualisedVol already returns %
        const rollVolPort = rollingAnnualisedVol(portLogReturns, 21);
        const rollVolBm = benchAligned ? rollingAnnualisedVol(bmLogReturns, 21) : null;
        const volOffset = portLogReturns.length - len;
        const volSeries: PortfolioVolSeries[] = tSlice.map((ts, i) => ({
          ts,
          vol: rollVolPort[i + volOffset] ?? 0,
          benchmarkVol: rollVolBm ? (rollVolBm[i + (bmLogReturns.length - len)] ?? undefined) : undefined,
        })).filter(v => v.vol > 0);

        // Build continuous drawdown series from cumulative log returns
        const ddSeries: DrawdownSeries[] = [];
        let cumulPort = 0;
        let peakPort = 0;
        let cumulBm = 0;
        let peakBm = 0;

        for (let i = 0; i < len; i++) {
          const offset = portLogReturns.length - len;
          cumulPort += portLogReturns[i + offset] ?? 0;
          if (cumulPort > peakPort) peakPort = cumulPort;
          const dd = Math.exp(cumulPort - peakPort) - 1;

          let bmDd: number | undefined;
          if (benchAligned) {
            cumulBm += bmLogReturns[i + (bmLogReturns.length - len)] ?? 0;
            if (cumulBm > peakBm) peakBm = cumulBm;
            bmDd = Math.exp(cumulBm - peakBm) - 1;
          }

          ddSeries.push({ ts: tSlice[i], drawdown: dd, benchmarkDrawdown: bmDd });
        }

        // Summary metrics
        const mdd = computeMaxDrawdown(portLogReturns).mdd;
        const totalReturn = Math.exp(portLogReturns.reduce((a, b) => a + b, 0)) - 1;
        const annVol = Math.sqrt(portLogReturns.reduce((s, r) => s + r * r, 0) / Math.max(1, portLogReturns.length) * 252);
        const portMean = portLogReturns.reduce((a, b) => a + b, 0) / Math.max(1, portLogReturns.length);
        const annReturn = Math.exp(portMean * 252) - 1;
        const sharpe = annVol > 0 ? annReturn / annVol : 0;
        const bmTotalReturn = bmLogReturns.length > 0 ? Math.exp(bmLogReturns.reduce((a, b) => a + b, 0)) - 1 : 0;

        if (abortRef.current) return;

        setResult({
          performanceSeries,
          volSeries,
          drawdownSeries: ddSeries,
          maxDrawdown: mdd ?? 0,
          annReturn,
          annVol,
          totalReturn,
          sharpe,
          benchmarkTotalReturn: bmTotalReturn,
          loading: false,
          error: null,
        });
      } catch (err: unknown) {
        if (abortRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to load performance data';
        setResult(prev => ({ ...prev, loading: false, error: msg }));
      }
    };

    run();
    return () => { abortRef.current = true; };
  }, [symbols.join(','), JSON.stringify(weights), benchmarkId, windowDays]);

  return result;
}
