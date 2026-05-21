import React from 'react';
import type { ResearchObservation } from '../../../services/historicalResearchService';

export const ObservationsList: React.FC<{ items: ResearchObservation[] }> = ({ items }) => {
  if (!items.length) {
    return <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No observations.</div>;
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 24, rowGap: 6,
      fontSize: 12,
    }}>
      {items.map((o, i) => (
        <React.Fragment key={`${o.label}-${i}`}>
          <div style={{ color: 'var(--muted-foreground)' }}>
            {o.label}
            {o.period && <span style={{ opacity: 0.7 }}> · {o.period}</span>}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            color: 'var(--foreground)',
            textAlign: 'right',
          }}>{o.value}</div>
        </React.Fragment>
      ))}
    </div>
  );
};
