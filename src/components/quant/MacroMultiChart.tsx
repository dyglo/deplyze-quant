import React, { useMemo, useState } from 'react';
import {
  Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Brush, Legend,
  ReferenceArea,
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

/**
 * Series transform. The institutional point: you cannot meaningfully rebase a
 * *rate level* (Fed Funds, 10Y yield) to 100 the way you would a price — a move
 * from 2% to 4% is "+200bps", not "+100%". So the comparison primitives are:
 *   raw      — actual level (use when units already match)
 *   indexed  — rebase to 100 at the start of the visible window (price-like series)
 *   yoy      — year-over-year % change (inflation/growth framing)
 *   zscore   — standardized over full history; the only unit-free way to overlay
 *              a rate, a price index and a level on one axis without distortion
 */
export type MacroTransform = 'raw' | 'indexed' | 'yoy' | 'zscore';
// Back-compat alias for callers that still import MacroScale.
export type MacroScale = MacroTransform;

interface RowDatum {
  ts: number;
  [seriesId: string]: number;
}

const RANGE_MS: Record<MacroRange, number | null> = {
  '1Y': 365 * 86_400_000,
  '5Y': 5 * 365 * 86_400_000,
  '10Y': 10 * 365 * 86_400_000,
  'MAX': null,
};

const ONE_YEAR_MS = 365 * 86_400_000;

/**
 * NBER US recession windows (peak → trough). Shading these is the single most
 * expected macro overlay; a chart without them reads as incomplete to a pro.
 */
const NBER_RECESSIONS: Array<[string, string]> = [
  ['1969-12-01', '1970-11-01'],
  ['1973-11-01', '1975-03-01'],
  ['1980-01-01', '1980-07-01'],
  ['1981-07-01', '1982-11-01'],
  ['1990-07-01', '1991-03-01'],
  ['2001-03-01', '2001-11-01'],
  ['2007-12-01', '2009-06-01'],
  ['2020-02-01', '2020-04-01'],
];
const RECESSION_TS: Array<[number, number]> = NBER_RECESSIONS.map(
  ([a, b]) => [Date.parse(a), Date.parse(b)],
);

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Year-over-year % change, date-based (robust across daily/monthly/quarterly). */
function yoyTransform(points: MacroSeriesPoint[]): MacroSeriesPoint[] {
  const out: MacroSeriesPoint[] = [];
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    const target = points[i].ts - ONE_YEAR_MS;
    while (j + 1 < points.length && points[j + 1].ts <= target) j++;
    const prior = points[j].ts <= target ? points[j].value : null;
    if (prior != null && prior !== 0) {
      out.push({ ts: points[i].ts, value: ((points[i].value - prior) / Math.abs(prior)) * 100 });
    }
  }
  return out;
}

/** Z-score over the *full* series history (stable baseline, not window-relative). */
function zscoreTransform(points: MacroSeriesPoint[]): MacroSeriesPoint[] {
  const vals = points.map((p) => p.value);
  const m = mean(vals);
  const s = stdev(vals);
  if (s === 0) return points.map((p) => ({ ts: p.ts, value: 0 }));
  return points.map((p) => ({ ts: p.ts, value: (p.value - m) / s }));
}

/** Build the display points for one series under the chosen transform + window. */
function seriesDisplayPoints(
  points: MacroSeriesPoint[],
  mode: MacroTransform,
  cutoffTs: number | null,
): MacroSeriesPoint[] {
  if (!points.length) return [];
  const inWindow = (p: MacroSeriesPoint) => cutoffTs == null || p.ts >= cutoffTs;

  if (mode === 'raw') return points.filter(inWindow);

  if (mode === 'indexed') {
    // Rebase to 100 at the first value in the visible window.
    const vis = points.filter(inWindow);
    const base = vis.find((p) => p.value !== 0)?.value;
    if (base == null) return [];
    return vis.map((p) => ({ ts: p.ts, value: (p.value / base) * 100 }));
  }

  // yoy / zscore are computed on full history first, THEN windowed — so the
  // first visible point already carries a correct (non-truncated) value.
  const transformed = mode === 'yoy' ? yoyTransform(points) : zscoreTransform(points);
  return transformed.filter(inWindow);
}

const SUFFIX: Record<MacroTransform, string> = { raw: '', indexed: '', yoy: '%', zscore: 'σ' };

