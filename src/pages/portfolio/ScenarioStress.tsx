import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, LineChart, Line, AreaChart, Area,
} from 'recharts';
import { Zap, Loader2, AlertCircle, TrendingDown, TrendingUp, Activity } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioIntelligence } from '../../hooks/usePortfolioIntelligence';
import { fetchOHLCV } from '../../services/marketService';
import { logReturns, cumulativeLogReturns, rebase100 } from '../../lib/quant/returns';
import { STRESS_PRESETS, fmtShock, type StressScenario } from '../../lib/stressScenarios';
import type { OHLCVBar } from '../../types';
import { PortfolioIntelligencePanel } from '../../components/portfolio/PortfolioIntelligencePanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { fmtPct, fmtUSD, fmtBoth } from '../../lib/portfolio/fmt';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Map holding asset class → shock asset type
function resolveShockKey(assetClass: string): keyof StressScenario['shocks'] {
  switch (assetClass) {
    case 'bond': return 'bonds';
    case 'commodity': return 'commodity' in STRESS_PRESETS[0].shocks ? 'oil' : 'oil';
    case 'crypto': return 'crypto';
    default: return 'equity';
  }
}

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

// ─── Scenario selector ────────────────────────────────────────────────────────

const ScenarioSelector: React.FC<{
  scenarios: StressScenario[];
  selected: string;
  onSelect: (id: string) => void;
}> = ({ scenarios, selected, onSelect }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {scenarios.map(s => (
      <button
        key={s.id}
        onClick={() => onSelect(s.id)}
        style={{
          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: s.id === selected ? 'var(--primary)' : 'var(--muted)',
          color: s.id === selected ? 'var(--primary-foreground)' : 'var(--foreground)',
          border: `1px solid ${s.id === selected ? 'var(--primary)' : 'var(--border)'}`,
          cursor: 'pointer', transition: 'all 120ms',
        }}
      >
        {s.label}
      </button>
    ))}
  </div>
);

// ─── Scenario summary ─────────────────────────────────────────────────────────

