import React from 'react';
import { Brain } from 'lucide-react';

export const ReasoningPanel: React.FC<{ narrative: string }> = ({ narrative }) => {
  return (
    <section
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '14px 16px',
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card)',
      }}
    >
      <Brain size={16} style={{ color: 'var(--muted-foreground)', marginTop: 2, flex: '0 0 auto' }} />
      <div>
        <div style={{
          fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
          color: 'var(--muted-foreground)', marginBottom: 6,
        }}>
          Historical reasoning · evidence-grounded
        </div>
        <p style={{
          margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--foreground)',
          maxWidth: 760,
        }}>
          {narrative || 'No commentary available.'}
        </p>
      </div>
    </section>
  );
};
