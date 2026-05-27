import React from 'react';

/**
 * Section — flat, divider-based section block. Content sits directly on the
 * page background (no card chrome): a header row (title + action) with a thin
 * bottom divider, then the content beneath it. Matches the reference's dense,
 * un-boxed market-homepage structure.
 */
export const SectionCard: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, action, children }) => (
  <section style={{ display: 'flex', flexDirection: 'column' }}>
    <header style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      paddingBottom: 8, marginBottom: 12, borderBottom: '2px solid var(--foreground)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>{title}</h2>
        {subtitle && (
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{subtitle}</span>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </header>
    <div>{children}</div>
  </section>
);
