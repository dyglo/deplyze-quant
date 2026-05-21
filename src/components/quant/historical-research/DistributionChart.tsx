/**
 * DistributionChart — daily-return histogram per asset, with mean and ±1σ
 * reference lines. Multiple assets render as overlaid translucent bar series.
 */

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { ReturnDistribution } from '../../../lib/historicalResearchAnalytics';
import { Explainer } from './Explainer';
import { seriesColor } from './palette';

export const DistributionChart: React.FC<{ distributions: ReturnDistribution[] }> = ({ distributions }) => {
  // Merge buckets onto a common x grid (use the first asset's grid).
  const data = useMemo(() => {
    if (!distributions.length || !distributions[0].buckets.length) return [];
    const grid = distributions[0].buckets.map((b) => ({ mid: b.mid, [distributions[0].symbol]: b.count }));
    for (let k = 1; k < distributions.length; k++) {
      const d = distributions[k];
      // Project each bucket into the grid by nearest mid (cheap, good enough for vis)
      for (const b of d.buckets) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < grid.length; i++) {
          const dist = Math.abs((grid[i].mid as number) - b.mid);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        const cell = grid[bestIdx] as Record<string, number>;
        cell[d.symbol] = (cell[d.symbol] ?? 0) + b.count;
      }
    }
    return grid;
  }, [distributions]);

  if (!data.length) return null;

  const primary = distributions[0];

  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="mid"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} width={36} allowDecimals={false} />
            <ReferenceLine x={primary.mean} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <ReferenceLine x={primary.mean - primary.std} stroke="var(--border)" strokeDasharray="2 4" />
            <ReferenceLine x={primary.mean + primary.std} stroke="var(--border)" strokeDasharray="2 4" />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              labelFormatter={(v: number) => `${(v * 100).toFixed(2)}%`}
              formatter={(v: number) => `${v} days`}
            />
            {distributions.map((d, i) => (
              <Bar
                key={d.symbol}
                dataKey={d.symbol}
                fill={seriesColor(i)}
                fillOpacity={distributions.length > 1 ? 0.55 : 0.8}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Explainer text={explain(distributions)} />
    </div>
  );
};

function explain(d: ReturnDistribution[]): string {
  if (!d.length) return '';
  const parts: string[] = [];
  for (const dist of d.slice(0, 3)) {
    const dailyVol = `${(dist.std * 100).toFixed(2)}%`;
    const skewLabel = describeSkew(dist.skew);
    const tailLabel = describeKurtosis(dist.kurtosis);
    parts.push(`${dist.symbol}: daily σ ${dailyVol}, ${skewLabel} skew (${dist.skew.toFixed(2)}), ${tailLabel} (excess kurt ${dist.kurtosis.toFixed(2)}).`);
  }
  return parts.join(' ');
}

function describeSkew(s: number): string {
  if (s > 0.5) return 'positive';
  if (s < -0.5) return 'negative';
  if (Math.abs(s) < 0.1) return 'near-symmetric';
  return 'mild';
}

function describeKurtosis(k: number): string {
  if (k > 6) return 'very fat tails';
  if (k > 3) return 'fat tails';
  if (k > 1) return 'mildly heavy tails';
  if (k < -0.5) return 'thin tails';
  return 'near-normal tails';
}
