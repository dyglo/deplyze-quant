import React from 'react';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MacroSeriesPoint } from '../../types';
import { ChartFrame } from './ChartDownloadButton';

export const MacroSeriesChart: React.FC<{
  points: MacroSeriesPoint[];
  unit?: string;
  height?: number;
  color?: string;
  title?: string;
  seriesId?: string;
}> = ({ points, unit, height = 200, color = 'var(--chart-3)', title, seriesId }) => {
  const data = points.map((p) => ({
    t: new Date(p.ts).toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
    v: p.value,
  }));

  const filename = seriesId
    ? `macro-${seriesId.toLowerCase()}.png`
    : 'macro-series.png';

  return (
    <ChartFrame title={title} filename={filename}>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} unit={unit} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
