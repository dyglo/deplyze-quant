/**
 * SeriesSmallMultiples — raw-level small multiples for mixed-unit research.
 *
 * Normalized charts are useful for path comparison, but macro + market prompts
 * often mix rates, index levels, ETFs, commodities and dollar proxies. Small
 * multiples keep every requested series visible with its own y-axis.
 */

import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { AssetSeries } from '../../../hooks/useHistoricalResearch';
import { Explainer } from './Explainer';
import { seriesColor } from './palette';

interface Props {
  assets: AssetSeries[];
}

export const SeriesSmallMultiples: React.FC<Props> = ({ assets }) => {
  const panels = useMemo(() => assets.map((a, i) => ({
    symbol: a.symbol,
    color: seriesColor(i),
    data: downsample(a.bars.map((b) => ({ ts: b.ts, value: b.close })), 700),
  })).filter((p) => p.data.length > 1), [assets]);

  if (!panels.length) return null;

  return (
    <div>
      <div style={gridStyle}>
        {panels.map((p) => (
          <div key={p.symbol} style={panelStyle}>
            <div style={panelHeader}>
              <span style={{ color: p.color }}>●</span>
              <span>{p.symbol}</span>
            </div>
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={p.data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeOpacity={0.35} vertical={false} />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={fmtDate}
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickMargin={5}
                    minTickGap={44}
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    scale="time"
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    width={46}
                    tickFormatter={fmtValue}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={fmtDate}
                    formatter={(v: number) => fmtValue(v)}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={p.color}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
      <Explainer text={explain(panels)} />
    </div>
  );
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
};

const panelStyle: React.CSSProperties = {
  minWidth: 0,
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 8px 6px',
  background: 'var(--muted)',
};

const panelHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 4,
};

function downsample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}

function explain(panels: Array<{ symbol: string; data: Array<{ value: number }> }>): string {
  const spans = panels.map((p) => {
    const vals = p.data.map((d) => d.value).filter(Number.isFinite);
    return { symbol: p.symbol, span: vals.length ? Math.max(...vals) - Math.min(...vals) : 0 };
  }).sort((a, b) => b.span - a.span);
  const leader = spans[0];
  return leader
    ? `Raw-level panels keep unlike units separate. ${leader.symbol} had the widest raw range in this window; use this view to inspect timing before relying on normalized comparisons.`
    : '';
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtValue(v: number): string {
  if (!Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}
