/**
 * Relations Map — node + edge ontology.
 *
 * Defines the typed graph contract used across Phase 4. The ontology is
 * intentionally broad so downstream waves (correlation engine, volatility
 * transmission, supplier graph, macro alignment, artifact linkage) can each
 * emit nodes/edges that compose into the same RelationsGraphSnapshot.
 *
 * Strict-data policy: edges always carry a `derivedAt` timestamp and a
 * `source` describing which engine produced them. Empty or insufficient
 * inputs must not produce stub edges — engines should omit them and surface
 * the reason via `RelationsGraphSnapshot.skipped`.
 */
export type NodeKind =
  | 'company'
  | 'etf'
  | 'index'
  | 'sector'
  | 'currency'
  | 'commodity'
  | 'treasury'
  | 'macro'
  | 'vol-regime'
  | 'artifact'
  | 'benchmark'
  | 'theme'
  | 'earnings'
  | 'news-cluster';

export type EdgeKind =
  | 'correlation'
  | 'inverse-correlation'
  | 'supplier'
  | 'customer'
  | 'benchmark-dependency'
  | 'sector-dependency'
  | 'volatility-transmission'
  | 'macro-dependency'
  | 'earnings-influence'
  | 'thematic'
  | 'artifact-link'
  | 'historical'
  | 'regime';

/** Direction of a relationship's recent evolution. */
export type EdgeTrend = 'strengthening' | 'weakening' | 'stable' | 'flipped';

export interface RelationsNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Short subtitle shown on hover (e.g. "Semiconductors · Large Cap"). */
  meta?: string;
  /** Optional cluster id used for layout grouping. */
  cluster?: string;
  /** Optional sector tag — used for both clustering and palette decisions. */
  sector?: string;
  /** Optional numerical importance signal (market cap, weight, centrality). */
  weight?: number;
  /** ISO timestamp of last data refresh contributing to this node. */
  asOf?: number;
}

export interface RelationsEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  /** Signed strength in [-1, 1] where applicable; otherwise [0, 1]. */
  strength: number;
  /** Optional historical baseline of `strength` for drift detection. */
  baseline?: number;
  /** Z-score of current vs. baseline (relationship-shift magnitude). */
  zScore?: number;
  trend?: EdgeTrend;
  /** Engine identifier (e.g. 'correlation', 'volatility-transmission'). */
  producedBy: string;
  /** Window in days used to derive this edge, when applicable. */
  windowDays?: number;
  derivedAt: number;
}

export interface RelationsCluster {
  id: string;
  label: string;
  nodeIds: string[];
  /** Optional cluster-level description (rendered in side panels). */
  blurb?: string;
}

export interface RelationsGraphSnapshot {
  nodes: RelationsNode[];
  edges: RelationsEdge[];
  clusters: RelationsCluster[];
  /** Window over which this snapshot was derived (days). */
  windowDays: number;
  /** Most-recent timestamp contributing to the snapshot. */
  asOf: number;
  /** Edges/nodes intentionally omitted with rationale. */
  skipped: Array<{ id: string; reason: string }>;
}

/** Convenience guard for narrowing signed correlation-style edges. */
export const isCorrelationEdge = (e: RelationsEdge): boolean =>
  e.kind === 'correlation' || e.kind === 'inverse-correlation';
