import React, { useMemo, useState } from 'react';
import { Map, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { CompactPerformanceTable } from '../../components/market-dashboards/CompactPerformanceTable';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { useCountryETFs } from '../../hooks/useDashboard';
import { COUNTRY_ETF_SYMBOLS, type DashboardQuote } from '../../services/dashboardService';
import type { PerformanceRow } from '../../components/market-dashboards/CompactPerformanceTable';
import type { HeatmapGridGroup } from '../../components/market-dashboards/HeatmapGrid';

function buildHeatmapGroups(quotes: DashboardQuote[]): HeatmapGridGroup[] {
  const devQuotes = quotes.filter((q) => q.ok && COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'developed');
  const emQuotes  = quotes.filter((q) => q.ok && COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'emerging');

  const makeGroup = (name: string, qs: DashboardQuote[]): HeatmapGridGroup => ({
    name,
    avgValue: qs.length ? qs.reduce((s, q) => s + q.changePercent, 0) / qs.length : 0,
    cells: qs.sort((a, b) => b.changePercent - a.changePercent).map((q) => ({
      id: q.symbol, label: q.symbol, sublabel: q.name,
      value: q.changePercent, size: 'md' as const,
    })),
  });

  const groups: HeatmapGridGroup[] = [];
  if (devQuotes.length) groups.push(makeGroup('Developed Markets', devQuotes));
  if (emQuotes.length)  groups.push(makeGroup('Emerging Markets', emQuotes));
  return groups;
}

function buildRows(quotes: DashboardQuote[], region: 'developed' | 'emerging'): PerformanceRow[] {
  return quotes
    .filter((q) => q.ok && COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === region)
    .map((q) => ({ symbol: q.symbol, name: q.name, price: q.price, changePercent: q.changePercent, change: q.change }))
    .sort((a, b) => b.changePercent - a.changePercent);
}

const IntelligenceSummaryPanel: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const ok = quotes.filter((q) => q.ok);
  const devOk = ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'developed');
  const emOk  = ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'emerging');

  const devAvg = devOk.length ? devOk.reduce((s, q) => s + q.changePercent, 0) / devOk.length : 0;
  const emAvg  = emOk.length  ? emOk.reduce((s, q) => s + q.changePercent, 0) / emOk.length  : 0;

  const top = [...ok].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3).map((q) => q.name || q.symbol);
  const bot = [...ok].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3).map((q) => q.name || q.symbol);

  const regime = emAvg < -1.0 ? 'risk-off' : emAvg > 0.5 && devAvg > 0.5 ? 'risk-on' : 'neutral';
  const color = regime === 'risk-on' ? '#4E6040' : regime === 'risk-off' ? 'var(--primary)' : 'var(--muted-foreground)';
  const Icon = regime === 'risk-on' ? TrendingUp : regime === 'risk-off' ? TrendingDown : Minus;

  const headline = regime === 'risk-on'
    ? 'Global Risk-On — Broad Country Advance'
    : regime === 'risk-off'
    ? 'EM Under Pressure — Risk-Off Signal'
    : 'Regional Markets Mixed — Selective Country Performance';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 8,
        background: `color-mix(in srgb, ${color} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 20%, var(--border))`,
      }}>
        <Icon size={16} style={{ color, marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{headline}</p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
            {ok.length} country ETFs tracked · DM avg {devAvg >= 0 ? '+' : ''}{devAvg.toFixed(2)}% · EM avg {emAvg >= 0 ? '+' : ''}{emAvg.toFixed(2)}%
          </p>
        </div>
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {top.length > 0 && <li style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Leaders: {top.join(', ')}</li>}
        {bot.length > 0 && <li style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Laggards: {bot.join(', ')}</li>}
        <li style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
          DM vs EM spread: {(devAvg - emAvg) >= 0 ? '+' : ''}{(devAvg - emAvg).toFixed(2)}%
          {devAvg - emAvg > 0.5 ? ' (DM outperforming)' : devAvg - emAvg < -0.5 ? ' (EM outperforming)' : ''}
        </li>
      </ul>
    </div>
  );
};

export const CountriesRegionalMarkets: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useCountryETFs();
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const heatmapGroups = useMemo(() => quotes ? buildHeatmapGroups(quotes) : [], [quotes]);
  const devRows = useMemo(() => quotes ? buildRows(quotes, 'developed') : [], [quotes]);
  const emRows  = useMemo(() => quotes ? buildRows(quotes, 'emerging') : [], [quotes]);

  const ok = quotes?.filter((q) => q.ok) ?? [];
  const devOk = ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'developed');
  const emOk  = ok.filter((q) => COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol)?.region === 'emerging');
  const devAvg = devOk.length ? devOk.reduce((s, q) => s + q.changePercent, 0) / devOk.length : 0;
  const emAvg  = emOk.length  ? emOk.reduce((s, q) => s + q.changePercent, 0) / emOk.length  : 0;

  return (
    <DashboardShell
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Map size={18} />Countries & Regional Markets</span>}
      subtitle="Regional equity and macro pressure monitoring — country ETF performance, developed vs emerging, regional leadership."
      actions={quotes ? <SourceFreshnessBadge source="Market Data" status={status} fetchedAt={fetchedAt} /> : undefined}
    >
      {/* Headline KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        <IntelligenceMetricCard
          label="Developed Mkts Avg"
          value={`${devAvg >= 0 ? '+' : ''}${devAvg.toFixed(2)}%`}
          hint={`${devOk.length} DM countries`}
          status={status}
          fetchedAt={fetchedAt}
        />
        <IntelligenceMetricCard
          label="Emerging Mkts Avg"
          value={`${emAvg >= 0 ? '+' : ''}${emAvg.toFixed(2)}%`}
          hint={`${emOk.length} EM countries`}
          status={status}
          fetchedAt={fetchedAt}
        />
        <IntelligenceMetricCard
          label="DM–EM Spread"
          value={`${(devAvg - emAvg) >= 0 ? '+' : ''}${(devAvg - emAvg).toFixed(2)}%`}
          hint="Positive = DM outperforming"
        />
      </div>

      {loading && !quotes && (
        <DashboardSectionCard title="Loading country data…">
          <DashboardLoadingState rows={14} />
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
            <DashboardSectionCard title="Developed Markets" subtitle={`${devRows.length} countries tracked`} onRefresh={refresh}>
              <CompactPerformanceTable rows={devRows} showSparkline={false} />
            </DashboardSectionCard>

            <DashboardSectionCard title="Emerging Markets" subtitle={`${emRows.length} countries tracked`}>
              <CompactPerformanceTable rows={emRows} showSparkline={false} />
            </DashboardSectionCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardSectionCard title="Regional Heatmap" subtitle="Country ETF daily performance" onRefresh={refresh}>
              <HeatmapGrid groups={heatmapGroups} onSelectCell={setSelectedCell} selectedCell={selectedCell} />
            </DashboardSectionCard>

            <DashboardSectionCard title="Intelligence Summary" subtitle="Regional leadership and EM stress assessment">
              <IntelligenceSummaryPanel quotes={quotes} />
            </DashboardSectionCard>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
