import React, { useMemo, useState } from 'react';
import { Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardPageTabs } from '../../components/market-dashboards/DashboardPageTabs';
import { DashboardFilterBar } from '../../components/market-dashboards/DashboardFilterBar';
import { InstrumentDetailDrawer, useInstrumentDrawer } from '../../components/market-dashboards/InstrumentDetailDrawer';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { SummaryStrip } from '../../components/intelligence-drawer';
import { commoditiesSummary } from '../../lib/intelligence/summaries';
import { useCommodityDashboard } from '../../hooks/useDashboard';
import { COMMODITY_SYMBOLS, classifyCommodities, type DashboardQuote } from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'energy',       label: 'Energy' },
  { id: 'metals',       label: 'Metals' },
  { id: 'heatmap',      label: 'Heatmap' },
  { id: 'cross-asset',  label: 'Cross-Asset' },
  { id: 'intelligence', label: 'Intelligence' },
];

const CAT_OPTIONS = [
  { value: 'all',         label: 'All Commodities' },
  { value: 'energy',      label: 'Energy' },
  { value: 'metals',      label: 'Metals' },
];

const CROSS_ASSET_NOTES = [
  { symbol: 'XAU/USD', label: 'Gold',        note: 'Rising gold = safe-haven demand, dollar weakness, real rate decline, or geopolitical risk premium.' },
  { symbol: 'WTI/USD', label: 'Crude (WTI)', note: 'Rising oil = inflation pressure, EM headwind, energy sector tailwind, supply shock signal.' },
  { symbol: 'BCO/USD', label: 'Brent Crude', note: 'Brent-WTI spread monitors global supply arbitrage and geopolitical risk in Atlantic basin.' },
  { symbol: 'HG/USD',  label: 'Copper',      note: 'Copper as "Dr. Copper" — rising = global growth demand, industrial expansion, China activity.' },
  { symbol: 'XAG/USD', label: 'Silver',      note: 'Silver is hybrid: partly safe-haven like gold, partly industrial. Gold/Silver ratio is a risk gauge.' },
  { symbol: 'NG/USD',  label: 'Natural Gas', note: 'Natural gas is seasonal and regional. Extreme moves signal supply disruptions or demand shocks.' },
];

