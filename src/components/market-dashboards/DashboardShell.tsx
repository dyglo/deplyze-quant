import React from 'react';
import { MarketPulseStrip } from '../quant/MarketPulseStrip';
import { PageHeader } from '../quant/PageHeader';

interface DashboardShellProps {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({ title, subtitle, actions, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <MarketPulseStrip />
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 32px' }}>
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      {children}
    </div>
  </div>
);
