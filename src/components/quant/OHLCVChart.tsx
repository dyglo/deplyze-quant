import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { OHLCVBar } from '../../types';
import { ChartFrame } from './ChartDownloadButton';

export const OHLCVChart: React.FC<{
  bars: OHLCVBar[];
  height?: number;
  title?: string;
  symbol?: string;
}> = ({ bars, height = 220, title, symbol }) => {
  const data = bars.map((b) => ({
    t: new Date(b.ts).toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
    close: b.close,
  }));

  const filename = symbol
    ? `${symbol.toLowerCase().replace(/\//g, '-')}-ohlcv.png`
    : 'ohlcv-chart.png';

  return (
    <ChartFrame title={title} filename={filename}>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ohlcvFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <Area type="monotone" dataKey="close" stroke="var(--chart-1)" strokeWidth={1.5} fill="url(#ohlcvFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
