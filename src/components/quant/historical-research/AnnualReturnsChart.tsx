/**
 * AnnualReturnsChart — calendar-year P&L per asset.
 *
 * Grouped bars: x = year, y = pct return. Bars colored green/red by sign per
 * asset. Explainer surfaces best year, worst year, hit rate.
 */

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { AnnualReturnsRow } from '../../../lib/historicalResearchAnalytics';
import { Explainer } from './Explainer';
import { seriesColor } from './palette';

export const AnnualReturnsChart: React.FC<{ rows: AnnualReturnsRow[]; symbols: string[] }> = ({ rows, symbols }) => {
  const data = useMemo(
    () => rows.map((r) => ({
      year: r.year,
      ...Object.fromEntries(symbols.map((s) => [s, r.perAsset[s] != null ? r.perAsset[s]! * 100 : null])),
    })),
    [rows, symbols],
  );

  if (!data.length) return null;

  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={11}
              width={42}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              formatter={(v: number) => v != null ? `${v.toFixed(1)}%` : '—'}
            />
            {symbols.map((s, i) => (
              <Bar
                key={s}
                dataKey={s}
                fill={seriesColor(i)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Explainer text={explain(rows, symbols)} />
    </div>
  );
};

function explain(rows: AnnualReturnsRow[], symbols: string[]): string {
  if (!rows.length || !symbols.length) return '';
  const focus = symbols[0];
  const series = rows
    .map((r) => ({ year: r.year, v: r.perAsset[focus] }))
    .filter((p) => p.v != null) as { year: number; v: number }[];
  if (series.length === 0) return '';

  const best = series.reduce((a, b) => (b.v > a.v ? b : a));
  const worst = series.reduce((a, b) => (b.v < a.v ? b : a));
  const positive = series.filter((p) => p.v > 0).length;
  const hitRate = positive / series.length;
  const meanRet = series.reduce((s, p) => s + p.v, 0) / series.length;

  const parts: string[] = [];
  parts.push(`${focus}: best year ${best.year} at ${pct(best.v)}; worst year ${worst.year} at ${pct(worst.v)}.`);
  parts.push(`Positive in ${positive} of ${series.length} years (${pctFraction(hitRate)} hit rate). Mean annual return ${pct(meanRet)}.`);
  if (symbols.length > 1) {
    const sym2 = symbols[1];
    const diffYears = rows.filter((r) => {
      const a = r.perAsset[focus]; const b = r.perAsset[sym2];
      return a != null && b != null && Math.sign(a) !== Math.sign(b);
    }).length;
    if (diffYears > 0) {
      parts.push(`${focus} and ${sym2} diverged in sign across ${diffYears} of ${rows.length} years.`);
    }
  }
  return parts.join(' ');
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }
function pctFraction(x: number): string { return `${(x * 100).toFixed(0)}%`; }
