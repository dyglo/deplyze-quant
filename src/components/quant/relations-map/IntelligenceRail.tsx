import React from 'react';
import { X, Target, ArrowUpRight } from 'lucide-react';
import type {
  RelationsGraphSnapshot, RelationsNode, RelationsEdge,
} from '../../../lib/quant/relations/types';
import { edgeColor } from './nodePalette';
import { CopilotSummary } from './CopilotSummary';

const KIND_LABEL: Record<string, string> = {
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
  'correlation':             'Correlations',
  'inverse-correlation':     'Inverse relationships',
  'supplier':                'Suppliers',
  'customer':                'Customers',
  'benchmark-dependency':    'Benchmark dependencies',
  'sector-dependency':       'Sector dependencies',
  'volatility-transmission': 'Volatility transmission',
  'macro-dependency':        'Macro sensitivities',
  'earnings-influence':      'Earnings influence',
  'thematic':                'Thematic links',
  'artifact-link':           'Linked artifacts',
  'historical':              'Historical analogs',
  'regime':                  'Regime relationships',
};

interface Props {
  snapshot: RelationsGraphSnapshot;
  selectedNode: RelationsNode | null;
  focalId: string | null;
  onClose: () => void;
  onNavigateNode: (id: string) => void;
  onMakeFocal: (id: string) => void;
  onInspect: (id: string) => void;
}

const RAIL_WIDTH = 380;

export const IntelligenceRail: React.FC<Props> = ({
  snapshot, selectedNode, focalId, onClose, onNavigateNode, onMakeFocal, onInspect,
}) => {
  const isOpen = selectedNode !== null;

  return (
    <div style={{
      width: isOpen ? RAIL_WIDTH : 0,
      flexShrink: 0,
      overflow: 'hidden',
      transition: 'width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      borderLeft: isOpen ? '1px solid var(--border)' : '1px solid transparent',
      background: 'var(--card)',
    }}>
      {/* Fixed-width inner so content doesn't squish during transition */}
      <div style={{
        width: RAIL_WIDTH,
        height: '100%',
        overflowY: 'auto',
        padding: '22px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {selectedNode && (
          <RailContent
            snapshot={snapshot}
            node={selectedNode}
            focalId={focalId}
            onClose={onClose}
            onNavigateNode={onNavigateNode}
            onMakeFocal={onMakeFocal}
            onInspect={onInspect}
          />
        )}
      </div>
    </div>
  );
};

