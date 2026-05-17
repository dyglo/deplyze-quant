import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Map, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Search, X,
  TrendingUp, TrendingDown, Globe, ChevronDown,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
  CartesianGrid,
} from 'recharts';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';
import { FreshnessBadge } from '../../components/quant/FreshnessBadge';
import { DashboardErrorState } from '../../components/market-dashboards/DashboardStates';
import { useCountryETFs } from '../../hooks/useDashboard';
import { useBatchQuotes, useOHLCV, useNews } from '../../hooks/useMarket';
import {
  COUNTRY_DATABASE, searchCountries, countryFlagUrl,
  CONTINENT_LABELS, REGION_LABELS,
  type CountryEntry, type Region, type Continent,
} from '../../lib/countryDatabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'price' | 'changePercent' | 'region';
type SortDir = 'asc' | 'desc';
type TimeframeKey = '1M' | '3M' | '1Y';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtChg(n: number)   { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }

const TF_BARS: Record<TimeframeKey, number> = { '1M': 22, '3M': 66, '1Y': 252 };

// ─── Flag image ───────────────────────────────────────────────────────────────

const CountryFlag: React.FC<{ isoCode: string; size?: number }> = ({ isoCode, size = 20 }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: Math.round(size * 0.67),
        borderRadius: 2, background: 'var(--muted)', border: '1px solid var(--border)',
        fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)',
        letterSpacing: '0.02em',
      }}>
        {isoCode}
      </span>
    );
  }
  return (
    <img
      src={countryFlagUrl(isoCode, 20)}
      alt={isoCode}
      width={size}
      height={Math.round(size * 0.67)}
      onError={() => setFailed(true)}
      style={{ borderRadius: 2, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0, display: 'block' }}
    />
  );
};

// ─── OHLCV chart inside detail panel ─────────────────────────────────────────

const ChartTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 11 }}>
      <p style={{ margin: 0, fontSize: 9, color: 'var(--muted-foreground)' }}>{label}</p>
      <p style={{ margin: '1px 0 0', fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(v)}</p>
    </div>
  );
};

