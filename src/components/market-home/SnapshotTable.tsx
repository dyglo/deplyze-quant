import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag } from './Flag';
import { ChangeCell } from './ChangeCell';
import { fmtPrice, fmtSigned, deltaColor, symbolCountry } from './format';
import type { SnapshotRow } from '../../services/marketHomeService';

const HEAD: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--muted-foreground)',
};
const COLS = 'minmax(0, 1fr) 84px 70px 78px';

const SkeletonRows: React.FC<{ count: number }> = ({ count }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ height: 28, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
    ))}
  </>
);

export const SnapshotTable: React.FC<{
  rows: SnapshotRow[];
  loading: boolean;
  error?: string | null;
  linkable?: boolean;
}> = ({ rows, loading, error, linkable = true }) => {
  const navigate = useNavigate();

  if (loading && rows.length === 0) {
    return <div style={{ display: 'grid', gap: 3 }}><SkeletonRows count={6} /></div>;
  }
  if (error && rows.length === 0) {
    return <div className="ds-empty" style={{ padding: '20px 0' }}><p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Market data temporarily unavailable. Retrying in the background.</p></div>;
  }
  const ok = rows.filter((r) => r.ok);
  if (rows.length > 0 && ok.length === 0) {
    return <div className="ds-empty" style={{ padding: '20px 0' }}><p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No quotes returned for this group right now.</p></div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, padding: '0 8px 5px', borderBottom: '1px solid var(--border)' }}>
        <span style={HEAD}>Name</span>
        <span style={{ ...HEAD, textAlign: 'right' }}>Last</span>
        <span style={{ ...HEAD, textAlign: 'right' }}>Chg.</span>
        <span style={{ ...HEAD, textAlign: 'right' }}>Chg. %</span>
      </div>
      {rows.map((r) => {
        const iso = symbolCountry(r.symbol);
        const interactive = linkable && r.ok;
        return (
          <button
            key={r.symbol}
            type="button"
            disabled={!interactive}
            onClick={interactive ? () => navigate(`/instruments/${encodeURIComponent(r.symbol)}`) : undefined}
            className="ds-transition-fast"
            style={{
              display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 4, border: '1px solid transparent', borderBottom: '1px solid var(--border)',
              background: 'transparent', textAlign: 'left', cursor: interactive ? 'pointer' : 'default', width: '100%',
            }}
            onMouseEnter={(e) => { if (interactive) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Flag iso={iso} width={18} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{r.symbol}</div>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', textAlign: 'right' }}>{r.ok ? fmtPrice(r.price) : '—'}</div>
            <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: deltaColor(r.changePercent), textAlign: 'right' }}>{r.ok ? fmtSigned(r.change) : '—'}</div>
            <ChangeCell changePercent={r.changePercent} ok={r.ok} />
          </button>
        );
      })}
    </div>
  );
};
