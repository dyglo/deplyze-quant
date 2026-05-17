import React, { useMemo, useState } from 'react';
import { Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardPageTabs } from '../../components/market-dashboards/DashboardPageTabs';
import { DashboardFilterBar } from '../../components/market-dashboards/DashboardFilterBar';
import { InstrumentDetailDrawer, useInstrumentDrawer } from '../../components/market-dashboards/InstrumentDetailDrawer';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { useWorldEquity } from '../../hooks/useDashboard';
import {
  WORLD_EQUITY_SYMBOLS, classifyWorldEquity, type DashboardQuote,
} from '../../services/dashboardService';
import type { HeatmapGridGroup } from '../../components/market-dashboards/HeatmapGrid';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'performance',  label: 'Performance Table' },
  { id: 'heatmap',      label: 'Heatmap' },
  { id: 'intelligence', label: 'Intelligence' },
];

const GROUP_OPTIONS = [
  { value: 'all',       label: 'All Groups' },
  { value: 'us',        label: 'US Indices' },
  { value: 'global',    label: 'Global' },
  { value: 'developed', label: 'Developed Mkts' },
  { value: 'emerging',  label: 'Emerging Mkts' },
];

function fmtPrice(n: number) {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function buildHeatmapGroups(quotes: DashboardQuote[]): HeatmapGridGroup[] {
  const grouped: Record<string, { quotes: DashboardQuote[]; label: string }> = {
    us:        { quotes: [], label: 'US Indices' },
    global:    { quotes: [], label: 'Global' },
    developed: { quotes: [], label: 'Developed Markets' },
    emerging:  { quotes: [], label: 'Emerging Markets' },
  };
  const sizeMap: Record<string, 'xl' | 'lg' | 'md' | 'sm'> = {
    SPY: 'xl', QQQ: 'xl', IWM: 'lg', DIA: 'lg',
    ACWI: 'xl', VT: 'lg', EFA: 'xl', VEA: 'lg', EEM: 'xl', VWO: 'lg',
  };
  for (const meta of WORLD_EQUITY_SYMBOLS) {
    const q = quotes.find((r) => r.symbol === meta.symbol);
    if (q?.ok) grouped[meta.group].quotes.push(q);
  }
  return Object.values(grouped)
    .filter((g) => g.quotes.length > 0)
    .map((g) => ({
      name: g.label,
      avgValue: g.quotes.reduce((s, q) => s + q.changePercent, 0) / g.quotes.length,
      cells: g.quotes.map((q) => ({
        id: q.symbol, label: q.symbol, sublabel: q.name,
        value: q.changePercent, size: sizeMap[q.symbol] ?? 'md',
      })),
    }));
}

const IntelligenceSummaryView: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifyWorldEquity(quotes), [quotes]);
  const Icon = intel.regime === 'risk-on' ? TrendingUp : intel.regime === 'risk-off' ? TrendingDown : Minus;
  const color = intel.regime === 'risk-on' ? '#4E6040' : intel.regime === 'risk-off' ? 'var(--primary)' : 'var(--muted-foreground)';
  const ok = quotes.filter((q) => q.ok);
  const adv = ok.filter((q) => q.changePercent > 0).length;
  const dec = ok.filter((q) => q.changePercent < 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '16px 18px', borderRadius: 10,
        background: `color-mix(in srgb, ${color} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 22%, var(--border))`,
      }}>
        <Icon size={20} style={{ color, marginTop: 2, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>{intel.headline}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{intel.note}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          { label: 'Advancing', value: adv, color: '#4E6040', pct: ok.length ? Math.round(adv/ok.length*100) : 0 },
          { label: 'Declining', value: dec, color: 'var(--primary)', pct: ok.length ? Math.round(dec/ok.length*100) : 0 },
          { label: 'Unchanged', value: ok.length - adv - dec, color: 'var(--muted-foreground)', pct: 0 },
        ].map((b) => (
          <div key={b.label} style={{ textAlign: 'center', padding: '14px 0', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: b.color, fontVariantNumeric: 'tabular-nums' }}>{b.value}</p>
            <p style={{ margin: '3px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</p>
          </div>
        ))}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4E6040' }}>Market Breadth</span>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{ok.length} instruments</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--muted)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: ok.length ? `${Math.round(adv/ok.length*100)}%` : '50%',
            background: adv > dec ? '#4E6040' : 'var(--primary)',
            borderRadius: 999, transition: 'width 0.6s ease',
          }} />
        </div>
      </div>

      <div>
        <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Signal Summary</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {intel.signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
              <span style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.5 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const WorldEquityIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useWorldEquity();
  const { drawerState, openDrawer, closeDrawer } = useInstrumentDrawer();

  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const spy  = quotes?.find((q) => q.symbol === 'SPY');
  const eem  = quotes?.find((q) => q.symbol === 'EEM');
  const efa  = quotes?.find((q) => q.symbol === 'EFA');
  const acwi = quotes?.find((q) => q.symbol === 'ACWI');

  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);

  const filteredQuotes = useMemo(() => {
    if (!quotes) return [];
    return quotes.filter((q) => {
      if (!q.ok) return false;
      if (groupFilter !== 'all') {
        const meta = WORLD_EQUITY_SYMBOLS.find((m) => m.symbol === q.symbol);
        if (meta?.group !== groupFilter) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        return q.symbol.toLowerCase().includes(s) || q.name.toLowerCase().includes(s);
      }
      return true;
    });
  }, [quotes, search, groupFilter]);

  const performanceRows: PerformanceRow[] = useMemo(() =>
    filteredQuotes
      .map((q) => ({ symbol: q.symbol, name: q.name, price: q.price, changePercent: q.changePercent, change: q.change, _raw: q }))
      .sort((a, b) => b.changePercent - a.changePercent),
    [filteredQuotes],
  );

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
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={18} />World Equity Intelligence</span>}
        subtitle="Global equity regime monitoring — click any instrument for full intelligence detail."
        actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
      >
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[spy, acwi, efa, eem].filter(Boolean).map((q) => q && (
            <IntelligenceMetricCard
              key={q.symbol}
              label={q.symbol}
              value={fmtPrice(q.price)}
              changePercent={q.changePercent}
              status={status}
              fetchedAt={fetchedAt}
              hint={q.name}
              onClick={() => openDrawer(q, 'etf')}
            />
          ))}
        </div>

        {/* Page tabs */}
        <DashboardPageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {loading && !quotes && <DashboardSectionCard title="Loading…"><DashboardLoadingState /></DashboardSectionCard>}
        {error && !quotes && <DashboardSectionCard title="Error"><DashboardErrorState message={error.message} onRetry={refresh} /></DashboardSectionCard>}

        {quotes && activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <DashboardSectionCard title="All Instruments" subtitle="Click any row for full detail" onRefresh={refresh}>
              <DashboardFilterBar
                search={search} onSearchChange={setSearch}
                filters={[{ id: 'group', label: 'Group', options: GROUP_OPTIONS, value: groupFilter, onChange: setGroupFilter }]}
                resultCount={performanceRows.length}
              />
              <CompactPerformanceTable rows={performanceRows} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
            </DashboardSectionCard>
            <DashboardSectionCard title="Intelligence" subtitle="Live regime classification">
              <IntelligenceSummaryView quotes={quotes} />
            </DashboardSectionCard>
          </div>
        )}

        {quotes && activeTab === 'performance' && (
          <DashboardSectionCard title="Performance Table" subtitle="All tracked instruments — click a row to open detail" onRefresh={refresh}>
            <DashboardFilterBar
              search={search} onSearchChange={setSearch}
              filters={[{ id: 'group', label: 'Group', options: GROUP_OPTIONS, value: groupFilter, onChange: setGroupFilter }]}
              resultCount={performanceRows.length}
            />
            <CompactPerformanceTable rows={performanceRows} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'heatmap' && (
          <DashboardSectionCard title="Global Equity Heatmap" subtitle="Click any tile to open instrument detail" onRefresh={refresh}>
            <HeatmapGrid groups={heatmapGroups} onSelectCell={handleCellClick} selectedCell={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'intelligence' && (
          <DashboardSectionCard title="Intelligence Summary" subtitle="Rules-based global equity regime classification">
            <IntelligenceSummaryView quotes={quotes} />
          </DashboardSectionCard>
        )}
      </DashboardShell>

      <InstrumentDetailDrawer row={drawerState.row} open={drawerState.open} onClose={closeDrawer} />
    </>
  );
};
