import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useInstrumentFinancials } from '../../hooks/useInstrumentFinancials';
import type { FinancialPeriod } from '../../services/instrumentService';

type Period = 'annual' | 'quarter';

function fmtVal(v: number): string {
  const abs = Math.abs(v);
  const prefix = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${prefix}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${prefix}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${prefix}$${(abs / 1e6).toFixed(0)}M`;
  return `${prefix}$${abs.toFixed(0)}`;
}

function fmtLabel(dateStr: string, period: Period): string {
  if (period === 'quarter') {
    const d = new Date(dateStr);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `Q${q} '${String(d.getFullYear()).slice(2)}`;
  }
  return dateStr.slice(0, 4);
}

const MiniChart: React.FC<{
  data: FinancialPeriod[];
  dataKey: keyof FinancialPeriod;
  label: string;
  period: Period;
  positiveColor?: string;
}> = ({ data, dataKey, label, period, positiveColor = '#5A7052' }) => {
  const values = data
    .map((d) => d[dataKey] as number | undefined)
    .filter((v): v is number => v != null);
  if (!values.length) return null;
  const hasNeg = values.some((v) => v < 0);

  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
        color: 'var(--muted-foreground)', marginBottom: 10,
      }}>{label}</div>
      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => fmtLabel(d, period)}
              fontSize={9}
              axisLine={false}
              tickLine={false}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              fontSize={9}
              axisLine={false}
              tickLine={false}
              stroke="var(--muted-foreground)"
              width={48}
              tickFormatter={fmtVal}
            />
            {hasNeg && <ReferenceLine y={0} stroke="var(--border)" />}
            <Tooltip
              formatter={(value: number) => [fmtVal(value), label]}
              labelFormatter={(d) => fmtLabel(d as string, period)}
              contentStyle={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 11,
              }}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <Bar dataKey={dataKey as string} radius={[2, 2, 0, 0]}>
              {data.map((d, i) => {
                const v = d[dataKey] as number | undefined;
                return (
                  <Cell
                    key={i}
                    fill={v != null && v < 0 ? 'var(--ds-loss)' : positiveColor}
                    fillOpacity={0.85}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const InstrumentFinancialStatements: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [period, setPeriod] = useState<Period>('annual');
  const financials = useInstrumentFinancials(symbol, period);
  const series = financials.data?.series ?? [];

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 20,
      }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Financial Summary</h2>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['annual', 'quarter'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600,
                background: period === p ? 'var(--foreground)' : 'transparent',
                color: period === p ? 'var(--background)' : 'var(--muted-foreground)',
                border: 'none', cursor: 'pointer',
              }}
            >{p === 'annual' ? 'Annual' : 'Quarterly'}</button>
          ))}
        </div>
      </div>

      {financials.loading && !series.length ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
          Loading financial data…
        </div>
      ) : !series.length ? (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>
          No financial data available.{' '}
          <button onClick={() => financials.refresh()} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>Retry</button>
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 32px' }}>
          <MiniChart data={series} dataKey="revenue" label="Revenue" period={period} positiveColor="#5A7052" />
          <MiniChart data={series} dataKey="netIncome" label="Net Income" period={period} positiveColor="#5A7052" />
          <MiniChart data={series} dataKey="eps" label="EPS (Diluted)" period={period} positiveColor="var(--primary)" />
        </div>
      )}
    </section>
  );
};
