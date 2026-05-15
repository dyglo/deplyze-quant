import React, { useCallback, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CorrelationSnapshot } from '../../types';
import { exportHeatmapAsPng } from '../../lib/chartExport';

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
  onCellClick?: (pair: { a: string; b: string; value: number }) => void;
  highlight?: { a: string; b: string } | null;
  insufficient?: Set<string>;
  /** If provided, a download button appears above the heatmap. */
  downloadTitle?: string;
  downloadFilename?: string;
}> = ({ snapshot, onCellClick, highlight, insufficient, downloadTitle, downloadFilename }) => {
  const { symbols, cells } = snapshot;
  const [downloading, setDownloading] = useState(false);

  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.rowSymbol}|${c.colSymbol}`, c.value);

  const isHighlighted = (row: string, col: string) =>
    highlight && (
      (highlight.a === row && highlight.b === col) ||
      (highlight.a === col && highlight.b === row)
    );

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      exportHeatmapAsPng(
        snapshot,
        downloadTitle ?? 'Correlation Matrix',
        downloadFilename ?? 'correlation-heatmap.png',
      );
      toast.success('Heatmap exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setDownloading(false);
    }
  }, [snapshot, downloadTitle, downloadFilename, downloading]);

  return (
    <div style={{ overflowX: 'auto', width: '100%', position: 'relative' }}>
      {/* Download button — only shown when downloadTitle or downloadFilename is provided */}
      {(downloadTitle || downloadFilename) && (
        <button
          onClick={handleDownload}
          disabled={downloading}
          title="Download heatmap as PNG"
          style={{
            position: 'absolute', top: 0, right: 0, zIndex: 10,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--foreground)', cursor: downloading ? 'not-allowed' : 'pointer',
            opacity: downloading ? 0.6 : 1,
          }}
        >
          {downloading
            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Camera size={13} />}
        </button>
      )}
      <table style={{ borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ minWidth: 90 }} />
            {symbols.map((s) => {
              const out = insufficient?.has(s);
              return (
                <th
                  key={s}
                  className="ds-label"
                  title={out ? 'Insufficient data for this symbol' : undefined}
                  style={{
                    padding: '8px 10px',
                    color: 'var(--muted-foreground)',
                    opacity: out ? 0.45 : 1,
                    fontSize: 11,
                    letterSpacing: '0.02em',
                    minWidth: 80,
                    textAlign: 'center',
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
                    padding: '10px 14px 10px 6px',
                    textAlign: 'right',
                    color: 'var(--muted-foreground)',
                    opacity: rowOut ? 0.45 : 1,
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                    minWidth: 90,
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
                    border: hl ? '2px solid var(--primary)' : '1px solid var(--border)',
                    padding: '10px 14px',
                    textAlign: 'center',
                    minWidth: 80,
                    opacity: dim && !same ? 0.4 : 1,
                    fontWeight: hl ? 700 : same ? 600 : 400,
                    fontSize: 13,
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
