import React, { useState } from 'react';
import { useSymbolSearch } from '../../hooks/useMarket';
import { Search } from 'lucide-react';

export const InstrumentSelector: React.FC<{
  value?: string;
  onSelect: (symbol: string) => void;
  placeholder?: string;
}> = ({ value, onSelect, placeholder = 'Search symbol (AAPL, EUR/USD, BTC/USD…)' }) => {
  const [q, setQ] = useState(value ?? '');
  const { data, loading } = useSymbolSearch(q.length >= 2 ? q : '');

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--card)',
      }}>
        <Search size={14} color="var(--muted-foreground)" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="ds-body"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--foreground)',
          }}
        />
      </div>

      {q.length >= 2 && (
        <div style={{
          position: 'absolute',
          left: 0, right: 0, top: 'calc(100% + 4px)',
          maxHeight: 280, overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          zIndex: 30,
        }}>
          {loading ? (
            <p className="ds-caption" style={{ padding: 12, color: 'var(--muted-foreground)' }}>Searching…</p>
          ) : !data || data.length === 0 ? (
            <p className="ds-caption" style={{ padding: 12, color: 'var(--muted-foreground)' }}>No matches</p>
          ) : (
            data.slice(0, 12).map((m) => (
              <button
                key={`${m.symbol}-${m.exchange}`}
                onClick={() => { onSelect(m.symbol); setQ(m.symbol); }}
                className="ds-row"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  width: '100%', padding: '8px 12px', border: 'none', background: 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>
                  <div className="ds-heading">{m.symbol}</div>
                  <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{m.name}</div>
                </div>
                <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{m.exchange} · {m.type}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
