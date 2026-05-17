import React, { useMemo, useState } from 'react';
import { Map, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Search, X } from 'lucide-react';
import { useOHLCV, useNews } from '../../hooks/useMarket';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';
import { Sparkline } from '../../components/quant/Sparkline';
import { FreshnessBadge } from '../../components/quant/FreshnessBadge';
import { NewsList } from '../../components/quant/NewsList';
import { DashboardErrorState } from '../../components/market-dashboards/DashboardStates';
import { useCountryETFs } from '../../hooks/useDashboard';
import { COUNTRY_ETF_SYMBOLS, type DashboardQuote } from '../../services/dashboardService';
import { flagEmoji } from '../../lib/flagEmoji';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'price' | 'changePercent';
type SortDir = 'asc' | 'desc';
type RegionFilter = 'all' | 'developed' | 'emerging';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return n >= 100 ? n.toFixed(2) : n.toFixed(2);
}

function fmtChg(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function getRegion(symbol: string): 'developed' | 'emerging' {
  return COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === symbol)?.region ?? 'developed';
}

function getCountryCode(symbol: string): string {
  return COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === symbol)?.country ?? 'US';
}

// ─── Column header ────────────────────────────────────────────────────────────

const ColHeader: React.FC<{
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}> = ({ label, sortKey, active, dir, onSort, align = 'right' }) => (
  <th
    onClick={() => onSort(sortKey)}
    style={{
      padding: '8px 10px',
      textAlign: align,
      fontSize: 10,
      fontWeight: 600,
      color: active === sortKey ? 'var(--primary)' : 'var(--muted-foreground)',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      userSelect: 'none',
      borderBottom: '1px solid var(--border)',
    }}
  >
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {label}
      {active === sortKey
        ? (dir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />)
        : <ArrowUpDown size={10} style={{ opacity: 0.4 }} />}
    </span>
  </th>
);

// ─── Country detail panel ─────────────────────────────────────────────────────