const TooltipBody: React.FC<{
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: number;
  rawByTs: Map<number, Record<string, number | undefined>>;
  series: MacroSeriesEntry[];
  mode: MacroTransform;
}> = ({ active, payload, rawByTs, series, mode }) => {
  if (!active || !payload?.length) return null;
  const ts = (payload[0] as unknown as { payload: RowDatum }).payload?.ts;
  const rawRow = ts != null ? rawByTs.get(ts) : undefined;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: 10, fontSize: 11, minWidth: 210, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {ts != null ? fmtDate(ts) : ''}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {payload.map((p) => {
          const s = series.find((x) => x.id === p.dataKey);
          if (!s) return null;
          const raw = rawRow?.[p.dataKey];
          const showsRaw = mode === 'raw';
          return (
            <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                <span style={{ color: 'var(--foreground)' }}>{s.name}</span>
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', fontWeight: 600 }}>
                {p.value != null ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                <span style={{ color: 'var(--muted-foreground)', marginLeft: 2 }}>{SUFFIX[mode] || s.unit}</span>
                {/* For transformed views, still surface the raw value for context. */}
                {!showsRaw && raw != null && (
                  <span style={{ color: 'var(--muted-foreground)', marginLeft: 6, fontSize: 10 }}>
                    ({raw.toLocaleString(undefined, { maximumFractionDigits: 2 })}{s.unit})
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
  scale?: MacroTransform;
  height?: number;
}> = ({ series, activeIds, range, scale = 'zscore', height = 360 }) => {
  const [brushDomain, setBrushDomain] = useState<[number, number] | null>(null);

  const cutoffTs = useMemo(() => {
    const ms = RANGE_MS[range];
    return ms == null ? null : Date.now() - ms;
  }, [range]);

  const active = useMemo(() => series.filter((s) => activeIds.includes(s.id)), [series, activeIds]);

  // Merge each series' transformed display points onto a shared time axis.
  const data = useMemo(() => {
    const byTs = new Map<number, RowDatum>();
    for (const s of active) {
      for (const p of seriesDisplayPoints(s.points, scale, cutoffTs)) {
        let row = byTs.get(p.ts);
        if (!row) { row = { ts: p.ts }; byTs.set(p.ts, row); }
        row[s.id] = p.value;
      }
    }
    const rows = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
    // Forward-fill so a quarterly series doesn't shatter a daily timeline.
    const last: Record<string, number | undefined> = {};
    for (const r of rows) {
      for (const s of active) {
        if (typeof r[s.id] === 'number') last[s.id] = r[s.id];
        else if (last[s.id] != null) r[s.id] = last[s.id] as number;
      }
    }
    return rows;
  }, [active, scale, cutoffTs]);

  // Raw values keyed by ts, for tooltip context under transformed views.
  const rawByTs = useMemo(() => {
    const m = new Map<number, Record<string, number | undefined>>();
    for (const s of active) {
      for (const p of s.points) {
        const rec = m.get(p.ts) ?? {};
        rec[s.id] = p.value;
        m.set(p.ts, rec);
      }
    }
    return m;
  }, [active]);

  const startIdx = brushDomain ? Math.max(0, data.findIndex((d) => d.ts >= brushDomain[0])) : undefined;
  const endIdx = brushDomain
    ? (() => { for (let i = data.length - 1; i >= 0; i--) if (data[i].ts <= brushDomain[1]) return i; return data.length - 1; })()
    : undefined;

  const visibleRecessions = useMemo(() => {
    if (!data.length) return [];
    const lo = data[0].ts, hi = data[data.length - 1].ts;
    return RECESSION_TS
      .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
      .filter(([a, b]) => b > a);
  }, [data]);

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

  const yTickFormatter = (v: number) =>
    scale === 'indexed' ? `${Math.round(v)}`
    : scale === 'yoy' ? `${v.toFixed(0)}%`
    : scale === 'zscore' ? `${v.toFixed(1)}σ`
    : v.toLocaleString(undefined, { maximumFractionDigits: 1 });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          {/* NBER recession shading */}
          {visibleRecessions.map(([x1, x2], i) => (
            <ReferenceArea key={i} x1={x1} x2={x2} fill="var(--muted-foreground)" fillOpacity={0.10} ifOverflow="hidden" />
          ))}
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickFormatter={fmtDate}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={yTickFormatter}
          />
          <Tooltip content={(props) => (
            <TooltipBody {...(props as object)} rawByTs={rawByTs} series={series} mode={scale} />
          )} />
          <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
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
            dataKey="ts"
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
