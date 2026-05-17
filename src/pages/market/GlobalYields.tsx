import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { DashboardPageTabs } from '../../components/market-dashboards/DashboardPageTabs';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { MiniTrendChart } from '../../components/market-dashboards/MiniTrendChart';
import { SummaryStrip, ArtifactStrip, NarrativeOverlay } from '../../components/intelligence-drawer';
import { yieldsSummary } from '../../lib/intelligence/summaries';
import { useDashboardArtifacts } from '../../hooks/useDashboardArtifacts';
import { useDashboardNarratives } from '../../hooks/useDashboardNarratives';
import { useYieldCurve } from '../../hooks/useDashboard';
import {
  classifyYieldCurve, YIELD_SERIES, type YieldCurveData, type YieldPoint,
} from '../../services/dashboardService';

const TABS = [
  { id: 'curve',        label: 'Yield Curve' },
  { id: 'table',        label: 'Sovereign Yields' },
  { id: 'spread',       label: 'Spread History' },
  { id: 'history',      label: 'Series Charts' },
  { id: 'intelligence', label: 'Intelligence' },
];

const CURVE_TERMS = ['3M', '2Y', '5Y', '10Y', '30Y'];

const CurveTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--foreground)' }}>{payload[0]?.payload?.term}</p>
      <p style={{ margin: '2px 0 0', color: 'var(--chart-3)', fontVariantNumeric: 'tabular-nums' }}>{payload[0]?.value?.toFixed(3)}%</p>
    </div>
  );
};

const YieldCurveChart: React.FC<{ points: YieldPoint[]; onPointClick?: (pt: YieldPoint) => void }> = ({ points, onPointClick }) => {
  const chartData = CURVE_TERMS.map((term) => {
    const pt = points.find((p) => p.term === term);
    return { term, yield: pt?.value ?? null, _pt: pt };
  }).filter((d) => d.yield !== null);

  if (chartData.length < 2) {
    return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>Insufficient yield data</div>;
  }

  const first = chartData[0]?.yield ?? 0;
  const last = chartData[chartData.length - 1]?.yield ?? 0;
  const isInverted = last < first;

  return (
    <div>
      {isInverted && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)', marginBottom: 10 }}>
          <AlertTriangle size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>Curve is inverted — long end yields below short end</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}
          onClick={(d) => { if (d?.activePayload?.[0]?.payload?._pt) onPointClick?.(d.activePayload[0].payload._pt); }}
        >
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
          <XAxis dataKey="term" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v.toFixed(1)}%`} />
          <Tooltip content={<CurveTooltip />} />
          <Line
            type="monotone" dataKey="yield"
            stroke={isInverted ? 'var(--primary)' : 'var(--chart-3)'}
            strokeWidth={2.5}
            dot={{ fill: isInverted ? 'var(--primary)' : 'var(--chart-3)', r: 5, cursor: 'pointer' }}
            activeDot={{ r: 7 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--muted-foreground)', textAlign: 'center' }}>
        Click any point to view historical series
      </p>
    </div>
  );
};

const YieldTableView: React.FC<{ points: YieldPoint[]; onRowClick?: (pt: YieldPoint) => void; selectedId?: string | null }> = ({ points, onRowClick, selectedId }) => {
  const mainPts = points.filter((p) => !['Spread', 'BEI5Y'].includes(p.term));
  const spreadPt = points.find((p) => p.term === 'Spread');
  const beiPt = points.find((p) => p.term === 'BEI5Y');

  const Row: React.FC<{ pt: YieldPoint; highlight?: boolean }> = ({ pt, highlight }) => {
    const isSelected = selectedId === pt.seriesId;
    return (
      <tr
        onClick={() => onRowClick?.(pt)}
        style={{
          borderBottom: '1px solid var(--border)',
          background: isSelected ? 'color-mix(in srgb, var(--primary) 6%, var(--card))' : highlight ? 'color-mix(in srgb, var(--primary) 4%, transparent)' : 'transparent',
          cursor: onRowClick ? 'pointer' : 'default',
          transition: 'background 100ms',
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <td style={{ padding: '9px 8px 9px 0', fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{pt.termLabel}</td>
        <td style={{ padding: '9px 8px', textAlign: 'right', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
          {pt.value !== null ? `${pt.value.toFixed(3)}%` : <span style={{ color: 'var(--muted-foreground)' }}>N/A</span>}
        </td>
        <td style={{ padding: '9px 0', textAlign: 'right' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--muted)', color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {pt.term}
          </span>
        </td>
        <td style={{ padding: '9px 0 9px 8px', textAlign: 'right' }}>
          {onRowClick && pt.value !== null && (
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', opacity: 0.6 }}>→ history</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <th style={{ textAlign: 'left', padding: '5px 8px 5px 0', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tenor</th>
          <th style={{ textAlign: 'right', padding: '5px 8px', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Yield</th>
          <th /><th />
        </tr>
      </thead>
      <tbody>
        {mainPts.map((pt) => <Row key={pt.seriesId} pt={pt} />)}
        {spreadPt && <Row pt={spreadPt} highlight={spreadPt.value !== null && spreadPt.value < 0} />}
        {beiPt && <Row pt={beiPt} />}
      </tbody>
    </table>
  );
};

const SpreadHistoryChart: React.FC<{ history: Record<string, { ts: number; value: number }[]> }> = ({ history }) => {
  const data = (history['T10Y2Y'] ?? []).slice(-60).map((d) => ({
    date: new Date(d.ts).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
    value: parseFloat(d.value.toFixed(3)),
  }));
  if (data.length < 3) return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>No spread history available</div>;

  const inverted = data.filter((d) => d.value < 0).length;
  const total = data.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {inverted > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 9px', borderRadius: 6, background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}>
          <Info size={11} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>
            Inversion present in {inverted}/{total} shown observations
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${v.toFixed(1)}%`} />
          <Tooltip content={({ active, payload }) =>
            active && payload?.length ? (
              <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: (payload[0].value as number) >= 0 ? '#4E6040' : 'var(--primary)', fontWeight: 700 }}>
                  {(payload[0].value as number) >= 0 ? '+' : ''}{(payload[0].value as number).toFixed(3)}%
                </span>
              </div>
            ) : null
          } />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="value" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? '#4E6040' : 'var(--primary)'} opacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const IntelligenceView: React.FC<{ data: YieldCurveData }> = ({ data }) => {
  const intel = useMemo(() => classifyYieldCurve(data), [data]);
  const isInverted = data.curveState === 'inverted';
  const color = isInverted ? 'var(--primary)' : data.curveState === 'flat' ? '#C9A227' : '#4E6040';
  const Icon = isInverted ? TrendingDown : data.curveState === 'flat' ? Minus : TrendingUp;

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {intel.signals.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.5 }}>{s}</span>
          </div>
        ))}
      </div>
      {intel.caution && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 6, background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)' }}>
          <AlertTriangle size={13} style={{ color: 'var(--primary)', marginTop: 1, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 11, color: 'var(--primary)' }}>{intel.caution}</p>
        </div>
      )}
    </div>
  );
};

