import React from 'react';
import type { EdgeKind, NodeKind } from '../../../lib/quant/relations/types';

interface Props {
  windowDays: number;
  onWindowDaysChange: (w: number) => void;
  edgeKinds: Set<EdgeKind>;
  onToggleEdgeKind: (k: EdgeKind) => void;
  nodeKinds: Set<NodeKind>;
  onToggleNodeKind: (k: NodeKind) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

const WINDOWS: Array<{ label: string; days: number }> = [
  { label: '1M',  days: 21 },
  { label: '3M',  days: 63 },
  { label: '6M',  days: 126 },
  { label: '1Y',  days: 252 },
];

const EDGE_KIND_LABEL: Record<EdgeKind, string> = {
  'correlation': 'Correlation',
  'inverse-correlation': 'Inverse',
  'supplier': 'Supplier',
  'customer': 'Customer',
  'benchmark-dependency': 'Benchmark',
  'sector-dependency': 'Sector',
  'volatility-transmission': 'Vol transmit',
  'macro-dependency': 'Macro',
  'earnings-influence': 'Earnings',
  'thematic': 'Thematic',
  'artifact-link': 'Artifact',
  'historical': 'Historical',
  'regime': 'Regime',
};

/**
 * Top filter strip — time window, symbol/macro search, and edge-kind toggles.
 * Node-kind filtering and overlay toggles (volatility, benchmark, regime)
 * extend in Wave E.
 */
export const RelationsFilterBar: React.FC<Props> = ({
  windowDays,
  onWindowDaysChange,
  edgeKinds,
  onToggleEdgeKind,
  query,
  onQueryChange,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--card)',
      marginBottom: 12,
    }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '1 1 280px', minWidth: 240 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>Explore</span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search symbol, ETF, macro, theme…"
          style={{
            flex: 1,
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            color: 'var(--foreground)',
            minWidth: 0,
          }}
        />
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>Window</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {WINDOWS.map((w) => {
            const on = windowDays === w.days;
            return (
              <button
                key={w.label}
                onClick={() => onWindowDaysChange(w.days)}
                style={{
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: on ? 'var(--primary)' : 'transparent',
                  color: on ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >{w.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>Edges</span>
        {(Object.keys(EDGE_KIND_LABEL) as EdgeKind[]).map((k) => {
          const on = edgeKinds.has(k);
          return (
            <button
              key={k}
              onClick={() => onToggleEdgeKind(k)}
              style={{
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.02em',
                borderRadius: 999,
                border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                background: on ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                color: on ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >{EDGE_KIND_LABEL[k]}</button>
          );
        })}
      </div>
    </div>
  );
};
