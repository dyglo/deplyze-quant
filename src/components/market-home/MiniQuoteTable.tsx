import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag } from './Flag';
import { ChangeCell } from './ChangeCell';
import { fmtPrice, fmtSigned, deltaColor, symbolCountry } from './format';
import type { FlaggedRow } from '../../services/marketHomeService';

const HEAD: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--muted-foreground)',
};

const COLS = 'minmax(0, 1fr) 64px 60px 72px';

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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>{title}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '0 2px 4px', borderBottom: '1px solid var(--border)' }}>
        <span style={HEAD}>Name</span>
        <span style={{ ...HEAD, textAlign: 'right' }}>Last</span>
        <span style={{ ...HEAD, textAlign: 'right' }}>Chg.</span>
        <span style={{ ...HEAD, textAlign: 'right' }}>Chg. %</span>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ display: 'grid', gap: 3, paddingTop: 4 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 24, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}
        </div>
      ) : error && ok.length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '10px 2px' }}>Unavailable.</p>
      ) : ok.length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '10px 2px' }}>No data.</p>
      ) : (
        <div>
          {rows.map((r) => {
            const iso = r.country ?? (showFlags ? symbolCountry(r.symbol) : null);
            return (
              <button
                key={r.symbol}
                type="button"
                disabled={!r.ok}
                onClick={r.ok ? () => navigate(`/instruments/${encodeURIComponent(r.symbol)}`) : undefined}
                className="ds-transition-fast"
                style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: 6, alignItems: 'center',
                  width: '100%', padding: '5px 2px', background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: r.ok ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (r.ok) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  {showFlags && <Flag iso={iso} width={18} />}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.name}</span>
                </span>
                <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', textAlign: 'right' }}>{r.ok ? fmtPrice(r.price) : '—'}</span>
                <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: deltaColor(r.changePercent), textAlign: 'right' }}>{r.ok ? fmtSigned(r.change) : '—'}</span>
                <ChangeCell changePercent={r.changePercent} ok={r.ok} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
