import React, { useMemo, useState } from 'react';
import { Map, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardPageTabs } from '../../components/market-dashboards/DashboardPageTabs';
import { DashboardFilterBar } from '../../components/market-dashboards/DashboardFilterBar';
import { InstrumentDetailDrawer, useInstrumentDrawer } from '../../components/market-dashboards/InstrumentDetailDrawer';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { useCountryETFs } from '../../hooks/useDashboard';
import { COUNTRY_ETF_SYMBOLS, type DashboardQuote } from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'developed',  label: 'Developed Markets' },
  { id: 'emerging',   label: 'Emerging Markets' },
  { id: 'heatmap',    label: 'Heatmap' },
  { id: 'intelligence', label: 'Intelligence' },
];

const REGION_OPTIONS = [
  { value: 'all',       label: 'All Regions' },
  { value: 'developed', label: 'Developed' },
  { value: 'emerging',  label: 'Emerging' },
];

function buildRows(quotes: DashboardQuote[], region?: 'developed' | 'emerging'): PerformanceRow[] {
  const nameMap = Object.fromEntries(COUNTRY_ETF_SYMBOLS.map((c) => [c.symbol, c.name]));
  return quotes
    .filter((q) => {
      if (!q.ok) return false;
      const meta = COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol);
      if (!meta) return false;
      if (region && meta.region !== region) return false;
      return true;
    })
    .map((q) => ({
      symbol: q.symbol, name: nameMap[q.symbol] ?? q.symbol,
      price: q.price, changePercent: q.changePercent, change: q.change, _raw: q,
    }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

function buildHeatmapGroups(quotes: DashboardQuote[]) {
  const nameMap = Object.fromEntries(COUNTRY_ETF_SYMBOLS.map((c) => [c.symbol, c.name]));
  const devQ = quotes.filter((q) => q.ok && COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'developed');
  const emQ  = quotes.filter((q) => q.ok && COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'emerging');
  return [
    devQ.length ? { name: 'Developed Markets', avgValue: devQ.reduce((s, q) => s + q.changePercent, 0) / devQ.length, cells: devQ.sort((a, b) => b.changePercent - a.changePercent).map((q) => ({ id: q.symbol, label: q.symbol, sublabel: nameMap[q.symbol], value: q.changePercent, size: 'md' as const })) } : null,
    emQ.length  ? { name: 'Emerging Markets',  avgValue: emQ.reduce((s, q) => s + q.changePercent, 0) / emQ.length,  cells: emQ.sort((a, b) => b.changePercent - a.changePercent).map((q) => ({ id: q.symbol, label: q.symbol, sublabel: nameMap[q.symbol], value: q.changePercent, size: 'md' as const })) } : null,
  ].filter(Boolean) as any[];
}

const IntelligenceSummaryView: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const ok  = quotes.filter((q) => q.ok);
  const dev = ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'developed');
  const em  = ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'emerging');
  const devAvg = dev.length ? dev.reduce((s, q) => s + q.changePercent, 0) / dev.length : 0;
  const emAvg  = em.length  ? em.reduce((s, q) => s + q.changePercent, 0)  / em.length  : 0;
  const spread = devAvg - emAvg;

  const regime = emAvg < -1.0 ? 'risk-off' : (emAvg > 0.5 && devAvg > 0.5) ? 'risk-on' : 'neutral';
  const color = regime === 'risk-on' ? '#4E6040' : regime === 'risk-off' ? 'var(--primary)' : 'var(--muted-foreground)';
  const Icon  = regime === 'risk-on' ? TrendingUp : regime === 'risk-off' ? TrendingDown : Minus;

  const top = [...ok].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3).map((q) => q.name || q.symbol);
  const bot = [...ok].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3).map((q) => q.name || q.symbol);

  const headline = regime === 'risk-on'
    ? 'Global Risk-On — Broad Country Advance'
    : regime === 'risk-off'
    ? 'EM Under Pressure — Risk-Off Signal'
    : 'Regional Markets Mixed — Country-Specific Leadership';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10, background: `color-mix(in srgb, ${color} 8%, var(--card))`, border: `1px solid color-mix(in srgb, ${color} 22%, var(--border))` }}>
        <Icon size={18} style={{ color, marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{headline}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
            {ok.length} country ETFs · DM avg {devAvg >= 0 ? '+' : ''}{devAvg.toFixed(2)}% · EM avg {emAvg >= 0 ? '+' : ''}{emAvg.toFixed(2)}%
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: 'DM Average', value: devAvg, count: dev.length },
          { label: 'EM Average', value: emAvg,  count: em.length },
          { label: 'DM–EM Spread', value: spread, count: null },
        ].map((b) => (
          <div key={b.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</p>
            <p style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: b.value >= 0 ? '#4E6040' : 'var(--primary)' }}>
              {b.value >= 0 ? '+' : ''}{b.value.toFixed(2)}%
            </p>
            {b.count != null && <p style={{ margin: 0, fontSize: 10, color: 'var(--muted-foreground)' }}>{b.count} countries</p>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4E6040', flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, color: 'var(--foreground)' }}>Leaders: {top.join(' · ')}</span>
          </div>
        )}
        {bot.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, color: 'var(--foreground)' }}>Laggards: {bot.join(' · ')}</span>
          </div>
        )}
        {Math.abs(spread) > 0.5 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--muted-foreground)', flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, color: 'var(--foreground)' }}>
              {spread > 0 ? 'Developed markets outperforming emerging — risk-off rotation or DM cycle leadership' : 'Emerging markets outperforming — risk-on appetite, EM catch-up trade'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const CountriesRegionalMarkets: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useCountryETFs();
  const { drawerState, openDrawer, closeDrawer } = useInstrumentDrawer();

  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const ok = useMemo(() => quotes?.filter((q) => q.ok) ?? [], [quotes]);
  const dev = useMemo(() => ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'developed'), [ok]);
  const em  = useMemo(() => ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'emerging'), [ok]);
  const devAvg = dev.length ? dev.reduce((s, q) => s + q.changePercent, 0) / dev.length : 0;
  const emAvg  = em.length  ? em.reduce((s, q) => s + q.changePercent, 0)  / em.length  : 0;

  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);

  const filteredRows = useMemo(() => {
    const region = regionFilter === 'all' ? undefined : regionFilter as 'developed' | 'emerging';
    return (quotes ? buildRows(quotes, region) : []).filter((row) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return row.symbol.toLowerCase().includes(s) || row.name.toLowerCase().includes(s);
    });
  }, [quotes, regionFilter, search]);

  const handleRowClick = (row: PerformanceRow) => {
    if (row._raw) openDrawer(row._raw, 'etf');
    setSelectedCell(row.symbol);
  };
  const handleCellClick = (id: string) => {
    setSelectedCell(id);
    const q = quotes?.find((r) => r.symbol === id);
    if (q) openDrawer(q, 'etf');
  };

  return (
    <>
      <DashboardShell
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Map size={18} />Countries & Regional Markets</span>}
        subtitle="Regional equity monitoring — click any country ETF for full instrument detail."
        actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
      >
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          <IntelligenceMetricCard label="Developed Mkts Avg" value={`${devAvg >= 0 ? '+' : ''}${devAvg.toFixed(2)}%`} hint={`${dev.length} countries`} status={status} fetchedAt={fetchedAt} />
          <IntelligenceMetricCard label="Emerging Mkts Avg"  value={`${emAvg  >= 0 ? '+' : ''}${emAvg.toFixed(2)}%`}  hint={`${em.length} countries`}  status={status} fetchedAt={fetchedAt} />
          <IntelligenceMetricCard label="DM–EM Spread" value={`${(devAvg - emAvg) >= 0 ? '+' : ''}${(devAvg - emAvg).toFixed(2)}%`} hint={devAvg > emAvg ? 'DM outperforming' : 'EM outperforming'} />
        </div>

        <DashboardPageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {loading && !quotes && <DashboardSectionCard title="Loading…"><DashboardLoadingState /></DashboardSectionCard>}
        {error && !quotes && <DashboardSectionCard title="Error"><DashboardErrorState message={error.message} onRetry={refresh} /></DashboardSectionCard>}

        {quotes && activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <DashboardSectionCard title="All Countries" subtitle="Click a row to open instrument detail" onRefresh={refresh}>
              <DashboardFilterBar search={search} onSearchChange={setSearch} filters={[{ id: 'region', label: 'Region', options: REGION_OPTIONS, value: regionFilter, onChange: setRegionFilter }]} resultCount={filteredRows.length} />
              <CompactPerformanceTable rows={filteredRows} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
            </DashboardSectionCard>
            <DashboardSectionCard title="Intelligence"><IntelligenceSummaryView quotes={quotes} /></DashboardSectionCard>
          </div>
        )}

        {quotes && activeTab === 'developed' && (
          <DashboardSectionCard title="Developed Markets" subtitle={`${dev.length} countries — click any row`} onRefresh={refresh}>
            <DashboardFilterBar search={search} onSearchChange={setSearch} resultCount={filteredRows.filter((r) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === r.symbol)?.region === 'developed').length} />
            <CompactPerformanceTable rows={buildRows(quotes, 'developed').filter((r) => !search || r.symbol.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase()))} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'emerging' && (
          <DashboardSectionCard title="Emerging Markets" subtitle={`${em.length} countries — click any row`} onRefresh={refresh}>
            <DashboardFilterBar search={search} onSearchChange={setSearch} resultCount={filteredRows.filter((r) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === r.symbol)?.region === 'emerging').length} />
            <CompactPerformanceTable rows={buildRows(quotes, 'emerging').filter((r) => !search || r.symbol.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase()))} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'heatmap' && (
          <DashboardSectionCard title="Regional Heatmap" subtitle="Click any tile to open country detail" onRefresh={refresh}>
            <HeatmapGrid groups={heatmapGroups} onSelectCell={handleCellClick} selectedCell={selectedCell} />
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
