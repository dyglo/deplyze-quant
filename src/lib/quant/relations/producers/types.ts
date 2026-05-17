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
import type { QuantArtifactBase } from '../../artifacts';
import type { RelationsEdge, RelationsNode } from '../types';

/** V3 Phase 2 — refinery-sourced context fragments. */
export interface FilingContext {
  /** SEC filing identifier (accession number). */
  id: string;
  /** Stock symbol the filing belongs to (uppercase). */
  symbol: string;
  /** Form type (10-K, 10-Q, 8-K, …). */
  formType: string;
  /** Filing date (epoch ms). */
  ts: number;
  /** Optional human title for the relationship card. */
  title?: string;
  /** Optional novelty/urgency score (0..1) — drives edge strength. */
  novelty?: number;
}

export interface MacroRegimeContext {
  /** Regime kind (liquidity / inflation / rates / growth). */
  kind: 'liquidity_regime' | 'inflation_regime' | 'rates_regime' | 'growth_regime';
  /** Regime label as classified by the macro engine. */
  label: string;
  /** Confidence [0..1]. */
  confidence: number;
  /** Symbols the regime is expected to influence — driven by the universe
   *  the gateway passed in or by curated regime→asset mappings. */
  targets: string[];
  /** Epoch ms when the classification was emitted. */
  ts: number;
}

export interface NarrativeContext {
  themeId: string;
  themeLabel: string;
  /** Theme→asset symbols sourced from narrative_memory.related_symbols. */
  relatedSymbols: string[];
  /** Lifetime score (0..1) drives edge strength. */
  lifetimeScore: number;
  /** Most-recent observation epoch ms. */
  lastSeenTs: number;
}

export interface ProducerContext {
  focal: { symbol: string; bars: OHLCVBar[] };
  peers: Record<string, OHLCVBar[]>;
  benchmarks: Record<string, OHLCVBar[]>;
  macros: Record<string, OHLCVBar[]>;
  windowDays: number;
  /** When set, producers should derive relationships using only bars
   *  whose timestamp is ≤ this value. Powers the replay timeline. */
  asOfTs?: number;
  /** Optional workspace research artifacts the artifactProducer can
   *  attach to the graph as artifact-link edges. */
  artifacts?: QuantArtifactBase[];
  /** V3 Phase 2 — recent SEC filings keyed by symbol. */
  filings?: FilingContext[];
  /** V3 Phase 2 — current macro regime classifications. */
  macroRegimes?: MacroRegimeContext[];
  /** V3 Phase 2 — active narrative themes with related-symbol fan-out. */
  narratives?: NarrativeContext[];
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