const PriceChart: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [tf, setTf] = useState<TimeframeKey>('3M');
  const ohlcv = useOHLCV(symbol, '1day', TF_BARS[tf]);

  const chartData = useMemo(() => {
    if (!ohlcv.data?.bars) return [];
    return ohlcv.data.bars.map((b) => ({
      date: new Date(b.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      close: b.close,
    }));
  }, [ohlcv.data]);

  const isUp = chartData.length > 1 ? chartData[chartData.length - 1].close >= chartData[0].close : true;
  const stroke = isUp ? 'var(--ds-gain)' : 'var(--ds-loss)';

  return (
    <div>
      {/* Timeframe pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['1M', '3M', '1Y'] as TimeframeKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            style={{
              padding: '2px 8px', borderRadius: 5,
              border: `1px solid ${tf === t ? 'var(--primary)' : 'var(--border)'}`,
              background: tf === t ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'transparent',
              color: tf === t ? 'var(--primary)' : 'var(--muted-foreground)',
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {ohlcv.loading && (
        <div style={{ height: 120, borderRadius: 8, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
      )}

      {!ohlcv.loading && chartData.length > 1 && (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} tickFormatter={(v) => fmtPrice(v)} />
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="close" stroke={stroke} strokeWidth={1.5} fill={`url(#grad-${symbol})`} dot={false} activeDot={{ r: 3, fill: stroke, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {!ohlcv.loading && chartData.length <= 1 && (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
          No price history
        </div>
      )}
    </div>
  );
};

// ─── Country detail panel ─────────────────────────────────────────────────────

const CountryDetailPanel: React.FC<{
  entry: CountryEntry;
  price?: number;
  changePercent?: number;
  change?: number;
  high?: number;
  low?: number;
  onClose: () => void;
}> = ({ entry, price, changePercent, change, high, low, onClose }) => {
  const pos = (changePercent ?? 0) > 0;
  const neg = (changePercent ?? 0) < 0;
  const changeColor = pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : 'var(--muted-foreground)';
  const news = useNews({ symbol: entry.etf ?? undefined, limit: 5 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Panel header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '16px 16px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CountryFlag isoCode={entry.isoCode} size={32} />
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{entry.name}</p>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 4 }}>
              {entry.etf && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em', padding: '1px 6px', background: 'var(--muted)', borderRadius: 5, border: '1px solid var(--border)' }}>
                  {entry.etf}
                </span>
              )}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                background: entry.region === 'developed' ? 'var(--ds-gain-muted)' : entry.region === 'emerging' ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--muted)',
                color: entry.region === 'developed' ? 'var(--ds-gain)' : entry.region === 'emerging' ? 'var(--primary)' : 'var(--muted-foreground)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {REGION_LABELS[entry.region]}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--muted)', cursor: 'pointer', color: 'var(--muted-foreground)',
            flexShrink: 0,
          }}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      {/* Price */}
      {price != null ? (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
              {fmtPrice(price)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: changeColor, fontVariantNumeric: 'tabular-nums' }}>
              {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(changePercent ?? 0).toFixed(2)}%
            </span>
          </div>
          {change != null && (
            <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} today
            </p>
          )}
          {/* OHLC row */}
          {(high != null || low != null) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {high != null && <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>H <span style={{ color: 'var(--ds-gain)', fontWeight: 600 }}>{fmtPrice(high)}</span></span>}
              {low  != null && <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>L <span style={{ color: 'var(--ds-loss)', fontWeight: 600 }}>{fmtPrice(low)}</span></span>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
            {entry.etf ? 'Loading price data…' : 'No liquid ETF available for this country'}
          </p>
          {!entry.etf && (
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
              Consider using iShares MSCI All Country World (ACWI) as a proxy.
            </p>
          )}
        </div>
      )}

      {/* Price chart */}
      {entry.etf && price != null && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Price History — {entry.etf}
          </p>
          <PriceChart symbol={entry.etf} />
        </div>
      )}

      {/* ETF info */}
      {entry.etfName && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ETF Vehicle</p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--foreground)' }}>{entry.etfName}</p>
          <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{entry.continent ? CONTINENT_LABELS[entry.continent] : ''}</p>
        </div>
      )}

      {/* News */}
      {entry.etf && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Related News
          </p>
          {news.loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[1, 2, 3].map((i) => <div key={i} style={{ height: 40, borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}
            </div>
          )}
          {!news.loading && news.data && news.data.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {news.data.slice(0, 6).map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block', padding: '8px 10px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'var(--muted)',
                    textDecoration: 'none', transition: 'border-color 100ms',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                >
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.headline}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 9, color: 'var(--muted-foreground)' }}>
                    {item.source} · {new Date(item.publishedAt).toLocaleDateString()}
                  </p>
                </a>
              ))}
            </div>
          )}
          {!news.loading && (!news.data || news.data.length === 0) && (
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>No recent news</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Column sort header ───────────────────────────────────────────────────────

const ColHeader: React.FC<{
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; align?: 'left' | 'right';
}> = ({ label, sortKey, active, dir, onSort, align = 'right' }) => (
  <th
    onClick={() => onSort(sortKey)}
    style={{ padding: '8px 10px', textAlign: align, fontSize: 10, fontWeight: 600, color: active === sortKey ? 'var(--primary)' : 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', borderBottom: '1px solid var(--border)' }}
  >
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {label}
      {active === sortKey ? (dir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />) : <ArrowUpDown size={10} style={{ opacity: 0.4 }} />}
    </span>
  </th>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export const CountriesRegionalMarkets: React.FC = () => {
  const { data: liveQuotes, loading: quotesLoading, error, status, fetchedAt, refresh } = useCountryETFs();

  // Build a live quote map from fetched data
  const liveMap = useMemo(() => {
    const m: Record<string, { price: number; changePercent: number; change?: number; high?: number; low?: number }> = {};
    liveQuotes?.filter((q) => q.ok).forEach((q) => {
      m[q.symbol] = { price: q.price, changePercent: q.changePercent, change: q.change, high: q.high, low: q.low };
    });
    return m;
  }, [liveQuotes]);

  const [sortKey, setSortKey]           = useState<SortKey>('changePercent');
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const [continentFilter, setContinentFilter] = useState<Continent | 'all'>('all');
  const [search, setSearch]             = useState('');
  const [selectedEntry, setSelectedEntry] = useState<CountryEntry | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close panel on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedEntry(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Filter + sort across FULL country database (not just fetched quotes)
  const rows = useMemo(() => {
    let entries = searchCountries(search);
    if (regionFilter !== 'all') entries = entries.filter((e) => e.region === regionFilter);
    if (continentFilter !== 'all') entries = entries.filter((e) => e.continent === continentFilter);

    return [...entries].sort((a, b) => {
      const mult = sortDir === 'desc' ? -1 : 1;
      if (sortKey === 'name') return mult * a.name.localeCompare(b.name);
      if (sortKey === 'region') return mult * a.region.localeCompare(b.region);
      if (sortKey === 'price') {
        const pa = liveMap[a.etf ?? '']?.price ?? -Infinity;
        const pb = liveMap[b.etf ?? '']?.price ?? -Infinity;
        return mult * (pa - pb);
      }
      if (sortKey === 'changePercent') {
        const ca = liveMap[a.etf ?? '']?.changePercent ?? -Infinity;
        const cb = liveMap[b.etf ?? '']?.changePercent ?? -Infinity;
        return mult * (ca - cb);
      }
      return 0;
    });
  }, [search, regionFilter, continentFilter, sortKey, sortDir, liveMap]);

  const liveCount = Object.keys(liveMap).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MarketPulseStrip />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Map size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>Countries & Regional Markets</span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', padding: '1px 7px', background: 'var(--muted)', borderRadius: 999, border: '1px solid var(--border)' }}>
            {COUNTRY_DATABASE.length} countries · {liveCount} live
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <FreshnessBadge status={status} fetchedAt={fetchedAt} compact />
          <button onClick={refresh} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Search — searches all 60+ countries */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', flex: '0 1 260px' }}>
          <Search size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search any country, region, ETF…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--foreground)' }}
          />
          {search && (
            <button onClick={() => { setSearch(''); searchRef.current?.focus(); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: 0 }}>
              <X size={11} />
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Region pills */}
        {(['all', 'developed', 'emerging', 'frontier'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRegionFilter(r)}
            style={{
              padding: '3px 10px', borderRadius: 999,
              border: `1px solid ${regionFilter === r ? 'var(--primary)' : 'var(--border)'}`,
              background: regionFilter === r ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'transparent',
              color: regionFilter === r ? 'var(--primary)' : 'var(--muted-foreground)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 120ms',
            }}
          >
            {r === 'all' ? 'All' : REGION_LABELS[r]}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Continent dropdown */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 7, border: `1px solid ${continentFilter !== 'all' ? 'var(--primary)' : 'var(--border)'}`, background: continentFilter !== 'all' ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'transparent', cursor: 'pointer' }}>
          <Globe size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <select
            value={continentFilter}
            onChange={(e) => setContinentFilter(e.target.value as Continent | 'all')}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11, fontWeight: 600, color: continentFilter !== 'all' ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer', appearance: 'none', paddingRight: 14 }}
          >
            <option value="all">All Continents</option>
            {(Object.keys(CONTINENT_LABELS) as Continent[]).map((c) => (
              <option key={c} value={c}>{CONTINENT_LABELS[c]}</option>
            ))}
          </select>
          <ChevronDown size={11} style={{ color: 'var(--muted-foreground)', pointerEvents: 'none', marginLeft: -14 }} />
        </div>

        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{rows.length} results</span>
      </div>

      {/* Main split layout */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>

          {error && !liveQuotes && <div style={{ padding: 24 }}><DashboardErrorState message={error.message} onRetry={refresh} /></div>}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--background)' }}>
              <tr>
                <th style={{ padding: '8px 20px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Country</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>ETF</th>
                <ColHeader label="Region"  sortKey="region"         active={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                <ColHeader label="Price"   sortKey="price"          active={sortKey} dir={sortDir} onSort={handleSort} />
                <ColHeader label="Chg %"   sortKey="changePercent"  active={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const live = entry.etf ? liveMap[entry.etf] : undefined;
                const isSelected = selectedEntry?.isoCode === entry.isoCode;
                const pos = (live?.changePercent ?? 0) > 0;
                const neg = (live?.changePercent ?? 0) < 0;
                const clr = pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : 'var(--muted-foreground)';

                return (
                  <tr
                    key={entry.isoCode}
                    onClick={() => setSelectedEntry(isSelected ? null : entry)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'color-mix(in srgb, var(--primary) 5%, var(--card))' : 'transparent',
                      cursor: 'pointer', transition: 'background 80ms ease',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Country + flag */}
                    <td style={{ padding: '9px 20px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isSelected && <span style={{ width: 3, height: 16, borderRadius: 999, background: 'var(--primary)', flexShrink: 0 }} />}
                        <CountryFlag isoCode={entry.isoCode} size={22} />
                        <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 400, color: 'var(--foreground)' }}>{entry.name}</span>
                      </div>
                    </td>

                    {/* ETF */}
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      {entry.etf ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', padding: '1px 6px', background: 'var(--muted)', borderRadius: 5, border: '1px solid var(--border)', letterSpacing: '0.03em' }}>
                          {entry.etf}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', opacity: 0.5 }}>—</span>
                      )}
                    </td>

                    {/* Region */}
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                        background: entry.region === 'developed' ? 'var(--ds-gain-muted)' : entry.region === 'emerging' ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--muted)',
                        color: entry.region === 'developed' ? 'var(--ds-gain)' : entry.region === 'emerging' ? 'var(--primary)' : 'var(--muted-foreground)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {REGION_LABELS[entry.region]}
                      </span>
                    </td>

                    {/* Price */}
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: live ? 'var(--foreground)' : 'var(--muted-foreground)', whiteSpace: 'nowrap', opacity: live ? 1 : 0.4 }}>
                      {live ? fmtPrice(live.price) : (quotesLoading && entry.etf ? '…' : '—')}
                    </td>

                    {/* Change % */}
                    <td style={{ padding: '9px 20px 9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {live ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 7px', borderRadius: 5, background: pos ? 'var(--ds-gain-muted)' : neg ? 'var(--ds-loss-muted)' : 'transparent', color: clr, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(live.changePercent).toFixed(2)}%
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', opacity: 0.4 }}>
                          {entry.etf ? (quotesLoading ? '…' : 'N/A') : 'No ETF'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              <Globe size={28} style={{ opacity: 0.2, margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>No countries match your search</p>
              <p style={{ fontSize: 11, margin: 0 }}>Try searching by country name, region, or ETF symbol</p>
            </div>
          )}
        </div>

        {/* ── Persistent detail panel ─────────────────────────────────────── */}
        <div style={{
          width: selectedEntry ? 320 : 200,
          borderLeft: `${selectedEntry ? 2 : 1}px solid var(--border)`,
          background: 'var(--card)',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 220ms cubic-bezier(0.16,1,0.3,1)',
        }}>
          {selectedEntry ? (
            <CountryDetailPanel
              entry={selectedEntry}
              price={selectedEntry.etf ? liveMap[selectedEntry.etf]?.price : undefined}
              changePercent={selectedEntry.etf ? liveMap[selectedEntry.etf]?.changePercent : undefined}
              change={selectedEntry.etf ? liveMap[selectedEntry.etf]?.change : undefined}
              high={selectedEntry.etf ? liveMap[selectedEntry.etf]?.high : undefined}
              low={selectedEntry.etf ? liveMap[selectedEntry.etf]?.low : undefined}
              onClose={() => setSelectedEntry(null)}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, padding: '0 20px', color: 'var(--muted-foreground)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginBottom: 4 }}>
                {['JP', 'DE', 'GB', 'CN', 'IN', 'BR', 'FR', 'AU', 'CA'].map((code) => (
                  <CountryFlag key={code} isoCode={code} size={18} />
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textAlign: 'center' }}>Select a country</p>
              <p style={{ margin: 0, fontSize: 10, textAlign: 'center', lineHeight: 1.5 }}>Click any row to view price chart, OHLC stats, and news</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
