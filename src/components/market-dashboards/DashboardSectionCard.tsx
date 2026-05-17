import React from 'react';
import { RefreshCw } from 'lucide-react';

interface DashboardSectionCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const DashboardSectionCard: React.FC<DashboardSectionCardProps> = ({
  title, subtitle, actions, onRefresh, children, style,
}) => (
  <div style={{
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    ...style,
  }}>
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      padding: '14px 18px 12px',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--foreground)',
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
        }}>
          {title}
        </p>
        {subtitle && (
          <p style={{
            margin: '2px 0 0',
            fontSize: 10,
            color: 'var(--muted-foreground)',
            lineHeight: 1.4,
          }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {actions}
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--muted)',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
            }}
          >
            <RefreshCw size={11} />
          </button>
        )}
      </div>
    </div>
    <div style={{ padding: '14px 18px' }}>
      {children}
    </div>
  </div>
);
