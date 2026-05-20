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
import { DEFAULT_BENCHMARK_ID } from '../../lib/portfolio/benchmarks';
import { isAwarenessWorkspaceEnabled } from '../../lib/portfolio/awarenessFlag';
import { logReturns } from '../../lib/portfolio/holdingAnalytics';
import { AwarenessHero } from '../../components/portfolio/awareness/AwarenessHero';
import { ReturnDecomposition } from '../../components/portfolio/awareness/ReturnDecomposition';
import { RiskDecomposition } from '../../components/portfolio/awareness/RiskDecomposition';
import { PositionActivity } from '../../components/portfolio/awareness/PositionActivity';
import { PerformanceDistribution } from '../../components/portfolio/awareness/PerformanceDistribution';
import { CorrelationProfile } from '../../components/portfolio/awareness/CorrelationProfile';
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
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.7,
        }}>
          <Sparkles size={10} /> Awareness Workspace
        </span>
      </div>

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

      <div style={{ maxWidth: 1180, margin: '40px auto 0', padding: '0 32px' }}>
        <Disclaimer />
      </div>
    </div>
  );
};
