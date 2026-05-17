import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell } from 'recharts';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardPageTabs } from '../../components/market-dashboards/DashboardPageTabs';
import { DashboardFilterBar } from '../../components/market-dashboards/DashboardFilterBar';
import { InstrumentDetailDrawer, useInstrumentDrawer } from '../../components/market-dashboards/InstrumentDetailDrawer';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { useFXDashboard } from '../../hooks/useDashboard';
import { FX_SYMBOLS, classifyFX, type DashboardQuote } from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'g10',          label: 'G10 FX' },
  { id: 'performance',  label: 'All Pairs' },
  { id: 'heatmap',      label: 'Heatmap' },
  { id: 'liquidity',    label: 'Liquidity' },
  { id: 'intelligence', label: 'Intelligence' },
];

function fmtFXPrice(n: number) {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1)   return n.toFixed(4);
  return n.toFixed(5);
}

function buildRows(quotes: DashboardQuote[]): PerformanceRow[] {
  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  return quotes
    .filter((q) => q.ok && q.symbol !== 'UUP')
    .map((q) => ({ symbol: nameMap[q.symbol] ?? q.symbol, name: '', price: q.price, changePercent: q.changePercent, change: q.change, _raw: q }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

function buildHeatmapGroups(quotes: DashboardQuote[]) {
  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  const g10 = quotes.filter((q) => q.ok && q.symbol !== 'UUP' && FX_SYMBOLS.find((f) => f.pair === q.symbol)?.group === 'g10');
  if (!g10.length) return [];
  return [{
    name: 'G10 FX Pairs',
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
      <p style={{ margin: 0, fontWeight: 700 }}>{label}</p>
      <p style={{ margin: '2px 0 0', color: v >= 0 ? '#4E6040' : 'var(--primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {v >= 0 ? '+' : ''}{v.toFixed(3)}%
      </p>
    </div>
  );
};

const G10BarChart: React.FC<{ quotes: DashboardQuote[]; onBarClick?: (sym: string) => void }> = ({ quotes, onBarClick }) => {
  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  const data = quotes
    .filter((q) => q.ok && q.symbol !== 'UUP')
    .map((q) => ({ name: nameMap[q.symbol] ?? q.symbol, symbol: q.symbol, value: parseFloat(q.changePercent.toFixed(3)) }))
    .sort((a, b) => b.value - a.value);

  if (!data.length) return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>No FX data</div>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 72 }}
        onClick={(d) => { if (d?.activePayload?.[0]?.payload?.symbol) onBarClick?.(d.activePayload[0].payload.symbol); }}
      >
        <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={72} />
        <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} style={{ cursor: 'pointer' }}>
          {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? '#4E6040' : 'var(--primary)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const IntelligenceSummaryView: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifyFX(quotes), [quotes]);
  const color = intel.regime === 'strengthening' ? 'var(--primary)' : intel.regime === 'weakening' ? '#4E6040' : 'var(--muted-foreground)';
  const Icon  = intel.regime === 'strengthening' ? TrendingUp : intel.regime === 'weakening' ? TrendingDown : Minus;

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

const LiquidityPanel: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const dxy = quotes.find((q) => q.symbol === 'UUP');
  const intel = useMemo(() => classifyFX(quotes), [quotes]);
  const isStrong = intel.regime === 'strengthening';
  const isWeak   = intel.regime === 'weakening';

  const cards = [
    {
      title: 'Global Liquidity Condition',
      body: isStrong
        ? 'Dollar strength signals tighter global liquidity — elevated USD funding costs, EM stress risk, commodity headwinds.'
        : isWeak
        ? 'Dollar weakness supports looser global liquidity — cheaper USD funding, EM tailwind, commodity support.'
        : 'Neutral liquidity conditions — no strong directional signal from dollar alone.',
      color: isStrong ? 'var(--primary)' : isWeak ? '#4E6040' : 'var(--muted-foreground)',
    },
    {
      title: 'EM Currency Risk',
      body: isStrong
        ? 'Strong dollar increases EM FX pressure, widening current account deficits and raising USD-denominated debt service costs.'
        : 'Weaker dollar provides relief to EM FX — reduces debt burden and supports capital inflows.',
      color: 'var(--muted-foreground)',
    },
    {
      title: 'Carry Trade Conditions',
      body: 'Carry trades involve borrowing low-yield currencies (JPY, CHF) to invest in higher-yield ones. USD/JPY direction proxies carry appetite — rising USD/JPY = carry-on.',
      color: 'var(--chart-3)',
    },
    {
      title: 'Central Bank Divergence',
      body: 'FX moves are driven by relative monetary policy. A widening rate differential (Fed vs ECB vs BoJ) accelerates divergence trades. Monitor central bank guidance for directional shifts.',
      color: 'var(--muted-foreground)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dxy && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>DXY Proxy (UUP)</span>
          <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: dxy.changePercent >= 0 ? 'var(--primary)' : '#4E6040' }}>
            {dxy.changePercent >= 0 ? '+' : ''}{dxy.changePercent.toFixed(2)}%
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 'auto' }}>UUP ETF — dollar index proxy</span>
        </div>
      )}
      {cards.map((c) => (
        <div key={c.title} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: c.color }}>{c.title}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{c.body}</p>
        </div>
      ))}
    </div>
  );
};

