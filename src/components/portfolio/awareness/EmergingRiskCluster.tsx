/**
 * EmergingRiskCluster — frames the existing PortfolioVulnerabilityPanel and
 * portfolio-aware agent observations under a single "what's becoming
 * vulnerable" question. Calm, severity-ranked, evidence-backed.
 */

import React, { useMemo } from 'react';
import { PortfolioVulnerabilityPanel } from '../PortfolioVulnerabilityPanel';
import { IntelligenceObservationCard } from '../../quant/IntelligenceObservationCard';
import type { VulnerabilityResult, HoldingInput } from '../../../services/reasoningService';
import type { AgentOutput, AgentSeverity } from '../../../types/agents';

interface EmergingRiskClusterProps {
  vulnerability: VulnerabilityResult | null;
  vulnerabilityLoading: boolean;
  portfolioObservations: AgentOutput[];
  holdingsCount: number;
}

const SEV_ORDER: Record<AgentSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export const EmergingRiskCluster: React.FC<EmergingRiskClusterProps> = ({
  vulnerability,
  vulnerabilityLoading,
  portfolioObservations,
  holdingsCount,
}) => {
  const ranked = useMemo(() => {
    return [...portfolioObservations]
      .filter(o => (o.severity ?? 'info') !== 'info')
      .sort((a, b) => SEV_ORDER[(a.severity ?? 'info') as AgentSeverity] - SEV_ORDER[(b.severity ?? 'info') as AgentSeverity])
      .slice(0, 6);
  }, [portfolioObservations]);

  return (
    <section aria-label="Emerging risks" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Emerging Risk
          </p>
          <h2 style={{
            margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            Where the portfolio is becoming vulnerable.
          </h2>
          <p style={{
            margin: '6px 0 0', fontSize: 12, lineHeight: 1.6,
            color: 'var(--muted-foreground)', maxWidth: 720,
          }}>
            A six-dimension regime vulnerability read alongside the agent observations
            currently active for this portfolio. Reflective only — for monitoring,
            not direction.
          </p>
        </header>

        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 16, alignItems: 'start',
        }}>
          <PortfolioVulnerabilityPanel
            result={vulnerability}
            loading={vulnerabilityLoading}
            holdingsCount={holdingsCount}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ranked.length === 0 ? (
              <div style={{
                padding: '18px 16px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--card)',
                color: 'var(--muted-foreground)', fontSize: 12, lineHeight: 1.6,
              }}>
                No elevated portfolio-specific observations active in the last 7 days.
                That is itself a useful read on environment quietness.
              </div>
            ) : (
              ranked.map(o => (
                <IntelligenceObservationCard key={o.artifact_id} output={o} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
