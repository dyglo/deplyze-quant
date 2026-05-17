import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export const PortfolioOverview: React.FC = () => (
  <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}>
    <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
      <div style={{
        width: '3rem', height: '3rem', borderRadius: '0.75rem',
        background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.25rem',
      }}>
        <LayoutDashboard size={20} style={{ color: 'var(--primary)' }} />
      </div>
      <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
        Portfolio Overview
      </p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
        Institutional command center — performance curves, benchmark comparison, rolling volatility, drawdown visualization, and allocation intelligence. Coming in Wave B.
      </p>
    </div>
  </div>
);
