/**
 * Relations Map — V2 full-viewport institutional graph workspace.
 *
 * The graph owns the full viewport at all times. Controls float as a
 * HUD overlay. On node selection a draggable floating insight card
 * appears — Palantir-style — which the user can move anywhere on
 * screen without the graph ever being constrained.
 *
 * Data layer is unchanged from Phase 4 Wave B.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X as XIcon, RotateCcw } from 'lucide-react';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { InstrumentSelector } from '../components/quant/InstrumentSelector';
import { useDrawer } from '../components/quant/DataDrawer';
import { useSWR } from '../hooks/useSWR';
import { useArtifacts } from '../hooks/useArtifacts';
import { useWorkspace } from '../components/WorkspaceContext';
import {
  RelationsGraphCanvas,
  RelationsNodeDrawerBody,
  ReplayTimeline,
  EdgeFilterPopover,
  SpotlightLens,
  FloatingInsightCard,
  STUDY_PRESETS,
  detectActivePreset,
  loadPresetFromStorage,
  savePresetToStorage,
  type SpotlightMode,
  type StudyPreset,
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

const WINDOWS: Array<{ label: string; days: number }> = [
  { label: '1M', days: 21 },
  { label: '3M', days: 63 },
  { label: '6M', days: 126 },
  { label: '1Y', days: 252 },
];

const KIND_LABEL: Record<string, string> = {
  'company': 'Company', 'etf': 'ETF', 'index': 'Index', 'sector': 'Sector',
  'currency': 'Currency', 'commodity': 'Commodity', 'treasury': 'Treasury',
  'macro': 'Macro', 'vol-regime': 'Vol regime', 'artifact': 'Artifact',
  'benchmark': 'Benchmark', 'theme': 'Theme', 'earnings': 'Earnings',
  'news-cluster': 'News',
};

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
  const [edgeKinds, setEdgeKinds] = useState<Set<EdgeKind>>(() => {
    const saved = loadPresetFromStorage();
    return new Set(saved ? saved.edgeKinds : ALL_EDGE_KINDS);
  });
  const [nodeKinds] = useState<Set<NodeKind>>(() => new Set());
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightMode>(() => {
    const saved = loadPresetFromStorage();
    return saved?.spotlight ?? 'none';
  });
  const [strengthThreshold, setStrengthThreshold] = useState<number>(() => {
    const saved = loadPresetFromStorage();
    return saved?.strengthThreshold ?? 0;
  });
  const [replayAsOf, setReplayAsOf] = useState<number | null>(null);
  // Camera focus token: incremented on user-initiated node selections to
  // trigger the canvas focus animation without re-firing on data refreshes.
  const [cameraToken, setCameraToken] = useState<{ nodeId: string; n: number } | null>(null);
  const cameraTokenCountRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    const ctx = {
      ...live.data.context,
      asOfTs: replayAsOf ?? undefined,
      artifacts: artifacts.items.map(toQuantArtifact),
    };
    const snapshot = composeRelationsGraph(ctx);
    snapshot.skipped.push(...live.data.skipped);
    snapshot.asOf = replayAsOf ?? live.data.asOf ?? snapshot.asOf;
    return snapshot;
  }, [mode, live.data, replayAsOf, artifacts.items]);

  const seed = useMemo(() => buildSeedRelationsGraph(), []);
  const baseSnapshot: RelationsGraphSnapshot = mode === 'live' ? (liveSnapshot ?? seed) : seed;

  const replayBounds = useMemo(() => {
    if (!live.data) return null;
    const bars = live.data.context.focal.bars;
    if (bars.length < 2) return null;
    return { start: bars[0].ts, end: bars[bars.length - 1].ts };
  }, [live.data]);

  useEffect(() => { setReplayAsOf(null); }, [focal, windowDays, mode]);

  const toggleEdgeKind = useCallback((k: EdgeKind) => {
    setEdgeKinds((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }, []);
  const selectAllEdgeKinds = useCallback(() => setEdgeKinds(new Set(ALL_EDGE_KINDS)), []);
  const selectNoneEdgeKinds = useCallback(() => setEdgeKinds(new Set()), []);

  const activePreset = useMemo(
    () => detectActivePreset(edgeKinds, spotlight, strengthThreshold),
    [edgeKinds, spotlight, strengthThreshold],
  );

  const handleApplyPreset = useCallback((preset: StudyPreset) => {
    setEdgeKinds(new Set(preset.edgeKinds));
    setSpotlight(preset.spotlight ?? 'none');
    setStrengthThreshold(preset.strengthThreshold ?? 0);
    savePresetToStorage(preset.id);
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

  const hoveredNode = useMemo<RelationsNode | null>(() =>
    hovered ? filteredSnapshot.nodes.find((n) => n.id === hovered) ?? null : null,
    [hovered, filteredSnapshot.nodes],
  );

  // Keyboard: ESC closes search or deselects node
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchOpen) { setSearchOpen(false); setQuery(''); }
        else setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Auto-select the focal node on initial snapshot load only.
  // A ref guards against re-triggering every time the user deselects.
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    hasAutoSelectedRef.current = false;
  }, [focal, mode, windowDays]);
  useEffect(() => {
    if (mode === 'live' && liveSnapshot && !hasAutoSelectedRef.current) {
      const f = liveSnapshot.nodes.find((n) => n.id === focal.toUpperCase());
      if (f) { setSelected(f.id); hasAutoSelectedRef.current = true; }
    }
  }, [liveSnapshot, focal, mode]);

  // Focus search input when search opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  // User-initiated node selection — triggers camera animation
  const handleUserSelectNode = useCallback((id: string | null) => {
    setSelected(id);
    if (id) {
      cameraTokenCountRef.current += 1;
      setCameraToken({ nodeId: id, n: cameraTokenCountRef.current });
    }
  }, []);

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
          onMakeFocal={(newFocal) => {
            setFocal(newFocal);
            setSelected(null);
            drawer.close();
          }}
          onNavigateNode={(nid) => {
            setSelected(nid);
            handleInspectNode(nid);
          }}
        />
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSnapshot, drawer, mode, focal]);

  const handleMakeFocal = useCallback((id: string) => {
    setFocal(id);
    setSelected(null);
  }, []);

  // Status line: context-aware based on hover/selection state
  const statusText = useMemo(() => {
    if (hoveredNode) {
      const kind = KIND_LABEL[hoveredNode.kind] ?? hoveredNode.kind;
      return hoveredNode.meta
        ? `${hoveredNode.label} — ${kind} · ${hoveredNode.meta}`
        : `${hoveredNode.label} — ${kind}`;
    }
    const modeLabel = mode === 'live' ? `focal ${focal}` : 'seed ontology';
    const skipSuffix = filteredSnapshot.skipped.length > 0
      ? ` · ${filteredSnapshot.skipped.length} skipped`
      : '';
    return `${filteredSnapshot.nodes.length} nodes · ${filteredSnapshot.edges.length} edges · ${modeLabel}${skipSuffix}`;
  }, [hoveredNode, focal, mode, filteredSnapshot]);

  return (
    <div style={{
      height: 'calc(100dvh - 52px)',
      overflow: 'hidden',
      position: 'relative',
      background: 'var(--background)',
    }}>
      {/* ── Graph canvas area — always full width ─────────────────── */}
      <div style={{ position: 'absolute', inset: 0 }}>

        {/* Sigma graph canvas fills the entire area */}
        <RelationsGraphCanvas
          snapshot={filteredSnapshot}
          focalId={mode === 'live' ? focal.toUpperCase() : null}
          hoveredNodeId={hovered}
          selectedNodeId={selected}
          cameraFocusToken={cameraToken}
          spotlight={spotlight}
          strengthThreshold={strengthThreshold}
          onHoverNode={setHovered}
          onSelectNode={handleUserSelectNode}
          onInspectNode={handleInspectNode}
        />

        {/* ── TOP LEFT: Identity HUD ────────────────────────────── */}
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 30,
          display: 'flex', flexDirection: 'column', gap: 6,
          maxWidth: 290,
        }}>
          <div style={hudShell()}>
            {/* Instrument selector row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <InstrumentSelector
                  value={focal}
                  onSelect={(s) => { setFocal(s.toUpperCase()); setSelected(null); }}
                  placeholder="Focal symbol…"
                />
              </div>
              {mode === 'live' && live.loading && <LoadingDot />}
              {mode === 'live' && !live.loading && (
                <FreshnessBadge status={live.status} fetchedAt={live.fetchedAt} compact />
              )}
            </div>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
              {(['live', 'seed'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: mode === m
                      ? 'var(--primary)'
                      : 'color-mix(in srgb, var(--muted) 50%, transparent)',
                    color: mode === m
                      ? 'var(--primary-foreground)'
                      : 'var(--muted-foreground)',
                    transition: 'background 150ms, color 150ms',
                  }}
                >
                  {m === 'live' ? 'Live' : 'Seed'}
                </button>
              ))}
            </div>

            {/* Study mode indicator */}
            <div style={{
              marginTop: 7,
              paddingTop: 7,
              borderTop: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: 999, flexShrink: 0,
                  background: activePreset
                    ? activePreset.id === 'full-view'
                      ? 'var(--muted-foreground)'
                      : activePreset.accent
                    : 'var(--chart-3)',
                  boxShadow: activePreset && activePreset.id !== 'full-view'
                    ? `0 0 4px ${activePreset.accent}`
                    : 'none',
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: activePreset && activePreset.id !== 'full-view'
                    ? 'var(--foreground)'
                    : 'var(--muted-foreground)',
                  letterSpacing: '0.01em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {activePreset ? activePreset.studyLabel : 'Custom lens'}
                </span>
              </div>
              {!activePreset && (
                <button
                  onClick={() => handleApplyPreset(STUDY_PRESETS[0])}
                  title="Reset to full view"
                  style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'var(--muted-foreground)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '2px 4px', borderRadius: 4, flexShrink: 0,
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Error banner */}
          {mode === 'live' && live.error && !live.data && (
            <div style={{
              ...hudShell(),
              border: '1px solid color-mix(in srgb, var(--destructive) 40%, transparent)',
              background: 'color-mix(in srgb, var(--destructive) 8%, var(--card))',
            }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--destructive)', lineHeight: 1.5 }}>
                Could not load graph for {focal}.
              </p>
              <button
                onClick={() => live.refresh()}
                style={{
                  marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 8px', borderRadius: 5, border: '1px solid var(--destructive)',
                  background: 'transparent', color: 'var(--destructive)',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <RotateCcw size={10} /> Retry
              </button>
            </div>
          )}
        </div>

        {/* ── TOP RIGHT: Controls HUD ───────────────────────────── */}
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 30,
          display: 'flex', gap: 5, alignItems: 'flex-start', flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}>
          {/* Search toggle + input */}
          {searchOpen ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px',
              background: 'color-mix(in srgb, var(--card) 88%, transparent)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid color-mix(in srgb, var(--primary) 50%, transparent)',
              borderRadius: 8,
            }}>
              <Search size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Symbol, ETF, macro, theme…"
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 11, color: 'var(--foreground)', width: 180,
                }}
              />
              <button
                onClick={() => { setSearchOpen(false); setQuery(''); }}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--muted-foreground)', padding: 0, display: 'flex',
                }}
              >
                <XIcon size={11} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              title="Search nodes"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30,
                background: 'color-mix(in srgb, var(--card) 88%, transparent)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
                borderRadius: 8, color: 'var(--muted-foreground)',
                cursor: 'pointer', transition: 'all 150ms ease',
              }}
            >
              <Search size={12} />
            </button>
          )}

          {/* Time window selector */}
          <div style={{
            display: 'inline-flex',
            background: 'color-mix(in srgb, var(--card) 88%, transparent)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
            borderRadius: 8, overflow: 'hidden',
          }}>
            {WINDOWS.map((w) => {
              const on = windowDays === w.days;
              return (
                <button
                  key={w.label}
                  onClick={() => setWindowDays(w.days)}
                  style={{
                    padding: '5px 9px',
                    fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: on
                      ? 'var(--primary)'
                      : 'transparent',
                    color: on ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    transition: 'background 150ms, color 150ms',
                    letterSpacing: '0.02em',
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          </div>

          <EdgeFilterPopover
            edgeKinds={edgeKinds}
            onToggleEdgeKind={toggleEdgeKind}
            onSelectAll={selectAllEdgeKinds}
            onSelectNone={selectNoneEdgeKinds}
            activePreset={activePreset}
            onApplyPreset={handleApplyPreset}
          />

          <SpotlightLens
            spotlight={spotlight}
            onSpotlightChange={setSpotlight}
            strengthThreshold={strengthThreshold}
            onStrengthThresholdChange={setStrengthThreshold}
          />
        </div>

        {/* ── BOTTOM LEFT: Status caption ───────────────────────── */}
        <div style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 20 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.01em',
            color: hoveredNode ? 'var(--foreground)' : 'var(--muted-foreground)',
            background: 'color-mix(in srgb, var(--card) 82%, transparent)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '4px 10px', borderRadius: 7,
            border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
            transition: 'color 150ms',
          }}>
            {statusText}
          </span>
        </div>

        {/* ── BOTTOM CENTER: Replay timeline ────────────────────── */}
        {mode === 'live' && replayBounds && (
          <div style={{
            position: 'absolute', bottom: 14, zIndex: 20,
            left: '50%', transform: 'translateX(-50%)',
          }}>
            <ReplayTimeline
              floating
              start={replayBounds.start}
              end={replayBounds.end}
              value={replayAsOf}
              onChange={setReplayAsOf}
            />
          </div>
        )}

        {/* ── Subtle loading overlay ────────────────────────────── */}
        {mode === 'live' && live.loading && !live.data && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              color: 'var(--muted-foreground)',
              background: 'color-mix(in srgb, var(--card) 90%, transparent)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            }}>
              Loading {focal} relationship graph…
            </span>
          </div>
        )}
      </div>

      {/* ── Floating insight card (position:fixed, draggable) ─── */}
      {selectedNode && (
        <FloatingInsightCard
          snapshot={filteredSnapshot}
          node={selectedNode}
          focalId={mode === 'live' ? focal.toUpperCase() : null}
          onClose={() => setSelected(null)}
          onNavigateNode={(id) => {
            setSelected(id);
            cameraTokenCountRef.current += 1;
            setCameraToken({ nodeId: id, n: cameraTokenCountRef.current });
          }}
          onMakeFocal={handleMakeFocal}
          onInspect={handleInspectNode}
        />
      )}
    </div>
  );
};

// ── Local sub-components ──────────────────────────────────────────

const LoadingDot: React.FC = () => (
  <span style={{
    width: 6, height: 6, borderRadius: 999, flexShrink: 0,
    background: 'var(--primary)',
    animation: 'relations-pulse 1.4s ease-in-out infinite',
  }}>
    <style>{`
      @keyframes relations-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.25; }
      }
    `}</style>
  </span>
);

function hudShell(): React.CSSProperties {
  return {
    background: 'color-mix(in srgb, var(--card) 88%, transparent)',
    backdropFilter: 'blur(12px) saturate(150%)',
    WebkitBackdropFilter: 'blur(12px) saturate(150%)',
    border: '1px solid color-mix(in srgb, var(--border) 65%, transparent)',
    borderRadius: 10,
    padding: '10px 12px',
    boxShadow: '0 4px 24px color-mix(in srgb, var(--foreground) 7%, transparent)',
  };
}
