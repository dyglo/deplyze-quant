import React from 'react';

export const SectionCard: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Removes inner padding when the child manages its own spacing. */
  flush?: boolean;
}> = ({ title, subtitle, action, children, flush }) => (
  <section style={{
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <header style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      padding: '13px 16px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>{title}</h2>
        {subtitle && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>{subtitle}</p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </header>
    <div style={{ padding: flush ? 0 : '12px 16px 16px' }}>{children}</div>
  </section>
);
