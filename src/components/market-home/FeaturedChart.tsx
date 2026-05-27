import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { useOHLCV } from '../../hooks/useMarket';
import { SectionCard } from './SectionCard';
import { Flag } from './Flag';
import { fmtPrice, fmtPct, deltaColor, symbolCountry } from './format';

const SERIES: Array<{ symbol: string; label: string }> = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'DIA', label: 'Dow Jones' },
  { symbol: 'IWM', label: 'Russell 2000' },
  { symbol: 'XAU/USD', label: 'Gold' },
  { symbol: 'BTC/USD', label: 'Bitcoin' },
];

const RANGES: Array<{ id: string; label: string; size: number }> = [
  { id: '1M', label: '1M', size: 22 },
  { id: '3M', label: '3M', size: 66 },
  { id: '6M', label: '6M', size: 130 },
  { id: '1Y', label: '1Y', size: 252 },
];

export const FeaturedChart: React.FC = () => {
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState('SPY');
  const [range, setRange] = useState(RANGES[1]);
  const { data, loading } = useOHLCV(symbol, '1day', range.size);

  const bars = data?.bars ?? [];
  const series = bars.map((b) => ({ t: b.ts, close: b.close }));
  const first = series[0]?.close;
  const last = series[series.length - 1]?.close;
  const changePct = first && last ? ((last - first) / first) * 100 : 0;
  const color = deltaColor(changePct);
  const meta = SERIES.find((s) => s.symbol === symbol);

  return (
    <SectionCard
      title="Market Performance"
      subtitle={meta?.label}
      action={
        <button onClick={() => navigate(`/instruments/${encodeURIComponent(symbol)}`)} className="ds-transition-fast" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          Open instrument <ArrowUpRight size={12} />
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SERIES.map((s) => {
            const active = s.symbol === symbol;
            return (
              <button
                key={s.symbol}
                onClick={() => setSymbol(s.symbol)}
                className="ds-transition-fast"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: active ? 700 : 500, padding: '4px 10px', borderRadius: 999,
                  border: '1px solid', borderColor: active ? 'var(--primary)' : 'var(--border)',
                  background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer',
                }}
              >
                <Flag iso={symbolCountry(s.symbol)} width={14} />
                {s.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r)}
              style={{
                fontSize: 10.5, fontWeight: r.id === range.id ? 700 : 500, padding: '3px 9px', borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: r.id === range.id ? 'var(--muted)' : 'transparent',
                color: r.id === range.id ? 'var(--foreground)' : 'var(--muted-foreground)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
          {last != null ? fmtPrice(last) : '—'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>
          {series.length ? `${fmtPct(changePct)} · ${range.label}` : ''}
        </span>
      </div>

      <div style={{ height: 240, width: '100%' }}>
        {loading && series.length === 0 ? (
          <div style={{ height: '100%', borderRadius: 8, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
        ) : series.length < 2 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Chart data unavailable.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                minTickGap={40}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                width={52}
                tickFormatter={(v) => fmtPrice(v)}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                labelFormatter={(t) => new Date(t as number).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                formatter={(v: number) => [fmtPrice(v), meta?.label ?? symbol]}
              />
              <Line type="monotone" dataKey="close" stroke={color} strokeWidth={1.6} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </SectionCard>
  );
};
