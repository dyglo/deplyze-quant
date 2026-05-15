import React, { useCallback, useMemo, useState } from 'react';
import { useBatchQuotes, useHeadlines, useOHLCV } from '../hooks/useMarket';
import { useArtifacts } from '../hooks/useArtifacts';
import { useTimeline } from '../hooks/useTimeline';
import { useWorkspace } from '../components/WorkspaceContext';
import { useDrawer } from '../components/quant/DataDrawer';
import { PageHeader } from '../components/quant/PageHeader';
import { MarketTile } from '../components/quant/MarketTile';
import { IntelligenceFeed } from '../components/quant/IntelligenceFeed';
import { ResearchTimeline } from '../components/quant/ResearchTimeline';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { InstrumentDrawerBody } from '../components/quant/InstrumentDrawerBody';
import { HeadlineDrawerBody } from '../components/quant/HeadlineDrawerBody';
import { RefreshCw } from 'lucide-react';
import { usePins } from '../hooks/usePins';

// Grouped by asset class for breadth of market coverage
const DEFAULT_WATCH = [
  'SPY', 'QQQ', 'IWM',          // US Equities — broad market
  'TLT', 'UUP',                  // Fixed income + USD
  'XAU/USD', 'WTI/USD',          // Commodities
  'EUR/USD', 'USD/JPY',          // FX
  'BTC/USD', 'ETH/USD',          // Crypto
];

/** Tile with its own (cached) sparkline fetch — small extra round-trip per tile,
 *  but each is cached for 6h and dedup'd by the shared client cache. */
const PulseTile: React.FC<{
  symbol: string;
  quote: import('../services/marketService').BatchQuoteRow | undefined;
  loading: boolean;
  onOpen: () => void;
}> = ({ symbol, quote, loading, onOpen }) => {
  const ohlcv = useOHLCV(symbol, '1day', 60);
  const closes = (ohlcv.data?.bars ?? []).map((b) => b.close);
  return (
    <MarketTile
      symbol={symbol}
      quote={quote?.ok ? quote.data : undefined}
      loading={loading}
      spark={closes}
      onClick={onOpen}
    />
  );
};

