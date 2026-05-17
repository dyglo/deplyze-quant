import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { PieChart as PieChartIcon, Loader2, TrendingUp, Activity, AlertCircle } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { fetchOHLCV } from '../../services/marketService';
import { logReturns } from '../../lib/quant/returns';
import { correlationMatrix } from '../../lib/quant/correlation';
import { rollingAnnualisedVol } from '../../lib/quant/volatility';
import type { OHLCVBar, AssetClass } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }

function hhi(weights: number[]): number {
  return weights.reduce((s, w) => s + w * w, 0);
}

function lerp(t: number, lo: string, hi: string): string {
  // Simple gradient: lo=green, hi=red for correlations
  return t >= 0 ? `rgba(78,96,64,${0.2 + t * 0.8})` : `rgba(180,60,60,${0.2 + Math.abs(t) * 0.8})`;
}

function corrColor(v: number): string {
  if (v >= 0.7) return 'rgba(180,60,60,0.85)';
  if (v >= 0.4) return 'rgba(200,120,40,0.75)';
  if (v >= 0.1) return 'rgba(200,180,40,0.5)';
  if (v >= -0.1) return 'rgba(120,160,120,0.4)';
  if (v >= -0.4) return 'rgba(60,140,100,0.6)';
  return 'rgba(40,100,160,0.8)';
}

const SECTOR_COLORS = [
  'var(--primary)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', '#8884d8', '#82ca9d',
  '#ffc658', '#a4de6c', '#d0ed57', '#83a6ed',
];

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

// ─── Concentration gauge ──────────────────────────────────────────────────────

const ConcentrationGauge: React.FC<{ hhiValue: number; label: string }> = ({ hhiValue, label }) => {
  const normalized = Math.min(1, hhiValue);
  const pct = (normalized * 100).toFixed(1);
  const color = normalized > 0.25 ? 'var(--destructive)' : normalized > 0.15 ? 'var(--chart-4)' : 'var(--chart-2)';
  const interpretation = normalized > 0.25 ? 'Concentrated' : normalized > 0.15 ? 'Moderate' : 'Diversified';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', background: 'var(--muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{pct}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 600ms ease' }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{interpretation}</span>
    </div>
  );
};

// ─── Correlation heatmap ──────────────────────────────────────────────────────

