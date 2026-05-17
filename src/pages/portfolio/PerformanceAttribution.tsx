import React from 'react';
import { TrendingUp } from 'lucide-react';

export const PerformanceAttribution: React.FC = () => (
  <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}>
    <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
      <div style={{
        width: '3rem', height: '3rem', borderRadius: '0.75rem',
        background: 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--chart-2) 25%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.25rem',
      }}>
        <TrendingUp size={20} style={{ color: 'var(--chart-2)' }} />
      </div>
      <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
        Performance Attribution
      </p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
        Contribution analysis, winners vs laggards, benchmark-relative attribution, rolling contribution charts, and regime-conditioned waterfall breakdowns. Coming in Wave E.
      </p>
    </div>
  </div>
);
