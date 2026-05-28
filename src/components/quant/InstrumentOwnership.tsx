import React, { useMemo } from 'react';
import { useOwnership } from '../../hooks/useOwnership';
import { useInstrumentIntelligence } from '../../hooks/useInstrument';

function fmtBig(v: number): string {
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtShares(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
}

// ─── SVG Donut ────────────────────────────────────────────────────────────────

interface Slice { label: string; value: number; color: string }

const DonutChart: React.FC<{ slices: Slice[]; size?: number }> = ({ slices, size = 130 }) => {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.36, sw = size * 0.12;
  const total = slices.reduce((s, sl) => s + sl.value, 0) || 1;

  let cursor = -Math.PI / 2;
  const paths = slices.map(sl => {
    const angle = (sl.value / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(cursor);
    const y1 = cy + R * Math.sin(cursor);
    cursor += angle;
    const x2 = cx + R * Math.cos(cursor);
    const y2 = cy + R * Math.sin(cursor);
    const large = angle > Math.PI ? 1 : 0;
    return { d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`, color: sl.color, pct: (sl.value / total * 100) };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={sw} />
      {paths.map((p, i) => (
        <path key={i} d={p.d} stroke={p.color} strokeWidth={sw} fill="none" strokeLinecap="butt" />
      ))}
    </svg>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const InstrumentOwnership: React.FC<{ symbol: string }> = ({ symbol }) => {
  const ownership = useOwnership(symbol);
  const intel = useInstrumentIntelligence(symbol);
  const profile = intel.data?.profile ?? null;

  const sharesOutstanding = profile?.sharesOutstanding ?? null;
  const marketCap = profile?.marketCap ?? profile?.marketCapitalization ?? null;

  const holders = ownership.data?.holders ?? [];

  // Build donut slices from real holder data.
  // Total institutional = sum of reported shares vs total shares outstanding.
  const donutSlices: Slice[] | null = useMemo(() => {
    if (!holders.length || !sharesOutstanding) return null;
    const totalInstitutionalShares = holders.reduce((sum, h) => sum + (h.shares ?? 0), 0);
    const instPct = Math.min(100, (totalInstitutionalShares / sharesOutstanding) * 100);
    const retailPct = Math.max(0, 100 - instPct);
    return [
      { label: 'Top Institutional Holders', value: instPct, color: 'var(--primary)' },
      { label: 'Public & Other',            value: retailPct, color: '#ca8a04' },
    ];
  }, [holders, sharesOutstanding]);

  const isLoading = ownership.loading || intel.loading;

  if (isLoading && !ownership.data && !intel.data) {
    return (
      <section style={{ marginBottom: 32 }}>
        <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Ownership</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Loading ownership data…</p>
      </section>
    );
  }

  // TODO: FMP institutional-holder endpoint may not cover all symbols
  if (!isLoading && !holders.length) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Ownership</h2>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Based on latest 13F filings</span>
      </div>

      {/* Composition donut — only when we have sharesOutstanding for accurate % */}
      {donutSlices && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 14 }}>
            Ownership Composition (Top {holders.length} Institutional Holders)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 32px', alignItems: 'center' }}>
            <DonutChart slices={donutSlices} size={130} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                {['Composition', 'Market Value', '% Shares'].map((h, i) => (
                  <span key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-foreground)', textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
                ))}
              </div>
              {donutSlices.map(sl => {
                const value = marketCap ? (sl.value / 100) * marketCap : null;
                return (
                  <div key={sl.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 16px', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: sl.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)' }}>{sl.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: 'var(--foreground)' }}>
                      {value != null ? fmtBig(value) : '—'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: sl.color }}>
                      {sl.value.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top Institutional Holders */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 10 }}>
          Top Institutional Holders
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Holder', '% of Shares', 'Shares Held', 'Change', 'Date Reported'].map((h, i) => (
                  <th key={i} style={{
                    padding: '6px 8px', textAlign: i === 0 ? 'left' : 'right',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                    textTransform: 'uppercase', color: 'var(--muted-foreground)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holders.map((h, i) => {
                const pct = sharesOutstanding && h.shares ? (h.shares / sharesOutstanding) * 100 : null;
                const changeColor = h.change > 0 ? 'var(--ds-gain)' : h.change < 0 ? 'var(--ds-loss)' : 'var(--muted-foreground)';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '8px 8px', fontWeight: 600, color: 'var(--foreground)' }}>{h.name}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--primary)' }}>
                      {pct != null ? `${pct.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
                      {fmtShares(h.shares)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: changeColor }}>
                      {h.change > 0 ? '+' : ''}{fmtShares(h.change)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                      {h.dateReported ? new Date(h.dateReported).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
