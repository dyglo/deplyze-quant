import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSWR } from '../../hooks/useSWR';
import { fetchTicker } from '../../services/marketHomeService';
import { fmtPrice, deltaColor } from './format';

/**
 * TickerTape — a compact, horizontally-scrollable strip of key cross-asset
 * quotes, giving the page an immediate "live market" read. Static (no
 * auto-marquee) for institutional calm and accessibility.
 */
export const TickerTape: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading } = useSWR(() => fetchTicker(), [], { cacheKey: 'marketHome:ticker' });
  const rows = data ?? [];

  if (loading && rows.length === 0) {
    return <div style={{ height: 34, borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />;
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto', overflowY: 'hidden',
        border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)',
        scrollbarWidth: 'thin',
      }}
      role="list"
      aria-label="Market ticker"
    >
      {rows.filter((r) => r.ok).map((r, i) => {
        const up = r.changePercent > 0;
        const down = r.changePercent < 0;
        const color = deltaColor(r.changePercent);
        return (
          <button
            key={r.symbol}
            type="button"
            role="listitem"
            onClick={() => navigate(`/instruments/${encodeURIComponent(r.symbol)}`)}
            className="ds-transition-fast"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              padding: '8px 14px', background: 'transparent', border: 'none',
              borderLeft: i === 0 ? 'none' : '1px solid var(--border)', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{r.symbol}</span>
            <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>{fmtPrice(r.price)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>
              <span style={{ fontSize: 8, marginRight: 2 }}>{up ? '▲' : down ? '▼' : '·'}</span>
              {Math.abs(r.changePercent).toFixed(2)}%
            </span>
          </button>
        );
      })}
    </div>
  );
};