const CountryDetailPanel: React.FC<{ quote: DashboardQuote }> = ({ quote }) => {
  const countryCode = getCountryCode(quote.symbol);
  const region = getRegion(quote.symbol);
  const pos = quote.changePercent > 0;
  const neg = quote.changePercent < 0;
  const changeColor = pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : 'var(--muted-foreground)';

  const ohlcv = useOHLCV(quote.symbol, '1day', 60);
  const news  = useNews({ symbol: quote.symbol, limit: 5 });

  const priceHistory = useMemo(() =>
    ohlcv.data?.bars.map((b) => b.close) ?? [],
    [ohlcv.data],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 32, lineHeight: 1 }}>{flagEmoji(countryCode)}</span>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>{quote.name}</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>{quote.symbol}</span>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: region === 'developed' ? 'var(--ds-gain-muted)' : 'color-mix(in srgb, var(--primary) 12%, transparent)', color: region === 'developed' ? 'var(--ds-gain)' : 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {region === 'developed' ? 'DM' : 'EM'}
              </span>
            </div>
          </div>
        </div>

        {/* Price + change */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
            {fmtPrice(quote.price)}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: changeColor, fontVariantNumeric: 'tabular-nums' }}>
            {pos ? '▲' : neg ? '▼' : '·'} {fmtChg(quote.changePercent)}
          </span>
        </div>
        {quote.change != null && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
            {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} today
          </p>
        )}
      </div>

      {/* Sparkline */}
      {priceHistory.length > 1 && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            60-Day Price
          </p>
          <Sparkline values={priceHistory} width={240} height={52} />
        </div>
      )}

      {/* OHLC stats */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Open',  value: quote.open  != null ? fmtPrice(quote.open)  : '—' },
            { label: 'Prev Close', value: quote.previousClose != null ? fmtPrice(quote.previousClose) : '—' },
            { label: 'High',  value: quote.high  != null ? fmtPrice(quote.high)  : '—' },
            { label: 'Low',   value: quote.low   != null ? fmtPrice(quote.low)   : '—' },
          ].map((s) => (
            <div key={s.label}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* News */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
        <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Related News
        </p>
        {news.loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 40, borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
            ))}
          </div>
        )}
        {!news.loading && news.data && news.data.length > 0 && (
          <NewsList items={news.data} />
        )}
        {!news.loading && (!news.data || news.data.length === 0) && (
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>No recent news</p>
        )}
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const CountriesRegionalMarkets: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useCountryETFs();

  const [sortKey, setSortKey]       = useState<SortKey>('changePercent');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [region, setRegion]         = useState<RegionFilter>('all');
  const [search, setSearch]         = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const rows = useMemo(() => {
    if (!quotes) return [];
    return quotes
      .filter((q) => {
        if (!q.ok) return false;
        const meta = COUNTRY_ETF_SYMBOLS.find((c) => c.symbol === q.symbol);
        if (!meta) return false;
        if (region !== 'all' && meta.region !== region) return false;
        if (search) {
          const s = search.toLowerCase();
          return (
            q.symbol.toLowerCase().includes(s) ||
            q.name.toLowerCase().includes(s) ||
            meta.country.toLowerCase().includes(s)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const mult = sortDir === 'desc' ? -1 : 1;
        if (sortKey === 'name')          return mult * a.name.localeCompare(b.name);
        if (sortKey === 'price')         return mult * (a.price - b.price);
        if (sortKey === 'changePercent') return mult * (a.changePercent - b.changePercent);
        return 0;
      });
  }, [quotes, region, search, sortKey, sortDir]);

  const selectedQuote = useMemo(
    () => quotes?.find((q) => q.symbol === selectedSymbol) ?? null,
    [quotes, selectedSymbol],
  );

  const ok = quotes?.filter((q) => q.ok) ?? [];
  const devOk = ok.filter((q) => getRegion(q.symbol) === 'developed');
  const emOk  = ok.filter((q) => getRegion(q.symbol) === 'emerging');
  const devAvg = devOk.length ? devOk.reduce((s, q) => s + q.changePercent, 0) / devOk.length : 0;
  const emAvg  = emOk.length  ? emOk.reduce((s, q) => s + q.changePercent, 0)  / emOk.length  : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MarketPulseStrip />

      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--background)', flexShrink: 0,
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Map size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
            Countries & Regional Markets
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', padding: '1px 7px', background: 'var(--muted)', borderRadius: 999, border: '1px solid var(--border)' }}>
            {ok.length} ETFs
          </span>
        </div>

        {/* DM / EM summary chips */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { label: 'DM Avg', value: devAvg, count: devOk.length },
            { label: 'EM Avg', value: emAvg,  count: emOk.length },
          ].map((b) => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)' }}>{b.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: b.value >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)' }}>
                {b.value >= 0 ? '+' : ''}{b.value.toFixed(2)}%
              </span>
            </div>
          ))}
          <FreshnessBadge status={status} fetchedAt={fetchedAt} compact />
          <button onClick={refresh} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--card)', flexShrink: 0,
      }}>
        {/* Region pills */}
        {(['all', 'developed', 'emerging'] as RegionFilter[]).map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            style={{
              padding: '4px 12px', borderRadius: 999,
              border: `1px solid ${region === r ? 'var(--primary)' : 'var(--border)'}`,
              background: region === r ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'transparent',
              color: region === r ? 'var(--primary)' : 'var(--muted-foreground)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            {r === 'all' ? 'All' : r === 'developed' ? 'Developed' : 'Emerging'}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', flex: '0 1 220px' }}>
          <Search size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country or code…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 11, color: 'var(--foreground)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: 0 }}>
              <X size={10} />
            </button>
          )}
        </div>

        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 2 }}>
          {rows.length} results
        </span>
      </div>

      {/* Main split layout */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Left: dense table ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {error && !quotes && (
            <div style={{ padding: 24 }}>
              <DashboardErrorState message={error.message} onRetry={refresh} />
            </div>
          )}

          {loading && !quotes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 28, height: 20, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                  <div style={{ flex: 1, height: 13, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                  <div style={{ width: 60, height: 13, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                  <div style={{ width: 50, height: 13, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                </div>
              ))}
            </div>
          )}

          {quotes && rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--background)' }}>
                <tr>
                  <th style={{ padding: '8px 20px 8px 20px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Country</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>ETF</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Region</th>
                  <ColHeader label="Price"  sortKey="price"         active={sortKey} dir={sortDir} onSort={handleSort} />
                  <ColHeader label="Chg %"  sortKey="changePercent" active={sortKey} dir={sortDir} onSort={handleSort} />
                  <th style={{ padding: '8px 20px 8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => {
                  const isSelected = selectedSymbol === q.symbol;
                  const pos = q.changePercent > 0;
                  const neg = q.changePercent < 0;
                  const clr = pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : 'var(--muted-foreground)';
                  const countryCode = getCountryCode(q.symbol);
                  const reg = getRegion(q.symbol);

                  return (
                    <tr
                      key={q.symbol}
                      onClick={() => setSelectedSymbol(isSelected ? null : q.symbol)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSelected
                          ? 'color-mix(in srgb, var(--primary) 5%, var(--card))'
                          : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 80ms ease',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {/* Flag + Name */}
                      <td style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isSelected && <span style={{ width: 3, height: 16, borderRadius: 999, background: 'var(--primary)', flexShrink: 0 }} />}
                          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{flagEmoji(countryCode)}</span>
                          <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: 'var(--foreground)' }}>{q.name}</span>
                        </div>
                      </td>

                      {/* ETF ticker */}
                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em', padding: '1px 6px', background: 'var(--muted)', borderRadius: 5, border: '1px solid var(--border)' }}>
                          {q.symbol}
                        </span>
                      </td>

                      {/* Region badge */}
                      <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                          background: reg === 'developed' ? 'var(--ds-gain-muted)' : 'color-mix(in srgb, var(--primary) 10%, transparent)',
                          color: reg === 'developed' ? 'var(--ds-gain)' : 'var(--primary)',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                          {reg === 'developed' ? 'DM' : 'EM'}
                        </span>
                      </td>

                      {/* Price */}
                      <td style={{ padding: '10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                        {fmtPrice(q.price)}
                      </td>

                      {/* Change % — inline colored chip */}
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                          padding: '2px 7px', borderRadius: 5,
                          background: pos ? 'var(--ds-gain-muted)' : neg ? 'var(--ds-loss-muted)' : 'transparent',
                          color: clr,
                          fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        }}>
                          {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(q.changePercent).toFixed(2)}%
                        </span>
                      </td>

                      {/* Sparkline placeholder — no data without extra fetch */}
                      <td style={{ padding: '10px 20px 10px 10px', textAlign: 'right' }}>
                        <span style={{ fontSize: 9, color: 'var(--muted-foreground)', opacity: 0.4 }}>—</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {quotes && rows.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
              No results for current filter
            </div>
          )}
        </div>

        {/* ── Right: persistent detail panel ────────────────────────────────── */}
        {selectedQuote ? (
          <div style={{
            width: 300,
            borderLeft: '2px solid var(--border)',
            background: 'var(--card)',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <CountryDetailPanel quote={selectedQuote} />
          </div>
        ) : (
          <div style={{
            width: 240,
            borderLeft: '1px solid var(--border)',
            background: 'var(--card)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--muted-foreground)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', padding: '0 16px', marginBottom: 8 }}>
              {COUNTRY_ETF_SYMBOLS.slice(0, 9).map((c) => (
                <span key={c.symbol} style={{ fontSize: 20 }}>{flagEmoji(c.country)}</span>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textAlign: 'center', padding: '0 24px' }}>Select a country to view detail</p>
            <p style={{ margin: 0, fontSize: 10, textAlign: 'center', padding: '0 24px', lineHeight: 1.5 }}>Click any row to open price history, stats, and news</p>
          </div>
        )}
      </div>
    </div>
  );
};
