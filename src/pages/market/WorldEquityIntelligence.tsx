import React, { useMemo, useState, useEffect } from 'react';
import { Globe, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Search, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { MarketPulseStrip } from '../../components/quant/MarketPulseStrip';
import { Sparkline } from '../../components/quant/Sparkline';
import { FreshnessBadge } from '../../components/quant/FreshnessBadge';
import { NewsList } from '../../components/quant/NewsList';
import { HeatmapGrid } from '../../components/market-dashboards/HeatmapGrid';
import { DashboardErrorState } from '../../components/market-dashboards/DashboardStates';
import { SummaryStrip } from '../../components/intelligence-drawer';
import { worldEquitySummary } from '../../lib/intelligence/summaries';
import { useWorldEquity } from '../../hooks/useDashboard';
import { useOHLCV, useNews } from '../../hooks/useMarket';
import {
  WORLD_EQUITY_SYMBOLS, classifyWorldEquity, type DashboardQuote,
} from '../../services/dashboardService';
import type { HeatmapGridGroup } from '../../components/market-dashboards/HeatmapGrid';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'symbol' | 'name' | 'price' | 'changePercent';
type SortDir = 'asc' | 'desc';
type GroupFilter = 'all' | 'us' | 'global' | 'developed' | 'emerging';
type ViewMode = 'table' | 'heatmap' | 'intelligence';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function getGroup(symbol: string) {
  return WORLD_EQUITY_SYMBOLS.find((s) => s.symbol === symbol)?.group ?? 'global';
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

// ─── Instrument detail panel (persistent) ────────────────────────────────────

const InstrumentPanel: React.FC<{ quote: DashboardQuote; onClose: () => void }> = ({ quote, onClose }) => {
  const pos = quote.changePercent > 0;
  const neg = quote.changePercent < 0;
  const changeColor = pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : 'var(--muted-foreground)';
  const group = getGroup(quote.symbol);

  const ohlcv = useOHLCV(quote.symbol, '1day', 60);
  const news  = useNews({ symbol: quote.symbol, limit: 5 });

  const priceHistory = useMemo(() =>
    ohlcv.data?.bars.map((b) => b.close) ?? [],
    [ohlcv.data],
  );

  const GROUP_LABELS: Record<string, string> = { us: 'US Index', global: 'Global', developed: 'Developed', emerging: 'Emerging' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em', fontFamily: 'monospace' }}>{quote.symbol}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>{quote.name}</p>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {GROUP_LABELS[group] ?? group}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', color: 'var(--muted-foreground)', flexShrink: 0 }}
            title="Close"
          >
            <X size={12} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
            {fmtPrice(quote.price)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: changeColor, fontVariantNumeric: 'tabular-nums' }}>
            {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(quote.changePercent).toFixed(2)}%
          </span>
        </div>
        {quote.change != null && (
          <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
            {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} today
          </p>
        )}
      </div>

      {priceHistory.length > 1 && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ margin: '0 0 5px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>60-Day Price</p>
          <Sparkline values={priceHistory} width={252} height={48} />
        </div>
      )}

      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'Open',       value: quote.open  != null ? fmtPrice(quote.open)  : '—' },
            { label: 'Prev Close', value: quote.previousClose != null ? fmtPrice(quote.previousClose) : '—' },
            { label: 'High',       value: quote.high  != null ? fmtPrice(quote.high)  : '—' },
            { label: 'Low',        value: quote.low   != null ? fmtPrice(quote.low)   : '—' },
          ].map((s) => (
            <div key={s.label}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 16px 20px' }}>
        <p style={{ margin: '0 0 7px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Related News</p>
        {news.loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[1, 2, 3].map((i) => <div key={i} style={{ height: 38, borderRadius: 5, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}
          </div>
        )}
        {!news.loading && news.data && news.data.length > 0 && <NewsList items={news.data} />}
        {!news.loading && (!news.data || news.data.length === 0) && <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>No recent news</p>}
      </div>
    </div>
  );
};

// ─── Intelligence panel ───────────────────────────────────────────────────────

const IntelligenceView: React.FC<{ quotes: DashboardQuote[] }> = ({ quotes }) => {
  const intel = useMemo(() => classifyWorldEquity(quotes), [quotes]);
  const ok = quotes.filter((q) => q.ok);
  const adv = ok.filter((q) => q.changePercent > 0).length;
  const dec = ok.filter((q) => q.changePercent < 0).length;
  const breadthPct = ok.length ? Math.round(adv / ok.length * 100) : 50;

  const Icon = intel.regime === 'risk-on' ? TrendingUp : intel.regime === 'risk-off' ? TrendingDown : Minus;
  const color = intel.regime === 'risk-on' ? 'var(--ds-gain)' : intel.regime === 'risk-off' ? 'var(--ds-loss)' : 'var(--muted-foreground)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 20px 24px' }}>
      {/* Regime banner */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10, background: `color-mix(in srgb, ${color} 8%, var(--card))`, border: `1px solid color-mix(in srgb, ${color} 20%, var(--border))` }}>
        <Icon size={20} style={{ color, marginTop: 2, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>{intel.headline}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{intel.note}</p>
        </div>
      </div>

      {/* Breadth */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Advancing', value: adv, color: 'var(--ds-gain)' },
          { label: 'Declining', value: dec, color: 'var(--ds-loss)' },
          { label: 'Unchanged', value: ok.length - adv - dec, color: 'var(--muted-foreground)' },
        ].map((b) => (
          <div key={b.label} style={{ textAlign: 'center', padding: '12px 0', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: b.color, fontVariantNumeric: 'tabular-nums' }}>{b.value}</p>
            <p style={{ margin: '3px 0 0', fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{b.label}</p>
          </div>
        ))}
      </div>

      {/* Breadth bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ds-gain)' }}>Breadth {breadthPct}%</span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{ok.length} instruments</span>
        </div>
        <div style={{ height: 7, borderRadius: 999, background: 'var(--muted)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${breadthPct}%`, background: adv > dec ? 'var(--ds-gain)' : 'var(--ds-loss)', borderRadius: 999, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Signals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {intel.signals.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.5 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const WorldEquityIntelligence: React.FC = () => {
  const { data: quotes, loading, error, status, fetchedAt, refresh } = useWorldEquity();

  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('table');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedSymbol(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const rows = useMemo(() => {
    if (!quotes) return [];
    return quotes
      .filter((q) => {
        if (!q.ok) return false;
        if (groupFilter !== 'all' && getGroup(q.symbol) !== groupFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          return q.symbol.toLowerCase().includes(s) || q.name.toLowerCase().includes(s);
        }
        return true;
      })
      .sort((a, b) => {
        const mult = sortDir === 'desc' ? -1 : 1;
        if (sortKey === 'symbol') return mult * a.symbol.localeCompare(b.symbol);
        if (sortKey === 'name')   return mult * a.name.localeCompare(b.name);
        if (sortKey === 'price')  return mult * (a.price - b.price);
        return mult * (a.changePercent - b.changePercent);
      });
  }, [quotes, groupFilter, search, sortKey, sortDir]);

  const heatmapGroups = useMemo((): HeatmapGridGroup[] => {
    if (!quotes) return [];
    const grouped: Record<string, DashboardQuote[]> = { us: [], global: [], developed: [], emerging: [] };
    const sizeMap: Record<string, 'xl' | 'lg' | 'md' | 'sm'> = { SPY: 'xl', QQQ: 'xl', IWM: 'lg', DIA: 'lg', ACWI: 'xl', VT: 'lg', EFA: 'xl', VEA: 'lg', EEM: 'xl', VWO: 'lg' };
    const labelMap: Record<string, string> = { us: 'US Indices', global: 'Global', developed: 'Developed', emerging: 'Emerging' };
    for (const q of quotes) {
      if (!q.ok) continue;
      const g = getGroup(q.symbol);
      grouped[g]?.push(q);
    }
    return Object.entries(grouped)
      .filter(([, qs]) => qs.length > 0)
      .map(([key, qs]) => ({
        name: labelMap[key],
        avgValue: qs.reduce((s, q) => s + q.changePercent, 0) / qs.length,
        cells: qs.map((q) => ({ id: q.symbol, label: q.symbol, sublabel: q.name, value: q.changePercent, size: sizeMap[q.symbol] ?? 'md' })),
      }));
  }, [quotes]);

  const selectedQuote = useMemo(
    () => quotes?.find((q) => q.symbol === selectedSymbol) ?? null,
    [quotes, selectedSymbol],
  );

  const ok = quotes?.filter((q) => q.ok) ?? [];

  const summary = useMemo(() => quotes ? worldEquitySummary(quotes) : null, [quotes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MarketPulseStrip />

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>World Equity Intelligence</span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', padding: '1px 7px', background: 'var(--muted)', borderRadius: 999, border: '1px solid var(--border)' }}>{ok.length} instruments</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <FreshnessBadge status={status} fetchedAt={fetchedAt} compact />
          <button onClick={refresh} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      <SummaryStrip payload={summary} />

      {/* Filter + view-mode bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Group pills */}
        {(['all', 'us', 'global', 'developed', 'emerging'] as GroupFilter[]).map((g) => {
          const labels = { all: 'All', us: 'US', global: 'Global', developed: 'Developed', emerging: 'Emerging' };
          return (
            <button key={g} onClick={() => setGroupFilter(g)} style={{ padding: '3px 10px', borderRadius: 999, border: `1px solid ${groupFilter === g ? 'var(--primary)' : 'var(--border)'}`, background: groupFilter === g ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'transparent', color: groupFilter === g ? 'var(--primary)' : 'var(--muted-foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 120ms' }}>
              {labels[g]}
            </button>
          );
        })}

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', flex: '0 1 200px' }}>
          <Search size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 11, color: 'var(--foreground)' }} />
          {search && <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: 0 }}><X size={10} /></button>}
        </div>

        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{rows.length} results</span>

        {/* View mode */}
        <div style={{ marginLeft: 'auto', display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
          {(['table', 'heatmap', 'intelligence'] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '4px 10px', border: 'none', background: view === v ? 'var(--primary)' : 'var(--muted)', color: view === v ? 'var(--primary-foreground)' : 'var(--muted-foreground)', fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', borderRight: '1px solid var(--border)' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === 'intelligence' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {quotes && <IntelligenceView quotes={quotes} />}
        </div>
      ) : view === 'heatmap' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {quotes && (
            <HeatmapGrid
              groups={heatmapGroups}
              onSelectCell={(id) => { setSelectedSymbol(id); setView('table'); }}
              selectedCell={selectedSymbol}
            />
          )}
        </div>
      ) : (
        /* Table + detail split */
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {error && !quotes && <div style={{ padding: 24 }}><DashboardErrorState message={error.message} onRetry={refresh} /></div>}

            {loading && !quotes && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 50, height: 13, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                    <div style={{ flex: 1, height: 13, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                    <div style={{ width: 70, height: 13, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                    <div style={{ width: 55, height: 20, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
                  </div>
                ))}
              </div>
            )}

            {quotes && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--background)' }}>
                  <tr>
                    <ColHeader label="Symbol" sortKey="symbol" active={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                    <ColHeader label="Name"   sortKey="name"   active={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Group</th>
                    <ColHeader label="Price"  sortKey="price"         active={sortKey} dir={sortDir} onSort={handleSort} />
                    <ColHeader label="Chg %"  sortKey="changePercent" active={sortKey} dir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => {
                    const isSelected = selectedSymbol === q.symbol;
                    const pos = q.changePercent > 0;
                    const neg = q.changePercent < 0;
                    const clr = pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : 'var(--muted-foreground)';
                    const group = getGroup(q.symbol);
                    const groupLabel: Record<string, string> = { us: 'US', global: 'Global', developed: 'DM', emerging: 'EM' };

                    return (
                      <tr
                        key={q.symbol}
                        onClick={() => setSelectedSymbol(isSelected ? null : q.symbol)}
                        style={{ borderBottom: '1px solid var(--border)', background: isSelected ? 'color-mix(in srgb, var(--primary) 5%, var(--card))' : 'transparent', cursor: 'pointer', transition: 'background 80ms' }}
                        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 10px 10px 20px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isSelected && <span style={{ width: 3, height: 16, borderRadius: 999, background: 'var(--primary)', flexShrink: 0 }} />}
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>{q.symbol}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px', fontSize: 12, color: 'var(--muted-foreground)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: group === 'us' ? 'var(--ds-gain-muted)' : group === 'emerging' ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--muted)', color: group === 'us' ? 'var(--ds-gain)' : group === 'emerging' ? 'var(--primary)' : 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {groupLabel[group] ?? group}
                          </span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>{fmtPrice(q.price)}</td>
                        <td style={{ padding: '10px 20px 10px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 7px', borderRadius: 5, background: pos ? 'var(--ds-gain-muted)' : neg ? 'var(--ds-loss-muted)' : 'transparent', color: clr, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(q.changePercent).toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Persistent right panel — width:0 by default, slides in on selection */}
          <div style={{
            width: selectedQuote ? 320 : 0,
            flexShrink: 0,
            overflowX: 'hidden',
            transition: 'width 240ms cubic-bezier(0.16,1,0.3,1)',
            borderLeft: selectedQuote ? '2px solid var(--border)' : 'none',
          }}>
            {selectedQuote && (
              <div style={{ minWidth: 320, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--card)', overflowY: 'auto' }}>
                <InstrumentPanel quote={selectedQuote} onClose={() => setSelectedSymbol(null)} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
