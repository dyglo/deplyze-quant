/**
 * Focal-symbol context loader.
 *
 * Parallel-fetches OHLCV for the focal + its peer group + benchmarks +
 * macro proxies. Strict: missing/empty series are reported in `skipped`,
 * never substituted.
 */
import { fetchOHLCV } from '../../../services/marketService';
import type { OHLCVBar } from '../../../types';
import { benchmarksFor, MACRO_PROXIES, peersOf } from './taxonomy';
import type { ProducerContext } from './producers/types';

interface LoadOpts {
  windowDays: number;
  historyBars?: number;
  peerCap?: number;
}

const DEFAULT_HISTORY = 260;
const TIMEFRAME = '1day' as const;

export interface FocalContextLoad {
  context: ProducerContext;
  skipped: Array<{ id: string; reason: string }>;
  asOf: number;
}

export async function buildFocalContext(symbol: string, opts: LoadOpts): Promise<FocalContextLoad> {
  const focalSymbol = symbol.toUpperCase();
  const history = opts.historyBars ?? DEFAULT_HISTORY;
  const peers = peersOf(focalSymbol, opts.peerCap ?? 6);
  const benchmarks = benchmarksFor(focalSymbol);
  const macros = Array.from(MACRO_PROXIES);

  const wanted = unique([focalSymbol, ...peers, ...benchmarks, ...macros]);
  const fetched = await Promise.all(
    wanted.map(async (s): Promise<[string, OHLCVBar[] | null, string | null]> => {
      try {
        const r = await fetchOHLCV(s, TIMEFRAME, history);
        return [s, r.bars ?? [], null];
      } catch (e) {
        return [s, null, (e as Error).message ?? 'fetch failed'];
      }
    }),
  );

  const skipped: FocalContextLoad['skipped'] = [];
  const series: Record<string, OHLCVBar[]> = {};
  for (const [s, bars, err] of fetched) {
    if (err || !bars || bars.length === 0) {
      skipped.push({ id: s, reason: err ?? 'no bars returned' });
      continue;
    }
    series[s] = bars;
  }

  const focal = series[focalSymbol];
  if (!focal) {
    throw new Error(`Cannot derive relations: focal series '${focalSymbol}' is unavailable.`);
  }

  const filterMap = (syms: string[]): Record<string, OHLCVBar[]> => {
    const out: Record<string, OHLCVBar[]> = {};
    for (const s of syms) if (series[s]) out[s] = series[s];
    return out;
  };

  const context: ProducerContext = {
    focal: { symbol: focalSymbol, bars: focal },
    peers: filterMap(peers),
    benchmarks: filterMap(benchmarks),
    macros: filterMap(macros),
    windowDays: opts.windowDays,
  };

  const asOf = lastBarTs(focal);
  return { context, skipped, asOf };
}

function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
function lastBarTs(bars: OHLCVBar[]): number {
  if (bars.length === 0) return Date.now();
  const last = bars[bars.length - 1];
  return typeof last.ts === 'number' ? last.ts : Date.now();
}
