import React from 'react';
import type { InstrumentFundamentals } from '../../services/instrumentService';
import type { Quote } from '../../types';

function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

const Cell: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, padding: '0 20px' }}>
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', lineHeight: 1 }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: color ?? 'var(--foreground)', lineHeight: 1.2 }}>{value}</span>
  </div>
);

const Sep: React.FC = () => (
  <div style={{ width: 1, background: 'var(--border)', flexShrink: 0, alignSelf: 'stretch' }} />
);

interface Props {
  quote: Quote | null | undefined;
  fundamentals: InstrumentFundamentals | null | undefined;
  analytics: { vol: number; ret60: number; mdd: number } | null;
  loading: boolean;
}

export const InstrumentStatsStrip: React.FC<Props> = ({ quote: q, fundamentals: f, analytics, loading }) => {
  const dp = q?.changePercent;
  const chColor = dp == null ? 'var(--foreground)' : dp > 0 ? 'var(--ds-gain)' : dp < 0 ? 'var(--ds-loss)' : 'var(--foreground)';
  const dash = '—';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 0',
      marginBottom: 28,
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      <Cell label="Open"      value={loading ? '…' : q?.open != null ? q.open.toFixed(2) : dash} />
      <Sep />
      <Cell label="High"      value={loading ? '…' : q?.high != null ? q.high.toFixed(2) : dash} />
      <Sep />
      <Cell label="Low"       value={loading ? '…' : q?.low != null ? q.low.toFixed(2) : dash} />
      <Sep />
      <Cell label="Prev Close" value={loading ? '…' : q?.previousClose != null ? q.previousClose.toFixed(2) : dash} />
      <Sep />
      <Cell label="Change"    value={loading ? '…' : dp != null ? `${dp > 0 ? '+' : ''}${dp.toFixed(2)}%` : dash} color={chColor} />
      {q?.volume != null && <><Sep /><Cell label="Volume" value={fmtVol(q.volume)} /></>}
      {f?.peRatio != null && <><Sep /><Cell label="P/E Ratio" value={f.peRatio.toFixed(1)} /></>}
      {f?.eps != null && <><Sep /><Cell label="EPS" value={`$${f.eps.toFixed(2)}`} color={f.eps > 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'} /></>}
      {f?.beta != null && <><Sep /><Cell label="Beta" value={f.beta.toFixed(2)} /></>}
      {f?.week52High != null && <><Sep /><Cell label="52W High" value={`$${f.week52High.toFixed(2)}`} color="var(--ds-gain)" /></>}
      {f?.week52Low  != null && <><Sep /><Cell label="52W Low"  value={`$${f.week52Low.toFixed(2)}`}  color="var(--ds-loss)" /></>}
      {analytics && <>
        <Sep /><Cell label="Ann. Vol"    value={`${analytics.vol.toFixed(1)}%`} />
        <Sep /><Cell label="60d Return"  value={`${analytics.ret60 >= 0 ? '+' : ''}${analytics.ret60.toFixed(2)}%`} color={analytics.ret60 >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'} />
        <Sep /><Cell label="Max DD (90d)" value={`${analytics.mdd.toFixed(1)}%`} color="var(--ds-loss)" />
      </>}
      {f?.dividendYield != null && f.dividendYield > 0 && <><Sep /><Cell label="Div. Yield" value={`${(f.dividendYield * 100).toFixed(2)}%`} color="var(--ds-gain)" /></>}
    </div>
  );
};
