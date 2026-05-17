import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '../../components/quant/PageHeader';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';

export const FxLiquidityIntelligence: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <MarketPulseStrip />
    <div style={{ padding: '0 24px 24px', flex: 1 }}>
      <PageHeader
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ArrowLeftRight size={18} />FX & Liquidity Intelligence</span>}
        subtitle="Currency, dollar, and liquidity pressure monitoring — DXY state, G10 FX performance, EM snapshot, carry dynamics."
      />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 320, borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--border)',
        color: 'var(--muted-foreground)', fontSize: 13, gap: 10,
      }}>
        <ArrowLeftRight size={20} style={{ opacity: 0.4 }} />
        <span>Building in Wave J…</span>
      </div>
    </div>
  </div>
);
