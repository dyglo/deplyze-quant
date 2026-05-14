import React from 'react';
import type { IntelligenceArtifact } from '../../types';
import { ArtifactCard } from './ArtifactCard';

export const IntelligenceFeed: React.FC<{
  items: IntelligenceArtifact[];
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  onOpen?: (id: string) => void;
}> = ({ items, loading, emptyTitle = 'No intelligence artifacts yet', emptyHint, onOpen }) => {
  if (loading) {
    return (
      <div className="ds-caption" style={{ padding: '24px 8px', color: 'var(--muted-foreground)' }}>
        Loading intelligence feed…
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="ds-empty" style={{ minHeight: 240 }}>
        <p className="ds-heading">{emptyTitle}</p>
        {emptyHint ? (
          <p className="ds-caption" style={{ maxWidth: 360, textAlign: 'center' }}>{emptyHint}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((a) => <ArtifactCard key={a.id} artifact={a} onOpen={onOpen} />)}
    </div>
  );
};
