import React, { useMemo } from 'react';
import {
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import type { MacroSeries, MacroSeriesPoint } from '../../types';

interface LoadedMap {
  DGS3M?: MacroSeries | null;
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
  { key: 'DGS3M', label: '3M' },
  { key: 'DGS2',  label: '2Y' },
  { key: 'DGS5',  label: '5Y' },
  { key: 'DGS10', label: '10Y' },
  { key: 'DGS20', label: '20Y' },
  { key: 'DGS30', label: '30Y' },
] as const;

const DAY = 86_400_000;

function latestValue(series: MacroSeries | null | undefined): number | null {
  const pts = series?.points;
  return pts?.length ? pts[pts.length - 1].value : null;
}

/** Value at or before a target timestamp (series assumed ascending by ts). */
function valueAsOf(series: MacroSeries | null | undefined, targetTs: number): number | null {
  const pts = series?.points;
  if (!pts?.length) return null;
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].ts <= targetTs) return pts[i].value;
  return null;
}

function lastTs(series: MacroSeries | null | undefined): number | null {
  const pts = series?.points;
  return pts?.length ? pts[pts.length - 1].ts : null;
}

export const MacroYieldCurvePanel: React.FC<Props> = ({ loaded }) => {
  // Reference "today" = the most recent observation across loaded tenors.
  const refTs = useMemo(() => {
    const tss = TENORS.map(t => lastTs(loaded[t.key as keyof LoadedMap])).filter((x): x is number => x != null);
    return tss.length ? Math.max(...tss) : null;
  }, [loaded]);

  // ── Curve shape: current vs 3M ago vs 1Y ago ───────────────────────────────
  const curveData = useMemo(() => {
    if (refTs == null) return [];
    return TENORS.map(t => {
      const s = loaded[t.key as keyof LoadedMap];
      return {
        tenor: t.label,
        current: latestValue(s),
        ago3m: valueAsOf(s, refTs - 91 * DAY),
        ago1y: valueAsOf(s, refTs - 365 * DAY),
      };
    }).filter(d => d.current != null);
  }, [loaded, refTs]);

  const y3m = latestValue(loaded.DGS3M);
  const y2 = latestValue(loaded.DGS2);
  const y10 = latestValue(loaded.DGS10);
  const cur2s10s = y2 != null && y10 != null ? (y10 - y2) * 100 : null;   // bps
  const cur3m10y = y3m != null && y10 != null ? (y10 - y3m) * 100 : null; // bps
  const inverted = (cur3m10y != null && cur3m10y < 0) || (cur2s10s != null && cur2s10s < 0);

  // ── Spread history: 10Y−2Y and 10Y−3M (bps) ───────────────────────────────
  const spreadData = useMemo(() => {
    const tenPts: MacroSeriesPoint[] = loaded.DGS10?.points ?? [];
    if (!tenPts.length) return [];
    const twoMap = new Map((loaded.DGS2?.points ?? []).map(p => [p.ts, p.value]));
    const tmMap = new Map((loaded.DGS3M?.points ?? []).map(p => [p.ts, p.value]));
    return tenPts.map(p => ({
      date: new Date(p.ts).toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
      ts: p.ts,
      s2: twoMap.has(p.ts) ? (p.value - twoMap.get(p.ts)!) * 100 : null,
      s3m: tmMap.has(p.ts) ? (p.value - tmMap.get(p.ts)!) * 100 : null,
    }));
  }, [loaded.DGS10, loaded.DGS2, loaded.DGS3M]);

  // Inversion bands keyed off the primary spread (prefer 10Y−3M).
  const inversionAreas = useMemo(() => {
    if (!spreadData.length) return [];
    const areas: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    for (const d of spreadData) {
      const primary = d.s3m ?? d.s2;
      if (primary == null) continue;
      if (primary < 0 && !start) start = d.date;
      else if (primary >= 0 && start) { areas.push({ x1: start, x2: d.date }); start = null; }
    }
    if (start) areas.push({ x1: start, x2: spreadData[spreadData.length - 1].date });
    return areas;
  }, [spreadData]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
      {/* Left: curve shape vs history */}
      <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Treasury Curve
          </p>
          {inverted && (
            <span style={{ background: 'rgba(193,95,60,0.15)', color: 'var(--chart-1)', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
              INVERTED
            </span>
          )}
        </div>
        {curveData.length === 0 ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
            Toggle on 3M / 2Y / 5Y / 10Y / 20Y / 30Y to plot the curve.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={curveData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="tenor" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} />
                <Tooltip contentStyle={TIP} formatter={(v: number, name: string) => [v == null ? '—' : `${v.toFixed(2)}%`, name]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="ago1y" stroke="var(--muted-foreground)" strokeWidth={1.2} strokeDasharray="3 3" dot={false} name="1Y ago" connectNulls />
                <Line type="monotone" dataKey="ago3m" stroke="var(--chart-4)" strokeWidth={1.3} dot={false} name="3M ago" connectNulls />
                <Line type="monotone" dataKey="current" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 2 }} name="Current" connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 10 }}>
              Curve today vs 3M / 1Y ago. Flattening or inversion of the front end (3M→10Y) historically leads recessions.
            </p>
          </>
        )}
      </div>

      {/* Right: spread history (2s10s + 3m10y) */}
      <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Curve Spreads (bps)
          </p>
          {cur2s10s != null && (
            <span style={{
              background: cur2s10s < 0 ? 'rgba(193,95,60,0.15)' : 'rgba(120,140,93,0.15)',
              color: cur2s10s < 0 ? 'var(--chart-1)' : 'var(--chart-2)',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>
              10Y–2Y {cur2s10s >= 0 ? '+' : ''}{cur2s10s.toFixed(0)}
            </span>
          )}
          {cur3m10y != null && (
            <span style={{
              background: cur3m10y < 0 ? 'rgba(193,95,60,0.15)' : 'rgba(120,140,93,0.15)',
              color: cur3m10y < 0 ? 'var(--chart-1)' : 'var(--chart-2)',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>
              10Y–3M {cur3m10y >= 0 ? '+' : ''}{cur3m10y.toFixed(0)}
            </span>
          )}
        </div>
        {spreadData.length === 0 ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
            Toggle on 10Y plus 2Y and/or 3M to plot spreads.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={spreadData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(spreadData.length / 5))} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} />
                <Tooltip contentStyle={TIP} formatter={(v: number, name: string) => [v == null ? '—' : `${v.toFixed(0)} bps`, name]} />
                {inversionAreas.map((a, i) => (
                  <ReferenceArea key={i} x1={a.x1} x2={a.x2} fill="rgba(193,95,60,0.12)" />
                ))}
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="s2" stroke="var(--chart-3)" strokeWidth={1.5} dot={false} name="10Y–2Y" connectNulls />
                <Line type="monotone" dataKey="s3m" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} name="10Y–3M" connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <p className="ds-caption" style={{ margin: '6px 0 0', color: 'var(--muted-foreground)', fontSize: 10 }}>
              Red shading = inversion (negative spread). The 10Y–3M spread is the NY Fed’s preferred recession signal.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
