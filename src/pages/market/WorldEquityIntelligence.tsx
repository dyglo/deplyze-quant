import React from 'react';
import { Globe } from 'lucide-react';
import { PageHeader } from '../../components/quant/PageHeader';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';

export const WorldEquityIntelligence: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <MarketPulseStrip />
    <div style={{ padding: '0 24px 24px', flex: 1 }}>
      <PageHeader
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={18} />World Equity Intelligence</span>}
        subtitle="Global equity regime monitoring — major indices, developed vs emerging markets, regional performance and breadth."
      />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 320, borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--border)',
        color: 'var(--muted-foreground)', fontSize: 13, gap: 10,
      }}>
        <Globe size={20} style={{ opacity: 0.4 }} />
        <span>Building in Wave E…</span>
      </div>
    </div>
  </div>
);
