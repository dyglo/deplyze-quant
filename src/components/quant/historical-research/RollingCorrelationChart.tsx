import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import type { RollingCorrelation } from '../../../hooks/useHistoricalResearch';
import { clipEventsToWindow, categoryTint } from './events';

export const RollingCorrelationChart: React.FC<{
  corr: RollingCorrelation;
  showRecessions?: boolean;
}> = ({ corr, showRecessions = true }) => {
  const data = useMemo(() => corr.series.map((p) => ({ ts: p.ts, r: p.r })), [corr.series]);
  const recessions = useMemo(() => {
    if (!showRecessions || data.length === 0) return [];
    return clipEventsToWindow(data[0].ts, data[data.length - 1].ts, new Set(['recession']));
  }, [data, showRecessions]);

  if (!data.length) return <Empty />;

  return (
    <div>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6, fontSize: 12, color: 'var(--muted-foreground)',
      }}>
        <span>
          <strong style={{ color: 'var(--foreground)' }}>{corr.a} vs {corr.b}</strong>
          {' · '}{corr.window}-bar rolling Pearson
        </span>
        <span>Full-window r = <strong style={{ color: 'var(--foreground)' }}>{corr.overall.toFixed(2)}</strong></span>
      </header>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} syncId="hr-time">
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
            {recessions.map((rec) => (
              rec.endTs != null && (
                <ReferenceArea
                  key={`rec-${rec.startTs}`}
                  x1={rec.startTs}
                  x2={rec.endTs}
                  stroke="none"
                  fill={categoryTint(rec.category)}
                  fillOpacity={0.1}
                  ifOverflow="hidden"
                />
              )
            ))}
            <XAxis
              dataKey="ts"
              tickFormatter={fmtDate}
              stroke="var(--muted-foreground)"
              fontSize={11}
              minTickGap={48}
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
            />
            <YAxis
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
              stroke="var(--muted-foreground)"
              fontSize={11}
              width={36}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              labelFormatter={fmtDate}
              formatter={(v: number) => v.toFixed(2)}
            />
            <Line type="monotone" dataKey="r" stroke="var(--primary)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const Empty: React.FC = () => (
  <div style={{ padding: 12, color: 'var(--muted-foreground)', fontSize: 12 }}>
    Not enough overlapping history to compute a rolling correlation.
  </div>
);

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
