import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { useFXDashboard } from '../../hooks/useDashboard';
import { FX_SYMBOLS, classifyFX, type DashboardQuote } from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';
import type { HeatmapGridGroup } from '../../components/market-dashboards/HeatmapGrid';

function fmtFXPrice(n: number) {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(5);
}

function buildRows(quotes: DashboardQuote[]): PerformanceRow[] {
  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  return quotes
    .filter((q) => q.ok && q.symbol !== 'UUP')
    .map((q) => ({
      symbol: nameMap[q.symbol] ?? q.symbol,
      name: '',
      price: q.price,
      changePercent: q.changePercent,
      change: q.change,
    }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

function buildHeatmapGroups(quotes: DashboardQuote[]): HeatmapGridGroup[] {
  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  const g10 = quotes.filter((q) => q.ok && q.symbol !== 'UUP' && FX_SYMBOLS.find((f) => f.pair === q.symbol)?.group === 'g10');
  if (!g10.length) return [];
  return [{
    name: 'G10 FX',
    avgValue: g10.reduce((s, q) => s + q.changePercent, 0) / g10.length,
    cells: g10.sort((a, b) => b.changePercent - a.changePercent).map((q) => ({
      id: q.symbol, label: nameMap[q.symbol] ?? q.symbol, value: q.changePercent, size: 'md' as const,
    })),
  }];
}

const BarTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--foreground)' }}>{label}</p>
      <p style={{ margin: '2px 0 0', color: v >= 0 ? '#4E6040' : 'var(--primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {v >= 0 ? '+' : ''}{v.toFixed(3)}%
      </p>
    </div>
  );
};

const G10BarChart: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  const data = quotes
    .filter((q) => q.ok && q.symbol !== 'UUP')
    .map((q) => ({ name: nameMap[q.symbol] ?? q.symbol, value: parseFloat(q.changePercent.toFixed(3)) }))
    .sort((a, b) => b.value - a.value);

  if (!data.length) return <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>No FX data</div>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 64 }}>
        <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? '#4E6040' : 'var(--primary)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const IntelligenceSummaryPanel: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifyFX(quotes), [quotes]);
  const color = intel.regime === 'strengthening' ? 'var(--primary)' : intel.regime === 'weakening' ? '#4E6040' : 'var(--muted-foreground)';
  const Icon = intel.regime === 'strengthening' ? TrendingUp : intel.regime === 'weakening' ? TrendingDown : Minus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 8,
        background: `color-mix(in srgb, ${color} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 22%, var(--border))`,
      }}>
        <Icon size={16} style={{ color, marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{intel.headline}</p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>{intel.note}</p>
        </div>
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {intel.signals.map((s, i) => (
          <li key={i} style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>{s}</li>
        ))}
      </ul>

      {/* Liquidity pressure note */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 7, background: 'var(--muted)', border: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Liquidity Interpretation</p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--foreground)', lineHeight: 1.5 }}>
          {intel.regime === 'strengthening'
            ? 'Dollar strength typically coincides with tighter global liquidity conditions — watch for EM funding stress and credit spread widening.'
            : intel.regime === 'weakening'
            ? 'Dollar weakness typically signals easier global liquidity — supportive for EM assets, commodities, and risk appetite.'
            : 'Dollar directionless — liquidity conditions neutral pending directional catalysts (Fed policy, risk events, positioning).'}
        </p>
      </div>
    </div>
  );
};

export const FxLiquidityIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useFXDashboard();
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const rows = useMemo(() => quotes ? buildRows(quotes) : [], [quotes]);
  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);

  const dxy   = quotes?.find((q) => q.symbol === 'UUP');
  const eurusd = quotes?.find((q) => q.symbol === 'EUR/USD');
  const usdjpy = quotes?.find((q) => q.symbol === 'USD/JPY');
  const gbpusd = quotes?.find((q) => q.symbol === 'GBP/USD');

  return (
    <DashboardShell
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ArrowLeftRight size={18} />FX & Liquidity Intelligence</span>}
      subtitle="Currency, dollar and liquidity pressure monitoring — DXY state, G10 FX performance, carry dynamics."
      actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
    >
      {/* Headline KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {dxy && (
          <IntelligenceMetricCard label="DXY (UUP proxy)" value={fmtFXPrice(dxy.price)} changePercent={dxy.changePercent} status={status} fetchedAt={fetchedAt} hint="Dollar index proxy ETF" />
        )}
        {eurusd && (
          <IntelligenceMetricCard label="EUR/USD" value={fmtFXPrice(eurusd.price)} changePercent={eurusd.changePercent} status={status} fetchedAt={fetchedAt} />
        )}
        {usdjpy && (
          <IntelligenceMetricCard label="USD/JPY" value={fmtFXPrice(usdjpy.price)} changePercent={usdjpy.changePercent} status={status} fetchedAt={fetchedAt} />
        )}
        {gbpusd && (
          <IntelligenceMetricCard label="GBP/USD" value={fmtFXPrice(gbpusd.price)} changePercent={gbpusd.changePercent} status={status} fetchedAt={fetchedAt} />
        )}
      </div>

      {loading && !quotes && (
        <DashboardSectionCard title="Loading FX data…">
          <DashboardLoadingState rows={7} />
        </DashboardSectionCard>
      )}
      {error && !quotes && (
        <DashboardSectionCard title="Data Error">
          <DashboardErrorState message={error.message} onRetry={refresh} />
        </DashboardSectionCard>
      )}

      {quotes && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardSectionCard title="G10 FX Performance" subtitle="Daily change ranked across major pairs" onRefresh={refresh}>
              <G10BarChart quotes={quotes} />
            </DashboardSectionCard>

            <DashboardSectionCard title="FX Pair Table" subtitle="All tracked pairs with daily change">
              <CompactPerformanceTable rows={rows} showSparkline={false} />
            </DashboardSectionCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardSectionCard title="FX Heatmap" subtitle="G10 currency pair daily performance" onRefresh={refresh}>
              <HeatmapGrid groups={heatmapGroups} onSelectCell={setSelectedCell} selectedCell={selectedCell} />
            </DashboardSectionCard>

            <DashboardSectionCard title="Intelligence Summary" subtitle="Dollar regime and liquidity interpretation">
              <IntelligenceSummaryPanel quotes={quotes} />
            </DashboardSectionCard>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
