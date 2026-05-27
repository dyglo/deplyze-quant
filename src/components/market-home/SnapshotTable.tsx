import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AssetIcon } from '../quant/AssetIcon';
import { fmtPrice, fmtPct, deltaColor } from './format';
import type { SnapshotRow } from '../../services/marketHomeService';

const SkeletonRows: React.FC<{ count: number }> = ({ count }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ height: 38, borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
    ))}
  </>
);

export const SnapshotTable: React.FC<{
  rows: SnapshotRow[];
  loading: boolean;
  error?: string | null;
  /** When true, symbol rows deep-link into single-instrument research. */
  linkable?: boolean;
}> = ({ rows, loading, error, linkable = true }) => {
  const navigate = useNavigate();

  if (loading && rows.length === 0) {
    return <div style={{ display: 'grid', gap: 5 }}><SkeletonRows count={6} /></div>;
  }

  if (error && rows.length === 0) {
    return (
      <div className="ds-empty" style={{ padding: '24px 0' }}>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
          Market data temporarily unavailable. Retrying in the background.
        </p>
      </div>
    );
  }

  const ok = rows.filter((r) => r.ok);
  if (rows.length > 0 && ok.length === 0) {
    return (
      <div className="ds-empty" style={{ padding: '24px 0' }}>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
          No quotes returned for this group right now.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {rows.map((r) => {
        const color = deltaColor(r.changePercent);
        const interactive = linkable && r.ok;
        return (
          <button
            key={r.symbol}
            type="button"
            disabled={!interactive}
            onClick={interactive ? () => navigate(`/instruments/${encodeURIComponent(r.symbol)}`) : undefined}
            className="ds-transition-fast"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              alignItems: 'center',
              gap: 10,
              padding: '8px 8px',
              borderRadius: 6,
              border: '1px solid transparent',
              background: 'transparent',
              textAlign: 'left',
              cursor: interactive ? 'pointer' : 'default',
              width: '100%',
            }}
            onMouseEnter={(e) => { if (interactive) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <AssetIcon symbol={r.symbol} size={22} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '0.01em' }}>{r.symbol}</div>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{r.name}</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', textAlign: 'right' }}>
              {r.ok ? fmtPrice(r.price) : '—'}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, textAlign: 'right', minWidth: 64 }}>
              {r.ok ? fmtPct(r.changePercent) : '—'}
            </div>
          </button>
        );
      })}
    </div>
  );
};
