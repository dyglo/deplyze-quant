import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';
import { useWorkspace } from '../../components/WorkspaceContext';
import { subscribeToWatchlists } from '../../services/portfolioService';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { useSWR } from '../../hooks/useSWR';
import { fetchQuotes } from '../../services/marketService';
import { Flag } from './Flag';
import { ChangeCell } from './ChangeCell';
import { fmtPrice, symbolCountry } from './format';
import type { IntelligenceWatchlist } from '../../lib/portfolio/schemas';

const Header: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--foreground)' }}>
      <Star size={12} style={{ color: 'var(--primary)' }} /> {children}
    </span>
    {action}
  </header>
);

interface WatchSource { title: string; label?: string; symbols: string[]; href: string }

const WatchlistQuotes: React.FC<{ symbols: string[] }> = ({ symbols }) => {
  const navigate = useNavigate();
  const key = symbols.slice(0, 8).join(',');
  const { data, loading } = useSWR(
    () => (key ? fetchQuotes(symbols.slice(0, 8)) : Promise.resolve([])),
    [key],
    { cacheKey: key ? `marketHome:watchlistQuotes:${key}` : undefined },
  );
  const rows = data ?? [];

  if (loading && rows.length === 0) {
    return <div style={{ display: 'grid', gap: 4 }}>{Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 28, borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}</div>;
  }

  return (
    <div>
      {rows.map((r) => {
        const pct = r.data?.changePercent ?? 0;
        return (
          <button
            key={r.symbol}
            type="button"
            disabled={!r.ok}
            onClick={r.ok ? () => navigate(`/instruments/${encodeURIComponent(r.symbol)}`) : undefined}
            className="ds-transition-fast"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
              padding: '6px 2px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
              textAlign: 'left', cursor: r.ok ? 'pointer' : 'default',
            }}
            onMouseEnter={(e) => { if (r.ok) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <Flag iso={symbolCountry(r.symbol)} width={16} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--foreground)' }}>{r.symbol}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>{r.ok && r.data ? fmtPrice(r.data.price) : '—'}</span>
              <ChangeCell changePercent={pct} ok={r.ok} />
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const WatchlistRail: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [watchlists, setWatchlists] = useState<IntelligenceWatchlist[]>([]);
  const [wlLoading, setWlLoading] = useState(true);

  // Holdings fall back here so a user with positions but no explicit watchlist
  // still sees their book, rather than an empty create-prompt.
  const { portfolios, selectedPortfolio, holdings, loading: pfLoading } = usePortfolioWorkspace();

  useEffect(() => {
    if (!user || !currentWorkspace) { setWatchlists([]); setWlLoading(false); return; }
    setWlLoading(true);
    const unsub = subscribeToWatchlists(user.uid, currentWorkspace.id, (wl) => {
      setWatchlists(wl);
      setWlLoading(false);
    });
    return unsub;
  }, [user, currentWorkspace]);

  if (wlLoading || pfLoading) return null;

  const activeWatchlist = watchlists.find((w) => w.symbols.length > 0);
  const holdingSymbols = holdings.map((h) => h.symbol).filter(Boolean);

  let source: WatchSource | null = null;
  if (activeWatchlist) {
    source = { title: 'My Watchlist', label: activeWatchlist.name, symbols: activeWatchlist.symbols, href: '/portfolio/holdings' };
  } else if (holdingSymbols.length > 0) {
    source = { title: 'My Holdings', label: selectedPortfolio?.name, symbols: holdingSymbols, href: '/portfolio/holdings' };
  } else if (portfolios.length > 0) {
    // Has a portfolio but no holdings/watchlist yet.
    source = { title: 'My Holdings', label: selectedPortfolio?.name, symbols: [], href: '/portfolio/holdings' };
  }

  if (!source) {
    return (
      <section>
        <Header>My Watchlist</Header>
        <button
          type="button"
          onClick={() => navigate('/portfolio/holdings')}
          className="ds-transition-fast"
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer' }}
        >
          <Star size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>Add holdings or a watchlist to track symbols here.</span>
        </button>
      </section>
    );
  }

  return (
    <section>
      <Header action={
        <button onClick={() => navigate(source.href)} className="ds-transition-fast" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          {source.label ?? 'Open'} <ArrowUpRight size={11} />
        </button>
      }>{source.title}</Header>
      {source.symbols.length === 0 ? (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '8px 2px' }}>No symbols yet — add holdings in the portfolio workspace.</p>
      ) : (
        <WatchlistQuotes symbols={source.symbols} />
      )}
    </section>
  );
};
