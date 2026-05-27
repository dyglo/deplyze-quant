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
import { InstrumentProfileCard } from '../components/quant/InstrumentProfileCard';
import { InstrumentKeyMetrics } from '../components/quant/InstrumentKeyMetrics';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { useDrawer } from '../components/quant/DataDrawer';
import { closes, logReturns, annualisedVol, maxDrawdown, trendLabel } from '../lib/quant';
import { createInstrumentSnapshot } from '../services/artifactService';
import type { FreshnessStatus } from '../services/gatewayClient';
import { useWorkspace } from '../components/WorkspaceContext';
import { useAuth } from '../components/AuthProvider';

const TREND_COPY: Record<string, string> = {
  'strong-up':    'Strong uptrend',
  'up':           'Mild uptrend',
  'flat':         'Range-bound',
  'down':         'Mild downtrend',
  'strong-down':  'Strong downtrend',
  'insufficient': 'Insufficient data',
};

// ─── Section divider ──────────────────────────────────────────────────────────

const SectionDivider: React.FC<{ title: string }> = ({ title }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '18px 0 10px',
  }}>
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: 'var(--muted-foreground)',
      whiteSpace: 'nowrap',
    }}>{title}</span>
    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
  </div>
);

// ─── Narrative section ────────────────────────────────────────────────────────

const AIAnalysisSection: React.FC<{
  loading: boolean;
  error: Error | null;
  narrative: string | null | undefined;
  status: FreshnessStatus;
  fetchedAt: number | null;
  onRetry: () => void;
}> = ({ loading, error, narrative, status, fetchedAt, onRetry }) => (
  <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="ds-heading" style={{ margin: 0 }}>AI Analysis</h2>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.6,
          textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
          background: 'rgba(193, 95, 60, 0.08)', color: 'var(--primary)',
        }}>Gemini</span>
      </div>
      <FreshnessBadge status={status} fetchedAt={fetchedAt} compact />
    </div>
    {loading ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)' }}>
        <Loader2 size={13} className="animate-spin" />
        <span className="ds-caption">Synthesising intelligence — pulling fundamentals, news, and generating analysis…</span>
      </div>
    ) : error ? (
      <p className="ds-caption" style={{ color: 'var(--primary)', margin: 0 }}>
        {error.message}{' '}
        <button onClick={onRetry} style={{
          background: 'transparent', border: 'none', color: 'var(--primary)',
          textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
        }}>Retry</button>
      </p>
    ) : narrative ? (
      <p className="ds-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, margin: 0, fontSize: 13 }}>{narrative}</p>
    ) : (
      <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>No analysis available.</p>
    )}
  </section>
);

// ─── Main page ─────────────────────────────────────────────────────────────────

