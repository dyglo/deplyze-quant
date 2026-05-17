import React, { useState, useMemo, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { AssetIcon } from './AssetIcon';
import type { ScreenerRow, VolatilityState } from '../../services/screenerService';

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtPrice(n?: number): string {
  if (n == null) return '—';
  if (n >= 10_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtVol(n?: number): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ─── Change column ────────────────────────────────────────────────────────────

const ChangeCell: React.FC<{ pct: number; abs?: number }> = ({ pct, abs }) => {
  const pos = pct > 0, neg = pct < 0;
  const clr = pos ? '#4E6040' : neg ? '#C15F3C' : '#8A8680';
  const bg  = pos ? 'rgba(78,96,64,0.08)' : neg ? 'rgba(193,95,60,0.08)' : 'transparent';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '3px 7px', borderRadius: 5,
        background: bg, color: clr,
        fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
      }}>
        {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(pct).toFixed(2)}%
      </span>
      {abs != null && (
        <span style={{ fontSize: 10, color: '#B1ADA1', fontVariantNumeric: 'tabular-nums' }}>
          {abs >= 0 ? '+' : ''}{abs >= 1 ? abs.toFixed(2) : abs.toFixed(4)}
        </span>
      )}
    </div>
  );
};

// ─── Intelligence cell ────────────────────────────────────────────────────────

const VOL_DOT: Record<VolatilityState, { color: string; label: string }> = {
  low:      { color: '#B1ADA1', label: 'Low' },
  normal:   { color: '#6A9BCC', label: 'Normal' },
  elevated: { color: '#C9A227', label: 'Elevated' },
  extreme:  { color: '#C15F3C', label: 'Extreme' },
};