export const IntelligenceTerminal: React.FC = () => {
  const { currentWorkspace, currentProject } = useWorkspace();
  const drawer = useDrawer();
  const quotes = useBatchQuotes(DEFAULT_WATCH);
  const headlines = useHeadlines('markets macro central bank');
  const artifacts = useArtifacts(
    currentWorkspace?.id ?? null,
    currentProject?.id ?? null,
  );
  const timeline = useTimeline(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const { pinMap, pin, unpin } = usePins(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const pinnedIds = useMemo(() => new Set(pinMap.keys()), [pinMap]);
  const [activeTab, setActiveTab] = useState<'feed' | 'timeline'>('feed');

  // Feed shows only agent-generated artifacts; user saves go to Research Library
  const agentArtifacts = useMemo(
    () => artifacts.items.filter(a => !a.source || a.source === 'agent'),
    [artifacts.items],
  );

  const handleOpenArtifact = useCallback((id: string) => {
    const artifact = agentArtifacts.find((a) => a.id === id);
    if (!artifact) return;
    drawer.open({
      title: artifact.title,
      subtitle: artifact.category,
      width: 560,
      body: <ArtifactDetailDrawerBody artifact={artifact} relatedArtifacts={agentArtifacts} onOpenArtifact={handleOpenArtifact} />,
    });
  }, [agentArtifacts, drawer]);

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Intelligence Terminal"
        subtitle="Proactive, statistically ranked market intelligence — regime, volatility, correlation, and macro signals refreshed continuously."
      />

      {/* Market pulse */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 className="ds-heading" style={{ margin: 0 }}>Market Pulse</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FreshnessBadge status={quotes.status} fetchedAt={quotes.fetchedAt} />
            <button
              onClick={() => quotes.refresh()}
              title="Refresh quotes"
              style={{
                width: 26, height: 26, borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--muted-foreground)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} style={{ animation: quotes.isFetching ? 'spin 1s linear infinite' : undefined }} />
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {DEFAULT_WATCH.map((sym) => {
            const row = quotes.data?.find((q) => q.symbol === sym);
            return (
              <PulseTile
                key={sym}
                symbol={sym}
                quote={row}
                loading={quotes.loading}
                onOpen={() => drawer.open({
                  title: sym,
                  subtitle: 'Instrument intelligence',
                  width: 560,
                  body: <InstrumentDrawerBody symbol={sym} />,
                })}
              />
            );
          })}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        {/* Intelligence Feed / Research Timeline */}
        <section>
          {/* Tab bar */}
          <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
            {(['feed', 'timeline'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '7px 14px',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 700 : 500,
                  color: activeTab === tab ? 'var(--primary)' : 'var(--muted-foreground)',
                  marginBottom: -1,
                  transition: 'color 0.12s, border-color 0.12s',
                }}
              >
                {tab === 'feed' ? 'Intelligence Feed' : 'Research Timeline'}
              </button>
            ))}
          </nav>

          {activeTab === 'feed' ? (
            <IntelligenceFeed
              items={agentArtifacts}
              loading={artifacts.loading}
              emptyTitle="No intelligence artifacts yet"
              emptyHint="Autonomous research agents start producing artifacts in Phase 5. Until then the feed will be empty; the Research Copilot is available for on-demand analysis."
              onOpen={handleOpenArtifact}
            />
          ) : (
            <ResearchTimeline
              events={timeline.events}
              loading={timeline.loading}
              onOpenArtifact={handleOpenArtifact}
              pinnedIds={pinnedIds}
              onPin={pin}
              onUnpin={unpin}
            />
          )}
        </section>

        {/* Headlines */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="ds-heading" style={{ margin: 0 }}>Live Headlines</h2>
            <FreshnessBadge status={headlines.status} fetchedAt={headlines.fetchedAt} compact />
          </div>
          {headlines.loading ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="ds-surface" style={{ padding: '12px 14px', borderRadius: 10, opacity: 0.5, height: 72 }} />
              ))}
            </div>
          ) : !headlines.data || headlines.data.length === 0 ? (
            <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No headlines available.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {headlines.data.slice(0, 12).map((h, i) => {
                const publishedAt = h.date ? Date.parse(h.date) : undefined;
                const ago = publishedAt ? (() => {
                  const s = Math.floor((Date.now() - publishedAt) / 1000);
                  if (s < 60) return `${s}s ago`;
                  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                  return `${Math.floor(s / 3600)}h ago`;
                })() : h.date ?? null;
                return (
                <li key={`${i}-${h.link}`}>
                  <button
                    onClick={() => drawer.open({
                      title: h.title,
                      subtitle: h.source,
                      body: <HeadlineDrawerBody item={{
                        title: h.title,
                        summary: h.snippet,
                        url: h.link,
                        source: h.source,
                        publishedAt,
                      }} />,
                    })}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '11px 14px', borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--card)', cursor: 'pointer', color: 'inherit',
                      display: 'grid', gap: 5,
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 3%, var(--card))'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)'; }}
                  >
                    {/* Source + time row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                        padding: '1px 6px', borderRadius: 999,
                        background: 'rgba(193,95,60,0.08)',
                        color: 'var(--primary)',
                        border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                        flexShrink: 0,
                      }}>{h.source}</span>
                      {ago && (
                        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto', flexShrink: 0 }}>
                          {ago}
                        </span>
                      )}
                    </div>
                    {/* Headline */}
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.01em', color: 'var(--foreground)' }}>
                      {h.title}
                    </p>
                    {/* Snippet */}
                    {h.snippet && (
                      <p style={{
                        margin: 0, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {h.snippet}
                      </p>
                    )}
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Disclaimer />
    </div>
  );
};
