import React from 'react';

/**
 * SignificanceMeter — small 0..1 horizontal meter used on artifact cards to
 * convey statistical significance / surprise, separately from confidence.
 */
export const SignificanceMeter: React.FC<{ value: number; width?: number }> = ({ value, width = 80 }) => {
  const v = Math.max(0, Math.min(1, value));
  const color = v > 0.66 ? 'var(--primary)' : v > 0.33 ? '#C9A227' : 'var(--muted-foreground)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width,
        height: 4,
        background: 'var(--muted)',
        borderRadius: 999,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${v * 100}%`,
          height: '100%',
          background: color,
          transition: 'width 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>
      <span className="ds-caption" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
        σ {(v * 4).toFixed(2)}
      </span>
    </div>
  );
};