const IntelligenceCell: React.FC<{ row: ScreenerRow }> = ({ row }) => {
  const vd = VOL_DOT[row.volatilityState];
  const score = row.momentumScore;
  const pos = score > 0;
  const barWidth = `${Math.min(100, Math.abs(score))}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* Vol state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: vd.color, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600 }}>{vd.label} vol</span>
      </div>
      {/* Momentum bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 56, height: 3, borderRadius: 999, background: 'var(--muted)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{
            position: 'absolute',
            left: pos ? '50%' : `calc(50% - ${barWidth} / 2)`,
            width: `calc(${barWidth} / 2)`,
            height: '100%',
            background: pos ? '#4E6040' : '#C15F3C',
            borderRadius: 999,
          }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
        </div>
        <span style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums', color: pos ? '#4E6040' : score < 0 ? '#C15F3C' : '#8A8680', fontWeight: 600 }}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>
    </div>
  );
};

// ─── Signal cell ──────────────────────────────────────────────────────────────

const SignalCell: React.FC<{ row: ScreenerRow }> = ({ row }) => {
  if (!row.anomalyTag) return <span style={{ fontSize: 10, color: 'var(--border)' }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <AlertTriangle size={10} style={{ color: '#C9A227', flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: '#9A7B1D', fontWeight: 600, lineHeight: 1.3 }}>
        {row.anomalyTag}
      </span>
    </div>
  );
};

// ─── Sort types ───────────────────────────────────────────────────────────────

type SortKey = 'symbol' | 'price' | 'changePercent' | 'volume' | 'momentumScore';

interface SortState { key: SortKey; dir: 'asc' | 'desc' }

const PAGE_SIZE = 20;

// ─── Skeleton row ─────────────────────────────────────────────────────────────

const SkeletonRow: React.FC<{ i: number }> = ({ i }) => (
  <tr style={{ background: i % 2 === 1 ? 'rgba(228,226,216,0.2)' : 'transparent' }}>
    {[60, 120, 70, 70, 65, 110, 80].map((w, j) => (
      <td key={j} style={{ padding: '10px 12px' }}>
        <div style={{ height: 12, borderRadius: 4, background: 'var(--muted)', width: w, animation: 'pulse 1.5s ease infinite' }} />
      </td>
    ))}
  </tr>
);

// ─── Main table ───────────────────────────────────────────────────────────────

interface Props {
  rows: ScreenerRow[];
  loading: boolean;
  error: Error | null;
  selectedSymbol?: string;
  onSelect: (row: ScreenerRow) => void;
  onRefresh: () => void;
  tab?: string;
}

export const ScreenerTable: React.FC<Props> = ({
  rows, loading, error, selectedSymbol, onSelect, onRefresh, tab,
}) => {
  const [sort, setSort] = useState<SortState>({ key: 'changePercent', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);

  const handleSort = useCallback((key: SortKey) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
    setPage(0);
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.symbol.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sort.key) {
        case 'symbol':        av = a.symbol;         bv = b.symbol;         break;
        case 'price':         av = a.price ?? 0;     bv = b.price ?? 0;     break;
        case 'changePercent': av = a.changePercent;  bv = b.changePercent;  break;
        case 'volume':        av = a.volume ?? 0;    bv = b.volume ?? 0;    break;
        case 'momentumScore': av = a.momentumScore;  bv = b.momentumScore;  break;
      }
      if (typeof av === 'string') {
        return sort.dir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      }
      return sort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const SortBtn: React.FC<{ k: SortKey; label: string; align?: 'left' | 'right' | 'center' }> = ({ k, label, align = 'left' }) => {
    const active = sort.key === k;
    return (
      <th
        onClick={() => handleSort(k)}
        style={{
          padding: '7px 12px',
          textAlign: align,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: active ? 'var(--primary)' : 'var(--muted-foreground)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {label}
          {active
            ? sort.dir === 'asc' ? <ArrowUp size={8} /> : <ArrowDown size={8} />
            : <ArrowUpDown size={8} style={{ opacity: 0.25 }} />}
        </span>
      </th>
    );
  };

  const emptyReason = error
    ? `Failed to load — ${error.message}`
    : tab === 'saved' ? 'No saved instruments yet. Search for a symbol above and click Save.'
    : 'No instruments match this filter.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--card)', flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '0 0 220px' }}>
          <Search size={11} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted-foreground)', pointerEvents: 'none',
          }} />
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            placeholder="Filter symbol or name…"
            style={{
              width: '100%', height: 30, paddingLeft: 28, paddingRight: 10,
              fontSize: 11, border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--background)', color: 'var(--foreground)', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Count */}
        {filtered.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
            {filtered.length} {filtered.length === 1 ? 'instrument' : 'instruments'}
          </span>
        )}

        {/* Loading indicator */}
        {loading && rows.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Refreshing…</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {error && rows.length === 0 && (
            <span style={{ fontSize: 10, color: 'var(--primary)' }}>Provider error</span>
          )}
          <button
            onClick={onRefresh}
            title="Refresh"
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--muted-foreground)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead style={{
            position: 'sticky', top: 0, zIndex: 2,
            background: 'var(--card)',
          }}>
            <tr>
              <SortBtn k="symbol"        label="Instrument" />
              <SortBtn k="price"         label="Last"       align="right" />
              <SortBtn k="changePercent" label="Change"     align="right" />
              <SortBtn k="volume"        label="Volume"     align="right" />
              <th style={{ padding: '7px 12px', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Intelligence</th>
              <th style={{ padding: '7px 12px', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Signal</th>
            </tr>
          </thead>
          <tbody>
            {/* Loading skeletons */}
            {rows.length === 0 && loading && Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} i={i} />)}

            {/* Empty / error */}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted-foreground)', fontSize: 12, lineHeight: 1.6 }}>
                  {emptyReason}
                  {error && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={onRefresh} style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Retry
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}

            {/* Data rows */}
            {visible.map((row, i) => {
              const isSelected = row.symbol === selectedSymbol;
              const isEven = (i + page * PAGE_SIZE) % 2 === 0;
              const baseBg = isSelected
                ? 'rgba(193,95,60,0.05)'
                : isEven ? 'transparent' : 'rgba(228,226,216,0.18)';

              return (
                <tr
                  key={row.symbol}
                  onClick={() => onSelect(row)}
                  style={{
                    background: baseBg,
                    cursor: 'pointer',
                    outline: isSelected ? '1px solid rgba(193,95,60,0.25)' : 'none',
                    outlineOffset: -1,
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(228,226,216,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = baseBg;
                  }}
                >
                  {/* Instrument: icon + symbol + name */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <AssetIcon symbol={row.symbol} size={22} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', color: 'var(--foreground)', lineHeight: 1.2 }}>
                          {row.symbol}
                        </div>
                        {row.name && row.name !== row.symbol && (
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.name}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Last price */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
                      {fmtPrice(row.price)}
                    </span>
                  </td>

                  {/* Change */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <ChangeCell pct={row.changePercent} abs={row.change} />
                  </td>

                  {/* Volume */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>
                      {fmtVol(row.volume)}
                    </span>
                  </td>

                  {/* Intelligence */}
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <IntelligenceCell row={row} />
                  </td>

                  {/* Signal */}
                  <td style={{ padding: '10px 16px 10px 12px', whiteSpace: 'nowrap' }}>
                    <SignalCell row={row} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--card)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            <PagBtn onClick={() => setPage((p) => p - 1)} disabled={page === 0} label="‹" />
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const start = Math.max(0, Math.min(page - 2, totalPages - 5));
              const p = start + i;
              return (
                <PagBtn key={p} onClick={() => setPage(p)} disabled={false} label={String(p + 1)} active={p === page} />
              );
            })}
            <PagBtn onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} label="›" />
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:0.35} 50%{opacity:0.7} }
      `}</style>
    </div>
  );
};

const PagBtn: React.FC<{ onClick: () => void; disabled: boolean; label: string; active?: boolean }> = ({ onClick, disabled, label, active }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: 26, height: 26, borderRadius: 5,
      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
      background: active ? 'rgba(193,95,60,0.08)' : 'var(--card)',
      color: active ? 'var(--primary)' : disabled ? 'var(--border)' : 'var(--foreground)',
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 11, fontWeight: active ? 700 : 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
  >
    {label}
  </button>
);
