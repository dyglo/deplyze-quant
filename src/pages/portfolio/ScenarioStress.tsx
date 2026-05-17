import React from 'react';
import { Zap } from 'lucide-react';

export const ScenarioStress: React.FC = () => (
  <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}>
    <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
      <div style={{
        width: '3rem', height: '3rem', borderRadius: '0.75rem',
        background: 'color-mix(in srgb, var(--chart-5) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--chart-5) 25%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.25rem',
      }}>
        <Zap size={20} style={{ color: 'var(--chart-5)' }} />
      </div>
      <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
        Scenario & Stress View
      </p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
        Contextual scenario intelligence — inflation shock, liquidity tightening, recession, volatility spike, AI momentum unwind, and growth/value rotation with historical analog overlays. Coming in Wave G.
      </p>
    </div>
  </div>
);
