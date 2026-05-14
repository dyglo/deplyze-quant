import React from 'react';
import type { IntelligenceArtifact } from '../../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { SignificanceMeter } from './SignificanceMeter';

const CATEGORY_LABEL: Record<IntelligenceArtifact['category'], string> = {
  regime: 'Regime',
  volatility: 'Volatility',
  correlation: 'Correlation',
  sentiment: 'Sentiment',
  positioning: 'Positioning',
  anomaly: 'Anomaly',
  macro: 'Macro',
  opportunity: 'Opportunity',
  risk: 'Risk',
  earnings: 'Earnings',
};

export const ArtifactCard: React.FC<{
  artifact: IntelligenceArtifact;
  onOpen?: (id: string) => void;
}> = ({ artifact, onOpen }) => (
  <article
    className="ds-surface ds-transition"
    style={{
      padding: '14px 16px',
      borderRadius: 10,
      cursor: onOpen ? 'pointer' : 'default',
      display: 'grid',
      gap: 10,
    }}
    onClick={() => onOpen?.(artifact.id)}
  >
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>
        {CATEGORY_LABEL[artifact.category]}
        {artifact.symbols?.length ? ` · ${artifact.symbols.join(', ')}` : ''}
      </span>
      <ConfidenceBadge score={artifact.confidence} />
    </header>

    <h3 className="ds-heading" style={{ margin: 0, lineHeight: 1.35 }}>{artifact.title}</h3>
    <p className="ds-body" style={{ margin: 0, color: 'var(--foreground)' }}>{artifact.narrative}</p>

    {artifact.evidence?.length ? (
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {artifact.evidence.slice(0, 4).map((e, i) => (
          <li key={i} className="ds-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>{e.label}:</span> {String(e.value)}
            {e.source && e.source !== 'derived' ? (
              <span style={{ color: 'var(--muted-foreground)' }}> · {String(e.source)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null}

    <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <SignificanceMeter value={artifact.significance ?? 0} />
      <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
        {new Date(artifact.createdAt).toLocaleString()}
      </span>
    </footer>
  </article>
);
