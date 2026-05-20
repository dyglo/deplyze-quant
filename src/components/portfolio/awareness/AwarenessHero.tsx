/**
 * AwarenessHero — the first frame of the Portfolio Awareness Workspace.
 *
 * Composes existing V4 agent hooks (no new data dependencies):
 *   - useCompositeRegime  → regime label + confidence
 *   - useRiskEnvironment  → composite risk environment level
 *   - usePortfolioAgentOutputs → observation count for the selected portfolio
 *
 * Voice: institutional, second-person, reflective. All narration is routed
 * through `awarenessNarration` to enforce the no-trade-verb guardrail.
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  useCompositeRegime,
  useRiskEnvironment,
  usePortfolioAgentOutputs,
} from '../../../hooks/useAgentIntelligence';
import { RegimeStatusChip, RiskLevelChip, SystemAnalyzingState } from '../../quant/SystemAnalyzingState';
import { composeHeroHeadline, composeHeroSubNarrative } from '../../../lib/portfolio/awarenessNarration';
import type { CompositeRegime, RiskEnvironment, AgentSeverity } from '../../../types/agents';

interface AwarenessHeroProps {
  portfolioId: string;
  portfolioName?: string;
  holdingsCount?: number;
  benchmarkId?: string;
}

function asCompositeRegime(output: { evidence: Record<string, unknown> | null; confidence: number | null; generated_at: string; severity: AgentSeverity | null } | null): CompositeRegime | null {
  if (!output) return null;
  const ev = (output.evidence ?? {}) as Record<string, unknown>;
  const regime = typeof ev.regime === 'string' ? ev.regime : null;
  if (!regime) return null;
  return {
    regime,
    confidence: output.confidence ?? 0,
    severity: (output.severity ?? 'info') as AgentSeverity,
    evidence: ev,
    generated_at: output.generated_at,
  };
}

function asRiskEnvironment(output: { evidence: Record<string, unknown> | null; confidence: number | null; generated_at: string; severity: AgentSeverity | null } | null): RiskEnvironment | null {
  if (!output) return null;
  const ev = (output.evidence ?? {}) as Record<string, unknown>;
  const risk_level = typeof ev.risk_level === 'string' ? ev.risk_level : null;
  if (!risk_level) return null;
  return {
    risk_level,
    composite_score: typeof ev.composite_score === 'number' ? ev.composite_score : 0,
    domain_scores: (ev.domain_scores as Record<string, number>) ?? {},
    high_domains: (ev.high_domains as string[]) ?? [],
    confidence: output.confidence ?? 0,
    severity: (output.severity ?? 'info') as AgentSeverity,
    generated_at: output.generated_at,
  };
}

function formatFreshness(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return null;
  const ageMs = Date.now() - t;
  const ageH = ageMs / 3_600_000;
  if (ageH < 1) return 'Synthesis fresh within the last hour';
  if (ageH < 24) return `Synthesis from earlier today · ${Math.round(ageH)}h ago`;
  return `Last synthesis ${Math.round(ageH / 24)}d ago`;
}

export const AwarenessHero: React.FC<AwarenessHeroProps> = ({
  portfolioId,
  portfolioName,
  holdingsCount,
  benchmarkId,
}) => {
  const { data: regimeOutput, regimeLabel, loading: regimeLoading } = useCompositeRegime();
  const { data: riskOutput, riskLevel, loading: riskLoading } = useRiskEnvironment();
  const { data: portfolioOutputs, loading: portfolioLoading } = usePortfolioAgentOutputs(portfolioId, { days: 7, limit: 50 });

  const regime = asCompositeRegime(regimeOutput);
  const risk = asRiskEnvironment(riskOutput);
  const ctx = { portfolioName, holdingsCount, benchmarkId };

  const headline = composeHeroHeadline({ regime, risk, ctx });
  const subNarrative = composeHeroSubNarrative({ regime, risk, ctx });

  const newestTs = [regimeOutput?.generated_at, riskOutput?.generated_at]
    .filter((x): x is string => typeof x === 'string')
    .sort()
    .pop();
  const freshness = formatFreshness(newestTs ?? null);

  const observationCount = portfolioOutputs?.length ?? 0;
  const loading = regimeLoading || riskLoading || portfolioLoading;

  return (
    <section
      aria-label="Portfolio awareness summary"
      style={{
        padding: '36px 32px 28px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(180deg, var(--card) 0%, var(--background) 100%)',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Sparkles size={12} style={{ color: 'var(--primary)', opacity: 0.85 }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Portfolio Awareness
          </span>
          {portfolioName && (
            <span style={{
              fontSize: 10, letterSpacing: '0.08em',
              color: 'var(--muted-foreground)', opacity: 0.7,
            }}>
              · {portfolioName}
            </span>
          )}
        </div>

        <h1 style={{
          margin: 0, fontSize: 26, fontWeight: 600, lineHeight: 1.25,
          letterSpacing: '-0.02em', color: 'var(--foreground)', maxWidth: 880,
        }}>
          {headline}
        </h1>

        <p style={{
          margin: '18px 0 0', fontSize: 14, lineHeight: 1.6,
          color: 'var(--muted-foreground)', maxWidth: 760,
          fontWeight: 400,
        }}>
          {subNarrative}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <RegimeStatusChip regime={regimeLabel} confidence={regime?.confidence ?? null} />
          <RiskLevelChip riskLevel={riskLevel} severity={risk?.severity ?? null} />
          {observationCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
              color: 'var(--muted-foreground)',
              padding: '2px 8px', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--card)',
            }}>
              {observationCount} observation{observationCount === 1 ? '' : 's'} on this portfolio · 7d
            </span>
          )}
          {loading && <SystemAnalyzingState compact />}
        </div>

        {freshness && (
          <p style={{
            margin: '20px 0 0', fontSize: 10, letterSpacing: '0.06em',
            color: 'var(--muted-foreground)', opacity: 0.65, textTransform: 'uppercase',
          }}>
            {freshness}
          </p>
        )}
      </div>
    </section>
  );
};
