import React from 'react';
import type { CorrelationSnapshot } from '../../types';

function colorFor(v: number): string {
  // -1 (terracotta) … 0 (muted) … +1 (sage)
  if (v > 0) {
    const t = Math.min(1, v);
    return `rgba(120, 140, 93, ${0.12 + t * 0.55})`;
  }
  const t = Math.min(1, -v);
  return `rgba(193, 95, 60, ${0.12 + t * 0.55})`;
}

export const CorrelationHeatmap: React.FC<{
  snapshot: CorrelationSnapshot;
  /** If provided, every off-diagonal cell becomes a button. */
  onCellClick?: (pair: { a: string; b: string; value: number }) => void;
  highlight?: { a: string; b: string } | null;
  /** Symbols with insufficient bars — rendered with reduced opacity + tooltip. */
  insufficient?: Set<string>;
}> = ({ snapshot, onCellClick, highlight, insufficient }) => {
  const { symbols, cells } = snapshot;
  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.rowSymbol}|${c.colSymbol}`, c.value);

  const isHighlighted = (row: string, col: string) =>
    highlight && (
      (highlight.a === row && highlight.b === col) ||
      (highlight.a === col && highlight.b === row)
    );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <th />
            {symbols.map((s) => {
              const out = insufficient?.has(s);
              return (
                <th
                  key={s}
                  className="ds-label"
                  title={out ? 'Insufficient data for this symbol' : undefined}
                  style={{
                    padding: '4px 6px',
                    color: 'var(--muted-foreground)',
                    opacity: out ? 0.45 : 1,
                  }}
                >
                  {s}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {symbols.map((row) => {
            const rowOut = insufficient?.has(row);
            return (
              <tr key={row}>
                <th
                  className="ds-label"
                  title={rowOut ? 'Insufficient data' : undefined}
                  style={{
                    padding: '4px 6px',
                    textAlign: 'right',
                    color: 'var(--muted-foreground)',
                    opacity: rowOut ? 0.45 : 1,
                  }}
                >
                  {row}
                </th>
                {symbols.map((col) => {
                  const same = row === col;
                  const colOut = insufficient?.has(col);
                  const v = same ? 1 : (lookup.get(`${row}|${col}`) ?? lookup.get(`${col}|${row}`) ?? null);
                  const hl = isHighlighted(row, col);
                  const dim = rowOut || colOut;
                  const cellStyle: React.CSSProperties = {
                    background: v == null ? 'var(--muted)' : colorFor(v),
                    color: 'var(--foreground)',
                    border: hl ? '1px solid var(--primary)' : '1px solid var(--border)',
                    padding: '6px 10px',
                    textAlign: 'center',
                    minWidth: 48,
                    opacity: dim && !same ? 0.4 : 1,
                    fontWeight: hl ? 700 : 400,
                  };
                  const display = v == null ? '—' : v.toFixed(2);
                  if (same || !onCellClick || dim || v == null) {
                    return <td key={col} style={cellStyle}>{display}</td>;
                  }
                  return (
                    <td key={col} style={{ padding: 0, border: cellStyle.border }}>
                      <button
                        type="button"
                        onClick={() => onCellClick({ a: row, b: col, value: v })}
                        title={`${row} ↔ ${col}: ${display}`}
                        style={{
                          ...cellStyle,
                          border: 'none',
                          width: '100%',
                          cursor: 'pointer',
                          background: cellStyle.background,
                          color: cellStyle.color,
                        }}
                      >
                        {display}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
