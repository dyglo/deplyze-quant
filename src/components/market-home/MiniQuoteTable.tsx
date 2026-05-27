import React from 'react';
import { useNavigate } from 'react-router-dom';
import { flagEmoji } from '../../lib/flagEmoji';
import { fmtPrice, fmtSigned, fmtPct, deltaColor } from './format';
import type { FlaggedRow } from '../../services/marketHomeService';

const HEAD: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
};

export const MiniQuoteTable: React.FC<{
  title: string;
  rows: FlaggedRow[];
  loading: boolean;
  error?: string | null;
  showFlags?: boolean;
}> = ({ title, rows, loading, error, showFlags }) => {
  const navigate = useNavigate();
  const ok = rows.filter((r) => r.ok);

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6, marginBottom: 4, borderBottom: '1px solid var(--foreground)' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)' }}>{title}</span>
      </div>

      {/* Column header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 8, padding: '0 2px 5px', borderBottom: '1px solid var(--border)' }}>
        <span style={HEAD}>Name</span>
        <span style={{ ...HEAD, textAlign: 'right', minWidth: 58 }}>Last</span>
        <span style={{ ...HEAD, textAlign: 'right', minWidth: 52 }}>Chg.</span>
        <span style={{ ...HEAD, textAlign: 'right', minWidth: 56 }}>Chg. %</span>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ display: 'grid', gap: 4, paddingTop: 5 }}>
          {Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 28, borderRadius: 5, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}
        </div>
      ) : error && ok.length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '12px 2px' }}>Unavailable.</p>
      ) : ok.length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '12px 2px' }}>No data.</p>
      ) : (
        <div>
          {rows.map((r) => {
            const color = deltaColor(r.changePercent);
            return (
              <button
                key={r.symbol}
                type="button"
                disabled={!r.ok}
                onClick={r.ok ? () => navigate(`/instruments/${encodeURIComponent(r.symbol)}`) : undefined}
                className="ds-transition-fast"
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 8, alignItems: 'center',
                  width: '100%', padding: '6px 2px', background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: r.ok ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (r.ok) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  {showFlags && r.country && <span style={{ fontSize: 13, flexShrink: 0 }}>{flagEmoji(r.country)}</span>}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.name}</span>
                </span>
                <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', textAlign: 'right', minWidth: 58 }}>{r.ok ? fmtPrice(r.price) : '—'}</span>
                <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color, textAlign: 'right', minWidth: 52 }}>{r.ok ? fmtSigned(r.change) : '—'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, textAlign: 'right', minWidth: 56 }}>{r.ok ? fmtPct(r.changePercent) : '—'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
