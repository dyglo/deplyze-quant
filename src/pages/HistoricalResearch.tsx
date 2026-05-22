/**
 * Historical Research — query-driven institutional research workspace.
 *
 * Result surface borrows the Bagus Fikri grammar: page header with right-aligned
 * pill controls (lookback / refine / edit-widgets / ⋮), KPI strip across the
 * top, every visualization wrapped in a Widget shell (info-tip · legend · view
 * more · expand · 3-dots). Each chart widget has a grounded explainer below it
 * computed locally from the chart's own data.
 *
 * Landing exposes two entry paths: a natural-language CommandBar and a
 * structured QuickBuild form, toggled by InputModeSwitch.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Info, Copy, EyeOff } from 'lucide-react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { CommandBar } from '../components/quant/historical-research/CommandBar';
import { QuickBuild } from '../components/quant/historical-research/QuickBuild';
import { InputModeSwitch, type InputMode } from '../components/quant/historical-research/InputModeSwitch';
import { NormalizedChart } from '../components/quant/historical-research/NormalizedChart';
import { RollingCorrelationChart } from '../components/quant/historical-research/RollingCorrelationChart';
import { ObservationsList } from '../components/quant/historical-research/ObservationsList';
import { ReasoningPanel } from '../components/quant/historical-research/ReasoningPanel';
import { EmptyState } from '../components/quant/historical-research/EmptyState';
import { ProgressTrace } from '../components/quant/historical-research/ProgressTrace';
import { RefinePanel } from '../components/quant/historical-research/RefinePanel';
import { RecentRail } from '../components/quant/historical-research/RecentRail';
import { Widget, type LegendChip } from '../components/quant/historical-research/Widget';
import { KpiRow } from '../components/quant/historical-research/KpiRow';
import { ResultToolbar, LandingToolbar } from '../components/quant/historical-research/HeaderToolbar';
import { WidgetVisibilityMenu, type WidgetEntry } from '../components/quant/historical-research/WidgetVisibilityMenu';
import { PerformanceTable } from '../components/quant/historical-research/PerformanceTable';
import { DrawdownChart } from '../components/quant/historical-research/DrawdownChart';
import { AnnualReturnsChart } from '../components/quant/historical-research/AnnualReturnsChart';
import { DistributionChart } from '../components/quant/historical-research/DistributionChart';
import { RollingVolChart } from '../components/quant/historical-research/RollingVolChart';
import { CorrelationMatrixWidget } from '../components/quant/historical-research/CorrelationMatrixWidget';
import { RiskReturnScatter } from '../components/quant/historical-research/RiskReturnScatter';
import { RegimeTable } from '../components/quant/historical-research/RegimeTable';
import { FollowUpThread, type FollowupTurn } from '../components/quant/historical-research/FollowUpThread';
import { FollowUpInput } from '../components/quant/historical-research/FollowUpInput';
import { seriesColor } from '../components/quant/historical-research/palette';
import { useHistoricalResearch, type ResearchResult, type RollingCorrelation, type AssetSeries } from '../hooks/useHistoricalResearch';
import type { ResearchPlan } from '../services/historicalResearchService';
import { askFollowup } from '../services/historicalResearchService';
import { saveInvestigation, loadInvestigation } from '../services/savedHistoricalResearchService';
import { useAuth } from '../components/AuthProvider';
import { useWorkspace } from '../components/WorkspaceContext';

const STORAGE_PREFIX = 'hr:';

type WidgetId =
  | 'regimes' | 'normalized' | 'drawdown' | 'rolling' | 'rollingvol'
  | 'annual' | 'distribution' | 'correlation' | 'scatter'
  | 'performance' | 'reasoning' | 'observations' | 'followups';

const ALL_WIDGETS: { id: WidgetId; label: string }[] = [
  { id: 'regimes',      label: 'Regime comparison' },
  { id: 'performance',  label: 'Performance summary' },
  { id: 'normalized',   label: 'Normalized history' },
  { id: 'drawdown',     label: 'Drawdown' },
  { id: 'rolling',      label: 'Rolling relationship' },
  { id: 'rollingvol',   label: 'Rolling volatility' },
  { id: 'annual',       label: 'Annual returns' },
  { id: 'distribution', label: 'Return distribution' },
  { id: 'correlation',  label: 'Correlation matrix' },
  { id: 'scatter',      label: 'Risk vs return' },
  { id: 'reasoning',    label: 'Reasoning' },
  { id: 'observations', label: 'Observations' },
  { id: 'followups',    label: 'Follow-ups' },
];

function newInvestigationId(): string {
  return `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function readInvestigation(id: string): ResearchResult | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
    return raw ? (JSON.parse(raw) as ResearchResult) : null;
  } catch { return null; }
}

function writeInvestigation(id: string, r: ResearchResult): void {
  try { sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(r)); } catch { /* quota */ }
}

