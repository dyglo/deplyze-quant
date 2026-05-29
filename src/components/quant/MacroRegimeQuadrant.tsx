import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { MacroSeries } from '../../types';
import { mean, stdev } from '../../lib/quant';

interface Props {
  cpi: MacroSeries | null | undefined;
  gdp: MacroSeries | null | undefined;
}

const AXIS = { fontSize: 10, fill: 'var(--muted-foreground)' };
const TIP: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, padding: '6px 10px' };

type Regime = 'Goldilocks' | 'Overheating' | 'Stagflation' | 'Deflation';

const REGIME_COLORS: Record<Regime, string> = {
  Goldilocks:  'rgba(120,140,93,0.15)',
  Overheating: 'rgba(193,95,60,0.15)',
  Stagflation: 'rgba(193,95,60,0.22)',
  Deflation:   'rgba(106,155,204,0.15)',
};

const REGIME_LABELS: Array<{ name: Regime; x: number; y: number }> = [
  { name: 'Goldilocks',  x:  0.6,  y: -0.6 },
  { name: 'Overheating', x:  0.6,  y:  0.6 },
  { name: 'Stagflation', x: -0.6,  y:  0.6 },
  { name: 'Deflation',   x: -0.6,  y: -0.6 },
];

function yoyChange(pts: { ts: number; value: number }[], periods = 12): { ts: number; value: number }[] {
  if (pts.length <= periods) return [];
  return pts.slice(periods).map((p, i) => {
    const prev = pts[i].value;
    return { ts: p.ts, value: prev !== 0 ? (p.value - prev) / Math.abs(prev) * 100 : 0 };
  });
}

function toZScores(vals: number[]): number[] {
  const m = mean(vals), s = stdev(vals);
  if (s === 0) return vals.map(() => 0);
  return vals.map(v => (v - m) / s);
}

export const MacroRegimeQuadrant: React.FC<Props> = ({ cpi, gdp }) => {
  const { trail, current, regime } = useMemo(() => {
    const cpiPts = cpi?.points ?? [];
    const gdpPts = gdp?.points ?? [];
    if (cpiPts.length < 14 || gdpPts.length < 5) return { trail: [], current: null, regime: null };

    // Inflation: CPI YoY % (monthly), standardized over FULL history (stable
    // baseline — not relative to whatever window is loaded).
    const cpiYoY = yoyChange(cpiPts, 12);
    const inflationZ = toZScores(cpiYoY.map(p => p.value));
    const infByTs = cpiYoY.map((p, i) => ({ ts: p.ts, z: inflationZ[i] }));

    // Growth: GDP QoQ % (quarterly), standardized over full history.
    const gdpGrowth = gdpPts.slice(1).map((p, i) => {
      const prev = gdpPts[i].value;
      return { ts: p.ts, value: prev !== 0 ? (p.value - prev) / Math.abs(prev) * 100 : 0 };
    });
    const growthZ = toZScores(gdpGrowth.map(p => p.value));

    // CRITICAL: align by DATE, not by array index. CPI is monthly and GDP is
    // quarterly, so for each GDP quarter we take the most recent CPI YoY at or
    // before that quarter — otherwise the growth and inflation coordinates come
    // from different periods and the regime classification is meaningless.
    const infAsOf = (targetTs: number): number | null => {
      let v: number | null = null;
      for (const a of infByTs) { if (a.ts <= targetTs) v = a.z; else break; }
      return v;
    };
    const paired = gdpGrowth
      .map((g, i) => {
        const inf = infAsOf(g.ts);
        return inf == null ? null : { ts: g.ts, growth: growthZ[i], inflation: inf };
      })
      .filter((x): x is { ts: number; growth: number; inflation: number } => x != null);

    const n = Math.min(8, paired.length);
    const trail = paired.slice(-n).map((p, i) => ({ growth: p.growth, inflation: p.inflation, idx: i, isCurrent: false }));

    const current = trail.length ? { ...trail[trail.length - 1], isCurrent: true } : null;

    // Classify current regime
    let regime: Regime | null = null;
    if (current) {
      const g = current.growth, inf = current.inflation;
      if (g >= 0 && inf < 0) regime = 'Goldilocks';
      else if (g >= 0 && inf >= 0) regime = 'Overheating';
      else if (g < 0 && inf >= 0) regime = 'Stagflation';
      else regime = 'Deflation';
    }

    return { trail, current, regime };
  }, [cpi, gdp]);

  const hasData = trail.length > 0;

  return (
    <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Macro Regime Quadrant
        </p>
        {regime && (
          <span style={{ background: 'var(--muted)', color: 'var(--foreground)', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
            {regime}
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Requires CPI + GDP series. Toggle both on.
        </p>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Quadrant background labels */}
          {REGIME_LABELS.map(q => (
            <div key={q.name} style={{
              position: 'absolute', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              color: 'var(--muted-foreground)', opacity: 0.6, pointerEvents: 'none',
              // Map z-score -1..1 to % within the chart area
              left: q.x > 0 ? '58%' : '6%',
              top: q.y > 0 ? '10%' : '65%',
            }}>{q.name.toUpperCase()}</div>
          ))}
          <ResponsiveContainer width="100%" height={200}>
            <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis type="number" dataKey="growth" name="Growth" domain={[-2.5, 2.5]}
                tick={AXIS} axisLine={false} tickLine={false} label={{ value: 'Growth →', position: 'insideRight', fontSize: 9, fill: 'var(--muted-foreground)' }} />
              <YAxis type="number" dataKey="inflation" name="Inflation" domain={[-2.5, 2.5]}
                tick={AXIS} axisLine={false} tickLine={false} label={{ value: '↑ Inflation', angle: -90, position: 'insideTop', fontSize: 9, fill: 'var(--muted-foreground)' }} />
              <Tooltip contentStyle={TIP}
                formatter={(val: number, name: string) => [`${val.toFixed(2)}σ`, name]}
              />
              <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
              {/* Trail dots */}
              <Scatter
                data={trail.slice(0, -1)}
                fill="var(--muted-foreground)"
                opacity={0.4}
                r={4}
              />
              {/* Current dot */}
              {current && (
                <Scatter
                  data={[current]}
                  fill="var(--primary)"
                  r={7}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
          <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 10 }}>
            Growth (GDP QoQ z-score) vs Inflation (CPI YoY z-score). Trailing 8 quarters shown. Current = filled circle.
          </p>
        </div>
      )}
    </div>
  );
};
