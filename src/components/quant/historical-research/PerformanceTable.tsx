/**
 * PerformanceTable — institutional risk/return summary per asset.
 *
 * Columns: Total return · CAGR · Ann. vol · Sharpe · Sortino · Max DD · Calmar · Skew · Kurtosis · Bars.
 * The generated explainer focuses on the headline pattern (best CAGR, deepest DD,
 * who has the cleanest Sharpe) rather than reading every cell aloud.
 */

import React from 'react';
import type { PerformanceRow } from '../../../lib/historicalResearchAnalytics';
import { Explainer } from './Explainer';

export const PerformanceTable: React.FC<{ rows: PerformanceRow[] }> = ({ rows }) => {
  if (!rows.length) return null;

  const headers = [
    { key: 'totalReturn', label: 'Total',   fmt: pct },
    { key: 'cagr',        label: 'CAGR',    fmt: pct },
    { key: 'annVol',      label: 'Vol',     fmt: pct },
    { key: 'sharpe',      label: 'Sharpe',  fmt: dec2 },
    { key: 'sortino',     label: 'Sortino', fmt: dec2 },
    { key: 'maxDrawdown', label: 'Max DD',  fmt: pct },
    { key: 'calmar',      label: 'Calmar',  fmt: dec2 },
    { key: 'skew',        label: 'Skew',    fmt: dec2 },
    { key: 'kurtosis',    label: 'Kurt',    fmt: dec2 },
  ] as const;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thFirst}>Asset</th>
              {headers.map((h) => (
                <th key={h.key} style={th}>{h.label}</th>
              ))}
              <th style={th}>Bars</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <td style={tdFirst}>{r.symbol}</td>
                {headers.map((h) => {
                  const v = r[h.key] as number;
                  return (
                    <td
                      key={h.key}
                      style={{
                        ...td,
                        color: signColor(h.key, v),
                      }}
                    >
                      {h.fmt(v)}
                    </td>
                  );
                })}
                <td style={td}>{r.bars.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explainer text={explain(rows)} />
    </div>
  );
};

function explain(rows: PerformanceRow[]): string {
  if (rows.length === 0) return '';
  const best = rows.reduce((a, b) => (b.cagr > a.cagr ? b : a));
  const worst = rows.reduce((a, b) => (b.maxDrawdown < a.maxDrawdown ? b : a));
  const bestSharpe = rows.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  const tail = rows.find((r) => Math.abs(r.kurtosis) >= 3);

  const parts: string[] = [];
  parts.push(
    rows.length === 1
      ? `${best.symbol} compounded at ${pct(best.cagr)} per year with ${pct(best.annVol)} annualised volatility.`
      : `${best.symbol} led on CAGR (${pct(best.cagr)}); ${bestSharpe.symbol} had the cleanest risk-adjusted return (Sharpe ${dec2(bestSharpe.sharpe)}).`,
  );
  parts.push(`Deepest drawdown over the window: ${worst.symbol} at ${pct(worst.maxDrawdown)}.`);
  if (tail) {
    parts.push(`${tail.symbol} carries elevated kurtosis (${dec2(tail.kurtosis)}) — fatter tails than a normal distribution.`);
  }
  return parts.join(' ');
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }
function dec2(x: number): string { return Number.isFinite(x) ? x.toFixed(2) : '—'; }

function signColor(key: string, v: number): string {
  if (key === 'totalReturn' || key === 'cagr') {
    return v > 0 ? 'var(--success, #4E6040)' : v < 0 ? 'var(--destructive, #c75450)' : 'var(--foreground)';
  }
  if (key === 'maxDrawdown') return 'var(--destructive, #c75450)';
  return 'var(--foreground)';
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
};

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '6px 10px',
  fontWeight: 500,
  color: 'var(--muted-foreground)',
  borderBottom: '1px solid var(--border)',
  fontSize: 10.5,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  fontFamily: 'system-ui, sans-serif',
};

const thFirst: React.CSSProperties = { ...th, textAlign: 'left' };

const td: React.CSSProperties = {
  textAlign: 'right',
  padding: '7px 10px',
  borderBottom: '1px dashed var(--border)',
  color: 'var(--foreground)',
};

const tdFirst: React.CSSProperties = {
  ...td,
  textAlign: 'left',
  fontWeight: 500,
};
