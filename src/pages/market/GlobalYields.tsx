import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts';
import { DashboardShell } from '../../components/market-dashboards/DashboardShell';
import { DashboardSectionCard } from '../../components/market-dashboards/DashboardSectionCard';
import { IntelligenceMetricCard } from '../../components/market-dashboards/IntelligenceMetricCard';
import { DashboardLoadingState, DashboardErrorState, SourceFreshnessBadge } from '../../components/market-dashboards/DashboardStates';
import { useYieldCurve } from '../../hooks/useDashboard';
import { classifyYieldCurve, YIELD_SERIES, type YieldCurveData, type YieldPoint } from '../../services/dashboardService';

// ─── Yield curve shape chart ──────────────────────────────────────────────────

const CURVE_TERMS = ['3M', '2Y', '5Y', '10Y', '30Y'];

const CurveTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 11 }}>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--foreground)' }}>{label}</p>
      <p style={{ margin: '2px 0 0', color: 'var(--chart-3)', fontVariantNumeric: 'tabular-nums' }}>{payload[0]?.value?.toFixed(3)}%</p>
    </div>
  );
};

const YieldCurveChart: React.FC<{ points: YieldPoint[] }> = ({ points }) => {
  const chartData = CURVE_TERMS.map((term) => {
    const pt = points.find((p) => p.term === term);
    return { term, yield: pt?.value ?? null };
  }).filter((d) => d.yield !== null);

  if (chartData.length < 2) {
    return <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>Insufficient yield data</div>;
  }

  const first = chartData[0]?.yield ?? 0;
  const last = chartData[chartData.length - 1]?.yield ?? 0;
  const isInverted = last < first;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis dataKey="term" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v.toFixed(1)}%`} />
        <Tooltip content={<CurveTooltip />} />
        <Line
          type="monotone" dataKey="yield"
          stroke={isInverted ? 'var(--primary)' : 'var(--chart-3)'}
          strokeWidth={2}
          dot={{ fill: isInverted ? 'var(--primary)' : 'var(--chart-3)', r: 4 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ─── Yield table ──────────────────────────────────────────────────────────────

const YieldTable: React.FC<{ points: YieldPoint[] }> = ({ points }) => {
  const displayPoints = points.filter((p) => !['Spread', 'BEI5Y'].includes(p.term));
  const spreadPt = points.find((p) => p.term === 'Spread');
  const beiPt = points.find((p) => p.term === 'BEI5Y');

  const Row: React.FC<{ pt: YieldPoint; highlight?: boolean }> = ({ pt, highlight }) => (
    <tr style={{ borderBottom: '1px solid var(--border)', background: highlight ? 'color-mix(in srgb, var(--primary) 5%, transparent)' : 'transparent' }}>
      <td style={{ padding: '8px 8px 8px 0', fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{pt.termLabel}</td>
      <td style={{ padding: '8px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
        {pt.value !== null ? `${pt.value.toFixed(3)}%` : <span style={{ color: 'var(--muted-foreground)' }}>N/A</span>}
      </td>
      <td style={{ padding: '8px 0', textAlign: 'right' }}>
        {pt.value !== null && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
            background: 'var(--muted)', color: 'var(--muted-foreground)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {pt.term}
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <th style={{ textAlign: 'left', padding: '5px 8px 5px 0', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tenor</th>
          <th style={{ textAlign: 'right', padding: '5px 8px', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Yield</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {displayPoints.map((pt) => <Row key={pt.seriesId} pt={pt} />)}
        {spreadPt && <Row pt={spreadPt} highlight={spreadPt.value !== null && spreadPt.value < 0} />}
        {beiPt && <Row pt={beiPt} />}
      </tbody>
    </table>
  );
};

// ─── Intelligence summary ─────────────────────────────────────────────────────

const IntelligenceSummaryPanel: React.FC<{ data: YieldCurveData }> = ({ data }) => {
  const intel = useMemo(() => classifyYieldCurve(data), [data]);
  const isInverted = data.curveState === 'inverted';
  const color = isInverted ? 'var(--primary)' : data.curveState === 'flat' ? '#C9A227' : '#4E6040';
  const Icon = isInverted ? TrendingDown : data.curveState === 'flat' ? Minus : TrendingUp;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 8,
        background: `color-mix(in srgb, ${color} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 22%, var(--border))`,
      }}>
        <Icon size={16} style={{ color, marginTop: 1, flexShrink: 0 }} />
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
      {intel.caution && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '8px 10px', borderRadius: 6,
          background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
        }}>
          <AlertTriangle size={13} style={{ color: 'var(--primary)', marginTop: 1, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 10, color: 'var(--primary)' }}>{intel.caution}</p>
        </div>
      )}
    </div>
  );
};

// ─── Spread history bar chart ─────────────────────────────────────────────────

const SpreadHistoryChart: React.FC<{ history: Record<string, { ts: number; value: number }[]> }> = ({ history }) => {
  const spreadData = (history['T10Y2Y'] ?? []).slice(-60).map((d) => ({
    date: new Date(d.ts).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
    value: parseFloat(d.value.toFixed(3)),
  }));

  if (spreadData.length < 3) {
    return <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>No spread history</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={spreadData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${v.toFixed(1)}%`} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 10 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: (payload[0].value as number) >= 0 ? '#4E6040' : 'var(--primary)', fontWeight: 700 }}>
                  {(payload[0].value as number) >= 0 ? '+' : ''}{(payload[0].value as number).toFixed(3)}%
                </span>
              </div>
            ) : null
          }
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {spreadData.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? '#4E6040' : 'var(--primary)'} opacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const GlobalYields: React.FC = () => {
  const { data, loading, error, status, fetchedAt, refresh } = useYieldCurve();

  const key10y = data?.points.find((p) => p.term === '10Y');
  const key2y = data?.points.find((p) => p.term === '2Y');
  const spread = data?.points.find((p) => p.term === 'Spread');
  const bei = data?.points.find((p) => p.term === 'BEI5Y');

  return (
    <DashboardShell
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} />Global Yields</span>}
      subtitle="Macro rates and yield regime monitoring — US yield curve, sovereign yields, spread dynamics and liquidity conditions."
      actions={data ? <SourceFreshnessBadge source="FRED / Alpha Vantage" status={status} fetchedAt={fetchedAt} /> : undefined}
    >
      {/* ── Headline KPIs ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {key10y && (
          <IntelligenceMetricCard
            label="US 10Y Treasury"
            value={key10y.value !== null ? `${key10y.value.toFixed(3)}%` : 'N/A'}
            status={status}
            fetchedAt={fetchedAt}
            hint="10-Year Constant Maturity"
          />
        )}
        {key2y && (
          <IntelligenceMetricCard
            label="US 2Y Treasury"
            value={key2y.value !== null ? `${key2y.value.toFixed(3)}%` : 'N/A'}
            status={status}
            fetchedAt={fetchedAt}
            hint="2-Year Constant Maturity"
          />
        )}
        {spread && (
          <IntelligenceMetricCard
            label="10Y–2Y Spread"
            value={spread.value !== null ? `${spread.value >= 0 ? '+' : ''}${spread.value.toFixed(3)}%` : 'N/A'}
            status={status}
            fetchedAt={fetchedAt}
            hint={spread.value !== null && spread.value < 0 ? 'INVERTED' : 'Normal slope'}
          />
        )}
        {bei && (
          <IntelligenceMetricCard
            label="5Y Breakeven"
            value={bei.value !== null ? `${bei.value.toFixed(3)}%` : 'N/A'}
            status={status}
            fetchedAt={fetchedAt}
            hint="Market-implied inflation"
          />
        )}
      </div>

      {loading && !data && (
        <DashboardSectionCard title="Loading yield data…" subtitle="Fetching FRED/Alpha Vantage macro series">
          <DashboardLoadingState rows={7} />
        </DashboardSectionCard>
      )}
      {error && !data && (
        <DashboardSectionCard title="Data Error">
          <DashboardErrorState message={error.message} onRetry={refresh} />
        </DashboardSectionCard>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardSectionCard
              title="US Yield Curve"
              subtitle="Current shape from 3M to 30Y"
              onRefresh={refresh}
            >
              <YieldCurveChart points={data.points} />
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Sovereign Yield Table"
              subtitle="All tracked maturities and derived spreads"
            >
              <YieldTable points={data.points} />
            </DashboardSectionCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DashboardSectionCard
              title="10Y–2Y Spread History"
              subtitle="Last 60 monthly observations — negative = inverted"
              onRefresh={refresh}
            >
              <SpreadHistoryChart history={data.history} />
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Macro Intelligence Panel"
              subtitle="Yield curve regime classification"
            >
              <IntelligenceSummaryPanel data={data} />
            </DashboardSectionCard>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
