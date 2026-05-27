import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type { EarningsRecord } from '../../services/instrumentService';

interface ChartDatum {
  date: string;
  actual: number | null;
  estimate: number | null;
  surprisePct: number | null;
  beat: boolean;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ name: string; value: number | null }>;
  label?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: ChartDatum[];
}> = ({ active, payload, label, data }) => {
  if (!active || !payload?.length) return null;
  const actual = payload.find(p => p.name === 'actual')?.value;
  const estimate = payload.find(p => p.name === 'estimate')?.value;
  const row = data?.find(d => d.date === label);

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--muted-foreground)' }}>{label}</div>
      {actual != null && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: 'var(--muted-foreground)' }}>Actual EPS</span><span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${actual.toFixed(2)}</span></div>}
      {estimate != null && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: 'var(--muted-foreground)' }}>Est. EPS</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>${estimate.toFixed(2)}</span></div>}
      {row?.surprisePct != null && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--muted-foreground)' }}>Surprise</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: row.beat ? 'var(--ds-gain)' : 'var(--ds-loss)' }}>
            {row.surprisePct > 0 ? '+' : ''}{row.surprisePct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
};

export const InstrumentEarningsChart: React.FC<{ earnings: EarningsRecord[] }> = ({ earnings }) => {
  if (!earnings.length) return null;

  const data: ChartDatum[] = earnings
    .slice().sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: fmtDate(e.date),
      actual: e.epsActual ?? null,
      estimate: e.epsEstimate ?? null,
      surprisePct: e.surprisePct ?? null,
      beat: (e.surprisePct ?? 0) > 0,
    }));

  const allValues = data.flatMap(d => [d.actual, d.estimate]).filter((v): v is number => v != null);
  const hasNegative = allValues.some(v => v < 0);

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>EPS History</h2>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{data.length} quarters · actual vs estimate</span>
      </div>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `$${v}`} />
            {hasNegative && <ReferenceLine y={0} stroke="var(--border)" />}
            <Tooltip content={<CustomTooltip data={data} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="estimate" name="estimate" radius={[2, 2, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill="var(--border)" />)}
            </Bar>
            <Bar dataKey="actual" name="actual" radius={[2, 2, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.beat ? 'var(--ds-gain)' : d.actual != null && d.estimate != null ? 'var(--ds-loss)' : 'var(--muted-foreground)'} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        {[{ color: 'var(--border)', label: 'Estimate' }, { color: 'var(--ds-gain)', label: 'Beat' }, { color: 'var(--ds-loss)', label: 'Miss' }].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