export const HistoricalResearch: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const routeId = params.id ?? null;

  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const wid = currentWorkspace?.id ?? null;

  const { steps, busy, result, error, run, reset, hydrate } = useHistoricalResearch();

  const initialQuery = (location.state as { prefillQuery?: string } | null)?.prefillQuery ?? '';
  const [missing, setMissing] = useState(false);
  const [recentTick, setRecentTick] = useState(0);

  // Toolbar state
  const [refineOpen, setRefineOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<WidgetId>>(new Set());
  const [inputMode, setInputMode] = useState<InputMode>('nl');

  // Save + follow-up state
  const [followups, setFollowups] = useState<FollowupTurn[]>([]);
  const [followupBusy, setFollowupBusy] = useState(false);
  const [savedState, setSavedState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ── Sync URL → state ───────────────────────────────────────────────────
  useEffect(() => {
    if (!routeId) { setMissing(false); return; }
    if (result) return;
    const stored = readInvestigation(routeId);
    if (stored) {
      hydrate(stored);
      setFollowups(stored.followups ?? []);
      setMissing(false);
      return;
    }
    // Not in sessionStorage — try Firestore (saved investigations).
    if (user?.uid && wid) {
      let cancelled = false;
      loadInvestigation(user.uid, wid, routeId)
        .then((r) => {
          if (cancelled) return;
          if (r) {
            hydrate(r);
            setFollowups(r.followups ?? []);
            writeInvestigation(routeId, r); // warm sessionStorage cache
            setSavedState('saved');
            setMissing(false);
          } else if (!busy) {
            const stillIdle = steps.every((s) => s.state === 'pending');
            if (stillIdle) setMissing(true);
          }
        })
        .catch(() => {
          if (!cancelled && !busy) setMissing(true);
        });
      return () => { cancelled = true; };
    } else if (!busy) {
      const stillIdle = steps.every((s) => s.state === 'pending');
      if (stillIdle) setMissing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, user?.uid, wid]);

  // ── Persist + bump recent rail ────────────────────────────────────────
  useEffect(() => {
    if (result && routeId) {
      writeInvestigation(routeId, result);
      setRecentTick((t) => t + 1);
    }
  }, [result, routeId]);

  // Reset toolbar UI when a fresh investigation loads
  useEffect(() => {
    setRefineOpen(false);
    setHidden(new Set());
    setFollowups([]);
    setSavedState('idle');
  }, [routeId]);

  // When the hook produces a fresh result, take its followups (empty array
  // for a fresh run, populated array when we hydrated from a saved doc).
  useEffect(() => {
    if (!result) return;
    if (result.followups && followups.length === 0) {
      setFollowups(result.followups);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.completedAt]);

  // ── Actions ────────────────────────────────────────────────────────────
  const submit = useCallback((q: string) => {
    const id = newInvestigationId();
    setMissing(false);
    navigate(`/research/i/${id}`, { replace: false });
    run(q);
  }, [navigate, run]);

  const submitQuickBuild = useCallback((plan: ResearchPlan, query: string) => {
    const id = newInvestigationId();
    setMissing(false);
    navigate(`/research/i/${id}`, { replace: false });
    run(query, { plan });
  }, [navigate, run]);

  const back = useCallback(() => { navigate('/research'); }, [navigate]);

  const edit = useCallback(() => {
    const q = result?.query ?? '';
    navigate('/research', { state: { prefillQuery: q } });
  }, [navigate, result]);

  const newInvestigation = useCallback(() => {
    reset();
    navigate('/research');
  }, [navigate, reset]);

  const applyRefinedPlan = useCallback((nextPlan: ResearchPlan) => {
    if (!result) return;
    const id = newInvestigationId();
    setMissing(false);
    navigate(`/research/i/${id}`, { replace: false });
    run(result.query, { plan: nextPlan });
  }, [navigate, run, result]);

  const setLookback = useCallback((years: number) => {
    if (!result) return;
    applyRefinedPlan({
      ...result.plan,
      timeframe: { start: null, end: null, lookbackYears: years },
    });
  }, [applyRefinedPlan, result]);

  const openInvestigation = useCallback((id: string) => {
    setMissing(false);
    navigate(`/research/i/${id}`);
  }, [navigate]);

  // ── Save to Firestore ─────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!routeId || !result || !user?.uid || !wid) return;
    setSavedState('saving');
    try {
      const enriched: ResearchResult = { ...result, followups };
      await saveInvestigation(user.uid, wid, routeId, enriched);
      setSavedState('saved');
      setRecentTick((t) => t + 1);
    } catch {
      setSavedState('error');
    }
  }, [routeId, result, user?.uid, wid, followups]);

  // ── Follow-up Q&A ─────────────────────────────────────────────────────
  const handleAskFollowup = useCallback(async (question: string) => {
    if (!result) return;
    const userTurn: FollowupTurn = {
      id: `f_${Date.now().toString(36)}`,
      question,
      answer: '',
      ts: Date.now(),
    };
    setFollowupBusy(true);
    try {
      const answer = await askFollowup({
        question,
        query: result.query,
        plan: result.plan,
        observations: result.observations,
        priorTurns: followups.map((t) => ({ question: t.question, answer: t.answer })),
      });
      const next = [...followups, { ...userTurn, answer }];
      setFollowups(next);
      // Persist back to sessionStorage and Firestore (if previously saved)
      if (routeId) {
        const enriched: ResearchResult = { ...result, followups: next };
        writeInvestigation(routeId, enriched);
        if (savedState === 'saved' && user?.uid && wid) {
          saveInvestigation(user.uid, wid, routeId, enriched).catch(() => {});
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Follow-up failed';
      setFollowups([...followups, { ...userTurn, answer: `(could not answer: ${msg})` }]);
    } finally {
      setFollowupBusy(false);
    }
  }, [result, followups, routeId, savedState, user?.uid, wid]);

  // ── Widget visibility ─────────────────────────────────────────────────
  // Only surface widgets that have data on this run.
  const availableWidgets = useMemo((): WidgetId[] => {
    if (!result) return [];
    const out: WidgetId[] = [];
    if ((result.regimeMetrics ?? []).length > 0) out.push('regimes');
    if (result.analytics.performance.length) out.push('performance');
    if (result.assets.length > 0) out.push('normalized');
    if (result.analytics.drawdowns.length) out.push('drawdown');
    if (result.rollingCorrelations.length > 0) out.push('rolling');
    if (result.analytics.rollingVols.some((rv) => rv.series.length > 0)) out.push('rollingvol');
    if (result.analytics.annualReturns.length > 0) out.push('annual');
    if (result.analytics.distributions.some((d) => d.buckets.length > 0)) out.push('distribution');
    if (result.analytics.corrMatrix) out.push('correlation');
    if (result.analytics.performance.length >= 1) out.push('scatter');
    out.push('reasoning');
    out.push('observations');
    out.push('followups');
    return out;
  }, [result]);

  const widgetEntries: WidgetEntry[] = useMemo(
    () => ALL_WIDGETS
      .filter((w) => availableWidgets.includes(w.id))
      .map((w) => ({ id: w.id, label: w.label, visible: !hidden.has(w.id) })),
    [hidden, availableWidgets],
  );
  const toggleWidget = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id as WidgetId)) next.delete(id as WidgetId); else next.add(id as WidgetId);
      return next;
    });
  }, []);
  const resetWidgets = useCallback(() => setHidden(new Set()), []);
  const isVisible = (id: WidgetId) => availableWidgets.includes(id) && !hidden.has(id);

  // ── Render ─────────────────────────────────────────────────────────────
  const landing = !routeId;

  const resultActions = result ? (
    <ResultToolbar
      lookbackYears={result.plan.timeframe.lookbackYears}
      onLookbackChange={setLookback}
      onRefine={() => setRefineOpen((v) => !v)}
      refineDirty={refineOpen}
      editWidgetsSlot={
        <WidgetVisibilityMenu
          entries={widgetEntries}
          onToggle={toggleWidget}
          onReset={resetWidgets}
        />
      }
      onBack={back}
      onEditQuery={edit}
      onNew={newInvestigation}
      onSave={handleSave}
      saveDisabled={!user?.uid || !wid || savedState === 'saving'}
      saveState={savedState}
    />
  ) : null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 64px' }}>
      <PageHeader
        title={landing ? 'Historical Research' : 'Investigation'}
        subtitle={landing
          ? 'Ask a historical question or build one structurally — the workspace retrieves price history, computes a full performance picture, and generates grounded commentary.'
          : (result?.query ? `“${result.query}”` : 'Loading investigation…')}
        actions={landing ? <LandingToolbar /> : resultActions}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {landing && (
          <>
            <InputModeSwitch mode={inputMode} onChange={setInputMode} />
            {inputMode === 'nl'
              ? <CommandBar busy={busy} onSubmit={submit} initial={initialQuery} />
              : <QuickBuild busy={busy} onSubmit={submitQuickBuild} />}
            <RecentRail onOpen={openInvestigation} refreshKey={recentTick} />
            {inputMode === 'nl' && <EmptyState onPick={submit} />}
          </>
        )}

        {!landing && (
          <>
            {missing && !busy && !result && (
              <MissingPanel onBack={back} />
            )}

            {(busy || result) && (
              <ProgressTrace
                steps={steps}
                busy={busy}
                totalElapsedMs={result?.totalElapsedMs}
                defaultExpanded={busy}
              />
            )}

            {error && !busy && (
              <ErrorPanel message={error} />
            )}

            {result && (
              <>
                <KpiRow result={result} />

                {result.dataWindow.shortfall && (
                  <DataCoverageNote w={result.dataWindow} />
                )}

                <RefinePanel
                  plan={result.plan}
                  busy={busy}
                  open={refineOpen}
                  onOpenChange={setRefineOpen}
                  onApply={applyRefinedPlan}
                />

                {isVisible('regimes') && (result.regimeMetrics ?? []).length > 0 && (
                  <Widget
                    title="Regime comparison"
                    info="Per-regime slice of the analysis. The planner extracted these windows from your question — each row shows how each asset behaved during that exact period, plus the in-window correlation."
                    caption={`${(result.regimeMetrics ?? []).length} regime${(result.regimeMetrics ?? []).length === 1 ? '' : 's'} · ${result.assets.length} asset${result.assets.length === 1 ? '' : 's'}`}
                    menuItems={[
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('regimes') },
                    ]}
                  >
                    <RegimeTable
                      regimes={result.regimeMetrics ?? []}
                      symbols={result.assets.map((a) => a.symbol)}
                    />
                  </Widget>
                )}

                {isVisible('performance') && (
                  <Widget
                    title="Performance summary"
                    info="Per-asset risk and return statistics computed over the analysis window: total return, CAGR, annualised vol, Sharpe, Sortino, max drawdown, Calmar, skew and excess kurtosis."
                    caption={`${result.analytics.performance.length} asset${result.analytics.performance.length === 1 ? '' : 's'} · daily returns`}
                    menuItems={[
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('performance') },
                    ]}
                  >
                    <PerformanceTable rows={result.analytics.performance} />
                  </Widget>
                )}

                {isVisible('normalized') && result.assets.length > 0 && (
                  <Widget
                    title="Normalized history"
                    info="Each series rebased to 100 at the start of the window. Compare slopes, not absolute levels. Shaded bands mark NBER recessions; drag the brush at the bottom to zoom."
                    legend={result.assets.map<LegendChip>((a, i) => ({
                      label: a.symbol,
                      color: seriesColor(i),
                    }))}
                    menuItems={[
                      { id: 'copy', label: 'Copy CSV', icon: <Copy size={12} />, onSelect: () => copyAssetsCsv(result.assets) },
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('normalized') },
                    ]}
                  >
                    <NormalizedChart assets={result.assets} />
                  </Widget>
                )}

                {isVisible('drawdown') && (
                  <Widget
                    title="Drawdown"
                    info="Percentage below running peak for each asset. Synchronized with the Normalized chart — hover anywhere to align all time-series."
                    legend={result.analytics.drawdowns.map<LegendChip>((d, i) => ({
                      label: d.symbol,
                      color: seriesColor(i),
                    }))}
                    menuItems={[
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('drawdown') },
                    ]}
                  >
                    <DrawdownChart drawdowns={result.analytics.drawdowns} />
                  </Widget>
                )}

                {isVisible('rolling') && result.rollingCorrelations.length > 0 && (
                  <Widget
                    title="Rolling relationship"
                    info="60-bar rolling Pearson correlation of daily returns between the primary asset and each comparison series. Synchronized with other time-series widgets."
                    kpi={kpiForRolling(result.rollingCorrelations[0])}
                    menuItems={[
                      { id: 'copy', label: 'Copy CSV', icon: <Copy size={12} />, onSelect: () => copyRollingCsv(result.rollingCorrelations) },
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('rolling') },
                    ]}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {result.rollingCorrelations.map((rc) => (
                        <RollingCorrelationChart key={`${rc.a}-${rc.b}`} corr={rc} />
                      ))}
                    </div>
                  </Widget>
                )}

                {isVisible('rollingvol') && (
                  <Widget
                    title="Rolling volatility"
                    info="60-bar annualised volatility (standard deviation of daily returns × √252). Synchronized with other time-series."
                    legend={result.analytics.rollingVols.map<LegendChip>((rv, i) => ({
                      label: rv.symbol,
                      color: seriesColor(i),
                    }))}
                    menuItems={[
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('rollingvol') },
                    ]}
                  >
                    <RollingVolChart rollingVols={result.analytics.rollingVols} />
                  </Widget>
                )}

                {isVisible('annual') && (
                  <Widget
                    title="Annual returns"
                    info="Calendar-year P&L per asset, computed from first-to-last close in each year."
                    menuItems={[
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('annual') },
                    ]}
                  >
                    <AnnualReturnsChart
                      rows={result.analytics.annualReturns}
                      symbols={result.assets.map((a) => a.symbol)}
                    />
                  </Widget>
                )}

                <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
                  {isVisible('distribution') && (
                    <Widget
                      title="Return distribution"
                      info="Histogram of daily simple returns. Solid dashed line marks the mean; dotted lines mark ±1 standard deviation."
                      menuItems={[
                        { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('distribution') },
                      ]}
                    >
                      <DistributionChart distributions={result.analytics.distributions} />
                    </Widget>
                  )}

                  {isVisible('scatter') && result.analytics.performance.length >= 1 && (
                    <Widget
                      title="Risk vs return"
                      info="Each asset positioned by annualised volatility (x) and CAGR (y). The benchmark, when set, is labelled."
                      menuItems={[
                        { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('scatter') },
                      ]}
                    >
                      <RiskReturnScatter
                        rows={result.analytics.performance}
                        benchmark={result.plan.benchmark}
                      />
                    </Widget>
                  )}
                </div>

                {isVisible('correlation') && result.analytics.corrMatrix && (
                  <Widget
                    title="Correlation matrix"
                    info="Pairwise Pearson correlation of daily returns across all assets. Computed on the intersection of available bar timestamps."
                    caption={`${result.analytics.corrMatrix.symbols.length}×${result.analytics.corrMatrix.symbols.length} matrix · ${result.analytics.corrMatrix.sampleSize.toLocaleString()} bars`}
                    menuItems={[
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('correlation') },
                    ]}
                  >
                    <CorrelationMatrixWidget matrix={result.analytics.corrMatrix} />
                  </Widget>
                )}

                <div style={{
                  display: 'grid',
                  gap: 16,
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)',
                }}>
                  {isVisible('reasoning') && (
                    <Widget
                      title="Historical reasoning"
                      info="Short institutional commentary. Numbers are pulled from the observations panel; the model never invents a value."
                      menuItems={[
                        { id: 'copy', label: 'Copy text', icon: <Copy size={12} />, onSelect: () => navigator.clipboard?.writeText(result.narrative).catch(() => {}) },
                        { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('reasoning') },
                      ]}
                    >
                      <ReasoningPanel narrative={result.narrative} />
                    </Widget>
                  )}
                  {isVisible('observations') && (
                    <Widget
                      title="Observations"
                      info="The numeric facts passed to the reasoning model. If a value isn't here, the narrative cannot mention it."
                      caption={`${result.observations.length} grounded facts`}
                      menuItems={[
                        { id: 'copy', label: 'Copy values', icon: <Copy size={12} />, onSelect: () => copyObservationsCsv(result.observations) },
                        { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('observations') },
                      ]}
                    >
                      <ObservationsList items={result.observations} />
                    </Widget>
                  )}
                </div>

                {isVisible('followups') && (
                  <Widget
                    title="Follow-ups"
                    info="Ask grounded follow-up questions about this investigation. The model can only cite numbers that appear in the Observations panel above."
                    caption={`${followups.length} turn${followups.length === 1 ? '' : 's'}`}
                    menuItems={[
                      { id: 'hide', label: 'Hide widget', icon: <EyeOff size={12} />, onSelect: () => toggleWidget('followups') },
                    ]}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <FollowUpThread turns={followups} busy={followupBusy} />
                      <FollowUpInput
                        busy={followupBusy}
                        onAsk={handleAskFollowup}
                        starters={followups.length === 0 ? followupStarters(result) : undefined}
                      />
                    </div>
                  </Widget>
                )}

              </>
            )}
          </>
        )}

        <Disclaimer />
      </div>
    </div>
  );
};

