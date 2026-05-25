import React, { useCallback, useMemo, useState } from 'react';
import { useMacroSeries } from '../hooks/useMacro';
import { useWebResearch } from '../hooks/useResearch';
import { useDrawer } from '../components/quant/DataDrawer';
import { PageHeader } from '../components/quant/PageHeader';
import { MacroMultiChart, type MacroRange, type MacroScale, type MacroSeriesEntry } from '../components/quant/MacroMultiChart';
import { FreshnessBadge, SourceBadge } from '../components/quant/FreshnessBadge';
import { Disclaimer } from '../components/quant/Disclaimer';
import { Sparkline } from '../components/quant/Sparkline';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { RotateCcw, Save, Loader2 } from 'lucide-react';
import type { MacroSeries } from '../types';
import { createMacroShiftArtifact } from '../services/artifactService';
import { useArtifacts, useBriefings } from '../hooks/useArtifacts';
import { useWorkspace } from '../components/WorkspaceContext';
import { useAuth } from '../components/AuthProvider';
import { toast } from 'sonner';
import { MacroYieldCurvePanel } from '../components/quant/MacroYieldCurvePanel';
import { MacroRegimeQuadrant } from '../components/quant/MacroRegimeQuadrant';
import { MacroRealRatesPanel } from '../components/quant/MacroRealRatesPanel';
import { V3P2MacroRegimePanel } from '../components/quant/V3P2MacroRegimePanel';
import { AgentIntelligenceFeed } from '../components/quant/AgentIntelligenceFeed';
import { MacroAnalogPanel } from '../components/quant/MacroAnalogPanel';
import { useAgentOutputs } from '../hooks/useAgentIntelligence';
import { useHistoricalAnalog } from '../hooks/useAgentReasoning';
import { GlobalMacroIndicatorsPanel } from '../components/quant/GlobalMacroIndicatorsPanel';

interface SeriesMeta {
  id: string;
  name: string;
  unit: string;
  color: string;
  /** Short blurb shown in the indicator detail drawer. */
  description: string;
}

const SERIES_META: SeriesMeta[] = [
  { id: 'FEDFUNDS', name: 'Fed Funds Rate',        unit: '%', color: '#c15f3c', description: 'Effective federal funds rate set by the Federal Reserve. Directly anchors short-term borrowing costs.' },
  { id: 'CPI',      name: 'Consumer Price Index',  unit: '',  color: '#4e6eaf', description: 'All-items urban CPI; the headline inflation gauge.' },
  { id: 'DGS10',    name: '10Y Treasury Yield',    unit: '%', color: '#4E6040', description: 'Constant-maturity 10-year nominal Treasury yield — the long-end risk-free anchor.' },
  { id: 'DGS2',     name: '2Y Treasury Yield',     unit: '%', color: '#9e7e3a', description: '2Y Treasury yield — closely tracks expected near-term Fed policy.' },
  { id: 'DGS5',     name: '5Y Treasury Yield',     unit: '%', color: '#7c9c6e', description: '5Y constant-maturity Treasury yield — mid-curve anchor.' },
  { id: 'DGS20',    name: '20Y Treasury Yield',    unit: '%', color: '#5a7a8a', description: '20Y Treasury yield — ultra-long anchor used in pension/insurance duration matching.' },
  { id: 'DGS30',    name: '30Y Treasury Yield',    unit: '%', color: '#3a6070', description: '30Y Treasury yield — the long bond; key for mortgage rates and long-duration assets.' },
  { id: 'T10Y2Y',   name: '10Y–2Y Spread',         unit: '%', color: '#a0522d', description: 'Yield curve slope: 10Y minus 2Y. Negative = inverted curve, historically a recession predictor.' },
  { id: 'T5YIE',    name: '5Y Breakeven Inflation', unit: '%', color: '#8b7355', description: 'Market-implied 5Y inflation expectation from TIPS. Nominal − Breakeven = Real Rate.' },
  { id: 'UNRATE',   name: 'Unemployment Rate',     unit: '%', color: '#6a4e7c', description: 'U-3 unemployment rate — primary labour-market slack indicator.' },
  { id: 'GDP',      name: 'Real GDP',              unit: 'B', color: '#3a8085', description: 'Real (chain-weighted) GDP in billions of dollars.' },
];

