/**
 * RiskReturnScatter — classic risk/return positioning: x = annualised vol,
 * y = CAGR. One point per asset, labels rendered next to the point. The
 * benchmark (if present in the plan) renders with a different glyph.
 */

import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';
import type { PerformanceRow } from '../../../lib/historicalResearchAnalytics';
import { Explainer } from './Explainer';

interface Props {
  rows: PerformanceRow[];
  benchmark?: string | null;
}

export const RiskReturnScatter: React.FC<Props> = ({ rows, benchmark }) => {
  const points = useMemo(() => rows.map((r) => ({
    x: r.annVol * 100,
    y: r.cagr * 100,
    symbol: r.symbol,
    sharpe: r.sharpe,
    isBenchmark: benchmark && r.symbol === benchmark,
  })), [rows, benchmark]);

  if (!points.length) return null;

  return (
    <div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} />
            <XAxis
              type="number"
              dataKey="x"
              name="Volatility"
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              label={{
                value: 'Annualised volatility',
                position: 'insideBottom', offset: -2,
                fontSize: 10, fill: 'var(--muted-foreground)',
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="CAGR"
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              label={{
                value: 'CAGR',
                angle: -90,
                position: 'insideLeft', offset: 10,
                fontSize: 10, fill: 'var(--muted-foreground)',
              }}
            />
            <ZAxis type="number" range={[100, 100]} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              formatter={(v: number, name: string) => {
                if (name === 'CAGR' || name === 'Volatility') return `${v.toFixed(1)}%`;
                return v.toFixed(2);
              }}
              labelFormatter={() => ''}
            />
            <Scatter data={points} fill="var(--primary)">
              <LabelList
                dataKey="symbol"
                position="top"
                style={{ fontSize: 11, fill: 'var(--foreground)' }}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <Explainer text={explain(rows, benchmark)} />
    </div>
  );
};

function explain(rows: PerformanceRow[], benchmark?: string | null): string {
  if (rows.length === 0) return '';
  const bestEfficient = rows.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  const highestVol = rows.reduce((a, b) => (b.annVol > a.annVol ? b : a));
  const parts: string[] = [];
  parts.push(`Best risk-adjusted (Sharpe): ${bestEfficient.symbol} at ${bestEfficient.sharpe.toFixed(2)} (CAGR ${pct(bestEfficient.cagr)} on ${pct(bestEfficient.annVol)} vol).`);
  parts.push(`Highest volatility: ${highestVol.symbol} at ${pct(highestVol.annVol)}.`);
  if (benchmark && rows.find((r) => r.symbol === benchmark)) {
    const bm = rows.find((r) => r.symbol === benchmark)!;
    const beat = rows.filter((r) => r.symbol !== benchmark && r.cagr > bm.cagr).map((r) => r.symbol);
    if (beat.length) parts.push(`Beat the benchmark ${benchmark} on CAGR: ${beat.join(', ')}.`);
  }
  return parts.join(' ');
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }
