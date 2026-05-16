import React from 'react';
import { ArrowUpRight, Target } from 'lucide-react';
import type {
  RelationsGraphSnapshot, RelationsNode, RelationsEdge,
} from '../../../lib/quant/relations/types';
import { edgeColor } from './nodePalette';
import { CopilotSummary } from './CopilotSummary';

interface Props {
  snapshot: RelationsGraphSnapshot;
  node: RelationsNode;
  focalId: string | null;
  onMakeFocal?: (id: string) => void;
  onNavigateNode?: (id: string) => void;
}

const KIND_LABEL: Record<RelationsNode['kind'], string> = {
  'company':      'Company',
  'etf':          'ETF',
  'index':        'Index',
  'sector':       'Sector',
  'currency':     'Currency',
  'commodity':    'Commodity',
  'treasury':     'Treasury',
  'macro':        'Macro indicator',
  'vol-regime':   'Volatility regime',
  'artifact':     'Research artifact',
  'benchmark':    'Benchmark',
  'theme':        'Market theme',
  'earnings':     'Earnings event',
  'news-cluster': 'News cluster',
};

const KIND_HEADING: Partial<Record<RelationsEdge['kind'], string>> = {
  'correlation':              'Correlations',
  'inverse-correlation':      'Inverse relationships',
  'supplier':                 'Suppliers',
  'customer':                 'Customers',
  'benchmark-dependency':     'Benchmark dependencies',
  'sector-dependency':        'Sector dependencies',
  'volatility-transmission':  'Volatility transmission',
  'macro-dependency':         'Macro sensitivities',
  'earnings-influence':       'Earnings influence',
  'thematic':                 'Thematic links',
  'artifact-link':            'Linked artifacts',
  'historical':               'Historical analogs',
  'regime':                   'Regime relationships',
};

/**
 * Full intelligence body for a Relations Map node — opens in the global
 * DataDrawer when a node is "inspected" (Shift-click or the Inspect
 * action on its card). Distinct from the always-visible side panel,
 * which is the quick view: this body is meant for deep drill-down,
 * showing all neighbour groups with strengths, baselines, and trends,
 * plus a "Make focal" action that recursively re-pivots the graph.
 */