const RANGES: MacroRange[] = ['1Y', '5Y', '10Y', 'MAX'];

const SeriesHook: React.FC<{
  id: string;
  onLoaded: (id: string, s: MacroSeries | null, status: import('../services/gatewayClient').FreshnessStatus, fetchedAt: number | null) => void;
}> = ({ id, onLoaded }) => {
  const { data, status, fetchedAt } = useMacroSeries(id);
  React.useEffect(() => { onLoaded(id, data ?? null, status, fetchedAt); },
    [id, data, status, fetchedAt, onLoaded]);
  return null;
};

interface LoadedSeries {
  data: MacroSeries | null;
  status: import('../services/gatewayClient').FreshnessStatus;
  fetchedAt: number | null;
}

export const MacroRegimeDesk: React.FC = () => {
  const drawer = useDrawer();
  const { currentWorkspace, currentProject } = useWorkspace();
  const { user } = useAuth();
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const briefings = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const [active, setActive] = useState<string[]>(['FEDFUNDS', 'DGS10', 'CPI']);
  const [range, setRange] = useState<MacroRange>('5Y');
  const [scale, setScale] = useState<MacroScale>('indexed');
  const [loaded, setLoaded] = useState<Record<string, LoadedSeries>>({});
  const [savingMacro, setSavingMacro] = useState(false);

  const onLoaded = React.useCallback(
    (id: string, data: MacroSeries | null, status: import('../services/gatewayClient').FreshnessStatus, fetchedAt: number | null) => {
      setLoaded((prev) => {
        const existing = prev[id];
        if (existing && existing.data === data && existing.status === status && existing.fetchedAt === fetchedAt) return prev;
        return { ...prev, [id]: { data, status, fetchedAt } };
      });
    },
    [],
  );

  const research = useWebResearch(
    'current macroeconomic regime central bank posture inflation growth',
    { topic: 'finance', days: 14 },
  );

  const seriesEntries: MacroSeriesEntry[] = useMemo(
    () => SERIES_META
      .map((m) => {
        const d = loaded[m.id]?.data;
        return d
          ? { id: m.id, name: m.name, unit: m.unit, color: m.color, points: d.points }
          : null;
      })
      .filter((x): x is MacroSeriesEntry => x != null),
    [loaded],
  );

  const toggleActive = (id: string) =>
    setActive((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const resetZoom = () => {
    // Range buttons reset the brush by remounting the chart via key change.
    setRange((r) => r);
    setTick((t) => t + 1);
  };
  const [tick, setTick] = useState(0);

  const overallStatus: import('../services/gatewayClient').FreshnessStatus = useMemo(() => {
    const statuses = SERIES_META.map((m) => loaded[m.id]?.status).filter(Boolean) as import('../services/gatewayClient').FreshnessStatus[];
    if (!statuses.length) return 'live';
    if (statuses.some((s) => s === 'stale' || s === 'error')) return 'stale';
    if (statuses.every((s) => s === 'live')) return 'live';
    return 'cached';
  }, [loaded]);

  const newestFetchedAt = useMemo(() => {
    const xs = SERIES_META.map((m) => loaded[m.id]?.fetchedAt).filter((x): x is number => x != null);
    return xs.length ? Math.max(...xs) : null;
  }, [loaded]);

  const buildMacroNarrative = () =>
    SERIES_META
      .filter(m => active.includes(m.id))
      .map(m => {
        const pts = loaded[m.id]?.data?.points ?? [];
        const last = pts[pts.length - 1];
        return last ? `${m.name}: ${last.value.toFixed(2)}` : null;
      })
      .filter((x): x is string => x !== null)
      .join('\n');

  const handleOpenArtifact = useCallback((id: string) => {
    const artifact = artifacts.items.find((a) => a.id === id);
    if (!artifact) return;
    drawer.open({
      title: artifact.title,
      subtitle: artifact.artifactType ?? artifact.category,
      width: 560,
      body: <ArtifactDetailDrawerBody artifact={artifact} relatedArtifacts={artifacts.items} onOpenArtifact={handleOpenArtifact} />,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts.items, drawer]);

  const macroArtifacts = useMemo(() =>
    artifacts.items
      .filter((a) =>
        a.artifactType === 'macro_shift' ||
        a.tags?.includes('macro') ||
        a.relatedMacroIndicators?.some((m) => active.includes(m)),
      )
      .slice(0, 4),
    [artifacts.items, active],
  );

  // V4: macro + liquidity agent intelligence
  const macroAgentOutputs = useAgentOutputs({ placement: 'MacroRegimeDesk', limit: 20 });
  const analogResult = useHistoricalAnalog({ lookback_years: 10, top_k: 3 });

  const handleSaveMacroContext = async () => {
    if (!currentWorkspace?.id || !currentProject?.id || !user) return;
    setSavingMacro(true);
    try {
      await createMacroShiftArtifact(
        currentWorkspace.id, currentProject.id,
        active, buildMacroNarrative(), user.uid,
      );
      toast.success('Macro context saved to Research Timeline');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingMacro(false);
    }
  };

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Macro Regime Desk"
        subtitle="Central bank posture, yield curves, growth/inflation tilt, and the current macro regime classification."
        actions={
          <button
            disabled={savingMacro || active.length === 0}
            onClick={handleSaveMacroContext}
            className="ds-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            {savingMacro ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save Context
          </button>
        }
      />

      {/* Headless fetch-and-cache for every series so toggles are instant. */}
      {SERIES_META.map((m) => (<SeriesHook key={m.id} id={m.id} onLoaded={onLoaded} />))}

      {/* Summary tiles */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
        {SERIES_META.map((m) => {
          const entry = loaded[m.id];
          const pts = entry?.data?.points ?? [];
          const last = pts.length ? pts[pts.length - 1] : null;
          const prev = pts.length > 1 ? pts[pts.length - 2] : null;
          const change = last && prev ? last.value - prev.value : null;
          const sparkValues = pts.slice(-60).map((p) => p.value);
          const isActive = active.includes(m.id);

          return (
            <button
              key={m.id}
              onClick={() => toggleActive(m.id)}
              onDoubleClick={() => drawer.open({
                title: m.name,
                subtitle: 'Macro indicator',
                width: 560,
                body: <MacroIndicatorDrawerBody meta={m} series={entry?.data ?? null} />,
              })}
              className="ds-surface ds-transition-fast"
              style={{
                textAlign: 'left',
                padding: 12,
                borderRadius: 10,
                background: 'var(--card)',
                border: `1px solid ${isActive ? m.color : 'var(--border)'}`,
                boxShadow: isActive ? `inset 0 0 0 1px ${m.color}` : undefined,
                cursor: 'pointer',
                display: 'grid',
                gap: 6,
              }}
              title={`Click: toggle on chart · Double-click: open detail`}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '0.02em' }}>
                  {m.name}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, opacity: isActive ? 1 : 0.35 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
                  {last ? last.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{m.unit}</span>
                {change != null && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: change > 0 ? '#4E6040' : change < 0 ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}>
                    {change > 0 ? '▲' : change < 0 ? '▼' : '·'} {Math.abs(change).toFixed(2)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <Sparkline values={sparkValues} width={120} height={22} color={m.color} strokeWidth={1.25} />
                <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 9 }}>
                  {last ? new Date(last.ts).toLocaleDateString(undefined, { year: '2-digit', month: 'short' }) : ''}
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Chart controls + chart */}
      <section className="ds-surface" style={{ padding: 16, borderRadius: 10, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {SERIES_META.map((m) => {
              const on = active.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleActive(m.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    border: `1px solid ${on ? m.color : 'var(--border)'}`,
                    background: on ? `color-mix(in srgb, ${m.color} 16%, transparent)` : 'transparent',
                    color: on ? 'var(--foreground)' : 'var(--muted-foreground)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, opacity: on ? 1 : 0.35 }} />
                  {m.name}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <FreshnessBadge status={overallStatus} fetchedAt={newestFetchedAt} compact />
            <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRange(r); setTick((t) => t + 1); }}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: range === r ? 'var(--primary)' : 'transparent',
                    color: range === r ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['indexed', 'raw'] as MacroScale[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: scale === s ? 'var(--secondary)' : 'transparent',
                    color: 'var(--foreground)',
                    border: 'none',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                  title={s === 'indexed' ? 'Rebase each series to 100 at start of range (compares relative moves)' : 'Show raw values on a single axis (use only when units match)'}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={resetZoom}
              title="Reset zoom"
              style={{
                width: 26, height: 26, borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--muted-foreground)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        <MacroMultiChart
          key={`${range}-${tick}`}
          series={seriesEntries}
          activeIds={active}
          range={range}
          scale={scale}
          height={360}
        />
        <p className="ds-caption" style={{ marginTop: 8, color: 'var(--muted-foreground)', fontSize: 10 }}>
          {scale === 'indexed'
            ? 'Each series rebased to 100 at start of visible range. Hover to see raw values + units.'
            : 'Raw values on a shared axis. Switch to "Indexed" to compare relative moves across series with different units.'}
          {' '}Drag the brush handles below the chart to zoom; click a tile to toggle a series, double-click to inspect.
        </p>
      </section>

      {/* ── Yield Curve Analysis ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <h2 className="ds-heading" style={{ margin: '0 0 12px' }}>Yield Curve Analysis</h2>
        <MacroYieldCurvePanel loaded={{
          DGS2:   loaded.DGS2?.data,
          DGS5:   loaded.DGS5?.data,
          DGS10:  loaded.DGS10?.data,
          DGS20:  loaded.DGS20?.data,
          DGS30:  loaded.DGS30?.data,
          T10Y2Y: loaded.T10Y2Y?.data,
        }} />
        <p className="ds-caption" style={{ margin: '8px 0 0', color: 'var(--muted-foreground)', fontSize: 10 }}>
          Enable DGS2, DGS5, DGS10, DGS20, DGS30, T10Y2Y above to populate these charts.
        </p>
      </section>

      {/* ── Regime Quadrant + Real Rates ────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <h2 className="ds-heading" style={{ margin: '0 0 12px' }}>Regime & Real Rates</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16, marginBottom: 16 }}>
          <MacroRegimeQuadrant
            cpi={loaded.CPI?.data}
            gdp={loaded.GDP?.data}
          />
          <MacroRealRatesPanel
            dgs10={loaded.DGS10?.data}
            t5yie={loaded.T5YIE?.data}
            unrate={loaded.UNRATE?.data}
          />
        </div>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
          Regime quadrant requires CPI + GDP. Real rates panel requires 10Y Treasury + 5Y Breakeven. Enable UNRATE for labour-market overlay.
        </p>
      </section>

      {/* ── V3 Phase 2: warehouse-backed regime classifier ──────────────────── */}
      <V3P2MacroRegimePanel />

      <GlobalMacroIndicatorsPanel />

      {/* ── V4: Agent intelligence (macro + liquidity) ──────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          <div>
            <h2 className="ds-heading" style={{ margin: '0 0 12px' }}>Macro Intelligence</h2>
            <AgentIntelligenceFeed
              outputs={macroAgentOutputs.data}
              loading={macroAgentOutputs.loading}
              analyzing={macroAgentOutputs.loading}
              title="Macro & Liquidity Agents"
              showFilters={false}
              compact
              maxItems={8}
              onRefresh={macroAgentOutputs.refetch}
            />
          </div>
          <div>
            <h2 className="ds-heading" style={{ margin: '0 0 12px' }}>Historical Analogs</h2>
            <MacroAnalogPanel result={analogResult.data} loading={analogResult.loading} compact />
          </div>
        </div>
      </section>

      {/* Macro web research */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 className="ds-heading" style={{ margin: 0 }}>Macro Context</h2>
          <FreshnessBadge status={research.status} fetchedAt={research.fetchedAt} compact />
        </div>
        {research.loading && <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Researching macro context…</p>}
        {research.data?.answer && (
          <div className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 12 }}>
            <p className="ds-body">{research.data.answer}</p>
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {(research.data?.results ?? []).slice(0, 6).map((r) => (
            <li key={r.url} className="ds-surface" style={{ padding: 12, borderRadius: 8 }}>
              <a href={r.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="ds-heading">{r.title}</div>
                <p className="ds-caption" style={{ marginTop: 4, color: 'var(--muted-foreground)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {r.content}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Related Macro Research */}
      {macroArtifacts.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h4 className="ds-label" style={{ margin: '0 0 10px', color: 'var(--muted-foreground)' }}>
            Related Macro Research
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {macroArtifacts.map((a) => (
              <button
                key={a.id}
                onClick={() => handleOpenArtifact(a.id)}
                className="ds-surface ds-transition"
                style={{ padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', display: 'grid', gap: 4 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  <span className="ds-label" style={{ color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
                    {(a.artifactType ?? a.category).replace(/_/g, ' ')}
                  </span>
                  <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span className="ds-body" style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</span>
                {a.relatedMacroIndicators?.length ? (
                  <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                    {a.relatedMacroIndicators.slice(0, 3).join(' · ')}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      )}

      <Disclaimer />
    </div>
  );
};

/* ─── Indicator detail drawer ──────────────────────────────────────────── */

const MacroIndicatorDrawerBody: React.FC<{
  meta: SeriesMeta;
  series: MacroSeries | null;
}> = ({ meta, series }) => {
  const pts = series?.points ?? [];
  const last = pts.length ? pts[pts.length - 1] : null;
  const prev = pts.length > 1 ? pts[pts.length - 2] : null;
  const sparkAll = pts.map((p) => p.value);
  const recent = pts.slice(-12).reverse();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="ds-body" style={{ color: 'var(--muted-foreground)' }}>{meta.description}</p>

      <div className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: meta.color }}>
            {last ? last.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{meta.unit}</span>
          {prev && last && (
            <span style={{
              marginLeft: 'auto', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: last.value > prev.value ? '#4E6040' : last.value < prev.value ? 'var(--primary)' : 'var(--muted-foreground)',
            }}>
              {last.value > prev.value ? '▲' : last.value < prev.value ? '▼' : '·'} {(last.value - prev.value).toFixed(2)}
            </span>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <Sparkline values={sparkAll} width={480} height={70} color={meta.color} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
            {pts.length ? new Date(pts[0].ts).toLocaleDateString() : ''}
          </span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
            {last ? new Date(last.ts).toLocaleDateString() : ''}
          </span>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 className="ds-heading" style={{ margin: 0 }}>Recent observations</h3>
          {series && <SourceBadge source={series.source} />}
        </div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--muted-foreground)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={{ textAlign: 'left', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Date</th>
              <th style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Value</th>
              <th style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((p, i) => {
              const previous = recent[i + 1];
              const delta = previous ? p.value - previous.value : null;
              return (
                <tr key={p.ts}>
                  <td style={{ padding: '6px 0', color: 'var(--muted-foreground)' }}>
                    {new Date(p.ts).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {p.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{
                    padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                    color: delta == null ? 'var(--muted-foreground)' :
                      delta > 0 ? '#4E6040' : delta < 0 ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}>
                    {delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)}` : '—'}
                  </td>
                </tr>
              );
            })}
            {!recent.length && (
              <tr><td colSpan={3} style={{ padding: 12, textAlign: 'center', color: 'var(--muted-foreground)' }}>No data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
