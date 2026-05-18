import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, ReferenceLine, ComposedChart, Area,
} from 'recharts';
import { TrendingUp, TrendingDown, Loader2, Activity } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioIntelligence } from '../../hooks/usePortfolioIntelligence';
import { fetchOHLCV } from '../../services/marketService';
import { logReturns, cumulativeLogReturns, rebase100 } from '../../lib/quant/returns';
import { portfolioReturnSeries } from '../../lib/quant/portfolio';
import type { OHLCVBar } from '../../types';
import { PortfolioIntelligencePanel } from '../../components/portfolio/PortfolioIntelligencePanel';

import { fmtPct, fmtBoth, fmtUSD } from '../../lib/portfolio/fmt';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const GREEN = 'var(--chart-2)';
const RED = 'var(--destructive)';
const AMBER = 'var(--chart-4)';

// ─── Section Card ─────────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ title, subtitle, icon, children, style }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', ...style }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
      {icon && <div style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>{icon}</div>}
      <div>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>{title}</p>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{subtitle}</p>}
      </div>
    </div>
    <div style={{ padding: '14px 16px' }}>{children}</div>
  </div>
);

// ─── Waterfall chart (contribution waterfall) ─────────────────────────────────

interface WaterfallEntry { label: string; start: number; end: number; value: number; isTotal?: boolean; }