function followupStarters(r: ResearchResult): string[] {
  const out: string[] = [];
  const a0 = r.assets[0]?.symbol;
  const a1 = r.assets[1]?.symbol;
  if ((r.regimeMetrics ?? []).length >= 2 && a0) {
    out.push(`Which regime was worst for ${a0}?`);
  } else if (a0) {
    out.push(`What drove ${a0}'s deepest drawdown?`);
  }
  if (a0 && a1) out.push(`When did ${a0} and ${a1} decouple most?`);
  if (r.rollingCorrelations.length > 0) out.push('What did the correlation do during crisis windows?');
  return out.slice(0, 3);
}

// ─── kpi helpers ─────────────────────────────────────────────────────────

function kpiForRolling(rc: RollingCorrelation) {
  const series = rc.series;
  if (series.length < 2) {
    return { value: rc.overall.toFixed(2), sublabel: 'full-window r' };
  }
  const last = series[series.length - 1].r;
  const ref = series[Math.max(0, series.length - 21)].r;
  const dir = last > ref ? 'up' : last < ref ? 'down' : 'flat';
  return {
    value: last.toFixed(2),
    delta: { value: `from ${ref.toFixed(2)}`, direction: dir as 'up' | 'down' | 'flat' },
    sublabel: `${rc.a}/${rc.b} latest`,
  };
}

