/**
 * CycleSnapshotTable — compact latest/change/z-score view for all report series.
 *
 * Works for both macro and market data. Market-like series use percentage
 * changes; macro rates/levels use point changes so inflation, fed funds and GDP
 * do not get presented as misleading investment returns.
 */

import React, { useMemo } from 'react';
import type { AssetSeries } from '../../../hooks/useHistoricalResearch';
import { Explainer } from './Explainer';

interface Props {
  assets: AssetSeries[];
}

interface Row {
  symbol: string;
  latest: number;
  change1y: number | null;
  change3y: number | null;
  windowChange: number | null;
  z: number | null;
  macro: boolean;
  points: number;
}

const MACRO_SERIES_IDS = new Set([
  'CPI', 'INFLATION', 'FEDFUNDS', 'DGS2', 'DGS3M', 'DGS5', 'DGS10',
  'DGS20', 'DGS30', 'T10Y2Y', 'DFII10', 'T5YIE', 'UNRATE', 'UNEMP',
  'GDP', 'RETAILSALES',
]);

export const CycleSnapshotTable: React.FC<Props> = ({ assets }) => {
  const rows = useMemo(() => assets.map(buildRow).filter(Boolean) as Row[], [assets]);
  if (!rows.length) return null;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={thLeft}>Series</th>
              <th style={th}>Latest</th>
              <th style={th}>1Y change</th>
              <th style={th}>3Y change</th>
              <th style={th}>Window</th>
              <th style={th}>Cycle z</th>
              <th style={th}>Obs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <td style={tdLeft}>
                  <div style={{ fontWeight: 700 }}>{r.symbol}</div>
                  <div style={sub}>{r.macro ? 'macro level/rate' : 'market price proxy'}</div>
                </td>
                <td style={td}>{fmtLevel(r.latest)}</td>
                <td style={td}>{fmtChange(r.change1y, r.macro)}</td>
                <td style={td}>{fmtChange(r.change3y, r.macro)}</td>
                <td style={td}>{fmtChange(r.windowChange, r.macro)}</td>
                <td style={{ ...td, color: zColor(r.z) }}>{r.z == null ? 'n/a' : r.z.toFixed(2)}</td>
                <td style={td}>{r.points.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explainer text={explain(rows)} />
    </div>
  );
};

const th: React.CSSProperties = {
  textAlign: 'right',
  fontSize: 10,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--muted-foreground)',
  padding: '0 10px 8px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

const thLeft: React.CSSProperties = { ...th, textAlign: 'left' };

const td: React.CSSProperties = {
  textAlign: 'right',
  padding: '10px',
  borderBottom: '1px dashed var(--border)',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const tdLeft: React.CSSProperties = { ...td, textAlign: 'left' };

const sub: React.CSSProperties = {
  fontSize: 10.5,
  color: 'var(--muted-foreground)',
  marginTop: 2,
};

function buildRow(asset: AssetSeries): Row | null {
  const bars = asset.bars.filter((b) => Number.isFinite(b.close)).sort((a, b) => a.ts - b.ts);
  if (bars.length < 2) return null;
  const latest = bars[bars.length - 1];
  const first = bars[0];
  const macro = MACRO_SERIES_IDS.has(asset.symbol.toUpperCase());
  const vals = bars.map((b) => b.close);
  const avg = mean(vals);
  const sd = stddev(vals);
  return {
    symbol: asset.symbol,
    latest: latest.close,
    change1y: changeFrom(bars, latest.ts - 365.25 * 86400_000, macro),
    change3y: changeFrom(bars, latest.ts - 3 * 365.25 * 86400_000, macro),
    windowChange: macro ? latest.close - first.close : latest.close / first.close - 1,
    z: sd > 0 ? (latest.close - avg) / sd : null,
    macro,
    points: bars.length,
  };
}

function changeFrom(
  bars: AssetSeries['bars'],
  targetTs: number,
  macro: boolean,
): number | null {
  const latest = bars[bars.length - 1];
  let base = bars[0];
  for (const b of bars) {
    if (b.ts <= targetTs) base = b;
    else break;
  }
  if (!base || base.ts === latest.ts) return null;
  return macro ? latest.close - base.close : latest.close / base.close - 1;
}

function explain(rows: Row[]): string {
  const extremes = rows
    .filter((r) => r.z != null)
    .sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  const top = extremes[0];
  return top && top.z != null
    ? `Cycle z compares the latest reading with that series' own report-window distribution. ${top.symbol} is currently the furthest from its own average at ${top.z.toFixed(2)} standard deviations.`
    : '';
}

function fmtLevel(v: number): string {
  if (!Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtChange(v: number | null, macro: boolean): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  if (macro) return `${v >= 0 ? '+' : ''}${fmtLevel(v)} pts`;
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

function zColor(v: number | null): string {
  if (v == null) return 'var(--muted-foreground)';
  if (v >= 1) return 'var(--success, #6aa36f)';
  if (v <= -1) return 'var(--destructive, #c75450)';
  return 'var(--foreground)';
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}
