/**
 * RollingVolChart — 60-bar annualised volatility per asset. Synced to other
 * time-series widgets via `syncId="hr-time"`.
 */

import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { RollingVolSeries } from '../../../lib/historicalResearchAnalytics';
import { Explainer } from './Explainer';
import { seriesColor } from './palette';

interface Row { ts: number; [symbol: string]: number }

export const RollingVolChart: React.FC<{ rollingVols: RollingVolSeries[] }> = ({ rollingVols }) => {
  const rows = useMemo<Row[]>(() => {
    if (!rollingVols.length) return [];
    const tsMap = new Map<number, Row>();
    for (const rv of rollingVols) {
      for (const p of rv.series) {
        let r = tsMap.get(p.ts);
        if (!r) { r = { ts: p.ts }; tsMap.set(p.ts, r); }
        r[rv.symbol] = p.vol * 100;
      }
    }
    return Array.from(tsMap.values()).sort((a, b) => a.ts - b.ts);
  }, [rollingVols]);

  if (rows.length === 0) return null;

  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} syncId="hr-time">
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="ts" tickFormatter={fmtDate} stroke="var(--muted-foreground)" fontSize={11} minTickGap={48} />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={11}
              width={42}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              labelFormatter={fmtDate}
              formatter={(v: number) => `${v.toFixed(1)}%`}
            />
            {rollingVols.map((rv, i) => (
              <Line
                key={rv.symbol}
                type="monotone"
                dataKey={rv.symbol}
                stroke={seriesColor(i)}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Explainer text={explain(rollingVols)} />
    </div>
  );
};

function explain(rvs: RollingVolSeries[]): string {
  if (!rvs.length) return '';
  const parts: string[] = [];
  for (const rv of rvs.slice(0, 3)) {
    if (rv.series.length === 0) continue;
    const values = rv.series.map((p) => p.vol);
    const last = values[values.length - 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const lastDate = isoDate(rv.series[rv.series.length - 1].ts);
    parts.push(
      `${rv.symbol}: 60-bar annualised vol ranged from ${pct(min)} to ${pct(max)} (avg ${pct(avg)}); latest ${pct(last)} as of ${lastDate}.`,
    );
  }
  return parts.join(' ');
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }

function isoDate(ts: number): string {
  if (!Number.isFinite(ts) || ts === 0) return '—';
  return new Date(ts).toISOString().slice(0, 10);
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
