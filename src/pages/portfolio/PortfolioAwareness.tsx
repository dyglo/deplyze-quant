/**
 * PortfolioAwareness — institutional reflective workspace.
 *
 * P0 shell: route, page chrome, AwarenessHero. Future phases add Driver
 * Decomposition, Causal Timeline, Emerging Risks, Relationship Shifts,
 * Historical Context, Narrative & Exposure, and Monitor Next.
 *
 * Reachable only via the subtle "Portfolio Awareness →" entry button in
 * `PortfolioOverview` when the feature flag is enabled. Not a sidebar item.
 */

import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioPerformance } from '../../hooks/usePortfolioPerformance';
import { usePortfolioAgentOutputs } from '../../hooks/useAgentIntelligence';
import {
  useHistoricalAnalog,
  usePortfolioVulnerability,
  useNarrativeExposure,
  useReasoningOutputs,
} from '../../hooks/useAgentReasoning';
import { DEFAULT_BENCHMARK_ID } from '../../lib/portfolio/benchmarks';
import { isAwarenessWorkspaceEnabled } from '../../lib/portfolio/awarenessFlag';
import { AwarenessHero } from '../../components/portfolio/awareness/AwarenessHero';
import { DriverDecomposition } from '../../components/portfolio/awareness/DriverDecomposition';
import { EmergingRiskCluster } from '../../components/portfolio/awareness/EmergingRiskCluster';
import { RelationshipShifts } from '../../components/portfolio/awareness/RelationshipShifts';
import { HistoricalAnalogContext } from '../../components/portfolio/awareness/HistoricalAnalogContext';
import { NarrativeAndExposureSection } from '../../components/portfolio/awareness/NarrativeAndExposureSection';
import { CausalTimeline } from '../../components/portfolio/awareness/CausalTimeline';
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
    annVol, sharpe, maxDrawdown,
  } = usePortfolioPerformance(symbols, effectiveWeights, benchmarkId, 252);

  const { data: portfolioAgentOutputs } = usePortfolioAgentOutputs(portfolio?.id ?? null, { days: 7, limit: 50 });

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

  const { data: narrativeExposure, loading: narrativeLoading } =
    useNarrativeExposure(symbols, effectiveWeights);

  const { data: analog, loading: analogLoading } = useHistoricalAnalog({ top_k: 3 });

  const { data: reasoningOutputs } = useReasoningOutputs();

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

      <DriverDecomposition
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingCurves={holdingCurves}
        narrativeExposure={narrativeExposure}
        totalReturn={totalReturn}
        periodLabel="1Y"
      />

      <CausalTimeline
        portfolioObservations={portfolioAgentOutputs ?? []}
        reasoningOutputs={reasoningOutputs ?? []}
      />

      <EmergingRiskCluster
        vulnerability={vulnerability}
        vulnerabilityLoading={vulnerabilityLoading}
        portfolioObservations={portfolioAgentOutputs ?? []}
        holdings={portfolioHoldings}
        effectiveWeights={effectiveWeights}
        holdingsCount={holdingsCount}
        holdingCurves={holdingCurves}
      />

      <RelationshipShifts
        portfolioObservations={portfolioAgentOutputs ?? []}
      />

      <HistoricalAnalogContext
        analog={analog}
        loading={analogLoading}
      />

      <NarrativeAndExposureSection
        result={narrativeExposure}
        loading={narrativeLoading}
      />

      <div style={{ maxWidth: 1180, margin: '40px auto 0', padding: '0 32px' }}>
        <Disclaimer />
      </div>
    </div>
  );
};