const ScenarioSummaryCard: React.FC<{ scenario: StressScenario }> = ({ scenario }) => (
  <div style={{ padding: '12px 16px', background: 'color-mix(in srgb, var(--destructive) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--destructive) 20%, transparent)', borderRadius: 8 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
      <Zap size={14} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{scenario.label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{scenario.period}</p>
      </div>
    </div>
    <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{scenario.description}</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Object.entries(scenario.shocks).filter(([, v]) => v !== 0).map(([key, v]) => (
        <div key={key} style={{
          padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: v < 0 ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
          border: `1px solid ${v < 0 ? 'color-mix(in srgb, var(--destructive) 25%, transparent)' : 'color-mix(in srgb, var(--chart-2) 25%, transparent)'}`,
          color: v < 0 ? 'var(--destructive)' : 'var(--chart-2)',
        }}>
          {key.toUpperCase()} {fmtShock(v)}
        </div>
      ))}
    </div>
    <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
      ⚠ Illustrative historical shock proxies. Not predictions. Actual portfolio impact depends on composition and market conditions.
    </p>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export const ScenarioStress: React.FC = () => {
  const { selectedPortfolio, holdings, loading, holdingsLoading, effectiveWeights } = usePortfolioWorkspace();
  const totalValue = selectedPortfolio?.totalValue;
  const [selectedScenario, setSelectedScenario] = useState(STRESS_PRESETS[0].id);
  const [barsMap, setBarsMap] = useState<Record<string, OHLCVBar[]>>({});
  const [fetching, setFetching] = useState(false);

  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);

  useEffect(() => {
    if (symbols.length === 0) { setBarsMap({}); return; }
    setFetching(true);
    Promise.allSettled(symbols.map(s => fetchOHLCV(s, '1day', 90))).then(results => {
      const m: Record<string, OHLCVBar[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.bars.length >= 5) m[symbols[i]] = r.value.bars;
      });
      setBarsMap(m);
      setFetching(false);
    });
  }, [symbols.join(',')]);

  const scenario = STRESS_PRESETS.find(s => s.id === selectedScenario) ?? STRESS_PRESETS[0];

  // ── Per-holding scenario impact ───────────────────────────────────────────
  const holdingImpacts = useMemo(() => {
    return holdings.map(h => {
      const shockKey = resolveShockKey(h.assetClass);
      const shockFraction = scenario.shocks[shockKey] ?? scenario.shocks.equity;
      const w = effectiveWeights[h.symbol] ?? 0;
      const portContrib = shockFraction * w;

      // Get current price from bars
      const bars = barsMap[h.symbol];
      const currentPrice = bars?.[bars.length - 1]?.close ?? null;
      const shockedPrice = currentPrice !== null ? currentPrice * (1 + shockFraction) : null;

      return {
        symbol: h.symbol,
        name: h.name,
        assetClass: h.assetClass,
        weight: w,
        shockFraction,
        portContrib,
        currentPrice,
        shockedPrice,
      };
    }).sort((a, b) => a.portContrib - b.portContrib);
  }, [holdings, effectiveWeights, scenario, barsMap]);

  // ── Aggregate portfolio impact ─────────────────────────────────────────────
  const portfolioImpact = useMemo(() =>
    holdingImpacts.reduce((s, h) => s + h.portContrib, 0),
    [holdingImpacts]
  );

  // ── Scenario path (indicative forward curve under shock) ─────────────────
  const scenarioPath = useMemo(() => {
    const points = 60;
    const baseReturn = 0;
    const shockPerStep = portfolioImpact / 10;
    const recovery = -portfolioImpact / 50;
    const path: Array<{ day: number; portfolio: number; baseline: number }> = [];
    let cum = 0;
    for (let i = 0; i <= points; i++) {
      const shock = i <= 10 ? shockPerStep : (i <= 40 ? recovery : 0);
      cum += shock;
      path.push({ day: i, portfolio: 100 + cum * 100, baseline: 100 });
    }
    return path;
  }, [portfolioImpact]);

  // ── Historical analog: show real price history over analog period ─────────
  const analogData = useMemo(() => {
    if (symbols.length === 0 || Object.keys(barsMap).length === 0) return [];
    const validSymbols = symbols.filter(s => barsMap[s] && barsMap[s].length >= 30);
    if (validSymbols.length === 0) return [];
    const refBars = barsMap[validSymbols[0]];
    const closes = refBars.map(b => b.close);
    const lr = logReturns(closes);
    const curve = rebase100(cumulativeLogReturns(lr));
    return refBars.slice(1).map((b, i) => ({ ts: b.ts, portfolio: curve[i] ?? 100 }));
  }, [symbols, barsMap]);

  // ── Cross-scenario comparison ─────────────────────────────────────────────
  const allScenarioImpacts = useMemo(() => {
    return STRESS_PRESETS.map(s => {
      const impact = holdings.reduce((sum, h) => {
        const shockKey = resolveShockKey(h.assetClass);
        const shock = s.shocks[shockKey] ?? s.shocks.equity;
        return sum + shock * (effectiveWeights[h.symbol] ?? 0);
      }, 0);
      return { scenario: s.label, impact };
    }).sort((a, b) => a.impact - b.impact);
  }, [holdings, effectiveWeights]);

  const worstScenarioImpact = allScenarioImpacts.length > 0
    ? Math.min(...allScenarioImpacts.map(s => s.impact))
    : undefined;

  const { observations, acknowledge } = usePortfolioIntelligence(
    selectedPortfolio?.id,
    holdings.length > 0 ? { holdings, effectiveWeights, worstScenarioImpact } : null,
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
        <Zap size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No holdings for scenario analysis</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, maxWidth: 300 }}>Add holdings to see stress-test impacts across historical shock scenarios.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Scenario & Stress View</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
          {selectedPortfolio?.name} · Contextual scenario intelligence · Historical shock proxies
        </p>
      </div>

      <PortfolioIntelligencePanel observations={observations} onAcknowledge={acknowledge} />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Scenario selector */}
        <ScenarioSelector scenarios={STRESS_PRESETS} selected={selectedScenario} onSelect={setSelectedScenario} />

        {/* Scenario summary card */}
        <ScenarioSummaryCard scenario={scenario} />

        {/* Portfolio impact headline */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            padding: '12px 20px',
            background: portfolioImpact < -0.15 ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'var(--muted)',
            border: `1px solid ${portfolioImpact < -0.15 ? 'color-mix(in srgb, var(--destructive) 30%, transparent)' : 'var(--border)'}`,
            borderRadius: 8,
          }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Estimated Portfolio Impact
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(portfolioImpact)}
            </p>
            {totalValue != null && (
              <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtUSD(portfolioImpact * totalValue)}
              </p>
            )}
            <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
              Weighted-average shock proxy across {holdings.length} holdings
            </p>
          </div>
          <div style={{ padding: '12px 20px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Impacted</p>
            <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--destructive)', letterSpacing: '-0.02em' }}>
              {holdingImpacts[0]?.symbol ?? '—'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
              {holdingImpacts[0] ? fmtBoth(holdingImpacts[0].portContrib, totalValue) + ' contribution' : ''}
            </p>
          </div>
        </div>

        {/* Row 1: Holding impact bars + scenario path */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          <SectionCard title="Holding Impact Analysis" subtitle={`${scenario.label} — per-holding estimated shock`} icon={<TrendingDown size={13} />}>
            {holdingImpacts.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(100, holdingImpacts.length * 26)}>
                <BarChart
                  data={holdingImpacts.map(h => ({ symbol: h.symbol, impact: h.portContrib * 100, shock: h.shockFraction * 100 }))}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={50} />
                  <ReferenceLine x={0} stroke="var(--border)" strokeDasharray="2 2" />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === 'impact' ? 'Portfolio Contribution' : 'Asset Shock']}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                  />
                  <Bar dataKey="impact" name="impact" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {holdingImpacts.map(h => <Cell key={h.symbol} fill={h.portContrib < 0 ? 'var(--destructive)' : 'var(--chart-2)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Loading price data…</p>
            )}
          </SectionCard>

          <SectionCard title="Indicative Shock Path" subtitle="Stylised scenario evolution — not a prediction" icon={<Activity size={13} />}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={scenarioPath} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="scenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `D${v}`} interval={9} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="3 3" />
                <Tooltip
                  formatter={(v: number, name: string) => [v.toFixed(1), name === 'portfolio' ? 'Portfolio' : 'Baseline']}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }}
                />
                <Area type="monotone" dataKey="portfolio" stroke="var(--destructive)" strokeWidth={2} fill="url(#scenGrad)" dot={false} name="portfolio" />
                <Line type="monotone" dataKey="baseline" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="baseline" />
              </AreaChart>
            </ResponsiveContainer>
            <p style={{ margin: '6px 0 0', fontSize: 9, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
              Stylised path for context only. Not a forecast.
            </p>
          </SectionCard>
        </div>

        {/* Row 2: Cross-scenario comparison */}
        <SectionCard title="Cross-Scenario Impact Comparison" subtitle="Estimated portfolio impact across all historical scenarios" icon={<TrendingDown size={13} />}>
          <ResponsiveContainer width="100%" height={Math.max(100, allScenarioImpacts.length * 30)}>
            <BarChart
              data={allScenarioImpacts.map(s => ({ scenario: s.scenario, impact: s.impact * 100 }))}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="scenario" tick={{ fontSize: 10, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={130} />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Portfolio Impact']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="impact" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {allScenarioImpacts.map(s => <Cell key={s.scenario} fill={s.impact < -0.2 ? 'var(--destructive)' : s.impact < -0.1 ? 'var(--chart-4)' : s.impact < 0 ? 'color-mix(in srgb, var(--chart-4) 60%, var(--chart-2))' : 'var(--chart-2)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Row 3: Historical context chart */}
        {analogData.length > 10 && (
          <SectionCard title="Historical Price Context" subtitle="Rebased portfolio proxy from available history" icon={<TrendingUp size={13} />}>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={analogData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(0)} />
                <Tooltip formatter={(v: number) => [v.toFixed(1), 'Portfolio']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
                <Line type="monotone" dataKey="portfolio" stroke="var(--primary)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* Holdings detail table */}
        {holdingImpacts.length > 0 && (
          <SectionCard title="Holding-Level Scenario Detail" subtitle={`${scenario.label} shock applied to each position`} icon={<AlertCircle size={13} />}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol', 'Asset Class', 'Weight', ...(totalValue ? ['Exposure'] : []), 'Asset Shock', 'Portfolio Contribution', ...(totalValue ? ['Est. Impact ($)'] : [])].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdingImpacts.map((h, i) => {
                    const exposure = totalValue != null ? totalValue * h.weight : null;
                    const impactDollar = exposure != null ? exposure * h.shockFraction : null;
                    return (
                    <tr key={h.symbol} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--foreground)' }}>{h.symbol}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)' }}>
                        <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: 'var(--muted)', border: '1px solid var(--border)' }}>{h.assetClass}</span>
                      </td>
                      <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>{(h.weight * 100).toFixed(1)}%</td>
                      {totalValue != null && (
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', fontWeight: 600 }}>
                          ${exposure != null ? (exposure >= 1000 ? `${(exposure/1000).toFixed(1)}K` : exposure.toFixed(0)) : '—'}
                        </td>
                      )}
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: h.shockFraction < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtShock(h.shockFraction)}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: h.portContrib < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPct(h.portContrib)}
                      </td>
                      {totalValue != null && (
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: (impactDollar ?? 0) < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {impactDollar != null ? fmtUSD(impactDollar) : '—'}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--muted)' }}>
                    <td colSpan={totalValue ? 5 : 4} style={{ padding: '8px 10px', fontWeight: 800, color: 'var(--foreground)' }}>TOTAL PORTFOLIO IMPACT</td>
                    <td style={{ padding: '8px 10px', fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(portfolioImpact)}</td>
                    {totalValue != null && (
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(portfolioImpact * totalValue)}</td>
                    )}
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
