import React from 'react';
import { Link } from 'react-router-dom';
import { usePeers } from '../../hooks/usePeers';

function fmtMktCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export const InstrumentPeers: React.FC<{ symbol: string }> = ({ symbol }) => {
  const peers = usePeers(symbol);
  const list = peers.data?.peers ?? [];

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Peers & Competitors</h2>
      </div>

      {peers.loading && !list.length ? (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>Loading peer data…</p>
      ) : !list.length ? (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>No peer data available.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Symbol', 'Company', 'Price', 'Change', 'Market Cap', 'P/E', 'Volume'].map((h) => (
                  <th key={h} style={{
                    padding: '6px 8px', textAlign: h === 'Symbol' || h === 'Company' ? 'left' : 'right',
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
                    color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => {
                const chColor = p.changePercent > 0 ? 'var(--ds-gain)' : p.changePercent < 0 ? 'var(--ds-loss)' : 'var(--foreground)';
                return (
                  <tr key={p.symbol} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '8px 8px' }}>
                      <Link
                        to={`/instruments/${encodeURIComponent(p.symbol)}`}
                        style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', fontSize: 12 }}
                      >
                        {p.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: '8px 8px', color: 'var(--foreground)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name ?? '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {p.price != null ? `$${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: chColor }}>
                      {p.changePercent != null ? `${p.changePercent > 0 ? '+' : ''}${p.changePercent.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>
                      {p.marketCap != null ? fmtMktCap(p.marketCap) : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>
                      {p.pe != null && p.pe > 0 ? p.pe.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>
                      {p.volume != null ? fmtVol(p.volume) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
