/**
 * MonthlyCorrelationMatrix — pairwise relationship heatmap for any series mix.
 *
 * It aligns every requested series by calendar month, then correlates monthly
 * changes. This avoids the sparse timestamp-overlap problem when daily/weekly
 * market data is compared with monthly or quarterly macro series.
 */

import React, { useMemo } from 'react';
import type { AssetSeries } from '../../../hooks/useHistoricalResearch';
import { Explainer } from './Explainer';

interface Props {
  assets: AssetSeries[];
}

interface Cell {
  a: string;
  b: string;
  r: number | null;
  n: number;
}

export const MonthlyCorrelationMatrix: React.FC<Props> = ({ assets }) => {
  const matrix = useMemo(() => buildMatrix(assets), [assets]);
  if (matrix.symbols.length < 2) return null;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cornerCell} />
              {matrix.symbols.map((s) => <th key={s} style={headCell}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.symbols.map((rowSymbol, rowIdx) => (
              <tr key={rowSymbol}>
                <th style={rowHead}>{rowSymbol}</th>
                {matrix.cells[rowIdx].map((cell) => (
                  <td
                    key={`${cell.a}-${cell.b}`}
                    style={{
                      ...cellStyle,
                      background: cell.r == null ? 'var(--muted)' : colorFor(cell.r),
                      color: cell.r == null ? 'var(--muted-foreground)' : '#fff',
                    }}
                    title={cell.r == null ? 'Insufficient monthly overlap' : `${cell.a}/${cell.b}: r=${cell.r.toFixed(2)} (${cell.n} months)`}
                  >
                    <div style={{ fontWeight: 750 }}>{cell.r == null ? 'n/a' : cell.r.toFixed(2)}</div>
                    {cell.n > 0 && <div style={sampleStyle}>{cell.n}m</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explainer text={explain(matrix.cells.flat())} />
    </div>
  );
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'separate',
  borderSpacing: 3,
  width: '100%',
  minWidth: 520,
};

const cornerCell: React.CSSProperties = {
  width: 78,
};

const headCell: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--muted-foreground)',
  textAlign: 'center',
  padding: '0 6px 6px',
  whiteSpace: 'nowrap',
};

const rowHead: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--foreground)',
  textAlign: 'right',
  padding: '0 8px 0 0',
  whiteSpace: 'nowrap',
};

const cellStyle: React.CSSProperties = {
  minWidth: 64,
  height: 52,
  borderRadius: 6,
  textAlign: 'center',
  fontSize: 12,
  border: '1px solid var(--border)',
};

const sampleStyle: React.CSSProperties = {
  fontSize: 9,
  opacity: 0.78,
  marginTop: 2,
};

function buildMatrix(assets: AssetSeries[]): { symbols: string[]; cells: Cell[][] } {
  const monthly = assets
    .map((a) => ({ symbol: a.symbol, changes: monthlyChanges(a) }))
    .filter((a) => a.changes.size >= 3);
  const symbols = monthly.map((m) => m.symbol);
  const cells = monthly.map((left) => monthly.map((right) => {
    if (left.symbol === right.symbol) return { a: left.symbol, b: right.symbol, r: 1, n: left.changes.size };
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [month, x] of left.changes) {
      const y = right.changes.get(month);
      if (y == null) continue;
      xs.push(x);
      ys.push(y);
    }
    return {
      a: left.symbol,
      b: right.symbol,
      r: xs.length >= 6 ? pearson(xs, ys) : null,
      n: xs.length,
    };
  }));
  return { symbols, cells };
}

function monthlyChanges(asset: AssetSeries): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const bar of asset.bars) {
    if (!Number.isFinite(bar.close)) continue;
    byMonth.set(monthKey(bar.ts), bar.close);
  }
  const rows = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b));
  const out = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1][1];
    const cur = rows[i][1];
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    out.set(rows[i][0], Math.abs(prev) > 0.000001 ? cur / prev - 1 : cur - prev);
  }
  return out;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function colorFor(r: number): string {
  const t = Math.min(1, Math.abs(r));
  const alpha = 0.28 + t * 0.62;
  return r >= 0
    ? `rgba(80, 111, 153, ${alpha})`
    : `rgba(161, 73, 73, ${alpha})`;
}

function explain(cells: Cell[]): string {
  const pairs = cells
    .filter((c) => c.a !== c.b && c.r != null)
    .sort((a, b) => Math.abs((b.r ?? 0)) - Math.abs((a.r ?? 0)));
  const top = pairs[0];
  if (!top || top.r == null) return 'Monthly alignment did not find enough shared observations for pairwise correlation.';
  const direction = top.r >= 0 ? 'positive' : 'negative';
  return `Monthly change correlations are computed after calendar-month alignment, which is more reliable for mixed macro and market frequencies. The strongest relationship here is ${top.a}/${top.b} at ${top.r.toFixed(2)} (${direction}, ${top.n} shared months).`;
}

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 0 ? num / denom : 0;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
