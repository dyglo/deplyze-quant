import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ReferenceArea,
} from 'recharts';
import type { MacroSeries } from '../../types';

interface LoadedMap {
  DGS2?: MacroSeries | null;
  DGS5?: MacroSeries | null;
  DGS10?: MacroSeries | null;
  DGS20?: MacroSeries | null;
  DGS30?: MacroSeries | null;
  T10Y2Y?: MacroSeries | null;
}

interface Props { loaded: LoadedMap; }

const AXIS = { fontSize: 10, fill: 'var(--muted-foreground)' };
const GRID = { stroke: 'var(--border)', strokeDasharray: '2 4' };
const TIP: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, padding: '6px 10px' };

const TENORS = [
  { key: 'DGS2',  label: '2Y' },
  { key: 'DGS5',  label: '5Y' },
  { key: 'DGS10', label: '10Y' },
  { key: 'DGS20', label: '20Y' },
  { key: 'DGS30', label: '30Y' },
] as const;

function latestValue(series: MacroSeries | null | undefined): number | null {
  const pts = series?.points;
  if (!pts?.length) return null;
  return pts[pts.length - 1].value;
}

function getDateRange(series: MacroSeries | null | undefined): number[] {
  return series?.points.map(p => p.ts) ?? [];
}

export const MacroYieldCurvePanel: React.FC<Props> = ({ loaded }) => {
  // ── Curve shape ─────────────────────────────────────────────────────────────
  const curveData = useMemo(() => TENORS.map(t => ({
    tenor: t.label,
    yield: latestValue(loaded[t.key as keyof LoadedMap]),
  })).filter(d => d.yield != null), [loaded]);

  const inverted = useMemo(() => {
    const y2 = latestValue(loaded.DGS2);
    const y10 = latestValue(loaded.DGS10);
    if (y2 == null || y10 == null) return false;
    return y10 < y2;
  }, [loaded]);

  // ── Spread chart ─────────────────────────────────────────────────────────────
  const spreadData = useMemo(() => {
    const pts = loaded.T10Y2Y?.points ?? [];
    return pts.map(p => ({ date: new Date(p.ts).toLocaleDateString(undefined, { year: '2-digit', month: 'short' }), spread: p.value, ts: p.ts }));
  }, [loaded.T10Y2Y]);

  const currentSpread = spreadData.length ? spreadData[spreadData.length - 1].spread : null;

  // Find inversion regions for ReferenceArea
  const inversionAreas = useMemo(() => {
    if (!spreadData.length) return [];
    const areas: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    for (const d of spreadData) {
      if (d.spread < 0 && !start) start = d.date;
      else if (d.spread >= 0 && start) { areas.push({ x1: start, x2: d.date }); start = null; }
    }
    if (start) areas.push({ x1: start, x2: spreadData[spreadData.length - 1].date });
    return areas;
  }, [spreadData]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
      {/* Left: Curve shape */}
      <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Yield Curve (current)
          </p>
          {inverted && (
            <span style={{ background: 'rgba(193,95,60,0.15)', color: 'var(--chart-1)', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
              INVERTED
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={curveData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={28}>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis dataKey="tenor" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={TIP} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Yield']} />
            <Bar dataKey="yield" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Right: 10Y-2Y spread */}
      <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            10Y – 2Y Spread (bps)
          </p>
          {currentSpread != null && (
            <span style={{
              background: currentSpread < 0 ? 'rgba(193,95,60,0.15)' : 'rgba(120,140,93,0.15)',
              color: currentSpread < 0 ? 'var(--chart-1)' : 'var(--chart-2)',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>
              {currentSpread >= 0 ? '+' : ''}{currentSpread.toFixed(0)} bps
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={spreadData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false}
              interval={Math.floor(spreadData.length / 5)} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} />
            <Tooltip contentStyle={TIP} formatter={(v: number) => [`${v.toFixed(0)} bps`, '10Y-2Y']} />
            {inversionAreas.map((a, i) => (
              <ReferenceArea key={i} x1={a.x1} x2={a.x2} fill="rgba(193,95,60,0.12)" />
            ))}
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="spread" stroke="var(--chart-3)" strokeWidth={1.5}
              dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="ds-caption" style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 10 }}>
          Red shading = inversion (10Y yield below 2Y) — leading recession indicator.
        </p>
      </div>
    </div>
  );
};
