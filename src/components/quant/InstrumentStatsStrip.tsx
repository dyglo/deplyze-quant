import React from 'react';
import type { InstrumentFundamentals } from '../../services/instrumentService';
import type { Quote } from '../../types';

function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

interface StatCellProps {
  label: string;
  value: React.ReactNode;
  color?: string;
  emphasise?: boolean;
}

const StatCell: React.FC<StatCellProps> = ({ label, value, color, emphasise }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 0.7,
      textTransform: 'uppercase', color: 'var(--muted-foreground)',
      whiteSpace: 'nowrap',
    }}>{label}</span>
    <span style={{
      fontSize: 12.5, fontWeight: emphasise ? 700 : 500,
      fontVariantNumeric: 'tabular-nums',
      color: color ?? 'var(--foreground)',
      whiteSpace: 'nowrap',
    }}>{value}</span>
  </div>
);

const Divider: React.FC = () => (
  <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
);

interface Props {
  quote: Quote | null | undefined;
  fundamentals: InstrumentFundamentals | null | undefined;
  analytics: {
    vol: number;
    ret60: number;
    mdd: number;
  } | null;
  loading: boolean;
}

export const InstrumentStatsStrip: React.FC<Props> = ({ quote: q, fundamentals: f, analytics, loading }) => {
  const dp = q?.changePercent;
  const changeColor = dp == null ? 'var(--foreground)' : dp > 0 ? 'var(--ds-gain)' : dp < 0 ? 'var(--ds-loss)' : 'var(--foreground)';
  const retColor = analytics && analytics.ret60 > 0 ? 'var(--ds-gain)' : analytics && analytics.ret60 < 0 ? 'var(--ds-loss)' : 'var(--foreground)';
  const dash = '—';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 16px',
      background: 'var(--card)',
      borderRadius: 10,
      border: '1px solid var(--border)',
      overflowX: 'auto',
      flexWrap: 'nowrap',
      marginBottom: 14,
      scrollbarWidth: 'none',
    }}>
      <StatCell
        label="Open"
        value={loading ? '…' : q?.open != null ? q.open.toFixed(2) : dash}
      />
      <Divider />
      <StatCell
        label="High"
        value={loading ? '…' : q?.high != null ? q.high.toFixed(2) : dash}
        color={q?.high != null && q?.price != null && q.price >= q.high * 0.995 ? 'var(--ds-gain)' : undefined}
      />
      <Divider />
      <StatCell
        label="Low"
        value={loading ? '…' : q?.low != null ? q.low.toFixed(2) : dash}
        color={q?.low != null && q?.price != null && q.price <= q.low * 1.005 ? 'var(--ds-loss)' : undefined}
      />
      <Divider />
      <StatCell
        label="Prev. Close"
        value={loading ? '…' : q?.previousClose != null ? q.previousClose.toFixed(2) : dash}
      />
      <Divider />
      <StatCell
        label="Change"
        value={loading ? '…' : dp != null ? `${dp > 0 ? '+' : ''}${dp.toFixed(2)}%` : dash}
        color={changeColor}
        emphasise
      />
      {q?.volume != null && (
        <>
          <Divider />
          <StatCell label="Volume" value={fmtVol(q.volume)} />
        </>
      )}
      {f?.peRatio != null && (
        <>
          <Divider />
          <StatCell label="P/E Ratio" value={f.peRatio.toFixed(1)} />
        </>
      )}
      {f?.eps != null && (
        <>
          <Divider />
          <StatCell label="EPS (TTM)" value={`$${f.eps.toFixed(2)}`} color={f.eps > 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'} />
        </>
      )}
      {f?.beta != null && (
        <>
          <Divider />
          <StatCell label="Beta" value={f.beta.toFixed(2)} />
        </>
      )}
      {f?.week52High != null && (
        <>
          <Divider />
          <StatCell label="52W High" value={`$${f.week52High.toFixed(2)}`} color="var(--ds-gain)" />
        </>
      )}
      {f?.week52Low != null && (
        <>
          <Divider />
          <StatCell label="52W Low" value={`$${f.week52Low.toFixed(2)}`} color="var(--ds-loss)" />
        </>
      )}
      {analytics && (
        <>
          <Divider />
          <StatCell label="Ann. Vol" value={`${analytics.vol.toFixed(1)}%`} />
          <Divider />
          <StatCell
            label="60d Return"
            value={`${analytics.ret60 >= 0 ? '+' : ''}${analytics.ret60.toFixed(2)}%`}
            color={retColor}
          />
          <Divider />
          <StatCell label="Max DD (90d)" value={`${analytics.mdd.toFixed(1)}%`} color="var(--ds-loss)" />
        </>
      )}
      {f?.dividendYield != null && f.dividendYield > 0 && (
        <>
          <Divider />
          <StatCell label="Div. Yield" value={`${(f.dividendYield * 100).toFixed(2)}%`} color="var(--ds-gain)" />
        </>
      )}
    </div>
  );
};
