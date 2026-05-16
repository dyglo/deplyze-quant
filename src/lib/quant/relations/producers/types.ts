/**
 * Relations Map — producer contract.
 *
 * A *producer* derives a slice of the relationship graph (specific edge
 * kinds, sometimes additional nodes) from a `ProducerContext`. Composing
 * a Relations Map snapshot means running multiple producers and merging
 * their outputs.
 *
 * Strict-data policy: a producer must emit `skipped` rationale for every
 * relationship it considered but could not derive (insufficient overlap,
 * missing series, etc.). It must NEVER fabricate edge strengths.
 */
import type { OHLCVBar } from '../../../../types';
import type { RelationsEdge, RelationsNode } from '../types';

export interface ProducerContext {
  focal: { symbol: string; bars: OHLCVBar[] };
  peers: Record<string, OHLCVBar[]>;
  benchmarks: Record<string, OHLCVBar[]>;
  macros: Record<string, OHLCVBar[]>;
  windowDays: number;
  /** When set, producers should derive relationships using only bars
   *  whose timestamp is ≤ this value. Powers the replay timeline. */
  asOfTs?: number;
}

/** Slice a chronological bar series to bars with ts ≤ asOf. */
export function sliceAsOf(bars: OHLCVBar[], asOf?: number): OHLCVBar[] {
  if (asOf == null) return bars;
  const i = bars.findIndex((b) => b.ts > asOf);
  return i === -1 ? bars : bars.slice(0, i);
}

export interface ProducerOutput {
  producer: string;
  nodes: RelationsNode[];
  edges: RelationsEdge[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface Producer {
  id: string;
  run(ctx: ProducerContext): ProducerOutput;
}

/** Stable, orientation-independent edge id. */
export function edgeId(kind: RelationsEdge['kind'], a: string, b: string): string {
  const [s, t] = a < b ? [a, b] : [b, a];
  return `${kind}:${s}-${t}`;
}
