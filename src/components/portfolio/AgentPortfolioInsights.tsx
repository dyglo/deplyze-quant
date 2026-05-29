/**
 * AgentPortfolioInsights — surfaces portfolio-aware agent observations.
 * Used in PortfolioOverview, RiskRegimeFit, and ScenarioStress.
 *
 * Shows macro, regime, risk, and portfolio-specific agent outputs.
 * Institutional design: no chatbots, no AI personalities — structured observations.
 */

import React, { useMemo } from 'react';
import { Brain, ShieldAlert, TrendingDown, Activity } from 'lucide-react';
import type { AgentOutput, AgentSeverity } from '../../types/agents';
import { usePortfolioAgentOutputs, useCompositeRegime, useRiskEnvironment } from '../../hooks/useAgentIntelligence';
import { IntelligenceObservationCard } from '../quant/IntelligenceObservationCard';
import { SystemAnalyzingState, RegimeStatusChip, RiskLevelChip } from '../quant/SystemAnalyzingState';
import { extractRegimeLabel, extractRiskLevel } from '../../services/agentService';

// ─── Portfolio intelligence section card ──────────────────────────────────────

const InsightSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div style={{
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--primary)' }}>{icon}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
        textTransform: 'uppercase', color: 'var(--foreground)',
      }}>
        {title}
      </span>
    </div>
    <div style={{ padding: '12px 14px' }}>{children}</div>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export type AgentIntelligenceFilter = 'all' | 'risk' | 'regime' | 'macro';

export const AgentPortfolioInsights: React.FC<{
  portfolioId: string | null | undefined;
  onSymbolClick?: (symbol: string) => void;
  filter?: AgentIntelligenceFilter;
}> = ({ portfolioId, onSymbolClick, filter = 'all' }) => {
  const { data: outputs, loading } = usePortfolioAgentOutputs(portfolioId);
  const { data: regimeOutput, regimeLabel, loading: regimeLoading } = useCompositeRegime();
  const { data: riskOutput, riskLevel, loading: riskLoading } = useRiskEnvironment();

  // Group outputs by priority placement
  const { riskObs, macroObs, regimeObs, otherObs } = useMemo(() => {
    return {
      riskObs:   outputs.filter(o => o.domain === 'risk').slice(0, 2),
      macroObs:  outputs.filter(o => o.domain === 'macro').slice(0, 3),
      regimeObs: outputs.filter(o => o.domain === 'regime').slice(0, 2),
      otherObs:  outputs.filter(o => !['risk', 'macro', 'regime'].includes(o.domain)).slice(0, 4),
    };
  }, [outputs]);

  const isAnyLoading = loading || regimeLoading || riskLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Regime + Risk status strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 0',
      }}>
        {isAnyLoading ? (
          <SystemAnalyzingState label="Deplyze system analyzing" compact />
        ) : (
          <>
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>
              Live Intelligence:
            </span>
            <RegimeStatusChip
              regime={regimeLabel}
              confidence={regimeOutput?.confidence ?? null}
            />
            <RiskLevelChip
              riskLevel={riskLevel}
              severity={riskOutput?.severity}
            />
          </>
        )}
      </div>

      {/* Risk observations */}
      {(filter === 'all' || filter === 'risk') && (riskObs.length > 0 || riskOutput) && (
        <InsightSection icon={<ShieldAlert size={13} />} title="Risk Environment">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {riskOutput && !riskObs.some(o => o.agent_id === 'risk_agent') && (
              <IntelligenceObservationCard
                output={riskOutput}
                compact
                onSymbolClick={onSymbolClick}
              />
            )}
            {riskObs.map(o => (
              <IntelligenceObservationCard
                key={o.artifact_id}
                output={o}
                compact
                onSymbolClick={onSymbolClick}
              />
            ))}
          </div>
        </InsightSection>
      )}

      {/* Regime observations */}
      {(filter === 'all' || filter === 'regime') && regimeObs.length > 0 && (
        <InsightSection icon={<Activity size={13} />} title="Regime Intelligence">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {regimeObs.map(o => (
              <IntelligenceObservationCard
                key={o.artifact_id}
                output={o}
                compact
                onSymbolClick={onSymbolClick}
              />
            ))}
          </div>
        </InsightSection>
      )}

      {/* Macro observations */}
      {(filter === 'all' || filter === 'macro') && macroObs.length > 0 && (
        <InsightSection icon={<Brain size={13} />} title="Macro Intelligence">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {macroObs.map(o => (
              <IntelligenceObservationCard
                key={o.artifact_id}
                output={o}
                compact
                onSymbolClick={onSymbolClick}
              />
            ))}
          </div>
        </InsightSection>
      )}

      {/* Other domain observations — only in "all" view */}
      {filter === 'all' && otherObs.length > 0 && (
        <InsightSection icon={<Activity size={13} />} title="Additional Intelligence">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {otherObs.map(o => (
              <IntelligenceObservationCard
                key={o.artifact_id}
                output={o}
                compact
                onSymbolClick={onSymbolClick}
              />
            ))}
          </div>
        </InsightSection>
      )}

      {/* Empty state */}
      {!isAnyLoading && outputs.length === 0 && !regimeOutput && !riskOutput && (
        <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>
          Observations will appear here as they’re generated.
        </p>
      )}
    </div>
  );
};
