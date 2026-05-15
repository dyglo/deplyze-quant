import React from 'react';
import { Link } from 'react-router-dom';
import type { Briefing, IntelligenceArtifact } from '../../types';

interface Props {
  symbols: string[];
  artifacts: IntelligenceArtifact[];
  briefings: Briefing[];
  excludeId?: string;
  onOpenArtifact?: (id: string) => void;
  maxItems?: number;
}

export const RelatedIntelligencePanel: React.FC<Props> = ({
  symbols,
  artifacts,
  briefings,
  excludeId,
  onOpenArtifact,
  maxItems = 4,
}) => {
  const relatedArtifacts = artifacts
    .filter((a) => a.id !== excludeId && a.symbols?.some((s) => symbols.includes(s)))
    .slice(0, maxItems);

  const relatedBriefings = briefings
    .filter((b) => b.id !== excludeId && b.symbols?.some((s) => symbols.includes(s)))
    .slice(0, maxItems - relatedArtifacts.length);

  const total = relatedArtifacts.length + relatedBriefings.length;

  if (!symbols.length || total === 0) return null;

  return (
    <section style={{ marginTop: 24 }}>
      <h4 className="ds-label" style={{ margin: '0 0 10px', color: 'var(--muted-foreground)' }}>
        Related Intelligence
      </h4>
      <div style={{ display: 'grid', gap: 8 }}>
        {relatedArtifacts.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpenArtifact?.(a.id)}
            className="ds-surface ds-transition"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'grid',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
              <span className="ds-label" style={{ color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
                {a.category}
              </span>
              <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                {new Date(a.createdAt).toLocaleDateString()}
              </span>
            </div>
            <span className="ds-body" style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</span>
          </button>
        ))}
        {relatedBriefings.map((b) => (
          <Link
            key={b.id}
            to={`/briefings/${b.id}`}
            className="ds-surface ds-transition"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              color: 'inherit',
              display: 'grid',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
              <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>
                Briefing · {b.kind}
              </span>
              <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                {new Date(b.createdAt).toLocaleDateString()}
              </span>
            </div>
            <span className="ds-body" style={{ fontWeight: 600, fontSize: 13 }}>{b.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
};
