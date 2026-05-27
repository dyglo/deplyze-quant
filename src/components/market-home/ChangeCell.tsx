import React from 'react';
import { fmtSigned, fmtPct, deltaColor } from './format';

/**
 * ChangeCell — uniform numeric change display used across every Market Home
 * table: a directional triangle + color, optional absolute change, percent.
 * Tabular numerals and fixed min-widths keep columns aligned.
 */
export const ChangeCell: React.FC<{
  changePercent: number;
  change?: number;
  ok?: boolean;
  /** Show the absolute change alongside the percent. */
  showAbs?: boolean;
  align?: 'right' | 'left';
}> = ({ changePercent, change, ok = true, showAbs, align = 'right' }) => {
  const color = deltaColor(changePercent);
  const up = changePercent > 0;
  const down = changePercent < 0;
  const tri = up ? '▲' : down ? '▼' : '·';

  if (!ok) {
    return <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums', textAlign: align, display: 'block' }}>—</span>;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', gap: 6, color }}>
      {showAbs && typeof change === 'number' && (
        <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 50, textAlign: 'right' }}>{fmtSigned(change)}</span>
      )}
      <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 8, marginRight: 3 }}>{tri}</span>{fmtPct(Math.abs(changePercent)).replace('+', '')}
      </span>
    </span>
  );
};
