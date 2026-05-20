import React, { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import type { EdgeKind } from '../../../lib/quant/relations/types';
import { STUDY_PRESETS, type StudyPreset } from './studyPresets';

const ALL_EDGE_KINDS: EdgeKind[] = [
  'correlation', 'inverse-correlation', 'supplier', 'customer',
  'benchmark-dependency', 'sector-dependency', 'volatility-transmission',
  'macro-dependency', 'earnings-influence', 'thematic',
  'artifact-link', 'historical', 'regime',
];

const EDGE_KIND_LABEL: Record<EdgeKind, string> = {
  'correlation':             'Correlation',
  'inverse-correlation':     'Inverse correlation',
  'supplier':                'Supplier',
  'customer':                'Customer',
  'benchmark-dependency':    'Benchmark',
  'sector-dependency':       'Sector',
  'volatility-transmission': 'Vol transmission',
  'macro-dependency':        'Macro',
  'earnings-influence':      'Earnings',
  'thematic':                'Thematic',
  'artifact-link':           'Artifact link',
  'historical':              'Historical',
  'regime':                  'Regime',
};

interface Props {
  edgeKinds: Set<EdgeKind>;
  onToggleEdgeKind: (k: EdgeKind) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  activePreset: StudyPreset | null;
  onApplyPreset: (preset: StudyPreset) => void;
}

export const EdgeFilterPopover: React.FC<Props> = ({
  edgeKinds, onToggleEdgeKind, onSelectAll, onSelectNone,
  activePreset, onApplyPreset,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = edgeKinds.size;
  const total = ALL_EDGE_KINDS.length;
  const isCustom = activePreset === null;
  const isFiltered = active < total;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const triggerLabel = activePreset
    ? activePreset.id === 'full-view'
      ? 'Full View'
      : activePreset.label
    : `Custom · ${active}/${total}`;

  const triggerAccented = isCustom || (activePreset && activePreset.id !== 'full-view');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Study presets and edge filters"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 10px',
          background: triggerAccented || open
            ? 'color-mix(in srgb, var(--primary) 12%, var(--card))'
            : 'color-mix(in srgb, var(--card) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${triggerAccented || open
            ? 'color-mix(in srgb, var(--primary) 60%, transparent)'
            : 'color-mix(in srgb, var(--border) 70%, transparent)'}`,
          borderRadius: 8,
          color: triggerAccented || open ? 'var(--primary)' : 'var(--muted-foreground)',
          fontSize: 11, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.02em',
          transition: 'all 150ms ease',
          whiteSpace: 'nowrap',
          maxWidth: 180,
        }}
      >
        <Layers size={11} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{triggerLabel}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 284,
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
          background: 'color-mix(in srgb, var(--card) 97%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 10px 10px',
          boxShadow: [
            '0 8px 32px color-mix(in srgb, var(--foreground) 12%, transparent)',
            '0 2px 8px color-mix(in srgb, var(--foreground) 6%, transparent)',
          ].join(', '),
          zIndex: 200,
        }}>

          {/* ── Study presets ───────────────────────────────────── */}
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
            padding: '0 4px 8px',
          }}>
            Study Presets
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 5,
            marginBottom: 10,
          }}>
            {STUDY_PRESETS.map((preset) => {
              const isActive = activePreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => { onApplyPreset(preset); setOpen(false); }}
                  title={preset.description}
                  style={{
                    padding: '7px 9px',
                    borderRadius: 7,
                    border: `1px solid ${isActive
                      ? `color-mix(in srgb, ${preset.accent} 55%, transparent)`
                      : 'color-mix(in srgb, var(--border) 70%, transparent)'}`,
                    background: isActive
                      ? `color-mix(in srgb, ${preset.accent} 12%, transparent)`
                      : 'color-mix(in srgb, var(--muted) 30%, transparent)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 120ms ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <span style={{
                    display: 'block',
                    width: 6, height: 6, borderRadius: 999, marginBottom: 2,
                    background: isActive ? preset.accent : 'var(--border)',
                    transition: 'background 120ms',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 11, fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                    lineHeight: 1.25,
                    letterSpacing: '-0.01em',
                  }}>
                    {preset.label}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 400,
                    color: 'color-mix(in srgb, var(--muted-foreground) 70%, transparent)',
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{
            height: 1,
            background: 'color-mix(in srgb, var(--border) 55%, transparent)',
            margin: '0 2px 10px',
          }} />

          {/* ── Individual edge type toggles ─────────────────────── */}
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
            padding: '0 4px 6px',
          }}>
            Edge Types
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {ALL_EDGE_KINDS.map((k) => {
              const on = edgeKinds.has(k);
              return (
                <button
                  key={k}
                  onClick={() => onToggleEdgeKind(k)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 8px', borderRadius: 6,
                    border: 'none',
                    background: on ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                    color: on ? 'var(--foreground)' : 'color-mix(in srgb, var(--muted-foreground) 80%, transparent)',
                    fontSize: 11, fontWeight: on ? 600 : 400,
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'background 100ms, color 100ms',
                  }}
                >
                  <span style={{
                    width: 5, height: 5, borderRadius: 999, flexShrink: 0,
                    background: on ? 'var(--primary)' : 'var(--border)',
                    transition: 'background 100ms',
                  }} />
                  {EDGE_KIND_LABEL[k]}
                </button>
              );
            })}
          </div>

          {/* All / None */}
          <div style={{
            marginTop: 8, paddingTop: 8,
            borderTop: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
            display: 'flex', gap: 4,
          }}>
            <button onClick={onSelectAll} style={miniActionButton()}>All</button>
            <button onClick={onSelectNone} style={miniActionButton()}>None</button>
          </div>
        </div>
      )}
    </div>
  );
};

function miniActionButton(): React.CSSProperties {
  return {
    flex: 1, padding: '4px 0',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    border: '1px solid var(--border)', borderRadius: 6,
    background: 'transparent', color: 'var(--muted-foreground)',
    cursor: 'pointer',
  };
}
