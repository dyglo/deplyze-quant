import React from 'react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import type { OHLCVBar } from '../../types';
import { ChartFrame } from './ChartDownloadButton';

function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export const OHLCVChart: React.FC<{
  bars: OHLCVBar[];
  height?: number;
  title?: string;
  symbol?: string;
  showVolume?: boolean;
}> = ({ bars, height = 220, title, symbol, showVolume = false }) => {
  const data = bars.map((b) => ({
    t: new Date(b.ts).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
    close: b.close,
    volume: b.volume,
  }));

  const firstClose = bars[0]?.close ?? 0;
  const lastClose = bars[bars.length - 1]?.close ?? 0;
  const isUp = lastClose >= firstClose;
  const lineColor = isUp ? 'var(--ds-gain)' : 'var(--ds-loss)';
  const gradientId = `ohlcvFill_${symbol ?? 'default'}`.replace(/[^a-zA-Z0-9_]/g, '_');

  const maxVol = Math.max(...data.map((d) => d.volume ?? 0), 1);
  const filename = symbol
    ? `${symbol.toLowerCase().replace(/\//g, '-')}-ohlcv.png`
    : 'ohlcv-chart.png';

  return (
    <ChartFrame title={title} filename={filename}>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="price"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={['auto', 'auto']}
            />
            {showVolume && (
              <YAxis
                yAxisId="vol"
                orientation="right"
                hide
                domain={[0, maxVol * 5]}
              />
            )}
            <Tooltip
              contentStyle={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 12,
              }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 11 }}
              formatter={(value: number, name: string) => {
                if (name === 'volume') return [fmtVol(value), 'Volume'];
                return [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`, 'Close'];
              }}
            />
            {showVolume && (
              <Bar
                yAxisId="vol"
                dataKey="volume"
                fill="var(--muted-foreground)"
                fillOpacity={0.25}
                radius={[1, 1, 0, 0]}
              />
            )}
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke={lineColor}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
