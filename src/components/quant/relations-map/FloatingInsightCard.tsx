/**
 * Draggable floating intelligence card for the Relations Map.
 *
 * Renders as position:fixed so it floats above the full-viewport
 * graph canvas, the sidebar, and all other UI. The user can drag
 * it anywhere on screen from the header grip. Content mirrors the
 * IntelligenceRail (node header, Copilot narrative, relationship
 * groups, actions) but the card never compresses the graph.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, X, Minus, Target, ArrowUpRight, ChevronDown } from 'lucide-react';
import type {
  RelationsGraphSnapshot, RelationsNode, RelationsEdge,
} from '../../../lib/quant/relations/types';
import { edgeColor } from './nodePalette';
import { CopilotSummary } from './CopilotSummary';

export interface FloatingInsightCardProps {
  snapshot: RelationsGraphSnapshot;
  node: RelationsNode;
  focalId: string | null;
  onClose: () => void;
  onNavigateNode: (id: string) => void;
  onMakeFocal: (id: string) => void;
  onInspect: (id: string) => void;
}

const CARD_WIDTH = 348;
const DEFAULT_X_OFFSET = 20; // px from right edge
const DEFAULT_Y = 80;        // px from top

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export const FloatingInsightCard: React.FC<FloatingInsightCardProps> = ({
  snapshot, node, focalId, onClose, onNavigateNode, onMakeFocal, onInspect,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: Math.max(0, window.innerWidth - CARD_WIDTH - DEFAULT_X_OFFSET),
    y: DEFAULT_Y,
  }));
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startCardX: number;
    startCardY: number;
  } | null>(null);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore clicks on buttons inside the header
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCardX: pos.x,
      startCardY: pos.y,
    };
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startClientX;
      const dy = e.clientY - dragRef.current.startClientY;
      setPos({
        x: clamp(dragRef.current.startCardX + dx, 0, window.innerWidth - CARD_WIDTH),
        y: clamp(dragRef.current.startCardY + dy, 0, window.innerHeight - 56),
      });
    };
    const onMouseUp = () => { dragRef.current = null; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const isFocal = node.id === focalId;
  const neighbours = collectNeighbours(snapshot, node.id);

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: CARD_WIDTH,
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        background: 'color-mix(in srgb, var(--card) 94%, transparent)',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
        borderRadius: 12,
        boxShadow: [
          '0 8px 40px color-mix(in srgb, var(--foreground) 14%, transparent)',
          '0 2px 8px color-mix(in srgb, var(--foreground) 8%, transparent)',
          'inset 0 1px 0 color-mix(in srgb, var(--background) 30%, transparent)',
        ].join(', '),
        userSelect: 'none',
      }}
    >
      {/* ── Drag handle header ────────────────────────────────────── */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 12px 10px 8px',
          cursor: dragRef.current ? 'grabbing' : 'grab',
          borderBottom: minimized
            ? 'none'
            : '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
          borderRadius: minimized ? 12 : '12px 12px 0 0',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <GripVertical
          size={13}
          style={{ color: 'var(--muted-foreground)', flexShrink: 0, opacity: 0.5 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--primary)',
              padding: '1px 5px', borderRadius: 3,
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
              flexShrink: 0,
            }}>
              {KIND_LABEL[node.kind] ?? node.kind}
            </span>
            {isFocal && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--muted-foreground)',
                padding: '1px 5px', borderRadius: 3,
                border: '1px solid var(--border)',
                flexShrink: 0,
              }}>Focal</span>
            )}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'var(--foreground)',
            letterSpacing: '-0.015em', lineHeight: 1.2, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {node.label}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <HeaderButton
            label={minimized ? 'Expand' : 'Minimize'}
            onClick={() => setMinimized((m) => !m)}
          >
            <Minus size={11} />
          </HeaderButton>
          <HeaderButton label="Close" onClick={onClose}>
            <X size={11} />
          </HeaderButton>
        </div>
      </div>

      {/* ── Card body (hidden when minimized) ────────────────────── */}
      {!minimized && (
        <div style={{
          overflowY: 'auto',
          // Dynamically account for card's current y position + header height
          // so the body never extends below the viewport regardless of drag.
          maxHeight: `calc(100vh - ${pos.y}px - 60px)`,
          padding: '14px 16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          {/* Node subtitle */}
          {(node.meta || node.sector || node.cluster) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {node.meta && (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                  {node.meta}
                </p>
              )}
              {(node.sector || node.cluster) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {node.sector && <MetaChip label={node.sector} />}
                  {node.cluster && (
                    <MetaChip
                      label={snapshot.clusters.find((c) => c.id === node.cluster)?.label ?? node.cluster}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Copilot narrative */}
          <CopilotSummary snapshot={snapshot} node={node} />

          {/* Divider */}
          <div style={{ height: 1, background: 'color-mix(in srgb, var(--border) 70%, transparent)' }} />

          {/* Relationship groups — each is a collapsible dropdown */}
          {Object.entries(neighbours).length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
              No relationships in scope. Widen the time window or enable more edge types.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(neighbours).map(([kind, list], index) => (
                <NeighbourGroup
                  key={kind}
                  kind={kind as RelationsEdge['kind']}
                  items={list}
                  onNavigate={onNavigateNode}
                  defaultOpen={Object.entries(neighbours).length <= 2 || index === 0}
                />
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{
            paddingTop: 12,
            borderTop: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
            display: 'flex',
            gap: 6,
          }}>
            {!isFocal && (
              <ActionButton
                primary
                icon={<Target size={11} />}
                label="Make Focal"
                onClick={() => onMakeFocal(node.id)}
              />
            )}
            <ActionButton
              icon={<ArrowUpRight size={11} />}
              label="Deep Inspect"
              onClick={() => onInspect(node.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────

const HeaderButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, onClick, children }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    style={{
      width: 22, height: 22,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
      borderRadius: 5,
      background: 'transparent',
      color: 'var(--muted-foreground)',
      cursor: 'pointer',
      transition: 'background 100ms, color 100ms',
    }}
  >
    {children}
  </button>
);

const MetaChip: React.FC<{ label: string }> = ({ label }) => (
  <span style={{
    display: 'inline-flex', fontSize: 10, fontWeight: 600,
    padding: '2px 7px', borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--muted)', color: 'var(--muted-foreground)',
  }}>
    {label}
  </span>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick: () => void;
}> = ({ icon, label, primary, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      padding: '7px 10px',
      background: primary
        ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
        : 'transparent',
      border: `1px solid ${primary
        ? 'color-mix(in srgb, var(--primary) 35%, transparent)'
        : 'color-mix(in srgb, var(--border) 70%, transparent)'}`,
      borderRadius: 7,
      color: primary ? 'var(--primary)' : 'var(--muted-foreground)',
      fontSize: 11, fontWeight: 700, cursor: 'pointer',
      letterSpacing: '0.02em',
      transition: 'background 120ms',
    }}
  >
    {icon}
    {label}
  </button>
);

const NeighbourGroup: React.FC<{
  kind: RelationsEdge['kind'];
  items: NeighbourItem[];
  onNavigate?: (id: string) => void;
  defaultOpen?: boolean;
}> = ({ kind, items, onNavigate, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;

  return (
    <section style={{
      border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Dropdown header — click to expand/collapse */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px',
          background: open
            ? 'color-mix(in srgb, var(--muted) 40%, transparent)'
            : 'color-mix(in srgb, var(--muted) 20%, transparent)',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 120ms',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: open ? 'var(--foreground)' : 'var(--muted-foreground)',
            transition: 'color 120ms',
          }}>
            {KIND_HEADING[kind] ?? kind}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
            color: 'var(--muted-foreground)',
            background: 'color-mix(in srgb, var(--border) 50%, transparent)',
            padding: '1px 5px', borderRadius: 999,
            flexShrink: 0,
          }}>
            {items.length}
          </span>
        </div>
        <ChevronDown
          size={12}
          style={{
            color: 'var(--muted-foreground)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 180ms ease',
          }}
        />
      </button>

      {/* Collapsed list */}
      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 0,
          borderTop: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
        }}>
          {items.map(({ edge, node }, idx) => (
            <button
              key={edge.id}
              onClick={() => node && onNavigate?.(node.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '6px 10px',
                border: 'none',
                borderBottom: idx < items.length - 1
                  ? '1px solid color-mix(in srgb, var(--border) 35%, transparent)'
                  : 'none',
                background: 'transparent',
                color: 'var(--foreground)', fontSize: 12,
                cursor: node ? 'pointer' : 'default',
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
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
      )}
    </section>
  );
};

// ── Helpers ───────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  'company': 'Company', 'etf': 'ETF', 'index': 'Index', 'sector': 'Sector',
  'currency': 'Currency', 'commodity': 'Commodity', 'treasury': 'Treasury',
  'macro': 'Macro indicator', 'vol-regime': 'Vol regime', 'artifact': 'Research artifact',
  'benchmark': 'Benchmark', 'theme': 'Market theme', 'earnings': 'Earnings event',
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
