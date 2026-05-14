import React from 'react';

export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <header style={{
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    padding: '20px 0 14px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 18,
  }}>
    <div>
      <h1 className="ds-title" style={{ margin: 0 }}>{title}</h1>
      {subtitle ? (
        <p className="ds-caption" style={{ marginTop: 6, color: 'var(--muted-foreground)', maxWidth: 640 }}>
          {subtitle}
        </p>
      ) : null}
    </div>
    {actions ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div> : null}
  </header>
);
