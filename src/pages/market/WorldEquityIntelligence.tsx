import React, { useMemo, useState } from 'react';
import { Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
import { RegimeBadge } from '../../components/quant/RegimeBadge';
import { useWorldEquity } from '../../hooks/useDashboard';
import {
  WORLD_EQUITY_SYMBOLS,
  classifyWorldEquity,
  type DashboardQuote,
} from '../../services/dashboardService';
import type { HeatmapGridGroup } from '../../components/market-dashboards/HeatmapGrid';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';

function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(2);
}

function buildHeatmapGroups(quotes: DashboardQuote[]): HeatmapGridGroup[] {
  const grouped: Record<string, { quotes: DashboardQuote[]; groupLabel: string }> = {
    us:        { quotes: [], groupLabel: 'US Indices' },
    global:    { quotes: [], groupLabel: 'Global' },
    developed: { quotes: [], groupLabel: 'Developed Markets' },
    emerging:  { quotes: [], groupLabel: 'Emerging Markets' },
  };

  for (const meta of WORLD_EQUITY_SYMBOLS) {
    const q = quotes.find((r) => r.symbol === meta.symbol);
    if (q?.ok) grouped[meta.group].quotes.push(q);
  }

  return Object.entries(grouped)
    .filter(([, g]) => g.quotes.length > 0)
    .map(([key, g]) => {
      const avgValue = g.quotes.reduce((s, q) => s + q.changePercent, 0) / g.quotes.length;
      const sizeMap: Record<string, 'xl' | 'lg' | 'md' | 'sm'> = {
        SPY: 'xl', QQQ: 'xl', IWM: 'lg', DIA: 'lg',
        ACWI: 'xl', VT: 'lg', EFA: 'xl', VEA: 'lg', EEM: 'xl', VWO: 'lg',
      };
      return {
        name: g.groupLabel,
        avgValue,
        cells: g.quotes.map((q) => ({
          id: q.symbol,
          label: q.symbol,
          sublabel: q.name,
          value: q.changePercent,
          size: sizeMap[q.symbol] ?? 'md',
        })),
      };
    });
}

function buildPerformanceRows(quotes: DashboardQuote[]): PerformanceRow[] {
  return quotes
    .filter((q) => q.ok)
    .map((q) => ({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      changePercent: q.changePercent,
      change: q.change,
    }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

const IntelligenceSummaryPanel: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifyWorldEquity(quotes), [quotes]);

  const RegimeIcon = intel.regime === 'risk-on' ? TrendingUp
    : intel.regime === 'risk-off' ? TrendingDown : Minus;
  const regimeColor = intel.regime === 'risk-on' ? '#4E6040'
    : intel.regime === 'risk-off' ? 'var(--primary)' : 'var(--muted-foreground)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Regime header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px', borderRadius: 8,
        background: `color-mix(in srgb, ${regimeColor} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${regimeColor} 20%, var(--border))`,
      }}>
        <RegimeIcon size={18} style={{ color: regimeColor, marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{intel.headline}</p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>{intel.note}</p>
        </div>
      </div>

      {/* Signals */}
      {intel.signals.length > 0 && (
        <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {intel.signals.map((s, i) => (
            <li key={i} style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>{s}</li>
          ))}
        </ul>
      )}

      {intel.caution && (
        <p style={{
          margin: 0, fontSize: 10, color: 'var(--primary)',
          padding: '6px 10px', borderRadius: 6,
          background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
        }}>
          ⚠ {intel.caution}
        </p>
      )}
    </div>
  );
};

export const WorldEquityIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useWorldEquity();
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);
  const performanceRows = useMemo(() => quotes ? buildPerformanceRows(quotes) : [], [quotes]);

  const spy = quotes?.find((q) => q.symbol === 'SPY');
  const eem = quotes?.find((q) => q.symbol === 'EEM');
  const efa = quotes?.find((q) => q.symbol === 'EFA');
  const acwi = quotes?.find((q) => q.symbol === 'ACWI');

  return (
    <DashboardShell
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={18} />World Equity Intelligence</span>}
      subtitle="Global equity regime monitoring — major indices, developed vs emerging markets, regional performance and breadth."
      actions={
        quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined
      }
    >
      {/* ── Headline KPIs ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[spy, acwi, efa, eem].filter(Boolean).map((q) => q && (
          <IntelligenceMetricCard
            key={q.symbol}
            label={q.symbol}
            value={fmtPrice(q.price)}
            changePercent={q.changePercent}
            status={status}
            fetchedAt={fetchedAt}
            hint={q.name}
          />
        ))}
      </div>

      {loading && !quotes && (
        <DashboardSectionCard title="Loading…">
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
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Performance Table */}
            <DashboardSectionCard
              title="Index & ETF Performance"
              subtitle="All tracked instruments ranked by daily change"
              onRefresh={refresh}
            >
              <CompactPerformanceTable rows={performanceRows} showSparkline={false} />
            </DashboardSectionCard>

            {/* Intelligence Summary */}
            <DashboardSectionCard
              title="Intelligence Summary"
              subtitle="Rules-based regime classification from live data"
            >
              <IntelligenceSummaryPanel quotes={quotes} />
            </DashboardSectionCard>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Breadth Snapshot */}
            <DashboardSectionCard title="Breadth Snapshot" subtitle="Advancing vs declining tracked indices">
              {(() => {
                const ok = quotes.filter((q) => q.ok);
                const adv = ok.filter((q) => q.changePercent > 0).length;
                const dec = ok.filter((q) => q.changePercent < 0).length;
                const unch = ok.length - adv - dec;
                const breadthPct = ok.length ? Math.round((adv / ok.length) * 100) : 50;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { label: 'Advancing', value: adv, color: '#4E6040' },
                        { label: 'Declining', value: dec, color: 'var(--primary)' },
                        { label: 'Unchanged', value: unch, color: 'var(--muted-foreground)' },
                      ].map((b) => (
                        <div key={b.label} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 8, background: 'var(--muted)' }}>
                          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: b.color, fontVariantNumeric: 'tabular-nums' }}>{b.value}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</p>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: '#4E6040', fontWeight: 700 }}>Breadth {breadthPct}%</span>
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{ok.length} instruments tracked</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--muted)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${breadthPct}%`,
                          background: breadthPct > 50 ? '#4E6040' : 'var(--primary)',
                          borderRadius: 999, transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </DashboardSectionCard>

            {/* Heatmap */}
            <DashboardSectionCard
              title="Global Equity Heatmap"
              subtitle="Daily performance by region and index"
              onRefresh={refresh}
            >
              <HeatmapGrid
                groups={heatmapGroups}
                onSelectCell={setSelectedCell}
                selectedCell={selectedCell}
              />
            </DashboardSectionCard>

          </div>
        </div>
      )}
    </DashboardShell>
  );
};
