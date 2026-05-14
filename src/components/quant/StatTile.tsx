import React from 'react';

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  delta?: number;       // sign-aware, percent
  hint?: string;
}> = ({ label, value, delta, hint }) => {
  const deltaColor =
    delta == null ? 'var(--muted-foreground)' :
    delta > 0 ? '#4E6040' /* sage */ :
    delta < 0 ? 'var(--primary)' /* terracotta */ :
    'var(--muted-foreground)';
  return (
    <div className="ds-surface" style={{ padding: '12px 14px', borderRadius: 10, display: 'grid', gap: 4 }}>
      <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <span className="ds-title" style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        {delta != null ? (
          <span className="ds-caption" style={{ color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} {Math.abs(delta).toFixed(2)}%
          </span>
        ) : <span />}
        {hint ? <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{hint}</span> : null}
      </div>
    </div>
  );
};
