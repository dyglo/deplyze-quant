import React, { useMemo, useState } from 'react';
import {
  Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Brush, Legend,
} from 'recharts';
import type { MacroSeriesPoint } from '../../types';

export interface MacroSeriesEntry {
  id: string;
  name: string;
  unit: string;
  color: string;
  points: MacroSeriesPoint[];
}

export type MacroRange = '1Y' | '5Y' | '10Y' | 'MAX';
export type MacroScale = 'indexed' | 'raw';

interface RowDatum {
  ts: number;
  dateLabel: string;
  [seriesId: string]: number | string;
}

const RANGE_MS: Record<MacroRange, number | null> = {
  '1Y': 365 * 86_400_000,
  '5Y': 5 * 365 * 86_400_000,
  '10Y': 10 * 365 * 86_400_000,
  'MAX': null,
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function buildMergedRows(series: MacroSeriesEntry[], cutoffTs: number | null): RowDatum[] {
  const byTs = new Map<number, RowDatum>();
  for (const s of series) {
    for (const p of s.points) {
      if (cutoffTs != null && p.ts < cutoffTs) continue;
      let row = byTs.get(p.ts);
      if (!row) {
        row = { ts: p.ts, dateLabel: fmtDate(p.ts) };
        byTs.set(p.ts, row);
      }
      row[s.id] = p.value;
    }
  }
  return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
}

/** Forward-fill series values across the merged timeline so lines don't break
 *  when one series is monthly and another quarterly. */
function forwardFill(rows: RowDatum[], ids: string[]): RowDatum[] {
  const last: Record<string, number | undefined> = {};
  return rows.map((r) => {
    const out: RowDatum = { ts: r.ts, dateLabel: r.dateLabel };
    for (const id of ids) {
      const v = r[id];
      if (typeof v === 'number') { last[id] = v; out[id] = v; }
      else if (last[id] != null) { out[id] = last[id] as number; }
    }
    return out;
  });
}

/** Rebase each active series to 100 at the first row where it has a value. */
function rebase(rows: RowDatum[], ids: string[]): RowDatum[] {
  const base: Record<string, number | undefined> = {};
  for (const r of rows) {
    for (const id of ids) {
      if (base[id] == null && typeof r[id] === 'number' && r[id] !== 0) {
        base[id] = r[id] as number;
      }
    }
  }
  return rows.map((r) => {
    const out: RowDatum = { ts: r.ts, dateLabel: r.dateLabel };
    for (const id of ids) {
      const v = r[id];
      const b = base[id];
      if (typeof v === 'number' && b != null) out[id] = (v / b) * 100;
    }
    return out;
  });
}

/** Tooltip shows the *raw* value next to its unit, not the rebased value. */
const TooltipBody: React.FC<{
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  rawByTs: Map<number, Record<string, number | undefined>>;
  series: MacroSeriesEntry[];
  scale: MacroScale;
}> = ({ active, payload, label, rawByTs, series, scale }) => {
  if (!active || !payload?.length) return null;
  const ts = (payload[0] as unknown as { payload: RowDatum }).payload?.ts;
  const rawRow = ts != null ? rawByTs.get(ts) : undefined;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: 10, fontSize: 11, minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {payload.map((p) => {
          const s = series.find((x) => x.id === p.dataKey);
          if (!s) return null;
          const raw = rawRow?.[p.dataKey];
          const display = scale === 'raw' ? p.value : raw;
          const rebased = scale === 'indexed' ? p.value : null;
          return (
            <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                <span style={{ color: 'var(--foreground)' }}>{s.name}</span>
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', fontWeight: 600 }}>
                {display != null ? display.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                {s.unit && <span style={{ color: 'var(--muted-foreground)', marginLeft: 2 }}>{s.unit}</span>}
                {rebased != null && (
                  <span style={{ color: 'var(--muted-foreground)', marginLeft: 6, fontSize: 10 }}>
                    ({rebased.toFixed(1)})
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const MacroMultiChart: React.FC<{
  series: MacroSeriesEntry[];
  activeIds: string[];
  range: MacroRange;
  scale?: MacroScale;
  height?: number;
}> = ({ series, activeIds, range, scale = 'indexed', height = 360 }) => {
  const [brushDomain, setBrushDomain] = useState<[number, number] | null>(null);

  const cutoffTs = useMemo(() => {
    const ms = RANGE_MS[range];
    if (ms == null) return null;
    return Date.now() - ms;
  }, [range]);

  const active = useMemo(() => series.filter((s) => activeIds.includes(s.id)), [series, activeIds]);

  const merged = useMemo(() => {
    const m = buildMergedRows(active, cutoffTs);
    return forwardFill(m, activeIds);
  }, [active, cutoffTs, activeIds]);

  const rawByTs = useMemo(() => {
    const m = new Map<number, Record<string, number | undefined>>();
    for (const r of merged) {
      const rec: Record<string, number | undefined> = {};
      for (const id of activeIds) {
        const v = r[id];
        if (typeof v === 'number') rec[id] = v;
      }
      m.set(r.ts, rec);
    }
    return m;
  }, [merged, activeIds]);

  const data = useMemo(() => (scale === 'indexed' ? rebase(merged, activeIds) : merged), [merged, activeIds, scale]);

  const startIdx = brushDomain
    ? Math.max(0, data.findIndex((d) => d.ts >= brushDomain[0]))
    : undefined;
  const endIdx = brushDomain
    ? Math.max(0, (() => {
        for (let i = data.length - 1; i >= 0; i--) if (data[i].ts <= brushDomain[1]) return i;
        return data.length - 1;
      })())
    : undefined;

  if (!active.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
        Select at least one series.
      </div>
    );
  }
  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
        No data points in the selected range.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) =>
              scale === 'indexed'
                ? `${Math.round(v)}`
                : v.toLocaleString(undefined, { maximumFractionDigits: 1 })
            }
          />
          <Tooltip
            content={(props) => (
              <TooltipBody
                {...(props as object)}
                rawByTs={rawByTs}
                series={series}
                scale={scale}
              />
            )}
          />
          <Legend
            verticalAlign="top"
            height={24}
            iconType="plainline"
            wrapperStyle={{ fontSize: 11 }}
          />
          {active.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          <Brush
            dataKey="dateLabel"
            height={22}
            stroke="var(--primary)"
            travellerWidth={8}
            tickFormatter={() => ''}
            startIndex={startIdx}
            endIndex={endIdx}
            onChange={(b: { startIndex?: number; endIndex?: number }) => {
              if (b?.startIndex == null || b?.endIndex == null) return;
              const s = data[b.startIndex]?.ts;
              const e = data[b.endIndex]?.ts;
              if (s != null && e != null) setBrushDomain([s, e]);
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