export const GlobalYields: React.FC = () => {
  const { data, loading, error, status, fetchedAt, refresh } = useYieldCurve();
  const [activeTab, setActiveTab] = useState('curve');
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  const key10y  = data?.points.find((p) => p.term === '10Y');
  const key2y   = data?.points.find((p) => p.term === '2Y');
  const spread  = data?.points.find((p) => p.term === 'Spread');
  const bei     = data?.points.find((p) => p.term === 'BEI5Y');

  const selectedSeries = useMemo(() => {
    if (!selectedSeriesId || !data) return null;
    const pts = data.history[selectedSeriesId];
    const meta = YIELD_SERIES.find((s) => s.id === selectedSeriesId);
    return pts && meta ? { id: selectedSeriesId, label: meta.termLabel, pts: pts.slice(-120) } : null;
  }, [selectedSeriesId, data]);

  const handlePointClick = (pt: YieldPoint) => {
    setSelectedSeriesId(pt.seriesId);
    setActiveTab('history');
  };

  const summary = useMemo(() => data ? yieldsSummary(data) : null, [data]);
  const yieldSymbols = useMemo(() => YIELD_SERIES.map((y) => y.id), []);
  const { artifacts, loading: artifactsLoading } = useDashboardArtifacts(yieldSymbols);
  // Yields narratives often relate to broader macro symbols, not the FRED IDs.
  const { narratives, loading: narrativesLoading } = useDashboardNarratives(['SPY', 'TLT', 'IEF', 'UUP', 'GLD', ...yieldSymbols]);

  return (
    <DashboardShell
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} />Global Yields</span>}
      subtitle="Macro rates and yield regime monitoring — click any tenor to view its full history."
      actions={data ? <SourceFreshnessBadge source="FRED / Alpha Vantage" status={status} fetchedAt={fetchedAt} /> : undefined}
    >
      <SummaryStrip payload={summary} />
      <ArtifactStrip artifacts={artifacts} loading={artifactsLoading} />
      <NarrativeOverlay narratives={narratives} loading={narrativesLoading} />
      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        {key10y && <IntelligenceMetricCard label="US 10Y Treasury" value={key10y.value !== null ? `${key10y.value.toFixed(3)}%` : 'N/A'} status={status} fetchedAt={fetchedAt} hint="Click table for history" onClick={() => handlePointClick(key10y)} />}
        {key2y  && <IntelligenceMetricCard label="US 2Y Treasury"  value={key2y.value !== null ? `${key2y.value.toFixed(3)}%` : 'N/A'}   status={status} fetchedAt={fetchedAt} onClick={() => handlePointClick(key2y)} />}
        {spread && <IntelligenceMetricCard label="10Y–2Y Spread"   value={spread.value !== null ? `${spread.value >= 0 ? '+' : ''}${spread.value.toFixed(3)}%` : 'N/A'} hint={spread.value !== null && spread.value < 0 ? '⚠ INVERTED' : 'Normal'} />}
        {bei    && <IntelligenceMetricCard label="5Y Breakeven"    value={bei.value !== null ? `${bei.value.toFixed(3)}%` : 'N/A'}         hint="Market inflation" />}
      </div>

      <DashboardPageTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {loading && !data && <DashboardSectionCard title="Loading yield data…"><DashboardLoadingState rows={7} /></DashboardSectionCard>}
      {error && !data && <DashboardSectionCard title="Error"><DashboardErrorState message={error.message} onRetry={refresh} /></DashboardSectionCard>}

      {data && activeTab === 'curve' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DashboardSectionCard title="US Yield Curve Shape" subtitle="Click any point to open its historical series" onRefresh={refresh}>
            <YieldCurveChart points={data.points} onPointClick={handlePointClick} />
          </DashboardSectionCard>
          <DashboardSectionCard title="Intelligence" subtitle="Yield curve regime classification">
            <IntelligenceView data={data} />
          </DashboardSectionCard>
        </div>
      )}

      {data && activeTab === 'table' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DashboardSectionCard title="Sovereign Yield Table" subtitle="Click any row to view historical series" onRefresh={refresh}>
            <YieldTableView points={data.points} onRowClick={handlePointClick} selectedId={selectedSeriesId} />
          </DashboardSectionCard>
          <DashboardSectionCard title="10Y–2Y Spread History" subtitle="Last 60 monthly observations">
            <SpreadHistoryChart history={data.history} />
          </DashboardSectionCard>
        </div>
      )}

      {data && activeTab === 'spread' && (
        <DashboardSectionCard title="10Y–2Y Spread History" subtitle="Negative = inverted curve" onRefresh={refresh}>
          <SpreadHistoryChart history={data.history} />
        </DashboardSectionCard>
      )}

      {data && activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Series selector */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.points.filter((p) => data.history[p.seriesId]?.length > 0).map((pt) => (
              <button
                key={pt.seriesId}
                onClick={() => setSelectedSeriesId(pt.seriesId)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  background: selectedSeriesId === pt.seriesId ? 'var(--primary)' : 'var(--muted)',
                  color: selectedSeriesId === pt.seriesId ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {pt.termLabel}
              </button>
            ))}
          </div>

          {selectedSeries ? (
            <DashboardSectionCard title={selectedSeries.label} subtitle={`${selectedSeries.pts.length} historical observations from FRED`}>
              <MiniTrendChart
                data={selectedSeries.pts}
                height={200}
                unit="%"
                showAxis
              />
            </DashboardSectionCard>
          ) : (
            <DashboardSectionCard title="Select a Series">
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                Select a tenor above or click a point in the Yield Curve tab
              </div>
            </DashboardSectionCard>
          )}
        </div>
      )}

      {data && activeTab === 'intelligence' && (
        <DashboardSectionCard title="Macro Intelligence Panel" subtitle="Yield curve regime and liquidity assessment">
          <IntelligenceView data={data} />
        </DashboardSectionCard>
      )}
    </DashboardShell>
  );
};