const CorrelationHeatmap: React.FC<{ symbols: string[]; matrix: number[][] }> = ({ symbols, matrix }) => {
  if (symbols.length === 0) return <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>No data available.</p>;

  const cellSize = Math.max(28, Math.min(44, Math.floor(320 / symbols.length)));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
        <thead>
          <tr>
            <th style={{ width: cellSize }} />
            {symbols.map(s => (
              <th key={s} style={{ width: cellSize, textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', padding: '0 2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: cellSize }}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((rowSym, i) => (
            <tr key={rowSym}>
              <td style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', paddingRight: 4, textAlign: 'right', whiteSpace: 'nowrap' }}>{rowSym}</td>
              {symbols.map((colSym, j) => {
                const v = matrix[i]?.[j] ?? 0;
                const isDiag = i === j;
                return (
                  <td
                    key={colSym}
                    title={`${rowSym} × ${colSym}: ${v.toFixed(3)}`}
                    style={{
                      width: cellSize, height: cellSize,
                      background: isDiag ? 'var(--muted)' : corrColor(v),
                      borderRadius: 3,
                      textAlign: 'center',
                      fontSize: 9,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: isDiag ? 'var(--muted-foreground)' : (Math.abs(v) > 0.3 ? '#fff' : 'var(--foreground)'),
                    }}
                  >
                    {isDiag ? '—' : v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const ExposureAnalysis: React.FC = () => {
  const { selectedPortfolio, holdings, loading, holdingsLoading, effectiveWeights } = usePortfolioWorkspace();
  const [barsMap, setBarsMap] = useState<Record<string, OHLCVBar[]>>({});
  const [fetching, setFetching] = useState(false);

  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);

  // Fetch OHLCV for correlation computation
  useEffect(() => {
    if (symbols.length === 0) { setBarsMap({}); return; }
    setFetching(true);
    Promise.allSettled(symbols.map(s => fetchOHLCV(s, '1day', 90))).then(results => {
      const m: Record<string, OHLCVBar[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.bars.length >= 10) {
          m[symbols[i]] = r.value.bars;
        }
      });
      setBarsMap(m);
      setFetching(false);
    });
  }, [symbols.join(',')]);

  // ── Exposure breakdowns ─────────────────────────────────────────────────────
  const sectorExposure = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      const s = h.sector ?? 'Unknown';
      map[s] = (map[s] ?? 0) + (effectiveWeights[h.symbol] ?? 0);
    }
    return Object.entries(map)
      .map(([label, weight]) => ({ label, weight }))
      .sort((a, b) => b.weight - a.weight);
  }, [holdings, effectiveWeights]);

  const assetClassExposure = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      const ac = h.assetClass ?? 'equity';
      map[ac] = (map[ac] ?? 0) + (effectiveWeights[h.symbol] ?? 0);
    }
    return Object.entries(map)
      .map(([label, weight]) => ({ label, weight }))
      .sort((a, b) => b.weight - a.weight);
  }, [holdings, effectiveWeights]);

  const regionExposure = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of holdings) {
      const r = h.region ?? h.country ?? 'Unknown';
      map[r] = (map[r] ?? 0) + (effectiveWeights[h.symbol] ?? 0);
    }
    return Object.entries(map)
      .map(([label, weight]) => ({ label, weight }))
      .sort((a, b) => b.weight - a.weight);
  }, [holdings, effectiveWeights]);

  const top5Weight = useMemo(() =>
    [...holdings]
      .sort((a, b) => (effectiveWeights[b.symbol] ?? 0) - (effectiveWeights[a.symbol] ?? 0))
      .slice(0, 5)
      .reduce((s, h) => s + (effectiveWeights[h.symbol] ?? 0), 0),
    [holdings, effectiveWeights]
  );

  const hhiValue = useMemo(() => hhi(holdings.map(h => effectiveWeights[h.symbol] ?? 0)), [holdings, effectiveWeights]);

  // ── Correlation matrix ─────────────────────────────────────────────────────
  const { corrSymbols, corrMatrix } = useMemo(() => {
    const validSymbols = symbols.filter(s => barsMap[s]);
    if (validSymbols.length < 2) return { corrSymbols: [], corrMatrix: [] };
    const minLen = Math.min(...validSymbols.map(s => barsMap[s].length));
    const logReturnArrays = validSymbols.map(s =>
      logReturns(barsMap[s].slice(-minLen).map(b => b.close))
    );
    const mat = correlationMatrix(logReturnArrays);
    return { corrSymbols: validSymbols, corrMatrix: mat };
  }, [barsMap, symbols]);

  // ── Volatility comparison ─────────────────────────────────────────────────
  const volData = useMemo(() =>
    symbols
      .filter(s => barsMap[s] && barsMap[s].length >= 21)
      .map(s => {
        const lr = logReturns(barsMap[s].map(b => b.close));
        const vols = rollingAnnualisedVol(lr, 21);
        const latestVol = vols[vols.length - 1] ?? 0;
        return { symbol: s, vol: latestVol };
      })
      .sort((a, b) => b.vol - a.vol),
    [barsMap, symbols]
  );

  // ── Factor-like radar (vol, size, momentum — illustrative using computed values) ─
  const radarData = useMemo(() => {
    if (holdings.length === 0) return [];
    const avgVol = volData.reduce((s, v) => s + v.vol, 0) / Math.max(1, volData.length);
    const avgWeight = 1 / Math.max(1, holdings.length);
    return [
      { factor: 'Concentration', value: Math.min(100, hhiValue * 400) },
      { factor: 'Avg Volatility', value: Math.min(100, avgVol * 2) },
      { factor: 'Top-5 Weight', value: Math.min(100, top5Weight * 100) },
      { factor: 'Breadth', value: Math.min(100, holdings.length * 8) },
      { factor: 'Equal Weight', value: avgWeight < 0.12 ? 75 : 40 },
    ];
  }, [holdings, volData, hhiValue, top5Weight]);

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
        <PieChartIcon size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No holdings to analyse</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, maxWidth: 320 }}>
          Add holdings in the Holdings & Watchlist page to see sector, factor, geographic, and correlation analysis.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Exposure Analysis</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
          {selectedPortfolio?.name} · {holdings.length} holdings · Sector, factor, geographic & correlation analysis
        </p>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Row 1: Concentration gauges ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <ConcentrationGauge hhiValue={hhiValue} label="HHI Concentration" />
          <ConcentrationGauge hhiValue={top5Weight} label="Top-5 Weight" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 14px', background: 'var(--muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Holdings Count</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.03em' }}>{holdings.length}</span>
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{sectorExposure.length} sectors</span>
          </div>
        </div>

        {/* ── Row 2: Sector + Asset Class bars ────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <SectionCard title="Sector Exposure" subtitle="By portfolio weight" icon={<PieChartIcon size={13} />}>
            {sectorExposure.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(100, sectorExposure.length * 28)}>
                <BarChart data={sectorExposure} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip
                    formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Weight']}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                  />
                  <Bar dataKey="weight" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {sectorExposure.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>No sector data. Add sector tags to holdings.</p>
            )}
          </SectionCard>

          <SectionCard title="Asset Class Exposure" subtitle="By portfolio weight" icon={<Activity size={13} />}>
            <ResponsiveContainer width="100%" height={Math.max(100, assetClassExposure.length * 28)}>
              <BarChart data={assetClassExposure} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={70} />
                <Tooltip formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Weight']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="weight" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {assetClassExposure.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        {/* ── Row 3: Geographic + Radar ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>

          <SectionCard title="Geographic / Region Exposure" subtitle="By portfolio weight" icon={<TrendingUp size={13} />}>
            {regionExposure.some(r => r.label !== 'Unknown') ? (
              <ResponsiveContainer width="100%" height={Math.max(80, regionExposure.length * 26)}>
                <BarChart data={regionExposure} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Weight']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="weight" radius={[0, 4, 4, 0]} fill="var(--chart-3)" maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>No region data. Add region tags to holdings for geographic analysis.</p>
            )}
          </SectionCard>

          <SectionCard title="Risk Profile Radar" subtitle="Portfolio construction characteristics" icon={<Activity size={13} />}>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={70}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="factor" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickCount={4} />
                  <Radar dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.2} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            ) : null}
          </SectionCard>
        </div>

        {/* ── Row 4: Volatility bar ────────────────────────────────────────── */}
        {volData.length > 0 && (
          <SectionCard title="Realised Volatility by Holding" subtitle="21-day rolling annualised · Sorted by volatility" icon={<AlertCircle size={13} />}>
            {fetching ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted-foreground)' }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                Computing volatilities…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(100, volData.length * 26)}>
                <BarChart data={volData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Ann. Vol']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="vol" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {volData.map((d, i) => (
                      <Cell key={d.symbol} fill={d.vol > 40 ? 'var(--destructive)' : d.vol > 25 ? 'var(--chart-4)' : 'var(--chart-2)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        )}

        {/* ── Row 5: Correlation heatmap ───────────────────────────────────── */}
        <SectionCard title="Correlation Matrix" subtitle="90-day daily log returns · Pearson correlation" icon={<PieChartIcon size={13} />}>
          {fetching ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted-foreground)' }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
              Computing correlations…
            </div>
          ) : corrSymbols.length >= 2 ? (
            <div>
              <CorrelationHeatmap symbols={corrSymbols} matrix={corrMatrix} />
              <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                {[
                  { color: 'rgba(180,60,60,0.85)', label: '≥0.7 (high)' },
                  { color: 'rgba(200,120,40,0.75)', label: '0.4–0.7' },
                  { color: 'rgba(200,180,40,0.5)', label: '0.1–0.4' },
                  { color: 'rgba(120,160,120,0.4)', label: 'Near zero' },
                  { color: 'rgba(40,100,160,0.8)', label: '≤-0.4 (negative)' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--muted-foreground)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
              {symbols.length < 2 ? 'Add at least 2 holdings to compute correlations.' : 'Loading price history for correlation analysis…'}
            </p>
          )}
        </SectionCard>

      </div>
    </div>
  );
};
