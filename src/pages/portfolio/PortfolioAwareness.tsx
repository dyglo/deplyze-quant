/**
 * PortfolioAwareness — institutional reflective workspace.
 *
 * Bloomberg-PORT-inspired layout. Sections in vertical order:
 *
 *   1. Hero          (sparkline + KPI strip + chips)
 *   2. ReturnDecomp  (sector donut + Top/Bottom contributors)
 *   3. RiskDecomp    (Risk KPIs + Risk-by-Sector + Per-holding stress + Macro)
 *   4. CausalTimeline
 *   5. HistoricalScenarios (analog grid)
 *   6. RelationshipShifts
 *   7. Disclaimer
 *
 * Reachable only via the subtle "Portfolio Awareness →" entry button in
 * `PortfolioOverview` when the feature flag is enabled. Not a sidebar item.
 */

import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioPerformance } from '../../hooks/usePortfolioPerformance';
import { usePortfolioVulnerability } from '../../hooks/useAgentReasoning';
import { useSectorMetadata } from '../../hooks/useSectorMetadata';
import { useUserProfile } from '../../hooks/usePersonalization';
import { DEFAULT_BENCHMARK_ID } from '../../lib/portfolio/benchmarks';
import { isAwarenessWorkspaceEnabled } from '../../lib/portfolio/awarenessFlag';
import { logReturns, computePositionMetrics, correlation } from '../../lib/portfolio/holdingAnalytics';
import {
  contributionByHolding,
  contributionBySector,
} from '../../lib/portfolio/awarenessAttribution';
import { computeClientStress } from '../../lib/portfolio/clientStress';
import { buildMonitorProbes } from '../../lib/portfolio/monitorNext';
import {
  narrateHero,
  narrateReturnDecomposition,
  narrateRiskDecomposition,
  narratePositionActivity,
  narrateCorrelationProfile,
} from '../../lib/portfolio/sectionNarratives';
import {
  deriveTone,
  applyTone,
  type AwarenessDepth,
  type AwarenessTone,
} from '../../lib/portfolio/awarenessTone';
import { buildSnapshotPayload } from '../../lib/portfolio/snapshotPayload';
import { useAwarenessSnapshot } from '../../hooks/useAwarenessSnapshot';
import { AwarenessHero } from '../../components/portfolio/awareness/AwarenessHero';
import { AwarenessSnapshotControl } from '../../components/portfolio/awareness/AwarenessSnapshotControl';
import { AwarenessToneProvider } from '../../components/portfolio/awareness/AwarenessToneContext';
import { AwarenessToneControl } from '../../components/portfolio/awareness/AwarenessToneControl';
import { ReturnDecomposition } from '../../components/portfolio/awareness/ReturnDecomposition';
import { RiskDecomposition } from '../../components/portfolio/awareness/RiskDecomposition';
import { PositionActivity } from '../../components/portfolio/awareness/PositionActivity';
import { PerformanceDistribution } from '../../components/portfolio/awareness/PerformanceDistribution';
import { CorrelationProfile } from '../../components/portfolio/awareness/CorrelationProfile';
import { MonitorNext } from '../../components/portfolio/awareness/MonitorNext';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { logPageView, logOpen } from '../../lib/telemetry';

