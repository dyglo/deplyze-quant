import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import type { MacroSeries } from '../../types';

interface Props {
  dgs10: MacroSeries | null | undefined;
  t5yie: MacroSeries | null | undefined;
  unrate: MacroSeries | null | undefined;
}

const AXIS = { fontSize: 10, fill: 'var(--muted-foreground)' };
const GRID = { stroke: 'var(--border)', strokeDasharray: '2 4' };
const TIP: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, padding: '6px 10px' };

export const MacroRealRatesPanel: React.FC<Props> = ({ dgs10, t5yie, unrate }) => {
  // Align DGS10 and T5YIE by ts, compute real rate
  const chartData = useMemo(() => {
    const nominalPts = dgs10?.points ?? [];
    const breakevenPts = t5yie?.points ?? [];
    if (!nominalPts.length || !breakevenPts.length) return [];

    const beMap = new Map(breakevenPts.map(p => [p.ts, p.value]));
    return nominalPts
      .filter(p => beMap.has(p.ts))
      .map(p => {
        const be = beMap.get(p.ts)!;
        return {
          date: new Date(p.ts).toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
          nominal: p.value,
          breakeven: be,
          real: parseFloat((p.value - be).toFixed(2)),
        };
      });
  }, [dgs10, t5yie]);

  const currentReal = chartData.length ? chartData[chartData.length - 1].real : null;
  const isNegative = currentReal != null && currentReal < 0;

  const unrateData = useMemo(() => {
    return (unrate?.points ?? []).map(p => ({
      date: new Date(p.ts).toLocaleDateString(undefined, { year: '2-digit', month: 'short' }),
      unrate: p.value,
    }));
  }, [unrate]);

  const hasRealData = chartData.length > 0;
  const hasUnrate = unrateData.length > 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: hasUnrate ? '1.6fr 1fr' : '1fr', gap: 16 }}>
      {/* Real rates chart */}
      <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Real Rates (10Y Nominal − 5Y Breakeven)
          </p>
          {currentReal != null && (
            <span style={{
              background: isNegative ? 'rgba(193,95,60,0.15)' : 'rgba(120,140,93,0.15)',
              color: isNegative ? 'var(--chart-1)' : 'var(--chart-2)',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>
              Real: {currentReal >= 0 ? '+' : ''}{currentReal.toFixed(2)}%
            </span>
          )}
        </div>
        {!hasRealData ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
            Toggle on 10Y Treasury Yield and 5Y Breakeven to see real rates.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false}
                  interval={Math.floor(chartData.length / 5)} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={TIP} formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="nominal" stroke="var(--chart-3)" strokeWidth={1.5} dot={false} name="10Y Nominal" />
                <Line type="monotone" dataKey="breakeven" stroke="var(--chart-4)" strokeWidth={1.5} dot={false} name="5Y Breakeven" />
                <Line type="monotone" dataKey="real" stroke={isNegative ? 'var(--chart-1)' : 'var(--chart-2)'}
                  strokeWidth={2} dot={false} name="Real Rate" />
              </LineChart>
            </ResponsiveContainer>
            <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 10 }}>
              Negative real rates = financial repression. Historically bullish for gold, commodities, growth equities.
            </p>
          </>
        )}
      </div>

      {/* Unemployment rate */}
      {hasUnrate && (
        <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
          <p className="ds-label" style={{ margin: '0 0 10px', color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Unemployment Rate
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={unrateData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false}
                interval={Math.floor(unrateData.length / 4)} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={TIP} formatter={(v: number) => [`${v.toFixed(1)}%`, 'U-3']} />
              <Line type="monotone" dataKey="unrate" stroke="var(--chart-4)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