// ─── CSV helpers ─────────────────────────────────────────────────────────

function copyAssetsCsv(assets: AssetSeries[]): void {
  if (!assets.length) return;
  const tsSet = new Set<number>();
  assets.forEach((a) => a.normalized.forEach((p) => tsSet.add(p.ts)));
  const tss = Array.from(tsSet).sort((a, b) => a - b);
  const header = ['timestamp', 'date', ...assets.map((a) => a.symbol)].join(',');
  const lookups = assets.map((a) => new Map(a.normalized.map((p) => [p.ts, p.v])));
  const lines = tss.map((ts) => {
    const d = new Date(ts).toISOString().slice(0, 10);
    const cells = lookups.map((m) => {
      const v = m.get(ts);
      return v != null ? v.toFixed(4) : '';
    });
    return [ts, d, ...cells].join(',');
  });
  navigator.clipboard?.writeText([header, ...lines].join('\n')).catch(() => {});
}

function copyRollingCsv(corrs: RollingCorrelation[]): void {
  if (!corrs.length) return;
  const lines: string[] = ['timestamp,date,pair,r'];
  for (const rc of corrs) {
    const pair = `${rc.a}/${rc.b}`;
    for (const p of rc.series) {
      const d = new Date(p.ts).toISOString().slice(0, 10);
      lines.push(`${p.ts},${d},${pair},${p.r.toFixed(4)}`);
    }
  }
  navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
}

