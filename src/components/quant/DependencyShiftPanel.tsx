import React, { useMemo } from 'react';
import { crossAssetIntelligence, type DependencyShiftReport } from '../../lib/quant';
import type { OHLCVBar } from '../../types';

const STATE_COLORS: Record<DependencyShiftReport['state'], { bg: string; fg: string; label: string }> = {
  stable:     { bg: 'var(--muted)',                 fg: 'var(--muted-foreground)', label: 'stable' },
  tightening: { bg: 'rgba(78, 96, 64, 0.10)',       fg: '#4E6040',                 label: 'tightening' },
  loosening:  { bg: 'rgba(50, 95, 140, 0.10)',      fg: '#325F8C',                 label: 'loosening' },
  breakdown:  { bg: 'rgba(193, 95, 60, 0.12)',      fg: 'var(--primary)',          label: 'breakdown' },
};

const StateChip: React.FC<{ state: DependencyShiftReport['state'] }> = ({ state }) => {
  const c = STATE_COLORS[state];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase',
      background: c.bg, color: c.fg,
    }}>{c.label}</span>
  );
};

export const DependencyShiftPanel: React.FC<{
  basket: Record<string, OHLCVBar[]>;
  maxRows?: number;
}> = ({ basket, maxRows = 5 }) => {
  const intel = useMemo(() => crossAssetIntelligence({ bars: basket }), [basket]);
  const shifts = intel.shifts.filter(s => s.state !== 'stable').slice(0, maxRows);
  const totalSkipped = intel.skippedPairs.length;

  if (!shifts.length) {
    return (
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <h3 className="ds-heading" style={{ margin: 0 }}>Dependency shifts</h3>
          {totalSkipped > 0 && (
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
              {totalSkipped} pair{totalSkipped === 1 ? '' : 's'} skipped (insufficient overlap)
            </span>
          )}
        </div>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          All pair correlations sit within their baseline range. No structural shifts to flag.
        </p>
      </section>
    );
  }

  return (
    <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginTop: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 className="ds-heading" style={{ margin: 0 }}>Dependency shifts</h3>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
          21-day recent vs 126-day baseline
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {shifts.map((s) => (
          <li key={`${s.pair[0]}-${s.pair[1]}`} style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto auto',
            gap: 10,
            alignItems: 'center',
            fontSize: 12,
            padding: '6px 8px',
            background: 'var(--card)',
            borderRadius: 6,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 600 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{s.pair[0]}</span>
              <span style={{ color: 'var(--muted-foreground)' }}> ↔ </span>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{s.pair[1]}</span>
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted-foreground)' }}>
              {s.historical >= 0 ? '+' : ''}{s.historical.toFixed(2)}
              {' → '}
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
                {s.current >= 0 ? '+' : ''}{s.current.toFixed(2)}
              </span>
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--muted-foreground)' }}>
              z {s.zScore.toFixed(2)}
            </div>
            <StateChip state={s.state} />
          </li>
        ))}
      </ul>
      {totalSkipped > 0 && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, margin: 0 }}>
          {totalSkipped} pair{totalSkipped === 1 ? '' : 's'} skipped — insufficient overlapping history for a baseline.
        </p>
      )}
    </section>
  );
};
