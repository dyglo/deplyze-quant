import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, Brush, ResponsiveContainer,
} from 'recharts';
import type { AssetSeries } from '../../../hooks/useHistoricalResearch';
import { clipEventsToWindow, categoryTint, type EventCategory, type MacroEvent } from './events';
import { EventsToggle } from './EventsToggle';
import { seriesColor } from './palette';

interface Row { ts: number; [symbol: string]: number }

interface Props {
  assets: AssetSeries[];
  /** Display the Brush range selector. Defaults to true. */
  showBrush?: boolean;
}

export const NormalizedChart: React.FC<Props> = ({ assets, showBrush = true }) => {
  const [enabledCategories, setEnabledCategories] = useState<Set<EventCategory>>(
    () => new Set<EventCategory>(['recession']),
  );

  const rows = useMemo<Row[]>(() => {
    if (!assets.length) return [];
    const tsSet = new Map<number, Row>();
    assets.forEach((a) => {
      a.normalized.forEach((p) => {
        let r = tsSet.get(p.ts);
        if (!r) { r = { ts: p.ts }; tsSet.set(p.ts, r); }
        r[a.symbol] = p.v;
      });
    });
    return Array.from(tsSet.values()).sort((a, b) => a.ts - b.ts);
  }, [assets]);

  const events = useMemo(() => {
    if (rows.length === 0) return [] as MacroEvent[];
    return clipEventsToWindow(rows[0].ts, rows[rows.length - 1].ts, enabledCategories);
  }, [rows, enabledCategories]);

  if (!rows.length) return null;

  return (
    <div>
      <div style={controlsRow}>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
          {events.length === 0 ? 'No event overlays' : `${events.length} event${events.length === 1 ? '' : 's'} overlaid`}
        </span>
        <EventsToggle enabled={enabledCategories} onChange={setEnabledCategories} />
      </div>
      <div style={{ height: showBrush ? 380 : 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} syncId="hr-time">
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
            {events.map((e) => (
              e.endTs == null
                ? (
                  <ReferenceLine
                    key={`shock-${e.startTs}-${e.label}`}
                    x={e.startTs}
                    stroke={categoryTint(e.category)}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    ifOverflow="hidden"
                    label={{
                      value: e.label,
                      position: 'top',
                      fontSize: 9,
                      fill: categoryTint(e.category),
                    }}
                  />
                )
                : (
                  <ReferenceArea
                    key={`band-${e.startTs}-${e.label}`}
                    x1={e.startTs}
                    x2={e.endTs}
                    stroke="none"
                    fill={categoryTint(e.category)}
                    fillOpacity={0.1}
                    ifOverflow="hidden"
                    label={{
                      value: e.label,
                      position: 'insideTopLeft',
                      fontSize: 9,
                      fill: categoryTint(e.category),
                    }}
                  />
                )
            ))}
            <XAxis
              dataKey="ts"
              tickFormatter={fmtDate}
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickMargin={6}
              minTickGap={48}
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={11}
              width={48}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 12,
              }}
              labelFormatter={fmtDate}
              formatter={(v: number) => v.toFixed(2)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="line" />
            {assets.map((a, i) => (
              <Line
                key={a.symbol}
                type="monotone"
                dataKey={a.symbol}
                stroke={seriesColor(i)}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            {showBrush && (
              <Brush
                dataKey="ts"
                height={28}
                stroke="var(--muted-foreground)"
                fill="var(--muted)"
                tickFormatter={fmtDate}
                travellerWidth={8}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const controlsRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