export const PortfolioAwareness: React.FC = () => {
  const params = useParams<{ portfolioId: string }>();
  const navigate = useNavigate();
  const portfolioId = params.portfolioId ?? '';

  const { portfolios, holdings, loading, effectiveWeights } = usePortfolioWorkspace();
  const portfolio = useMemo(
    () => portfolios.find(p => p.id === portfolioId) ?? null,
    [portfolios, portfolioId],
  );
  const portfolioHoldings = useMemo(
    () => (portfolio ? holdings.filter(h => h.portfolioId === portfolio.id) : []),
    [portfolio, holdings],
  );
  const symbols = useMemo(() => portfolioHoldings.map(h => h.symbol), [portfolioHoldings]);
  const benchmarkId = portfolio?.benchmarkId ?? DEFAULT_BENCHMARK_ID;

  const {
    holdingCurves, totalReturn, benchmarkTotalReturn,
    annVol, sharpe, maxDrawdown, performanceSeries,
  } = usePortfolioPerformance(symbols, effectiveWeights, benchmarkId, 252);


  const vulnerabilityHoldings = useMemo(
    () => portfolioHoldings.map(h => ({
      symbol: h.symbol,
      weight: effectiveWeights[h.symbol] ?? 0,
      asset_class: h.assetClass,
    })),
    [portfolioHoldings, effectiveWeights],
  );
  const { data: vulnerability, loading: vulnerabilityLoading } =
    usePortfolioVulnerability(vulnerabilityHoldings, portfolio?.id);

  const { bySymbol: sectorBySymbol, loading: sectorLoading } = useSectorMetadata(symbols);

  /** Benchmark log-return series, derived from the rebased performanceSeries
   *  produced by usePortfolioPerformance. Re-used by PositionActivity,
   *  PerformanceDistribution, and CorrelationProfile so we don't refetch. */
  const benchLogReturns = useMemo(() => {
    const benchValues = performanceSeries.map(p => p.benchmark).filter(v => v > 0 && isFinite(v));
    return logReturns(benchValues);
  }, [performanceSeries]);

  const holdingsCount = portfolioHoldings.length;

  // ── P3.5 backend synthesis snapshot ────────────────────────────────────────
  // Aggregates lifted to page level so the snapshot payload mirrors what the
  // user sees. Each useMemo reuses the same primitives the section components
  // call internally — the duplication is intentional and cheap.

  const positions = useMemo(
    () => computePositionMetrics(symbols, effectiveWeights, holdingCurves, benchLogReturns),
    [symbols, effectiveWeights, holdingCurves, benchLogReturns],
  );

  const contributors = useMemo(() => {
    const rows = contributionByHolding(portfolioHoldings, effectiveWeights, holdingCurves);
    const top = rows.filter(r => r.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution);
    const bottom = rows.filter(r => r.contribution < 0)
      .sort((a, b) => a.contribution - b.contribution);
    return { top, bottom };
  }, [portfolioHoldings, effectiveWeights, holdingCurves]);

  const sectorRows = useMemo(() => {
    const rows = contributionBySector(
      portfolioHoldings.map(h => ({
        ...h,
        sector: h.sector || sectorBySymbol[h.symbol]?.sector || undefined,
      })),
      effectiveWeights,
      holdingCurves,
    );
    return rows.map(r => ({
      sector: r.label,
      weight: r.weight,
      contribution: r.contribution,
      members: r.count,
    }));
  }, [portfolioHoldings, effectiveWeights, holdingCurves, sectorBySymbol]);

  const clientStress = useMemo(
    () => computeClientStress(portfolioHoldings, effectiveWeights, holdingCurves),
    [portfolioHoldings, effectiveWeights, holdingCurves],
  );

  const hhi = useMemo(() => {
    const ws = portfolioHoldings.map(h => effectiveWeights[h.symbol] ?? 0).filter(w => w > 0);
    return ws.reduce((s, w) => s + w * w, 0);
  }, [portfolioHoldings, effectiveWeights]);

  const sectorRiskRows = useMemo(() => {
    const total = sectorRows.reduce((s, r) => s + Math.abs(r.contribution ?? 0), 0);
    return sectorRows
      .map(r => ({
        sector: r.sector,
        weight: r.weight,
        contribPct: total > 0 ? Math.abs(r.contribution ?? 0) / total : 0,
      }))
      .sort((a, b) => b.contribPct - a.contribPct);
  }, [sectorRows]);

  // ── Personalization tone (P4) ──────────────────────────────────────────────
  const { data: profile } = useUserProfile();
  const initialTone = useMemo<AwarenessTone>(() => deriveTone(profile), [profile]);
  const [depth, setDepth] = React.useState<AwarenessDepth>(initialTone.depth);
  React.useEffect(() => { setDepth(initialTone.depth); }, [initialTone.depth]);
  const tone: AwarenessTone = useMemo(
    () => ({ depth, posture: initialTone.posture }),
    [depth, initialTone.posture],
  );
  const onDepthChange = React.useCallback((d: AwarenessDepth) => {
    setDepth(d);
    try { window.localStorage.setItem('deplyze.awareness.depth', d); } catch { /* ignore */ }
  }, []);

  // ── Monitor probes at page level (for snapshot + future surfacing) ────────
  const sectorWeights = useMemo(
    () => sectorRows.map(r => ({ sector: r.sector, weight: r.weight, memberCount: r.members ?? 0 })),
    [sectorRows],
  );
  const meanIntraCorr = useMemo(() => {
    const ps = positions.filter(p => p.logRets.length > 10);
    if (ps.length < 2) return 0;
    let acc = 0, n = 0;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const c = correlation(ps[i].logRets, ps[j].logRets);
        if (isFinite(c)) { acc += c; n += 1; }
      }
    }
    return n > 0 ? acc / n : 0;
  }, [positions]);

  const monitorProbes = useMemo(
    () => buildMonitorProbes({
      positions,
      sectorBySymbol,
      sectorWeights,
      vulnerability,
      meanIntraCorr,
      benchmarkId: portfolio?.benchmarkId,
    }),
    [positions, sectorBySymbol, sectorWeights, vulnerability, meanIntraCorr, portfolio?.benchmarkId],
  );

  // ── Narrative lines for snapshot payload ──────────────────────────────────
  const narrativeLines = useMemo<Record<string, string[]>>(() => {
    const heroLines = narrateHero({
      portfolioName: portfolio?.name,
      totalReturn,
      benchmarkTotalReturn,
      benchmarkId: portfolio?.benchmarkId,
      sharpe,
      maxDrawdown,
      observationCount: 0,
      regimeLabel: null,
      riskLevel: null,
    });
    const retLines = narrateReturnDecomposition({
      totalReturn,
      benchmarkTotalReturn,
      benchmarkId: portfolio?.benchmarkId,
      holdingRows: [...contributors.top, ...contributors.bottom],
      sectorRows: sectorRows.map(r => ({
        key: r.sector, label: r.sector,
        weight: r.weight, contribution: r.contribution ?? 0, count: r.members ?? 0,
      })),
    });
    const riskLines = narrateRiskDecomposition({
      annVol,
      maxDrawdown,
      hhi,
      holdingsCount: portfolioHoldings.length,
      stressedCount: clientStress.rows.filter(r => r.count >= 2).length,
      topSectorRiskShare: sectorRiskRows[0]
        ? { sector: sectorRiskRows[0].sector, share: sectorRiskRows[0].contribPct }
        : undefined,
      vulnerability,
    });
    const posLines = narratePositionActivity({ positions, benchmarkId: portfolio?.benchmarkId });
    const corrLines = narrateCorrelationProfile({
      positions, benchmarkId: portfolio?.benchmarkId, meanIntraCorr,
    });
    const toLines = (xs: Array<{ text: string }>) => applyTone(xs, tone).map(l => l.text);
    return {
      hero: toLines(heroLines),
      return_decomposition: toLines(retLines),
      risk_decomposition: toLines(riskLines),
      position_activity: toLines(posLines),
      correlation_profile: toLines(corrLines),
    };
  }, [
    portfolio?.name, portfolio?.benchmarkId, totalReturn, benchmarkTotalReturn,
    sharpe, maxDrawdown, contributors, sectorRows, annVol, hhi, portfolioHoldings.length,
    clientStress, sectorRiskRows, vulnerability, positions, meanIntraCorr, tone,
  ]);

  const { snapshot, loading: snapLoading, snapshotting, error: snapError, persist } =
    useAwarenessSnapshot(portfolio?.id);

  const onSnapshot = React.useCallback(() => {
    if (!portfolio) return;
    const payload = buildSnapshotPayload({
      benchmarkId: portfolio.benchmarkId,
      uid: profile ? undefined : undefined,
      totalReturn,
      benchmarkTotalReturn,
      annVol,
      sharpe,
      maxDrawdown,
      positions,
      contributorsTop: contributors.top,
      contributorsBottom: contributors.bottom,
      sectorRows,
      hhi,
      stressedCount: clientStress.rows.filter(r => r.count >= 2).length,
      holdingStress: clientStress.rows,
      sectorRisk: sectorRiskRows,
      clientStressDimensions: clientStress.dimensions,
      monitorProbes,
      narrativeLines,
    });
    void persist(payload);
  }, [
    portfolio, profile, totalReturn, benchmarkTotalReturn, annVol, sharpe, maxDrawdown,
    positions, contributors, sectorRows, hhi, clientStress, sectorRiskRows,
    monitorProbes, narrativeLines, persist,
  ]);

  useEffect(() => {
    logPageView('portfolio_awareness', { portfolio_id: portfolioId });
    logOpen({ category: 'portfolio', placement: 'portfolio_awareness', entity_id: portfolioId });
  }, [portfolioId]);

  // Feature flag gate. Soft 404 (redirect to overview) when off.
  if (!isAwarenessWorkspaceEnabled()) {
    return <Navigate to="/portfolio/overview" replace />;
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 32px', color: 'var(--muted-foreground)', fontSize: 12 }}>
        Loading portfolio…
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div style={{ padding: '40px 32px', maxWidth: 720 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--foreground)', fontWeight: 600 }}>
          Portfolio not found.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
          The portfolio you are trying to view awareness for is not available in this workspace.
        </p>
        <button
          onClick={() => navigate('/portfolio/overview')}
          style={{
            marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 11px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--foreground)', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={12} /> Back to Portfolio Overview
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 64 }}>
      {/* Back affordance — minimal, top-left */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <button
          onClick={() => navigate('/portfolio/overview')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted-foreground)', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={11} /> Portfolio Overview
        </button>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <AwarenessToneControl depth={tone.depth} onChange={onDepthChange} />
          <AwarenessSnapshotControl
            snapshot={snapshot}
            loading={snapLoading}
            snapshotting={snapshotting}
            error={snapError}
            onSnapshot={onSnapshot}
          />
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.7,
          }}>
            <Sparkles size={10} /> Awareness Workspace
          </span>
        </div>
      </div>

      <AwarenessToneProvider tone={tone}>
      <AwarenessHero
        portfolioId={portfolio.id}
        portfolioName={portfolio.name}
        holdingsCount={holdingsCount}
        benchmarkId={portfolio.benchmarkId}
        metrics={{
          totalReturn,
          benchmarkTotalReturn,
          annVol,
          sharpe,
          maxDrawdown,
        }}
      />

      <ReturnDecomposition
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingCurves={holdingCurves}
        sectorBySymbol={sectorBySymbol}
        totalReturn={totalReturn}
        benchmarkTotalReturn={benchmarkTotalReturn}
        benchmarkId={portfolio.benchmarkId}
        periodLabel="1Y"
        loadingSectors={sectorLoading}
      />

      <RiskDecomposition
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingCurves={holdingCurves}
        sectorBySymbol={sectorBySymbol}
        vulnerability={vulnerability}
        vulnerabilityLoading={vulnerabilityLoading}
        annVol={annVol}
        maxDrawdown={maxDrawdown}
      />

      <PositionActivity
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingCurves={holdingCurves}
        benchLogReturns={benchLogReturns}
        benchmarkId={portfolio.benchmarkId}
      />

      <PerformanceDistribution
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingCurves={holdingCurves}
        sectorBySymbol={sectorBySymbol}
        benchLogReturns={benchLogReturns}
        totalPortfolioReturn={totalReturn}
      />

      <CorrelationProfile
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingCurves={holdingCurves}
        benchLogReturns={benchLogReturns}
        benchmarkId={portfolio.benchmarkId}
      />

      <MonitorNext
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingCurves={holdingCurves}
        benchLogReturns={benchLogReturns}
        sectorBySymbol={sectorBySymbol}
        vulnerability={vulnerability}
        benchmarkId={portfolio.benchmarkId}
      />

      <div style={{ maxWidth: 1180, margin: '40px auto 0', padding: '0 32px' }}>
        <Disclaimer />
      </div>
      </AwarenessToneProvider>
    </div>
  );
};
