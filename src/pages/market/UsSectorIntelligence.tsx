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
import {
  DashboardLoadingState,
  DashboardErrorState,
  SourceFreshnessBadge,
} from '../../components/market-dashboards/DashboardStates';
import { useSectorDashboard } from '../../hooks/useDashboard';
import {
  SECTOR_ETF_SYMBOLS,
  classifySectors,
  type DashboardQuote,
} from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';

function fmtPrice(n: number) {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function buildSectorRows(quotes: DashboardQuote[]): PerformanceRow[] {
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));
  return quotes
    .filter((q) => q.ok && q.symbol !== 'SPY')
    .map((q) => ({ symbol: q.symbol, name: nameMap[q.symbol] ?? q.symbol, price: q.price, changePercent: q.changePercent, change: q.change }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

function buildHeatmapGroups(quotes: DashboardQuote[]) {
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));
  const sectorQuotes = quotes.filter((q) => q.ok && q.symbol !== 'SPY');
  if (!sectorQuotes.length) return [];
  const avgValue = sectorQuotes.reduce((s, q) => s + q.changePercent, 0) / sectorQuotes.length;
  return [{
    name: 'US Sectors',
    avgValue,
    cells: sectorQuotes
      .sort((a, b) => b.changePercent - a.changePercent)
      .map((q) => ({
        id: q.symbol,
        label: q.symbol,
        sublabel: nameMap[q.symbol],
        value: q.changePercent,
        size: (['XLK', 'XLF', 'XLV', 'XLI'].includes(q.symbol) ? 'lg' : 'md') as 'lg' | 'md',
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
        {v >= 0 ? '+' : ''}{v.toFixed(2)}%
      </p>
    </div>
  );
};

const RelativeStrengthChart: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const spy = quotes.find((q) => q.symbol === 'SPY');
  const spyChg = spy?.changePercent ?? 0;
  const nameMap = Object.fromEntries(SECTOR_ETF_SYMBOLS.map((s) => [s.symbol, s.name]));

  const data = quotes
    .filter((q) => q.ok && q.symbol !== 'SPY')
    .map((q) => ({
      name: nameMap[q.symbol]?.split(' ')[0] ?? q.symbol,
      symbol: q.symbol,
      relative: parseFloat((q.changePercent - spyChg).toFixed(2)),
    }))
    .sort((a, b) => b.relative - a.relative);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 70 }}>
        <XAxis
          type="number" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false}
          tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
        />
        <YAxis
          type="category" dataKey="name"
          tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
          axisLine={false} tickLine={false} width={70}
        />
        <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar dataKey="relative" radius={[0, 3, 3, 0]}>
          {data.map((d) => (
            <Cell key={d.symbol} fill={d.relative >= 0 ? '#4E6040' : 'var(--primary)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const IntelligenceSummaryPanel: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifySectors(quotes), [quotes]);
  const RegimeIcon = intel.regime === 'risk-on' ? TrendingUp : intel.regime === 'risk-off' ? TrendingDown : Minus;
  const regimeColor = intel.regime === 'risk-on' ? '#4E6040' : intel.regime === 'risk-off' ? 'var(--primary)' : 'var(--muted-foreground)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 8,
        background: `color-mix(in srgb, ${regimeColor} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${regimeColor} 20%, var(--border))`,
      }}>
        <RegimeIcon size={16} style={{ color: regimeColor, marginTop: 1, flexShrink: 0 }} />
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

export const UsSectorIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useSectorDashboard();
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const sectorRows = useMemo(() => quotes ? buildSectorRows(quotes) : [], [quotes]);
  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);
  const spy = quotes?.find((q) => q.symbol === 'SPY');

  const offensiveSectors = ['XLK', 'XLY', 'XLC', 'XLF'];
  const defensiveSectors = ['XLU', 'XLP', 'XLV'];
  const offAvg = quotes
    ? quotes.filter((q) => offensiveSectors.includes(q.symbol) && q.ok).reduce((s, q) => s + q.changePercent, 0) / offensiveSectors.length
    : 0;
  const defAvg = quotes
    ? quotes.filter((q) => defensiveSectors.includes(q.symbol) && q.ok).reduce((s, q) => s + q.changePercent, 0) / defensiveSectors.length
    : 0;

  return (
    <DashboardShell
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} />US Sector Intelligence</span>}
      subtitle="Sector rotation and market breadth monitoring — all 11 SPDR sector ETFs vs SPY benchmark."
      actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
    >
      {/* ── Headline KPIs ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {spy && (
          <IntelligenceMetricCard
            label="SPY (Benchmark)"
            value={fmtPrice(spy.price)}
            changePercent={spy.changePercent}
            status={status}
            fetchedAt={fetchedAt}
          />
        )}
        <IntelligenceMetricCard
          label="Offensive Avg"
          value={`${offAvg >= 0 ? '+' : ''}${offAvg.toFixed(2)}%`}
          hint="XLK · XLY · XLC · XLF"
        />
        <IntelligenceMetricCard
          label="Defensive Avg"
          value={`${defAvg >= 0 ? '+' : ''}${defAvg.toFixed(2)}%`}
          hint="XLU · XLP · XLV"
        />
      </div>

      {loading && !quotes && (
        <DashboardSectionCard title="Loading sector data…">
          <DashboardLoadingState rows={11} />
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
            <DashboardSectionCard
              title="Sector Performance Table"
              subtitle="All 11 sectors ranked by daily change vs SPY"
              onRefresh={refresh}
            >
              <CompactPerformanceTable rows={sectorRows} showSparkline={false} />
            </DashboardSectionCard>

            <DashboardSectionCard title="Intelligence Summary" subtitle="Rules-based sector rotation classification">
              <IntelligenceSummaryPanel quotes={quotes} />
            </DashboardSectionCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardSectionCard
              title="Relative Strength vs SPY"
              subtitle="Each sector's daily return minus SPY"
            >
              <RelativeStrengthChart quotes={quotes} />
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Sector Heatmap"
              subtitle="Daily performance color intensity"
              onRefresh={refresh}
            >
              <HeatmapGrid groups={heatmapGroups} onSelectCell={setSelectedCell} selectedCell={selectedCell} />
            </DashboardSectionCard>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
