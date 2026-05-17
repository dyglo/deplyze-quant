import React from 'react';
import { Flame } from 'lucide-react';
import { PageHeader } from '../../components/quant/PageHeader';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';

export const CommoditiesIntelligence: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <MarketPulseStrip />
    <div style={{ padding: '0 24px 24px', flex: 1 }}>
      <PageHeader
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Flame size={18} />Commodities Intelligence</span>}
        subtitle="Commodity market monitoring — energy, metals, agriculture, inflation sensitivity and cross-asset relationships."
      />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 320, borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--border)',
        color: 'var(--muted-foreground)', fontSize: 13, gap: 10,
      }}>
        <Flame size={20} style={{ opacity: 0.4 }} />
        <span>Building in Wave I…</span>
      </div>
    </div>
  </div>
);
