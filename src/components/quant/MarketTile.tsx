import React from 'react';
import { AssetIcon } from './AssetIcon';
import { Sparkline } from './Sparkline';
import { SourceBadge } from './FreshnessBadge';
import type { Quote } from '../../types';

export const MarketTile: React.FC<{
  symbol: string;
  quote?: Quote;
  loading?: boolean;
  spark?: number[];
  onClick?: () => void;
}> = ({ symbol, quote, loading, spark, onClick }) => {
  const dp = quote?.changePercent;
  const deltaColor = dp == null
    ? 'var(--muted-foreground)'
    : dp > 0 ? '#4E6040'
    : dp < 0 ? 'var(--primary)'
    : 'var(--muted-foreground)';

  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-surface ds-transition-fast"
      style={{
        textAlign: 'left',
        width: '100%',
        padding: 12,
        borderRadius: 10,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 8,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--primary) 35%, var(--border))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <AssetIcon symbol={symbol} size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--foreground)' }}>
              {symbol}
            </div>
            <div style={{ fontSize: 9, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {quote?.source ? <SourceBadge source={quote.source} /> : <span style={{ opacity: 0.5 }}>—</span>}
            </div>
          </div>
        </div>
        {spark && spark.length > 1 && (
          <Sparkline values={spark} width={70} height={26} strokeWidth={1.25} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
          {quote?.price != null ? quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : (loading ? '…' : '—')}
        </span>
        <span style={{ fontSize: 11, color: deltaColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {dp != null ? `${dp > 0 ? '▲' : dp < 0 ? '▼' : '·'} ${Math.abs(dp).toFixed(2)}%` : ''}
        </span>
      </div>
    </button>
  );
};