function copyObservationsCsv(obs: { label: string; value: string | number; period?: string }[]): void {
  if (!obs.length) return;
  const lines = ['label,value,period'];
  for (const o of obs) {
    lines.push(`"${o.label.replace(/"/g, '""')}","${String(o.value).replace(/"/g, '""')}","${o.period ?? ''}"`);
  }
  navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
}

// ─── small inline components ─────────────────────────────────────────────

const DataCoverageNote: React.FC<{ w: ResearchResult['dataWindow'] }> = ({ w }) => {
  const ratio = Math.max(0, Math.min(1, w.requestedYears > 0 ? w.actualYears / w.requestedYears : 1));
  return (
    <div style={{
      padding: '12px 14px',
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: 'var(--muted)',
      color: 'var(--muted-foreground)',
      fontSize: 12,
      lineHeight: 1.55,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Info size={14} style={{ marginTop: 2, flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
          color: 'var(--foreground)', marginBottom: 4,
        }}>
          Data coverage · {w.actualYears.toFixed(1)} of {w.requestedYears} years
        </div>
        Daily history from current providers reaches ~20 years for US ETFs.
        Analysis covers <strong style={{ color: 'var(--foreground)' }}>{w.actualStart} → {w.actualEnd}</strong>;
        conclusions below describe that window only.
        <div style={{ marginTop: 8, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${ratio * 100}%`, height: '100%', background: 'var(--primary)', opacity: 0.75 }} />
        </div>
      </div>
    </div>
  );
};

const ErrorPanel: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    padding: '12px 16px',
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--card)',
    color: 'var(--foreground)',
    fontSize: 13,
  }}>
    <div style={{
      fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
      color: 'var(--muted-foreground)', marginBottom: 4,
    }}>Could not complete investigation</div>
    {message}
  </div>
);

const MissingPanel: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div style={{
    padding: '14px 16px',
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--card)',
    color: 'var(--muted-foreground)',
    fontSize: 13,
  }}>
    <div style={{
      fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
      marginBottom: 4,
    }}>Investigation not found</div>
    This investigation isn't available in your current session. Start a new one to continue.
    <div style={{ marginTop: 10 }}>
      <button
        onClick={onBack}
        style={{
          padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
          background: 'transparent', color: 'var(--foreground)', cursor: 'pointer', fontSize: 12,
        }}
      >Go to landing</button>
    </div>
  </div>
);
