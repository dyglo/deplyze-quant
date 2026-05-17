import React, { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface MiniTrendChartProps {
  data: Array<{ ts: number; value: number }>;
  height?: number;
  color?: string;
  label?: string;
  unit?: string;
  showAxis?: boolean;
}

const CustomTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string; unit?: string }> = ({
  active, payload, unit,
}) => {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div style={{
      background: 'var(--popover)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '4px 8px', fontSize: 11,
    }}>
      <span style={{ fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
        {v?.toFixed(2)}{unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
};

export const MiniTrendChart: React.FC<MiniTrendChartProps> = ({
  data, height = 120, color, label, unit, showAxis = false,
}) => {
  const chartData = useMemo(() =>
    data.map((d) => ({
      ts: d.ts,
      value: d.value,
      date: new Date(d.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    })),
    [data],
  );

  if (!data.length) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--muted-foreground)', fontSize: 11,
      }}>
        No data
      </div>
    );
  }

  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const up = last >= first;
  const stroke = color ?? (up ? '#4E6040' : 'var(--primary)');
  const fill = `color-mix(in srgb, ${stroke} 18%, transparent)`;

  return (
    <div>
      {label && (
        <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
          {showAxis && (
            <>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={32} />
            </>
          )}
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <defs>
            <linearGradient id={`grad-${stroke.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            fill={fill}
            dot={false}
            activeDot={{ r: 3, fill: stroke, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
