/**
 * DrawdownChart — underwater equity curves: a series per asset showing the
 * percentage drawdown from running peak. Always negative-valued; floor anchored.
 *
 * Explainer surfaces: deepest DD per asset, when it occurred, recovery duration.
 */

import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { DrawdownSeries } from '../../../lib/historicalResearchAnalytics';
import { Explainer } from './Explainer';
import { seriesColor } from './palette';

interface Row { ts: number; [symbol: string]: number }

export const DrawdownChart: React.FC<{ drawdowns: DrawdownSeries[] }> = ({ drawdowns }) => {
  const rows = useMemo<Row[]>(() => {
    if (!drawdowns.length) return [];
    const tsMap = new Map<number, Row>();
    for (const d of drawdowns) {
      for (const p of d.series) {
        let r = tsMap.get(p.ts);
        if (!r) { r = { ts: p.ts }; tsMap.set(p.ts, r); }
        r[d.symbol] = p.dd * 100;
      }
    }
    return Array.from(tsMap.values()).sort((a, b) => a.ts - b.ts);
  }, [drawdowns]);

  if (rows.length === 0) return null;

  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} syncId="hr-time">
            <defs>
              {drawdowns.map((d, i) => (
                <linearGradient key={d.symbol} id={`ddgrad-${d.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={seriesColor(i)} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={seriesColor(i)} stopOpacity={0.32} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="ts" tickFormatter={fmtDate} stroke="var(--muted-foreground)" fontSize={11} minTickGap={48} />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={11}
              width={42}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[(dataMin: number) => Math.min(-5, dataMin), 0]}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              labelFormatter={fmtDate}
              formatter={(v: number) => `${v.toFixed(2)}%`}
            />
            {drawdowns.map((d, i) => (
              <Area
                key={d.symbol}
                type="monotone"
                dataKey={d.symbol}
                stroke={seriesColor(i)}
                strokeWidth={1.5}
                fill={`url(#ddgrad-${d.symbol})`}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Explainer text={explain(drawdowns)} />
    </div>
  );
};

function explain(drawdowns: DrawdownSeries[]): string {
  const parts: string[] = [];
  for (const d of drawdowns.slice(0, 3)) {
    const dd = d.deepest;
    const dDate = isoDate(dd.troughTs);
    const recovered = dd.recoveredTs ? `Recovery took ${formatDuration(dd.durationDays)}.` : `Has not yet recovered.`;
    const current = Math.abs(d.current) < 0.005
      ? 'currently at or near new highs.'
      : `currently ${pct(d.current)} below peak.`;
    parts.push(`${d.symbol}: deepest drawdown ${pct(dd.dd)} (trough ${dDate}). ${recovered} ${current}`);
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

function formatDuration(days: number): string {
  if (days < 60) return `${days} days`;
  const months = Math.round(days / 30);
  if (months < 24) return `${months} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}