const RailContent: React.FC<{
  snapshot: RelationsGraphSnapshot;
  node: RelationsNode;
  focalId: string | null;
  onClose: () => void;
  onNavigateNode: (id: string) => void;
  onMakeFocal: (id: string) => void;
  onInspect: (id: string) => void;
}> = ({ snapshot, node, focalId, onClose, onNavigateNode, onMakeFocal, onInspect }) => {
  const neighbours = collectNeighbours(snapshot, node.id);
  const isFocal = node.id === focalId;

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--primary)',
              padding: '2px 7px', borderRadius: 4,
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--primary) 28%, transparent)',
              flexShrink: 0,
            }}>
              {KIND_LABEL[node.kind] ?? node.kind}
            </span>
            {isFocal && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--muted-foreground)',
                padding: '2px 7px', borderRadius: 4,
                border: '1px solid var(--border)',
              }}>Focal</span>
            )}
          </div>
          <h2 style={{
            margin: 0, fontSize: 20, fontWeight: 700,
            color: 'var(--foreground)', letterSpacing: '-0.025em', lineHeight: 1.1,
          }}>
            {node.label}
          </h2>
          {node.meta && (
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
              {node.meta}
            </p>
          )}
          {(node.sector || node.cluster) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 9 }}>
              {node.sector && <MetaChip label={node.sector} />}
              {node.cluster && (
                <MetaChip
                  label={snapshot.clusters.find((c) => c.id === node.cluster)?.label ?? node.cluster}
                />
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close intelligence rail"
          style={{
            width: 26, height: 26,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'transparent', color: 'var(--muted-foreground)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 100ms',
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Copilot narrative */}
      <div style={{ marginBottom: 18 }}>
        <CopilotSummary snapshot={snapshot} node={node} />
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 18 }} />

      {/* Relationship groups */}
      {Object.entries(neighbours).length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>
          No relationships in scope. Widen the time window or enable more edge types.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {Object.entries(neighbours).map(([kind, list]) => (
            <NeighbourGroup
              key={kind}
              kind={kind as RelationsEdge['kind']}
              items={list}
              onNavigate={onNavigateNode}
            />
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{
        marginTop: 22, paddingTop: 16,
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 6,
      }}>
        {!isFocal && (
          <button
            onClick={() => onMakeFocal(node.id)}
            style={{
              flex: 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)',
              borderRadius: 7,
              color: 'var(--primary)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'background 120ms',
            }}
          >
            <Target size={11} />
            Make Focal
          </button>
        )}
        <button
          onClick={() => onInspect(node.id)}
          style={{
            flex: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 7,
            color: 'var(--muted-foreground)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.02em',
            transition: 'background 120ms',
          }}
        >
          <ArrowUpRight size={11} />
          Deep Inspect
        </button>
      </div>
    </>
  );
};

const MetaChip: React.FC<{ label: string }> = ({ label }) => (
  <span style={{
    display: 'inline-flex', fontSize: 10, fontWeight: 600,
    padding: '2px 8px', borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--muted)', color: 'var(--muted-foreground)',
  }}>
    {label}
  </span>
);

const NeighbourGroup: React.FC<{
  kind: RelationsEdge['kind'];
  items: NeighbourItem[];
  onNavigate?: (id: string) => void;
}> = ({ kind, items, onNavigate }) => {
  if (items.length === 0) return null;
  return (
    <section>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--muted-foreground)',
        marginBottom: 6,
      }}>
        {KIND_HEADING[kind] ?? kind}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.slice(0, 8).map(({ edge, node }) => (
          <button
            key={edge.id}
            onClick={() => node && onNavigate?.(node.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 7,
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: 12, cursor: node ? 'pointer' : 'default',
              textAlign: 'left', width: '100%',
              transition: 'background 100ms',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                background: edgeColor(edge.kind, edge.strength),
              }} />
              <span style={{
                fontWeight: 600, fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {node?.label ?? edge.target}
              </span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 11,
                color: 'var(--muted-foreground)',
              }}>
                {formatStrength(edge.strength)}
              </span>
              {edge.trend && (
                <span style={{ fontSize: 10, color: trendColor(edge.trend) }}>
                  {trendGlyph(edge.trend)}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

interface NeighbourItem { edge: RelationsEdge; node: RelationsNode | null }

function collectNeighbours(
  snapshot: RelationsGraphSnapshot, id: string,
): Record<string, NeighbourItem[]> {
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const groups: Record<string, NeighbourItem[]> = {};
  for (const e of snapshot.edges) {
    const otherId = e.source === id ? e.target : e.target === id ? e.source : null;
    if (!otherId) continue;
    (groups[e.kind] ??= []).push({ edge: e, node: byId.get(otherId) ?? null });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => Math.abs(b.edge.strength) - Math.abs(a.edge.strength));
  }
  return groups;
}

function formatStrength(v: number): string { return (v >= 0 ? '+' : '') + v.toFixed(2); }

function trendGlyph(t: NonNullable<RelationsEdge['trend']>): string {
  switch (t) {
    case 'strengthening': return '▲';
    case 'weakening':     return '▽';
    case 'flipped':       return '↔';
    default:              return '·';
  }
}

function trendColor(t: NonNullable<RelationsEdge['trend']>): string {
  switch (t) {
    case 'strengthening': return 'var(--chart-2)';
    case 'weakening':     return 'var(--destructive)';
    case 'flipped':       return 'var(--chart-3)';
    default:              return 'var(--muted-foreground)';
  }
}
