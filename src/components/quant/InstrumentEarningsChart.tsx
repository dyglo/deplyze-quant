import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Lock } from 'lucide-react';
import { useInstrumentIntelligence } from '../../hooks/useInstrument';
import { fetchEarningsSurprises } from '../../services/earningsService';
import { useSWR } from '../../hooks/useSWR';
import type { EarningsEvent } from '../../lib/market-data/contracts';

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

function fmtBig(v: number): string {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

interface ChartRow {
  label: string;
  revenueActual: number | null;
  revenueEst: number | null;
  epsActual: number | null;
  epsEst: number | null;
  beat: boolean;
  raw: EarningsEvent;
}

const CustomTooltip: React.FC<{ active?: boolean; payload?: Array<{ name: string; value: number | null; color: string }>; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 11, minWidth: 160 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--muted-foreground)' }}>{label}</div>
      {payload.map((p, i) => p.value != null && (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: p.color ?? 'var(--muted-foreground)' }}>{p.name}</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {p.name.toLowerCase().includes('eps') ? `$${p.value.toFixed(2)}` : fmtBig(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export const InstrumentEarningsChart: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [view, setView] = useState<'eps' | 'revenue'>('eps');

  const surprises = useSWR(
    () => fetchEarningsSurprises(symbol, 12),
    [symbol],
    { cacheKey: `earnings-surprises-${symbol}` },
  );

  const intel = useInstrumentIntelligence(symbol);

  const rows: ChartRow[] = useMemo(() => {
    const events: EarningsEvent[] = surprises.data?.surprises ?? intel.data?.earnings?.map(e => ({
      date: e.date,
      symbol,
      epsActual: e.epsActual ?? null,
      epsEstimate: e.epsEstimate ?? null,
      surprisePct: e.surprisePct ?? null,
    })) ?? [];

    return events
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => ({
        label: fmtDate(e.date),
        revenueActual: e.revenue ?? null,
        revenueEst: e.revenueEstimate ?? null,
        epsActual: e.epsActual ?? null,
        epsEst: e.epsEstimate ?? null,
        beat: (e.surprisePct ?? 0) >= 0,
        raw: e,
      }));
  }, [surprises.data, intel.data, symbol]);

  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  const latestDate = latest?.raw.date ? new Date(latest.raw.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  const hasRevenue = rows.some(r => r.revenueActual != null);

  if (!rows.length && !surprises.loading && !intel.loading) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Earnings</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['eps', 'revenue'] as const).filter(v => v === 'eps' || hasRevenue).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '4px 12px', borderRadius: 5, border: view === v ? '1.5px solid var(--primary)' : '1px solid var(--border)',
              background: view === v ? 'rgba(var(--primary-rgb,193,95,60),0.07)' : 'transparent',
              fontSize: 11, fontWeight: view === v ? 700 : 500,
              color: view === v ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer',
            }}>
              {v === 'eps' ? 'EPS' : 'Revenue'}
            </button>
          ))}
        </div>
      </div>

      {(surprises.loading || intel.loading) && !rows.length ? (
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Loading earnings data…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 32 }}>

          {/* Chart */}
          <div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={40}
                    tickFormatter={v => view === 'eps' ? `$${v}` : fmtBig(v)}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />

                  {view === 'eps' ? (
                    <>
                      <Bar dataKey="epsEst" name="EPS Estimate" radius={[2,2,0,0]} fill="var(--border)" barSize={14} />
                      <Bar dataKey="epsActual" name="EPS Actual" radius={[2,2,0,0]} barSize={14}
                        fill="var(--primary)" />
                    </>
                  ) : (
                    <>
                      <Bar dataKey="revenueEst" name="Revenue Estimate" radius={[2,2,0,0]} fill="var(--border)" barSize={14} />
                      <Bar dataKey="revenueActual" name="Revenue Actual" radius={[2,2,0,0]} barSize={14}
                        fill="var(--primary)" />
                    </>
                  )}

                  {/* Forecast dots */}
                  <Line
                    dataKey={view === 'eps' ? 'epsEst' : 'revenueEst'}
                    name="Forecast"
                    dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    stroke="transparent"
                    strokeWidth={0}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { color: 'var(--primary)', label: view === 'eps' ? 'EPS Actual' : 'Revenue Actual' },
                { color: 'var(--border)', label: 'Estimate' },
                { color: '#f97316', label: 'Forecast', dot: true },
              ].map(({ color, label, dot }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {dot
                    ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    : <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  }
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {latestDate && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Latest Release
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{latestDate}</div>
              </div>
            )}

            {latest?.epsActual != null && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  EPS / Forecast
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: latest.beat ? '#22c55e' : '#ef4444' }}>
                    ${latest.epsActual.toFixed(2)}
                  </span>
                  {latest.epsEst != null && (
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                      / ${latest.epsEst.toFixed(2)}
                    </span>
                  )}
                </div>
                {latest.raw.surprisePct != null && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: latest.beat ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                    {latest.raw.surprisePct >= 0 ? '+' : ''}{latest.raw.surprisePct.toFixed(1)}% surprise
                  </div>
                )}
              </div>
            )}

            {hasRevenue && latest?.revenueActual != null && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Revenue / Forecast
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
                    {fmtBig(latest.revenueActual)}
                  </span>
                  {latest.revenueEst != null && (
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                      / {fmtBig(latest.revenueEst)}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 6 }}>
                EPS Revisions
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--primary)', cursor: 'pointer' }}>
                <Lock size={9} /> Unlock Pro
              </div>
            </div>

          </div>
        </div>
      )}
    </section>
  );
};