export const RelationsNodeDrawerBody: React.FC<Props> = ({
  snapshot, node, focalId, onMakeFocal, onNavigateNode,
}) => {
  const groups = collectNeighbours(snapshot, node.id);
  const topRelationships = topRanked(groups, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 4px' }}>
      {/* Header chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Chip label={KIND_LABEL[node.kind]} primary />
        {node.sector && <Chip label={`Sector · ${node.sector}`} />}
        {node.cluster && <Chip label={`Cluster · ${formatCluster(node.cluster)}`} />}
        {focalId === node.id && <Chip label="Focal" primary />}
      </div>

      {node.meta && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--foreground)' }}>
          {node.meta}
        </p>
      )}

      <CopilotSummary snapshot={snapshot} node={node} />

      {/* Make focal action */}
      {focalId !== node.id && node.kind === 'company' && (
        <button
          onClick={() => onMakeFocal?.(node.id)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--primary)',
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            color: 'var(--primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          <Target size={13} />
          Make {node.label} the focal instrument
        </button>
      )}

      {/* Top relationships */}
      {topRelationships.length > 0 && (
        <section>
          <SectionHeading title="Strongest relationships" />
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topRelationships.map(({ edge, node: other }) => (
              <NeighbourRow
                key={`top-${edge.id}`}
                edge={edge}
                other={other}
                onNavigate={onNavigateNode}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Grouped neighbour breakdown */}
      {Object.keys(groups).length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          No relationships in scope for this node. Widen the time window or load more data.
        </p>
      ) : (
        Object.entries(groups).map(([kind, items]) => (
          <section key={kind}>
            <SectionHeading title={KIND_HEADING[kind as RelationsEdge['kind']] ?? kind} count={items.length} />
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(({ edge, node: other }) => (
                <NeighbourRow
                  key={edge.id}
                  edge={edge}
                  other={other}
                  onNavigate={onNavigateNode}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Provenance */}
      <p className="ds-caption" style={{
        margin: 0, paddingTop: 12, borderTop: '1px solid var(--border)',
        color: 'var(--muted-foreground)', fontSize: 11,
      }}>
        Strengths derived from rolling correlation, β / R², and volatility transmission
        over a {snapshot.windowDays}-day window. Pairs without sufficient overlap are
        omitted per the strict-data policy.
      </p>
    </div>
  );
};

interface NeighbourItem { edge: RelationsEdge; node: RelationsNode | null }

function collectNeighbours(snapshot: RelationsGraphSnapshot, id: string): Record<string, NeighbourItem[]> {
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const groups: Record<string, NeighbourItem[]> = {};
  for (const e of snapshot.edges) {
    let otherId: string | null = null;
    if (e.source === id) otherId = e.target;
    else if (e.target === id) otherId = e.source;
    if (!otherId) continue;
    (groups[e.kind] ??= []).push({ edge: e, node: byId.get(otherId) ?? null });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => Math.abs(b.edge.strength) - Math.abs(a.edge.strength));
  }
  return groups;
}

function topRanked(groups: Record<string, NeighbourItem[]>, n: number): NeighbourItem[] {
  return Object.values(groups)
    .flat()
    .sort((a, b) => Math.abs(b.edge.strength) - Math.abs(a.edge.strength))
    .slice(0, n);
}

const NeighbourRow: React.FC<{
  edge: RelationsEdge;
  other: RelationsNode | null;
  onNavigate?: (id: string) => void;
}> = ({ edge, other, onNavigate }) => (
  <li>
    <button
      onClick={() => other && onNavigate?.(other.id)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '7px 10px',
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--card)',
        color: 'var(--foreground)',
        fontSize: 12,
        cursor: other ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 999,
          background: edgeColor(edge.kind, edge.strength), flexShrink: 0,
        }} />
        <span style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {other?.label ?? edge.target}
          </span>
          {other?.meta && (
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {other.meta}
            </span>
          )}
        </span>
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--muted-foreground)',
        flexShrink: 0,
      }}>
        {formatStrength(edge.strength)}
        {edge.trend && (
          <span style={{ color: trendColor(edge.trend) }}>{trendGlyph(edge.trend)}</span>
        )}
        {other && <ArrowUpRight size={12} style={{ opacity: 0.5 }} />}
      </span>
    </button>
  </li>
);

const SectionHeading: React.FC<{ title: string; count?: number }> = ({ title, count }) => (
  <h4 style={{
    margin: '0 0 8px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--foreground)',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  }}>
    <span>{title}</span>
    {typeof count === 'number' && (
      <span style={{
        fontSize: 9, fontWeight: 700,
        padding: '1px 6px', borderRadius: 999,
        border: '1px solid var(--border)', background: 'var(--muted)',
        color: 'var(--muted-foreground)', letterSpacing: '0.04em',
      }}>{count}</span>
    )}
  </h4>
);

const Chip: React.FC<{ label: string; primary?: boolean }> = ({ label, primary }) => (
  <span style={{
    display: 'inline-flex',
    fontSize: 10, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '3px 8px',
    borderRadius: 999,
    border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`,
    background: primary ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--muted)',
    color: primary ? 'var(--primary)' : 'var(--foreground)',
  }}>{label}</span>
);

function formatCluster(cluster: string): string {
  if (cluster.startsWith('sector:'))   return cluster.slice('sector:'.length);
  if (cluster.startsWith('industry:')) return cluster.slice('industry:'.length);
  if (cluster === 'benchmarks') return 'Benchmarks';
  if (cluster === 'macro')      return 'Macro';
  return cluster;
}
function formatStrength(v: number): string { return (v >= 0 ? '+' : '') + v.toFixed(2); }
function trendGlyph(t: NonNullable<RelationsEdge['trend']>): string {
  switch (t) { case 'strengthening': return '▲'; case 'weakening': return '▽'; case 'flipped': return '↔'; default: return '·'; }
}
function trendColor(t: NonNullable<RelationsEdge['trend']>): string {
  switch (t) {
    case 'strengthening': return 'var(--chart-2)';
    case 'weakening':     return 'var(--destructive)';
    case 'flipped':       return 'var(--chart-3)';
    default:              return 'var(--muted-foreground)';
  }
}