const WaterfallChart: React.FC<{ data: WaterfallEntry[] }> = ({ data }) => {
  const items = data.map(d => ({
    ...d,
    fill: d.isTotal ? 'var(--primary)' : d.value >= 0 ? GREEN : RED,
    base: Math.min(d.start, d.end),
    height: Math.abs(d.value),
  }));

  const allVals = data.flatMap(d => [d.start, d.end]);
  const minV = Math.min(...allVals) * 100;
  const maxV = Math.max(...allVals) * 100;

  const chartData = items.map(d => ({
    label: d.label,
    base: d.base * 100,
    height: d.height * 100,
    fill: d.fill,
    value: d.value * 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} domain={[Math.floor(minV * 1.05), Math.ceil(maxV * 1.05)]} />
        <Tooltip
          formatter={(v: number, name: string) => name === 'height' ? [`${v.toFixed(2)}%`, 'Contribution'] : null}
          contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
        />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="2 2" />
        {/* Invisible base bar */}
        <Bar dataKey="base" stackId="a" fill="transparent" radius={0} />
        {/* Visible value bar */}
        <Bar dataKey="height" stackId="a" radius={[3, 3, 0, 0]}>
          {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─── Rolling contribution chart ───────────────────────────────────────────────

const RollingContribChart: React.FC<{ data: Array<{ ts: number; [k: string]: number }> }> = ({ data }) => {
  const symbols = Object.keys(data[0] ?? {}).filter(k => k !== 'ts');
  const colors = ['var(--primary)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="2 2" />
        <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]} />
        {symbols.map((s, i) => (
          <Area key={s} type="monotone" dataKey={s} stackId="1" stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.6} dot={false} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const PerformanceAttribution: React.FC = () => {
  const { selectedPortfolio, holdings, loading, holdingsLoading, effectiveWeights } = usePortfolioWorkspace();
  const totalValue = selectedPortfolio?.totalValue;
  const benchmarkId = selectedPortfolio?.benchmarkId ?? 'SPY';

  const [barsMap, setBarsMap] = useState<Record<string, OHLCVBar[]>>({});
  const [fetching, setFetching] = useState(false);

  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);

  useEffect(() => {
    if (symbols.length === 0) { setBarsMap({}); return; }
    setFetching(true);
    const toFetch = [...new Set([...symbols, benchmarkId])];
    Promise.allSettled(toFetch.map(s => fetchOHLCV(s, '1day', 120))).then(results => {
      const m: Record<string, OHLCVBar[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.bars.length >= 10) m[toFetch[i]] = r.value.bars;
      });
      setBarsMap(m);
      setFetching(false);
    });
  }, [symbols.join(','), benchmarkId]);

  // ── Per-holding return and contribution ────────────────────────────────────
  const attributionData = useMemo(() => {
    return holdings
      .filter(h => barsMap[h.symbol] && barsMap[h.symbol].length >= 5)
      .map(h => {
        const bars = barsMap[h.symbol];
        const lr = logReturns(bars.map(b => b.close));
        const totalReturn = Math.exp(lr.reduce((a, b) => a + b, 0)) - 1;
        const w = effectiveWeights[h.symbol] ?? 0;
        const contribution = totalReturn * w;
        return { symbol: h.symbol, name: h.name, totalReturn, contribution, weight: w };
      })
      .sort((a, b) => b.totalReturn - a.totalReturn);
  }, [holdings, barsMap, effectiveWeights]);

  const portfolioTotalReturn = useMemo(() =>
    attributionData.reduce((s, d) => s + d.contribution, 0),
    [attributionData]
  );

  const bmReturn = useMemo(() => {
    const bars = barsMap[benchmarkId];
    if (!bars || bars.length < 5) return 0;
    const lr = logReturns(bars.map(b => b.close));
    return Math.exp(lr.reduce((a, b) => a + b, 0)) - 1;
  }, [barsMap, benchmarkId]);

  // ── Waterfall data ─────────────────────────────────────────────────────────
  const waterfallData = useMemo((): WaterfallEntry[] => {
    if (attributionData.length === 0) return [];
    let running = 0;
    const entries: WaterfallEntry[] = attributionData.slice(0, 8).map(d => {
      const start = running;
      running += d.contribution;
      return { label: d.symbol, start, end: running, value: d.contribution };
    });
    entries.push({ label: 'Total', start: 0, end: portfolioTotalReturn, value: portfolioTotalReturn, isTotal: true });
    return entries;
  }, [attributionData, portfolioTotalReturn]);

  // ── Winners / Laggards ─────────────────────────────────────────────────────
  const sorted = [...attributionData].sort((a, b) => b.totalReturn - a.totalReturn);
  const winners = sorted.slice(0, Math.min(5, Math.ceil(sorted.length / 2)));
  const laggards = sorted.slice(-Math.min(5, Math.floor(sorted.length / 2))).reverse();

  // ── Rolling cumulative contribution per symbol (last 40 data points) ───────
  const rollingContribData = useMemo(() => {
    const validSymbols = symbols.filter(s => barsMap[s]);
    if (validSymbols.length === 0) return [];
    const minLen = Math.min(40, ...validSymbols.map(s => barsMap[s].length));
    const logReturnArrays = validSymbols.map(s =>
      logReturns(barsMap[s].slice(-minLen).map(b => b.close))
    );
    const weights = validSymbols.map(s => effectiveWeights[s] ?? 0);
    const refBars = barsMap[validSymbols[0]].slice(-minLen);

    const points: Array<{ ts: number; [k: string]: number }> = [];
    const cumContrib: Record<string, number> = {};
    validSymbols.forEach(s => { cumContrib[s] = 0; });

    for (let i = 1; i < Math.min(logReturnArrays[0].length, minLen - 1); i++) {
      const point: { ts: number; [k: string]: number } = { ts: refBars[i + 1]?.ts ?? 0 };
      validSymbols.forEach((s, si) => {
        cumContrib[s] += (logReturnArrays[si][i] ?? 0) * (weights[si] ?? 0);
        point[s] = cumContrib[s] * 100;
      });
      points.push(point);
    }
    return points;
  }, [symbols, barsMap, effectiveWeights]);

  // Hooks must all be called before any early returns
  const { observations, acknowledge } = usePortfolioIntelligence(
    selectedPortfolio?.id,
    holdings.length > 0
      ? { holdings, effectiveWeights, portfolioReturn30D: portfolioTotalReturn, benchmarkReturn30D: bmReturn }
      : null,
  );

  if (loading || holdingsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', padding: 24 }}>
        <TrendingUp size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No holdings to attribute</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, maxWidth: 300 }}>Add holdings to see contribution waterfall, winners, laggards, and benchmark-relative attribution.</p>
      </div>
    );
  }

  const excessReturn = portfolioTotalReturn - bmReturn;

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Performance Attribution</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
          {selectedPortfolio?.name} · 120D contribution analysis · vs {benchmarkId}
        </p>
      </div>

      <PortfolioIntelligencePanel observations={observations} onAcknowledge={acknowledge} />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Summary strip ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Portfolio Return', value: fmtBoth(portfolioTotalReturn, totalValue), color: portfolioTotalReturn >= 0 ? GREEN : RED },
            { label: `${benchmarkId} Return`, value: fmtPct(bmReturn), color: bmReturn >= 0 ? GREEN : RED },
            { label: 'Excess Return (α)', value: fmtBoth(excessReturn, totalValue), color: excessReturn >= 0 ? GREEN : RED },
            { label: 'Top Contributor', value: winners[0]?.symbol ?? '—', color: 'var(--foreground)' },
            { label: 'Top Detractor', value: laggards[0]?.symbol ?? '—', color: RED },
          ].map(m => (
            <div key={m.label} style={{ padding: '8px 12px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 90 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Loading state */}
        {fetching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted-foreground)', padding: '8px 0' }}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
            Fetching historical data for attribution analysis…
          </div>
        )}

        {/* ── Row 1: Contribution bar + Waterfall ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <SectionCard
            title="Contribution by Holding"
            subtitle="Weighted 120D return contribution"
            icon={<Activity size={13} />}
          >
            {attributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(100, attributionData.length * 26)}>
                <BarChart
                  data={attributionData.map(d => ({ symbol: d.symbol, contribution: d.contribution * 100 }))}
                  layout="vertical"
                  margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={50} />
                  <ReferenceLine x={0} stroke="var(--border)" strokeDasharray="2 2" />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Contribution']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="contribution" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {attributionData.map(d => <Cell key={d.symbol} fill={d.contribution >= 0 ? GREEN : RED} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Loading price data for attribution…</p>
            )}
          </SectionCard>

          <SectionCard
            title="Contribution Waterfall"
            subtitle="Sequential holding contribution to total return"
            icon={<TrendingUp size={13} />}
          >
            {waterfallData.length > 0 ? (
              <WaterfallChart data={waterfallData} />
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Loading…</p>
            )}
          </SectionCard>
        </div>

        {/* ── Row 2: Winners / Laggards ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <SectionCard title="Winners" subtitle="Top contributors — 120D total return" icon={<TrendingUp size={13} />}>
            {winners.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {winners.map((d, i) => (
                  <div key={d.symbol} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: i === 0 ? 'color-mix(in srgb, var(--chart-2) 8%, transparent)' : 'var(--muted)', borderRadius: 7, border: `1px solid ${i === 0 ? 'color-mix(in srgb, var(--chart-2) 20%, transparent)' : 'var(--border)'}` }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--foreground)', minWidth: 40 }}>{d.symbol}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, d.totalReturn / 0.5 * 100)}%`, height: '100%', background: GREEN }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' }}>{fmtPct(d.totalReturn)}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)', minWidth: 40, textAlign: 'right' }}>+{fmtPct(d.contribution)} ctb</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>No data yet.</p>}
          </SectionCard>

          <SectionCard title="Laggards" subtitle="Detractors — 120D total return" icon={<TrendingDown size={13} />}>
            {laggards.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {laggards.map((d, i) => (
                  <div key={d.symbol} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: i === 0 ? 'color-mix(in srgb, var(--destructive) 8%, transparent)' : 'var(--muted)', borderRadius: 7, border: `1px solid ${i === 0 ? 'color-mix(in srgb, var(--destructive) 20%, transparent)' : 'var(--border)'}` }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--foreground)', minWidth: 40 }}>{d.symbol}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.abs(d.totalReturn) / 0.3 * 100)}%`, height: '100%', background: RED }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: RED, fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' }}>{fmtPct(d.totalReturn)}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)', minWidth: 40, textAlign: 'right' }}>{fmtPct(d.contribution)} ctb</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>No laggards.</p>}
          </SectionCard>
        </div>

        {/* ── Row 3: Rolling contribution chart ───────────────────────────── */}
        {rollingContribData.length > 5 && (
          <SectionCard
            title="Rolling Cumulative Contribution"
            subtitle="Stacked holding contributions over time"
            icon={<Activity size={13} />}
          >
            <RollingContribChart data={rollingContribData} />
          </SectionCard>
        )}

        {/* ── Row 4: Benchmark-relative contribution table ─────────────────── */}
        {attributionData.length > 0 && (
          <SectionCard
            title="Benchmark-Relative Attribution"
            subtitle={`Portfolio vs ${benchmarkId} · 120D`}
            icon={<TrendingUp size={13} />}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol', 'Weight', '120D Return', 'Contribution', 'vs Portfolio Avg'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attributionData.map((d, i) => {
                    const avgContrib = portfolioTotalReturn / attributionData.length;
                    const vsAvg = d.contribution - avgContrib;
                    const holdingExposure = totalValue != null ? totalValue * d.weight : null;
                    const dollarReturn = holdingExposure != null ? holdingExposure * d.totalReturn : null;
                    return (
                      <tr key={d.symbol} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{d.symbol}</td>
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>{(d.weight * 100).toFixed(1)}%</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: d.totalReturn >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(d.totalReturn)}
                          {dollarReturn != null && <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.8 }}>{fmtUSD(dollarReturn)}</span>}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: d.contribution >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtBoth(d.contribution, totalValue)}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: vsAvg >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(vsAvg)}</td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--muted)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 800, color: 'var(--foreground)' }}>TOTAL</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)' }}>100%</td>
                    <td colSpan={2} style={{ padding: '8px 10px', fontWeight: 800, color: portfolioTotalReturn >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtBoth(portfolioTotalReturn, totalValue)}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: excessReturn >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtBoth(excessReturn, totalValue)} vs {benchmarkId}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
};
