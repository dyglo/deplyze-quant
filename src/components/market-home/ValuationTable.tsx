import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSWR } from '../../hooks/useSWR';
import { SectionCard } from './SectionCard';
import { fetchValuationScreen, type ValuationRow } from '../../services/valuationService';

type Tab = 'undervalued' | 'overvalued';

const labelColor: Record<ValuationRow['label'], string> = {
  undervalued: '#4E6040',
  fair: 'var(--muted-foreground)',
  overvalued: 'var(--primary)',
};

function fmtMultiple(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '—';
  return `${n.toFixed(1)}×`;
}

const Row: React.FC<{ row: ValuationRow }> = ({ row }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/instruments/${encodeURIComponent(row.symbol)}`)}
      className="ds-transition-fast"
      style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr repeat(4, 0.7fr) auto',
        alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        padding: '8px 6px', background: 'transparent', border: 'none',
        borderBottom: '1px solid var(--border)', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{row.symbol}</span>
        <span style={{ display: 'block', fontSize: 10, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
      </span>
      {[row.peRatio, row.pbRatio, row.evToEbitda, row.priceToSales].map((m, i) => (
        <span key={i} style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', textAlign: 'right' }}>{fmtMultiple(m)}</span>
      ))}
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: labelColor[row.label] }}>
          {row.label}
        </span>
        <span style={{ display: 'block', fontSize: 8.5, color: 'var(--muted-foreground)' }}>{Math.round(row.confidence * 100)}% data</span>
      </span>
    </button>
  );
};

export const ValuationTable: React.FC = () => {
  const [tab, setTab] = useState<Tab>('undervalued');
  const { data, loading, error } = useSWR(() => fetchValuationScreen(), [], { cacheKey: 'marketHome:valuation' });
  const rows = data ? data[tab] : [];

  return (
    <SectionCard
      title="Relative Valuation"
      subtitle="Mega-cap peer screen"
      action={
        <div style={{ display: 'flex', gap: 4 }}>
          {(['undervalued', 'overvalued'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 11, fontWeight: tab === t ? 700 : 500, padding: '4px 10px', borderRadius: 999,
                border: '1px solid', borderColor: tab === t ? 'var(--primary)' : 'var(--border)',
                background: tab === t ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                color: tab === t ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      {/* Column header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 0.7fr) auto', gap: 8, padding: '0 6px 6px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>Symbol</span>
        {['P/E', 'P/B', 'EV/EBITDA', 'P/S'].map((h) => (
          <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', textAlign: 'right' }}>{h}</span>
        ))}
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', textAlign: 'right' }}>Signal</span>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ display: 'grid', gap: 4, paddingTop: 6 }}>
          {Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 36, borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}
        </div>
      ) : error && rows.length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '16px 6px' }}>Valuation metrics are temporarily unavailable.</p>
      ) : rows.length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '16px 6px' }}>Not enough fundamental data to rank the peer set right now.</p>
      ) : (
        <div>{rows.map((r) => <Row key={r.symbol} row={r} />)}</div>
      )}

      <p style={{ margin: '10px 6px 0', fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
        Relative ranking across a tracked mega-cap peer set using available valuation multiples — a research signal, not a recommendation.
      </p>
    </SectionCard>
  );
};
