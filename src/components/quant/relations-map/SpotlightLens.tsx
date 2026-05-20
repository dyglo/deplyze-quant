import React, { useEffect, useRef, useState } from 'react';
import { ScanSearch } from 'lucide-react';
import type { SpotlightMode } from './OverlayControls';

const SPOTLIGHTS: Array<{ id: SpotlightMode; label: string }> = [
  { id: 'none',        label: 'All edges' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'inverse',     label: 'Inverse only' },
  { id: 'benchmark',   label: 'Benchmark' },
  { id: 'volatility',  label: 'Vol transmission' },
  { id: 'macro',       label: 'Macro links' },
  { id: 'sector',      label: 'Sector / theme' },
];

interface Props {
  spotlight: SpotlightMode;
  onSpotlightChange: (m: SpotlightMode) => void;
  strengthThreshold: number;
  onStrengthThresholdChange: (v: number) => void;
}

export const SpotlightLens: React.FC<Props> = ({
  spotlight, onSpotlightChange, strengthThreshold, onStrengthThresholdChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = spotlight !== 'none' || strengthThreshold > 0;
  const activeLabel = SPOTLIGHTS.find((s) => s.id === spotlight)?.label;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Spotlight & threshold"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 10px',
          background: active || open
            ? 'color-mix(in srgb, var(--primary) 12%, var(--card))'
            : 'color-mix(in srgb, var(--card) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${active || open ? 'color-mix(in srgb, var(--primary) 60%, transparent)' : 'color-mix(in srgb, var(--border) 70%, transparent)'}`,
          borderRadius: 8,
          color: active || open ? 'var(--primary)' : 'var(--muted-foreground)',
          fontSize: 11, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.02em',
          transition: 'all 150ms ease',
          whiteSpace: 'nowrap',
        }}
      >
        <ScanSearch size={11} />
        <span>{spotlight !== 'none' ? activeLabel : 'Spotlight'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 200,
          background: 'color-mix(in srgb, var(--card) 97%, transparent)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 8px 10px',
          boxShadow: '0 8px 32px color-mix(in srgb, var(--foreground) 11%, transparent), 0 2px 8px color-mix(in srgb, var(--foreground) 6%, transparent)',
          zIndex: 200,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
            padding: '0 6px 8px',
          }}>
            Spotlight
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 12 }}>
            {SPOTLIGHTS.map((s) => {
              const on = spotlight === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onSpotlightChange(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 6,
                    border: 'none',
                    background: on ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                    color: on ? 'var(--primary)' : 'var(--muted-foreground)',
                    fontSize: 11, fontWeight: on ? 700 : 400,
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'background 100ms',
                  }}
                >
                  <span style={{
                    width: 5, height: 5, borderRadius: 999, flexShrink: 0,
                    background: on ? 'var(--primary)' : 'var(--border)',
                  }} />
                  {s.label}
                </button>
              );
            })}
          </div>

          <div style={{
            paddingTop: 10,
            borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
              padding: '0 6px 8px',
            }}>
              Min |ρ|
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px' }}>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={strengthThreshold}
                onChange={(e) => onStrengthThresholdChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--primary)', height: 4 }}
              />
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                color: strengthThreshold > 0 ? 'var(--primary)' : 'var(--muted-foreground)',
                minWidth: 30, textAlign: 'right',
              }}>
                {strengthThreshold.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
