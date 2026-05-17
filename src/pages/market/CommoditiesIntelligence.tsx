import React, { useMemo, useState } from 'react';
import { Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { useCommodityDashboard } from '../../hooks/useDashboard';
import { COMMODITY_SYMBOLS, classifyCommodities, type DashboardQuote } from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';
import type { HeatmapGridGroup } from '../../components/market-dashboards/HeatmapGrid';

function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(2);
}

function buildRows(quotes: DashboardQuote[]): PerformanceRow[] {
  const nameMap = Object.fromEntries(COMMODITY_SYMBOLS.map((c) => [c.symbol, c.name]));
  return quotes
    .filter((q) => q.ok)
    .map((q) => ({ symbol: q.symbol, name: nameMap[q.symbol] ?? q.symbol, price: q.price, changePercent: q.changePercent, change: q.change }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

function buildHeatmapGroups(quotes: DashboardQuote[]): HeatmapGridGroup[] {
  const nameMap = Object.fromEntries(COMMODITY_SYMBOLS.map((c) => [c.symbol, c.name]));
  const groups: Record<string, { quotes: DashboardQuote[]; label: string }> = {
    energy:      { quotes: [], label: 'Energy' },
    metals:      { quotes: [], label: 'Metals' },
  };

  for (const meta of COMMODITY_SYMBOLS) {
    const q = quotes.find((r) => r.symbol === meta.symbol);
    if (q?.ok) groups[meta.category].quotes.push(q);
  }

  return Object.entries(groups)
    .filter(([, g]) => g.quotes.length > 0)
    .map(([, g]) => ({
      name: g.label,
      avgValue: g.quotes.reduce((s, q) => s + q.changePercent, 0) / g.quotes.length,
      cells: g.quotes.map((q) => ({
        id: q.symbol, label: nameMap[q.symbol]?.split(' ')[0] ?? q.symbol,
        sublabel: nameMap[q.symbol], value: q.changePercent, size: 'lg' as const,
      })),
    }));
}

const IntelligenceSummaryPanel: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifyCommodities(quotes), [quotes]);
  const regimeColor = intel.regime === 'inflationary' ? 'var(--primary)' : intel.regime === 'deflationary' ? 'var(--chart-3)' : 'var(--muted-foreground)';
  const Icon = intel.regime === 'inflationary' ? TrendingUp : intel.regime === 'deflationary' ? TrendingDown : Minus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 8,
        background: `color-mix(in srgb, ${regimeColor} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${regimeColor} 22%, var(--border))`,
      }}>
        <Icon size={16} style={{ color: regimeColor, marginTop: 1, flexShrink: 0 }} />
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
    </div>
  );
};

export const CommoditiesIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useCommodityDashboard();
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const rows = useMemo(() => quotes ? buildRows(quotes) : [], [quotes]);
  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);

  const gold  = quotes?.find((q) => q.symbol === 'XAU/USD');
  const oil   = quotes?.find((q) => q.symbol === 'WTI/USD');
  const copper = quotes?.find((q) => q.symbol === 'HG/USD');

  const ok = quotes?.filter((q) => q.ok) ?? [];
  const energyOk = ok.filter((q) => COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'energy');
  const metalsOk = ok.filter((q) => COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'metals');
  const energyAvg = energyOk.length ? energyOk.reduce((s, q) => s + q.changePercent, 0) / energyOk.length : 0;
  const metalsAvg = metalsOk.length ? metalsOk.reduce((s, q) => s + q.changePercent, 0) / metalsOk.length : 0;

  return (
    <DashboardShell
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Flame size={18} />Commodities Intelligence</span>}
      subtitle="Commodity market monitoring — energy, metals, inflation sensitivity and cross-asset relationships."
      actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
    >
      {/* Headline KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {gold && (
          <IntelligenceMetricCard label="Gold (XAU)" value={`$${fmtPrice(gold.price)}`} changePercent={gold.changePercent} status={status} fetchedAt={fetchedAt} hint="Safe-haven metal" />
        )}
        {oil && (
          <IntelligenceMetricCard label="Crude (WTI)" value={`$${fmtPrice(oil.price)}`} changePercent={oil.changePercent} status={status} fetchedAt={fetchedAt} hint="West Texas Intermediate" />
        )}
        {copper && (
          <IntelligenceMetricCard label="Copper (HG)" value={`$${fmtPrice(copper.price)}`} changePercent={copper.changePercent} status={status} fetchedAt={fetchedAt} hint="Cyclical demand proxy" />
        )}
        <IntelligenceMetricCard label="Energy Avg" value={`${energyAvg >= 0 ? '+' : ''}${energyAvg.toFixed(2)}%`} hint={`${energyOk.length} contracts`} />
        <IntelligenceMetricCard label="Metals Avg" value={`${metalsAvg >= 0 ? '+' : ''}${metalsAvg.toFixed(2)}%`} hint={`${metalsOk.length} contracts`} />
      </div>

      {loading && !quotes && (
        <DashboardSectionCard title="Loading commodity data…">
          <DashboardLoadingState rows={6} />
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
            <DashboardSectionCard title="Commodity Performance" subtitle="All tracked commodities ranked by daily change" onRefresh={refresh}>
              <CompactPerformanceTable rows={rows} showSparkline={false} />
            </DashboardSectionCard>

            <DashboardSectionCard title="Inflation Sensitivity Panel" subtitle="Commodity regime interpretation">
              <IntelligenceSummaryPanel quotes={quotes} />
            </DashboardSectionCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardSectionCard title="Commodity Heatmap" subtitle="Energy and metals daily performance" onRefresh={refresh}>
              <HeatmapGrid groups={heatmapGroups} onSelectCell={setSelectedCell} selectedCell={selectedCell} />
            </DashboardSectionCard>

            {/* Cross-asset note */}
            <DashboardSectionCard title="Cross-Asset Relationships" subtitle="Commodity signals interpreted in macro context">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Gold', value: gold?.changePercent, note: 'Rising gold = safe-haven demand / dollar weakness / real rate decline' },
                  { label: 'Crude Oil', value: oil?.changePercent, note: 'Rising oil = inflation pressure / EM headwind / energy sector tailwind' },
                  { label: 'Copper', value: copper?.changePercent, note: 'Rising copper = global growth demand / industrial cycle expansion' },
                ].map((item) => (
                  <div key={item.label} style={{
                    padding: '8px 10px', borderRadius: 7,
                    background: 'var(--muted)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{item.label}</span>
                      {item.value != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                          color: item.value >= 0 ? '#4E6040' : 'var(--primary)',
                        }}>
                          {item.value >= 0 ? '+' : ''}{item.value.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>{item.note}</p>
                  </div>
                ))}
              </div>
            </DashboardSectionCard>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
