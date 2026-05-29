import React from 'react';
import { AssetIcon } from './AssetIcon';
import { Sparkline } from './Sparkline';
import type { Quote } from '../../types';

function fmt(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const MarketTile: React.FC<{
  symbol: string;
  quote?: Quote;
  loading?: boolean;
  spark?: number[];
  onClick?: () => void;
}> = ({ symbol, quote, loading, spark, onClick }) => {
  const dp = quote?.changePercent;
  const da = quote?.change;
  const positive = dp != null && dp > 0;
  const negative = dp != null && dp < 0;
  const deltaColor = dp == null
    ? 'var(--muted-foreground)'
    : positive ? '#4E6040'
    : negative ? 'var(--primary)'
    : 'var(--muted-foreground)';

  // Day range progress (where is price between low and high)
  const rangeProgress = (quote?.high != null && quote?.low != null && quote?.price != null && quote.high > quote.low)
    ? Math.max(0, Math.min(1, (quote.price - quote.low) / (quote.high - quote.low)))
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-surface ds-transition-fast"
      style={{
        textAlign: 'left',
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        display: 'grid',
        gap: 9,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--primary) 35%, var(--border))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      {/* Row 1: Symbol + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <AssetIcon symbol={symbol} size={24} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--foreground)' }}>
              {symbol}
            </div>
          </div>
        </div>
        {spark && spark.length > 1 && (
          <Sparkline
            values={spark}
            width={72}
            height={28}
            strokeWidth={1.2}
            color={positive ? '#4E6040' : negative ? 'var(--primary)' : 'var(--muted-foreground)'}
          />
        )}
      </div>

      {/* Row 2: Price + delta */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
          {quote?.price != null ? fmt(quote.price) : (loading ? '…' : '—')}
        </span>
        <div style={{ textAlign: 'right' }}>
          {dp != null && (
            <div style={{ fontSize: 11, color: deltaColor, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              {positive ? '▲' : negative ? '▼' : '·'} {Math.abs(dp).toFixed(2)}%
            </div>
          )}
          {da != null && (
            <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
              {da >= 0 ? '+' : ''}{fmt(da)}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Day range bar */}
      {rangeProgress != null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
              L {fmt(quote!.low!)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
              H {fmt(quote!.high!)}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 999, background: 'var(--muted)', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.max(4, rangeProgress * 100)}%`,
              background: deltaColor,
              borderRadius: 999,
              transition: 'width 0.3s ease',
            }} />
            {/* Current price marker */}
            <div style={{
              position: 'absolute', top: -1, bottom: -1,
              left: `calc(${rangeProgress * 100}% - 2px)`,
              width: 4, borderRadius: 999,
              background: deltaColor,
              boxShadow: `0 0 0 1px var(--background)`,
            }} />
          </div>
        </div>
      )}
    </button>
  );
};
