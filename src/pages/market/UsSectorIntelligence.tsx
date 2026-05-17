import React, { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardPageTabs } from '../../components/market-dashboards/DashboardPageTabs';
import { DashboardFilterBar } from '../../components/market-dashboards/DashboardFilterBar';
import { InstrumentDetailDrawer, useInstrumentDrawer } from '../../components/market-dashboards/InstrumentDetailDrawer';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { SummaryStrip, ArtifactStrip, NarrativeOverlay } from '../../components/intelligence-drawer';
import { sectorSummary } from '../../lib/intelligence/summaries';
import { useDashboardArtifacts } from '../../hooks/useDashboardArtifacts';
import { useDashboardNarratives } from '../../hooks/useDashboardNarratives';
import { useSectorDashboard } from '../../hooks/useDashboard';
import { SECTOR_ETF_SYMBOLS, classifySectors, type DashboardQuote } from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';

const TABS = [
  { id: 'overview',         label: 'Overview' },
  { id: 'performance',      label: 'Performance' },
  { id: 'relative-strength',label: 'Relative Strength' },
  { id: 'heatmap',          label: 'Heatmap' },
  { id: 'intelligence',     label: 'Intelligence' },
];

const CATEGORY_OPTIONS = [
  { value: 'all',       label: 'All Sectors' },
  { value: 'offensive', label: 'Offensive' },
  { value: 'defensive', label: 'Defensive' },
  { value: 'cyclical',  label: 'Cyclical' },
];

const SECTOR_CATEGORY: Record<string, 'offensive' | 'defensive' | 'cyclical'> = {
  XLK: 'offensive', XLF: 'offensive', XLC: 'offensive', XLY: 'offensive',
  XLU: 'defensive', XLP: 'defensive', XLV: 'defensive',
  XLE: 'cyclical',  XLB: 'cyclical',  XLI: 'cyclical',  XLRE: 'cyclical',
};

function buildRows(quotes: DashboardQuote[]): PerformanceRow[] {
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));
  return quotes
    .filter((q) => q.ok && q.symbol !== 'SPY')
    .map((q) => ({ symbol: q.symbol, name: nameMap[q.symbol] ?? q.symbol, price: q.price, changePercent: q.changePercent, change: q.change, _raw: q }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

function buildHeatmapGroups(quotes: DashboardQuote[]) {
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));
  const byCategory: Record<string, DashboardQuote[]> = { offensive: [], defensive: [], cyclical: [] };
  for (const q of quotes) {
    if (!q.ok || q.symbol === 'SPY') continue;
    const cat = SECTOR_CATEGORY[q.symbol];
    if (cat) byCategory[cat].push(q);
  }
  return Object.entries({ Offensive: byCategory.offensive, Defensive: byCategory.defensive, Cyclical: byCategory.cyclical })
    .filter(([, qs]) => qs.length > 0)
    .map(([name, qs]) => ({
      name,
      avgValue: qs.reduce((s, q) => s + q.changePercent, 0) / qs.length,
      cells: qs.sort((a, b) => b.changePercent - a.changePercent).map((q) => ({
        id: q.symbol, label: q.symbol, sublabel: nameMap[q.symbol], value: q.changePercent, size: 'lg' as const,
      })),
    }));
}

const BarTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>{label}</p>
      <p style={{ margin: '2px 0 0', color: v >= 0 ? '#4E6040' : 'var(--primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {v >= 0 ? '+' : ''}{v.toFixed(2)}%
      </p>
    </div>
  );
};

