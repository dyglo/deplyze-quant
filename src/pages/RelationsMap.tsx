/**
 * Relations Map — Phase 4.
 *
 * Wave A delivered the scaffold; Wave B adds real-data relationship
 * producers (correlation, benchmark, volatility transmission, sector/peer
 * taxonomy) composed into a snapshot for any focal instrument.
 *
 * Modes:
 *   - Live : focal symbol → producers → derived snapshot.
 *   - Seed : the macro bootstrap ontology (orientation + fallback when
 *            the focal context fails to load).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { InstrumentSelector } from '../components/quant/InstrumentSelector';
import { useSWR } from '../hooks/useSWR';
import {
  RelationsGraphCanvas,
  RelationsSidePanel,
  RelationsFilterBar,
  OverlayControls,
  type SpotlightMode,
} from '../components/quant/relations-map';
import { buildSeedRelationsGraph } from '../lib/quant/relations/seed';
import { buildFocalContext } from '../lib/quant/relations/context';
import { composeRelationsGraph } from '../lib/quant/relations/compose';
import type { EdgeKind, NodeKind, RelationsGraphSnapshot, RelationsNode } from '../lib/quant/relations/types';

const ALL_EDGE_KINDS: EdgeKind[] = [
  'correlation', 'inverse-correlation', 'supplier', 'customer',
  'benchmark-dependency', 'sector-dependency', 'volatility-transmission',
  'macro-dependency', 'earnings-influence', 'thematic',
  'artifact-link', 'historical', 'regime',
];

type Mode = 'live' | 'seed';

export const RelationsMap: React.FC = () => {
  const [mode, setMode] = useState<Mode>('live');
  const [focal, setFocal] = useState('NVDA');
  const [windowDays, setWindowDays] = useState(63);
  const [edgeKinds, setEdgeKinds] = useState<Set<EdgeKind>>(() => new Set(ALL_EDGE_KINDS));
  const [nodeKinds, setNodeKinds] = useState<Set<NodeKind>>(() => new Set());
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightMode>('none');
  const [strengthThreshold, setStrengthThreshold] = useState(0);

  const live = useSWR<RelationsGraphSnapshot | null>(
    async () => {
      if (mode !== 'live') return null;
      const load = await buildFocalContext(focal, { windowDays });
      const snapshot = composeRelationsGraph(load.context);
      snapshot.skipped.push(...load.skipped);
      snapshot.asOf = load.asOf || snapshot.asOf;
      return snapshot;
    },
    [focal, windowDays, mode],
    { cacheKey: `relations:${mode}:${focal}:${windowDays}` },
  );

  const seed = useMemo(() => buildSeedRelationsGraph(), []);
  const baseSnapshot: RelationsGraphSnapshot = mode === 'live' ? (live.data ?? seed) : seed;

  const toggleEdgeKind = useCallback((k: EdgeKind) => {
    setEdgeKinds((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, []);
  const toggleNodeKind = useCallback((k: NodeKind) => {
    setNodeKinds((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, []);

  const filteredSnapshot = useMemo<RelationsGraphSnapshot>(() => {
    const q = query.trim().toLowerCase();
    let nodes = baseSnapshot.nodes;
    if (q) {
      const matchIds = new Set(
        baseSnapshot.nodes
          .filter((n) =>
            n.label.toLowerCase().includes(q) ||
            n.id.toLowerCase().includes(q) ||
            (n.meta?.toLowerCase().includes(q) ?? false))
          .map((n) => n.id),
      );
      const expanded = new Set(matchIds);
      for (const e of baseSnapshot.edges) {
        if (matchIds.has(e.source)) expanded.add(e.target);
        if (matchIds.has(e.target)) expanded.add(e.source);
      }
      nodes = baseSnapshot.nodes.filter((n) => expanded.has(n.id));
    }
    const visibleIds = new Set(nodes.map((n) => n.id));
    const edges = baseSnapshot.edges.filter((e) =>
      edgeKinds.has(e.kind) && visibleIds.has(e.source) && visibleIds.has(e.target),
    );
    return { ...baseSnapshot, nodes, edges, windowDays };
  }, [baseSnapshot, query, edgeKinds, windowDays]);

  const selectedNode = useMemo<RelationsNode | null>(() =>
    selected ? filteredSnapshot.nodes.find((n) => n.id === selected) ?? null : null,
    [selected, filteredSnapshot.nodes],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (mode === 'live' && live.data && !selected) {
      const f = live.data.nodes.find((n) => n.id === focal.toUpperCase());
      if (f) setSelected(f.id);
    }
  }, [live.data, focal, mode, selected]);

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Relations Map"
        subtitle="Institutional relationship intelligence — explore how a focal instrument relates to its peers, benchmarks, sector ETFs, and macro proxies. Strengths derive from rolling correlation, beta, and volatility transmission over the selected window."
        actions={
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {mode === 'live' && <FreshnessBadge status={live.status} fetchedAt={live.fetchedAt} compact />}
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', background: 'var(--muted)',
            }}>
              Phase 4 · Wave B
            </span>
          </div>
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: '1 1 320px', minWidth: 240 }}>
          <InstrumentSelector
            value={focal}
            onSelect={(s) => { setFocal(s.toUpperCase()); setSelected(null); }}
            placeholder="Focal symbol (NVDA, AAPL, JPM…)"
          />
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['live', 'seed'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em',
                background: mode === m ? 'var(--primary)' : 'transparent',
                color: mode === m ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                border: 'none', cursor: 'pointer',
              }}
            >{m === 'live' ? 'Live' : 'Seed'}</button>
          ))}
        </div>
      </div>

      <RelationsFilterBar
        windowDays={windowDays}
        onWindowDaysChange={setWindowDays}
        edgeKinds={edgeKinds}
        onToggleEdgeKind={toggleEdgeKind}
        nodeKinds={nodeKinds}
        onToggleNodeKind={toggleNodeKind}
        query={query}
        onQueryChange={setQuery}
      />

      <OverlayControls
        spotlight={spotlight}
        onSpotlightChange={setSpotlight}
        strengthThreshold={strengthThreshold}
        onStrengthThresholdChange={setStrengthThreshold}
      />

      {mode === 'live' && live.loading && !live.data && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
          Fetching OHLCV for {focal} + peers, benchmarks, and macro proxies…
        </p>
      )}
      {mode === 'live' && live.error && !live.data && (
        <p className="ds-caption" style={{ color: 'var(--primary)' }}>
          Could not derive Relations Map for {focal}: {live.error.message}.{' '}
          <button onClick={() => live.refresh()} style={{
            background: 'transparent', border: 'none', color: 'var(--primary)',
            textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
          }}>Retry</button>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'stretch', minHeight: 600 }}>
        <section style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
          <RelationsGraphCanvas
            snapshot={filteredSnapshot}
            focalId={mode === 'live' ? focal.toUpperCase() : null}
            hoveredNodeId={hovered}
            selectedNodeId={selected}
            spotlight={spotlight}
            strengthThreshold={strengthThreshold}
            onHoverNode={setHovered}
            onSelectNode={setSelected}
          />
          <div style={{ position: 'absolute', left: 12, bottom: 12, right: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'none' }}>
            <span className="ds-caption" style={{
              color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--card) 80%, transparent)',
              padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', pointerEvents: 'auto',
            }}>
              {filteredSnapshot.nodes.length} nodes · {filteredSnapshot.edges.length} edges · {mode === 'live' ? `focal ${focal}` : 'seed ontology'}
            </span>
            <span className="ds-caption" style={{
              color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--card) 80%, transparent)',
              padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', pointerEvents: 'auto',
            }}>
              scroll to zoom · drag to pan · click node to inspect
            </span>
          </div>
        </section>

        <RelationsSidePanel
          snapshot={filteredSnapshot}
          selectedNode={selectedNode}
          onClose={() => setSelected(null)}
          onNavigateNode={setSelected}
        />
      </div>

      {filteredSnapshot.skipped.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary className="ds-caption" style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }}>
            {filteredSnapshot.skipped.length} relationships skipped (strict-data policy)
          </summary>
          <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0, columns: 2, columnGap: 24 }}>
            {filteredSnapshot.skipped.slice(0, 24).map((s) => (
              <li key={s.id} className="ds-caption" style={{ color: 'var(--muted-foreground)', breakInside: 'avoid', paddingBottom: 2 }}>
                <span style={{ fontFamily: 'ui-monospace, monospace' }}>{s.id}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Disclaimer />
    </div>
  );
};