export const InstrumentDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const sym = symbol ? decodeURIComponent(symbol) : null;

  const quote = useQuote(sym);
  const ohlcv = useOHLCV(sym, '1day', 90);
  const news = useNews(sym ? { symbol: sym, limit: 8 } : {});
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
  const profile = intel.data?.profile ?? null;
  const fundamentals = intel.data?.fundamentals ?? null;
  const earnings = intel.data?.earnings ?? [];

  const profileName = profile?.name;
  const effectiveIndustry = profile?.industry ?? profile?.finnhubIndustry;

  return (
    <div style={{ padding: '0 24px 48px', maxWidth: 1380, margin: '0 auto' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <AssetIcon symbol={sym} size={28} />
            <span>{profileName ?? sym}</span>
          </span>
        }
        subtitle={
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{sym}</span>
            {profile?.exchange && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                background: 'var(--muted)', color: 'var(--muted-foreground)',
                letterSpacing: 0.3, textTransform: 'uppercase',
              }}>{profile.exchange}</span>
            )}
            {profile?.sector && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                background: 'rgba(193,95,60,0.07)', color: 'var(--primary)',
                letterSpacing: 0.3,
              }}>{profile.sector}</span>
            )}
            {effectiveIndustry && profile?.sector !== effectiveIndustry && (
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 3,
                background: 'var(--muted)', color: 'var(--muted-foreground)',
              }}>{effectiveIndustry}</span>
            )}
          </span>
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
            <Link to="/" className="ds-caption" style={{
              padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
              textDecoration: 'none', color: 'var(--muted-foreground)',
            }}>
              ← Market Home
            </Link>
          </div>
        }
      />

      {/* ── Quote bar ────────────────────────────────────────────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
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

      {/* ── Derived analytics bar ──────────────────────────────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        <StatTile
          label="20d Ann. Vol"
          value={analytics ? `${analytics.vol.toFixed(1)}%` : ohlcv.loading ? '…' : '—'}
          hint="annualised σ"
        />
        <StatTile
          label="60d Return"
          value={analytics ? `${analytics.ret60 >= 0 ? '+' : ''}${analytics.ret60.toFixed(2)}%` : ohlcv.loading ? '…' : '—'}
          delta={analytics?.ret60}
        />
        <StatTile
          label="Max Drawdown (90d)"
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
        {fundamentals?.beta != null && (
          <StatTile label="Beta" value={fundamentals.beta.toFixed(2)} hint="vs market" />
        )}
        {fundamentals?.peRatio != null && (
          <StatTile label="P/E Ratio" value={fundamentals.peRatio.toFixed(1)} />
        )}
      </section>

      {/* ── Body: 2-column layout ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>

        {/* LEFT COLUMN — primary research workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Chart */}
          <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 className="ds-heading" style={{ margin: 0 }}>Price History (90d Daily)</h2>
              <FreshnessBadge status={ohlcv.status} fetchedAt={ohlcv.fetchedAt} compact />
            </div>
            {ohlcv.loading && !bars.length ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
                Loading bars…
              </div>
            ) : bars.length > 1 ? (
              <OHLCVChart bars={bars} height={240} symbol={sym} />
            ) : (
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
                {ohlcv.error ? `Failed: ${ohlcv.error.message}` : 'No bars available.'}
                {' '}
                <button onClick={() => ohlcv.refresh()} style={{
                  background: 'transparent', border: 'none', color: 'var(--primary)',
                  textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
                }}>Retry</button>
              </p>
            )}
          </section>

          {/* AI Analysis */}
          <AIAnalysisSection
            loading={intel.loading}
            error={intel.error}
            narrative={intel.data?.narrative}
            status={intel.status}
            fetchedAt={intel.fetchedAt}
            onRetry={() => intel.refresh()}
          />

          {/* Earnings history inline (if available) */}
          {earnings.length > 0 && (
            <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
              <h2 className="ds-heading" style={{ margin: '0 0 12px' }}>Earnings History</h2>
              <div style={{ display: 'grid', gap: 6 }}>
                {earnings.slice(0, 6).map((e, i) => {
                  const beat = e.surprisePct != null && e.surprisePct > 0;
                  const miss = e.surprisePct != null && e.surprisePct < 0;
                  return (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 1fr 1fr 80px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'var(--muted)',
                      fontSize: 12,
                    }}>
                      <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>{e.date}</span>
                      <div>
                        <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>Actual EPS</div>
                        <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {e.epsActual != null ? `$${e.epsActual.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>Est. EPS</div>
                        <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      {e.surprisePct != null ? (
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: beat ? 'var(--ds-gain-muted)' : miss ? 'var(--ds-loss-muted)' : 'var(--muted)',
                          color: beat ? 'var(--ds-gain)' : miss ? 'var(--ds-loss)' : 'var(--muted-foreground)',
                          textAlign: 'center',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {beat ? '+' : ''}{e.surprisePct.toFixed(1)}%
                        </span>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, margin: '8px 0 0' }}>
                EPS surprise = (actual − estimate) / |estimate|. Beat shown in green, miss in red.
              </p>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN — context panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Company profile */}
          {profile && (profile.description || profile.sector || profile.marketCap || profile.marketCapitalization) && (
            <InstrumentProfileCard profile={profile} symbol={sym} />
          )}

          {/* Key metrics */}
          {fundamentals && Object.values(fundamentals).some(v => v != null) && (
            <InstrumentKeyMetrics fundamentals={fundamentals} currentPrice={q?.price} />
          )}

          {/* News */}
          <section>
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
        </div>
      </div>

      {/* ── Full-width intelligence sections ─────────────────────────── */}
      <SectionDivider title="Benchmark Intelligence" />
      <BenchmarkIntelligencePanel symbol={sym} />

      {/* Related intelligence from workspace */}
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