export const FxLiquidityIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useFXDashboard();
  const { drawerState, openDrawer, closeDrawer } = useInstrumentDrawer();

  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const nameMap = Object.fromEntries(FX_SYMBOLS.map((f) => [f.pair, f.label]));
  const dxy    = quotes?.find((q) => q.symbol === 'UUP');
  const eurusd = quotes?.find((q) => q.symbol === 'EUR/USD');
  const usdjpy = quotes?.find((q) => q.symbol === 'USD/JPY');
  const gbpusd = quotes?.find((q) => q.symbol === 'GBP/USD');

  const allRows = useMemo(() => quotes ? buildRows(quotes) : [], [quotes]);
  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);

  const filteredRows = useMemo(() => allRows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.symbol.toLowerCase().includes(s);
  }), [allRows, search]);

  const handleRowClick = (row: PerformanceRow) => {
    if (row._raw) openDrawer(row._raw, 'fx');
    setSelectedCell(row._raw?.symbol ?? null);
  };
  const handleCellClick = (id: string) => {
    setSelectedCell(id);
    const q = quotes?.find((r) => r.symbol === id);
    if (q) openDrawer(q, 'fx');
  };
  const handleBarClick = (sym: string) => {
    const q = quotes?.find((r) => r.symbol === sym);
    if (q) { openDrawer(q, 'fx'); setSelectedCell(sym); }
  };

  return (
    <>
      <DashboardShell
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ArrowLeftRight size={18} />FX & Liquidity Intelligence</span>}
        subtitle="Currency and dollar monitoring — click any pair for full detail, or any bar to open its intelligence panel."
        actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
      >
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10, marginBottom: 16 }}>
          {dxy    && <IntelligenceMetricCard label="DXY (UUP proxy)" value={fmtFXPrice(dxy.price)}    changePercent={dxy.changePercent}    status={status} fetchedAt={fetchedAt} hint="Dollar index ETF" onClick={() => openDrawer(dxy, 'fx')} />}
          {eurusd && <IntelligenceMetricCard label="EUR/USD"          value={fmtFXPrice(eurusd.price)} changePercent={eurusd.changePercent} status={status} fetchedAt={fetchedAt} onClick={() => openDrawer(eurusd, 'fx')} />}
          {usdjpy && <IntelligenceMetricCard label="USD/JPY"          value={fmtFXPrice(usdjpy.price)} changePercent={usdjpy.changePercent} status={status} fetchedAt={fetchedAt} onClick={() => openDrawer(usdjpy, 'fx')} />}
          {gbpusd && <IntelligenceMetricCard label="GBP/USD"          value={fmtFXPrice(gbpusd.price)} changePercent={gbpusd.changePercent} status={status} fetchedAt={fetchedAt} onClick={() => openDrawer(gbpusd, 'fx')} />}
        </div>

        <DashboardPageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {loading && !quotes && <DashboardSectionCard title="Loading…"><DashboardLoadingState /></DashboardSectionCard>}
        {error && !quotes && <DashboardSectionCard title="Error"><DashboardErrorState message={error.message} onRetry={refresh} /></DashboardSectionCard>}

        {quotes && activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <DashboardSectionCard title="G10 Performance" subtitle="Click any bar to open pair detail" onRefresh={refresh}>
              <G10BarChart quotes={quotes} onBarClick={handleBarClick} />
            </DashboardSectionCard>
            <DashboardSectionCard title="Intelligence"><IntelligenceSummaryView quotes={quotes} /></DashboardSectionCard>
          </div>
        )}

        {quotes && activeTab === 'g10' && (
          <DashboardSectionCard title="G10 FX Ranked" subtitle="Click any bar to open pair detail" onRefresh={refresh}>
            <G10BarChart quotes={quotes} onBarClick={handleBarClick} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'performance' && (
          <DashboardSectionCard title="All FX Pairs" subtitle="Click a row to open detail" onRefresh={refresh}>
            <DashboardFilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search pair…" resultCount={filteredRows.length} />
            <CompactPerformanceTable rows={filteredRows} showSparkline={false} onRowClick={handleRowClick} selectedSymbol={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'heatmap' && (
          <DashboardSectionCard title="FX Heatmap" subtitle="Click any tile to open pair detail" onRefresh={refresh}>
            <HeatmapGrid groups={heatmapGroups} onSelectCell={handleCellClick} selectedCell={selectedCell} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'liquidity' && (
          <DashboardSectionCard title="Liquidity Pressure Panel" subtitle="Dollar regime and global liquidity conditions">
            <LiquidityPanel quotes={quotes} />
          </DashboardSectionCard>
        )}

        {quotes && activeTab === 'intelligence' && (
          <DashboardSectionCard title="FX Intelligence Summary"><IntelligenceSummaryView quotes={quotes} /></DashboardSectionCard>
        )}
      </DashboardShell>

      <InstrumentDetailDrawer row={drawerState.row} open={drawerState.open} onClose={closeDrawer} />
    </>
  );
};
