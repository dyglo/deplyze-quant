import React, { useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { useInstrumentIntelligence } from '../hooks/useInstrument';
import { useQuote, useOHLCV, useNews } from '../hooks/useMarket';
import { useArtifacts, useBriefings } from '../hooks/useArtifacts';
import { PageHeader } from '../components/quant/PageHeader';
import { OHLCVChart } from '../components/quant/OHLCVChart';
import { NewsList } from '../components/quant/NewsList';
import { StatTile } from '../components/quant/StatTile';
import { AssetIcon } from '../components/quant/AssetIcon';
import { FreshnessBadge, SourceBadge } from '../components/quant/FreshnessBadge';
import { Disclaimer } from '../components/quant/Disclaimer';
import { RelatedIntelligencePanel } from '../components/quant/RelatedIntelligencePanel';
import { BenchmarkIntelligencePanel } from '../components/quant/BenchmarkIntelligencePanel';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { useDrawer } from '../components/quant/DataDrawer';
import { closes, logReturns, annualisedVol, maxDrawdown, trendLabel } from '../lib/quant';
import { createInstrumentSnapshot } from '../services/artifactService';
import { useWorkspace } from '../components/WorkspaceContext';
import { useAuth } from '../components/AuthProvider';

const TREND_COPY: Record<string, string> = {
  'strong-up':   'Strong uptrend',
  'up':          'Mild uptrend',
  'flat':        'Range-bound',
  'down':        'Mild downtrend',
  'strong-down': 'Strong downtrend',
  'insufficient': 'Insufficient data',
};

export const InstrumentDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const sym = symbol ? decodeURIComponent(symbol) : null;

  // Fast path: quote + bars + news independently, each cached.
  const quote = useQuote(sym);
  const ohlcv = useOHLCV(sym, '1day', 90);
  const news = useNews(sym ? { symbol: sym, limit: 8 } : {});
  // Slow path: composite endpoint with Gemini narrative.
  const intel = useInstrumentIntelligence(sym);

  const { currentWorkspace, currentProject } = useWorkspace();
  const { user } = useAuth();
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const briefings = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const drawer = useDrawer();

  const [savingSnap, setSavingSnap] = useState(false);

  const bars = ohlcv.data?.bars ?? [];
  const cs = useMemo(() => closes(bars), [bars]);
  const analytics = useMemo(() => {
    if (cs.length < 20) return null;
    const lr = logReturns(cs);
    const vol = annualisedVol(lr) * 100;
    const last60Closes = cs.slice(-60);
    const ret60 = last60Closes.length > 1 ? (last60Closes[last60Closes.length - 1] / last60Closes[0] - 1) * 100 : 0;
    // Build an equity curve from cumulative log returns for max drawdown.
    let eq = 1;
    const curve = [eq];
    for (const r of lr) { eq *= Math.exp(r); curve.push(eq); }
    const { mdd } = maxDrawdown(curve);
    const t = trendLabel(cs);
    return { vol, ret60, mdd: mdd * 100, trend: t };
  }, [cs]);

  const handleSaveSnapshot = async () => {
    if (!sym || !q || !analytics || !currentWorkspace?.id || !currentProject?.id || !user) return;
    setSavingSnap(true);
    try {
      await createInstrumentSnapshot(
        currentWorkspace.id, currentProject.id,
        sym, q, analytics, intel.data?.narrative ?? '', user.uid,
      );
      toast.success('Snapshot saved to Research Timeline');
    } catch {
      toast.error('Failed to save snapshot');
    } finally {
      setSavingSnap(false);
    }
  };

  const handleOpenArtifact = useCallback((artifactId: string) => {
    const artifact = artifacts.items.find(a => a.id === artifactId);
    if (!artifact) return;
    drawer.open({
      title: artifact.title,
      subtitle: artifact.category,
      width: 560,
      body: <ArtifactDetailDrawerBody artifact={artifact} relatedArtifacts={artifacts.items} onOpenArtifact={handleOpenArtifact} />,
    });
  }, [artifacts.items, drawer]);

  if (!sym) return null;

  const q = quote.data;
  const dp = q?.changePercent;
  const deltaColor = dp == null ? 'var(--muted-foreground)' : dp > 0 ? '#4E6040' : dp < 0 ? 'var(--primary)' : 'var(--muted-foreground)';
  const profileName = intel.data?.profile?.name;

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <AssetIcon symbol={sym} size={28} />
            <span>{profileName ?? sym}</span>
          </span>
        }
        subtitle={
          intel.data?.profile?.finnhubIndustry
            ? `${sym} · ${intel.data.profile.finnhubIndustry}${intel.data.profile.exchange ? ` · ${intel.data.profile.exchange}` : ''}`
            : sym
        }
        actions={
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {q?.source && <SourceBadge source={q.source} />}
            <FreshnessBadge status={quote.status} fetchedAt={quote.fetchedAt} compact />
            <button
              disabled={savingSnap || !q}
              onClick={handleSaveSnapshot}
              className="ds-btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              {savingSnap ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
              Save Snapshot
            </button>
            <Link to="/instruments" className="ds-caption" style={{
              padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
              textDecoration: 'none', color: 'var(--muted-foreground)',
            }}>
              ← All instruments
            </Link>
          </div>
        }
      />

      {/* Quote bar — renders as soon as quote resolves */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatTile
          label="Price"
          value={q?.price != null ? q.price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : (quote.loading ? '…' : '—')}
          delta={dp ?? undefined}
        />
        <StatTile label="Open"  value={q?.open  != null ? q.open.toFixed(2)  : '—'} />
        <StatTile label="High"  value={q?.high  != null ? q.high.toFixed(2)  : '—'} />
        <StatTile label="Low"   value={q?.low   != null ? q.low.toFixed(2)   : '—'} />
        <StatTile label="Prev"  value={q?.previousClose != null ? q.previousClose.toFixed(2) : '—'} />
      </section>

      {/* Derived analytics — appear when OHLCV resolves */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatTile
          label="20d ann. vol"
          value={analytics ? `${analytics.vol.toFixed(1)}%` : ohlcv.loading ? '…' : '—'}
          hint="annualised σ"
        />
        <StatTile
          label="60d return"
          value={analytics ? `${analytics.ret60 >= 0 ? '+' : ''}${analytics.ret60.toFixed(2)}%` : ohlcv.loading ? '…' : '—'}
          delta={analytics?.ret60}
        />
        <StatTile
          label="Max drawdown (90d)"
          value={analytics ? `${analytics.mdd.toFixed(1)}%` : ohlcv.loading ? '…' : '—'}
          hint="peak→trough"
        />
        <StatTile
          label="Trend"
          value={analytics ? TREND_COPY[analytics.trend.label] : ohlcv.loading ? '…' : '—'}
          hint={analytics && analytics.trend.label !== 'insufficient'
            ? `${analytics.trend.pctPerDay >= 0 ? '+' : ''}${analytics.trend.pctPerDay.toFixed(2)}%/day`
            : undefined}
        />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        <div>
          {/* Chart renders as soon as OHLCV resolves */}
          <section className="ds-surface" style={{ padding: 16, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className="ds-heading" style={{ margin: 0 }}>Price history (90d daily)</h2>
              <FreshnessBadge status={ohlcv.status} fetchedAt={ohlcv.fetchedAt} compact />
            </div>
            {ohlcv.loading && !bars.length ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
                Loading bars…
              </div>
            ) : bars.length > 1 ? (
              <OHLCVChart bars={bars} height={240} />
            ) : (
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                {ohlcv.error ? `Failed: ${ohlcv.error.message}` : 'No bars available.'}
                {' '}
                <button onClick={() => ohlcv.refresh()} style={{
                  background: 'transparent', border: 'none', color: 'var(--primary)',
                  textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
                }}>Retry</button>
              </p>
            )}
          </section>

          {/* AI narrative loads separately (slow) */}
          <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className="ds-heading" style={{ margin: 0 }}>AI Narrative</h2>
              <FreshnessBadge status={intel.status} fetchedAt={intel.fetchedAt} compact />
            </div>
            {intel.loading ? (
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                Synthesising — pulling fundamentals, news, and generating intelligence…
              </p>
            ) : intel.error ? (
              <p className="ds-caption" style={{ color: 'var(--primary)' }}>
                {intel.error.message}{' '}
                <button onClick={() => intel.refresh()} style={{
                  background: 'transparent', border: 'none', color: 'var(--primary)',
                  textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
                }}>Retry</button>
              </p>
            ) : intel.data?.narrative ? (
              <p className="ds-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{intel.data.narrative}</p>
            ) : (
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No narrative available.</p>
            )}
          </section>
        </div>

        <aside>
          <section style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className="ds-heading" style={{ margin: 0 }}>Recent Headlines</h2>
              <FreshnessBadge status={news.status} fetchedAt={news.fetchedAt} compact />
            </div>
            {news.loading && !news.data ? (
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading…</p>
            ) : news.data && news.data.length ? (
              <NewsList items={news.data.map((n) => ({
                id: n.id, headline: n.headline, summary: n.summary, url: n.url,
                source: n.source, publishedAt: n.publishedAt,
              }))} max={8} />
            ) : (
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No recent headlines.</p>
            )}
          </section>

          {intel.data?.basicFinancials?.metric && (
            <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
              <h2 className="ds-heading" style={{ marginBottom: 8 }}>Fundamentals</h2>
              <div style={{ display: 'grid', gap: 6 }}>
                {(['peBasicExclExtraTTM', 'revenueGrowthTTMYoy', 'epsGrowthTTMYoy', '52WeekHigh', '52WeekLow'] as const).map((k) => {
                  const v = intel.data?.basicFinancials?.metric?.[k];
                  if (v == null) return null;
                  return (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{k}</span>
                      <span className="ds-body" style={{ fontVariantNumeric: 'tabular-nums' }}>{String(v)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>

      <section style={{ marginTop: 24 }}>
        <BenchmarkIntelligencePanel symbol={sym} />
      </section>

      <RelatedIntelligencePanel
        symbols={sym ? [sym] : []}
        artifacts={artifacts.items}
        briefings={briefings.items}
        onOpenArtifact={handleOpenArtifact}
        maxItems={3}
      />

      <Disclaimer />
    </div>
  );
};
