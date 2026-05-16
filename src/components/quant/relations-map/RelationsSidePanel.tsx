import React from 'react';
import type { RelationsGraphSnapshot, RelationsNode, RelationsEdge } from '../../../lib/quant/relations/types';
import { edgeColor } from './nodePalette';

interface Props {
  snapshot: RelationsGraphSnapshot;
  selectedNode: RelationsNode | null;
  onClose?: () => void;
  onNavigateNode?: (id: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  'company': 'Company',
  'etf': 'ETF',
  'index': 'Index',
  'sector': 'Sector',
  'currency': 'Currency',
  'commodity': 'Commodity',
  'treasury': 'Treasury',
  'macro': 'Macro indicator',
  'vol-regime': 'Volatility regime',
  'artifact': 'Research artifact',
  'benchmark': 'Benchmark',
  'theme': 'Market theme',
  'earnings': 'Earnings event',
  'news-cluster': 'News cluster',
};

/**
 * Contextual intelligence drawer for the selected node. Shows the node's
 * full metadata and a ranked list of its neighbours grouped by edge kind.
 * Wave A focuses on layout + relationship grouping; deeper intelligence
 * (artifact links, historical drift, regime context) is layered in Waves F/H.
 */
export const RelationsSidePanel: React.FC<Props> = ({ snapshot, selectedNode, onClose, onNavigateNode }) => {
  if (!selectedNode) {
    return (
      <aside style={panelShell()}>
        <SectionHeader title="Relationship intelligence" />
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Select any node to inspect its relationship neighbourhood — peers, benchmark dependencies,
          macro alignment, volatility transmission, and linked research artifacts.
        </p>
        <Legend snapshot={snapshot} />
      </aside>
    );
  }

  const neighbours = collectNeighbours(snapshot, selectedNode.id);
  return (
    <aside style={panelShell()}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--muted-foreground)', margin: 0,
          }}>
            {KIND_LABEL[selectedNode.kind] ?? selectedNode.kind}
          </p>
          <h2 style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
            {selectedNode.label}
          </h2>
          {selectedNode.meta && (
            <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
              {selectedNode.meta}
            </p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--muted-foreground)',
              padding: '2px 6px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ESC
          </button>
        )}
      </div>

      {selectedNode.cluster && (
        <div style={{ marginTop: 10 }}>
          <Chip label={`Cluster · ${snapshot.clusters.find((c) => c.id === selectedNode.cluster)?.label ?? selectedNode.cluster}`} />
          {selectedNode.sector && <Chip label={`Sector · ${selectedNode.sector}`} />}
        </div>
      )}

      <div style={{ marginTop: 14, height: 1, background: 'var(--border)' }} />

      {Object.entries(neighbours).length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', marginTop: 12 }}>
          No relationships in scope. Widen the time window or load more data.
        </p>
      ) : (
        Object.entries(neighbours).map(([kind, list]) => (
          <NeighbourGroup
            key={kind}
            kind={kind as RelationsEdge['kind']}
            items={list}
            onNavigate={onNavigateNode}
            snapshot={snapshot}
            selfId={selectedNode.id}
          />
        ))
      )}
    </aside>
  );
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <h3 style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--foreground)', margin: '0 0 10px',
  }}>{title}</h3>
);

const Chip: React.FC<{ label: string }> = ({ label }) => (
  <span style={{
    display: 'inline-flex',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--muted)',
    color: 'var(--foreground)',
    marginRight: 6,
    marginTop: 4,
  }}>{label}</span>
);

interface NeighbourItem { edge: RelationsEdge; node: RelationsNode | null }

function collectNeighbours(snapshot: RelationsGraphSnapshot, id: string): Record<string, NeighbourItem[]> {
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const groups: Record<string, NeighbourItem[]> = {};
  for (const e of snapshot.edges) {
    let otherId: string | null = null;
    if (e.source === id) otherId = e.target;
    else if (e.target === id) otherId = e.source;
    if (!otherId) continue;
    const g = (groups[e.kind] ??= []);
    g.push({ edge: e, node: byId.get(otherId) ?? null });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => Math.abs(b.edge.strength) - Math.abs(a.edge.strength));
  }
  return groups;
}

const KIND_HEADING: Partial<Record<RelationsEdge['kind'], string>> = {
  'correlation': 'Correlations',
  'inverse-correlation': 'Inverse relationships',
  'supplier': 'Suppliers',
  'customer': 'Customers',
  'benchmark-dependency': 'Benchmark dependencies',
  'sector-dependency': 'Sector dependencies',
  'volatility-transmission': 'Volatility transmission',
  'macro-dependency': 'Macro sensitivities',
  'earnings-influence': 'Earnings influence',
  'thematic': 'Thematic links',
  'artifact-link': 'Linked artifacts',
  'historical': 'Historical analogs',
  'regime': 'Regime relationships',
};

const NeighbourGroup: React.FC<{
  kind: RelationsEdge['kind'];
  items: NeighbourItem[];
  snapshot: RelationsGraphSnapshot;
  selfId: string;
  onNavigate?: (id: string) => void;
}> = ({ kind, items, onNavigate }) => {
  if (items.length === 0) return null;
  return (
    <section style={{ marginTop: 14 }}>
      <SectionHeader title={KIND_HEADING[kind] ?? kind} />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.slice(0, 8).map(({ edge, node }) => (
          <li key={edge.id}>
            <button
              onClick={() => node && onNavigate?.(node.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: 12,
                cursor: node ? 'pointer' : 'default',
                textAlign: 'left',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: edgeColor(edge.kind, edge.strength),
                  flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node?.label ?? edge.target}
                </span>
              </span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--muted-foreground)' }}>
                {formatStrength(edge.strength)}
                {edge.trend && (
                  <span style={{ marginLeft: 6, color: trendColor(edge.trend) }}>{trendGlyph(edge.trend)}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const Legend: React.FC<{ snapshot: RelationsGraphSnapshot }> = ({ snapshot }) => {
  const kinds = new Set(snapshot.nodes.map((n) => n.kind));
  return (
    <section style={{ marginTop: 18 }}>
      <SectionHeader title="Node legend" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Array.from(kinds).map((k) => (
          <span key={k} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, fontWeight: 600, color: 'var(--foreground)',
            padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border)',
            background: 'var(--muted)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--primary)' }} />
            {KIND_LABEL[k] ?? k}
          </span>
        ))}
      </div>
    </section>
  );
};

const panelShell = (): React.CSSProperties => ({
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 16,
  height: '100%',
  overflowY: 'auto',
  minHeight: 520,
});

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