function fmtPrice(n: number) {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function buildRows(quotes: DashboardQuote[], category?: string): PerformanceRow[] {
  const nameMap = Object.fromEntries(COMMODITY_SYMBOLS.map((c) => [c.symbol, c.name]));
  return quotes
    .filter((q) => {
      if (!q.ok) return false;
      const meta = COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol);
      if (!meta) return false;
      if (category && category !== 'all' && meta.category !== category) return false;
      return true;
    })
    .map((q) => ({ symbol: q.symbol, name: nameMap[q.symbol] ?? q.symbol, price: q.price, changePercent: q.changePercent, change: q.change, _raw: q }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

function buildHeatmapGroups(quotes: DashboardQuote[]) {
  const nameMap = Object.fromEntries(COMMODITY_SYMBOLS.map((c) => [c.symbol, c.name]));
  const energy = quotes.filter((q) => q.ok && COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'energy');
  const metals  = quotes.filter((q) => q.ok && COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'metals');
  return [
    energy.length ? { name: 'Energy', avgValue: energy.reduce((s, q) => s + q.changePercent, 0) / energy.length, cells: energy.map((q) => ({ id: q.symbol, label: nameMap[q.symbol]?.split(' ')[0] ?? q.symbol, sublabel: nameMap[q.symbol], value: q.changePercent, size: 'lg' as const })) } : null,
    metals.length ? { name: 'Metals', avgValue: metals.reduce((s, q) => s + q.changePercent, 0) / metals.length,  cells: metals.map((q) => ({ id: q.symbol, label: nameMap[q.symbol]?.split(' ')[0] ?? q.symbol, sublabel: nameMap[q.symbol], value: q.changePercent, size: 'lg' as const })) } : null,
  ].filter(Boolean) as any[];
}

const IntelligenceSummaryView: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifyCommodities(quotes), [quotes]);
  const color = intel.regime === 'inflationary' ? 'var(--primary)' : intel.regime === 'deflationary' ? 'var(--chart-3)' : 'var(--muted-foreground)';
  const Icon  = intel.regime === 'inflationary' ? TrendingUp : intel.regime === 'deflationary' ? TrendingDown : Minus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10, background: `color-mix(in srgb, ${color} 8%, var(--card))`, border: `1px solid color-mix(in srgb, ${color} 22%, var(--border))` }}>
        <Icon size={18} style={{ color, marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{intel.headline}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>{intel.note}</p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {intel.signals.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.5 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CommoditiesIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useCommodityDashboard();
  const { drawerState, openDrawer, closeDrawer } = useInstrumentDrawer();

  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const nameMap = Object.fromEntries(COMMODITY_SYMBOLS.map((c) => [c.symbol, c.name]));
  const gold    = quotes?.find((q) => q.symbol === 'XAU/USD');
  const oil     = quotes?.find((q) => q.symbol === 'WTI/USD');
  const copper  = quotes?.find((q) => q.symbol === 'HG/USD');

  const ok = useMemo(() => quotes?.filter((q) => q.ok) ?? [], [quotes]);
  const energyAvg = useMemo(() => { const e = ok.filter((q) => COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'energy'); return e.length ? e.reduce((s, q) => s + q.changePercent, 0) / e.length : 0; }, [ok]);
  const metalsAvg = useMemo(() => { const m = ok.filter((q) => COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'metals');  return m.length ? m.reduce((s, q) => s + q.changePercent, 0) / m.length : 0; }, [ok]);

  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);

  const filteredRows = useMemo(() => {
    return (quotes ? buildRows(quotes, catFilter) : []).filter((row) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return row.symbol.toLowerCase().includes(s) || row.name.toLowerCase().includes(s);
    });
  }, [quotes, catFilter, search]);

  const handleRowClick = (row: PerformanceRow) => {
    if (row._raw) openDrawer(row._raw, 'commodity');
    setSelectedCell(row.symbol);
  };
  const handleCellClick = (id: string) => {
    setSelectedCell(id);
    const q = quotes?.find((r) => r.symbol === id);
    if (q) openDrawer(q, 'commodity');
  };

  const summary = useMemo(() => quotes ? commoditiesSummary(quotes) : null, [quotes]);

  return (
    <>
      <DashboardShell
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Flame size={18} />Commodities Intelligence</span>}
        subtitle="Commodity market monitoring — click any instrument for full detail and intelligence."
        actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
      >
        <SummaryStrip payload={summary} />
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10, marginBottom: 16 }}>
          {gold   && <IntelligenceMetricCard label="Gold (XAU)"    value={`$${fmtPrice(gold.price)}`}   changePercent={gold.changePercent}   status={status} fetchedAt={fetchedAt} hint="Safe-haven" onClick={() => openDrawer(gold, 'commodity')} />}
          {oil    && <IntelligenceMetricCard label="Crude (WTI)"   value={`$${fmtPrice(oil.price)}`}    changePercent={oil.changePercent}    status={status} fetchedAt={fetchedAt} hint="Energy" onClick={() => openDrawer(oil, 'commodity')} />}
          {copper && <IntelligenceMetricCard label="Copper (HG)"   value={`$${fmtPrice(copper.price)}`} changePercent={copper.changePercent} status={status} fetchedAt={fetchedAt} hint="Cyclical" onClick={() => openDrawer(copper, 'commodity')} />}
          <IntelligenceMetricCard label="Energy Avg" value={`${energyAvg >= 0 ? '+' : ''}${energyAvg.toFixed(2)}%`} hint={`${ok.filter((q) => COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'energy').length} contracts`} />
          <IntelligenceMetricCard label="Metals Avg"  value={`${metalsAvg >= 0 ? '+' : ''}${metalsAvg.toFixed(2)}%`} hint={`${ok.filter((q) => COMMODITY_SYMBOLS.find((c) => c.symbol === q.symbol)?.category === 'metals').length} contracts`} />
        </div>

        <DashboardPageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {loading && !quotes && <DashboardSectionCard title="Loading…"><DashboardLoadingState /></DashboardSectionCard>}
        {error && !quotes && <DashboardSectionCard title="Error"><DashboardErrorState message={error.message} onRetry={refresh} /></DashboardSectionCard>}

        {quotes && activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <DashboardSectionCard title="All Commodities" subtitle="Click a row to open instrument detail" onRefresh={refresh}>
              <DashboardFilterBar search={search} onSearchChange={setSearch} filters={[{ id: 'cat', label: 'Category', options: CAT_OPTIONS, value: catFilter, onChange: setCatFilter }]} resultCount={filteredRows.length} />
              <CompactPerformanceTable rows={filteredRows} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
            </DashboardSectionCard>
            <DashboardSectionCard title="Intelligence"><IntelligenceSummaryView quotes={quotes} /></DashboardSectionCard>
          </div>
        )}

        {quotes && activeTab === 'energy' && (
          <DashboardSectionCard title="Energy Commodities" subtitle="Click any row to open detail" onRefresh={refresh}>
            <CompactPerformanceTable rows={buildRows(quotes, 'energy')} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'metals' && (
          <DashboardSectionCard title="Metals" subtitle="Click any row to open detail" onRefresh={refresh}>
            <CompactPerformanceTable rows={buildRows(quotes, 'metals')} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'heatmap' && (
          <DashboardSectionCard title="Commodity Heatmap" subtitle="Click any tile to open instrument detail" onRefresh={refresh}>
            <HeatmapGrid groups={heatmapGroups} onSelectCell={handleCellClick} selectedCell={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'cross-asset' && (
          <DashboardSectionCard title="Cross-Asset Relationships" subtitle="Directional interpretation for each commodity">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CROSS_ASSET_NOTES.map((item) => {
                const q = quotes.find((r) => r.symbol === item.symbol);
                return (
                  <div
                    key={item.symbol}
                    onClick={() => { if (q) { openDrawer(q, 'commodity'); setSelectedCell(q.symbol); } }}
                    style={{
                      padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: `1px solid ${selectedCell === item.symbol ? 'var(--primary)' : 'var(--border)'}`,
                      cursor: q ? 'pointer' : 'default', transition: 'border-color 100ms',
                    }}
                    onMouseEnter={(e) => { if (q && selectedCell !== item.symbol) (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--primary) 40%, var(--border))'; }}
                    onMouseLeave={(e) => { if (selectedCell !== item.symbol) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{item.label}</span>
                      {q?.ok && (
                        <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: q.changePercent >= 0 ? '#4E6040' : 'var(--primary)' }}>
                          {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{item.note}</p>
                    {q && <p style={{ margin: '4px 0 0', fontSize: 9, color: 'var(--muted-foreground)', opacity: 0.7 }}>Click to open detail →</p>}
                  </div>
                );
              })}
            </div>
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'intelligence' && (
          <DashboardSectionCard title="Intelligence Summary"><IntelligenceSummaryView quotes={quotes} /></DashboardSectionCard>
        )}
      </DashboardShell>

      <InstrumentDetailDrawer row={drawerState.row} open={drawerState.open} onClose={closeDrawer} />
    </>
  );
};
