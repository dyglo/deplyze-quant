import React from 'react';
import type { EdgeKind } from '../../../lib/quant/relations/types';

/** Spotlight: highlight a single relationship family + dim the rest.
 *  Maps to one or two EdgeKind values. */
export type SpotlightMode =
  | 'none'
  | 'correlation'        // correlation + inverse
  | 'inverse'
  | 'benchmark'
  | 'volatility'
  | 'macro'
  | 'sector';

export const SPOTLIGHT_KINDS: Record<SpotlightMode, EdgeKind[]> = {
  none:        [],
  correlation: ['correlation', 'inverse-correlation'],
  inverse:     ['inverse-correlation'],
  benchmark:   ['benchmark-dependency'],
  volatility:  ['volatility-transmission'],
  macro:       ['macro-dependency'],
  sector:      ['sector-dependency', 'thematic'],
};

interface Props {
  spotlight: SpotlightMode;
  onSpotlightChange: (m: SpotlightMode) => void;
  strengthThreshold: number;
  onStrengthThresholdChange: (v: number) => void;
}

const SPOTLIGHTS: Array<{ id: SpotlightMode; label: string }> = [
  { id: 'none',        label: 'All edges' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'inverse',     label: 'Inverse only' },
  { id: 'benchmark',   label: 'Benchmark' },
  { id: 'volatility',  label: 'Vol transmit' },
  { id: 'macro',       label: 'Macro' },
  { id: 'sector',      label: 'Sector / theme' },
];

/**
 * Spotlight + strength threshold controls. The spotlight selects a
 * single relationship family to bring forward — every other edge fades
 * to ~12% opacity and cards outside the spotlight's neighbourhood dim
 * to ~32%. The threshold slider hides edges below |strength| < N so the
 * user can drill into the strongest signals.
 */
export const OverlayControls: React.FC<Props> = ({
  spotlight, onSpotlightChange, strengthThreshold, onStrengthThresholdChange,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'center',
      padding: '8px 12px',
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--card)',
      marginBottom: 10,
    }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>Spotlight</span>
        {SPOTLIGHTS.map((s) => {
          const on = spotlight === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSpotlightChange(s.id)}
              style={{
                padding: '3px 9px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.02em',
                borderRadius: 999,
                border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                background: on ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                color: on ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >{s.label}</button>
          );
        })}
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>Min |ρ|</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={strengthThreshold}
          onChange={(e) => onStrengthThresholdChange(Number(e.target.value))}
          style={{ width: 120, accentColor: 'var(--primary)' }}
        />
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--foreground)',
          minWidth: 30,
          textAlign: 'right',
        }}>{strengthThreshold.toFixed(2)}</span>
      </div>
    </div>
  );
};