const RelativeStrengthChart: React.FC<{ quotes: DashboardQuote[]; onBarClick?: (sym: string) => void }> = ({ quotes, onBarClick }) => {
  const spy = quotes.find((q) => q.symbol === 'SPY');
  const spyChg = spy?.changePercent ?? 0;
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));
  const data = quotes
    .filter((q) => q.ok && q.symbol !== 'SPY')
    .map((q) => ({ name: nameMap[q.symbol]?.split(' ')[0] ?? q.symbol, symbol: q.symbol, relative: parseFloat((q.changePercent - spyChg).toFixed(2)) }))
    .sort((a, b) => b.relative - a.relative);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 80 }}
        onClick={(d) => { if (d?.activePayload?.[0]?.payload?.symbol) onBarClick?.(d.activePayload[0].payload.symbol); }}
      >
        <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={80} />
        <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar dataKey="relative" radius={[0, 3, 3, 0]} style={{ cursor: 'pointer' }}>
          {data.map((d, i) => <Cell key={i} fill={d.relative >= 0 ? '#4E6040' : 'var(--primary)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const IntelligenceSummaryView: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifySectors(quotes), [quotes]);
  const color = intel.regime === 'risk-on' ? '#4E6040' : intel.regime === 'risk-off' ? 'var(--primary)' : 'var(--muted-foreground)';
  const Icon = intel.regime === 'risk-on' ? TrendingUp : intel.regime === 'risk-off' ? TrendingDown : Minus;

  const offAvg = quotes.filter((q) => ['XLK','XLY','XLC','XLF'].includes(q.symbol) && q.ok).reduce((s, q) => s + q.changePercent, 0) / 4;
  const defAvg = quotes.filter((q) => ['XLU','XLP','XLV'].includes(q.symbol) && q.ok).reduce((s, q) => s + q.changePercent, 0) / 3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10,
        background: `color-mix(in srgb, ${color} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 22%, var(--border))`,
      }}>
        <Icon size={18} style={{ color, marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{intel.headline}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>{intel.note}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Offensive Avg', value: offAvg, desc: 'XLK · XLY · XLC · XLF' },
          { label: 'Defensive Avg', value: defAvg, desc: 'XLU · XLP · XLV' },
        ].map((b) => (
          <div key={b.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</p>
            <p style={{ margin: '4px 0 2px', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: b.value >= 0 ? '#4E6040' : 'var(--primary)' }}>
              {b.value >= 0 ? '+' : ''}{b.value.toFixed(2)}%
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--muted-foreground)' }}>{b.desc}</p>
          </div>
        ))}
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

export const UsSectorIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useSectorDashboard();
  const { drawerState, openDrawer, closeDrawer } = useInstrumentDrawer();

  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const spy = quotes?.find((q) => q.symbol === 'SPY');
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));

  const allRows = useMemo(() => quotes ? buildRows(quotes) : [], [quotes]);
  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (categoryFilter !== 'all' && SECTOR_CATEGORY[row.symbol] !== categoryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return row.symbol.toLowerCase().includes(s) || row.name.toLowerCase().includes(s);
      }
      return true;
    });
  }, [allRows, search, categoryFilter]);

  const handleRowClick = (row: PerformanceRow) => {
    if (row._raw) openDrawer(row._raw, 'etf', nameMap[row.symbol]);
    setSelectedCell(row.symbol);
  };

  const handleCellClick = (id: string) => {
    setSelectedCell(id);
    const q = quotes?.find((r) => r.symbol === id);
    if (q) openDrawer(q, 'etf', nameMap[id]);
  };

  const handleBarClick = (sym: string) => {
    const q = quotes?.find((r) => r.symbol === sym);
    if (q) { openDrawer(q, 'etf', nameMap[sym]); setSelectedCell(sym); }
  };

  const offAvg = quotes
    ? quotes.filter((q) => ['XLK','XLY','XLC','XLF'].includes(q.symbol) && q.ok).reduce((s, q) => s + q.changePercent, 0) / 4
    : 0;
  const defAvg = quotes
    ? quotes.filter((q) => ['XLU','XLP','XLV'].includes(q.symbol) && q.ok).reduce((s, q) => s + q.changePercent, 0) / 3
    : 0;

  const summary = useMemo(() => quotes ? sectorSummary(quotes) : null, [quotes]);
  const sectorSymbols = useMemo(() => SECTOR_ETF_SYMBOLS.map((s) => s.symbol).concat('SPY'), []);
  const { artifacts, loading: artifactsLoading } = useDashboardArtifacts(sectorSymbols);
  const { narratives, loading: narrativesLoading } = useDashboardNarratives(sectorSymbols);

  return (
    <>
      <DashboardShell
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} />US Sector Intelligence</span>}
        subtitle="Sector rotation monitoring — click any bar, tile, or row for full instrument detail."
        actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
      >
        <SummaryStrip payload={summary} />
        <ArtifactStrip artifacts={artifacts} loading={artifactsLoading} />
        <NarrativeOverlay narratives={narratives} loading={narrativesLoading} />
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {spy && (
            <IntelligenceMetricCard label="SPY Benchmark" value={spy.price.toFixed(2)} changePercent={spy.changePercent} status={status} fetchedAt={fetchedAt} onClick={() => openDrawer(spy, 'etf')} />
          )}
          <IntelligenceMetricCard label="Offensive Avg" value={`${offAvg >= 0 ? '+' : ''}${offAvg.toFixed(2)}%`} hint="XLK · XLY · XLC · XLF" />
          <IntelligenceMetricCard label="Defensive Avg" value={`${defAvg >= 0 ? '+' : ''}${defAvg.toFixed(2)}%`} hint="XLU · XLP · XLV" />
        </div>

        <DashboardPageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {loading && !quotes && <DashboardSectionCard title="Loading…"><DashboardLoadingState /></DashboardSectionCard>}
        {error && !quotes && <DashboardSectionCard title="Error"><DashboardErrorState message={error.message} onRetry={refresh} /></DashboardSectionCard>}

        {quotes && activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <DashboardSectionCard title="Relative Strength vs SPY" subtitle="Click any bar to open sector detail" onRefresh={refresh}>
              <RelativeStrengthChart quotes={quotes} onBarClick={handleBarClick} />
            </DashboardSectionCard>
            <DashboardSectionCard title="Intelligence" subtitle="Sector rotation classification">
              <IntelligenceSummaryView quotes={quotes} />
            </DashboardSectionCard>
          </div>
        )}

        {quotes && activeTab === 'performance' && (
          <DashboardSectionCard title="Sector Performance Table" subtitle="All 11 sectors — click a row to open detail" onRefresh={refresh}>
            <DashboardFilterBar
              search={search} onSearchChange={setSearch}
              filters={[{ id: 'cat', label: 'Category', options: CATEGORY_OPTIONS, value: categoryFilter, onChange: setCategoryFilter }]}
              resultCount={filteredRows.length}
            />
            <CompactPerformanceTable rows={filteredRows} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'relative-strength' && (
          <DashboardSectionCard title="Relative Strength vs SPY" subtitle="Click any bar to open sector detail" onRefresh={refresh}>
            <RelativeStrengthChart quotes={quotes} onBarClick={handleBarClick} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'heatmap' && (
          <DashboardSectionCard title="Sector Heatmap" subtitle="Grouped by offense/defense/cyclical — click to open detail" onRefresh={refresh}>
            <HeatmapGrid groups={heatmapGroups} onSelectCell={handleCellClick} selectedCell={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'intelligence' && (
          <DashboardSectionCard title="Intelligence Summary">
            <IntelligenceSummaryView quotes={quotes} />
          </DashboardSectionCard>
        )}
      </DashboardShell>

      <InstrumentDetailDrawer row={drawerState.row} open={drawerState.open} onClose={closeDrawer} />
    </>
  );
};
