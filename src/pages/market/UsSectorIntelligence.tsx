import React from 'react';
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '../../components/quant/PageHeader';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';

export const UsSectorIntelligence: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <MarketPulseStrip />
    <div style={{ padding: '0 24px 24px', flex: 1 }}>
      <PageHeader
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} />US Sector Intelligence</span>}
        subtitle="Sector rotation and market breadth monitoring — XLC through XLU vs SPY benchmark."
      />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 320, borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--border)',
        color: 'var(--muted-foreground)', fontSize: 13, gap: 10,
      }}>
        <BarChart3 size={20} style={{ opacity: 0.4 }} />
        <span>Building in Wave F…</span>
      </div>
    </div>
  </div>
);
