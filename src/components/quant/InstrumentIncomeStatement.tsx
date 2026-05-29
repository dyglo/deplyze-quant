import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useInstrumentFinancials } from '../../hooks/useInstrumentFinancials';

function fmtBig(v: number): string {
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtYear(dateStr: string): string {
  return dateStr.slice(0, 4);
}

function fmtQuarter(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} '${String(d.getFullYear()).slice(2)}`;
}

const CustomTooltip: React.FC<{ active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--muted-foreground)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtBig(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export const InstrumentIncomeStatement: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [period, setPeriod] = useState<'annual' | 'quarter'>('annual');
  const financials = useInstrumentFinancials(symbol, period);
  const series = financials.data?.series ?? [];

  const chartData = useMemo(() => {
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-8);
    return recent.map(p => ({
      label: period === 'annual' ? fmtYear(p.date) : fmtQuarter(p.date),
      revenue: p.revenue ?? null,
      netIncome: p.netIncome ?? null,
    })).filter(d => d.revenue != null || d.netIncome != null);
  }, [series, period]);

  if (!financials.loading && !chartData.length) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Income Statement</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            to={`/copilot?symbol=${symbol}&prompt=${encodeURIComponent(`Is ${symbol}'s growth priced in?`)}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', border: '1px solid var(--primary)', borderRadius: 5,
              fontSize: 11.5, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800 }}>AI</span>
            Is {symbol}&apos;s Growth Priced In?
          </Link>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
            {(['annual', 'quarter'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                style={{
                  padding: '4px 12px', border: 'none',
                  background: period === p ? 'var(--primary)' : 'transparent',
                  color: period === p ? '#fff' : 'var(--muted-foreground)',
                  fontSize: 11, fontWeight: period === p ? 700 : 500, cursor: 'pointer',
                }}
              >
                {p === 'annual' ? 'Annual' : 'Quarterly'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {financials.loading && !series.length ? (
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Loading financials…</p>
      ) : (
        <>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={4}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={52} tickFormatter={fmtBig} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend
                  iconType="square" iconSize={10}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => <span style={{ color: 'var(--muted-foreground)' }}>{value}</span>}
                />
                <Bar dataKey="revenue"  name="Total Revenue" fill="var(--primary)"   radius={[2,2,0,0]} />
                <Bar dataKey="netIncome" name="Net Income"    fill="#B85C2A"          radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary row */}
          {series.length > 0 && (() => {
            const last = [...series].sort((a, b) => b.date.localeCompare(a.date))[0];
            return (
              <div style={{ display: 'flex', gap: 32, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {[
                  { label: 'Revenue',       value: last.revenue,       color: 'var(--primary)' },
                  { label: 'Net Income',    value: last.netIncome,     color: '#B85C2A' },
                  { label: 'Gross Profit',  value: last.grossProfit,   color: 'var(--foreground)' },
                  { label: 'EBITDA',        value: last.ebitda,        color: 'var(--foreground)' },
                ].filter(s => s.value != null).map(({ label, value, color }) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>{fmtBig(value!)}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                      {period === 'annual' ? fmtYear(last.date) : fmtQuarter(last.date)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </section>
  );
};
