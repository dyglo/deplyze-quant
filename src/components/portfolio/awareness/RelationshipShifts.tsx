/**
 * RelationshipShifts — reflective frame summarising whether the portfolio's
 * internal relationships are tightening, dispersing, or stable. Computed
 * here from existing portfolio observation outputs of kind correlation_*,
 * cross_asset, and dependency_shift.
 *
 * For interactive correlation matrices and dependency-shift panels, users
 * deep-link to the existing RelationsMap workspace.
 */

import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AgentOutput } from '../../../types/agents';

interface Props {
  portfolioObservations: AgentOutput[];
}

function summarise(observations: AgentOutput[]): {
  tone: 'tightening' | 'dispersing' | 'stable' | 'unknown';
  detail: string;
} {
  const rel = observations.filter(o =>
    o.domain === 'cross_asset' ||
    o.artifact_type.includes('correlation') ||
    o.artifact_type.includes('dependency') ||
    o.artifact_type.includes('relationship'),
  );
  if (rel.length === 0) return { tone: 'unknown', detail: 'No active relationship-shift signals on the portfolio in the last 7 days.' };

  const tightening = rel.filter(o => /tighten|rising|breakdown|consolidat/i.test(`${o.title} ${o.summary}`)).length;
  const dispersing = rel.filter(o => /dispers|falling|decoupl|loose/i.test(`${o.title} ${o.summary}`)).length;
  if (tightening > dispersing) {
    return {
      tone: 'tightening',
      detail: `${tightening} of ${rel.length} active relationship signals indicate intra-portfolio correlations are tightening. Diversification benefit is compressing.`,
    };
  }
  if (dispersing > tightening) {
    return {
      tone: 'dispersing',
      detail: `${dispersing} of ${rel.length} active signals indicate relationships are loosening. Dispersion across return drivers is rising.`,
    };
  }
  return {
    tone: 'stable',
    detail: `${rel.length} active relationship signals, balanced between tightening and dispersion. Net relational behaviour is stable.`,
  };
}

const TONE_COLOR: Record<string, string> = {
  tightening: '#ef4444',
  dispersing: '#6366f1',
  stable:     '#10b981',
  unknown:    'var(--muted-foreground)',
};

export const RelationshipShifts: React.FC<Props> = ({ portfolioObservations }) => {
  const navigate = useNavigate();
  const summary = useMemo(() => summarise(portfolioObservations), [portfolioObservations]);
  const color = TONE_COLOR[summary.tone];

  return (
    <section aria-label="Relationship shifts" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Relationship Shifts
          </p>
          <h2 style={{
            margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            How the portfolio is moving together.
          </h2>
        </header>

        <div style={{
          padding: '20px 22px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--card)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: '1 1 480px' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, flexShrink: 0, marginTop: 7,
            }} />
            <div>
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 600,
                color: 'var(--foreground)', textTransform: 'capitalize',
              }}>
                {summary.tone === 'unknown' ? 'Quiet' : summary.tone}
              </p>
              <p style={{
                margin: '4px 0 0', fontSize: 12, lineHeight: 1.6,
                color: 'var(--muted-foreground)',
              }}>
                {summary.detail}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/relations-map')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--foreground)', cursor: 'pointer',
            }}
          >
            Open Relations Map <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </section>
  );
};
