import React, { useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Sparkline } from '../quant/Sparkline';

export interface PerformanceRow {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change?: number;
  volume?: number;
  sparkline?: number[];
  badge?: React.ReactNode;
  meta?: string;
}

type SortKey = 'symbol' | 'price' | 'changePercent';
type SortDir = 'asc' | 'desc';

function fmtPrice(n: number) {
  if (n >= 10_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtChange(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

const SortBtn: React.FC<{ active: boolean; dir: SortDir; onClick: () => void }> = ({ active, dir, onClick }) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: active ? 'var(--primary)' : 'var(--muted-foreground)' }}>
    {active ? (dir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : <ArrowUpDown size={11} />}
  </button>
);

interface CompactPerformanceTableProps {
  rows: PerformanceRow[];
  showSparkline?: boolean;
  showBadge?: boolean;
  emptyLabel?: string;
}

export const CompactPerformanceTable: React.FC<CompactPerformanceTableProps> = ({
  rows, showSparkline = true, showBadge = false, emptyLabel = 'No data',
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...rows].sort((a, b) => {
    const mult = sortDir === 'desc' ? -1 : 1;
    if (sortKey === 'symbol') return mult * a.symbol.localeCompare(b.symbol);
    if (sortKey === 'price') return mult * (a.price - b.price);
    return mult * (a.changePercent - b.changePercent);
  });

  if (!rows.length) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px 6px 0', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                Symbol <SortBtn active={sortKey === 'symbol'} dir={sortDir} onClick={() => toggle('symbol')} />
              </span>
            </th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Price <SortBtn active={sortKey === 'price'} dir={sortDir} onClick={() => toggle('price')} />
              </span>
            </th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Chg% <SortBtn active={sortKey === 'changePercent'} dir={sortDir} onClick={() => toggle('changePercent')} />
              </span>
            </th>
            {showSparkline && (
              <th style={{ textAlign: 'right', padding: '6px 0 6px 8px', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Trend
              </th>
            )}
            {showBadge && <th style={{ padding: '6px 0 6px 8px' }} />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const pos = row.changePercent > 0;
            const neg = row.changePercent < 0;
            const clr = pos ? '#4E6040' : neg ? 'var(--primary)' : 'var(--muted-foreground)';
            const bgChg = pos ? 'rgba(78,96,64,0.08)' : neg ? 'rgba(193,95,60,0.08)' : 'transparent';
            return (
              <tr
                key={row.symbol}
                style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <td style={{ padding: '8px 8px 8px 0', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: 12 }}>{row.symbol}</span>
                    {row.name && (
                      <span style={{ fontSize: 10, color: 'var(--muted-foreground)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.name}
                      </span>
                    )}
                    {row.meta && (
                      <span style={{ fontSize: 9, color: 'var(--muted-foreground)', opacity: 0.7 }}>{row.meta}</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 12, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                  {fmtPrice(row.price)}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    padding: '2px 6px', borderRadius: 5,
                    background: bgChg, color: clr,
                    fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(row.changePercent).toFixed(2)}%
                  </span>
                </td>
                {showSparkline && (
                  <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                    {row.sparkline && row.sparkline.length > 1 ? (
                      <Sparkline values={row.sparkline} width={60} height={24} />
                    ) : (
                      <span style={{ fontSize: 9, color: 'var(--muted-foreground)', opacity: 0.5 }}>—</span>
                    )}
                  </td>
                )}
                {showBadge && (
                  <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                    {row.badge}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
