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
import { useDrawer } from '../components/quant/DataDrawer';
import { useSWR } from '../hooks/useSWR';
import { useArtifacts } from '../hooks/useArtifacts';
import { useWorkspace } from '../components/WorkspaceContext';
import {
  RelationsGraphCanvas,
  RelationsSidePanel,
  RelationsFilterBar,
  RelationsNodeDrawerBody,
  ReplayTimeline,
  OverlayControls,
  type SpotlightMode,
} from '../components/quant/relations-map';
import { buildSeedRelationsGraph } from '../lib/quant/relations/seed';
import { buildFocalContext, type FocalContextLoad } from '../lib/quant/relations/context';
import { composeRelationsGraph } from '../lib/quant/relations/compose';
import type { QuantArtifactBase, QuantArtifactKind } from '../lib/quant/artifacts';
import type { ConfidenceLevel, IntelligenceArtifact } from '../types';
import type { EdgeKind, NodeKind, RelationsGraphSnapshot, RelationsNode } from '../lib/quant/relations/types';

const ALL_EDGE_KINDS: EdgeKind[] = [
  'correlation', 'inverse-correlation', 'supplier', 'customer',
  'benchmark-dependency', 'sector-dependency', 'volatility-transmission',
  'macro-dependency', 'earnings-influence', 'thematic',
  'artifact-link', 'historical', 'regime',
];

type Mode = 'live' | 'seed';

function toQuantArtifact(a: IntelligenceArtifact): QuantArtifactBase {
  const confidence = a.confidenceScore ?? a.confidence ?? 0.5;
  return {
    id: a.id,
    kind: toQuantArtifactKind(a),
    ts: a.createdAt,
    recordedAt: a.updatedAt ?? a.createdAt,
    symbols: a.symbols,
    relatedSymbols: a.relatedSymbols,
    confidence,
    confidenceLevel: toConfidenceLevel(confidence),
    significance: a.significance ?? 0.5,
    evidence: { metrics: {} },
    narrative: a.narrative,
    tags: a.tags ?? [],
    providerLineage: ['firestore'],
    workspaceId: a.workspaceId,
    projectId: a.projectId,
  };
}

function toQuantArtifactKind(a: IntelligenceArtifact): QuantArtifactKind {
  if (a.artifactType === 'correlation_breakdown') return 'correlation_breakdown';
  if (a.artifactType === 'volatility_anomaly') return 'volatility_event';
  if (a.category === 'macro') return 'macro_alignment_change';
  if (a.category === 'anomaly') return 'anomaly_event';
  if (a.category === 'risk') return 'statistical_extreme';
  return 'regime_pattern';
}

function toConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'very-high';
  if (score >= 0.65) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export const RelationsMap: React.FC = () => {
  const drawer = useDrawer();
  const { currentWorkspace, currentProject } = useWorkspace();
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
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
  // Replay: when null, snapshot reflects "present"; otherwise producers
  // slice bars to ≤ replayAsOf.
  const [replayAsOf, setReplayAsOf] = useState<number | null>(null);

  // SWR fetches the raw FocalContext once per focal/window. Replay
  // re-derives the snapshot locally without refetching OHLCV.
  const live = useSWR<FocalContextLoad | null>(
    async () => {
      if (mode !== 'live') return null;
      return buildFocalContext(focal, { windowDays });
    },
    [focal, windowDays, mode],
    { cacheKey: `relations-ctx:${mode}:${focal}:${windowDays}` },
  );

  const liveSnapshot: RelationsGraphSnapshot | null = useMemo(() => {
    if (mode !== 'live' || !live.data) return null;
    const relationArtifacts = artifacts.items.map(toQuantArtifact);
    const ctx = {
      ...live.data.context,
      asOfTs: replayAsOf ?? undefined,
      artifacts: relationArtifacts,
    };
    const snapshot = composeRelationsGraph(ctx);
    snapshot.skipped.push(...live.data.skipped);
    snapshot.asOf = replayAsOf ?? live.data.asOf ?? snapshot.asOf;
    return snapshot;
  }, [mode, live.data, replayAsOf, artifacts.items]);

  const seed = useMemo(() => buildSeedRelationsGraph(), []);
  const baseSnapshot: RelationsGraphSnapshot = mode === 'live' ? (liveSnapshot ?? seed) : seed;

  // Timeline bounds — earliest + latest bar of the focal series.
  const replayBounds = useMemo(() => {
    if (!live.data) return null;
    const bars = live.data.context.focal.bars;
    if (bars.length < 2) return null;
    return { start: bars[0].ts, end: bars[bars.length - 1].ts };
  }, [live.data]);

  // Reset replay scrubber when focal / window / mode changes.
  useEffect(() => { setReplayAsOf(null); }, [focal, windowDays, mode]);

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
    if (mode === 'live' && liveSnapshot && !selected) {
      const f = liveSnapshot.nodes.find((n) => n.id === focal.toUpperCase());
      if (f) setSelected(f.id);
    }
  }, [liveSnapshot, focal, mode, selected]);

  const handleInspectNode = useCallback((id: string) => {
    const node = filteredSnapshot.nodes.find((n) => n.id === id);
    if (!node) return;
    drawer.open({
      title: node.label,
      subtitle: node.meta ?? `${node.kind} · ${node.sector ?? 'unclassified'}`,
      width: 540,
      body: (
        <RelationsNodeDrawerBody
          snapshot={filteredSnapshot}
          node={node}
          focalId={mode === 'live' ? focal.toUpperCase() : null}
          onMakeFocal={(newFocal) => { setFocal(newFocal); setSelected(null); drawer.close(); }}
          onNavigateNode={(nid) => {
            setSelected(nid);
            handleInspectNode(nid);
          }}
        />
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSnapshot, drawer, mode, focal]);

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

      {mode === 'live' && replayBounds && (
        <ReplayTimeline
          start={replayBounds.start}
          end={replayBounds.end}
          value={replayAsOf}
          onChange={setReplayAsOf}
        />
      )}

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
            onInspectNode={handleInspectNode}
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
