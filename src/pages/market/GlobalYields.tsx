import React from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from '../../components/quant/PageHeader';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';

export const GlobalYields: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <MarketPulseStrip />
    <div style={{ padding: '0 24px 24px', flex: 1 }}>
      <PageHeader
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} />Global Yields</span>}
        subtitle="Macro rates and yield regime monitoring — US yield curve, global sovereign yields, spread dynamics."
      />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 320, borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--border)',
        color: 'var(--muted-foreground)', fontSize: 13, gap: 10,
      }}>
        <TrendingUp size={20} style={{ opacity: 0.4 }} />
        <span>Building in Wave G…</span>
      </div>
    </div>
  </div>
);
